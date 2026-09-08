from decimal import Decimal
from sqlalchemy.orm import Session
from app import models, redis_client

class BudgetService:
    @staticmethod
    def reserve_budgets(db: Session, agent_id: str, amount: Decimal, simulate: bool = False) -> bool:
        fleet_budget_key = "agentguard:budget:fleet:daily"
        agent_budget_key = f"agentguard:budget:agent:{agent_id}:daily"
        
        budgets_to_reserve = {}
        
        try:
            # Check and initialize fleet budget
            if redis_client.redis_client.get(fleet_budget_key) is None:
                fleet_budget = db.query(models.Budget).filter(models.Budget.scope == "FLEET_DAILY").first()
                if fleet_budget:
                    redis_client.initialize_budget(fleet_budget_key, fleet_budget.limit_amount)
            if redis_client.redis_client.exists(fleet_budget_key):
                budgets_to_reserve[fleet_budget_key] = amount
                
            # Check and initialize agent budget
            if redis_client.redis_client.get(agent_budget_key) is None:
                agent_budget = db.query(models.Budget).filter(
                    models.Budget.scope == "AGENT_DAILY",
                    models.Budget.target_id == agent_id
                ).first()
                if agent_budget:
                    redis_client.initialize_budget(agent_budget_key, agent_budget.limit_amount)
            if redis_client.redis_client.exists(agent_budget_key):
                budgets_to_reserve[agent_budget_key] = amount
                
            if not budgets_to_reserve:
                # No active budgets restricting this
                return True
                
            if simulate:
                return redis_client.check_budgets(budgets_to_reserve)
            else:
                return redis_client.reserve_budgets(budgets_to_reserve)

        except Exception as e:
            # Fail closed on Redis error
            raise RuntimeError(f"BUDGET_EVALUATION_FAILED: {str(e)}")
