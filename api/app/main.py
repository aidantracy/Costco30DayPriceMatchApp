"""FastAPI application entry point."""

from fastapi import FastAPI

from app.config import get_settings

app = FastAPI(title="Price Match Tracker API", version="0.1.0")


@app.get("/healthz", tags=["ops"])
def healthz() -> dict[str, str]:
    """Liveness check for Cloud Run. Returns no configuration or secrets."""
    return {"status": "ok", "env": get_settings().app_env}
