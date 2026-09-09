from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from decimal import Decimal
from app.database import get_db
from app.auth import RequireRole
from app.services.authorization import AuthorizationService

router = APIRouter(
    prefix="/authorize",
    tags=["Authorization"]
)

class AuthorizeRequest(BaseModel):
    agent_id: str
    action: str
    resource_type: str
    resource_id: str
    amount: Decimal
    currency: str
    request_id: str
    simulate: bool = False

class AuthorizeResponse(BaseModel):
    decision: str
    authorization_id: str = None
    policy_id: str = None
    remaining_budget: Decimal = None
    expires_at: str = None
    reason: str = None
    trace: list[dict] = None

@router.post("", response_model=AuthorizeResponse)
def authorize_action(request: AuthorizeRequest, db: Session = Depends(get_db), current_user: dict = Depends(RequireRole(["AGENT", "ADMIN", "OPERATOR"]))):
    try:
        result = AuthorizationService.evaluate_request(db, request.model_dump(), request.simulate)
        return AuthorizeResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
