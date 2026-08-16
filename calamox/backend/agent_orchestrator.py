"""Agent Orchestrator — dispatches prompts to the appropriate agent/group."""

import re
from typing import Optional

from .config import get_agent_config, get_all_agents_flat


class AgentOrchestrator:
    """Routes user prompts to the best-matching agent and manages conversations."""

    def __init__(self):
        self._groups = get_agent_config()
        self._agents = get_all_agents_flat()
        self._agent_map = {a["id"]: a for a in self._agents}

    def list_groups(self) -> list[dict]:
        """Return all agent groups with summary info."""
        return [
            {
                "id": g["id"],
                "name": g["name"],
                "icon": g["icon"],
                "description": g["description"],
                "agent_count": len(g.get("agents", [])),
            }
            for g in self._groups
        ]

    def get_group(self, group_id: str) -> Optional[dict]:
        """Get a single group with its agents."""
        for g in self._groups:
            if g["id"] == group_id:
                return g
        return None

    def get_agent(self, agent_id: str) -> Optional[dict]:
        """Get a single agent by ID."""
        return self._agent_map.get(agent_id)

    def list_agents(self, group_id: Optional[str] = None) -> list[dict]:
        """List all agents, optionally filtered by group."""
        if group_id:
            return [a for a in self._agents if a.get("group_id") == group_id]
        return self._agents

    def search_agents(self, query: str) -> list[dict]:
        """Search agents by name or description."""
        q = query.lower()
        return [
            a for a in self._agents
            if q in a["name"].lower() or q in a.get("description", "").lower()
        ]

    def build_message(self, agent_id: str, user_message: str, context: list[dict] | None = None) -> list[dict]:
        """Build a message list for an LLM call with the agent's system prompt."""
        agent = self._agent_map.get(agent_id)
        if not agent:
            return [{"role": "user", "content": user_message}]

        messages = [{"role": "system", "content": agent["system_prompt"]}]
        if context:
            messages.extend(context)
        messages.append({"role": "user", "content": user_message})
        return messages

    # ------------------------------------------------------------------
    # Intent classification — explicit router evaluated BEFORE keyword scoring.
    # System intents map STRICTLY to a fixed group/agent so prompts never get
    # sent to unrelated specialized groups (marketing/finance/etc.).
    # ------------------------------------------------------------------

    INTENT_MAP = {
        "task_management": {
            "keywords": [
                "task", "tasks", "remind", "reminder", "remind me", "schedule", "todo",
                "to-do", "to do", "deadline", "checklist", "kaam", "yaad", "karna hai",
            ],
            "group": "jarvis_master",
            "agent": "task_reminder",
            "label": "Task Management",
            "tools": ["add_task"],
        },
        "code_execution": {
            "keywords": [
                "code", "python", "javascript", "typescript", "bug", "fix", "refactor",
                "script", "bash", "shell", "compile", "function", "api", "docker",
                "deploy", "debug", "error", "syntax", "commit", "git",
            ],
            "group": "developer",
            "agent": None,  # first agent of the group
            "label": "Code Execution & Development",
            "tools": [
                "execute_bash", "read_file", "write_file", "edit_file",
                "list_directory", "create_directory", "delete_file", "rename_file",
            ],
        },
        "web_search": {
            "keywords": [
                "search", "scrape", "scraping", "crawl", "browse", "browser", "url",
                "website", "web page", "google", "find online", "fetch", "look up",
            ],
            "group": "web_scraping",
            "agent": None,
            "label": "Web Search & Scraping",
            "tools": ["run_browser"],
        },
        "os_automation": {
            "keywords": [
                "backup", "backups", "cron", "install", "uninstall", "cleanup", "disk",
                "system health", "systemctl", "folder", "directory", "directories",
                "file", "files", "memory usage", "cpu usage", "disk space", "apt",
            ],
            "group": "automation_os",
            "agent": None,
            "label": "OS & Automation",
            "tools": [
                "execute_bash", "read_file", "write_file", "edit_file",
                "list_directory", "create_directory", "delete_file", "rename_file",
            ],
        },
        "news": {
            "keywords": [
                "headline", "headlines", "breaking", "current events", "top stories",
                "daily briefing", "latest updates", "news", "updates",
            ],
            "group": "jarvis_master",
            "agent": "news_curator",
            "label": "Live News",
            "tools": ["get_news"],
        },
        "finance": {
            "keywords": [
                "finance", "financial", "budget", "revenue", "stock", "stocks", "invest",
                "investing", "roi", "pricing", "valuation", "money", "profit", "profits",
                "expense", "expenses", "cash flow",
            ],
            "group": "finance_business",
            "agent": None,
            "label": "Finance & Business",
            "tools": [],
        },
        "design": {
            "keywords": [
                "design", "logo", "ui", "ux", "color", "colour", "palette", "typography",
                "layout", "poster", "banner", "wireframe", "prototype", "style guide",
            ],
            "group": "designer_creative",
            "agent": None,
            "label": "Designer & Creative",
            "tools": [],
        },
    }

    def classify_intent(self, prompt: str) -> Optional[dict]:
        """Classify a prompt into a system intent, or None if no clear intent.

        Keywords are matched as whole words (word boundaries) so substrings like
        "news" inside "newsletter" or "file" inside "profile" never misfire.
        """
        p = prompt.lower()
        best_intent = None
        best_score = 0
        for intent_id, cfg in self.INTENT_MAP.items():
            score = sum(1 for kw in cfg["keywords"] if re.search(rf"\b{re.escape(kw)}\b", p))
            if score > best_score:
                best_intent = intent_id
                best_score = score
        if not best_intent:
            return None
        return {
            "intent": best_intent,
            "label": self.INTENT_MAP[best_intent]["label"],
            "confidence": min(best_score / 2, 0.95),
        }

    def tools_for_intent(self, intent_id: Optional[str]) -> list[str]:
        """Return the tool names bound to an intent (or all tools for general)."""
        if not intent_id or intent_id not in self.INTENT_MAP:
            return []
        return self.INTENT_MAP[intent_id].get("tools", [])

    def resolve_agent_for_intent(self, intent_id: str) -> Optional[dict]:
        """Resolve the strict group + agent for a classified intent."""
        cfg = self.INTENT_MAP.get(intent_id)
        if not cfg:
            return None
        group = self.get_group(cfg["group"])
        if not group:
            return None
        agents = group.get("agents", [])
        if not agents:
            return None
        if cfg["agent"]:
            agent = next((a for a in agents if a["id"] == cfg["agent"]), agents[0])
        else:
            agent = agents[0]
        return {
            "group": group["id"],
            "agent": {"id": agent["id"], "name": agent["name"]},
            "group_agents": [{"id": a["id"], "name": a["name"]} for a in agents],
        }

    def route_prompt(self, prompt: str) -> dict:
        """Route a prompt to the best agent — explicit intent router first.

        Intent-matched prompts go STRICTLY to their mapped group/agent.
        Unmatched prompts default to Jarvis Master Core (Master Orchestrator)
        instead of a random specialized group.
        """
        p = prompt.lower()

        # 1. Explicit intent router (task / code / web / os)
        intent = self.classify_intent(prompt)
        if intent:
            resolved = self.resolve_agent_for_intent(intent["intent"])
            if resolved:
                return {
                    "suggested_group": resolved["group"],
                    "suggested_agent": resolved["agent"]["id"],
                    "suggested_agent_name": resolved["agent"]["name"],
                    "intent": intent["intent"],
                    "intent_label": intent["label"],
                    "confidence": intent["confidence"],
                    "routing": "intent",
                    "group_agents": resolved["group_agents"],
                }

        # 2. Secondary keyword scoring for remaining specialized groups
        keyword_map = {
            "developer": ["code", "python", "javascript", "typescript", "bug", "refactor", "api", "docker", "ci/cd"],
            "social_media": ["twitter", "linkedin", "instagram", "tiktok", "social", "post", "tweet"],
            "designer_creative": ["design", "css", "ui", "ux", "logo", "color", "typography", "svg"],
            "research_intelligence": ["research", "fact", "paper", "patent", "market", "analysis"],
            "content_writing": ["write", "blog", "copy", "article", "content", "newsletter", "proofread"],
            "security_hacking": ["security", "vulnerability", "encrypt", "audit", "pentest", "firewall"],
            "data_analytics": [
                "data", "sql", "pandas", "chart", "statistics", "ml", "etl", "analyz",
                "dataset", "anomal", "dashboard", "visualiz", "csv", "spreadsheet",
                "metric", "pipeline", "forecast",
            ],
            "audio_speech": ["voice", "audio", "tts", "podcast", "speech", "music"],
            "automation_os": ["bash", "cron", "file", "system", "linux", "shell", "backup"],
            "marketing_growth": ["marketing", "seo", "funnel", "ad", "email", "conversion"],
            "operations_admin": ["schedule", "meeting", "sop", "process", "inventory"],
            "hr_talent": ["hiring", "resume", "interview", "onboarding", "employee"],
            "qa_testing": ["test", "qa", "playwright", "jest", "pytest", "e2e"],
            "finance_business": ["finance", "budget", "revenue", "roi", "pricing", "valuation"],
            "productivity_life": ["productivity", "habit", "goal", "focus", "planner"],
            "ai_prompt_eng": ["prompt", "llm", "gpt", "rag", "fine-tune", "embedding"],
            "executive_assistant": ["briefing", "strategy", "decision", "executive", "kpi"],
            "web_scraping": ["scrape", "crawl", "web", "rss", "download", "html"],
            "plugin_extension": ["plugin", "extension", "middleware", "hook", "sandbox"],
            "jarvis_master": ["calamox", "orchestrate", "coordinate", "master", "remind"],
        }

        scores = {}
        for group_id, keywords in keyword_map.items():
            score = sum(1 for kw in keywords if kw in p)
            if score > 0:
                scores[group_id] = score

        # 3. No match / uncertain → ALWAYS default to Jarvis Master Core.
        if not scores:
            return {
                "suggested_group": "jarvis_master",
                "suggested_agent": "master_orchestrator",
                "suggested_agent_name": "Master Orchestrator",
                "intent": "general",
                "intent_label": "General Assistant",
                "confidence": 0.3,
                "routing": "fallback",
                "all_groups": self.list_groups(),
            }

        best_group = max(scores, key=scores.get)
        group = self.get_group(best_group)
        agents = group.get("agents", []) if group else []
        best_score = scores[best_group]

        # Threshold: weak keyword signal also defaults to Jarvis Core
        if best_score < 2 and best_group != "jarvis_master":
            return {
                "suggested_group": "jarvis_master",
                "suggested_agent": "master_orchestrator",
                "suggested_agent_name": "Master Orchestrator",
                "intent": "general",
                "intent_label": "General Assistant",
                "confidence": max(0.3, best_score / 4),
                "routing": "fallback",
                "group_agents": [{"id": a["id"], "name": a["name"]} for a in agents],
            }

        return {
            "suggested_group": best_group,
            "suggested_agent": agents[0]["id"] if agents else None,
            "suggested_agent_name": agents[0]["name"] if agents else None,
            "intent": "specialized",
            "intent_label": group.get("name", best_group),
            "confidence": min(best_score / 3, 1.0),
            "routing": "keyword",
            "group_agents": [{"id": a["id"], "name": a["name"]} for a in agents],
        }

    def get_stats(self) -> dict:
        return {
            "total_agents": len(self._agents),
            "total_groups": len(self._groups),
            "groups": [{"id": g["id"], "name": g["name"], "count": len(g.get("agents", []))} for g in self._groups],
        }


# Singleton
orchestrator = AgentOrchestrator()
