import httpx
import json
import uuid
import time
from typing import Dict, Any
from app.config import settings
from app.agent.llm import LLMProvider, OpenAIProvider
from app.agent.tools import AGENT_TOOLS
from decimal import Decimal

class ExecutionGateway:
    """
    Simulates the actual execution layer (e.g., Core Banking System).
    It independently calls AgentGuard to verify the authorization_id before executing.
    """
    def __init__(self, base_url: str):
        self.base_url = base_url

    def execute_transfer(self, source_account: str, target_account: str, amount: Decimal, currency: str, auth_id: str, agent_id: str) -> Dict[str, Any]:
        print(f"[ExecutionGateway] Verifying auth_id {auth_id} independently...")
        
        verify_payload = {
            "authorization_id": auth_id,
            "agent_id": agent_id,
            "action": "CREATE_PAYMENT",
            "resource_type": "corporate_account",
            "resource_id": source_account,
            "amount": float(amount),
            "currency": currency
        }
        
        try:
            resp = httpx.post(f"{self.base_url}/execution/verify", json=verify_payload)
            resp.raise_for_status()
            print(f"[ExecutionGateway] Verification SUCCESS. Executing {amount} {currency} from {source_account} to {target_account}")
        except httpx.HTTPStatusError as e:
            error_detail = e.response.json().get("detail", str(e))
            print(f"[ExecutionGateway] Verification FAILED: {error_detail}")
            return {
                "status": "FAILED",
                "message": f"Execution rejected by gateway: {error_detail}"
            }
            
        return {
            "status": "SUCCESS",
            "transaction_id": f"txn_{int(time.time())}",
            "message": "Transfer executed successfully"
        }

class AgentRuntime:
    def __init__(self, agent_id: str, agent_token: str):
        self.agent_id = agent_id
        self.agent_token = agent_token
        self.llm = OpenAIProvider()
        self.execution_gateway = ExecutionGateway("http://localhost:8000")
        
    def run(self, objective: str) -> Dict[str, Any]:
        messages = [{"role": "user", "content": objective}]
        
        print(f"[AgentRuntime] Starting agent execution with objective: '{objective}'")
        
        message = self.llm.chat_completion(messages=messages, tools=AGENT_TOOLS)
        
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                if tool_call.function.name == "transfer_funds":
                    args = json.loads(tool_call.function.arguments)
                    print(f"[AgentRuntime] LLM requested transfer_funds: {args}")
                    
                    # 1. Request Authorization from AgentGuard
                    auth_request = {
                        "agent_id": self.agent_id,
                        "action": "CREATE_PAYMENT",
                        "resource_type": "corporate_account",
                        "resource_id": args["source_account"],
                        "amount": args["amount"],
                        "currency": args["currency"],
                        "request_id": f"req_{uuid.uuid4().hex[:8]}",
                        "simulate": False
                    }
                    
                    headers = {"Authorization": f"Bearer {self.agent_token}"}
                    
                    print(f"[AgentRuntime] Sending authorization request to AgentGuard...")
                    resp = httpx.post("http://localhost:8000/authorize/", json=auth_request, headers=headers)
                    if resp.status_code == 409:
                        return {"status": "CONFLICT", "message": "Idempotency conflict"}
                    
                    resp.raise_for_status()
                    auth_result = resp.json()
                    
                    print(f"[AgentRuntime] AgentGuard Decision: {auth_result['decision']} (Reason: {auth_result['reason']})")
                    
                    if auth_result["decision"] == "ALLOW":
                        # 2. Call ExecutionGateway
                        auth_id = auth_result["authorization_id"]
                        print(f"[AgentRuntime] Proceeding to ExecutionGateway with auth_id {auth_id}")
                        result = self.execution_gateway.execute_transfer(
                            args["source_account"],
                            args["target_account"],
                            Decimal(str(args["amount"])),
                            args["currency"],
                            auth_id,
                            self.agent_id
                        )
                        return {"status": "SUCCESS", "execution_result": result}
                    
                    elif auth_result["decision"] == "PENDING_APPROVAL":
                        return {"status": "PENDING_APPROVAL", "message": "The transaction requires human approval."}
                    
                    else:
                        return {"status": "DENIED", "message": auth_result["reason"]}
        
        return {"status": "ERROR", "message": "No tool call generated by LLM"}
