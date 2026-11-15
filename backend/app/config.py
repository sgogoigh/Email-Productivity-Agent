"""Application configuration loaded from environment variables."""

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime settings for the FastAPI Email Productivity Agent service."""

    app_name: str = "Email Productivity Agent API"
    app_version: str = "1.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_path: str = str(BACKEND_ROOT / "data" / "email_agent.db")
    mock_inbox_path: str = str(BACKEND_ROOT / "data" / "mock_inbox.json")
    default_prompts_path: str = str(BACKEND_ROOT / "data" / "default_prompts.json")

    # LLM provider settings: mock | openai | gemini | openai_compatible
    llm_provider: str = "mock"
    llm_api_key: str = ""
    gemini_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = ""
    llm_base_url: str = ""
    llm_timeout_seconds: float = 30.0
    llm_allow_mock_fallback: bool = True

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_ROOT / ".env"), str(BACKEND_ROOT.parent / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> List[str]:
        """Parse comma-separated CORS origins into a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def resolved_database_path(self) -> Path:
        """Resolve database path relative to backend root when not absolute."""
        p = Path(self.database_path)
        return p if p.is_absolute() else (BACKEND_ROOT / p)

    @property
    def resolved_llm_provider(self) -> str:
        """Determine provider, auto-selecting gemini/openai when their API keys are present."""
        explicit = self.llm_provider.strip().lower()
        if explicit != "mock":
            return explicit
        if not self.llm_api_key.strip():
            if self.gemini_api_key.strip():
                return "gemini"
            if self.openai_api_key.strip():
                return "openai"
        return explicit

    @property
    def resolved_llm_api_key(self) -> str:
        """Return explicit LLM_API_KEY or fall back to provider-specific key."""
        if self.llm_api_key.strip():
            return self.llm_api_key.strip()
        provider = self.resolved_llm_provider
        if provider == "gemini" and self.gemini_api_key.strip():
            return self.gemini_api_key.strip()
        if provider == "openai" and self.openai_api_key.strip():
            return self.openai_api_key.strip()
        return ""

    @property
    def effective_llm_mode(self) -> str:
        """Return the effective LLM mode considering API key availability."""
        provider = self.resolved_llm_provider
        if provider == "mock":
            return "mock"
        if not self.resolved_llm_api_key:
            return "mock (fallback)" if self.llm_allow_mock_fallback else f"{provider} (unconfigured)"
        return provider


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()
