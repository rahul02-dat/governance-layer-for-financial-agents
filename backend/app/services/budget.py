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
            fleet_budget = db.query(models.Budget).filter(models.Budget.scope == "FLEET_DAILY").first()
            if fleet_budget:
                budgets_to_reserve[fleet_budget_key] = {
                    "request": amount,
                    "limit": fleet_budget.limit_amount
                }
                
            agent_budget = db.query(models.Budget).filter(
                models.Budget.scope == "AGENT_DAILY",
                models.Budget.target_id == agent_id
            ).first()
            if agent_budget:
                budgets_to_reserve[agent_budget_key] = {
                    "request": amount,
                    "limit": agent_budget.limit_amount
                }
                
            if not budgets_to_reserve:
                # No active budgets restricting this
                return True
                
            if simulate:
                return redis_client.check_budgets(budgets_to_reserve)
            else:
                return redis_client.reserve_budgets(budgets_to_reserve)

        except Exception as e:
            # Fail closed on DB or Redis error
            raise RuntimeError(f"BUDGET_EVALUATION_FAILED: {str(e)}")
