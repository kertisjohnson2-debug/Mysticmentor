#!/usr/bin/env bash
# Local Stripe TEST-MODE webhook runner. Starts `stripe listen` and the dev server together so the
# server receives the listener's signing secret. Needs STRIPE_SECRET_KEY (sk_test_...) in the environment.
# Secrets are never printed. Usage: npm run dev:stripe
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then echo "STRIPE_SECRET_KEY is not set." >&2; exit 1; fi
if [[ "$STRIPE_SECRET_KEY" != sk_test_* ]]; then echo "Refusing to run: STRIPE_SECRET_KEY is not a test-mode key." >&2; exit 1; fi

export STRIPE_API_KEY="$STRIPE_SECRET_KEY" # env var keeps the key out of process arguments
STRIPE_BIN="${STRIPE_BIN:-}"
if [[ -z "$STRIPE_BIN" ]]; then
  if command -v stripe >/dev/null 2>&1; then STRIPE_BIN=stripe
  else STRIPE_BIN="npx --yes @stripe/cli"; fi
fi

SECRET="$($STRIPE_BIN listen --print-secret 2>/dev/null | grep -o 'whsec_[A-Za-z0-9]*' | head -1)"
if [[ -z "$SECRET" ]]; then echo "Could not obtain a webhook signing secret from the Stripe CLI." >&2; exit 1; fi
export STRIPE_WEBHOOK_SECRET="$SECRET"

if [[ -z "${APP_URL:-}" && -n "${CODESPACE_NAME:-}" ]]; then
  export APP_URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
fi
export APP_URL="${APP_URL:-http://localhost:3000}"

$STRIPE_BIN listen --forward-to localhost:3000/api/stripe-webhook \
  --events checkout.session.completed,charge.refunded,charge.dispute.created &
LISTEN_PID=$!
trap 'kill "$LISTEN_PID" 2>/dev/null || true' EXIT

npx tsx server.ts
