import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine, SessionLocal
from app import models, redis_client
import threading
from app.auth import create_access_token

client = TestClient(app)

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=engine)
    yield
    # Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def admin_token():
    return create_access_token({"sub": "admin", "role": "ADMIN"})

@pytest.fixture
def agent_token():
    return create_access_token({"sub": "agent-123", "role": "AGENT"})

def test_execution_bypass_rejected(admin_token):
    # Attempting to call the Execution Gateway with a fabricated authorization ID must be rejected
    resp = client.post("/api/execution/verify", json={
        "authorization_id": "auth_fabricated_bypass_999",
        "agent_id": "agent-123",
        "action": "CREATE_PAYMENT",
        "resource_type": "corporate_account",
        "resource_id": "ACC-001",
        "amount": 100.0,
        "currency": "INR"
    })
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Authorization not found"


def test_budget_concurrency(db_session):
    # Fleet budget is 10000. 20 concurrent requests for 1000.
    from decimal import Decimal
    redis_client.initialize_budget("agentguard:budget:test_fleet", Decimal("10000.00"))
    
    success_count = 0
    fail_count = 0
    lock = threading.Lock()
    
    def worker():
        nonlocal success_count, fail_count
        res = redis_client.reserve_budgets({"agentguard:budget:test_fleet": 1000})
        with lock:
            if res:
                success_count += 1
            else:
                fail_count += 1
                
    threads = [threading.Thread(target=worker) for _ in range(20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
        
    assert success_count == 10
    assert fail_count == 10
    
    # Verify remaining budget is 0
    remaining = int(redis_client.redis_client.get("agentguard:budget:test_fleet"))
    assert remaining == 0
