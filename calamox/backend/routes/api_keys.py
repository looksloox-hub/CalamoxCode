"""API Key management routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import load_api_keys, save_api_keys

router = APIRouter()

KNOWN_PROVIDERS = [
    {"id": "openai", "name": "OpenAI", "env_var": "OPENAI_API_KEY"},
    {"id": "anthropic", "name": "Anthropic", "env_var": "ANTHROPIC_API_KEY"},
    {"id": "openrouter", "name": "OpenRouter", "env_var": "OPENROUTER_API_KEY"},
    {"id": "opencode_zen", "name": "OpenCode Zen", "env_var": "OPENCODE_ZEN_API_KEY"},
    {"id": "google_gemini", "name": "Google Gemini", "env_var": "GOOGLE_GEMINI_API_KEY"},
    {"id": "groq", "name": "Groq", "env_var": "GROQ_API_KEY"},
    {"id": "ollama", "name": "Ollama (Local)", "env_var": "OLLAMA_BASE_URL"},
]


class ApiKeyUpdate(BaseModel):
    provider: str
    key: str


@router.get("")
async def list_providers():
    """List all known providers and their key status."""
    keys = load_api_keys()
    return {
        "providers": [
            {
                **p,
                "has_key": bool(keys.get(p["id"])),
                "key_preview": (keys.get(p["id"], "")[:8] + "...") if keys.get(p["id"]) else None,
            }
            for p in KNOWN_PROVIDERS
        ]
    }


@router.post("")
async def save_key(update: ApiKeyUpdate):
    """Save an API key for a provider."""
    provider = next((p for p in KNOWN_PROVIDERS if p["id"] == update.provider), None)
    if not provider:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {update.provider}")
    keys = load_api_keys()
    keys[update.provider] = update.key
    save_api_keys(keys)
    return {"success": True, "provider": update.provider, "key_preview": update.key[:8] + "..."}


@router.delete("/{provider}")
async def delete_key(provider: str):
    """Delete an API key for a provider."""
    keys = load_api_keys()
    if provider in keys:
        del keys[provider]
        save_api_keys(keys)
        return {"success": True, "provider": provider}
    raise HTTPException(status_code=404, detail=f"No key found for: {provider}")
