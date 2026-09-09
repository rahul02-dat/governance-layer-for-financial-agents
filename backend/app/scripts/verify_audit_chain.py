import sys
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.services.audit import AuditService

def verify_chain():
    db: Session = SessionLocal()
    try:
        res = AuditService.verify_chain(db)
        if res["valid"]:
            print(f"[SUCCESS] {res['message']} (Total events: {res.get('total_events', 0)}, Head hash: {res.get('head_hash', 'N/A')})")
            return True
        else:
            print(f"[FAIL] Audit chain verification failed: {res.get('error')}")
            if "broken_event_id" in res:
                print(f"       Broken event ID: {res.get('broken_event_id')} (Sequence: {res.get('sequence_number')})")
            if "expected_hash" in res:
                print(f"       Expected hash: {res.get('expected_hash')}")
                print(f"       Actual hash:   {res.get('actual_hash')}")
            if "expected_previous_hash" in res:
                print(f"       Expected prev: {res.get('expected_previous_hash')}")
                print(f"       Actual prev:   {res.get('actual_previous_hash')}")
            return False
    finally:
        db.close()

if __name__ == "__main__":
    if not verify_chain():
        sys.exit(1)
    sys.exit(0)

