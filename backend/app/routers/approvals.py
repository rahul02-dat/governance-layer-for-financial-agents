from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import time
import threading

from app.database import get_db
from app import models
from app.auth import RequireRole
from app.services.approval import ApprovalService
from app.services.authorization import AuthorizationService
from app.services.audit import AuditService

_sqlite_approval_lock = threading.Lock()

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
    parent_request_id: Optional[str] = None
    decision_attempt: Optional[int] = None

@router.get("", response_model=List[ApprovalResponse])
def get_approvals(skip: int = 0, limit: int = 50, status: Optional[str] = None, db: Session = Depends(get_db)):
    limit = min(max(limit, 1), 100)
    query = db.query(models.ApprovalRequest, models.Agent.name).join(
        models.Agent, models.ApprovalRequest.agent_id == models.Agent.id
    )
    if status:
        query = query.filter(models.ApprovalRequest.status == status)
    
    results = query.order_by(models.ApprovalRequest.created_at.desc()).offset(skip).limit(limit).all()
    
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
            created_at=req.created_at.isoformat(),
            parent_request_id=req.parent_request_id,
            decision_attempt=req.decision_attempt
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
        created_at=req.created_at.isoformat(),
        parent_request_id=req.parent_request_id,
        decision_attempt=req.decision_attempt
    )

@router.post("/{approval_id}/approve")
def approve_request(approval_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    operator_id = current_user.get("sub", "unknown_operator")
    is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
    if is_sqlite:
        _sqlite_approval_lock.acquire()
    try:
        # Use with_for_update to prevent race conditions during concurrent approvals
        req = db.query(models.ApprovalRequest).filter(
            models.ApprovalRequest.id == approval_id
        ).with_for_update().first()
        
        if not req:
            raise HTTPException(status_code=404, detail="Approval request not found")
            
        if req.status != "PENDING":
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Cannot approve request with status {req.status}")
            
        # Check expiration (15 minutes) against authoritative UTC time
        created_at = req.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        if created_at < datetime.now(timezone.utc) - timedelta(minutes=15):
            req.status = "EXPIRED"
            db.commit()
            raise HTTPException(status_code=400, detail="Approval request has expired")

        # Maintain lineage: decision_attempt and parent_request_id
        req.decision_attempt = (req.decision_attempt or 1) + 1
        new_request_id = f"reval_{req.request_id}_{req.decision_attempt}"
        req.parent_request_id = req.request_id

        # Re-evaluate the entire governance stack, skipping the approval threshold check to prevent loop
        request_data = {
            "agent_id": req.agent_id,
            "action": req.action,
            "resource_type": req.resource_type,
            "resource_id": req.resource_id,
            "amount": req.amount,
            "currency": req.currency,
            "request_id": new_request_id,
        }
        
        auth_result = AuthorizationService.evaluate_request(db, request_data, simulate=False, skip_approval_check=True)
        
        if auth_result["decision"] == "DENY":
            req.status = "DENIED"
            db.commit()
            raise HTTPException(status_code=400, detail=f"Approval re-evaluation resulted in DENY: {auth_result.get('reason')}")
            
        req.status = "APPROVED"
        req.operator_id = operator_id
        req.parent_authorization_id = auth_result.get("authorization_id")
        db.commit()
        
        return {"status": "success", "decision": "ALLOW", "authorization_id": auth_result.get("authorization_id")}
    finally:
        if is_sqlite:
            _sqlite_approval_lock.release()


@router.post("/{approval_id}/deny")
def deny_request(approval_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    operator_id = current_user.get("sub", "unknown_operator")
    is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
    if is_sqlite:
        _sqlite_approval_lock.acquire()
    try:
        req = db.query(models.ApprovalRequest).filter(
            models.ApprovalRequest.id == approval_id
        ).with_for_update().first()
        
        if not req:
            raise HTTPException(status_code=404, detail="Approval request not found")
            
        if req.status != "PENDING":
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Cannot deny request with status {req.status}")
            
        req.status = "DENIED"
        req.operator_id = operator_id
        
        AuditService.create_audit_event(
            db=db,
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
        
        db.commit()
        return {"status": "success", "decision": "DENY"}
    finally:
        if is_sqlite:
            _sqlite_approval_lock.release()
