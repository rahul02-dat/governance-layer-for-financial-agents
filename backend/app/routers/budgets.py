from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import RequireRole

router = APIRouter(
    prefix="/budgets",
    tags=["Budgets"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

@router.get("/", response_model=List[schemas.BudgetResponse])
def get_budgets(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Budget).offset(skip).limit(limit).all()

@router.post("/", response_model=schemas.BudgetResponse, status_code=status.HTTP_201_CREATED)
def create_budget(budget: schemas.BudgetCreate, db: Session = Depends(get_db)):
    db_budget = models.Budget(**budget.model_dump())
    db.add(db_budget)
    
    audit = models.AuditEvent(
        event_type="BUDGET_CREATED",
        action="CREATE_BUDGET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST"
    )
    db.add(audit)
    
    db.commit()
    db.refresh(db_budget)
    return db_budget

@router.patch("/{budget_id}", response_model=schemas.BudgetResponse)
def update_budget(budget_id: str, budget_update: schemas.BudgetUpdate, db: Session = Depends(get_db)):
    db_budget = db.query(models.Budget).filter(models.Budget.id == budget_id).first()
    if not db_budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    update_data = budget_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_budget, key, value)
        
    audit = models.AuditEvent(
        event_type="BUDGET_UPDATED",
        action="UPDATE_BUDGET",
        decision="ALLOW",
        reason="OPERATOR_REQUEST"
    )
    db.add(audit)
    
    db.commit()
    db.refresh(db_budget)
    return db_budget

@router.get("/{budget_id}/usage")
def get_budget_usage(budget_id: str, db: Session = Depends(get_db)):
    db_budget = db.query(models.Budget).filter(models.Budget.id == budget_id).first()
    if not db_budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    
    # TODO: Fetch actual usage from Redis
    
    return {
        "budget_id": budget_id,
        "limit_amount": db_budget.limit_amount,
        "currency": db_budget.currency,
        "current_usage": 0.0,
        "remaining": db_budget.limit_amount
    }
