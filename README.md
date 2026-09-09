# AgentGuard: Financial Governance Control Plane for Autonomous Agents

AgentGuard is a production-grade financial governance and safety control plane for fleets of autonomous AI agents. It functions as an authoritative, fail-closed security boundary between autonomous agents and sensitive financial operations, ensuring that agents only execute transactions within explicitly granted policies, budgets, and approval thresholds.

---

## Capabilities & Production Readiness

In compliance with the production candidate specification, the capabilities are explicitly categorized:

### 1. Implemented
* **Identity & Impersonation Protection**: Cryptographic JWT authentication with role-based access control (`ADMIN`, `OPERATOR`, `AUDITOR`, `AGENT`). Agents cannot impersonate other agents; requests where `token.sub != request.agent_id` are rejected with `403 Forbidden`.
* **Fail-Closed Gatekeeper**: Immediate rejection on missing credentials, expired tokens, revoked agent status, halted fleet status, or downstream service timeouts (OPA/Redis).
* **Deterministic OPA Policy Engine**: Open Policy Agent (Rego) policy evaluation with strict fail-closed timeout handling.
* **Atomic Multi-Tier Spending Budgets**: Atomic budget reservation across transaction, daily, and fleet-wide spending limits using Redis Lua scripts operating exclusively in minor currency units (paise/cents) to eliminate floating-point drift.
* **Human-in-the-Loop Interception**: High-value transactions exceeding policy thresholds automatically enter `PENDING_APPROVAL`. Operators review requests in a dedicated console. Approvals use database row locks (`SELECT ... FOR UPDATE`), enforce a 15-minute authoritative UTC expiry, and execute a full re-evaluation pipeline (skipping approval threshold check to prevent loops) while preserving request lineage (`parent_request_id`, `decision_attempt`).
* **Authoritative Execution Gateway**: Single-use execution authorization tokens (`auth_<uuid4>`) stored in `execution_authorizations`. Downstream financial payment services verify identity, action, resource, amount, currency, and UTC expiry against `/api/execution/verify`. Successful verification atomically marks the token `CONSUMED`, rejecting replay attacks with `409 Conflict`.
* **Tamper-Evident Audit Hash Chain**: Every authorization decision and state change is hashed into a cryptographic SHA-256 linear chain with strictly monotonic sequence numbers (`sequence_number`) locked by `AuditChainHead`. Tampering, deletions, or insertions are detectable via `GET /api/audit-events/verify` and CLI script `app/scripts/verify_audit_chain.py`.
* **Kubernetes Workload Containment**: Revoking or quarantining an agent scales its dedicated Kubernetes Deployment to 0 replicas using least-privilege RBAC (`deployments/scale` only). Containment failures fail-safely without rolling back the financial database revocation.
* **LLM Tool Argument Validation**: Autonomous agent runtime validates function/tool arguments (`validate_transfer_args`) before invoking AgentGuard, and truthfully reports `EXECUTED` or `EXECUTION_FAILED` based on execution gateway verification.
* **Production Container Security**: Dockerfile executes as unprivileged user `appuser` (UID 10001). Kubernetes manifests define liveness (`/live`), readiness (`/ready`), and least-privilege ServiceAccount RBAC.

### 2. Demo-Only Components
* **Development Token Minting (`/api/dev/token`)**: An unauthenticated endpoint for generating operator, auditor, or agent JWTs. **Strictly disabled** (returns `404 Not Found`) when `ENVIRONMENT != "development"`.
* **Database Seed Script (`seed.py`)**: Prepopulates demo corporate accounts, risk policies, and sample agents.
* **Mock LLM Mode (`LLM_MODE=MOCK`)**: Allows testing agent tool selection loops without OpenAI/Gemini API keys. System fails startup if configured with `LLM_MODE=MOCK` in `staging` or `production`.

### 3. Production Requirements
* **PostgreSQL 15+**: Primary relational store with connection pooling and applied Alembic migrations.
* **Redis 7+**: Highly available in-memory data store for Lua atomic budget reservations.
* **Open Policy Agent (OPA) 0.60+**: Dedicated sidecar or cluster service hosting Rego governance policies.
* **Cryptographic Secrets**: High-entropy `JWT_SECRET` (minimum 32 characters, non-default).
* **Kubernetes 1.28+ Cluster**: Scoped namespace (`agentguard-agents`), ServiceAccount (`agentguard-sa`), and Role for agent workload scaling.
* **Real LLM Providers**: Production API keys (`OPENAI_API_KEY` or `GEMINI_API_KEY`) with `LLM_MODE=REAL`.

### 4. Known Limitations
* **Cross-Currency Conversions**: Budgets are tracked per currency key (e.g., `agentguard:budget:fleet:INR`). Real-time multi-currency FX conversion and normalized foreign exchange limits require an external FX rates provider.
* **Local Test Emulation**: SQLite in-memory databases used for lightweight local testing do not support native row-level locks (`SELECT ... FOR UPDATE`). Thread-safe mutexes are provided in the application layer for test compatibility; production strictly requires PostgreSQL.
* **Cold-Chain Archival**: The audit hash chain is verified against the relational database. For non-repudiation in regulated banking, downstream sync to a Write-Once-Read-Many (WORM) S3 bucket or hardware security module (HSM) is recommended.

---

## System Architecture

```
                                  +---------------------------------------+
                                  |    Autonomous AI Agent (LLM Runtime)  |
                                  +---------------------------------------+
                                                     |
                                     1. Tool Call (Transfer Request)
                                                     v
                                  +---------------------------------------+
                                  |      AgentGuard Gateway / API         |
                                  |     (FastAPI, JWT Auth, Impersonation)|
                                  +---------------------------------------+
                                           |                     |
                      2. Validate Agent State                    | 3. Query Rego Policy
                                           v                     v
                        +----------------------+    +-----------------------+
                        |  PostgreSQL Database |    |    Open Policy Agent  |
                        | (Agent, Fleet State) |    |        (OPA HTTP)     |
                        +----------------------+    +-----------------------+
                                           |                     |
                                           +----------+----------+
                                                      |
                                          4. Atomic Budget Reservation
                                                      v
                                        +---------------------------+
                                        |    Redis (Lua Scripting)  |
                                        |  (Txn, Daily, Fleet Caps) |
                                        +---------------------------+
                                                      |
                                          5. Evaluate Decision State
                                                      |
                    +---------------------------------+-------------------------------+
                    |                                 |                               |
              [ALLOW (< Limit)]            [PENDING_APPROVAL (> Limit)]            [DENY]
                    |                                 |                               |
        6. Issue Execution Auth            7. Enqueue in Operator Inbox       Log Failure & Return
        (auth_<uuid4>, 15m UTC)                       |                               |
                    |                      8. Operator Approves/Denies                |
                    |                      9. Row Lock & Full Re-eval                 |
                    |                                 |                               |
                    +---------------------------------+                               |
                                    |                                                 |
                     10. SHA-256 Audit Hash Chain Event <-----------------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
    +------------------------------+   +----------------------------------+
    | Execution Gateway (/verify)  |   | Kubernetes Containment Service   |
    |  - Strict Payload Matching   |   |  - Scales Deployment to 0        |
    |  - Authoritative UTC Expiry  |   |  - Least-privilege RBAC          |
    |  - Single-Use (Anti-Replay)  |   |  - Fail-Safe Isolation           |
    +------------------------------+   +----------------------------------+
```

---

## Authorization & Execution Pipeline

1. **Intent Generation**: The agent runtime generates a structured financial tool invocation with validated arguments.
2. **Authentication & Identity Check**: Gateway verifies the caller's JWT. If the caller's role is `AGENT`, the `sub` claim must match `request.agent_id`.
3. **Fleet & Agent Status**: The gateway queries the database. If fleet status is `PAUSED` or agent status is `REVOKED`/`TERMINATED`, request is denied with reason `FLEET_HALTED` or `AGENT_REVOKED`.
4. **OPA Evaluation**: Policy constraints (allowed actions, maximum amounts, approved account types) are evaluated via OPA with fail-closed timeout protection.
5. **Approval Threshold**: If transaction exceeds the agent's human approval threshold, it is placed in `PENDING_APPROVAL`.
6. **Atomic Budget Reservation**: For allowed requests, Redis executes an atomic Lua script verifying and decrementing agent transaction, agent daily, and fleet-wide budget limits in integer minor units.
7. **Audit Record**: Decision is recorded in `audit_events` with SHA-256 hash chaining, referencing the previous event's hash and advancing `sequence_number`.
8. **Authorization Issuance**: An `ExecutionAuthorization` record is created in status `ISSUED` with a 15-minute UTC expiration.
9. **Authoritative Execution Verification**: Before money moves, the execution system calls `POST /api/execution/verify` with the authorization ID and exact payload.
10. **Replay Prevention**: The authorization is locked via `with_for_update()`, payload parameters are verified, and status is atomically transitioned from `ISSUED` to `CONSUMED`. Subsequent attempts return `409 Conflict`.

---

## Kubernetes Containment & RBAC

When an operator revokes or quarantines an agent:
1. Agent status is updated to `REVOKED` in PostgreSQL, immediately blocking all future authorizations.
2. `QuarantineService` resolves the agent ID to a verified Kubernetes deployment name via an explicit workload mapping.
3. The Kubernetes client calls the `apps/v1` `scale` subresource to scale the deployment to 0 replicas.
4. Scale status is verified by polling the replica count.
5. If the Kubernetes cluster or API fails, the financial revocation in PostgreSQL is preserved (fail-safe containment).

### Least-Privilege RBAC Configuration (`k8s/agentguard-api.yaml`)
```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: agentguard-agent-scaler
  namespace: agentguard-agents
rules:
  - apiGroups: ["apps"]
    resources: ["deployments/scale"]
    verbs: ["get", "update", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get"]
```

---

## Development vs. Production Configuration

| Setting | Development | Production |
| :--- | :--- | :--- |
| `ENVIRONMENT` | `development` | `production` |
| `JWT_SECRET` | Dev secret allowed | Enforces >= 32 chars, fails on insecure defaults |
| `LLM_MODE` | `MOCK` or `REAL` | `REAL` only (fails startup on `MOCK`) |
| `/api/dev/token` | Enabled (for quick local testing) | **Disabled** (returns HTTP 404) |
| Database | PostgreSQL or SQLite | PostgreSQL 15+ with connection pooling |
| Redis | Local Redis | Redis 7+ Sentinel / Cluster |
| User Execution | Root or standard user | Non-root `appuser` (UID 10001) |
| Health Probes | `/health` | `/live`, `/ready`, `/health` (sanitized output) |

---

## Getting Started

### 1. Prerequisites
* Docker & Docker Compose
* Python 3.12+
* Node.js 18+

### 2. Start the Stack (Local Development)
```bash
# Clone and enter workspace
cd governance_for_financial_agents

# Launch PostgreSQL, Redis, OPA, Backend, and Frontend
docker compose up --build
```

Services will be available at:
* **Operator Console**: [http://localhost:5173](http://localhost:5173)
* **Backend API & Swagger**: [http://localhost:8000/docs](http://localhost:8000/docs)
* **Liveness Probe**: [http://localhost:8000/live](http://localhost:8000/live)
* **Readiness Probe**: [http://localhost:8000/ready](http://localhost:8000/ready)

### 3. Database Migrations
```bash
cd backend
PYTHONPATH=. ../.venv/bin/alembic upgrade head
```

### 4. Running the Automated Test Suite
The test suite validates security controls, concurrency races, hash chain tamper detection, and fail-closed behaviors:
```bash
cd backend
PYTHONPATH=. ../.venv/bin/pytest tests -v
```

### 5. Cryptographic Audit Chain Verification
Run the verification CLI to confirm audit hash-chain integrity:
```bash
cd backend
PYTHONPATH=. ../.venv/bin/python app/scripts/verify_audit_chain.py
```
Or query via the API:
```bash
curl -H "Authorization: Bearer <AUDITOR_OR_ADMIN_TOKEN>" http://localhost:8000/api/audit-events/verify
```
