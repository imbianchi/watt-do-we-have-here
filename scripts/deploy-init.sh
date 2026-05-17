#!/usr/bin/env bash
# Watt — primeira inicialização do deploy Fly.io.
#
# Pré-requisitos:
#   1. flyctl logado:  flyctl auth login
#   2. DATABASE_URL exportada com a connection string Supabase em formato +asyncpg
#      Ex: export DATABASE_URL='postgresql+asyncpg://postgres:senha@db.x.supabase.co:5432/postgres'
#   3. (opcional) ALLOWED_ORIGINS — default: http://localhost:5173 (atualizar depois do Vercel)
#
# Uso:
#   ./scripts/deploy-init.sh
#
# Idempotente — reexecutar é seguro: pula o que já existe e reaproveita secrets
# do ~/.watt-deploy-secrets se já tiver rodado uma vez.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETS_FILE="$HOME/.watt-deploy-secrets"

# --- 1. Sanidade ---------------------------------------------------------------
command -v flyctl >/dev/null || { echo "❌ flyctl não encontrado no PATH"; exit 1; }
flyctl auth whoami >/dev/null 2>&1 || { echo "❌ Rode primeiro: flyctl auth login"; exit 1; }

# DATABASE_URL: usa env var se setada, senão tenta ler do arquivo de secrets
if [[ -z "${DATABASE_URL:-}" && -f "$SECRETS_FILE" ]]; then
  # shellcheck disable=SC1090
  source <(grep -E '^DATABASE_URL=' "$SECRETS_FILE")
fi
: "${DATABASE_URL:?❌ Exporte DATABASE_URL ou adicione no $SECRETS_FILE}"

APP_NAME="$(awk -F'"' '/^app = /{print $2}' "$ROOT/backend/fly.toml")"
echo "▶ App Fly: $APP_NAME"
echo "▶ User Fly: $(flyctl auth whoami)"

# --- 2. App no Fly -------------------------------------------------------------
if flyctl status --app "$APP_NAME" >/dev/null 2>&1; then
  echo "▶ App $APP_NAME já existe — pulando create"
else
  echo "▶ Criando app no Fly..."
  flyctl apps create "$APP_NAME" --org personal
fi

# --- 3. Secrets locais ---------------------------------------------------------
if [[ -f "$SECRETS_FILE" ]]; then
  echo "▶ Reutilizando secrets de $SECRETS_FILE"
  # shellcheck disable=SC1090
  source <(grep -E '^(SECRET_KEY|ENCRYPTION_KEY)=' "$SECRETS_FILE")
else
  echo "▶ Gerando SECRET_KEY e ENCRYPTION_KEY..."
  SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
  ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  umask 077
  cat > "$SECRETS_FILE" <<EOF
# Watt — production secrets, generated $(date -Iseconds)
SECRET_KEY=$SECRET_KEY
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOF
  echo "▶ Secrets salvos em $SECRETS_FILE (chmod 600) — guarde num cofre."
fi

# --- 4. Push secrets pro Fly ---------------------------------------------------
echo "▶ Setando secrets no Fly..."
flyctl secrets set --app "$APP_NAME" --stage \
  DATABASE_URL="$DATABASE_URL" \
  SECRET_KEY="$SECRET_KEY" \
  ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-http://localhost:5173}" \
  > /dev/null

# --- 5. Deploy -----------------------------------------------------------------
echo "▶ Deploying (vai puxar Docker, rodar alembic upgrade, subir uvicorn)..."
cd "$ROOT/backend"
flyctl deploy --remote-only

echo
echo "✅ Deploy completo."
echo "   API:    https://$APP_NAME.fly.dev"
echo "   Health: https://$APP_NAME.fly.dev/api/health"
echo
echo "Próximos passos:"
echo "  1. Importe o repo no Vercel (root=frontend/, VITE_API_URL=https://$APP_NAME.fly.dev)"
echo "  2. Depois rode: ./scripts/update-cors.sh https://SEU-PROJETO.vercel.app"
echo "  3. Pra CD automático no GitHub Actions:"
echo "       flyctl auth token | gh secret set FLY_API_TOKEN"
