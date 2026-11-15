"""Prompt Brain configuration routes."""

import sqlite3
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.config import Settings
from app.dependencies import get_app_settings, get_store
from app.models.schemas import PromptCreate, PromptOut, PromptUpdate
from app.repositories.store import EmailStore

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


@router.get("", response_model=List[PromptOut])
def list_prompts(store: EmailStore = Depends(get_store)) -> List[PromptOut]:
    """List all stored Prompt Brain templates."""
    return store.list_prompts()


@router.post("", response_model=PromptOut, status_code=201)
def create_prompt(
    payload: PromptCreate,
    store: EmailStore = Depends(get_store),
) -> PromptOut:
    """Create a new custom prompt template."""
    try:
        return store.create_prompt(
            key=payload.key,
            name=payload.name,
            description=payload.description,
            template=payload.template,
        )
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail=f"Prompt key '{payload.key}' already exists")


@router.put("/{prompt_key}", response_model=PromptOut)
def update_prompt(
    prompt_key: str,
    payload: PromptUpdate,
    store: EmailStore = Depends(get_store),
) -> PromptOut:
    """Edit and save an existing Prompt Brain template."""
    updated = store.update_prompt(
        key=prompt_key,
        name=payload.name,
        description=payload.description,
        template=payload.template,
    )
    if not updated:
        raise HTTPException(status_code=404, detail=f"Prompt '{prompt_key}' not found")
    return updated


@router.delete("/{prompt_key}", status_code=204)
def delete_prompt(prompt_key: str, store: EmailStore = Depends(get_store)) -> None:
    """Delete a custom prompt (default core prompts cannot be deleted)."""
    deleted = store.delete_prompt(prompt_key)
    if not deleted:
        raise HTTPException(
            status_code=400,
            detail=f"Prompt '{prompt_key}' does not exist or is a protected default prompt",
        )


@router.post("/reset", response_model=List[PromptOut])
def reset_prompts(
    settings: Settings = Depends(get_app_settings),
    store: EmailStore = Depends(get_store),
) -> List[PromptOut]:
    """Restore default Prompt Brain templates from default_prompts.json."""
    return store.seed_default_prompts(Path(settings.default_prompts_path), overwrite=True)
