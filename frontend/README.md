# AgentGuard Control Tower Frontend

The AgentGuard Control Tower is a production-grade governance and safety control plane interface for autonomous AI agents in financial systems. It acts as an authoritative observer, investigator, and operator confirmation surface.

---

## Architecture & Responsibilities

The frontend observes, requests, visualizes, and confirms. The backend decides, authorizes, and enforces.

```text
                     AgentGuard Backend
                            |
                      AUTHORITATIVE
                            |
              ┌─────────────┴─────────────┐
              │                           │
              v                           v
        Governance API              State / Events
              │                           │
              └─────────────┬─────────────┘
                            v
                     React Control Tower
                            |
              ┌─────────────┼─────────────┐
              v             v             v
           Observe       Investigate    Control
              |             |             |
           Analytics      Audit       Approvals
           Fleet          Policies    Emergency
                                        |
                                        v
                                   Backend API
```

---

## Core Capabilities

1. **Governance Control Tower (`/`)**:
   - Real-time polling with lifecycle interval cleanup and in-flight request protection.
   - Visible freshness indicators (`LIVE` vs `STALE` vs `OFFLINE`).
   - Exact currency formatting via `Intl.NumberFormat` without arbitrary divisions.
   - Live authorization telemetry matching authoritative `AUTHORIZATION_DECISION` events.

2. **Agent Registry & Quarantine (`/agents`)**:
   - Fleet roster displaying agent risk tier and operational status (`ACTIVE`, `REVOKED`).
   - Consequential action confirmation modal.
   - Dual-status quarantine report distinguishing local financial revocation from Kubernetes workload containment. Never claims success if Kubernetes containment fails.

3. **Human Approval Workflow (`/approvals`)**:
   - Inbox of dual-control transactions exceeding autonomy thresholds.
   - Confirmation modal with transaction details before approval or denial.
   - Race-condition handling: if another operator acts first, displays authoritative state update and refreshes queue.
   - Prevention of duplicate-click submissions.

4. **Audit Investigation & Integrity (`/audit`, `/investigation`)**:
   - Bounded server-side pagination with query filters.
   - Real-time cryptographic hash chain verification (`GET /api/audit-events/verify`).
   - Event inspection drawer displaying SHA-256 hash lineage and canonical fields.

5. **Governance Policies (`/policies`)**:
   - Real backend-connected list of Open Policy Agent (OPA) rules.
   - Version number, status, effective timestamp, and content hash display.
   - Read-only Rego policy viewer modal.

6. **Emergency Controls (`/emergency`)**:
   - Authoritative fleet state (`ACTIVE` / `HALTED`).
   - Consequential confirmation dialogs with explicit operation warnings.
   - Disables actions while in flight; atomic fail-closed enforcement.

7. **Test Harness & Sandbox (`/simulator`)**:
   - Deterministic governance evaluation harness.
   - Dual execution modes:
     - `Simulation (Dry Run)`: Evaluates policies without mutating budgets or recording debits.
     - `Sandbox Execution`: Real AgentGuard governance pipeline issuing signed execution authorization credentials against restricted sandbox targets.

---

## Centralized API & Authentication

- **Centralized Client (`src/api/client.ts`)**:
  - Single Axios instance with configurable base URL (`VITE_API_BASE_URL` or `/api`).
  - Strict in-memory session token storage — never stores privileged credentials in `localStorage`.
  - Development token endpoint (`/api/dev/token`) is gated strictly to `import.meta.env.DEV`.
  - Normalized 401 (transition to unauthenticated) and 403 ("You are not authorized to perform this operation") handling without exposing backend stack traces.

---

## Build, Test & Lint Commands

```bash
# Install dependencies
npm install

# Run Vitest test suite
npm run test

# Run TypeScript typecheck
npx tsc -b

# Run linter
npm run lint

# Build production bundle
npm run build
```
