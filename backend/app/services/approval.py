from decimal import Decimal
from sqlalchemy.orm import Session
from app import models

class ApprovalService:
    @staticmethod
    def create_pending_approval(db: Session, request_data: dict) -> models.ApprovalRequest:
        approval_req = models.ApprovalRequest(
            agent_id=request_data["agent_id"],
            action=request_data["action"],
            resource_type=request_data["resource_type"],
            resource_id=request_data["resource_id"],
            amount=request_data["amount"],
            currency=request_data["currency"],
            request_id=request_data.get("request_id"),
            parent_request_id=request_data.get("request_id"),
            status="PENDING"
        )
        db.add(approval_req)
        db.flush()
        return approval_req
        
    @staticmethod
    def get_pending_approval(db: Session, approval_id: str) -> models.ApprovalRequest | None:
        return db.query(models.ApprovalRequest).filter(
            models.ApprovalRequest.id == approval_id,
            models.ApprovalRequest.status == "PENDING"
        ).first()

    @staticmethod
    def update_approval_status(db: Session, approval_req: models.ApprovalRequest, new_status: str, operator_id: str):
        approval_req.status = new_status
        approval_req.operator_id = operator_id
        db.add(approval_req)
        db.flush()
