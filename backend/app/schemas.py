from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any
from datetime import datetime

class PermissionBase(BaseModel):
    action: str
    resource_type: str
    allowed_accounts: Optional[List[str]] = None
    allowed_currencies: Optional[List[str]] = None
    max_amount: Optional[float] = None
    requires_approval_above: Optional[float] = None
    enabled: bool = True

class PermissionCreate(PermissionBase):
    pass

class PermissionResponse(PermissionBase):
    id: str
    agent_id: str

    model_config = ConfigDict(from_attributes=True)

class AgentBase(BaseModel):
    name: str
    owner: str
    risk_tier: str
    status: str = "ACTIVE"

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    owner: Optional[str] = None
    risk_tier: Optional[str] = None
    status: Optional[str] = None

class AgentResponse(AgentBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime]
    permissions: List[PermissionResponse] = []

    model_config = ConfigDict(from_attributes=True)

class PolicyBase(BaseModel):
    name: str
    rego_content: str
    enabled: bool = True

class PolicyCreate(PolicyBase):
    pass

class PolicyUpdate(BaseModel):
    name: Optional[str] = None
    rego_content: Optional[str] = None
    enabled: Optional[bool] = None

class PolicyResponse(PolicyBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)

class BudgetBase(BaseModel):
    scope: str
    target_id: Optional[str] = None
    limit_amount: float
    currency: str = "INR"

class BudgetCreate(BudgetBase):
    pass

class BudgetUpdate(BaseModel):
    limit_amount: Optional[float] = None
    currency: Optional[str] = None

class BudgetResponse(BudgetBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)
