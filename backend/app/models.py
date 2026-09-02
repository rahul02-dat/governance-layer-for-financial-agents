from sqlalchemy import Column, String, JSON, Integer, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import uuid

def generate_uuid():
    return str(uuid.uuid4())

class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    owner = Column(String, nullable=False)
    risk_tier = Column(String, nullable=False)
    status = Column(String, nullable=False, default="ACTIVE")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    permissions = relationship("Permission", back_populates="agent", cascade="all, delete-orphan")

class Permission(Base):
    __tablename__ = "agent_permissions"

    id = Column(String, primary_key=True, default=generate_uuid)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    allowed_accounts = Column(JSON, nullable=True)
    allowed_currencies = Column(JSON, nullable=True)
    max_amount = Column(Numeric(18, 2), nullable=True)
    requires_approval_above = Column(Numeric(18, 2), nullable=True)
    enabled = Column(Boolean, default=True)

    agent = relationship("Agent", back_populates="permissions")

class Policy(Base):
    __tablename__ = "policies"

    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, nullable=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    versions = relationship("PolicyVersion", back_populates="policy", cascade="all, delete-orphan")

class PolicyVersion(Base):
    __tablename__ = "policy_versions"

    id = Column(String, primary_key=True, default=generate_uuid)
    policy_id = Column(String, ForeignKey("policies.id"), nullable=False)
    version_number = Column(Integer, nullable=False)
    rego_content = Column(String, nullable=False)
    content_hash = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    policy = relationship("Policy", back_populates="versions")

class Budget(Base):
    __tablename__ = "budgets"

    id = Column(String, primary_key=True, default=generate_uuid)
    scope = Column(String, nullable=False) # e.g., "AGENT_DAILY", "FLEET_DAILY"
    target_id = Column(String, nullable=True) # e.g., agent_id or null for fleet
    limit_amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String, nullable=False, default="INR")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(String, primary_key=True, default=generate_uuid)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    event_type = Column(String, nullable=False)
    agent_id = Column(String, nullable=True)
    action = Column(String, nullable=True)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    amount = Column(Numeric(18, 2), nullable=True)
    currency = Column(String, nullable=True)
    decision = Column(String, nullable=True)
    reason = Column(String, nullable=True)
    policy_id = Column(String, nullable=True)
    operator_id = Column(String, nullable=True)
    request_id = Column(String, nullable=True)
    authorization_id = Column(String, nullable=True)
    policy_version = Column(Integer, nullable=True)
    latency_ms = Column(Integer, nullable=True)
    previous_hash = Column(String, nullable=True)
    event_hash = Column(String, nullable=True)

class ApprovalRequest(Base):
    __tablename__ = "approval_requests"

    id = Column(String, primary_key=True, default=generate_uuid)
    agent_id = Column(String, ForeignKey("agents.id"), nullable=False)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String, nullable=False)
    request_id = Column(String, nullable=True)
    status = Column(String, default="PENDING") # PENDING, APPROVED, DENIED
    policy_id = Column(String, nullable=True)
    operator_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    agent = relationship("Agent")
