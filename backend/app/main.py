from fastapi import FastAPI
from app.config import settings
from app.routers import agents, policies, budgets, fleet, authorize, audit, analytics, approvals

app = FastAPI(
    title="AgentGuard API",
    description="Financial governance and safety control plane for autonomous AI agents",
    version="0.1.0"
)

app.include_router(agents.router)
app.include_router(policies.router)
app.include_router(budgets.router)
app.include_router(fleet.router)
app.include_router(authorize.router)
app.include_router(audit.router)
app.include_router(analytics.router)
app.include_router(approvals.router)

@app.get("/health")
def health_check():
    return {"status": "ok", "environment": settings.environment}

@app.get("/ready")
def readiness_check():
    # In a real scenario, this would check DB, Redis, and OPA connections
    return {"status": "ready"}
