from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import RequireRole
from app.services.quarantine import QuarantineService
from app.services.audit import AuditService
from app.services.agent_state import AgentStateService

router = APIRouter(
    prefix="/agents",
    tags=["Agents"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

@router.get("/", response_model=List[schemas.AgentResponse])
def get_agents(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    agents = db.query(models.Agent).offset(skip).limit(limit).all()
    return agents

@router.get("/{agent_id}", response_model=schemas.AgentResponse)
def get_agent(agent_id: str, db: Session = Depends(get_db)):
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent

@router.post("/", response_model=schemas.AgentResponse, status_code=status.HTTP_201_CREATED)
def create_agent(agent: schemas.AgentCreate, db: Session = Depends(get_db)):
    db_agent = models.Agent(**agent.model_dump())
    db.add(db_agent)
    db.commit()
    db.refresh(db_agent)
    return db_agent

@router.patch("/{agent_id}", response_model=schemas.AgentResponse)
def update_agent(agent_id: str, agent_update: schemas.AgentUpdate, db: Session = Depends(get_db)):
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    update_data = agent_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_agent, key, value)
    
    db.commit()
    db.refresh(db_agent)
    return db_agent

@router.post("/{agent_id}/revoke", response_model=schemas.AgentResponse)
def revoke_agent(agent_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    # This invokes QuarantineService, which immediately revokes, logs, and triggers K8s containment
    success = QuarantineService.quarantine_agent(db, agent_id, operator_id=current_user.get("sub", "unknown"))
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found or could not be revoked")
    
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    return db_agent

@router.post("/{agent_id}/restore", response_model=schemas.AgentResponse)
def restore_agent(agent_id: str, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR"]))):
    success = AgentStateService.update_agent_status(db, agent_id, "ACTIVE")
    if not success:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    AuditService.create_audit_event(
        db=db,
        event_type="AGENT_RESTORED",
        agent_id=agent_id,
        action="RESTORE_AGENT",
        decision="ALLOW",
        reason="OPERATOR_REQUEST",
        operator_id=current_user.get("sub", "unknown")
    )
    db.commit()
    
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    return db_agent

@router.post("/{agent_id}/permissions", response_model=schemas.PermissionResponse, status_code=status.HTTP_201_CREATED)
def create_permission(agent_id: str, permission: schemas.PermissionCreate, db: Session = Depends(get_db)):
    db_agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    db_permission = models.Permission(**permission.model_dump(), agent_id=agent_id)
    db.add(db_permission)
    db.commit()
    db.refresh(db_permission)
    return db_permission

@router.get("/{agent_id}/permissions", response_model=List[schemas.PermissionResponse])
def get_permissions(agent_id: str, db: Session = Depends(get_db)):
    permissions = db.query(models.Permission).filter(models.Permission.agent_id == agent_id).all()
    return permissions

@router.delete("/permissions/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_permission(permission_id: str, db: Session = Depends(get_db)):
    db_permission = db.query(models.Permission).filter(models.Permission.id == permission_id).first()
    if not db_permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    db.delete(db_permission)
    db.commit()
    return None

class AgentInvokeRequest(schemas.BaseModel):
    objective: str

@router.post("/{agent_id}/invoke")
def invoke_agent(agent_id: str, request: AgentInvokeRequest, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["ADMIN", "OPERATOR", "AGENT"]))):
    from app.agent.runtime import AgentRuntime
    from app.auth import create_access_token
    
    agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
        
    agent_token = create_access_token({"sub": agent_id, "role": "AGENT"})
    
    runtime = AgentRuntime(agent_id, agent_token)
    result = runtime.run(request.objective)
    return result
