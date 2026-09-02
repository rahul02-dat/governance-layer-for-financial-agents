import redis
from decimal import Decimal
from app.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

# Lua script for atomic multi-budget decrement
# KEYS: List of Budget keys
# ARGV: List of Requested amounts (corresponding to KEYS)
# Returns: 1 if successful, 0 if any budget is exceeded
BUDGET_CONSUME_SCRIPT = """
-- First pass: check if all budgets have enough capacity
for i, key in ipairs(KEYS) do
    local current = redis.call('GET', key)
    if current then
        local remaining = tonumber(current)
        local requested = tonumber(ARGV[i])
        if remaining < requested then
            return 0 -- Budget exceeded
        end
    end
end
-- Second pass: decrement all budgets
for i, key in ipairs(KEYS) do
    local current = redis.call('GET', key)
    if current then
        local requested = tonumber(ARGV[i])
        redis.call('DECRBY', key, requested)
    end
end
return 1
"""

budget_consume = redis_client.register_script(BUDGET_CONSUME_SCRIPT)

def set_fleet_status(status: str):
    redis_client.set("agentguard:fleet:status", status)

def get_fleet_status() -> str:
    try:
        return redis_client.get("agentguard:fleet:status") or "ACTIVE"
    except redis.RedisError:
        # Fail closed if redis is unavailable
        return "HALTED"

def set_agent_status(agent_id: str, status: str):
    redis_client.set(f"agentguard:agent:{agent_id}:status", status)

def get_agent_status(agent_id: str) -> str:
    try:
        return redis_client.get(f"agentguard:agent:{agent_id}:status")
    except redis.RedisError:
        # Fail closed
        return "REVOKED"

def reserve_budgets(budgets: dict[str, Decimal]) -> bool:
    if not budgets:
        return True
    
    keys = list(budgets.keys())
    args = [int(amount * 100) for amount in budgets.values()]
    
    try:
        res = budget_consume(keys=keys, args=args)
        return res == 1
    except redis.RedisError:
        # Fail closed
        return False

def check_budgets(budgets: dict[str, Decimal]) -> bool:
    if not budgets:
        return True
    
    keys = list(budgets.keys())
    args = [int(amount * 100) for amount in budgets.values()]
    
    try:
        current_values = redis_client.mget(keys)
        for i, val in enumerate(current_values):
            if val is not None and int(val) < args[i]:
                return False
        return True
    except redis.RedisError:
        # Fail closed
        return False

def initialize_budget(budget_key: str, amount: Decimal):
    redis_client.set(budget_key, int(amount * 100))
