import sys
import hashlib
import json
from decimal import Decimal
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import AuditEvent, AuditChainHead

def _canonical_serialize(event_data: dict) -> bytes:
    canonical_dict = {}
    for key in sorted(event_data.keys()):
        val = event_data[key]
        if val is None:
            continue
        if isinstance(val, Decimal):
            canonical_dict[key] = str(val)
        elif isinstance(val, datetime):
            canonical_dict[key] = val.astimezone(timezone.utc).isoformat()
        else:
            canonical_dict[key] = val
            
    json_str = json.dumps(canonical_dict, sort_keys=True, separators=(',', ':'))
    return json_str.encode('utf-8')

def _calculate_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def verify_chain():
    db: Session = SessionLocal()
    try:
        events = db.query(AuditEvent).order_by(AuditEvent.timestamp.asc(), AuditEvent.id.asc()).all()
        
        if not events:
            print("No events found. Chain is valid (empty).")
            return True
            
        expected_previous = "GENESIS"
        
        for event in events:
            if event.previous_hash != expected_previous:
                print(f"[FAIL] Link broken at event {event.id}. Expected previous hash {expected_previous}, got {event.previous_hash}")
                return False
                
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
            
            canonical_bytes = _canonical_serialize(event_data)
            calculated_hash = _calculate_hash(canonical_bytes)
            
            if calculated_hash != event.event_hash:
                print(f"[FAIL] Hash mismatch at event {event.id}. Calculated {calculated_hash}, but stored {event.event_hash}")
                return False
                
            expected_previous = event.event_hash
            
        head = db.query(AuditChainHead).filter(AuditChainHead.id == 1).first()
        if head and head.last_event_hash != expected_previous:
            print(f"[FAIL] AuditChainHead mismatch. Head says {head.last_event_hash}, but actual chain ends with {expected_previous}")
            return False
            
        print("[SUCCESS] Audit hash chain is fully valid and untampered.")
        return True
    finally:
        db.close()

if __name__ == "__main__":
    if not verify_chain():
        sys.exit(1)
    sys.exit(0)
