"""Tests for the Agent Orchestrator intent classifier and routing."""

from calamox.backend.agent_orchestrator import orchestrator


def test_task_prompt_routes_to_task_reminder():
    r = orchestrator.route_prompt("add a task to the marketing funnel")
    assert r["intent"] == "task_management"
    assert r["suggested_group"] == "jarvis_master"
    assert r["suggested_agent"] == "task_reminder"


def test_remind_routes_to_task_reminder():
    r = orchestrator.route_prompt("remind me to call the bank at 5pm")
    assert r["intent"] == "task_management"
    assert r["suggested_agent"] == "task_reminder"


def test_todo_routes_to_task_reminder():
    r = orchestrator.route_prompt("todo: buy groceries")
    assert r["intent"] == "task_management"
    assert r["suggested_agent"] == "task_reminder"


def test_task_beats_marketing_keywords():
    """The reported bug: a task request must never route to a marketing agent."""
    r = orchestrator.route_prompt("add a task to the marketing funnel for q3")
    assert r["intent"] == "task_management"
    assert r["suggested_group"] == "jarvis_master"
    assert r["suggested_agent"] == "task_reminder"


def test_code_prompt_routes_to_developer():
    r = orchestrator.route_prompt("fix this python bug in my script")
    assert r["intent"] == "code_execution"
    assert r["suggested_group"] == "developer"
    assert r["suggested_agent"] == "python_dev"


def test_web_search_routes_to_web_scraping():
    r = orchestrator.route_prompt("search the web for latest AI news")
    assert r["intent"] == "web_search"
    assert r["suggested_group"] == "web_scraping"


def test_os_automation_routes():
    r = orchestrator.route_prompt("create a backup of my files")
    assert r["intent"] == "os_automation"
    assert r["suggested_group"] == "automation_os"


def test_data_analytics_strong_match():
    r = orchestrator.route_prompt("analyze this dataset for anomalies")
    assert r["intent"] == "specialized"
    assert r["suggested_group"] == "data_analytics"


def test_uncertain_falls_back_to_master_orchestrator():
    r = orchestrator.route_prompt("what is the meaning of life")
    assert r["intent"] == "general"
    assert r["suggested_group"] == "jarvis_master"
    assert r["suggested_agent"] == "master_orchestrator"
    assert r["routing"] == "fallback"


def test_ambiguous_prompt_falls_back_to_jarvis():
    """An ambiguous request with no clear intent defaults to Jarvis Core."""
    r = orchestrator.route_prompt("hey there, can you do something for me")
    assert r["suggested_group"] == "jarvis_master"
    assert r["suggested_agent"] == "master_orchestrator"


def test_news_intent_routes_to_news_curator():
    r = orchestrator.route_prompt("show me the latest news")
    assert r["intent"] == "news"
    assert r["suggested_group"] == "jarvis_master"
    assert r["suggested_agent"] == "news_curator"


def test_newsletter_does_not_trigger_news_intent():
    """Substring guard: 'news' inside 'newsletter' must not route to news."""
    r = orchestrator.route_prompt("write a newsletter for my startup")
    assert r["intent"] != "news"


def test_finance_intent_routes_to_finance_group():
    r = orchestrator.route_prompt("create a monthly budget for my business")
    assert r["intent"] == "finance"
    assert r["suggested_group"] == "finance_business"


def test_design_intent_routes_to_designer_group():
    r = orchestrator.route_prompt("design a logo for my brand")
    assert r["intent"] == "design"
    assert r["suggested_group"] == "designer_creative"


def test_profile_does_not_trigger_os_automation():
    """Substring guard: 'file' inside 'profile' must not route to OS automation."""
    r = orchestrator.route_prompt("write a profile summary for me")
    assert r["intent"] != "os_automation"


def test_tools_bound_per_intent():
    assert orchestrator.tools_for_intent("task_management") == ["add_task"]
    # Code/OS intents get bash plus the Claude-Code-style file tools
    assert "execute_bash" in orchestrator.tools_for_intent("code_execution")
    assert "write_file" in orchestrator.tools_for_intent("code_execution")
    assert "read_file" in orchestrator.tools_for_intent("os_automation")
    assert orchestrator.tools_for_intent("web_search") == ["run_browser"]
    assert orchestrator.tools_for_intent("news") == ["get_news"]
    assert orchestrator.tools_for_intent("finance") == []
    assert orchestrator.tools_for_intent("general") == []


def test_explicit_agent_id_resolution():
    agent = orchestrator.get_agent("task_reminder")
    assert agent is not None
    assert agent["name"] == "Task Reminder Agent"
    assert agent["group_name"] == "Jarvis Master Core Group"


def test_stats_consistent():
    stats = orchestrator.get_stats()
    assert stats["total_agents"] == 200
    assert stats["total_groups"] == 20
    assert sum(g["count"] for g in stats["groups"]) == 200
