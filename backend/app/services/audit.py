import hashlib
import json
from decimal import Decimal
from datetime import datetime, timezone
import threading
from sqlalchemy.orm import Session
from app.models import AuditEvent

_sqlite_audit_lock = threading.RLock()

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
        is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
        if is_sqlite:
            _sqlite_audit_lock.acquire()
        try:
            # We need a table-level lock or explicit serialization to ensure strictly sequential chaining.
            from app.models import AuditChainHead
            
            head = db.query(AuditChainHead).filter(AuditChainHead.id == 1).with_for_update().first()
            if not head:
                head = AuditChainHead(id=1, last_event_id=None, last_event_hash="GENESIS", last_sequence_number=0)
                db.add(head)
                db.flush()
                
            next_seq = (head.last_sequence_number or 0) + 1
            previous_hash = head.last_event_hash or "GENESIS"
            
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
                sequence_number=next_seq,
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
            
            # Update head pointers
            head.last_event_id = audit_event.id
            head.last_event_hash = event_hash
            head.last_sequence_number = next_seq
            
            # Flush to DB to ensure the row exists and locks are held until transaction commit
            db.flush()
            
            return audit_event
        finally:
            if is_sqlite:
                _sqlite_audit_lock.release()

    @staticmethod
    def verify_chain(db: Session) -> dict:
        """
        Cryptographically verifies the entire audit hash chain from GENESIS to head.
        Detects tampering, deletions, re-ordering, or insertions.
        """
        from app.models import AuditChainHead
        events = db.query(AuditEvent).order_by(AuditEvent.sequence_number.asc()).all()
        if not events:
            return {"valid": True, "message": "Audit chain is empty", "total_events": 0}
            
        expected_prev = "GENESIS"
        for event in events:
            if event.previous_hash != expected_prev:
                return {
                    "valid": False,
                    "error": "CHAIN_BROKEN_PREVIOUS_HASH_MISMATCH",
                    "broken_event_id": event.id,
                    "sequence_number": event.sequence_number,
                    "expected_previous_hash": expected_prev,
                    "actual_previous_hash": event.previous_hash
                }
                
            event_data = {
                "event_type": event.event_type,
                "agent_id": event.agent_id,
                "action": event.action,
                "resource_type": event.resource_type,
                "resource_id": event.resource_id,
                "amount": event.amount,
                "currency": event.currency,
                "decision": event.decision,
                "reason": event.reason,
                "policy_id": event.policy_id,
                "operator_id": event.operator_id,
                "request_id": event.request_id,
                "authorization_id": event.authorization_id,
                "policy_version": event.policy_version,
                "latency_ms": event.latency_ms,
                "previous_hash": event.previous_hash
            }
            clean_data = {k: v for k, v in event_data.items() if v is not None}
            canonical_bytes = AuditService._canonical_serialize(clean_data)
            calc_hash = AuditService._calculate_hash(canonical_bytes)
            
            if calc_hash != event.event_hash:
                return {
                    "valid": False,
                    "error": "EVENT_HASH_TAMPERED",
                    "broken_event_id": event.id,
                    "sequence_number": event.sequence_number,
                    "expected_hash": calc_hash,
                    "actual_hash": event.event_hash
                }
            expected_prev = event.event_hash

        head = db.query(AuditChainHead).filter(AuditChainHead.id == 1).first()
        if head and head.last_event_hash != expected_prev:
            return {
                "valid": False,
                "error": "CHAIN_HEAD_MISMATCH",
                "head_hash": head.last_event_hash,
                "last_event_hash": expected_prev
            }
            
        return {
            "valid": True,
            "message": "Audit hash chain is fully valid and untampered",
            "total_events": len(events),
            "head_hash": expected_prev
        }

