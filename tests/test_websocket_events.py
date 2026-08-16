"""Tests for the real-time WebSocket event broadcast."""

import json

import pytest
from fastapi.testclient import TestClient

from calamox.backend import task_manager
from calamox.backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def isolated_tasks(tmp_path, monkeypatch):
    monkeypatch.setattr(task_manager, "TASKS_FILE", tmp_path / "tasks.json")
    yield


def test_ws_receives_task_created_event(client):
    with client.websocket_connect("/ws") as ws:
        client.post("/api/tasks", json={"title": "ws broadcast task"})
        data = json.loads(ws.receive_text())
        assert data["type"] == "tasks_updated"


def test_ws_receives_task_completed_event(client):
    task = client.post("/api/tasks", json={"title": "ws complete task"}).json()
    with client.websocket_connect("/ws") as ws:
        client.post(f"/api/tasks/{task['id']}/complete")
        data = json.loads(ws.receive_text())
        assert data["type"] == "tasks_updated"
        assert data.get("stats", {}).get("completed") == 1


def test_ws_receives_agent_activity_from_direct_action(client):
    with client.websocket_connect("/ws") as ws:
        client.post("/api/chat", json={"message": "run echo ws-probe"})
        # agent_activity is published before the HTTP response returns
        data = json.loads(ws.receive_text())
        assert data["type"] == "agent_activity"
