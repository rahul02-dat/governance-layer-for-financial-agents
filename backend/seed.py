import httpx
import time
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.auth import create_access_token

BASE_URL = "http://localhost:8000"

def seed():
    print("Waiting for API...")
    time.sleep(2)
    
    admin_token = create_access_token({"sub": "admin-1", "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    print(f"Generated Admin Token (use this in frontend): {admin_token}")
    
    # 1. Create Fleet Budget
    print("Creating Fleet Budget...")
    httpx.post(f"{BASE_URL}/budgets/", json={
        "scope": "FLEET_DAILY",
        "limit_amount": 10000000,
        "currency": "INR"
    }, headers=headers)
    
    # 2. Create Agents
    agents = [
        {"id": "payment-agent-001", "name": "Payment Reconciliation Agent", "owner": "finance-ops", "risk_tier": "HIGH"},
        {"id": "reconciliation-agent-002", "name": "Reconciliation Agent", "owner": "finance-ops", "risk_tier": "MEDIUM"},
        {"id": "reporting-agent-003", "name": "Reporting Agent", "owner": "data-ops", "risk_tier": "LOW"},
    ]
    for idx, agent in enumerate(agents):
        print(f"Creating Agent: {agent['name']}")
        res = httpx.post(f"{BASE_URL}/agents/", json={
            "name": agent["name"],
            "owner": agent["owner"],
            "risk_tier": agent["risk_tier"]
        }, headers=headers)
        if res.status_code == 201:
            agent_id = res.json()["id"]
            
            # Create permissions for the agent
            if idx == 0:
                httpx.post(f"{BASE_URL}/agents/{agent_id}/permissions", json={
                    "action": "CREATE_PAYMENT",
                    "resource_type": "corporate_account",
                    "allowed_accounts": ["ACC-001", "ACC-002"],
                    "allowed_currencies": ["INR"],
                    "max_amount": 50000,
                    "requires_approval_above": 10000.0,
                    "enabled": True
                }, headers=headers)
                
                agent_token = create_access_token({"sub": agent_id, "role": "AGENT"})
                print(f"Generated Agent Token for {agent['name']}: {agent_token}")
            elif idx == 1:
                httpx.post(f"{BASE_URL}/agents/{agent_id}/permissions", json={
                    "action": "READ_ACCOUNT",
                    "resource_type": "corporate_account",
                    "enabled": True
                }, headers=headers)
            elif idx == 2:
                httpx.post(f"{BASE_URL}/agents/{agent_id}/permissions", json={
                    "action": "GENERATE_REPORT",
                    "resource_type": "financial_data",
                    "enabled": True
                }, headers=headers)

    # 3. Create Default Policies
    print("Creating Governance Policies...")
    policies = [
        {
            "name": "Single Transaction Cap Policy",
            "rego_content": "package agentguard.authz\n\ndefault allow = false\n\nallow {\n    input.amount <= 50000\n    input.currency == \"INR\"\n}",
            "enabled": True
        },
        {
            "name": "Dual-Control Threshold Policy",
            "rego_content": "package agentguard.authz\n\nrequires_approval {\n    input.amount > 10000\n}",
            "enabled": True
        }
    ]
    for p in policies:
        httpx.post(f"{BASE_URL}/policies", json=p, headers=headers)

    print("Seeding complete.")

if __name__ == "__main__":
    seed()
