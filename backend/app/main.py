"""FastAPI entrypoint for the Prompt-Driven Email Productivity Agent."""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.database import init_database
from app.repositories.store import EmailStore
from app.routers import agent, drafts, health, inbox, prompts
from app.services.email_agent import EmailAgentService
from app.services.llm_client import LLMGateway


def create_app(custom_settings: Optional[Settings] = None) -> FastAPI:
    """Application factory enabling clean testing and standalone deployment."""
    settings = custom_settings or get_settings()
    db_path = settings.resolved_database_path
    store = EmailStore(db_path)
    llm_gateway = LLMGateway(settings)
    agent_service = EmailAgentService(store=store, llm=llm_gateway)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        init_database(db_path)
        store.seed_default_prompts(Path(settings.default_prompts_path), overwrite=False)
        yield

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Prompt-driven Email Productivity Agent backend (FastAPI + SQLite).",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.store = store
    app.state.llm_gateway = llm_gateway
    app.state.agent_service = agent_service

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

    return app


app = create_app()
