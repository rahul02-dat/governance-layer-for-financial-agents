from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app import schemas, models
from app.database import get_db
from app.auth import RequireRole
from app.services.agent_state import AgentStateService
from app.services.audit import AuditService

router = APIRouter(
    prefix="/fleet",
    tags=["Fleet"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

@router.get("/status")
def get_fleet_status():
    status = AgentStateService.get_fleet_status()
    return {"fleet_state": status}

@router.post("/emergency-stop")
def emergency_stop(db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    # Set the fleet status in redis
    from app import redis_client
    redis_client.set_fleet_status("HALTED")
    
    AuditService.create_audit_event(
        db=db,
        event_type="FLEET_HALTED",
        action="HALT_FLEET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST",
        operator_id=current_user.get("sub", "unknown")
    )
    db.commit()
    return {"status": "success", "fleet_state": "HALTED"}

@router.post("/resume")
def resume_fleet(db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    from app import redis_client
    redis_client.set_fleet_status("ACTIVE")
    
    AuditService.create_audit_event(
        db=db,
        event_type="FLEET_RESUMED",
        action="RESUME_FLEET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST",
        operator_id=current_user.get("sub", "unknown")
    )
    db.commit()
    return {"status": "success", "fleet_state": "ACTIVE"}
