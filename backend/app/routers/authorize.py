from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx
from datetime import datetime, timezone, timedelta
from app.database import get_db
from app import models, redis_client
from app.config import settings
import time

router = APIRouter(
    prefix="/authorize",
    tags=["Authorization"]
)

class AuthorizeRequest(BaseModel):
    agent_id: str
    action: str
    resource_type: str
    resource_id: str
    amount: float
    currency: str
    request_id: str

class AuthorizeResponse(BaseModel):
    decision: str
    authorization_id: str = None
    policy_id: str = None
    remaining_budget: float = None
    expires_at: str = None
    reason: str = None

def get_agent_permissions(agent_id: str, db: Session):
    permissions = db.query(models.Permission).filter(
        models.Permission.agent_id == agent_id,
        models.Permission.enabled == True
    ).all()
    return [{"action": p.action, "resource_type": p.resource_type, "allowed_accounts": p.allowed_accounts, "allowed_currencies": p.allowed_currencies, "max_amount": p.max_amount} for p in permissions]

@router.post("/", response_model=AuthorizeResponse)
def authorize_action(request: AuthorizeRequest, db: Session = Depends(get_db)):
    start_time = time.time()
    
    # 1. Fetch Fleet Status
    fleet_status = redis_client.get_fleet_status()
    
    # 2. Fetch Agent Status
    agent_status = redis_client.get_agent_status(request.agent_id)
    if not agent_status:
        agent = db.query(models.Agent).filter(models.Agent.id == request.agent_id).first()
        if not agent:
            return create_audit_and_deny(db, request, "AGENT_NOT_FOUND", "No such agent", start_time)
        agent_status = agent.status
        redis_client.set_agent_status(request.agent_id, agent_status)

    # 3. Evaluate OPA policy
    permissions = get_agent_permissions(request.agent_id, db)
    
    opa_input = {
        "input": {
            "fleet_state": fleet_status,
            "agent_status": agent_status,
            "request": request.model_dump(),
            "permissions": permissions
        }
    }
    
    try:
        opa_resp = httpx.post(f"{settings.opa_url}/v1/data/agentguard/authz/decision", json=opa_input)
        opa_resp.raise_for_status()
        opa_decision = opa_resp.json().get("result", {})
    except Exception as e:
        # Fail closed on OPA error
        return create_audit_and_deny(db, request, "POLICY_EVALUATION_FAILED", str(e), start_time)
    
    if not opa_decision.get("allowed", False):
        reason = opa_decision.get("reason", "POLICY_DENY")
        return create_audit_and_deny(db, request, reason, "OPA policy denied request", start_time)
        
    # 4. Atomic Budget Check (simplified logic to just use a daily fleet budget for now)
    budget_key = f"agentguard:budget:fleet:daily"
    # if budget is not set in redis, initialize it from DB (simplified)
    if redis_client.redis_client.get(budget_key) is None:
        fleet_budget = db.query(models.Budget).filter(models.Budget.scope == "FLEET_DAILY").first()
        if fleet_budget:
            redis_client.initialize_budget(budget_key, fleet_budget.limit_amount)
    
    if not redis_client.reserve_budget(budget_key, request.amount):
        return create_audit_and_deny(db, request, "BUDGET_EXCEEDED", "Fleet daily budget exceeded", start_time)

    # 5. Allow
    auth_id = f"auth_{int(time.time()*1000)}"
    audit = models.AuditEvent(
        event_type="AUTHORIZATION_DECISION",
        agent_id=request.agent_id,
        action=request.action,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        amount=request.amount,
        currency=request.currency,
        decision="ALLOW",
        reason="POLICY_MATCH",
        request_id=request.request_id,
        latency_ms=(time.time() - start_time) * 1000
    )
    db.add(audit)
    db.commit()

    return AuthorizeResponse(
        decision="ALLOW",
        authorization_id=auth_id,
        expires_at=(datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat()
    )


def create_audit_and_deny(db, request, reason, details, start_time):
    audit = models.AuditEvent(
        event_type="AUTHORIZATION_DECISION",
        agent_id=request.agent_id,
        action=request.action,
        resource_type=request.resource_type,
        resource_id=request.resource_id,
        amount=request.amount,
        currency=request.currency,
        decision="DENY",
        reason=reason,
        request_id=request.request_id,
        latency_ms=(time.time() - start_time) * 1000
    )
    db.add(audit)
    db.commit()
    return AuthorizeResponse(decision="DENY", reason=reason)
