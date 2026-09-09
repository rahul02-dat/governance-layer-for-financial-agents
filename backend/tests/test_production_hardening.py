import pytest
import threading
from decimal import Decimal
from sqlalchemy.orm import Session
from app.services.audit import AuditService
from app.services.budget import BudgetService
from app.services.approval import ApprovalService
from app.services.authorization import AuthorizationService
from app import models, redis_client
from app.database import SessionLocal




def test_audit_hash_chaining(db: Session):
    # Create first event
    e1 = AuditService.create_audit_event(
        db, event_type="TEST_EVENT_1", agent_id="agent_1", amount=Decimal("100.00")
    )
    db.commit()
    
    # Create second event
    e2 = AuditService.create_audit_event(
        db, event_type="TEST_EVENT_2", agent_id="agent_1", amount=Decimal("200.00")
    )
    db.commit()
    
    # Verify chaining
    assert e1.event_hash is not None
    assert e2.previous_hash == e1.event_hash
    assert e2.event_hash is not None
    
    # Verify canonical deterministic hash
    canonical_bytes = AuditService._canonical_serialize({
        "event_type": "TEST_EVENT_2",
        "agent_id": "agent_1",
        "amount": Decimal("200.00"),
        "previous_hash": e1.event_hash
    })
    expected_hash = AuditService._calculate_hash(canonical_bytes)
    assert e2.event_hash == expected_hash

def test_concurrent_budget_reservations(db: Session, monkeypatch):
    agent_id = "agent_budget_test"
    budget_limit = Decimal("1000.00")
    request_amount = Decimal("15.00")
    num_requests = 100
    
    fleet_budget_key = "agentguard:budget:fleet:daily"
    
    success_count = 0
    failure_count = 0
    
    in_memory_budget = {fleet_budget_key: budget_limit}
    redis_lock = threading.Lock()
    
    def mock_reserve(budgets):
        with redis_lock:
            # format is {key: {"request": req_amt, "limit": limit_amt}}
            for k, details in budgets.items():
                if in_memory_budget.get(k, details["limit"]) < details["request"]:
                    return False
            for k, details in budgets.items():
                if k not in in_memory_budget:
                    in_memory_budget[k] = details["limit"]
                in_memory_budget[k] -= details["request"]
            return True

    monkeypatch.setattr("app.redis_client.reserve_budgets", mock_reserve)
    monkeypatch.setattr("app.redis_client.redis_client.get", lambda k: str(in_memory_budget.get(k)).encode())
    
    def make_request():
        nonlocal success_count, failure_count
        try:
            success = redis_client.reserve_budgets({
                fleet_budget_key: {"request": request_amount, "limit": budget_limit}
            })
            if success:
                success_count += 1
            else:
                failure_count += 1
        except Exception:
            failure_count += 1

    threads = []
    for _ in range(num_requests):
        t = threading.Thread(target=make_request)
        threads.append(t)
        t.start()
        
    for t in threads:
        t.join()
        
    # 1000 / 15 = 66.66 -> exactly 66 requests should succeed, 34 should fail.
    assert success_count == 66
    assert failure_count == 34
    
    remaining_budget = Decimal(in_memory_budget[fleet_budget_key])
    assert remaining_budget == budget_limit - (success_count * request_amount)

def test_approval_race_condition(db: Session, monkeypatch):
    """
    Test that approving a pending request correctly re-evaluates governance constraints.
    """
    req_data = {
        "agent_id": "agent_race_test",
        "action": "TRANSFER",
        "resource_type": "ACCOUNT",
        "resource_id": "acc_123",
        "amount": Decimal("50000.00"),
        "currency": "INR",
        "request_id": "req_race_1"
    }
    
    req = ApprovalService.create_pending_approval(db, req_data)
    db.commit()
    
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_fleet_status", lambda: "HALTED")
    monkeypatch.setattr("app.services.policy.PolicyService.evaluate_authorization", lambda input: {"allowed": True})
    monkeypatch.setattr("app.services.budget.BudgetService.reserve_budgets", lambda db, a, b, c: True)
    
    auth_result = AuthorizationService.evaluate_request(db, req_data, simulate=False, skip_approval_check=True)
    
    assert auth_result["decision"] == "DENY"
    assert auth_result["reason"] == "FLEET_HALTED"

def test_failure_injection_opa_down(db: Session, monkeypatch):
    req_data = {
        "agent_id": "agent_fail_test",
        "action": "TRANSFER",
        "resource_type": "ACCOUNT",
        "resource_id": "acc_123",
        "amount": Decimal("100.00"),
        "currency": "INR",
        "request_id": "req_fail_1"
    }
    
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_fleet_status", lambda: "ACTIVE")
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_agent_status", lambda db, a: "ACTIVE")
    monkeypatch.setattr("app.services.permission.PermissionService.get_agent_permissions", lambda db, a: [])
    
    def mock_evaluate(*args, **kwargs):
        raise RuntimeError("OPA connection refused")
        
    monkeypatch.setattr("app.services.policy.PolicyService.evaluate_authorization", mock_evaluate)
    
    auth_result = AuthorizationService.evaluate_request(db, req_data, simulate=False)
    assert auth_result["decision"] == "DENY"
    assert "POLICY_EVALUATION_FAILED" in auth_result["reason"]

def test_kubernetes_containment(db: Session, monkeypatch):
    from app.services.quarantine import QuarantineService
    
    # Mock AgentStateService to return True
    monkeypatch.setattr("app.services.agent_state.AgentStateService.update_agent_status", lambda db, a, s: True)
    
    # Mock Kubernetes API
    class MockScale:
        class Spec:
            replicas = 1
        spec = Spec()
        
    mock_scale = MockScale()
    
    class MockV1Api:
        def read_namespaced_deployment_scale(self, name, namespace):
            return mock_scale
        def replace_namespaced_deployment_scale(self, name, namespace, body):
            mock_scale.spec.replicas = body.spec.replicas
            return mock_scale
            
    monkeypatch.setattr("kubernetes.client.AppsV1Api", MockV1Api)
    monkeypatch.setattr("kubernetes.config.load_incluster_config", lambda: None)
    
    result = QuarantineService.quarantine_agent(db, "agent_123", "SUSPICIOUS_ACTIVITY")
    
    assert result is True
    # The deployment should have been scaled to 0
    assert mock_scale.spec.replicas == 0

def test_kubernetes_containment_failure(db: Session, monkeypatch):
    from app.services.quarantine import QuarantineService
    
    # Mock AgentStateService to return True
    monkeypatch.setattr("app.services.agent_state.AgentStateService.update_agent_status", lambda db, a, s: True)
    
    def mock_init(*args, **kwargs):
        raise Exception("API Server Unreachable")
        
    monkeypatch.setattr("kubernetes.config.load_incluster_config", mock_init)
    
    # It should NOT raise the API error because AgentGuard catches it to persist the local REVOKED state
    result = QuarantineService.quarantine_agent(db, "agent_123", "SUSPICIOUS_ACTIVITY")
    
    assert result is True
    
    # Verify the audit event contains the failure reason
    from app.models import AuditEvent
    event = db.query(AuditEvent).filter(
        AuditEvent.event_type == "AGENT_QUARANTINED",
        AuditEvent.agent_id == "agent_123"
    ).order_by(AuditEvent.sequence_number.desc()).first()
    
    assert event is not None
    assert "Kubernetes containment failed" in event.reason

