from sqlalchemy.orm import Session
from app import models, redis_client

class AgentStateService:
    @staticmethod
    def get_agent_status(db: Session, agent_id: str) -> str | None:
        status = redis_client.get_agent_status(agent_id)
        if not status:
            agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
            if not agent:
                return None
            status = agent.status
            redis_client.set_agent_status(agent_id, status)
        return status

    @staticmethod
    def get_fleet_status() -> str:
        return redis_client.get_fleet_status()

    @staticmethod
    def update_agent_status(db: Session, agent_id: str, new_status: str) -> bool:
        agent = db.query(models.Agent).filter(models.Agent.id == agent_id).first()
        if not agent:
            return False
        
        agent.status = new_status
        db.add(agent)
        db.flush()
        
        redis_client.set_agent_status(agent_id, new_status)
        return True
