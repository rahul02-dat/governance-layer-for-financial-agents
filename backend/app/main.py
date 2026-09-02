from fastapi import FastAPI, Depends
from sqlalchemy import text
from app.config import settings
from app.database import get_db
from app import redis_client
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

@app.get("/dev/token")
def get_dev_token():
    from app.auth import create_access_token
    token = create_access_token({"sub": "admin-hackathon", "role": "ADMIN"})
    return {"token": token}

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
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=503, detail=f"Service unavailable: {str(e)}")
