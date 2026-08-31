# Agent.md — AgentGuard Financial Governance Platform

## 0. Mission and Non-Negotiable Instruction

You are an autonomous software engineering agent working on **AgentGuard**, a financial governance and safety control plane for fleets of autonomous AI agents.

**This file is authoritative project guidance. You MUST read and follow it before making any change.**

The agent MUST:

1. Treat this `Agent.md` as the governing engineering specification unless a higher-priority system/developer instruction explicitly overrides it.
2. Build the project **end to end**, not merely create scaffolding, mock screens, partial APIs, or disconnected proof-of-concepts.
3. Implement, integrate, test, document, and verify every feature required by this specification.
4. Never claim a feature is complete unless it is implemented, wired into the running system, and covered by meaningful tests.
5. Preserve the core financial safety properties: **least privilege, fail-closed enforcement, atomic budget controls, immediate revocation, fleet-wide emergency stop, and complete auditability**.
6. Prefer simple, auditable architecture over unnecessary infrastructure complexity.
7. Never bypass governance controls for convenience, demos, tests, or local development.
8. When requirements are ambiguous, choose the safer behavior and document the decision.
9. Keep the system runnable from a clean checkout using documented commands.
10. Before finishing, perform an end-to-end verification of the complete application and fix discovered issues.

---

# 1. Product Definition

AgentGuard is a governance layer that sits between autonomous agents and sensitive financial operations.

Agents do **not** receive direct authority to execute protected financial actions.

The intended execution path is:

```text
Autonomous Agent
      |
      v
Authentication / Agent Identity
      |
      v
Governance Gateway
      |
      +--> Agent Status / Revocation
      |
      +--> Fleet Emergency State
      |
      +--> Policy Evaluation
      |
      +--> Budget / Spend Enforcement
      |
      v
ALLOW or DENY
      |
      +--> Protected Financial Action
      |
      v
Immutable Audit Event
      |
      v
PostgreSQL / Monitoring
```

The governance gateway is the security boundary.

---

# 2. Primary Goals

The completed system MUST provide:

- Granular per-agent permissions.
- Configurable action/resource restrictions.
- Per-transaction spending limits.
- Hourly and daily spending limits.
- Fleet-wide spending limits.
- Atomic budget reservation under concurrency.
- Agent-level revocation.
- Fleet-wide emergency stop.
- Fast propagation of revocation and emergency-stop state.
- Fail-closed behavior for sensitive financial mutations.
- Complete audit logging of authorization decisions and governance changes.
- Operator dashboard for agent, policy, budget, emergency, activity, and audit management.
- Metrics and health monitoring.
- Automated unit, integration, security, concurrency, and end-to-end tests.
- Reproducible local deployment.
- Production-oriented configuration and operational documentation.

---

# 3. Recommended Technology Stack

Use the following stack unless there is a concrete technical reason to change it:

## Frontend

- React
- TypeScript
- Modern component architecture
- Responsive operator dashboard

## Backend

- Python
- FastAPI
- Pydantic
- SQLAlchemy or an equivalent well-supported ORM
- Alembic for migrations

## Policy

- Open Policy Agent (OPA)
- Rego policies stored in the repository
- Policy decisions must be testable independently

## Data

- PostgreSQL: durable source of record
- Redis: low-latency state, counters, revocation/emergency state, and atomic budget operations

## Observability

- Prometheus metrics
- Structured application logging
- Dashboard-friendly metrics

## Deployment

- Docker
- Docker Compose for local/reproducible deployment

Do not introduce Kubernetes, Kafka, service meshes, or other distributed infrastructure unless it is genuinely required by an implemented requirement.

---

# 4. Architecture Principles

## 4.1 Governance Is the Control Plane

All protected financial mutations MUST pass through the governance gateway.

Do not expose a path that allows an autonomous agent to bypass:

- identity verification,
- agent status,
- fleet status,
- policy evaluation,
- budget enforcement,
- audit logging.

## 4.2 Fail Closed

For protected financial mutations, uncertainty MUST result in denial.

If any critical enforcement dependency is unavailable or its state cannot be trusted, the system MUST NOT authorize the mutation.

Examples:

- Unknown agent identity -> DENY.
- Revocation state unavailable -> DENY.
- Fleet state unavailable -> DENY.
- Policy decision unavailable -> DENY.
- Budget state unavailable -> DENY.
- Invalid authorization context -> DENY.
- Expired authorization -> DENY.

Read-only functionality may use different availability semantics where safe, but financial mutations must fail closed.

## 4.3 Least Privilege

Agents receive only the actions and resources explicitly granted to them.

Do not implement broad permissions such as:

```text
agent.can_do_everything = true
```

unless they are explicitly represented as a tightly controlled administrative capability.

## 4.4 Separation of Concerns

OPA should evaluate authorization policy.

Redis/database-backed logic should enforce atomic budget consumption.

Do not make OPA responsible for mutable financial counters.

## 4.5 Durable Auditability

Every authorization decision and governance-changing event MUST be auditable.

Audit records must not depend solely on transient application logs.

---

# 5. Permission Model

Each agent MUST have a unique identity.

Example:

```json
{
  "agent_id": "payment-agent-001",
  "name": "Payment Reconciliation Agent",
  "owner": "finance-ops",
  "risk_tier": "HIGH",
  "status": "ACTIVE"
}
```

Permissions SHOULD support the following dimensions:

- Agent
- Action
- Resource type
- Resource identifier
- Account
- Currency
- Amount
- Time window
- Approval threshold
- Enabled/disabled state
- Effective start/end time where appropriate

Example permission:

```json
{
  "action": "CREATE_PAYMENT",
  "resource_type": "corporate_account",
  "allowed_accounts": ["ACC-001", "ACC-002"],
  "allowed_currencies": ["INR", "USD"],
  "max_amount": 50000,
  "requires_approval_above": 10000,
  "allowed_hours": {
    "start": "09:00",
    "end": "18:00"
  },
  "enabled": true
}
```

Authorization MUST consider all applicable constraints.

---

# 6. Roles and Policy Model

Use coarse-grained roles where useful, but do not rely on RBAC alone.

Use policy attributes for financial controls.

Recommended model:

```text
Agent
 |
 +-- Identity
 +-- Role
 +-- Risk Tier
 +-- Status
 |
 +-- Permissions
      |
      +-- Action
      +-- Resource
      +-- Amount
      +-- Currency
      +-- Account
      +-- Time
      +-- Approval
```

OPA policies SHOULD return structured decisions, not only booleans.

Example:

```json
{
  "decision": "DENY",
  "reason": "TRANSACTION_LIMIT_EXCEEDED",
  "policy_id": "PAYMENT-LIMIT-001"
}
```

Allowed example:

```json
{
  "decision": "ALLOW",
  "reason": "POLICY_MATCH",
  "policy_id": "PAYMENT-LIMIT-001"
}
```

Policy IDs must be included in audit events whenever applicable.

---

# 7. Budget and Spend Enforcement

Implement multiple budget scopes.

At minimum:

1. Per transaction.
2. Per agent per hour.
3. Per agent per day.
4. Per organizational/team scope if represented.
5. Fleet-wide per day.
6. Remaining budget.

Example:

```text
Transaction limit: ₹50,000
Agent hourly limit: ₹100,000
Agent daily limit: ₹500,000
Fleet daily limit: ₹10,000,000
```

A request is allowed only if all applicable constraints are satisfied.

## Critical concurrency requirement

Budget consumption MUST be atomic.

Example:

```text
Remaining fleet budget = ₹50,000

Agent A requests ₹40,000
Agent B requests ₹40,000

Only one request may consume the available ₹50,000.
The other MUST be denied.
```

Never implement:

```text
read balance
check balance
write balance
```

as independent non-atomic operations.

Use an atomic Redis operation, Lua script, transaction, or another proven concurrency-safe mechanism.

The implementation MUST include concurrent tests proving that overspending cannot occur.

---

# 8. Authorization Endpoint

The central API should be:

```http
POST /authorize
```

Example request:

```json
{
  "agent_id": "payment-agent-001",
  "action": "CREATE_PAYMENT",
  "resource_type": "corporate_account",
  "resource_id": "ACC-001",
  "amount": 25000,
  "currency": "INR",
  "request_id": "req_182736"
}
```

Example successful response:

```json
{
  "decision": "ALLOW",
  "authorization_id": "auth_123",
  "policy_id": "PAYMENT-001",
  "remaining_budget": 175000,
  "expires_at": "2026-09-01T01:25:00Z"
}
```

Example denial:

```json
{
  "decision": "DENY",
  "reason": "DAILY_BUDGET_EXCEEDED",
  "policy_id": "BUDGET-DAILY-001"
}
```

The authorization response MUST be unambiguous.

---

# 9. Authorization Pipeline

The protected request flow MUST conceptually follow:

```text
Request
  |
  v
Validate schema
  |
  v
Authenticate / identify agent
  |
  v
Check fleet emergency state
  |
  v
Check agent status / revocation
  |
  v
Evaluate OPA policy
  |
  v
Atomically reserve budget
  |
  v
Create authorization record
  |
  v
Return ALLOW
  |
  v
Execute protected operation
  |
  v
Audit
```

Any mandatory enforcement failure results in DENY.

The implementation may optimize ordering, but MUST preserve equivalent security semantics.

---

# 10. Revocation

Implement agent-level revocation.

Suggested endpoint:

```http
POST /agents/{agent_id}/revoke
```

State transition:

```text
ACTIVE -> REVOKED
```

A revoked agent MUST NOT receive authorization for protected mutations.

Implement restore only if the product requirements allow it, and treat restoration as a privileged governance event.

Every revoke/restore action MUST be audited.

---

# 11. Fleet Emergency Stop

Implement a fleet-wide emergency stop.

Suggested endpoints:

```http
POST /fleet/emergency-stop
POST /fleet/resume
GET  /fleet/status
```

When halted:

```text
fleet_state = HALTED
```

All protected financial mutations MUST be denied.

The stop state MUST be centrally stored and distributed so that agents do not have to rely on dashboard polling.

Use Redis or another low-latency mechanism.

The expected propagation target is:

```text
< 1 second
```

The system MUST measure and test this behavior.

Emergency stop actions MUST themselves generate audit events.

The dashboard MUST require an explicit confirmation before executing the fleet stop.

---

# 12. Audit Logging

Every authorization attempt MUST create an audit event.

Minimum event fields:

```json
{
  "event_id": "evt_928173",
  "timestamp": "2026-09-01T01:20:31Z",
  "event_type": "AUTHORIZATION_DECISION",
  "agent_id": "payment-agent-001",
  "action": "CREATE_PAYMENT",
  "resource_type": "corporate_account",
  "resource_id": "ACC-001",
  "amount": 25000,
  "currency": "INR",
  "decision": "DENY",
  "reason": "DAILY_BUDGET_EXCEEDED",
  "policy_id": "BUDGET-DAILY-001",
  "operator_id": null,
  "request_id": "req_182736",
  "latency_ms": 4
}
```

Audit event types SHOULD include:

- AUTHORIZATION_REQUEST
- AUTHORIZATION_DECISION
- AGENT_CREATED
- AGENT_UPDATED
- AGENT_REVOKED
- AGENT_RESTORED
- PERMISSION_CREATED
- PERMISSION_UPDATED
- PERMISSION_DELETED
- BUDGET_CREATED
- BUDGET_UPDATED
- EMERGENCY_STOP
- FLEET_RESUMED
- POLICY_CHANGED
- SYSTEM_ERROR

Audit data should be append-oriented and protected from ordinary mutation.

---

# 13. Database Model

At minimum, PostgreSQL should contain logical equivalents of:

```text
agents
agent_permissions
policies
budgets
budget_consumption / transactions
authorization_requests
authorization_decisions
audit_events
operators
fleet_state
```

Use primary keys, foreign keys, indexes, constraints, and timestamps appropriately.

Recommended indexes include:

- agent_id
- status
- action
- decision
- policy_id
- request_id
- timestamp
- audit event type
- resource identifier

Use migrations. Do not rely on manually creating database tables.

---

# 14. Redis Model

Redis is the hot-path state store.

Use clear namespaced keys.

Example:

```text
agentguard:agent:{agent_id}:status
agentguard:fleet:status
agentguard:budget:{scope}:{period}
agentguard:revocation:{agent_id}
agentguard:policy:{policy_id}
```

Do not allow arbitrary unbounded key creation.

Budget keys MUST have appropriate expiration semantics for hourly/daily windows.

Emergency and revocation state MUST remain available for the required enforcement period and must not expire accidentally.

---

# 15. API Surface

At minimum implement:

## Agents

```http
POST   /agents
GET    /agents
GET    /agents/{id}
PATCH  /agents/{id}
POST   /agents/{id}/revoke
POST   /agents/{id}/restore
```

## Permissions

```http
GET    /agents/{id}/permissions
POST   /agents/{id}/permissions
PATCH  /permissions/{id}
DELETE /permissions/{id}
```

## Authorization

```http
POST /authorize
```

## Budgets

```http
GET   /budgets
POST  /budgets
PATCH /budgets/{id}
GET   /budgets/{id}/usage
```

## Fleet

```http
GET  /fleet/status
POST /fleet/emergency-stop
POST /fleet/resume
```

## Audit

```http
GET /audit-events
GET /audit-events/{id}
```

## Policies

```http
GET   /policies
POST  /policies
GET   /policies/{id}
PATCH /policies/{id}
```

## Operations

```http
GET /health
GET /ready
GET /metrics
```

API naming can be refined, but equivalent functionality MUST exist.

---

# 16. Authentication and Operator Authorization

Implement authentication appropriate for an MVP.

At minimum distinguish:

- Autonomous agent identity.
- Human operator identity.

Operators MUST have privileged actions separated from ordinary viewing.

High-risk operations such as:

- revoke agent,
- restore agent,
- modify financial limits,
- change policies,
- emergency stop,
- fleet resume

MUST require privileged operator authorization.

Do not expose administrative mutation endpoints without access control.

For a demo environment, a controlled development authentication mechanism is acceptable, but the architecture must make the authentication boundary explicit.

---

# 17. Frontend Requirements

Build an actual operator dashboard, not static mockups.

Minimum pages:

## Fleet Overview

Display:

- Total agents
- Active agents
- Revoked agents
- Fleet status
- Transactions today
- Allowed/denied counts
- Fleet spend
- Remaining budget
- Recent security events

## Agent Detail

Display:

- Identity
- Owner
- Risk tier
- Status
- Permissions
- Transaction limit
- Hourly limit
- Daily limit
- Spend today
- Remaining budget
- Recent activity

Actions:

- Revoke
- Restore where permitted

## Policy Management

Operators can:

- create policies,
- view policies,
- modify policies,
- enable/disable policies.

Validate input before submission.

## Budget Management

Operators can:

- create budgets,
- modify limits,
- view consumption,
- inspect remaining budget.

## Activity

Provide a near-real-time activity feed showing:

- timestamp,
- agent,
- action,
- amount,
- decision,
- reason.

## Audit Explorer

Provide filters for:

- agent,
- action,
- decision,
- event type,
- policy,
- date/time,
- request ID,
- amount.

## Emergency Control

Show:

- current fleet state,
- emergency stop control,
- resume control when appropriate,
- recent emergency events.

The emergency stop action MUST require explicit confirmation.

---

# 18. Observability

Expose Prometheus-compatible metrics.

At minimum:

```text
authorization_requests_total
authorization_allowed_total
authorization_denied_total
authorization_latency_seconds
budget_denials_total
revocations_total
emergency_stops_total
policy_evaluation_errors_total
audit_events_total
```

Useful labels:

- action
- decision
- reason
- policy
- agent risk tier

Avoid high-cardinality labels such as raw request IDs or arbitrary resource IDs.

Use structured logs containing correlation/request IDs.

---

# 19. Security Requirements

The agent MUST actively check for common security weaknesses.

At minimum:

- Broken authorization.
- Privilege escalation.
- Agent impersonation.
- Missing authentication.
- Insecure direct object references.
- SQL injection.
- Command injection.
- XSS.
- CSRF where relevant.
- Unsafe deserialization.
- Secrets committed to source.
- Excessive API permissions.
- Race conditions in budget enforcement.
- Fail-open behavior.
- Audit log tampering.
- Missing rate limiting where appropriate.

Never hard-code production credentials.

Provide `.env.example`, not real secrets.

---

# 20. Testing Strategy

Testing is part of implementation, not a final optional phase.

## Unit tests

Test:

- policy evaluation adapters,
- permission matching,
- amount limits,
- currency restrictions,
- time restrictions,
- budget calculations,
- revocation logic,
- fleet halt logic,
- audit event construction.

## Integration tests

Test the actual combination of:

```text
FastAPI + PostgreSQL + Redis + OPA
```

where practical.

## Security tests

Prove:

- unauthorized actions are denied,
- revoked agents are denied,
- halted fleet denies mutations,
- expired authorization is denied,
- invalid identities are denied,
- policy errors fail closed.

## Concurrency tests

Prove that concurrent requests cannot overspend a budget.

## End-to-end tests

Test complete flows through the API and frontend where practical.

## Performance tests

Measure:

- p50 authorization latency,
- p95 authorization latency,
- p99 authorization latency,
- revocation propagation time,
- emergency-stop propagation time.

Target:

```text
Authorization p95 < 50 ms
Authorization p99 < 100 ms
Revocation propagation < 1 second
Emergency stop propagation < 1 second
```

These are engineering targets, not excuses to weaken correctness.

---

# 21. Required Demonstration Scenarios

The completed application MUST support these scenarios.

## Scenario A: Unauthorized Action

Agent has:

```text
READ_ACCOUNT
```

Agent attempts:

```text
DELETE_ACCOUNT
```

Expected:

```text
DENY
ACTION_NOT_PERMITTED
```

## Scenario B: Transaction Limit

Limit:

```text
₹50,000
```

Request:

```text
₹75,000
```

Expected:

```text
DENY
TRANSACTION_LIMIT_EXCEEDED
```

## Scenario C: Daily Budget

Budget:

```text
₹100,000
```

Already spent:

```text
₹90,000
```

Request:

```text
₹20,000
```

Expected:

```text
DENY
DAILY_BUDGET_EXCEEDED
```

## Scenario D: Agent Revocation

1. Agent is active.
2. Agent successfully authorizes a permitted action.
3. Operator revokes agent.
4. Agent attempts another mutation.
5. Request is denied.

## Scenario E: Fleet Emergency Stop

1. Multiple agents are active.
2. Operator activates emergency stop.
3. All subsequent protected mutations are denied.
4. Operator resumes fleet.
5. Valid agents can authorize again subject to normal policies.

## Scenario F: Concurrent Budget Race

Two agents simultaneously attempt to consume the final available budget.

Expected:

```text
Exactly one request succeeds.
The other is denied.
No overspending occurs.
```

---

# 22. Error Handling

Return structured errors.

Example:

```json
{
  "error": {
    "code": "AGENT_REVOKED",
    "message": "Agent is not authorized to perform protected actions.",
    "request_id": "req_123"
  }
}
```

Do not leak:

- database internals,
- stack traces,
- secrets,
- policy implementation details that create security exposure.

Log technical details server-side.

---

# 23. Configuration

Configuration MUST be environment-driven.

Provide:

```text
.env.example
```

Include placeholders for:

```text
DATABASE_URL
REDIS_URL
OPA_URL
JWT configuration
LOG_LEVEL
ENVIRONMENT
```

Never commit secrets.

Provide safe development defaults where possible.

---

# 24. Docker and Local Development

A clean checkout should be runnable with documented commands.

The local stack SHOULD include:

```text
frontend
backend
postgres
redis
opa
prometheus
```

The exact service composition may be simplified if justified.

Provide:

```text
docker-compose.yml
Dockerfiles
database migrations
seed/demo data
README.md
```

The README MUST explain:

1. Prerequisites.
2. Environment setup.
3. How to start the stack.
4. How to run migrations.
5. How to seed demo data.
6. How to run tests.
7. How to access the dashboard.
8. How to inspect API documentation.
9. How to run performance tests.
10. How to stop/reset the environment.

---

# 25. Seed Data

Provide realistic development/demo agents.

For example:

```text
payment-agent-001
reconciliation-agent-002
reporting-agent-003
trading-agent-004
support-agent-005
```

Give them deliberately different permissions and budgets so the governance system can be demonstrated.

Do not use real financial information.

---

# 26. Code Quality

Follow these principles:

- Small, cohesive modules.
- Strong typing where practical.
- Explicit error handling.
- Clear domain models.
- No duplicated authorization logic.
- No security decisions in frontend code.
- Backend remains authoritative.
- Reusable policy evaluation layer.
- Clear interfaces between PostgreSQL, Redis, and OPA.
- Meaningful names.
- Minimal hidden behavior.
- No unnecessary abstraction.

Avoid TODOs in production-critical paths.

If a temporary limitation is unavoidable, document it explicitly and add a follow-up issue or test.

---

# 27. Frontend Security Principle

The frontend is an operator interface, not a security boundary.

Never rely on:

```text
disabled button
hidden button
frontend validation
```

to protect administrative operations.

Every privileged action MUST be enforced by the backend.

---

# 28. Policy Change Safety

Policy changes can alter financial authority.

Therefore:

- Validate policies before activation.
- Record who changed them.
- Record when they changed.
- Record the previous and new configuration where practical.
- Audit every policy change.
- Avoid silently replacing policies without version/history semantics.

Where feasible, support policy versioning.

---

# 29. Budget Change Safety

Changing a financial limit is a sensitive operation.

Every budget change MUST:

- authenticate the operator,
- authorize the operator,
- validate the new limit,
- record the change,
- audit the old and new value where appropriate.

Never allow an agent to modify its own budget.

---

# 30. Emergency Stop Safety

Emergency stop has higher priority than ordinary policy decisions.

Conceptually:

```text
Fleet Halted
    |
    +--> DENY protected mutations
```

Do not let an ordinary allow policy override fleet halt.

Fleet resume MUST NOT automatically restore revoked agents.

For example:

```text
Agent revoked
Fleet halted
Fleet resumed

Agent remains revoked.
```

This is mandatory.

---

# 31. Authorization Expiration

Authorizations should be short-lived where the downstream execution model supports it.

An authorization MUST NOT be reusable indefinitely.

If authorization tokens/records are used, validate:

- issuer,
- subject/agent,
- action,
- resource,
- amount,
- currency,
- expiration,
- authorization ID,
- fleet/agent state where required.

---

# 32. Idempotency and Request Integrity

Financial mutations should support idempotency where applicable.

Use request IDs/idempotency keys to prevent accidental duplicate execution.

The system MUST distinguish:

```text
same request retried
```

from:

```text
new financial transaction
```

Audit records should preserve this relationship.

---

# 33. Performance Architecture

The authorization hot path should avoid unnecessary database round trips.

Preferred pattern:

```text
Request
  |
  +--> Redis hot state
  |
  +--> OPA
  |
  +--> Atomic Redis budget operation
  |
  +--> Durable audit
```

PostgreSQL remains the source of truth for durable records.

Caching MUST NOT compromise correctness.

Never cache:

- authorization results,
- revocation state,
- emergency state,
- financial limits

for a duration that can violate stated enforcement guarantees.

If caching is used, define explicit invalidation/TTL behavior.

---

# 34. Operational Readiness

Provide:

- health endpoint,
- readiness endpoint,
- metrics endpoint,
- structured logs,
- database migrations,
- configuration documentation,
- backup considerations,
- failure-mode documentation.

Document what happens if:

- PostgreSQL goes down,
- Redis goes down,
- OPA goes down,
- frontend goes down,
- one agent is revoked,
- fleet emergency stop is activated.

---

# 35. Definition of Done

A feature is DONE only when all applicable conditions are true:

- Backend implementation exists.
- Frontend implementation exists when applicable.
- Database schema/migration exists when applicable.
- Redis behavior exists when applicable.
- OPA policy exists when applicable.
- API integration exists.
- Authentication/authorization exists.
- Audit logging exists.
- Error handling exists.
- Tests exist.
- Integration tests pass.
- End-to-end behavior works.
- Documentation is updated.
- Docker/local environment works.
- No critical TODO remains.
- Security behavior has been verified.
- Failure behavior has been verified.

Do not mark work complete because the UI renders or an endpoint returns a hard-coded response.

---

# 36. Required Final Verification

Before declaring the project complete, execute a final verification checklist.

## Build

- [ ] Backend installs/builds.
- [ ] Frontend installs/builds.
- [ ] Docker images build.
- [ ] Docker Compose starts successfully.

## Database

- [ ] Migrations run successfully.
- [ ] Seed data loads successfully.

## Governance

- [ ] Agent registration works.
- [ ] Permission management works.
- [ ] Policy evaluation works.
- [ ] Authorization works.
- [ ] Budget enforcement works.
- [ ] Concurrent spending is safe.
- [ ] Agent revocation works.
- [ ] Fleet emergency stop works.
- [ ] Fleet resume works.
- [ ] Revoked agents remain revoked after fleet resume.

## Audit

- [ ] Every authorization decision is recorded.
- [ ] Governance changes are recorded.
- [ ] Emergency stop is recorded.
- [ ] Audit filtering works.

## Dashboard

- [ ] Fleet overview works.
- [ ] Agent management works.
- [ ] Policy management works.
- [ ] Budget management works.
- [ ] Activity feed works.
- [ ] Audit explorer works.
- [ ] Emergency controls work.

## Security

- [ ] Unauthorized mutation attempts fail.
- [ ] Revoked agents fail.
- [ ] Halted fleet fails.
- [ ] Invalid identity fails.
- [ ] Enforcement dependency failures fail closed.
- [ ] No secrets are committed.
- [ ] Privileged endpoints require operator authorization.

## Performance

- [ ] Authorization latency measured.
- [ ] p95 target evaluated.
- [ ] p99 target evaluated.
- [ ] Revocation propagation measured.
- [ ] Emergency-stop propagation measured.
- [ ] Concurrency test completed.

## Documentation

- [ ] README is complete.
- [ ] Architecture is documented.
- [ ] API is documented.
- [ ] Local setup is documented.
- [ ] Security assumptions are documented.
- [ ] Known limitations are documented.

---

# 37. Working Method for Autonomous Agents

When working on this repository:

### Step 1 — Inspect

First inspect:

- repository structure,
- existing code,
- package manifests,
- Docker configuration,
- database schema,
- migrations,
- tests,
- environment configuration,
- documentation.

Do not overwrite existing working functionality without understanding it.

### Step 2 — Plan

For non-trivial work, identify:

- affected components,
- data-model changes,
- API changes,
- policy changes,
- security implications,
- tests required.

### Step 3 — Implement

Implement the complete vertical slice.

Prefer:

```text
schema -> backend -> policy -> integration -> frontend -> tests
```

over building disconnected layers.

### Step 4 — Test

Run focused tests first, then the full test suite.

### Step 5 — Verify

Start the actual application and exercise the real API/UI.

### Step 6 — Fix

Do not merely report failures. Fix them when within scope.

### Step 7 — Document

Update README and architecture/API documentation whenever behavior changes.

### Step 8 — Final Review

Re-check this `Agent.md` before declaring completion.

---

# 38. Rules for Production Agents

The agent MUST NOT:

- bypass authorization for convenience;
- hard-code `ALLOW` responses;
- silently disable OPA;
- silently disable budget checks;
- treat Redis failures as permission to proceed;
- allow revoked agents to execute;
- allow halted fleets to execute protected mutations;
- trust frontend controls as security controls;
- store secrets in source control;
- invent test results;
- claim an implementation is production-ready without verification;
- delete tests merely because they fail;
- weaken security requirements to make tests pass;
- remove audit logging to improve latency;
- use eventual consistency where it can permit prohibited financial actions;
- silently change requirements.

If a requirement conflicts with an existing implementation, preserve the safer security property and document the change.

---

# 39. Definition of the Finished Product

The final system should be demonstrable as:

```text
An autonomous agent requests a financial action
            |
            v
Agent identity is verified
            |
            v
Fleet is checked
            |
            v
Agent revocation is checked
            |
            v
OPA evaluates granular permission
            |
            v
Real-time budget is atomically checked/reserved
            |
       +----+----+
       |         |
      DENY      ALLOW
       |         |
       v         v
    Audit     Authorization
                 |
                 v
             Execution
                 |
                 v
               Audit
```

An operator can then:

```text
view the fleet
    |
inspect an agent
    |
modify permissions
    |
change budgets
    |
revoke an agent
    |
halt the fleet
    |
inspect every decision
```

The system must make unauthorized financial behavior difficult by architecture, not merely by convention.

---

# 40. Final Instruction to the Agent

**Do not stop at scaffolding. Do not stop at a prototype UI. Do not stop when the API works. Do not stop when tests compile.**

Build the complete AgentGuard system end to end.

Every core requirement in this file must be implemented, integrated, tested, and verified.

When you believe the project is complete, run the full verification checklist above and fix all issues that you can resolve.

**This file must be treated as a mandatory engineering contract for the project.**
