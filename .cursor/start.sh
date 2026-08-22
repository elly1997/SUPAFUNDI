#!/usr/bin/env bash
# Per-boot startup: ensure Docker + the local Supabase stack are running.
# Idempotent and safe to re-run; returns once services are ready.
set -euo pipefail
cd "$(dirname "$0")/.."

log() { echo "[start] $*"; }

# Same-bridge container traffic must bypass netfilter, otherwise Supabase's
# containers cannot reach Postgres inside the nested-container VM.
sudo sysctl -w net.bridge.bridge-nf-call-iptables=0 net.bridge.bridge-nf-call-ip6tables=0 >/dev/null 2>&1 || true

# Start the Docker daemon if it is not already up (no systemd in the VM).
if ! sudo docker info >/dev/null 2>&1; then
  log "Starting dockerd..."
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 60); do
    sudo docker info >/dev/null 2>&1 && break
    sleep 1
  done
fi

# Let non-root tooling (supabase CLI) talk to Docker without sudo.
sudo chmod 666 /var/run/docker.sock 2>/dev/null || true

# Start the local Supabase stack (idempotent; fast once images are cached).
if ! supabase status >/dev/null 2>&1; then
  log "Starting Supabase stack..."
  supabase start
else
  log "Supabase already running."
fi

log "start complete"
