import pytest
import threading
from decimal import Decimal
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.database import SessionLocal, engine, Base
from app import models, redis_client
from app.auth import create_access_token
from app.services.audit import AuditService
from app.services.approval import ApprovalService
from app.services.authorization import AuthorizationService
from app.services.quarantine import QuarantineService
from app.config import settings, Settings
from app.agent.runtime import validate_transfer_args

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def admin_token():
    return create_access_token({"sub": "admin-1", "role": "ADMIN"})

@pytest.fixture
def operator_token():
    return create_access_token({"sub": "operator-1", "role": "OPERATOR"})

@pytest.fixture
def auditor_token():
    return create_access_token({"sub": "auditor-1", "role": "AUDITOR"})

@pytest.fixture
def agent_a_token():
    return create_access_token({"sub": "agent-a", "role": "AGENT"})

@pytest.fixture
def agent_b_token():
    return create_access_token({"sub": "agent-b", "role": "AGENT"})

# -----------------------------------------------------------------------------
# 1. Authentication & Development Endpoint Gating Tests
# -----------------------------------------------------------------------------

def test_dev_token_disabled_in_production(monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "production")
    resp = client.get("/api/dev/token")
    assert resp.status_code == 404

def test_dev_token_enabled_in_development(monkeypatch):
    monkeypatch.setattr("app.config.settings.environment", "development")
    resp = client.get("/api/dev/token")
    assert resp.status_code == 200
    assert "token" in resp.json()

def test_production_jwt_secret_validation():
    # Insecure / short secrets must fail startup in production
    with pytest.raises(ValueError, match="JWT secret is insecure or too short"):
        Settings(
            database_url="postgresql://user:pass@localhost:5432/db",
            redis_url="redis://localhost:6379/0",
            opa_url="http://localhost:8181",
            jwt_secret="short",
            environment="production"
        )

    with pytest.raises(ValueError, match="JWT secret is insecure or too short"):
        Settings(
            database_url="postgresql://user:pass@localhost:5432/db",
            redis_url="redis://localhost:6379/0",
            opa_url="http://localhost:8181",
            jwt_secret="super-secret-governance-key",
            environment="production"
        )

# -----------------------------------------------------------------------------
# 2. Agent Impersonation & Invocation Security Tests
# -----------------------------------------------------------------------------

def test_agent_impersonation_prevented(agent_a_token):
    # Agent A attempts to authorize a transaction using Agent B's ID
    headers = {"Authorization": f"Bearer {agent_a_token}"}
    payload = {
        "agent_id": "agent-b",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-001",
        "amount": 100.0,
        "currency": "INR",
        "request_id": "req_impersonate_test"
    }
    resp = client.post("/api/authorize", json=payload, headers=headers)
    assert resp.status_code == 403
    assert "Agent impersonation is not allowed" in resp.json()["detail"]

def test_revoked_agent_cannot_be_invoked(db: Session, admin_token):
    # Create an agent and revoke it
    agent = models.Agent(id="agent-revoked-test", name="Revoked Agent", owner="Finance", risk_tier="HIGH", status="REVOKED")
    db.merge(agent)
    db.commit()

    headers = {"Authorization": f"Bearer {admin_token}"}
    resp = client.post("/api/agents/agent-revoked-test/invoke", json={"objective": "Transfer funds"}, headers=headers)
    assert resp.status_code == 403
    assert "Agent is not active" in resp.json()["detail"]

# -----------------------------------------------------------------------------
# 3. Execution Authorization Security & Expiry Tests
# -----------------------------------------------------------------------------

def test_execution_authorization_lifecycle(db: Session):
    auth_id = "auth_lifecycle_test_01"
    now = datetime.now(timezone.utc)
    
    # 1. Create active execution authorization
    exec_auth = models.ExecutionAuthorization(
        id=auth_id,
        agent_id="agent-exec-01",
        action="CREATE_PAYMENT",
        resource_type="corporate_account",
        resource_id="ACC-CORP-1",
        amount=Decimal("5000.00"),
        currency="INR",
        status="ISSUED",
        expires_at=now + timedelta(minutes=15)
    )
    db.merge(exec_auth)
    db.commit()

    verify_payload = {
        "authorization_id": auth_id,
        "agent_id": "agent-exec-01",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-CORP-1",
        "amount": 5000.00,
        "currency": "INR",
        "consume": True
    }

    # First verification succeeds and consumes authorization
    resp1 = client.post("/api/execution/verify", json=verify_payload)
    assert resp1.status_code == 200
    assert resp1.json()["status"] == "VERIFIED"

    # Second verification with same authorization ID fails (Replay Protection)
    resp2 = client.post("/api/execution/verify", json=verify_payload)
    assert resp2.status_code == 409
    assert "already been consumed" in resp2.json()["detail"]

def test_execution_authorization_payload_mismatch(db: Session):
    auth_id = "auth_mismatch_test_01"
    now = datetime.now(timezone.utc)
    
    exec_auth = models.ExecutionAuthorization(
        id=auth_id,
        agent_id="agent-exec-02",
        action="CREATE_PAYMENT",
        resource_type="corporate_account",
        resource_id="ACC-CORP-1",
        amount=Decimal("1000.00"),
        currency="INR",
        status="ISSUED",
        expires_at=now + timedelta(minutes=15)
    )
    db.merge(exec_auth)
    db.commit()

    # Wrong amount
    resp = client.post("/api/execution/verify", json={
        "authorization_id": auth_id,
        "agent_id": "agent-exec-02",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-CORP-1",
        "amount": 9999.00,
        "currency": "INR"
    })
    assert resp.status_code == 403
    assert "Amount mismatch" in resp.json()["detail"]

    # Wrong agent
    resp = client.post("/api/execution/verify", json={
        "authorization_id": auth_id,
        "agent_id": "agent-fraud",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-CORP-1",
        "amount": 1000.00,
        "currency": "INR"
    })
    assert resp.status_code == 403
    assert "Agent mismatch" in resp.json()["detail"]

def test_execution_authorization_expired(db: Session):
    auth_id = "auth_expired_test_01"
    # Authorization expired 5 minutes ago
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    
    exec_auth = models.ExecutionAuthorization(
        id=auth_id,
        agent_id="agent-exec-03",
        action="CREATE_PAYMENT",
        resource_type="corporate_account",
        resource_id="ACC-CORP-1",
        amount=Decimal("1000.00"),
        currency="INR",
        status="ISSUED",
        expires_at=past
    )
    db.merge(exec_auth)
    db.commit()

    resp = client.post("/api/execution/verify", json={
        "authorization_id": auth_id,
        "agent_id": "agent-exec-03",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-CORP-1",
        "amount": 1000.00,
        "currency": "INR"
    })
    assert resp.status_code == 403
    assert "Authorization has expired" in resp.json()["detail"]

# -----------------------------------------------------------------------------
# 4. Concurrency Safety Tests (Approvals & Hash Chain)
# -----------------------------------------------------------------------------

def test_concurrent_approvals_race(db: Session, operator_token, monkeypatch):
    # Seed active agent
    agent = models.Agent(
        id="agent-approval-race",
        name="Approval Race Agent",
        owner="Risk",
        risk_tier="LOW",
        status="ACTIVE"
    )
    db.merge(agent)
    db.commit()

    # Mock OPA and budget services so re-evaluation succeeds
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_fleet_status", lambda: "ACTIVE")
    monkeypatch.setattr("app.services.agent_state.AgentStateService.get_agent_status", lambda db, a: "ACTIVE")
    monkeypatch.setattr("app.services.policy.PolicyService.evaluate_authorization", lambda input: {"allowed": True})
    monkeypatch.setattr("app.services.budget.BudgetService.reserve_budgets", lambda db, a, b, c: True)

    # Create a pending approval request
    req_data = {
        "agent_id": "agent-approval-race",
        "action": "TRANSFER",
        "resource_type": "corporate_account",
        "resource_id": "acc-999",
        "amount": Decimal("25000.00"),
        "currency": "INR",
        "request_id": "req-approval-race-01"
    }
    approval_req = ApprovalService.create_pending_approval(db, req_data)
    db.commit()
    approval_id = approval_req.id

    success_count = 0
    fail_count = 0
    lock = threading.Lock()

    def attempt_approve():
        nonlocal success_count, fail_count
        resp = client.post(
            f"/api/approvals/{approval_id}/approve",
            headers={"Authorization": f"Bearer {operator_token}"}
        )
        with lock:
            if resp.status_code == 200:
                success_count += 1
            else:
                fail_count += 1

    threads = [threading.Thread(target=attempt_approve) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    # Exactly one approval must succeed; 9 must fail
    assert success_count == 1
    assert fail_count == 9

# -----------------------------------------------------------------------------
# 5. Audit Chain Integrity & Tamper Detection Tests
# -----------------------------------------------------------------------------

def test_audit_tamper_detection(db: Session):
    # Ensure an audit event exists
    AuditService.create_audit_event(
        db=db,
        event_type="TEST_TAMPER_EVENT",
        agent_id="agent_tamper",
        amount=Decimal("123.45")
    )
    db.commit()

    # Verify clean chain first
    status = AuditService.verify_chain(db)
    assert status["valid"] is True

    # Tamper with an event
    latest_event = db.query(models.AuditEvent).filter(models.AuditEvent.agent_id == "agent_tamper").first()
    assert latest_event is not None
    original_amount = latest_event.amount
    latest_event.amount = Decimal("99999999.00")
    db.commit()

    # Chain verification must detect the tampering
    tamper_status = AuditService.verify_chain(db)
    assert tamper_status["valid"] is False
    assert tamper_status["error"] == "EVENT_HASH_TAMPERED"

    # Restore original
    latest_event.amount = original_amount
    db.commit()

    restore_status = AuditService.verify_chain(db)
    assert restore_status["valid"] is True


# -----------------------------------------------------------------------------
# 6. Failure Injection & Containment Tests
# -----------------------------------------------------------------------------

def test_kubernetes_containment_failure_preserves_revocation(db: Session, monkeypatch):
    agent_id = "agent_k8s_fail_preservation"
    
    # Create active agent
    agent = models.Agent(id=agent_id, name="K8s Fail Test", owner="Risk", risk_tier="HIGH", status="ACTIVE")
    db.merge(agent)
    db.commit()

    # Simulate K8s cluster failure
    def mock_k8s_error(*args, **kwargs):
        raise RuntimeError("Kubernetes API connection refused")
        
    monkeypatch.setattr("kubernetes.config.load_incluster_config", mock_k8s_error)
    monkeypatch.setattr("kubernetes.config.load_kube_config", mock_k8s_error)

    # Quarantine should return True (local revocation success)
    res = QuarantineService.quarantine_agent(db, agent_id, operator_id="admin-sec")
    assert res is True

    # Local state MUST remain REVOKED
    updated_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    assert updated_agent.status == "REVOKED"

    # Future financial requests must be DENIED immediately
    auth_res = AuthorizationService.evaluate_request(db, {
        "agent_id": agent_id,
        "action": "CREATE_PAYMENT",
        "resource_type": "account",
        "resource_id": "ACC-1",
        "amount": Decimal("100.00"),
        "currency": "INR",
        "request_id": "req-fail-preservation"
    })
    assert auth_res["decision"] == "DENY"
    assert auth_res["reason"] == "AGENT_REVOKED"

# -----------------------------------------------------------------------------
# 7. LLM Tool Argument Validation Tests
# -----------------------------------------------------------------------------

def test_llm_tool_argument_validation():
    # Negative amount
    valid, err = validate_transfer_args({
        "source_account": "ACC-1",
        "target_account": "ACC-2",
        "amount": -50.0,
        "currency": "INR",
        "reason": "Test"
    })
    assert not valid
    assert "positive and non-zero" in err

    # Identical accounts
    valid, err = validate_transfer_args({
        "source_account": "ACC-1",
        "target_account": "ACC-1",
        "amount": 100.0,
        "currency": "INR",
        "reason": "Test"
    })
    assert not valid
    assert "cannot be identical" in err

    # Unsupported currency
    valid, err = validate_transfer_args({
        "source_account": "ACC-1",
        "target_account": "ACC-2",
        "amount": 100.0,
        "currency": "BITCOIN",
        "reason": "Test"
    })
    assert not valid
    assert "Unsupported currency" in err

    # Valid arguments
    valid, err = validate_transfer_args({
        "source_account": "ACC-1",
        "target_account": "ACC-2",
        "amount": 100.0,
        "currency": "INR",
        "reason": "Valid operational transfer"
    })
    assert valid
    assert err == ""
