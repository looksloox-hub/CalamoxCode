# CALAMOX AI - MASTER SYSTEM SPECIFICATION & ARCHITECTURE DIRECTIVES (V2 FINAL)
====================================================================================================
SYSTEM PURPOSE: FULL-STACK AUTONOMOUS OS AGENT, CLAUDE-CODE ENGINE & JARVIS DASHBOARD
====================================================================================================

You are an expert AI Systems Architect & Full-Stack Engineer tasked with generating the complete, 
production-ready codebase for "Calamox" - an OS-level Jarvis Assistant & Claude Code-grade Developer CLI/Web Engine.

DO NOT generate mock code, placeholder comments, or basic text generators. Every single component 
must be wired to real backend execution tools (subprocess, WebSocket, file system, MCP servers).

----------------------------------------------------------------------------------------------------
1. ARCHITECTURE & TECH STACK
----------------------------------------------------------------------------------------------------
- CLI Trigger Command: `calamox`
- Installation Method: One-line `curl` script (`curl -sSL https://calamox.dev/install.sh | bash`)
- Backend Engine: Python 3.10+ (FastAPI, Uvicorn, WebSockets, asyncio, Pydantic, Playwright)
- Frontend Framework: Next.js 14 (App Router) / React, Tailwind CSS, Lucide Icons, Framer Motion
- 3D Engine: Three.js / React Three Fiber (Interactive Pulsing Holographic Blue Globe)
- Agent Orchestration: Multi-Agent Router supporting OpenRouter, Gemini, Anthropic, OpenAI, Local Ollama
- Audio / Speech: Web Audio API + Whisper/Edge-TTS for high-quality natural voice (English, Hindi, Hinglish)

----------------------------------------------------------------------------------------------------
2. TERMINAL CLI STARTUP & EXECUTION
----------------------------------------------------------------------------------------------------
1. System installs binary to PATH (`calamox`).
2. Executing `calamox` in Linux terminal runs `calamox/cli.py`.
3. `cli.py` spins up FastAPI backend on port 7860, verifies local environments, and outputs a bold ASCII logo:

====================================================================================================
  ██████╗ █████╗ ██╗      █████╗ ███╗   ███╗██████╗ ██╗  ██╗
  ██╔════╝██╔══██╗██║     ██╔══██╗████╗ ████║██╔═══██╗╚██╗██╔╝
  ██║     ███████║██║     ███████║██╔████╔██║██║   ██║ ╚███╔╝ 
  ██║     ██╔══██║██║     ██╔══██║██║╚██╔╝██║██║   ██║ ██╔██╗ 
  ╚██████╗██║  ██║███████╗██║  ██║██║ ╚═╝ ██║╚██████╔╝██╔╝ ██╗
   ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝
====================================================================================================
  [+] Calamox Jarvis Engine Booted Successfully!
  [+] Local Web UI:   http://localhost:7860
  [+] Network Web UI: http://<LOCAL_IP>:7860
====================================================================================================

----------------------------------------------------------------------------------------------------
3. HOME PAGE DASHBOARD (JARVIS HUB UI/UX)
----------------------------------------------------------------------------------------------------
Theme: Onyx Black `#0A0A0B`, Dark Charcoal `#121214`, Electric Blue `#3B82F6` glows, Crimson `#DC2626` accents.

LAYOUT STRUCTURE:
1. Resizable Right Chat Panel:
   - User can drag the left border of the right sidebar to adjust panel width (Min: 320px, Max: 700px).
   - Instant `/` Command Autocomplete Menu: Typing `/` opens a floating popup list of all available commands (`/code`, `/search`, `/research`, `/task`, `/plugin`, `/browser`, `/youtube`, `/clear`, `/session`).
   - Multilingual Voice & Audio System: Accepts Native English, Pure Hindi, and Hinglish. Speaks back with natural, high-quality audio synthesized through Edge-TTS/Whisper without artificial Hindi accents.
   - Real Code Execution Renderer: Code outputs are displayed with live terminal logs, file tree changes, and action diffs (not just static text).

2. Bottom-Left Panel (Task Manager):
   - Positioned strictly at the **Bottom-Left** region of the layout (`w-80 h-72 flex-shrink-0 z-20`).
   - Real To-Do List & Background System Job Monitor. Automatically updates when voice/chat instructs task creation.

3. Central Viewport (3D Interactive Holographic Blue Globe):
   - Built with Three.js. Bounded strictly in the center column using CSS grid/flex bounds so it NEVER overlaps sidebars.
   - Rotates smoothly, pulses dynamically in sync with audio input frequency, and displays interactive glowing data nodes.

----------------------------------------------------------------------------------------------------
4. REDESIGNED NEWS PAGE (MAP + ARTICLES + CHAT IMPORT)
----------------------------------------------------------------------------------------------------
1. Left Half (Interactive World Map):
   - Real-time Leaflet.js / Mapbox interactive dark map displaying glowing news hotspots across global coordinates.
   - Clicking a country/city pin filters the news feed for that specific region.
2. Right Half (Live News Feed):
   - Real-time global news stream aggregated via RSS and web scrapers (Tech, AI, Cyber Security, World, Business).
   - Each Article Card includes two action buttons:
     a. External Link Icon: Opens original news source in a new browser tab.
     b. "Import to Chat" Icon (Plus/Message Badge): Imports the selected article headline, link, and full content straight into the Main Chat Console so the user can ask questions or summarize it immediately.

----------------------------------------------------------------------------------------------------
5. CLAUDE CODE ENGINE & FULL OS EXECUTION CAPABILITIES
----------------------------------------------------------------------------------------------------
1. Real Code Generation & File System Builder:
   - Does NOT just print code. Writes, updates, deletes, and creates multi-file project directory trees directly on local disk using Python file operations.
2. Terminal Command Runner:
   - Executes shell/bash scripts, installs pip/npm packages, runs git commands, and streams terminal stdout/stderr straight to the UI log viewer.
3. Claude-Code Hooks, MCP & Skill Engine:
   - Full compatibility with Model Context Protocol (MCP) servers, Claude Code skills, custom python hooks, and `/plugins/` tools.
   - Calamox auto-detects installed skills in `/plugins/` and exposes them as executable function calls.
4. OS Software & Web Automation:
   - Controls local browser sessions using Playwright (scraping, form filling, YouTube automated video uploads).
   - Executes deep web research, web browsing, and multi-source data extraction autonomously.

----------------------------------------------------------------------------------------------------
6. SESSION MEMORY & 200 AGENT ROUTING MATRIX
----------------------------------------------------------------------------------------------------
1. Persistent Session Memory:
   - Chat context, active workspace state, and task history saved locally in SQLite/JSON session storage.
   - Seamlessly switch between previous chat streams without losing conversation state.
2. Intent Router (20 Groups / 200 Agents):
   - Every input prompt passes through a strict Intent Router in `agent_orchestrator.py`.
   - Task requests are routed STRICTLY to `Jarvis Master Core` or `Automation Group` (Never to random specialized marketing agents).
   - Code execution prompts are routed to `Developer Group`.

----------------------------------------------------------------------------------------------------
7. REPOSITORY CODE STRUCTURE TO GENERATE
----------------------------------------------------------------------------------------------------
calamox/
├── install.sh
├── setup.py
├── pyproject.toml
├── calamox/
│   ├── cli.py
│   ├── backend/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── os_controller.py
│   │   ├── terminal_engine.py      # Real Bash / Subprocess Executor
│   │   ├── browser_engine.py       # Playwright Web & YouTube Automation
│   │   ├── task_manager.py         # Persistent To-Do State
│   │   ├── news_engine.py         # Live News & World Coordinates
│   │   ├── agent_orchestrator.py  # Intent Router & Tool Binding
│   │   ├── mcp_bridge.py          # Claude Code Skill / MCP Compatible Engine
│   │   ├── session_manager.py     # Persistent Memory
│   │   └── agents_config.json
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── Globe3D.jsx
│       │   │   ├── TaskPanelBottom.jsx
│       │   │   ├── ResizableChatPanel.jsx
│       │   │   ├── CommandSuggestions.jsx # Slash '/' Command Menu
│       │   │   └── NewsMapModule.jsx      # Left Map + Right News + Import to Chat
│       │   └── pages/
└── plugins/
    └── sample_mcp_skill.py

----------------------------------------------------------------------------------------------------
EXECUTION INSTRUCTION FOR AI CODING AGENT:
Build the entire project strictly following this document. Enforce fixed CSS constraints to eliminate 
layout overlapping. Bind all user actions directly to backend python execution tools. Ensure Hinglish 
and Hindi voice interactions use natural audio synthesis.
Also use all the available skills and agents and plugins