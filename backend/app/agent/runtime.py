import httpx
import json
import uuid
import time
import math
from typing import Dict, Any
from app.config import settings
from app.agent.llm import LLMProvider, OpenAIProvider
from app.agent.tools import AGENT_TOOLS
from decimal import Decimal

SUPPORTED_CURRENCIES = {"INR", "USD", "EUR", "GBP"}

def validate_transfer_args(args: dict) -> tuple[bool, str]:
    required_fields = ["source_account", "target_account", "amount", "currency", "reason"]
    for field in required_fields:
        if field not in args or args[field] is None:
            return False, f"Missing required field: {field}"
            
    source = str(args["source_account"]).strip()
    target = str(args["target_account"]).strip()
    
    if not source or not target:
        return False, "Source and target accounts must be non-empty"
    if source == target:
        return False, "Source and target accounts cannot be identical"
        
    try:
        amount = Decimal(str(args["amount"]))
    except Exception:
        return False, "Amount must be a valid number"
        
    if math.isnan(float(amount)) or math.isinf(float(amount)) or amount <= Decimal("0"):
        return False, "Amount must be positive and non-zero"
        
    currency = str(args["currency"]).strip().upper()
    if currency not in SUPPORTED_CURRENCIES:
        return False, f"Unsupported currency: '{currency}'"
        
    reason = str(args["reason"]).strip()
    if not reason:
        return False, "Business reason must be provided"
        
    return True, ""

class ExecutionGateway:
    """
    Simulates the actual execution layer (e.g., Core Banking System).
    It independently calls AgentGuard to verify the authorization_id before executing.
    """
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip('/')

    def execute_transfer(self, source_account: str, target_account: str, amount: Decimal, currency: str, auth_id: str, agent_id: str) -> Dict[str, Any]:
        print(f"[ExecutionGateway] Verifying auth_id {auth_id} independently...")
        
        verify_payload = {
            "authorization_id": auth_id,
            "agent_id": agent_id,
            "action": "CREATE_PAYMENT",
            "resource_type": "corporate_account",
            "resource_id": source_account,
            "amount": float(amount),
            "currency": currency,
            "consume": True
        }
        
        try:
            resp = httpx.post(f"{self.base_url}/execution/verify", json=verify_payload, timeout=5.0)
            resp.raise_for_status()
            print(f"[ExecutionGateway] Verification SUCCESS. Executing {amount} {currency} from {source_account} to {target_account}")
        except httpx.HTTPStatusError as e:
            error_detail = e.response.json().get("detail", str(e))
            print(f"[ExecutionGateway] Verification FAILED: {error_detail}")
            return {
                "status": "FAILED",
                "message": f"Execution rejected by gateway: {error_detail}"
            }
        except httpx.RequestError as e:
            return {
                "status": "FAILED",
                "message": f"Execution gateway unreachable: {str(e)}"
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
        base_api_url = f"{settings.agentguard_url.rstrip('/')}/api"
        self.api_url = base_api_url
        self.execution_gateway = ExecutionGateway(base_api_url)
        
    def run(self, objective: str) -> Dict[str, Any]:
        messages = [{"role": "user", "content": objective}]
        
        print(f"[AgentRuntime] Starting agent execution with objective: '{objective}'")
        
        try:
            message = self.llm.chat_completion(messages=messages, tools=AGENT_TOOLS)
        except Exception as e:
            return {"status": "ERROR", "message": f"LLM provider failed: {str(e)}"}
        
        if hasattr(message, "tool_calls") and message.tool_calls:
            for tool_call in message.tool_calls:
                if tool_call.function.name == "transfer_funds":
                    try:
                        args = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        return {"status": "REJECTED", "message": "Malformed tool call arguments"}
                        
                    print(f"[AgentRuntime] LLM requested transfer_funds: {args}")
                    
                    # Validate tool arguments before contacting AgentGuard
                    is_valid, err_msg = validate_transfer_args(args)
                    if not is_valid:
                        return {"status": "REJECTED", "message": f"Invalid tool arguments: {err_msg}"}
                    
                    # 1. Request Authorization from AgentGuard
                    auth_request = {
                        "agent_id": self.agent_id,
                        "action": "CREATE_PAYMENT",
                        "resource_type": "corporate_account",
                        "resource_id": args["source_account"],
                        "amount": float(args["amount"]),
                        "currency": args["currency"].upper(),
                        "request_id": f"req_{uuid.uuid4().hex[:12]}",
                        "simulate": False
                    }
                    
                    headers = {"Authorization": f"Bearer {self.agent_token}"}
                    
                    print(f"[AgentRuntime] Sending authorization request to AgentGuard...")
                    try:
                        resp = httpx.post(f"{self.api_url}/authorize", json=auth_request, headers=headers, timeout=5.0)
                        if resp.status_code == 409:
                            return {"status": "CONFLICT", "message": "Idempotency conflict"}
                        resp.raise_for_status()
                        auth_result = resp.json()
                    except httpx.HTTPStatusError as e:
                        detail = e.response.json().get("detail", str(e))
                        return {"status": "DENIED", "message": detail}
                    except httpx.RequestError as e:
                        return {"status": "NETWORK_FAILURE", "message": f"AgentGuard unavailable: {str(e)}"}
                    
                    print(f"[AgentRuntime] AgentGuard Decision: {auth_result['decision']} (Reason: {auth_result['reason']})")
                    
                    if auth_result["decision"] == "ALLOW":
                        # 2. Call ExecutionGateway
                        auth_id = auth_result["authorization_id"]
                        print(f"[AgentRuntime] Proceeding to ExecutionGateway with auth_id {auth_id}")
                        result = self.execution_gateway.execute_transfer(
                            args["source_account"],
                            args["target_account"],
                            Decimal(str(args["amount"])),
                            args["currency"].upper(),
                            auth_id,
                            self.agent_id
                        )
                        if result.get("status") == "SUCCESS":
                            return {"status": "EXECUTED", "authorization_id": auth_id, "execution_result": result}
                        else:
                            return {"status": "EXECUTION_FAILED", "authorization_id": auth_id, "error": result.get("message")}
                    
                    elif auth_result["decision"] == "PENDING_APPROVAL":
                        return {"status": "PENDING_APPROVAL", "message": "The transaction requires human approval."}
                    
                    else:
                        return {"status": "DENIED", "message": auth_result.get("reason", "Action denied")}
        
        return {"status": "ERROR", "message": "No tool call generated by LLM"}

