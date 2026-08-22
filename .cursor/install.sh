#!/usr/bin/env bash
# One-time, idempotent setup for the SUPAFUNDI Hardware POS dev environment.
# Installs Docker + Supabase CLI, Node deps, writes .env.local, and brings the
# local Supabase stack up once so its images/migrations are cached in the snapshot.
set -euo pipefail
cd "$(dirname "$0")/.."

log() { echo "[install] $*"; }

# --- Docker engine (needed to run the local Supabase stack) ---
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
fi

# --- fuse-overlayfs: overlay2 cannot mount inside the nested-container VM ---
if ! command -v fuse-overlayfs >/dev/null 2>&1; then
  log "Installing fuse-overlayfs..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends fuse-overlayfs
fi

sudo usermod -aG docker "$USER" 2>/dev/null || true

sudo mkdir -p /etc/docker
echo '{ "features": { "containerd-snapshotter": false }, "storage-driver": "fuse-overlayfs" }' \
  | sudo tee /etc/docker/daemon.json >/dev/null

# --- Supabase CLI ---
if ! command -v supabase >/dev/null 2>&1; then
  log "Installing Supabase CLI..."
  ARCH="$(dpkg --print-architecture)"
  curl -fsSL "https://github.com/supabase/cli/releases/latest/download/supabase_linux_${ARCH}.tar.gz" \
    -o /tmp/supabase.tar.gz
  tar -xzf /tmp/supabase.tar.gz -C /tmp supabase
  sudo mv /tmp/supabase /usr/local/bin/supabase
fi

# --- Node dependencies ---
log "Installing npm dependencies..."
npm ci

# --- Local env file: well-known local Supabase demo keys (NOT secrets) ---
if [ ! -f .env.local ]; then
  log "Writing .env.local (local Supabase demo keys)..."
  cat > .env.local <<'EOF'
# Local development — points at the local Supabase stack (supabase start).
# These are the well-known local Supabase demo keys (identical on every install);
# they are NOT secrets and must never be used in production.
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Africa's Talking SMS (optional — leave blank for local dev)
AT_API_KEY=
AT_USERNAME=
AT_SENDER_ID=
AT_SANDBOX=true
EOF
fi

# --- Bring the stack up once so images + migrations are cached ---
bash "$(dirname "$0")/start.sh"

log "install complete"
