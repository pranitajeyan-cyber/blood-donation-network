"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_all
from app.routers import admin, auth, donors, hospitals
from app.routers import requests as requests_router

DESCRIPTION = """
**Blood Donation Network** — a predictive, escalating marketplace for blood.

The two things this API does that a directory-style platform does not:

1. **Escalation.** A request that finds no donor in 15 minutes expands its
   search radius; at 30 minutes it triggers a caregiver SMS blast.
2. **Forecasting.** A backtested model estimates units needed per blood group
   per district over the next 7 days, so a hospital learns it is about to run
   dry *before* the fridge is empty.

`POST /api/auth/register` creates a donor. Seed data for the demo lives in
`app/seed.py`.
"""


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    create_all()
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.version,
        description=DESCRIPTION,
        lifespan=lifespan,
        contact={"name": "Pranita Jeyan", "url": "https://github.com/pranitajeyan-cyber"},
        license_info={"name": "MIT"},
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (
        auth.router,
        donors.router,
        hospitals.router,
        requests_router.router,
        admin.router,
    ):
        app.include_router(router, prefix=settings.api_prefix)

    @app.get("/health", tags=["meta"], summary="Liveness probe")
    def health() -> dict:
        return {"status": "ok", "version": settings.version}

    @app.get("/", tags=["meta"], summary="API index")
    def index() -> dict:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "docs": "/docs",
            "health": "/health",
        }

    return app


app = create_app()
