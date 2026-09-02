from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app import models, schemas
from app.auth import RequireRole

router = APIRouter(
    prefix="/policies",
    tags=["Policies"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

@router.get("/", response_model=List[schemas.PolicyResponse])
def get_policies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(models.Policy).offset(skip).limit(limit).all()

@router.get("/{policy_id}", response_model=schemas.PolicyResponse)
def get_policy(policy_id: str, db: Session = Depends(get_db)):
    policy = db.query(models.Policy).filter(models.Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy

@router.post("/", response_model=schemas.PolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(policy: schemas.PolicyCreate, db: Session = Depends(get_db)):
    db_policy = models.Policy(**policy.model_dump())
    db.add(db_policy)
    db.commit()
    db.refresh(db_policy)
    
    # TODO: Sync to OPA
    
    return db_policy

@router.patch("/{policy_id}", response_model=schemas.PolicyResponse)
def update_policy(policy_id: str, policy_update: schemas.PolicyUpdate, db: Session = Depends(get_db)):
    db_policy = db.query(models.Policy).filter(models.Policy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    update_data = policy_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_policy, key, value)
        
    db.commit()
    db.refresh(db_policy)
    
    # TODO: Sync to OPA
    
    return db_policy
