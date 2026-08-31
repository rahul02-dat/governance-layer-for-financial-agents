import redis
from app.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

# Lua script for atomic budget decrement
# KEYS[1]: Budget key
# ARGV[1]: Requested amount
# Returns: 1 if successful, 0 if budget exceeded
BUDGET_CONSUME_SCRIPT = """
local current = redis.call('GET', KEYS[1])
if not current then
    return 1 -- No budget limit set in redis, assuming allowed (or handled by DB sync)
end
local remaining = tonumber(current)
local requested = tonumber(ARGV[1])
if remaining >= requested then
    redis.call('DECRBY', KEYS[1], requested)
    return 1
else
    return 0
end
"""

budget_consume = redis_client.register_script(BUDGET_CONSUME_SCRIPT)

def set_fleet_status(status: str):
    redis_client.set("agentguard:fleet:status", status)

def get_fleet_status() -> str:
    return redis_client.get("agentguard:fleet:status") or "ACTIVE"

def set_agent_status(agent_id: str, status: str):
    redis_client.set(f"agentguard:agent:{agent_id}:status", status)

def get_agent_status(agent_id: str) -> str:
    return redis_client.get(f"agentguard:agent:{agent_id}:status")

def reserve_budget(budget_key: str, amount: float) -> bool:
    # Lua DECRBY works with integers, so we might need to multiply by 100 for cents
    # For MVP, assuming integer amounts
    res = budget_consume(keys=[budget_key], args=[int(amount)])
    return res == 1

def initialize_budget(budget_key: str, amount: float):
    redis_client.set(budget_key, int(amount))
