#!/usr/bin/env bash
# Sync the tower repo to the server, install deps, and restart the control plane.
# public/dl is excluded: the CLI binaries there are built on the server and are
# root-owned, so rsync --delete can't touch them (EPERM). Pass "edge" as $1 to
# also restart the public TLS front (only needed when edge.ts changed).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"

rsync -az --delete --omit-dir-times \
  --exclude node_modules \
  --exclude .env \
  --exclude .git \
  --exclude .DS_Store \
  --exclude public/dl \
  "$here/" wessdev:/opt/tower/

echo "synced -> wessdev:/opt/tower"
ssh wessdev 'cd /opt/tower && bun install' >/dev/null 2>&1 && echo "remote bun install ok"
ssh wessdev 'sudo -n systemctl restart tower' && echo "tower restarted"
if [ "${1:-}" = "edge" ]; then
  ssh wessdev 'sudo -n systemctl restart toweredge' && echo "toweredge restarted"
fi
ssh wessdev 'sudo -n systemctl is-active tower'
