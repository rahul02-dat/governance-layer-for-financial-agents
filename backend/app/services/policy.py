import httpx
from app.config import settings

class PolicyService:
    @staticmethod
    def evaluate_authorization(opa_input: dict) -> dict:
        """
        Calls OPA and returns the decision.
        Raises an exception if OPA is unavailable or errors out.
        """
        try:
            opa_resp = httpx.post(
                f"{settings.opa_url}/v1/data/agentguard/authz/decision", 
                json={"input": opa_input},
                timeout=2.0
            )
            opa_resp.raise_for_status()
            return opa_resp.json().get("result", {})
        except Exception as e:
            # Re-raise to fail closed
            raise RuntimeError(f"POLICY_EVALUATION_FAILED: {str(e)}")
