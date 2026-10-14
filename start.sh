#!/usr/bin/env bash
#
# CertiGuard — one-command launcher
# -----------------------------------------------------------------------------
# Detects the operating system (macOS / Windows / Linux), installs dependencies
# if they are missing, initializes the backend (DB migrations + crypto keys +
# optional demo seed), then starts the backend and frontend together and prints
# both URLs.
#
# Usage:
#   ./start.sh                 # install (if needed), init, seed, run both
#   ./start.sh --no-seed       # skip demo data seeding
#   ./start.sh --reinstall     # force a clean dependency reinstall
#
# On Windows run this from Git Bash or WSL:  bash start.sh
# -----------------------------------------------------------------------------

set -euo pipefail

# ---- Resolve project root (directory of this script) ------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

BACKEND_PORT="${PORT:-4000}"
FRONTEND_PORT="5173"

DO_SEED=1
REINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-seed) DO_SEED=0 ;;
    --reinstall) REINSTALL=1 ;;
    *) echo "Unknown option: $arg" ; exit 1 ;;
  esac
done

# ---- Pretty output ----------------------------------------------------------
if [ -t 1 ]; then
  C_BOLD="\033[1m"; C_GREEN="\033[32m"; C_YELLOW="\033[33m"; C_CYAN="\033[36m"; C_RED="\033[31m"; C_OFF="\033[0m"
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_RED=""; C_OFF=""
fi
info()  { printf "${C_CYAN}▶ %s${C_OFF}\n" "$1"; }
ok()    { printf "${C_GREEN}✔ %s${C_OFF}\n" "$1"; }
warn()  { printf "${C_YELLOW}! %s${C_OFF}\n" "$1"; }
err()   { printf "${C_RED}✘ %s${C_OFF}\n" "$1"; }

# ---- 1. Detect operating system --------------------------------------------
detect_os() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null || echo unknown)"
  case "$uname_out" in
    Darwin*)              OS="macOS" ;;
    Linux*)
      if grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null; then OS="Windows (WSL)"; else OS="Linux"; fi ;;
    MINGW*|MSYS*|CYGWIN*) OS="Windows" ;;
    *)                    OS="unknown" ;;
  esac
}
detect_os
printf "${C_BOLD}CertiGuard launcher${C_OFF}\n"
info "Detected operating system: ${OS}"

# ---- 2. Verify Node.js / npm are available ----------------------------------
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install Node.js 20+ from https://nodejs.org and re-run."
  case "$OS" in
    macOS) echo "  macOS tip: 'brew install node'" ;;
    Windows*) echo "  Windows tip: install the Node.js LTS .msi, or 'winget install OpenJS.NodeJS.LTS'" ;;
    Linux) echo "  Linux tip: use your package manager or nvm (https://github.com/nvm-sh/nvm)" ;;
  esac
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  err "npm is not available (it ships with Node.js). Please reinstall Node.js."
  exit 1
fi
ok "Node $(node -v) / npm $(npm -v)"

# ---- 3. Install dependencies if missing -------------------------------------
install_deps() {
  local dir="$1" name="$2"
  if [ ! -d "$dir" ]; then err "Missing directory: $dir"; exit 1; fi
  if [ "$REINSTALL" -eq 1 ]; then
    warn "Reinstalling $name dependencies (clean)..."
    rm -rf "$dir/node_modules"
  fi
  if [ -d "$dir/node_modules" ] && [ "$REINSTALL" -eq 0 ]; then
    ok "$name dependencies already installed"
  else
    info "Installing $name dependencies (this can take a minute)..."
    ( cd "$dir" && npm install )
    ok "$name dependencies installed"
  fi
}
install_deps "$BACKEND_DIR" "backend"
install_deps "$FRONTEND_DIR" "frontend"

# ---- 4. Initialize the backend (migrations + keys + optional seed) ----------
info "Initializing backend (database migrations + cryptographic keys)..."
( cd "$BACKEND_DIR" && npm run migrate --silent && npm run init:keys --silent )
ok "Database schema up to date; cryptographic keys ready"

if [ "$DO_SEED" -eq 1 ]; then
  info "Seeding demo users and sample certificates..."
  # Seed before the server starts to avoid a SQLite single-writer lock.
  ( cd "$BACKEND_DIR" && npm run seed --silent ) || warn "Seed skipped/failed (continuing)."
  ok "Demo data ready — accounts: issuer@demo.certiguard / verifier@demo.certiguard / student@demo.certiguard (password: ${CERTIGUARD_DEMO_PASSWORD:-DemoPass123!})"
  warn "Create the administrator once with: cd backend && CERTIGUARD_ADMIN_EMAIL=admin@demo.certiguard CERTIGUARD_ADMIN_PASSWORD='AdminDemo123!' npm run bootstrap:admin"
fi

# ---- 5. Start both servers and clean up on exit -----------------------------
PIDS=()
cleanup() {
  echo ""
  info "Shutting down CertiGuard..."
  for pid in "${PIDS[@]:-}"; do
    if [ -n "${pid:-}" ] && kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait >/dev/null 2>&1 || true
  ok "Stopped."
}
trap cleanup INT TERM EXIT

info "Starting backend (API) on port ${BACKEND_PORT}..."
( cd "$BACKEND_DIR" && PORT="$BACKEND_PORT" npm run dev ) &
PIDS+=("$!")

info "Starting frontend (UI) on port ${FRONTEND_PORT}..."
( cd "$FRONTEND_DIR" && npm run dev ) &
PIDS+=("$!")

# ---- 6. Print URLs ----------------------------------------------------------
sleep 2
printf '\n'
printf '%b\n' "${C_BOLD}========================================================${C_OFF}"
printf '%b\n' "${C_GREEN}  CertiGuard is starting up${C_OFF}"
printf '%b\n' "${C_BOLD}--------------------------------------------------------${C_OFF}"
printf '%b\n' "  ${C_BOLD}Frontend (open this):${C_OFF}  ${C_CYAN}http://localhost:${FRONTEND_PORT}${C_OFF}"
printf '%b\n' "  ${C_BOLD}Backend API:${C_OFF}           ${C_CYAN}http://localhost:${BACKEND_PORT}/api${C_OFF}"
printf '%b\n' "  ${C_BOLD}API health check:${C_OFF}      ${C_CYAN}http://localhost:${BACKEND_PORT}/api/health${C_OFF}"
printf '%b\n' "${C_BOLD}--------------------------------------------------------${C_OFF}"
printf '%b\n' "  Press ${C_BOLD}Ctrl+C${C_OFF} to stop both servers."
printf '%b\n' "${C_BOLD}========================================================${C_OFF}"
printf '\n'

# ---- 7. Wait on the servers -------------------------------------------------
wait
