"""Tests for news geo hotspots, region filtering, TTS endpoint, and new slash commands."""

import pytest
from fastapi.testclient import TestClient

from calamox.backend import task_manager
from calamox.backend.main import app
from calamox.backend.news_engine import attach_location


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def isolated_tasks(tmp_path, monkeypatch):
    monkeypatch.setattr(task_manager, "TASKS_FILE", tmp_path / "tasks.json")
    yield


# ---------------------------------------------------------------------------
# News geo tagging
# ---------------------------------------------------------------------------


def test_attach_location_matches_city_in_title():
    entry = {"title": "Markets rally in Mumbai as Sensex hits record", "summary": "", "source": "CNBC"}
    tagged = attach_location(entry)
    assert tagged["location"] is not None
    assert tagged["location"]["name"] == "Mumbai"
    assert tagged["region"] == "Mumbai"
    assert tagged["location"]["lat"] is not None
    assert tagged["location"]["lng"] is not None


def test_attach_location_matches_country():
    entry = {"title": "New policy announced in India", "summary": "", "source": "BBC"}
    tagged = attach_location(entry)
    assert tagged["location"]["name"] == "India"
    assert tagged["region"] == "India"


def test_attach_location_falls_back_to_publisher():
    entry = {"title": "Tech startup funding round closes", "summary": "no geo keyword here", "source": "CNBC Markets"}
    tagged = attach_location(entry)
    assert tagged["location"] is not None
    assert tagged["location"]["name"] == "New York"
    assert tagged["region"] == "United States"


def test_attach_location_returns_none_for_unknown():
    entry = {"title": "Abstract economic theory paper published", "summary": "", "source": "Some Obscure Journal"}
    tagged = attach_location(entry)
    assert tagged["location"] is None
    assert tagged["region"] is None


def test_get_news_region_filter(client):
    """Region-filtered feed only contains articles for that region."""
    data = client.get("/api/news", params={"region": "India", "limit": 50}).json()
    assert "articles" in data
    assert data.get("region") == "India"
    for a in data["articles"]:
        assert a.get("region") == "India"


def test_get_news_returns_articles_with_location_field(client):
    data = client.get("/api/news", params={"limit": 10}).json()
    assert data["total"] > 0
    for a in data["articles"]:
        assert "location" in a  # may be None for unknown geo
        assert "region" in a


# ---------------------------------------------------------------------------
# TTS endpoint
# ---------------------------------------------------------------------------


def test_tts_returns_400_without_text(client):
    r = client.post("/api/tts", json={"text": ""})
    assert r.status_code == 400


def test_tts_501_when_edge_tts_missing(client, monkeypatch):
    """Without edge-tts installed the endpoint returns 501 so the UI can fall back."""
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "edge_tts":
            raise ImportError("edge-tts not installed")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    r = client.post("/api/tts", json={"text": "hello world", "lang": "en-IN"})
    assert r.status_code == 501
    assert "edge-tts" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# New slash commands
# ---------------------------------------------------------------------------


def test_slash_search(client):
    r = client.post("/api/chat", json={"message": "/search pytest"})
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert "Search results" in r.json()["response"]


def test_slash_research(client):
    r = client.post("/api/chat", json={"message": "/research quantum computing"})
    assert r.status_code == 200
    assert r.json()["status"] == "success"
    assert "research" in r.json()["response"].lower()


def test_slash_session(client):
    r = client.post("/api/chat", json={"message": "/session"})
    assert r.status_code == 200
    assert "session" in r.json()["response"].lower()


def test_slash_clear(client):
    r = client.post("/api/chat", json={"message": "/clear"})
    assert r.status_code == 200
    assert r.json()["status"] == "success"


def test_slash_help_lists_new_commands(client):
    r = client.post("/api/chat", json={"message": "/help"})
    body = r.json()["response"]
    assert "/search" in body
    assert "/session" in body
    assert "/clear" in body


# ---------------------------------------------------------------------------
# Structured execution payload
# ---------------------------------------------------------------------------


def test_code_response_includes_execution_payload(client):
    r = client.post("/api/chat", json={"message": "/code echo structured-probe"})
    assert r.status_code == 200
    body = r.json()
    exec_payload = body.get("execution")
    assert exec_payload is not None
    assert exec_payload["command"] == "echo structured-probe"
    assert exec_payload["exit_code"] == 0
    assert "structured-probe" in exec_payload["stdout"]
    assert "stderr" in exec_payload
    assert exec_payload["duration_ms"] is not None


def test_direct_execute_bash_includes_execution_payload(client):
    r = client.post("/api/chat", json={"message": "run echo direct-exec-probe"})
    body = r.json()
    assert body["tool"] == "execute_bash"
    exec_payload = body.get("execution")
    assert exec_payload is not None
    assert exec_payload["exit_code"] == 0
    assert "direct-exec-probe" in exec_payload["stdout"]


def test_bridge_result_keys_normalized_to_snake_case(monkeypatch):
    """The Node bridge returns camelCase keys; run_command must normalize them."""
    import asyncio

    from calamox.backend import os_controller

    class FakeBridge:
        async def is_available(self, force=False):
            return True

        async def exec_command(self, command, cwd=None, timeout_ms=120000, env=None):
            return {"stdout": "ok", "stderr": "", "exitCode": 0, "timedOut": False, "durationMs": 12}

    monkeypatch.setattr(os_controller, "bridge", FakeBridge())
    result = asyncio.run(os_controller.run_command("echo hi"))
    assert result["source"] == "bridge"
    assert result["exit_code"] == 0
    assert result["duration_ms"] == 12
    assert result["timed_out"] is False
