# AgentGuard

AgentGuard is a financial governance and safety control plane for fleets of autonomous AI agents. It serves as the security boundary between autonomous agents and sensitive financial operations, ensuring that agents only act within explicitly granted budgets and permissions.

## Features

- **Granular Permissions:** Manage action and resource restrictions for each agent.
- **Budget Enforcement:** Enforce transaction, hourly, daily, and fleet-wide spending limits using atomic operations in Redis.
- **Open Policy Agent (OPA):** Rego policies dictate fine-grained authorization constraints.
- **Fail-Closed Semantics:** Any error or timeout in identity, status, or policy checks results in an automatic denial.
- **Fleet Emergency Stop:** Operators can instantly halt all financial mutations across the entire fleet.
- **Complete Audit Logging:** Immutable records of every authorization request and governance change.
- **Operator Dashboard:** A React-based interface for managing agents, policies, and budgets in real-time.

---

## 1. Prerequisites

Make sure you have the following installed on your machine:
- **Docker** and **Docker Compose**
- **Python 3.12+** (For running the backend locally)
- **Node.js 18+** & npm (For running the frontend locally)

## 2. Environment Setup

1. **Clone the repository.**
2. **Setup Environment Variables:** 
   Copy the example environment configuration.
   ```bash
   cp .env.example .env
   ```
3. **Setup Python Virtual Environment:**
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```
4. **Setup Node Dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

## 3. How to Start the Stack

AgentGuard runs a PostgreSQL database, a Redis cache, and an Open Policy Agent instance via Docker. 

To start the infrastructure:
```bash
docker compose up -d
```

To start the backend API server:
```bash
source .venv/bin/activate
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

To start the frontend operator dashboard (in a separate terminal):
```bash
cd frontend
npm run dev
```

## 4. How to Run Migrations

The project uses SQLAlchemy and Alembic for database migrations.

To apply migrations and build the database schema:
```bash
source .venv/bin/activate
cd backend
PYTHONPATH=. alembic upgrade head
```

*(Note: The `PYTHONPATH=.` ensures Alembic can find the local `app` directory.)*

## 5. How to Seed Demo Data

To populate the database with a fleet budget, dummy agents, and permissions:
```bash
source .venv/bin/activate
cd backend
python seed.py
```

## 6. Accessing the Dashboard & API

- **Operator Dashboard (Frontend):** [http://localhost:5173](http://localhost:5173)
- **API Documentation (Swagger UI):** [http://localhost:8000/docs](http://localhost:8000/docs)
- **API Health Check:** [http://localhost:8000/health](http://localhost:8000/health)

## 7. How to Run Tests

Testing includes unit, integration, concurrency, and security tests.

```bash
source .venv/bin/activate
cd backend
pytest tests/
```
*(Tests should be placed in `backend/tests/` and cover OPA policies, budget calculation, and authorization logic.)*

## 8. How to Run Performance Tests

To verify that the authorization engine meets the `< 50ms` p95 and `< 100ms` p99 latency targets, you can use a load testing tool like `locust` or `k6` against the `/authorize` endpoint while the stack is running.

## 9. How to Stop/Reset the Environment

To stop the Docker containers gracefully:
```bash
docker compose down
```

To **completely reset** the database and Redis cache (this will delete all data):
```bash
docker compose down -v
```
