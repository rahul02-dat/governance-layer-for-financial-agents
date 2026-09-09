from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models
from app.auth import RequireRole

router = APIRouter(
    prefix="/audit-events",
    tags=["Audit"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR", "AUDITOR"]))]
)

from typing import List, Optional
from pydantic import BaseModel

class PaginatedAuditEvents(BaseModel):
    total: int
    items: List[dict] # We'll return dicts or we can rely on FastAPI serialization of ORM

@router.get("/verify")
def verify_audit_chain(db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "AUDITOR"]))):
    from app.services.audit import AuditService
    result = AuditService.verify_chain(db)
    return result

@router.get("")
def get_audit_events(
    skip: int = 0, 
    limit: int = 100,
    agent_id: Optional[str] = None,
    decision: Optional[str] = None,
    action: Optional[str] = None,
    reason: Optional[str] = None,
    event_type: Optional[str] = None,
    request_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    limit = min(max(limit, 1), 100)
    query = db.query(models.AuditEvent)
    
    if agent_id:
        query = query.filter(models.AuditEvent.agent_id.ilike(f"%{agent_id}%"))
    if decision:
        query = query.filter(models.AuditEvent.decision == decision)
    if action:
        query = query.filter(models.AuditEvent.action == action)
    if reason:
        query = query.filter(models.AuditEvent.reason == reason)
    if event_type:
        query = query.filter(models.AuditEvent.event_type == event_type)
    if request_id:
        query = query.filter(models.AuditEvent.request_id.ilike(f"%{request_id}%"))
        
    total = query.count()
    events = query.order_by(models.AuditEvent.timestamp.desc()).offset(skip).limit(limit).all()
    
    return {"total": total, "items": events}

