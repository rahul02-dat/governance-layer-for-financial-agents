import time
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from sqlalchemy.orm import Session
from app.models import AuditEvent
from app.services.agent_state import AgentStateService
from app.services.permission import PermissionService
from app.services.policy import PolicyService
from app.services.budget import BudgetService
from app.services.approval import ApprovalService
from app.services.audit import AuditService

class AuthorizationService:
    @staticmethod
    def evaluate_request(db: Session, request_data: dict, simulate: bool = False, skip_approval_check: bool = False) -> dict:
        start_time = time.time()
        trace = []
        
        def record_trace(step_name, status_val):
            trace.append({"step": step_name, "status": status_val})

        record_trace("1. Request Validation", "PASS")
        
        # 0. Idempotency Check
        if request_data.get("request_id"):
            previous_event = db.query(AuditEvent).filter(
                AuditEvent.request_id == request_data["request_id"],
                AuditEvent.event_type == "AUTHORIZATION_DECISION"
            ).first()
            
            if previous_event:
                if (previous_event.agent_id == request_data["agent_id"] and
                    previous_event.action == request_data["action"] and
                    previous_event.resource_type == request_data["resource_type"] and
                    previous_event.resource_id == request_data["resource_id"] and
                    previous_event.amount == request_data["amount"] and
                    previous_event.currency == request_data["currency"]):
                    
                    return {
                        "decision": previous_event.decision,
                        "authorization_id": previous_event.authorization_id,
                        "reason": previous_event.reason,
                        "trace": [{"step": "0. Idempotency Cache Hit", "status": "PASS"}]
                    }
                else:
                    raise ValueError("IDEMPOTENCY_CONFLICT: A different request with this request_id was already processed.")

        # 1. Fetch Fleet Status
        try:
            fleet_status = AgentStateService.get_fleet_status()
        except Exception as e:
            record_trace("2. Fleet State", "FAIL")
            return AuthorizationService._deny(db, request_data, "INFRASTRUCTURE_FAILURE", f"Fleet state unavailable: {str(e)}", start_time, trace, simulate)
            
        if fleet_status != "ACTIVE":
            record_trace("2. Fleet State", "FAIL")
            return AuthorizationService._deny(db, request_data, "FLEET_HALTED", "Fleet is halted", start_time, trace, simulate)
        record_trace("2. Fleet State", "PASS")

        # 2. Fetch Agent Status
        try:
            agent_status = AgentStateService.get_agent_status(db, request_data["agent_id"])
        except Exception as e:
            record_trace("3. Agent State", "FAIL")
            return AuthorizationService._deny(db, request_data, "INFRASTRUCTURE_FAILURE", f"Agent state unavailable: {str(e)}", start_time, trace, simulate)
            
        if not agent_status:
            record_trace("3. Agent State", "FAIL")
            return AuthorizationService._deny(db, request_data, "AGENT_NOT_FOUND", "No such agent", start_time, trace, simulate)
        if agent_status != "ACTIVE":
            record_trace("3. Agent State", "FAIL")
            return AuthorizationService._deny(db, request_data, "AGENT_REVOKED", "Agent is revoked or quarantined", start_time, trace, simulate)
        record_trace("3. Agent State", "PASS")

        # 3. Evaluate OPA policy
        try:
            permissions = PermissionService.get_agent_permissions(db, request_data["agent_id"])
            record_trace("4. Permission Context", "RESOLVED")
        except Exception as e:
            record_trace("4. Permission Context", "FAIL")
            return AuthorizationService._deny(db, request_data, "INFRASTRUCTURE_FAILURE", f"Permission context unavailable: {str(e)}", start_time, trace, simulate)
            
        opa_input = {
            "fleet_state": fleet_status,
            "agent_status": agent_status,
            "request": {
                **request_data,
                "amount": float(request_data["amount"])
            },
            "permissions": permissions
        }
        
        try:
            opa_decision = PolicyService.evaluate_authorization(opa_input)
        except Exception as e:
            record_trace("5. OPA Policy", "FAIL")
            return AuthorizationService._deny(db, request_data, "POLICY_EVALUATION_FAILED", str(e), start_time, trace, simulate)
        
        if not opa_decision.get("allowed", False):
            record_trace("5. OPA Policy", "FAIL")
            reason = opa_decision.get("reason", "POLICY_DENY")
            return AuthorizationService._deny(db, request_data, reason, "OPA policy denied request", start_time, trace, simulate)
        record_trace("5. OPA Policy", "PASS")

        # 4. Evaluate Approval Threshold
        if not skip_approval_check:
            try:
                approval_threshold = PermissionService.get_approval_threshold(
                    db, request_data["agent_id"], request_data["action"], request_data["resource_type"]
                )
            except Exception as e:
                record_trace("6. Approval", "FAIL")
                return AuthorizationService._deny(db, request_data, "INFRASTRUCTURE_FAILURE", f"Approval threshold unavailable: {str(e)}", start_time, trace, simulate)
                
            if approval_threshold is not None and request_data["amount"] > approval_threshold:
                record_trace("6. Approval", "PENDING")
                if not simulate:
                    ApprovalService.create_pending_approval(db, request_data)
                    AuditService.create_audit_event(
                        db=db,
                        event_type="AUTHORIZATION_DECISION",
                        agent_id=request_data["agent_id"],
                        action=request_data["action"],
                        resource_type=request_data["resource_type"],
                        resource_id=request_data["resource_id"],
                        amount=request_data["amount"],
                        currency=request_data["currency"],
                        decision="PENDING_APPROVAL",
                        reason="EXCEEDS_APPROVAL_THRESHOLD",
                        request_id=request_data["request_id"],
                        latency_ms=int((time.time() - start_time) * 1000)
                    )
                    db.commit()
                return {"decision": "PENDING_APPROVAL", "reason": "EXCEEDS_APPROVAL_THRESHOLD", "trace": trace}
        record_trace("6. Approval", "PASS" if skip_approval_check else "NOT EVALUATED")

        # 5. Budget Check
        try:
            success = BudgetService.reserve_budgets(db, request_data["agent_id"], request_data["amount"], simulate)
            if not success:
                record_trace("7. Budget", "FAIL")
                return AuthorizationService._deny(db, request_data, "BUDGET_EXCEEDED", "Budget exceeded", start_time, trace, simulate)
        except Exception as e:
            record_trace("7. Budget", "FAIL")
            return AuthorizationService._deny(db, request_data, "BUDGET_EVALUATION_FAILED", str(e), start_time, trace, simulate)
        
        record_trace("7. Budget", "PASS")
        record_trace("8. Final Decision", "ALLOW")

        # 6. Allow
        auth_id = f"auth_{int(time.time()*1000)}"
        if not simulate:
            AuditService.create_audit_event(
                db=db,
                event_type="AUTHORIZATION_DECISION",
                agent_id=request_data["agent_id"],
                action=request_data["action"],
                resource_type=request_data["resource_type"],
                resource_id=request_data["resource_id"],
                amount=request_data["amount"],
                currency=request_data["currency"],
                decision="ALLOW",
                reason="POLICY_MATCH",
                request_id=request_data.get("request_id"),
                authorization_id=auth_id,
                latency_ms=int((time.time() - start_time) * 1000)
            )
            db.commit()

        return {
            "decision": "ALLOW",
            "authorization_id": auth_id,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
            "trace": trace
        }

    @staticmethod
    def _deny(db: Session, request_data: dict, reason: str, details: str, start_time: float, trace: list, simulate: bool) -> dict:
        trace.append({"step": "8. Final Decision", "status": "DENY"})
        if not simulate:
            AuditService.create_audit_event(
                db=db,
                event_type="AUTHORIZATION_DECISION",
                agent_id=request_data["agent_id"],
                action=request_data["action"],
                resource_type=request_data["resource_type"],
                resource_id=request_data["resource_id"],
                amount=request_data["amount"],
                currency=request_data["currency"],
                decision="DENY",
                reason=reason,
                request_id=request_data.get("request_id"),
                latency_ms=int((time.time() - start_time) * 1000)
            )
            db.commit()
        return {"decision": "DENY", "reason": reason, "trace": trace}
