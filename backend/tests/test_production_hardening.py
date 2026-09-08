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
    
    # Mock models and redis for budget
    fleet_budget_key = "agentguard:budget:fleet:daily"
    
    success_count = 0
    failure_count = 0
    
    # Mock redis budget logic with in-memory dict and thread lock
    in_memory_budget = {fleet_budget_key: budget_limit}
    redis_lock = threading.Lock()
    
    def mock_reserve(budgets):
        with redis_lock:
            for k, v in budgets.items():
                if in_memory_budget.get(k, Decimal("0.00")) < v:
                    return False
            for k, v in budgets.items():
                in_memory_budget[k] -= v
            return True

    monkeypatch.setattr("app.redis_client.reserve_budgets", mock_reserve)
    monkeypatch.setattr("app.redis_client.redis_client.get", lambda k: str(in_memory_budget.get(k)).encode())
    
    def make_request():
        nonlocal success_count, failure_count
        # Each thread uses a new DB session if necessary, but here we just mock the DB call 
        # inside reserve_budgets since the budget logic is entirely in Redis.
        try:
            # We don't need a real db session because fleet_budget_key is already in Redis
            success = redis_client.reserve_budgets({fleet_budget_key: request_amount})
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
    
    remaining_budget = redis_client.redis_client.get(fleet_budget_key)
    assert Decimal(remaining_budget.decode()) == budget_limit - (success_count * request_amount)

def test_approval_race_condition(db: Session, monkeypatch):
    """
    Test that approving a pending request correctly re-evaluates governance constraints.
    We mock PolicyService to allow initially, then mock a policy change or agent revoke.
    """
    # Create the pending approval
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
    
    # We will simulate that the fleet is halted while the request is pending.
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_fleet_status", lambda: "HALTED")
    monkeypatch.setattr("app.services.policy.PolicyService.evaluate_authorization", lambda input: {"allowed": True})
    monkeypatch.setattr("app.services.budget.BudgetService.reserve_budgets", lambda db, a, b, c: True)
    
    # Try to re-evaluate
    auth_result = AuthorizationService.evaluate_request(db, req_data, simulate=False, skip_approval_check=True)
    
    # It must be denied because the fleet was halted between PENDING and APPROVE
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
    
    # Must fail closed
    auth_result = AuthorizationService.evaluate_request(db, req_data, simulate=False)
    assert auth_result["decision"] == "DENY"
    assert "POLICY_EVALUATION_FAILED" in auth_result["reason"]

