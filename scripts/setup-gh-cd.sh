#!/usr/bin/env bash
# Configura o GitHub Actions pra deploy automático no Fly em cada push pra main.
#
# Pré-requisitos:
#   1. flyctl auth login  (já feito)
#   2. gh auth login      (autorize repo + workflow scopes)
#
# Uso:
#   ./scripts/setup-gh-cd.sh

set -euo pipefail

command -v flyctl >/dev/null || { echo "❌ flyctl não encontrado"; exit 1; }
command -v gh >/dev/null || { echo "❌ gh não encontrado no PATH (ele foi instalado em ~/.local/bin)"; exit 1; }
flyctl auth whoami >/dev/null 2>&1 || { echo "❌ Rode primeiro: flyctl auth login"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "❌ Rode primeiro: gh auth login"; exit 1; }

echo "▶ Setando GH secret FLY_API_TOKEN..."
flyctl auth token | gh secret set FLY_API_TOKEN

echo "✅ Pronto. Próximo push pra main vai disparar .github/workflows/deploy.yml"
