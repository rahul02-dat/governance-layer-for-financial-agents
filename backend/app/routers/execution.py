from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session
import threading
from app.database import get_db
from app.models import AuditEvent, ExecutionAuthorization
from app.services.audit import AuditService

_sqlite_execution_lock = threading.Lock()

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
    consume: bool = True

@router.post("/verify")
def verify_authorization(request: ExecutionVerifyRequest, db: Session = Depends(get_db)):
    is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
    if is_sqlite:
        _sqlite_execution_lock.acquire()
    try:
        # 1. Lock and retrieve ExecutionAuthorization record
        exec_auth = db.query(ExecutionAuthorization).filter(
            ExecutionAuthorization.id == request.authorization_id
        ).with_for_update().first()
        
        if not exec_auth:
            # Fallback check on AuditEvent for legacy records
            auth_event = db.query(AuditEvent).filter(
                AuditEvent.authorization_id == request.authorization_id,
                AuditEvent.event_type == "AUTHORIZATION_DECISION"
            ).first()
            if not auth_event:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Authorization not found")
            if auth_event.decision != "ALLOW":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Authorization decision is {auth_event.decision}, not ALLOW")
            
            # Verify payload against audit event
            if auth_event.agent_id != request.agent_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent mismatch")
            if auth_event.action != request.action:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Action mismatch")
            if auth_event.resource_type != request.resource_type:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource type mismatch")
            if auth_event.resource_id != request.resource_id:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource ID mismatch")
            if auth_event.amount != request.amount:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Amount mismatch")
            if auth_event.currency != request.currency:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Currency mismatch")
            return {"status": "VERIFIED", "authorization_id": request.authorization_id}

        # 2. Check consumption state
        if exec_auth.status == "CONSUMED":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Authorization has already been consumed (replay prevented)"
            )
        if exec_auth.status == "REVOKED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authorization has been revoked"
            )
        if exec_auth.status == "EXPIRED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authorization has expired"
            )

        # 3. Server-side Authoritative Expiration Check
        now = datetime.now(timezone.utc)
        # Ensure expires_at is timezone-aware for comparison
        expires_at = exec_auth.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
            
        if now > expires_at:
            exec_auth.status = "EXPIRED"
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authorization has expired"
            )

        # 4. Strict Payload Verification
        if exec_auth.agent_id != request.agent_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agent mismatch")
        if exec_auth.action != request.action:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Action mismatch")
        if exec_auth.resource_type != request.resource_type:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource type mismatch")
        if exec_auth.resource_id != request.resource_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Resource ID mismatch")
        if exec_auth.amount != request.amount:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Amount mismatch")
        if exec_auth.currency != request.currency:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Currency mismatch")

        # 5. Single-use consumption
        if request.consume:
            exec_auth.status = "CONSUMED"
            exec_auth.consumed_at = now
            AuditService.create_audit_event(
                db=db,
                event_type="AUTHORIZATION_CONSUMED",
                agent_id=exec_auth.agent_id,
                action=exec_auth.action,
                resource_type=exec_auth.resource_type,
                resource_id=exec_auth.resource_id,
                amount=exec_auth.amount,
                currency=exec_auth.currency,
                decision="CONSUMED",
                reason="EXECUTION_VERIFIED",
                authorization_id=exec_auth.id
            )
        
        db.commit()
        return {"status": "VERIFIED", "authorization_id": exec_auth.id, "consumed": request.consume}
    finally:
        if is_sqlite:
            _sqlite_execution_lock.release()


