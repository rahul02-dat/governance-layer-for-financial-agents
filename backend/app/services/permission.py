from sqlalchemy.orm import Session
from app import models

class PermissionService:
    @staticmethod
    def get_agent_permissions(db: Session, agent_id: str) -> list[dict]:
        permissions = db.query(models.Permission).filter(
            models.Permission.agent_id == agent_id,
            models.Permission.enabled == True
        ).all()
        return [{"action": p.action, "resource_type": p.resource_type, "allowed_accounts": p.allowed_accounts, "allowed_currencies": p.allowed_currencies, "max_amount": float(p.max_amount) if p.max_amount is not None else None} for p in permissions]

    @staticmethod
    def get_approval_threshold(db: Session, agent_id: str, action: str, resource_type: str):
        perm_obj = db.query(models.Permission).filter(
            models.Permission.agent_id == agent_id,
            models.Permission.action == action,
            models.Permission.resource_type == resource_type
        ).first()
        if perm_obj and perm_obj.requires_approval_above is not None:
            return perm_obj.requires_approval_above
        return None
