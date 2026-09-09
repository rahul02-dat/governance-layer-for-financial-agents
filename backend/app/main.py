from fastapi import FastAPI, Depends, HTTPException, APIRouter
from sqlalchemy import text
from app.config import settings
from app.database import get_db
from app import redis_client
from app.routers import agents, policies, budgets, fleet, authorize, audit, analytics, approvals, execution

app = FastAPI(
    title="AgentGuard API",
    description="Financial governance and safety control plane for autonomous AI agents",
    version="0.1.0"
)

from fastapi import APIRouter

api_router = APIRouter(prefix="/api")

api_router.include_router(agents.router)
api_router.include_router(policies.router)
api_router.include_router(budgets.router)
api_router.include_router(fleet.router)
api_router.include_router(authorize.router)
api_router.include_router(audit.router)
api_router.include_router(analytics.router)
api_router.include_router(approvals.router)
api_router.include_router(execution.router)

@api_router.get("/health")
def api_health_check():
    return {"status": "ok"}

@api_router.get("/dev/token")
def get_dev_token():
    if settings.environment.lower() != "development":
        raise HTTPException(status_code=404, detail="Development endpoints are disabled outside development environment.")
    from app.auth import create_access_token
    token = create_access_token({"sub": "admin-hackathon", "role": "ADMIN"})
    return {"token": token}

app.include_router(api_router)

@app.get("/live")
@app.get("/health")
def liveness_check():
    return {"status": "ok"}

@app.get("/ready")
def readiness_check(db = Depends(get_db)):
    import httpx
    try:
        # Check DB
        db.execute(text("SELECT 1"))
        
        # Check Redis
        if not redis_client.redis_client.ping():
            raise Exception("Redis ping failed")
            
        # Check OPA
        resp = httpx.get(f"{settings.opa_url}/health", timeout=2.0)
        resp.raise_for_status()
        
        return {"status": "ready"}
    except Exception:
        # Fail closed without leaking internal diagnostics or connection details
        raise HTTPException(status_code=503, detail="Service unavailable")

