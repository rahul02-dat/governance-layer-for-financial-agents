import re
from sqlalchemy.orm import Session
from app.config import settings
from app.services.agent_state import AgentStateService
from app.services.audit import AuditService

# Explicit trusted mapping from agent_id to Kubernetes deployment name
WORKLOAD_MAPPING = {
    "payments-01": "payments-agent",
    "agent_123": "payments-agent",
}

DNS_LABEL_REGEX = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")

def resolve_workload_name(agent_id: str) -> str:
    if agent_id in WORKLOAD_MAPPING:
        return WORKLOAD_MAPPING[agent_id]
    
    # Safe normalization: convert to lowercase and underscores to hyphens
    normalized = agent_id.lower().replace("_", "-")
    if DNS_LABEL_REGEX.match(normalized):
        return normalized
    raise ValueError(f"Invalid agent_id for Kubernetes workload mapping: '{agent_id}'")

class QuarantineService:
    @staticmethod
    def quarantine_agent_detailed(db: Session, agent_id: str, operator_id: str = "system") -> dict:
        """
        Quarantines an agent and returns explicit execution telemetry for financial revocation
        and Kubernetes workload containment.
        """
        success = AgentStateService.update_agent_status(db, agent_id, "REVOKED")
        if not success:
            return {
                "agent_id": agent_id,
                "financial_revocation": "FAILED",
                "kubernetes_containment": "NOT_ATTEMPTED",
                "overall": "FAILED",
                "error": "Agent not found or status update failed"
            }

        AuditService.create_audit_event(
            db=db,
            event_type="AGENT_REVOKED",
            agent_id=agent_id,
            reason="Operator requested quarantine",
            operator_id=operator_id
        )
        
        k8s_success = False
        k8s_error = None
        try:
            deployment_name = resolve_workload_name(agent_id)
            QuarantineService._apply_kubernetes_containment(deployment_name)
            containment_reason = f"Kubernetes containment applied: deployment {deployment_name} scaled to 0"
            k8s_success = True
        except Exception as e:
            k8s_error = str(e)
            containment_reason = f"Kubernetes containment failed: {k8s_error}"
            
        AuditService.create_audit_event(
            db=db,
            event_type="AGENT_QUARANTINED",
            agent_id=agent_id,
            reason=containment_reason,
            operator_id=operator_id
        )

        db.commit()
        return {
            "agent_id": agent_id,
            "financial_revocation": "SUCCESS",
            "kubernetes_containment": "SUCCESS" if k8s_success else "FAILED",
            "overall": "SUCCESS" if k8s_success else "PARTIAL_SUCCESS",
            "error": k8s_error
        }

    @staticmethod
    def quarantine_agent(db: Session, agent_id: str, operator_id: str = "system") -> bool:
        """
        Quarantines an agent following the strict security sequence:
        1. AgentGuard updates local state to REVOKED immediately (authoritative financial control)
        2. Financial revocation audit event is persisted
        3. Kubernetes workload isolation is applied and verified
        4. If Kubernetes fails, financial revocation is NEVER rolled back.
        """
        result = QuarantineService.quarantine_agent_detailed(db, agent_id, operator_id)
        return result["financial_revocation"] == "SUCCESS"
        
    @staticmethod
    def _apply_kubernetes_containment(deployment_name: str):
        """
        Scales the targeted deployment to 0 replicas and verifies desired state.
        """
        from kubernetes import client, config
        
        # Load in-cluster config or fallback to kubeconfig for local dev
        try:
            config.load_incluster_config()
        except config.config_exception.ConfigException:
            config.load_kube_config()
            
        v1 = client.AppsV1Api()
        namespace = settings.k8s_namespace or "agentguard"
        
        # 1. Read existing scale
        scale = v1.read_namespaced_deployment_scale(name=deployment_name, namespace=namespace)
        
        # 2. Perform scale operation
        scale.spec.replicas = 0
        v1.replace_namespaced_deployment_scale(name=deployment_name, namespace=namespace, body=scale)
        
        # 3. Verify desired state
        updated_scale = v1.read_namespaced_deployment_scale(name=deployment_name, namespace=namespace)
        if getattr(updated_scale.spec, "replicas", None) != 0:
            raise RuntimeError(f"Containment verification failed: replicas={updated_scale.spec.replicas}, expected 0")

