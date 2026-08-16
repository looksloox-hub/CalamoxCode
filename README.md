# 👑 Calamox AI

A full-stack autonomous AI assistant with 200 specialized agents across 20 groups, a FastAPI backend, React dashboard, voice commands, browser automation, and a Node.js execution bridge.

## Quick Start

```bash
# One-liner install (system deps + Python backend + dashboard + bridge)
curl -sSL https://raw.githubusercontent.com/user/calamox/main/install.sh | bash

# …or install the pieces manually
pip install -e ".[all]"

# Start the Calamox server (dashboard at http://localhost:7860)
calamox

# Optional: start the Node.js execution bridge (http://localhost:3000)
npm install && npm run build && npm start
```

The `calamox` command prints the JARVIS banner and starts the FastAPI backend, serving the
built React dashboard on port 7860 automatically.

## Architecture

```
┌─────────────────────────────────────────────┐
│              React Dashboard                │
│          http://localhost:7860               │
│  JarvisHub(3D Globe) · Chat · Tasks · News  │
│          Agents · Voice · APIKeys           │
└──────────────────┬──────────────────────────┘
                   │ REST API + WebSocket
┌──────────────────┴──────────────────────────┐
│           FastAPI Backend (Python)           │
│   200 agents · OS control · Browser · News  │
│   Plugin engine · Task manager · Sessions    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│     Node.js Execution Bridge (:3000)         │
│     Terminal exec · Puppeteer browser        │
└─────────────────────────────────────────────┘
```

## 🤖 200 Agents / 20 Groups

| # | Group | Agents | Focus |
|---|-------|--------|-------|
| 1 | 💻 Developer | 10 | Python, JS/TS, DevOps, Security, DB, API, Testing, Docker, CI/CD |
| 2 | 📱 Social Media | 10 | Twitter, LinkedIn, YouTube, Instagram, TikTok, Community |
| 3 | 🎨 Designer & Creative | 10 | UI/UX, CSS, SVG, Design Systems, Typography, Animation |
| 4 | 🔍 Research & Intelligence | 10 | Deep Research, Fact-Check, Papers, Competitive Intel |
| 5 | ✍️ Content & Writing | 10 | Technical Writing, Blog, Copywriting, SEO, Ghostwriting |
| 6 | 🛡️ Security & Hacking | 10 | Vuln Scanner, Pentest, Encryption, Compliance, Threat Modeling |
| 7 | 📊 Data & Analytics | 10 | Pandas, SQL, Visualization, ML Pipelines, Anomaly Detection |
| 8 | 🎙️ Audio & Speech | 10 | Voice Commands, TTS, Podcast Scripts, Sound Design |
| 9 | ⚙️ Automation & OS | 10 | Bash Scripts, Cron, File Manager, System Health, Backups |
| 10 | 📈 Marketing & Growth | 10 | Funnels, Ad Copy, Email Marketing, SEO, CRO |
| 11 | 📋 Operations & Admin | 10 | Scheduling, SOPs, Process Mapping, Compliance |
| 12 | 👥 HR & Talent | 10 | Job Descriptions, Resume Review, Interviews, Onboarding |
| 13 | 🧪 QA & Testing | 10 | Unit Tests, E2E, Load Testing, Accessibility |
| 14 | 💰 Finance & Business | 10 | Financial Modeling, Budgets, Pricing, Valuation |
| 15 | 🎯 Productivity & Life | 10 | Time Management, Habits, Goals, Knowledge Graphs |
| 16 | 🤖 AI & Prompt Engineering | 10 | Prompt Design, RAG, Fine-tuning, Model Evaluation |
| 17 | 👔 Executive Assistant | 10 | Briefings, Strategy, Crisis Comms, KPI Dashboards |
| 18 | 🕸️ Web Scraping & Control | 10 | DOM Inspection, Crawling, RSS, Media Download |
| 19 | 🔌 Plugin & Extension | 10 | Plugin Generator, Middleware, Hooks, Sandboxing |
| 20 | 👑 Jarvis Master Core | 10 | OS Router, Orchestrator, Context Memory, Error Fixer |

Each agent has a unique system prompt, defined in `calamox/backend/agents_config.json`.

## 🖥️ Dashboard Features

- **Jarvis Hub (Home)** — interactive 3D holographic globe (Three.js/WebGL) in the center that rotates, pulses with voice input, and renders agent-activity data nodes; Task Panel pinned bottom-left; resizable Chat & Voice console on the right (drag the border, 320–700px)
- **Task Manager** — create, filter, complete, and delete tasks with priorities; auto-adds tasks from voice/text commands
- **Live News** — redesigned page with a dark interactive Leaflet world map of glowing news hotspots on the left (click a pin to filter by region) and the live feed on the right, with external-link and **Import to Chat** buttons on every article
- **API Key Manager** — store keys for OpenAI, Anthropic, OpenRouter, OpenCode Zen, Google Gemini, Groq, Ollama, YouTube
- **Prompt Library** — searchable templates with copy-to-clipboard
- **Voice Controller** — multilingual (English, Hindi, Hinglish) mic via Web Speech API; natural Text-to-Speech replies via backend Edge-TTS (with Web Speech API fallback)
- **Slash Commands** — `/code`, `/research`, `/task`, `/plugin`, `/news`, `/browser`, `/youtube`, `/help`
- **YouTube Automation** — ffprobe metadata parsing + headless-Chromium upload workflow with job tracking
- **Real-time Health** — WebSocket + polling for backend status

## 📡 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard UI |
| GET | `/api/health` | Health check |
| GET | `/api/info` | Service info |
| POST | `/api/tts` | Synthesize natural speech via Edge-TTS (en/hi) |
| GET | `/api/agents/groups/{id}` | Group with agents |
| GET | `/api/agents/` | List all 200 agents |
| GET | `/api/agents/search/{query}` | Search agents |
| POST | `/api/agents/dispatch` | Route prompt to best agent |
| GET/POST | `/api/tasks` | List / create tasks |
| POST | `/api/tasks/{id}/complete` | Mark task done |
| DELETE | `/api/tasks/{id}` | Delete task |
| GET | `/api/news` | Aggregated news |
| GET | `/api/keys` | List API key providers |
| POST | `/api/keys` | Save API key |
| GET/POST | `/api/sessions` | Chat sessions |
| POST | `/api/chat` | Chat (LLM via OpenRouter / OpenCode Zen / Google Gemini + slash commands) |
| GET | `/api/youtube/check` | YouTube automation engine status |
| POST | `/api/youtube/metadata` | Parse video metadata via ffprobe |
| POST | `/api/youtube/upload` | Queue a video upload job |
| GET | `/api/youtube/jobs` | List upload jobs |
| WS | `/ws` | WebSocket (real-time) |

## 🔌 Plugin System

Drop Python scripts into the `plugins/` directory. Calamox auto-discovers them on startup:

```python
# plugins/my_plugin.py
PLUGIN_NAME = "My Tool"
PLUGIN_DESCRIPTION = "Does something useful."

def my_function(param: str) -> str:
    return f"Result: {param}"
```

## ⌨️ Slash Commands

Type any of these in the Chat panel or Jarvis Hub console:

| Command | Action |
|---------|--------|
| `/code <cmd>` | Run a shell command on this machine (live terminal renderer) |
| `/search <query>` | Search the web |
| `/research <topic>` | Deep-research a topic |
| `/task <title>` | Create a task in the Task Manager |
| `/plugin [name fn k=v]` | List plugins or call a plugin function |
| `/news [category]` | Fetch live headlines (tech, ai, world, finance, security) |
| `/browser <url>` | Fetch and summarize a web page |
| `/youtube` | YouTube upload automation status |
| `/session` | List saved chat sessions |
| `/clear` | Clear the conversation |
| `/help` | List all commands |

Typing `/` in the Chat console opens a live autocomplete menu of all commands.

## 🎬 YouTube Automation

Calamox can automate YouTube uploads end-to-end: parse a local video's metadata with
ffprobe, then drive YouTube Studio in headless Chromium (Python Playwright, or the Node
bridge). Jobs are tracked through `queued → preparing → uploading → processing → published`
and surfaced via `/api/youtube/jobs`. Configure credentials with
`CALAMOX_YT_EMAIL` / `CALAMOX_YT_PASSWORD` (or the API Keys page).

## 🛡️ Node.js Execution Bridge

A separate Express/TypeScript server at `:3000` providing:

- `POST /api/system/exec` — run shell commands with timeout, output caps
- `POST /api/browser/open` — headless Chromium scraping with Puppeteer
- `GET /health` — liveness probe
- Optional bearer-token auth via `CALAMOX_TOKEN`
- Dashboard UI at `http://localhost:3000/`

## Development

```bash
# Python backend (with auto-reload)
calamox --reload

# React frontend (dev server with hot reload)
cd calamox/frontend && npm run dev

# Node bridge (dev mode)
npm run dev
```

## Tech Stack

- **Backend**: Python 3.10+ / FastAPI / Uvicorn / Pydantic
- **Frontend**: React 18 / Vite / Tailwind CSS / Lucide Icons
- **Agent Engine**: 200 agents with keyword routing + LLM integration (LiteLLM optional)
- **Browser**: Playwright (Python) / Puppeteer (Node.js)
- **CLI**: `calamox` entry point via setuptools console_scripts

## License

MIT
