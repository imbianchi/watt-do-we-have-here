#!/usr/bin/env bash
# Atualiza ALLOWED_ORIGINS no Fly com as URLs do frontend (Vercel).
# Uso:
#   ./scripts/update-cors.sh https://watt.vercel.app https://watt-imbianchi-projects.vercel.app

set -euo pipefail
[[ $# -lt 1 ]] && { echo "Uso: $0 <url-vercel> [...mais urls]"; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="$(awk -F'"' '/^app = /{print $2}' "$ROOT/backend/fly.toml")"

ORIGINS="$(IFS=,; echo "$*")"
echo "▶ ALLOWED_ORIGINS = $ORIGINS"
flyctl secrets set --app "$APP_NAME" ALLOWED_ORIGINS="$ORIGINS"
echo "✅ CORS atualizado — Fly vai reiniciar a VM."
