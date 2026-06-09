#!/usr/bin/env bash
#
# start-dev.sh — vegvisir Dev-Server starten (über Tailscale erreichbar)
#
# Benutzung:  einfach ausführen  ->  ./start-dev.sh
# Stoppen:    Strg + C
#
set -euo pipefail

PORT=8080
cd "$(dirname "$0")"   # immer aus dem vegvisir-Ordner heraus, egal von wo gestartet

# Tailscale-Adresse für die Anzeige ermitteln (mit Fallback)
TS_NAME=""
if command -v tailscale >/dev/null 2>&1; then
    TS_NAME="$(tailscale status --json 2>/dev/null \
        | python3 -c 'import sys,json; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))' 2>/dev/null || true)"
fi
[ -z "$TS_NAME" ] && TS_NAME="odin.taild4757f.ts.net"

echo "────────────────────────────────────────────────"
echo "  vegvisir Dev-Server läuft 🚀"
echo ""
echo "  Im Tailnet:  http://$TS_NAME:$PORT"
echo "  Auf odin:    http://localhost:$PORT"
echo ""
echo "  Stoppen mit:  Strg + C"
echo "────────────────────────────────────────────────"

# --bind 0.0.0.0 -> auch über Tailscale erreichbar (nicht nur localhost)
exec python3 -m http.server "$PORT" --bind 0.0.0.0
