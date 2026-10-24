"""FastAPI application entry point."""

from fastapi import FastAPI

from app.config import get_settings
from app.routers import auth, flags, prices, purchases

app = FastAPI(title="Price Match Tracker API", version="0.1.0")
app.include_router(auth.router)
app.include_router(purchases.router)
app.include_router(prices.router)
app.include_router(flags.router)


@app.get("/healthz", tags=["ops"])
def healthz() -> dict[str, str]:
    """Liveness check for Cloud Run. Returns no configuration or secrets."""
    return {"status": "ok", "env": get_settings().app_env}
