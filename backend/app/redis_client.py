import redis
from decimal import Decimal
from app.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)

# Lua script for atomic multi-budget decrement
# KEYS: List of Budget keys
# ARGV: [requested_1, ..., requested_N, limit_1, ..., limit_N]
# Returns: 1 if successful, 0 if any budget is exceeded
BUDGET_CONSUME_SCRIPT = """
-- First pass: initialize missing budgets and check capacity
for i, key in ipairs(KEYS) do
    local requested = tonumber(ARGV[i])
    local limit = tonumber(ARGV[i + #KEYS])
    
    local current = redis.call('GET', key)
    if not current then
        if limit >= 0 then
            redis.call('SET', key, limit)
            current = limit
        end
    end
    
    if current then
        local remaining = tonumber(current)
        if remaining < requested then
            return 0 -- Budget exceeded
        end
    else
        return 0 -- Uninitialized without limit -> fail closed
    end
end
-- Second pass: decrement all budgets
for i, key in ipairs(KEYS) do
    local requested = tonumber(ARGV[i])
    redis.call('DECRBY', key, requested)
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

def initialize_budget(key: str, amount: Decimal):
    """
    Initialize a budget in Redis using integer minor units (paise/cents).
    """
    amount_cents = int(Decimal(str(amount)) * 100)
    redis_client.set(key, amount_cents)

def reserve_budgets(budgets: dict) -> bool:
    """
    budgets expected format:
    { "key1": {"request": Decimal, "limit": Decimal}, ... }
    or
    { "key1": Decimal | int | float, ... }
    """
    if not budgets:
        return True
    
    keys = list(budgets.keys())
    requests = []
    limits = []
    
    for key in keys:
        val = budgets[key]
        if isinstance(val, dict):
            req = int(Decimal(str(val["request"])) * 100)
            lim = int(Decimal(str(val["limit"])) * 100) if val.get("limit") is not None else -1
        else:
            req = int(Decimal(str(val)) * 100)
            lim = -1
        requests.append(req)
        limits.append(lim)
        
    args = requests + limits
    try:
        res = budget_consume(keys=keys, args=args)
        return res == 1
    except redis.RedisError:
        # Fail closed
        return False

def check_budgets(budgets: dict) -> bool:
    """
    budgets expected format:
    { "key1": {"request": Decimal, "limit": Decimal}, ... }
    or
    { "key1": Decimal | int | float, ... }
    """
    if not budgets:
        return True
    
    keys = list(budgets.keys())
    
    try:
        current_values = redis_client.mget(keys)
        for i, val in enumerate(current_values):
            item = budgets[keys[i]]
            if isinstance(item, dict):
                limit_cents = int(Decimal(str(item["limit"])) * 100) if item.get("limit") is not None else 0
                request_cents = int(Decimal(str(item["request"])) * 100)
            else:
                limit_cents = 0
                request_cents = int(Decimal(str(item)) * 100)
            
            # If not initialized, assume limit
            available = int(val) if val is not None else limit_cents
            if available < request_cents:
                return False
        return True
    except redis.RedisError:
        # Fail closed
        return False

