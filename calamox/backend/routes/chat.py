"""Chat routes — the LLM conversation endpoint.

This is the hub that makes the assistant actually *do* things: it takes a
user message, talks to a provider's OpenAI-compatible /chat/completions
endpoint (via the already-installed `openai` SDK), and lets the model call
real tools — run a shell command, read/write/edit files, manage tasks, fetch
news. No external LLM abstraction library is required; every supported
provider is OpenAI-compatible so we just swap the base_url + api_key.

Free-tier models sometimes can't emit structured tool_calls, so we also parse
a `<tool_call>` XML fallback out of the message content.
"""

import asyncio
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter
from openai import AsyncOpenAI
from pydantic import BaseModel

from .. import config
from ..agent_orchestrator import orchestrator
from ..news_engine import get_news
from ..os_controller import (
    create_directory,
    delete_file,
    edit_file,
    get_system_diagnostics,
    list_directory,
    read_file,
    rename_file,
    run_command,
    write_file,
)
from ..task_manager import create_task

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Provider configuration — every provider is OpenAI-compatible.
# ---------------------------------------------------------------------------

PROVIDER_CONFIG = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key_field": "OPENROUTER_API_KEY",
        "default_model": "openai/gpt-4o-mini",
        "label": "OpenRouter",
        "models": [
            "openai/gpt-4o-mini",
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
            "meta-llama/llama-3.1-8b-instruct",
            "google/gemini-flash-1.5",
        ],
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "key_field": "OPENAI_API_KEY",
        "default_model": "gpt-4o-mini",
        "label": "OpenAI",
        "models": ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o3-mini"],
    },
    "opencode_zen": {
        "base_url": "https://opencode.ai/zen/v1",
        "key_field": "OPENCODE_ZEN_API_KEY",
        "default_model": "auto",
        "label": "OpenCode Zen",
        "models": ["auto", "claude-sonnet", "gpt-4o", "llama-3.1-70b"],
    },
    "google_gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai",
        "key_field": "GOOGLE_GEMINI_API_KEY",
        "default_model": "gemini-1.5-flash",
        "label": "Google Gemini",
        "models": ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash"],
    },
    "anthropic": {
        "base_url": "https://api.anthropic.com/v1",
        "key_field": "ANTHROPIC_API_KEY",
        "default_model": "claude-3-5-sonnet-latest",
        "label": "Anthropic",
        "models": ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_field": "GROQ_API_KEY",
        "default_model": "llama-3.1-8b-instant",
        "label": "Groq",
        "models": ["llama-3.1-8b-instant", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    },
}


def _resolve_key(provider: str) -> Optional[str]:
    """Return the API key for a provider: explicit env, then stored keys file."""
    cfg = PROVIDER_CONFIG.get(provider)
    if not cfg:
        return None
    key = config.settings.model_dump().get(cfg["key_field"].lower()) or getattr(
        config.settings, cfg["key_field"].lower(), None
    )
    if key:
        return key
    stored = config.load_api_keys()
    return stored.get(provider) or stored.get(cfg["key_field"])


# ---------------------------------------------------------------------------
# Tool schema (OpenAI function-calling format).
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Execute a shell command on the host OS and return stdout/stderr/exit code. Use for anything the terminal can do.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "The shell command to run."},
                    "cwd": {"type": "string", "description": "Optional working directory."},
                    "timeout": {"type": "integer", "description": "Timeout seconds (default 120)."},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a text file from the filesystem.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file with the given content. Parents are created automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Replace an exact substring inside a file (surgical edit).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_string": {"type": "string"},
                    "new_string": {"type": "string"},
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List files and subdirectories in a directory.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string", "description": "Defaults to current dir."}},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a directory (and parents) if missing.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a single file (refuses directories).",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_news",
            "description": "Fetch the latest news headlines by category and region.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "e.g. technology, world, business."},
                    "region": {"type": "string", "description": "e.g. in, us, gb."},
                    "limit": {"type": "integer", "description": "Max items (default 10)."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_task",
            "description": "Create a task/reminder in the user's task list.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "description": "low|medium|high"},
                    "due_date": {"type": "string", "description": "ISO date or natural date, optional."},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "system_info",
            "description": "Return host system diagnostics (CPU, memory, disk, OS).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


# ---------------------------------------------------------------------------
# Tool execution
# ---------------------------------------------------------------------------

async def _dispatch_tool(name: str, args: dict) -> str:
    """Run a named tool and return a compact string result."""
    try:
        if name == "run_command":
            r = await run_command(
                args.get("command", ""),
                cwd=args.get("cwd"),
                timeout=args.get("timeout", 120),
            )
            out = f"exit={r.get('exit_code')} (took {r.get('duration_ms')}ms)\n"
            if r.get("stdout"):
                out += r["stdout"][:4000]
            if r.get("stderr"):
                out += "\nSTDERR:\n" + r["stderr"][:2000]
            return out.strip() or "(no output)"
        if name == "read_file":
            r = await read_file(args.get("path", ""))
        elif name == "write_file":
            r = await write_file(args.get("path", ""), args.get("content", ""))
        elif name == "edit_file":
            r = await edit_file(
                args.get("path", ""), args.get("old_string", ""), args.get("new_string", "")
            )
        elif name == "list_directory":
            r = await list_directory(args.get("path", "."))
        elif name == "create_directory":
            r = await create_directory(args.get("path", ""))
        elif name == "delete_file":
            r = await delete_file(args.get("path", ""))
        elif name == "rename_file":
            r = await rename_file(args.get("path", ""), args.get("new_path", ""))
        elif name == "get_news":
            items = await get_news(
                categories=[args["category"]] if args.get("category") else None,
                region=args.get("region", "in"),
                total_limit=args.get("limit", 10),
            )
            return json.dumps(items, ensure_ascii=False)[:4000] if items else "No news found."
        elif name == "add_task":
            r = await create_task(
                title=args.get("title", "Untitled"),
                description=args.get("description", ""),
                priority=args.get("priority", "medium"),
                due_date=args.get("due_date"),
            )
            return f"Task created: {r.get('id')} — {r.get('title')}"
        elif name == "system_info":
            r = await get_system_diagnostics()
            return json.dumps(r, ensure_ascii=False, default=str)[:2000]
        else:
            return f"Unknown tool: {name}"
        return json.dumps(r, ensure_ascii=False, default=str)[:4000]
    except Exception as e:  # surface failures to the model rather than crashing
        return f"Tool error: {e}"


def _get_provider_key(provider: str) -> Optional[str]:
    """Return the API key for a provider. Alias for _resolve_key."""
    return _resolve_key(provider)


# ---------------------------------------------------------------------------
# Free-tier models may emit tool calls as plain XML like:
#   <tool_call name="run_command"><param name="command">ls -la</param></tool_call>
# ---------------------------------------------------------------------------

_XML_CALL_RE = re.compile(
    r"<tool_call\s+name=\"([^\"]+)\"[^>]*>(.*?)</tool_call>", re.DOTALL
)
_PARAM_RE = re.compile(r"<param\s+name=\"([^\"]+)\"[^>]*>(.*?)</param>", re.DOTALL)


def _parse_xml_tool_calls(content: str) -> list[dict]:
    calls = []
    for m in _XML_CALL_RE.finditer(content):
        name = m.group(1)
        body = m.group(2)
        args = {k: v.strip() for k, v in _PARAM_RE.findall(body)}
        calls.append({"name": name, "args": args})
    return calls


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    model: Optional[str] = None
    provider: Optional[str] = "openrouter"
    agent_id: Optional[str] = None
    history: Optional[list[dict]] = None


class ChatResponse(BaseModel):
    response: str
    agent: Optional[dict] = None
    routing: Optional[dict] = None
    executed: bool = False
    tool: Optional[str] = None
    status: str = "ok"
    error: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/models")
async def list_models():
    """Return available providers + their models for the model selector."""
    providers = []
    stored = config.load_api_keys()
    for pid, cfg in PROVIDER_CONFIG.items():
        key = stored.get(pid) or stored.get(cfg["key_field"])
        providers.append(
            {
                "id": pid,
                "label": cfg["label"],
                "has_key": bool(key or _resolve_key(pid)),
                "default_model": cfg["default_model"],
                "models": [{"id": m, "name": m} for m in cfg["models"]],
            }
        )
    return {"providers": providers, "default_provider": "openrouter"}


async def _run_tools(messages: list[dict], provider: str, model: str, api_key: str) -> tuple[str, Optional[str], Optional[str], bool]:
    """Single model round that performs up to N tool-call iterations."""
    client = AsyncOpenAI(api_key=api_key, base_url=PROVIDER_CONFIG[provider]["base_url"])
    tool_name = None
    last_content = ""
    executed = False

    for _ in range(5):  # bound the tool loop
        resp = await client.chat.completions.create(
            model=model,
            messages=messages,
            tools=TOOLS,
            tool_choice="auto",
        )
        choice = resp.choices[0]
        msg = choice.message
        last_content = msg.content or ""
        messages.append(
            {
                "role": "assistant",
                "content": last_content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                    }
                    for tc in (msg.tool_calls or [])
                ]
                or None,
            }
        )

        calls = []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append({"id": tc.id, "name": tc.function.name, "args": args})

        # Fallback: parse <tool_call> XML from content for free-tier models
        if not calls and last_content:
            for xc in _parse_xml_tool_calls(last_content):
                calls.append({"id": f"xml_{xc['name']}", "name": xc["name"], "args": xc["args"]})

        if not calls:
            break

        executed = True
        tool_name = calls[0]["name"]
        for call in calls:
            result = await _dispatch_tool(call["name"], call["args"])
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call["id"],
                    "content": result,
                }
            )
        # continue loop so the model can summarise the tool results

    return last_content, tool_name, provider, executed


@router.post("")
async def chat(req: ChatRequest):
    """Handle a chat message: route → LLM → tools → final answer."""
    provider = req.provider or config.settings.default_llm_provider
    if provider not in PROVIDER_CONFIG:
        provider = "openrouter"
    model = req.model or PROVIDER_CONFIG[provider]["default_model"]
    api_key = _resolve_key(provider)

    if not api_key:
        return ChatResponse(
            response=(
                "No API key configured for provider '%s'. Add one in Settings "
                "(Settings → API Keys) or set the %s environment variable."
                % (provider, PROVIDER_CONFIG[provider]["key_field"])
            ),
            status="no_api_key",
            provider=provider,
            model=model,
        )

    # Routing: explicit agent system prompt or intent-based default.
    agent = None
    routing = None
    if req.agent_id:
        agent = orchestrator.get_agent(req.agent_id)
    if agent:
        system = agent["system_prompt"]
        agent_meta = {"id": agent["id"], "name": agent["name"]}
    else:
        routing = orchestrator.route_prompt(req.message)
        system = (
            "You are Calamox, a capable OS-level Jarvis assistant. You can execute "
            "real shell commands, read/write/edit files, manage tasks, and fetch news "
            "using the tools provided. When the user asks you to do something concrete, "
            "call the appropriate tool. Keep answers concise and actionable."
        )
        agent_meta = {"id": "master_orchestrator", "name": routing.get("suggested_agent_name", "Master Orchestrator")}

    messages = [{"role": "system", "content": system}]
    for h in req.history or []:
        role = h.get("role")
        if role in ("user", "assistant"):
            messages.append({"role": role, "content": h.get("content", "")})
    messages.append({"role": "user", "content": req.message})

    try:
        content, tool_name, used_provider, executed = await _run_tools(
            messages, provider, model, api_key
        )
    except Exception as e:
        logger.exception("Chat completion failed")
        return ChatResponse(
            response=f"Chat request failed: {e}",
            status="error",
            error=str(e),
            provider=provider,
            model=model,
        )

    return ChatResponse(
        response=content or "(no response)",
        agent=agent_meta,
        routing=routing,
        executed=executed,
        tool=tool_name,
        status="ok",
        provider=used_provider,
        model=model,
    )
