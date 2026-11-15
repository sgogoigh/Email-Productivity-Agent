"""FastAPI entrypoint with SQLAlchemy DB connectivity and structured request logging."""

import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.database import create_db_engine, init_database
from app.logging_config import configure_logging, request_id_ctx
from app.repositories.store import EmailStore
from app.routers import agent, drafts, health, inbox, observability, prompts
from app.services.email_agent import EmailAgentService
from app.services.llm_client import LLMGateway


def create_app(custom_settings: Optional[Settings] = None) -> FastAPI:
    """Application factory enabling clean testing and standalone deployment."""
    settings = custom_settings or get_settings()
    logger = configure_logging(settings.log_level, settings.resolved_log_file_path)
    engine = create_db_engine(settings.resolved_database_url)
    store = EmailStore(engine)
    llm_gateway = LLMGateway(settings)
    agent_service = EmailAgentService(store=store, llm=llm_gateway)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        init_database(engine)
        store.seed_default_prompts(Path(settings.default_prompts_path), overwrite=False)
        logger.info(
            "service_started",
            extra={
                "extra_fields": {
                    "dialect": engine.dialect.name,
                    "llm_mode": settings.effective_llm_mode,
                }
            },
        )
        yield
        engine.dispose()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Prompt-driven Email Productivity Agent backend (FastAPI + SQLAlchemy).",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.store = store
    app.state.llm_gateway = llm_gateway
    app.state.agent_service = agent_service

    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:10]}"
        token = request_id_ctx.set(req_id)
        t0 = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Response-Time-Ms"] = str(duration_ms)
            logger.info(
                "http_request",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                    }
                },
            )
            return response
        finally:
            request_id_ctx.reset(token)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(inbox.router)
    app.include_router(prompts.router)
    app.include_router(agent.router)
    app.include_router(drafts.router)
    app.include_router(observability.router)

    return app


app = create_app()
