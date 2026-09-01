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
    simulate: bool = False

class AuthorizeResponse(BaseModel):
    decision: str
    authorization_id: str = None
    policy_id: str = None
    remaining_budget: float = None
    expires_at: str = None
    reason: str = None
    trace: list[dict] = None

def get_agent_permissions(agent_id: str, db: Session):
    permissions = db.query(models.Permission).filter(
        models.Permission.agent_id == agent_id,
        models.Permission.enabled == True
    ).all()
    return [{"action": p.action, "resource_type": p.resource_type, "allowed_accounts": p.allowed_accounts, "allowed_currencies": p.allowed_currencies, "max_amount": p.max_amount} for p in permissions]

@router.post("/", response_model=AuthorizeResponse)
def authorize_action(request: AuthorizeRequest, db: Session = Depends(get_db)):
    start_time = time.time()
    trace = []
    
    def record_trace(step_name, status):
        trace.append({"step": step_name, "status": status})
        
    record_trace("1. Request Validation", "PASS")
    
    # 1. Fetch Fleet Status
    fleet_status = redis_client.get_fleet_status()
    record_trace("2. Fleet State", "PASS" if fleet_status == "ACTIVE" else "FAIL")
    
    # 2. Fetch Agent Status
    agent_status = redis_client.get_agent_status(request.agent_id)
    if not agent_status:
        agent = db.query(models.Agent).filter(models.Agent.id == request.agent_id).first()
        if not agent:
            record_trace("3. Agent State", "FAIL")
            return create_audit_and_deny(db, request, "AGENT_NOT_FOUND", "No such agent", start_time, trace)
        agent_status = agent.status
        redis_client.set_agent_status(request.agent_id, agent_status)
    record_trace("3. Agent State", "PASS" if agent_status == "ACTIVE" else "FAIL")

    record_trace("4. Permission", "PASS") # Implicitly evaluated by OPA

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
        record_trace("5. OPA Policy", "FAIL")
        return create_audit_and_deny(db, request, "POLICY_EVALUATION_FAILED", str(e), start_time, trace)
    
    if not opa_decision.get("allowed", False):
        record_trace("5. OPA Policy", "FAIL")
        reason = opa_decision.get("reason", "POLICY_DENY")
        return create_audit_and_deny(db, request, reason, "OPA policy denied request", start_time, trace)
        
    record_trace("5. OPA Policy", "PASS")
    
    # 3.5 Evaluate Approval Threshold
    requires_approval = False
    for p in permissions:
        # Match the requested action and resource to find the specific permission limit
        if p["action"] == request.action and p["resource_type"] == request.resource_type:
            # We must fetch the raw permission object to get `requires_approval_above`
            perm_obj = db.query(models.Permission).filter(
                models.Permission.agent_id == request.agent_id,
                models.Permission.action == request.action,
                models.Permission.resource_type == request.resource_type
            ).first()
            if perm_obj and perm_obj.requires_approval_above is not None:
                if request.amount > perm_obj.requires_approval_above:
                    requires_approval = True
            break
            
    if requires_approval:
        record_trace("6. Approval", "PENDING")
        if not request.simulate:
            approval_req = models.ApprovalRequest(
                agent_id=request.agent_id,
                action=request.action,
                resource_type=request.resource_type,
                resource_id=request.resource_id,
                amount=request.amount,
                currency=request.currency,
                request_id=request.request_id,
                status="PENDING"
            )
            db.add(approval_req)
            
            audit = models.AuditEvent(
                event_type="AUTHORIZATION_DECISION",
                agent_id=request.agent_id,
                action=request.action,
                resource_type=request.resource_type,
                resource_id=request.resource_id,
                amount=request.amount,
                currency=request.currency,
                decision="PENDING_APPROVAL",
                reason="EXCEEDS_APPROVAL_THRESHOLD",
                request_id=request.request_id,
                latency_ms=(time.time() - start_time) * 1000
            )
            db.add(audit)
            db.commit()
            
        return AuthorizeResponse(
            decision="PENDING_APPROVAL",
            reason="EXCEEDS_APPROVAL_THRESHOLD",
            trace=trace
        )
        
    record_trace("6. Approval", "NOT EVALUATED")
        
    # 4. Atomic Multi-Budget Check
    fleet_budget_key = "agentguard:budget:fleet:daily"
    agent_budget_key = f"agentguard:budget:agent:{request.agent_id}:daily"
    
    budgets_to_reserve = {}
    
    try:
        # Check and initialize fleet budget
        if redis_client.redis_client.get(fleet_budget_key) is None:
            fleet_budget = db.query(models.Budget).filter(models.Budget.scope == "FLEET_DAILY").first()
            if fleet_budget:
                redis_client.initialize_budget(fleet_budget_key, fleet_budget.limit_amount)
        if redis_client.redis_client.exists(fleet_budget_key):
            budgets_to_reserve[fleet_budget_key] = request.amount
            
        # Check and initialize agent budget
        if redis_client.redis_client.get(agent_budget_key) is None:
            agent_budget = db.query(models.Budget).filter(
                models.Budget.scope == "AGENT_DAILY",
                models.Budget.target_id == request.agent_id
            ).first()
            if agent_budget:
                redis_client.initialize_budget(agent_budget_key, agent_budget.limit_amount)
        if redis_client.redis_client.exists(agent_budget_key):
            budgets_to_reserve[agent_budget_key] = request.amount
            
        if request.simulate:
            success = redis_client.check_budgets(budgets_to_reserve)
        else:
            success = redis_client.reserve_budgets(budgets_to_reserve)

        if not success:
            record_trace("7. Budget", "FAIL")
            return create_audit_and_deny(db, request, "BUDGET_EXCEEDED", "Budget exceeded", start_time, trace)
            
    except Exception as e:
        # Fail closed on Redis error
        record_trace("7. Budget", "FAIL")
        return create_audit_and_deny(db, request, "BUDGET_EVALUATION_FAILED", str(e), start_time, trace)

    record_trace("7. Budget", "PASS")
    record_trace("8. Final Decision", "ALLOW")

    # 5. Allow
    auth_id = f"auth_{int(time.time()*1000)}"
    if not request.simulate:
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
        expires_at=(datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        trace=trace
    )


def create_audit_and_deny(db, request, reason, details, start_time, trace=None):
    if trace is not None:
        trace.append({"step": "8. Final Decision", "status": "DENY"})
        
    if not request.simulate:
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
    return AuthorizeResponse(decision="DENY", reason=reason, trace=trace)
