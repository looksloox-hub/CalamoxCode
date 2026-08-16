"""Calamox backend configuration — loads settings from environment / .env."""

import json
from pathlib import Path
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings


class CalamoxSettings(BaseSettings):
    """Global settings for the Calamox backend."""

    # Server
    host: str = "0.0.0.0"
    port: int = 7860
    debug: bool = False

    # AI Providers
    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: Optional[str] = Field(default=None, alias="ANTHROPIC_API_KEY")
    openrouter_api_key: Optional[str] = Field(default=None, alias="OPENROUTER_API_KEY")
    google_gemini_api_key: Optional[str] = Field(default=None, alias="GOOGLE_GEMINI_API_KEY")
    opencode_zen_api_key: Optional[str] = Field(default=None, alias="OPENCODE_ZEN_API_KEY")
    groq_api_key: Optional[str] = Field(default=None, alias="GROQ_API_KEY")

    # Default model
    default_llm_provider: str = "openrouter"
    default_model: str = "openai/gpt-4o-mini"

    # Paths
    data_dir: Path = Path.home() / ".calamox"
    plugins_dir: Path = Path(__file__).resolve().parent.parent.parent / "plugins"
    frontend_dist: Path = Path(__file__).resolve().parent.parent / "frontend" / "dist"

    # Browser
    browser_headless: bool = True
    browser_timeout: int = 30000

    model_config = {"env_prefix": "CALAMOX_", "env_file": ".env", "extra": "ignore"}

    @property
    def api_keys_file(self) -> Path:
        return self.data_dir / "api_keys.json"

    @property
    def sessions_dir(self) -> Path:
        return self.data_dir / "sessions"

    def model_post_init(self, __context) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.sessions_dir.mkdir(parents=True, exist_ok=True)


settings = CalamoxSettings()


def get_agent_config() -> list[dict]:
    """Load the agents_config.json and return the list of agent groups."""
    config_path = Path(__file__).resolve().parent / "agents_config.json"
    if not config_path.exists():
        return []
    with open(config_path) as f:
        data = json.load(f)
    return data if isinstance(data, list) else data.get("groups", [])


def get_all_agents_flat() -> list[dict]:
    """Return a flat list of all agents across all groups."""
    groups = get_agent_config()
    agents = []
    for group in groups:
        for agent in group.get("agents", []):
            agent["group_name"] = group.get("name", "")
            agent["group_id"] = group.get("id", "")
            agents.append(agent)
    return agents


def load_api_keys() -> dict:
    """Load stored API keys from the keys file."""
    if settings.api_keys_file.exists():
        with open(settings.api_keys_file) as f:
            return json.load(f)
    return {}


def save_api_keys(keys: dict) -> None:
    """Persist API keys to the keys file."""
    settings.api_keys_file.parent.mkdir(parents=True, exist_ok=True)
    with open(settings.api_keys_file, "w") as f:
        json.dump(keys, f, indent=2)
