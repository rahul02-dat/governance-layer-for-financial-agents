from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import time

from app.database import get_db
from app import models, redis_client
from app.auth import RequireRole

router = APIRouter(
    prefix="/approvals",
    tags=["Approvals"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

class ApprovalResponse(BaseModel):
    id: str
    agent_id: str
    agent_name: Optional[str] = None
    action: str
    resource_type: str
    resource_id: str
    amount: float
    currency: str
    status: str
    created_at: str

@router.get("/", response_model=List[ApprovalResponse])
def get_approvals(status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.ApprovalRequest, models.Agent.name).join(
        models.Agent, models.ApprovalRequest.agent_id == models.Agent.id
    )
    if status:
        query = query.filter(models.ApprovalRequest.status == status)
    
    results = query.order_by(models.ApprovalRequest.created_at.desc()).all()
    
    return [
        ApprovalResponse(
            id=req.id,
            agent_id=req.agent_id,
            agent_name=agent_name,
            action=req.action,
            resource_type=req.resource_type,
            resource_id=req.resource_id,
            amount=req.amount,
            currency=req.currency,
            status=req.status,
            created_at=req.created_at.isoformat()
        )
        for req, agent_name in results
    ]

@router.get("/{approval_id}", response_model=ApprovalResponse)
def get_approval(approval_id: str, db: Session = Depends(get_db)):
    result = db.query(models.ApprovalRequest, models.Agent.name).join(
        models.Agent, models.ApprovalRequest.agent_id == models.Agent.id
    ).filter(models.ApprovalRequest.id == approval_id).first()
    
    if not result:
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    req, agent_name = result
    
    return ApprovalResponse(
        id=req.id,
        agent_id=req.agent_id,
        agent_name=agent_name,
        action=req.action,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        amount=req.amount,
        currency=req.currency,
        status=req.status,
        created_at=req.created_at.isoformat()
    )

@router.post("/{approval_id}/approve")
def approve_request(approval_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    operator_id = current_user.get("sub", "unknown_operator")
    
    # Use with_for_update to prevent race conditions during concurrent approvals
    req = db.query(models.ApprovalRequest).filter(
        models.ApprovalRequest.id == approval_id
    ).with_for_update().first()
    
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    if req.status != "PENDING":
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Cannot approve request with status {req.status}")
        
    # Check expiration (15 minutes)
    if req.created_at < datetime.now(timezone.utc) - timedelta(minutes=15):
        req.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=400, detail="Approval request has expired")

    # Check fleet state
    fleet_status = redis_client.get_fleet_status()
    if fleet_status != "ACTIVE":
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot approve: Fleet is HALTED")

    # Check agent state
    agent_status = redis_client.get_agent_status(req.agent_id)
    if agent_status != "ACTIVE":
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot approve: Agent is REVOKED")

    start_time = time.time()
    
    # Check and reserve budgets
    fleet_budget_key = "agentguard:budget:fleet:daily"
    agent_budget_key = f"agentguard:budget:agent:{req.agent_id}:daily"
    
    budgets_to_reserve = {}
    
    if redis_client.redis_client.get(fleet_budget_key) is None:
        fleet_budget = db.query(models.Budget).filter(models.Budget.scope == "FLEET_DAILY").first()
        if fleet_budget:
            redis_client.initialize_budget(fleet_budget_key, fleet_budget.limit_amount)
    if redis_client.redis_client.exists(fleet_budget_key):
        budgets_to_reserve[fleet_budget_key] = req.amount
        
    if redis_client.redis_client.get(agent_budget_key) is None:
        agent_budget = db.query(models.Budget).filter(
            models.Budget.scope == "AGENT_DAILY",
            models.Budget.target_id == req.agent_id
        ).first()
        if agent_budget:
            redis_client.initialize_budget(agent_budget_key, agent_budget.limit_amount)
    if redis_client.redis_client.exists(agent_budget_key):
        budgets_to_reserve[agent_budget_key] = req.amount
        
    success = redis_client.reserve_budgets(budgets_to_reserve)

    if not success:
        # We can deny it or keep it pending. Let's deny it.
        req.status = "DENIED"
        audit = models.AuditEvent(
            event_type="AUTHORIZATION_DECISION",
            agent_id=req.agent_id,
            action=req.action,
            resource_type=req.resource_type,
            resource_id=req.resource_id,
            amount=req.amount,
            currency=req.currency,
            decision="DENY",
            reason="BUDGET_EXCEEDED",
            request_id=req.request_id,
            operator_id=operator_id,
            latency_ms=int((time.time() - start_time) * 1000)
        )
        db.add(audit)
        db.commit()
        raise HTTPException(status_code=400, detail="Cannot approve: Budget exceeded")

    # Success! Update request and log ALLOW
    req.status = "APPROVED"
    
    # Create the final ALLOW audit event
    audit = models.AuditEvent(
        event_type="AUTHORIZATION_DECISION",
        agent_id=req.agent_id,
        action=req.action,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        amount=req.amount,
        currency=req.currency,
        decision="ALLOW",
        reason="OPERATOR_APPROVED",
        request_id=req.request_id,
        operator_id=operator_id,
        latency_ms=int((time.time() - start_time) * 1000)
    )
    db.add(audit)
    db.commit()
    
    return {"status": "success", "decision": "ALLOW"}

@router.post("/{approval_id}/deny")
def deny_request(approval_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    operator_id = current_user.get("sub", "unknown_operator")
    
    # Use with_for_update to prevent race conditions
    req = db.query(models.ApprovalRequest).filter(
        models.ApprovalRequest.id == approval_id
    ).with_for_update().first()
    
    if not req:
        raise HTTPException(status_code=404, detail="Approval request not found")
        
    if req.status != "PENDING":
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Cannot deny request with status {req.status}")
        
    req.status = "DENIED"
    
    audit = models.AuditEvent(
        event_type="AUTHORIZATION_DECISION",
        agent_id=req.agent_id,
        action=req.action,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        amount=req.amount,
        currency=req.currency,
        decision="DENY",
        reason="OPERATOR_DENIED",
        request_id=req.request_id,
        operator_id=operator_id
    )
    
    db.add(audit)
    db.commit()
    
    return {"status": "success", "decision": "DENY"}
