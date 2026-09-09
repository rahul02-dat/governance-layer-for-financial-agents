from sqlalchemy.orm import Session
import httpx
from app.services.agent_state import AgentStateService
from app.services.audit import AuditService

class QuarantineService:
    @staticmethod
    def quarantine_agent(db: Session, agent_id: str, operator_id: str = "system") -> bool:
        """
        Quarantines an agent following the strict sequence:
        1. AgentGuard updates state to REVOKED
        2. Audit event persisted
        3. Kubernetes isolation via NetworkPolicy or scale to zero.
        """
        # Step 1: Revoke locally immediately
        success = AgentStateService.update_agent_status(db, agent_id, "REVOKED")
        if not success:
            return False

        # Step 2: Audit Event
        AuditService.create_audit_event(
            db=db,
            event_type="AGENT_REVOKED",
            agent_id=agent_id,
            reason="Operator requested quarantine",
            operator_id=operator_id
        )
        
        # Step 3: Kubernetes Containment
        # In a real cluster, this would use the kubernetes python client.
        # We will log the attempt here. In tests, we verify this is called.
        try:
            QuarantineService._apply_kubernetes_containment(agent_id)
            containment_reason = "Kubernetes containment applied"
        except Exception as e:
            containment_reason = f"Kubernetes containment failed: {str(e)}"
            
        AuditService.create_audit_event(
            db=db,
            event_type="AGENT_QUARANTINED",
            agent_id=agent_id,
            reason=containment_reason,
            operator_id=operator_id
        )

        db.commit()
        return True
        
    @staticmethod
    def _apply_kubernetes_containment(agent_id: str):
        """
        Applies Kubernetes network isolation or scales the deployment to 0.
        This isolates the workload infrastructure-side.
        """
        try:
            from kubernetes import client, config
            
            # Load in-cluster config or fallback to kubeconfig for local dev
            try:
                config.load_incluster_config()
            except config.config_exception.ConfigException:
                config.load_kube_config()
                
            v1 = client.AppsV1Api()
            namespace = "agentguard"
            
            # Assume deployment name is the agent_id
            deployment_name = agent_id
            
            print(f"[QuarantineService] Scaling deployment {deployment_name} in {namespace} to 0")
            
            # Read existing scale
            scale = v1.read_namespaced_deployment_scale(name=deployment_name, namespace=namespace)
            
            # Set scale to 0
            scale.spec.replicas = 0
            v1.replace_namespaced_deployment_scale(name=deployment_name, namespace=namespace, body=scale)
            
        except Exception as e:
            # Re-raise so QuarantineService logs the failure but still commits the DB transaction
            raise RuntimeError(f"Kubernetes API error: {str(e)}")
