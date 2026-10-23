"""FastAPI application factory."""

from __future__ import annotations

import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.database import create_all
from app.routers import admin, auth, donors, hospitals, meta
from app.routers import requests as requests_router

# Python's mimetypes table does not know woff2, and serving a font as
# application/octet-stream makes some browsers refuse it on strict MIME checks.
mimetypes.add_type("font/woff2", ".woff2")

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
        meta.router,
        donors.router,
        hospitals.router,
        requests_router.router,
        admin.router,
    ):
        app.include_router(router, prefix=settings.api_prefix)

    @app.get("/health", tags=["meta"], summary="Liveness probe")
    def health() -> dict:
        return {"status": "ok", "version": settings.version}

    @app.get(f"{settings.api_prefix}", tags=["meta"], summary="API index")
    def index() -> dict:
        return {
            "name": settings.app_name,
            "version": settings.version,
            "docs": "/docs",
            "health": "/health",
            "web": "/",
        }

    _add_crawl_routes(app)
    _mount_frontend(app)

    return app


# Public routes a search engine may index. Console routes are deliberately
# absent: they sit behind a JWT and carry a per-route noindex.
_PUBLIC_ROUTES: tuple[tuple[str, str, str], ...] = (
    ("/", "1.0", "weekly"),
    ("/privacy", "0.3", "yearly"),
    ("/terms", "0.3", "yearly"),
)


def _origin(request: Request) -> str:
    """The origin this request arrived on, proxy headers included.

    Deriving the sitemap origin from the request — rather than baking a domain
    into the build — is what makes a custom domain work with no configuration.
    Uvicorn trusts ``X-Forwarded-*`` by default, so this stays correct behind
    a reverse proxy.
    """

    return str(request.base_url).rstrip("/")


def _add_crawl_routes(app: FastAPI) -> None:
    @app.get("/robots.txt", include_in_schema=False, response_class=PlainTextResponse)
    def robots(request: Request) -> PlainTextResponse:
        return PlainTextResponse(
            "User-agent: *\n"
            "Allow: /\n"
            "Disallow: /donor\n"
            "Disallow: /hospital\n"
            "Disallow: /admin\n"
            f"\nSitemap: {_origin(request)}/sitemap.xml\n"
        )

    @app.get("/sitemap.xml", include_in_schema=False)
    def sitemap(request: Request) -> Response:
        origin = _origin(request)
        entries = "".join(
            "  <url>\n"
            f"    <loc>{origin}{path}</loc>\n"
            f"    <changefreq>{freq}</changefreq>\n"
            f"    <priority>{priority}</priority>\n"
            "  </url>\n"
            for path, priority, freq in _PUBLIC_ROUTES
        )
        return Response(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{entries}"
            "</urlset>\n",
            media_type="application/xml",
        )


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built React app from this same origin, if it has been built.

    Registered *after* every API router and after ``/health``, so attaching the
    SPA can never shadow a real endpoint. Hashed asset files are served straight
    off disk; everything else falls through to ``index.html`` so client-side
    routes survive a hard refresh.

    If ``web/dist`` does not exist the API simply runs on its own — a fresh clone
    works before anyone has run ``npm run build``.
    """

    dist = Path(__file__).resolve().parent.parent / "web" / "dist"
    index_file = dist / "index.html"
    if not index_file.is_file():
        return

    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        # A path under /api that reached this catch-all is a genuine 404, not a
        # client route — let FastAPI answer it properly.
        if full_path.startswith(get_settings().api_prefix.strip("/")):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

        # Real static files (favicon.svg, robots.txt, …) are served directly.
        candidate = (dist / full_path).resolve()
        if full_path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)

        return FileResponse(index_file)


app = create_app()
