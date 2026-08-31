from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models

router = APIRouter(
    prefix="/audit-events",
    tags=["Audit"]
)

@router.get("/")
def get_audit_events(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    events = db.query(models.AuditEvent).order_by(models.AuditEvent.timestamp.desc()).offset(skip).limit(limit).all()
    return events
