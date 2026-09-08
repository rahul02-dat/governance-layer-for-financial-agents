from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app import models
from app.auth import RequireRole
from typing import List, Dict, Any

router = APIRouter(
    prefix="/analytics",
    tags=["Analytics"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR", "AUDITOR"]))]
)

@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    # Agent stats
    total_agents = db.query(models.Agent).count()
    active_agents = db.query(models.Agent).filter(models.Agent.status == "ACTIVE").count()
    revoked_agents = db.query(models.Agent).filter(models.Agent.status == "REVOKED").count()

    # Request stats
    total_requests = db.query(models.AuditEvent).filter(models.AuditEvent.event_type == "AUTHORIZATION_DECISION").count()
    
    allowed_requests = db.query(models.AuditEvent).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "ALLOW"
    ).count()
    
    denied_requests = db.query(models.AuditEvent).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "DENY"
    ).count()

    pending_requests = db.query(models.AuditEvent).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "PENDING_APPROVAL"
    ).count()

    # Value stats
    value_governed = db.query(func.sum(models.AuditEvent.amount)).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "ALLOW"
    ).scalar() or 0.0

    value_blocked = db.query(func.sum(models.AuditEvent.amount)).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "DENY"
    ).scalar() or 0.0

    pending_value = db.query(func.sum(models.AuditEvent.amount)).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "PENDING_APPROVAL"
    ).scalar() or 0.0

    # Rates
    allow_rate = (allowed_requests / total_requests * 100) if total_requests > 0 else 0
    deny_rate = (denied_requests / total_requests * 100) if total_requests > 0 else 0

    return {
        "agents": {
            "total": total_agents,
            "active": active_agents,
            "revoked": revoked_agents
        },
        "requests": {
            "total": total_requests,
            "allowed": allowed_requests,
            "denied": denied_requests,
            "pending": pending_requests,
            "allow_rate": round(allow_rate, 2),
            "deny_rate": round(deny_rate, 2)
        },
        "financial": {
            "value_governed": value_governed,
            "value_blocked": value_blocked,
            "pending_value": pending_value
        }
    }

@router.get("/denials")
def get_denials(db: Session = Depends(get_db)):
    results = db.query(
        models.AuditEvent.reason,
        func.count(models.AuditEvent.id).label("count")
    ).filter(
        models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
        models.AuditEvent.decision == "DENY",
        models.AuditEvent.reason != None
    ).group_by(models.AuditEvent.reason).order_by(func.count(models.AuditEvent.id).desc()).all()

    return [{"reason": r.reason, "count": r.count} for r in results]

@router.get("/agents")
def get_agent_health(db: Session = Depends(get_db)):
    # For each agent, we need their name, total requests, deny %, and blocked amount.
    agents = db.query(models.Agent).all()
    health_data = []

    for agent in agents:
        total_reqs = db.query(models.AuditEvent).filter(
            models.AuditEvent.agent_id == agent.id,
            models.AuditEvent.event_type == "AUTHORIZATION_DECISION"
        ).count()
        
        denied_reqs = db.query(models.AuditEvent).filter(
            models.AuditEvent.agent_id == agent.id,
            models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
            models.AuditEvent.decision == "DENY"
        ).count()

        blocked_val = db.query(func.sum(models.AuditEvent.amount)).filter(
            models.AuditEvent.agent_id == agent.id,
            models.AuditEvent.event_type == "AUTHORIZATION_DECISION",
            models.AuditEvent.decision == "DENY"
        ).scalar() or 0.0

        deny_rate = (denied_reqs / total_reqs * 100) if total_reqs > 0 else 0

        if total_reqs > 0:
            health_data.append({
                "agent_id": agent.id,
                "agent_name": agent.name,
                "requests": total_reqs,
                "deny_percent": round(deny_rate, 2),
                "blocked_value": blocked_val
            })
    
    # Sort by blocked_value descending or requests descending
    health_data.sort(key=lambda x: x["blocked_value"], reverse=True)
    return health_data
