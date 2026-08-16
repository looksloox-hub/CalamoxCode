"""Tests for chat routes — slash commands and direct system-action execution."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from calamox.backend import task_manager
from calamox.backend.agent_orchestrator import orchestrator
from calamox.backend.main import app
from calamox.backend.routes import chat as chat_routes


@pytest.fixture(autouse=True)
def no_api_key(monkeypatch):
    """Keep tests hermetic: never hit a real LLM provider."""
    monkeypatch.setattr(chat_routes, "_get_provider_key", lambda provider: None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def isolated_tasks(tmp_path, monkeypatch):
    monkeypatch.setattr(task_manager, "TASKS_FILE", tmp_path / "tasks.json")
    yield


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_slash_help(client):
    r = client.post("/api/chat", json={"message": "/help"})
    assert r.status_code == 200
    assert "Available commands" in r.json()["response"]


def test_slash_task_creates_task(client):
    r = client.post("/api/chat", json={"message": "/task write unit tests"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "success"
    assert "Task created" in body["response"]
    tasks = client.get("/api/tasks").json()["tasks"]
    assert any(t["title"] == "write unit tests" for t in tasks)


def test_slash_code_runs_command(client):
    r = client.post("/api/chat", json={"message": "/code echo pytest-probe"})
    assert r.status_code == 200
    assert "pytest-probe" in r.json()["response"]


def test_slash_news(client):
    r = client.post("/api/chat", json={"message": "/news ai"})
    assert r.status_code == 200
    assert "headlines" in r.json()["response"].lower()


def test_slash_plugin(client):
    r = client.post("/api/chat", json={"message": "/plugin"})
    assert r.status_code == 200
    assert "plugins loaded" in r.json()["response"].lower()


def test_direct_add_task(client):
    r = client.post("/api/chat", json={"message": "add a task: clean the kitchen"})
    assert r.status_code == 200
    body = r.json()
    assert body["tool"] == "add_task"
    assert body["executed"] is True
    assert "clean the kitchen" in body["response"]
    tasks = client.get("/api/tasks").json()["tasks"]
    assert any(t["title"] == "clean the kitchen" for t in tasks)


def test_direct_remind_creates_task(client):
    r = client.post("/api/chat", json={"message": "remind me to water the plants"})
    body = r.json()
    assert body["tool"] == "add_task"
    assert "water the plants" in body["response"]


def test_direct_execute_bash(client):
    r = client.post("/api/chat", json={"message": "run echo direct-bash-probe"})
    assert r.status_code == 200
    body = r.json()
    assert body["tool"] == "execute_bash"
    assert "direct-bash-probe" in body["response"]
    assert body["executed"] is True


def test_bash_guard_rejects_non_allowlisted_command(client):
    """'run the backup script' must not be executed as a shell command."""
    r = client.post("/api/chat", json={"message": "run the backup script"})
    body = r.json()
    assert body.get("tool") != "execute_bash"


def test_direct_browser(client, monkeypatch):
    """Open-URL detection should fire run_browser without real network calls."""
    async def fake_execute(name, args):
        if name == "run_browser":
            return {
                "result": "success",
                "title": "Example Domain",
                "summary": "Fake summary for testing.",
                "url": args.get("url", ""),
            }
        raise AssertionError(f"unexpected tool: {name}")

    monkeypatch.setattr(chat_routes, "_execute_tool", fake_execute)
    r = client.post("/api/chat", json={"message": "open https://example.com"})
    body = r.json()
    assert body["tool"] == "run_browser"
    assert "Example Domain" in body["response"]


def test_general_prompt_routes_to_jarvis_without_key(client):
    r = client.post("/api/chat", json={"message": "what is the meaning of life"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "no_api_key"
    assert body["agent"]["id"] == "master_orchestrator"
    assert body["routing"]["intent"] == "general"


def test_task_hint_in_no_key_response(client):
    r = client.post("/api/chat", json={"message": "can you help me schedule my week"})
    body = r.json()
    assert body["routing"]["intent"] == "task_management"
    assert "/task" in body["response"]


# --- Provider registry: OpenCode Zen + Google Gemini ---------------------------


def test_models_endpoint_groups_all_providers(client):
    r = client.get("/api/chat/models")
    assert r.status_code == 200
    body = r.json()
    ids = {p["id"] for p in body["providers"]}
    assert ids == {"openrouter", "opencode_zen", "google_gemini"}
    # Each catalog carries its provider key for the frontend router
    for p in body["providers"]:
        for m in p["models"]:
            assert m["provider_key"] == p["id"]
    assert any(m["id"] == "deepseek-v4-flash-free" for m in body["models"])
    assert any(m["id"] == "gemini-2.5-flash" for m in body["models"])


def test_resolve_model_openrouter():
    model_str, kwargs = chat_routes._resolve_model("openrouter", "nvidia/nemotron-3.5-lightning:free")
    assert model_str == "openrouter/nvidia/nemotron-3.5-lightning:free"
    assert kwargs == {}


def test_resolve_model_gemini():
    model_str, kwargs = chat_routes._resolve_model("google_gemini", "gemini-2.5-flash")
    assert model_str == "gemini/gemini-2.5-flash"
    assert kwargs == {}


def test_resolve_model_opencode_zen():
    """Zen is OpenAI-compatible — routed via openai prefix + custom api_base."""
    model_str, kwargs = chat_routes._resolve_model("opencode_zen", "deepseek-v4-flash-free")
    assert model_str == "openai/deepseek-v4-flash-free"
    assert kwargs["api_base"] == "https://opencode.ai/zen/v1"


def test_select_provider_falls_back_to_configured_provider(monkeypatch):
    """No OpenRouter key + a Gemini key → chat uses Gemini instead of dead-ending."""
    monkeypatch.setattr(chat_routes, "_get_provider_key", lambda p: "sk-test" if p == "google_gemini" else None)
    selected = chat_routes._select_provider("openrouter")
    assert selected == ("google_gemini", "sk-test")


def test_select_provider_respects_requested_provider(monkeypatch):
    def key_for(p):
        return f"key-{p}" if p in ("openrouter", "opencode_zen") else None

    monkeypatch.setattr(chat_routes, "_get_provider_key", key_for)
    selected = chat_routes._select_provider("opencode_zen")
    assert selected[0] == "opencode_zen"


def test_select_provider_returns_none_when_no_keys(monkeypatch):
    monkeypatch.setattr(chat_routes, "_get_provider_key", lambda p: None)
    assert chat_routes._select_provider("openrouter") is None


def test_friendly_error_is_provider_aware():
    class FakeAuthError(Exception):
        pass

    msg = chat_routes._friendly_error(
        FakeAuthError("AuthenticationError: bad key"), "opencode_zen", "deepseek-v4-flash-free"
    )
    assert "OpenCode Zen" in msg
    assert "Invalid OpenCode Zen API key" in msg
    assert "OpenRouter" not in msg

    msg = chat_routes._friendly_error(
        ValueError("RateLimitError 429"), "google_gemini", "gemini-2.5-flash"
    )
    assert "Google Gemini rate limited" in msg


def test_is_fatal_llm_error_only_retries_tool_errors():
    """Auth/rate/model errors must NOT be retried as plain completions."""
    class AuthError(Exception):
        pass

    class ToolUnsupportedError(Exception):
        pass

    assert chat_routes._is_fatal_llm_error(AuthError("AuthenticationError")) is True
    assert chat_routes._is_fatal_llm_error(ValueError("RateLimitError 429")) is True
    assert chat_routes._is_fatal_llm_error(ValueError("404 model not found")) is True
    assert chat_routes._is_fatal_llm_error(
        ToolUnsupportedError("Unrecognized request argument: tools")
    ) is False


def test_chat_uses_fallback_provider_when_requested_missing(client, monkeypatch):
    """Request OpenRouter with no key, Gemini key set → request served by Gemini."""
    called = {}

    async def fake_llm(provider, api_key, model, system_prompt, user_message, tools=None):
        called["provider"] = provider
        called["model"] = model
        return {
            "response": "hello from gemini",
            "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            "tools_executed": [],
        }

    monkeypatch.setattr(
        chat_routes, "_get_provider_key", lambda p: "sk-gemini" if p == "google_gemini" else None
    )
    monkeypatch.setattr(chat_routes, "_llm_with_tools", fake_llm)
    r = client.post(
        "/api/chat", json={"message": "hello", "provider": "openrouter", "model": "gemini-2.5-flash"}
    )
    body = r.json()
    assert body["status"] == "success"
    assert called["provider"] == "google_gemini"
    assert body["provider"] == "google_gemini"


def test_no_key_response_lists_providers(client, monkeypatch):
    monkeypatch.setattr(chat_routes, "_get_provider_key", lambda p: None)
    r = client.post("/api/chat", json={"message": "hello"})
    body = r.json()
    assert body["status"] == "no_api_key"
    assert "OpenCode Zen" in body["response"]
    assert "Google Gemini" in body["response"]
    assert "API Keys page" in body["response"]


# --- File-system tools (Claude-Code style read/write/edit) -------------------


def test_code_intent_binds_file_tools():
    """Code/OS intents expose the file tools so the LLM can actually build things."""
    for intent in ("code_execution", "os_automation"):
        tools = orchestrator.tools_for_intent(intent)
        assert {"read_file", "write_file", "edit_file", "list_directory",
                "create_directory", "delete_file", "rename_file"} <= set(tools)


def test_file_tools_write_read_edit(tmp_path):
    """write_file → read_file → edit_file round-trips a real file."""
    async def run():
        f = tmp_path / "project" / "hello.py"
        w = await chat_routes._execute_tool("write_file", {
            "path": str(f), "content": "def greet():\n    return 'hi'\n",
        })
        assert w["result"] == "success"
        assert f.exists()
        assert w["size"] == f.stat().st_size

        r = await chat_routes._execute_tool("read_file", {"path": str(f)})
        assert "greet" in r["content"]
        assert r["total_lines"] == 2

        e = await chat_routes._execute_tool("edit_file", {
            "path": str(f), "old_string": "'hi'", "new_string": "'hello jarvis'",
        })
        assert e["success"] is True
        assert e["replacements"] == 1
        assert "hello jarvis" in f.read_text()
        return True

    assert asyncio.run(run())


def test_file_tools_directories_rename_delete(tmp_path):
    """create_directory, list_directory, rename_file, delete_file work together."""
    async def run():
        d = tmp_path / "project" / "src"
        c = await chat_routes._execute_tool("create_directory", {"path": str(d)})
        assert c["success"] is True
        assert d.is_dir()

        f = d / "a.txt"
        await chat_routes._execute_tool("write_file", {"path": str(f), "content": "x"})
        lst = await chat_routes._execute_tool("list_directory", {"path": str(d)})
        assert lst["count"] == 1
        assert lst["entries"][0]["name"] == "a.txt"

        mv = await chat_routes._execute_tool("rename_file", {
            "path": str(f), "new_path": str(d / "b.txt"),
        })
        assert mv["success"] is True
        assert (d / "b.txt").exists() and not f.exists()

        dl = await chat_routes._execute_tool("delete_file", {"path": str(d / "b.txt")})
        assert dl["success"] is True
        assert not (d / "b.txt").exists()
        return True

    assert asyncio.run(run())


def test_edit_file_rejects_ambiguous_match(tmp_path):
    """edit_file fails loudly when old_string appears multiple times."""
    async def run():
        f = tmp_path / "dup.txt"
        f.write_text("a\nb\na\n")
        e = await chat_routes._execute_tool("edit_file", {
            "path": str(f), "old_string": "a", "new_string": "z",
        })
        assert e["success"] is False
        assert "2 times" in e["error"]
        # replace_all resolves it
        e2 = await chat_routes._execute_tool("edit_file", {
            "path": str(f), "old_string": "a", "new_string": "z", "replace_all": True,
        })
        assert e2["success"] is True
        assert e2["replacements"] == 2
        return True

    assert asyncio.run(run())


def test_delete_file_refuses_directories(tmp_path):
    async def run():
        d = tmp_path / "keep"
        d.mkdir()
        r = await chat_routes._execute_tool("delete_file", {"path": str(d)})
        assert r["success"] is False
        assert d.is_dir()
        return True

    assert asyncio.run(run())
