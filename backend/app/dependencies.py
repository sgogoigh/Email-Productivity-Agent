"""Shared FastAPI dependency providers."""

from fastapi import Request

from app.config import Settings
from app.repositories.store import EmailStore
from app.services.email_agent import EmailAgentService


def get_app_settings(request: Request) -> Settings:
    """Return app Settings from FastAPI state."""
    return request.app.state.settings


def get_store(request: Request) -> EmailStore:
    """Return EmailStore from FastAPI state."""
    return request.app.state.store


def get_agent_service(request: Request) -> EmailAgentService:
    """Return EmailAgentService from FastAPI state."""
    return request.app.state.agent_service
