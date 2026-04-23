#!/usr/bin/env bash
# Okaasan installer — run with:
#   curl -sSL https://raw.githubusercontent.com/Delaunay/recipes/master/install.sh | bash
#
# Installs to /opt/okaasan/ with:
#   .venv/   — Python virtual environment
#   data/    — SQLite database, uploads, JSON store (git-tracked if configured)
#
# Safe to re-run: upgrades the package, preserves data.
set -euo pipefail

BASE="/opt/okaasan"
VENV="$BASE/.venv"
DATA="$BASE/data"
SERVICE_FILE="/etc/systemd/system/okaasan.service"
PORT="${OKAASAN_PORT:-5001}"
PYTHON_VERSION="3.12"
RUN_USER="$(id -un)"
RUN_GROUP="$(id -gn)"

info()  { printf '\033[1;34m=> %s\033[0m\n' "$*"; }
ok()    { printf '\033[1;32m✓  %s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m!  %s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m✗  %s\033[0m\n' "$*"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────

info "Installing Okaasan to $BASE"

if [ ! -d "$BASE" ]; then
    sudo mkdir -p "$BASE"
    sudo chown "$RUN_USER:$RUN_GROUP" "$BASE"
fi

mkdir -p "$DATA"
mkdir -p "$DATA/uploads"

# ── Stop existing service before upgrade ──────────────────

if sudo systemctl is-active --quiet okaasan.service 2>/dev/null; then
    info "Stopping existing service..."
    sudo systemctl stop okaasan.service
fi

# ── Install uv if missing ────────────────────────────────

if ! command -v uv &>/dev/null; then
    if [ -x "$HOME/.local/bin/uv" ]; then
        export PATH="$HOME/.local/bin:$PATH"
    else
        info "Installing uv..."
        curl -LsSf https://astral.sh/uv/install.sh | sh
        export PATH="$HOME/.local/bin:$PATH"
    fi
fi
ok "uv $(uv --version)"

# ── Create venv & install package ─────────────────────────

NEED_VENV=false
if [ ! -d "$VENV" ]; then
    NEED_VENV=true
elif ! "$VENV/bin/python" --version 2>/dev/null | grep -q "Python $PYTHON_VERSION"; then
    CURRENT=$("$VENV/bin/python" --version 2>/dev/null || echo "missing")
    warn "Existing venv has $CURRENT, need Python $PYTHON_VERSION — recreating"
    rm -rf "$VENV"
    NEED_VENV=true
fi

if $NEED_VENV; then
    info "Creating virtual environment (Python $PYTHON_VERSION)..."
    uv venv --seed --python "$PYTHON_VERSION" "$VENV"
fi

info "Installing/upgrading okaasan..."
uv pip install --python "$VENV/bin/python" --upgrade okaasan

ok "okaasan $($VENV/bin/python -c 'import okaasan; print(okaasan.__version__)')"

# ── Install systemd service ──────────────────────────────

sudo tee "$SERVICE_FILE" > /dev/null <<SVC
[Unit]
Description=Okaasan web server
After=network.target

[Service]
Type=simple
User=$RUN_USER
Group=$RUN_GROUP
ExecStart=$VENV/bin/uvicorn okaasan.server.run:entry --host 0.0.0.0 --port $PORT
WorkingDirectory=$BASE
Restart=on-failure
RestartSec=5
Environment=PATH=$VENV/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME
Environment=FLASK_STATIC=$DATA
Environment=FLASK_PORT=$PORT

[Install]
WantedBy=multi-user.target
SVC

sudo systemctl daemon-reload
sudo systemctl enable okaasan.service
sudo systemctl restart okaasan.service

# ── Done ──────────────────────────────────────────────────

echo ""
ok "Okaasan is running at http://localhost:$PORT"
echo ""
echo "  Useful commands:"
echo "    sudo systemctl status okaasan      # check status"
echo "    sudo systemctl restart okaasan     # restart"
echo "    sudo journalctl -u okaasan -f      # view logs"
echo ""
