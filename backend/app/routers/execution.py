from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from decimal import Decimal
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AuditEvent

router = APIRouter(
    prefix="/execution",
    tags=["Execution"]
)

class ExecutionVerifyRequest(BaseModel):
    authorization_id: str
    agent_id: str
    action: str
    resource_type: str
    resource_id: str
    amount: Decimal
    currency: str

@router.post("/verify")
def verify_authorization(request: ExecutionVerifyRequest, db: Session = Depends(get_db)):
    auth_event = db.query(AuditEvent).filter(
        AuditEvent.authorization_id == request.authorization_id,
        AuditEvent.event_type == "AUTHORIZATION_DECISION"
    ).first()
    
    if not auth_event:
        raise HTTPException(status_code=404, detail="Authorization not found")
        
    if auth_event.decision != "ALLOW":
        raise HTTPException(status_code=403, detail=f"Authorization decision is {auth_event.decision}, not ALLOW")
        
    # Verify the payload strictly
    if auth_event.agent_id != request.agent_id:
        raise HTTPException(status_code=403, detail="Agent mismatch")
    if auth_event.action != request.action:
        raise HTTPException(status_code=403, detail="Action mismatch")
    if auth_event.resource_type != request.resource_type:
        raise HTTPException(status_code=403, detail="Resource type mismatch")
    if auth_event.resource_id != request.resource_id:
        raise HTTPException(status_code=403, detail="Resource ID mismatch")
    if auth_event.amount != request.amount:
        raise HTTPException(status_code=403, detail="Amount mismatch")
    if auth_event.currency != request.currency:
        raise HTTPException(status_code=403, detail="Currency mismatch")
        
    # In a real system, we'd also check if it has already been consumed or expired
    return {"status": "VERIFIED"}
