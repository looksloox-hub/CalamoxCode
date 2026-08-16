#!/usr/bin/env bash
#
# Calamox AI — automated installer
#
# Run from anywhere:
#   curl -sSL https://raw.githubusercontent.com/user/calamox/main/install.sh | bash
#
# Installs system dependencies (Python 3.10+, Node.js, ffmpeg, Playwright browsers),
# then installs the Python backend, builds the React dashboard, and builds the
# Node.js execution bridge.

set -euo pipefail

# --- Colors -----------------------------------------------------------------
C_RESET='\033[0m'
C_GREEN='\033[1;32m'
C_BLUE='\033[1;34m'
C_YELLOW='\033[1;33m'
C_RED='\033[1;31m'

info()  { printf "${C_BLUE}[+]${C_RESET} %s\n" "$*"; }
ok()    { printf "${C_GREEN}[✓]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[!]${C_RESET} %s\n" "$*"; }
fail()  { printf "${C_RED}[✗]${C_RESET} %s\n" "$*"; exit 1; }

# --- Determine project root -------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# --- Check Python -----------------------------------------------------------
PYTHON_BIN=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  warn "Python not found. Installing Python 3…"
  install_system_package python3 python3-pip python3-venv || true
  PYTHON_BIN="python3"
fi

PY_VERSION="$($PYTHON_BIN -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
info "Found $PYTHON_BIN $PY_VERSION"

if ! $PYTHON_BIN -c 'import sys; exit(0 if sys.version_info >= (3, 10) else 1)'; then
  fail "Python 3.10+ is required (found $PY_VERSION). Please upgrade Python and re-run."
fi

# --- Check Node.js ----------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js not found. Installing Node.js 20+…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null || true
  install_system_package nodejs || true
fi

NODE_VERSION="$(node -v 2>/dev/null || echo 'unknown')"
info "Found Node.js $NODE_VERSION"

# --- System package helper --------------------------------------------------
install_system_package() {
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -y >/dev/null 2>&1 || true
    sudo apt-get install -y "$@"
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y "$@"
  elif command -v yum >/dev/null 2>&1; then
    sudo yum install -y "$@"
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Sy --noconfirm "$@"
  elif command -v brew >/dev/null 2>&1; then
    brew install "$@"
  else
    warn "No supported package manager found. Please install '$*' manually."
  fi
}

# --- Install ffmpeg (for video metadata parsing) ----------------------------
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  info "Installing ffmpeg (needed for YouTube video metadata)…"
  install_system_package ffmpeg || true
else
  ok "ffmpeg already installed"
fi

# --- Python backend ---------------------------------------------------------
info "Installing Calamox Python backend (pip install -e .)…"
if [ -n "${VIRTUAL_ENV:-}" ]; then
  $PYTHON_BIN -m pip install -e ".[all]" --quiet
elif $PYTHON_BIN -m pip --version >/dev/null 2>&1 && ! $PYTHON_BIN -m pip install --user -e ".[all]" --quiet; then
  warn "pip install failed — retrying with a virtual environment…"
  $PYTHON_BIN -m venv .venv
  ./.venv/bin/python -m pip install -e ".[all]" --quiet
  VENV_ACTIVATE="source $SCRIPT_DIR/.venv/bin/activate && "
fi
ok "Python backend installed"

# --- Playwright browsers ----------------------------------------------------
if $PYTHON_BIN -c 'import playwright' >/dev/null 2>&1; then
  info "Installing Playwright Chromium…"
  $PYTHON_BIN -m playwright install chromium --with-deps >/dev/null 2>&1 || \
    $PYTHON_BIN -m playwright install chromium || true
  ok "Playwright Chromium installed"
fi

# --- React dashboard --------------------------------------------------------
if [ -f "calamox/frontend/package.json" ]; then
  info "Building React dashboard…"
  ( cd calamox/frontend && npm install --no-audit --no-fund && npm run build )
  ok "Dashboard built at calamox/frontend/dist"
fi

# --- Node.js execution bridge ----------------------------------------------
if [ -f "package.json" ]; then
  info "Building Node.js execution bridge…"
  npm install --no-audit --no-fund
  npm run build
  ok "Node.js bridge built at dist/"
fi

# --- Done -------------------------------------------------------------------
echo
ok "Calamox Jarvis System Initialized Successfully!"
echo
echo "  Start the dashboard + API:"
echo "    ${VENV_ACTIVATE:-}calamox"
echo
echo "  Optional — start the Node.js execution bridge (terminal exec + browser):"
echo "    npm start"
echo
echo "  Dashboard:  http://localhost:7860"
echo "  Bridge:     http://localhost:3000"
echo
info "Tip: copy .env.example to .env and add any LLM key to enable AI chat — OpenRouter (openrouter.ai/keys), OpenCode Zen (free at opencode.ai/auth), or Google Gemini (free tier at aistudio.google.com/apikey)."
