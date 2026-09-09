import hashlib
import json
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import AuditEvent

class AuditService:
    @staticmethod
    def _canonical_serialize(event_data: dict) -> bytes:
        """
        Produce a canonical serialization of the event data for hashing.
        """
        # Ensure we have a deterministic representation
        canonical_dict = {}
        for key in sorted(event_data.keys()):
            val = event_data[key]
            if isinstance(val, Decimal):
                canonical_dict[key] = str(val)
            elif isinstance(val, datetime):
                # Ensure UTC ISO format
                canonical_dict[key] = val.astimezone(timezone.utc).isoformat()
            else:
                canonical_dict[key] = val
                
        # Serialize to JSON with sorted keys and no spaces
        json_str = json.dumps(canonical_dict, sort_keys=True, separators=(',', ':'))
        return json_str.encode('utf-8')

    @staticmethod
    def _calculate_hash(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def create_audit_event(
        db: Session,
        event_type: str,
        agent_id: str = None,
        action: str = None,
        resource_type: str = None,
        resource_id: str = None,
        amount: Decimal = None,
        currency: str = None,
        decision: str = None,
        reason: str = None,
        policy_id: str = None,
        operator_id: str = None,
        request_id: str = None,
        authorization_id: str = None,
        policy_version: int = None,
        latency_ms: int = None
    ) -> AuditEvent:
        """
        Creates an audit event with SHA-256 hash chaining, persisting it atomically.
        """
        # We need a table-level lock or explicit serialization to ensure strictly sequential chaining.
        from app.models import AuditChainHead
        
        head = db.query(AuditChainHead).filter(AuditChainHead.id == 1).with_for_update().first()
        if not head:
            head = AuditChainHead(id=1, last_event_id=None, last_event_hash="GENESIS")
            db.add(head)
            db.flush()
            
        previous_hash = head.last_event_hash
        
        event_data = {
            "event_type": event_type,
            "agent_id": agent_id,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "amount": amount,
            "currency": currency,
            "decision": decision,
            "reason": reason,
            "policy_id": policy_id,
            "operator_id": operator_id,
            "request_id": request_id,
            "authorization_id": authorization_id,
            "policy_version": policy_version,
            "latency_ms": latency_ms,
            "previous_hash": previous_hash
        }
        
        # Remove None values for canonical serialization
        event_data_clean = {k: v for k, v in event_data.items() if v is not None}
        
        canonical_bytes = AuditService._canonical_serialize(event_data_clean)
        event_hash = AuditService._calculate_hash(canonical_bytes)
        
        audit_event = AuditEvent(
            event_type=event_type,
            agent_id=agent_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            amount=amount,
            currency=currency,
            decision=decision,
            reason=reason,
            policy_id=policy_id,
            operator_id=operator_id,
            request_id=request_id,
            authorization_id=authorization_id,
            policy_version=policy_version,
            latency_ms=latency_ms,
            previous_hash=previous_hash,
            event_hash=event_hash
        )
        
        db.add(audit_event)
        
        # Ensure we have the ID before assigning (if it's generated on insert, flush first)
        # However, uuid is generated client-side by our default function
        head.last_event_id = audit_event.id
        head.last_event_hash = event_hash
        
        # Flush to DB to ensure the row exists and locks are held until transaction commit
        db.flush()
        
        return audit_event
