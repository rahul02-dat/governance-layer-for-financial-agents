from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import hashlib
from app.database import get_db
from app import models, schemas
from app.auth import RequireRole

router = APIRouter(
    prefix="/policies",
    tags=["Policies"],
    dependencies=[Depends(RequireRole(["ADMIN", "OPERATOR"]))]
)

def _to_policy_response(policy: models.Policy) -> schemas.PolicyResponse:
    sorted_versions = sorted(policy.versions, key=lambda v: v.version_number) if policy.versions else []
    latest_version = sorted_versions[-1] if sorted_versions else None
    
    return schemas.PolicyResponse(
        id=policy.id,
        name=policy.name,
        enabled=policy.enabled,
        rego_content=latest_version.rego_content if latest_version else None,
        version_number=latest_version.version_number if latest_version else None,
        content_hash=latest_version.content_hash if latest_version else None,
        created_at=policy.created_at,
        updated_at=policy.updated_at,
        versions=[schemas.PolicyVersionResponse.model_validate(v) for v in sorted_versions]
    )

@router.get("", response_model=List[schemas.PolicyResponse])
def get_policies(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    policies = db.query(models.Policy).offset(skip).limit(limit).all()
    return [_to_policy_response(p) for p in policies]

@router.get("/{policy_id}", response_model=schemas.PolicyResponse)
def get_policy(policy_id: str, db: Session = Depends(get_db)):
    policy = db.query(models.Policy).filter(models.Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return _to_policy_response(policy)

@router.post("", response_model=schemas.PolicyResponse, status_code=status.HTTP_201_CREATED)
def create_policy(policy: schemas.PolicyCreate, db: Session = Depends(get_db)):
    db_policy = models.Policy(name=policy.name, enabled=policy.enabled)
    db.add(db_policy)
    db.flush()
    
    content_hash = hashlib.sha256(policy.rego_content.encode("utf-8")).hexdigest()
    pv = models.PolicyVersion(
        policy_id=db_policy.id,
        version_number=1,
        rego_content=policy.rego_content,
        content_hash=content_hash
    )
    db.add(pv)
    db.commit()
    db.refresh(db_policy)
    
    return _to_policy_response(db_policy)

@router.patch("/{policy_id}", response_model=schemas.PolicyResponse)
def update_policy(policy_id: str, policy_update: schemas.PolicyUpdate, db: Session = Depends(get_db)):
    db_policy = db.query(models.Policy).filter(models.Policy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    
    if policy_update.name is not None:
        db_policy.name = policy_update.name
    if policy_update.enabled is not None:
        db_policy.enabled = policy_update.enabled
        
    if policy_update.rego_content is not None:
        max_v = max([v.version_number for v in db_policy.versions], default=0)
        content_hash = hashlib.sha256(policy_update.rego_content.encode("utf-8")).hexdigest()
        pv = models.PolicyVersion(
            policy_id=db_policy.id,
            version_number=max_v + 1,
            rego_content=policy_update.rego_content,
            content_hash=content_hash
        )
        db.add(pv)
        
    db.commit()
    db.refresh(db_policy)
    
    return _to_policy_response(db_policy)
