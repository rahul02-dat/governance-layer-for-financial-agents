from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import schemas, models, redis_client
from app.database import get_db

router = APIRouter(
    prefix="/fleet",
    tags=["Fleet"]
)

@router.get("/status")
def get_fleet_status():
    status = redis_client.get_fleet_status()
    return {"fleet_state": status}

@router.post("/emergency-stop")
def emergency_stop(db: Session = Depends(get_db)):
    redis_client.set_fleet_status("HALTED")
    audit = models.AuditEvent(
        event_type="FLEET_HALTED",
        action="HALT_FLEET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST"
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "fleet_state": "HALTED"}

@router.post("/resume")
def resume_fleet(db: Session = Depends(get_db)):
    redis_client.set_fleet_status("ACTIVE")
    audit = models.AuditEvent(
        event_type="FLEET_RESUMED",
        action="RESUME_FLEET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST"
    )
    db.add(audit)
    db.commit()
    return {"status": "success", "fleet_state": "ACTIVE"}
