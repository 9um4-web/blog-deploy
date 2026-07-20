#!/bin/bash
# GitHub Actions가 SSH(Cloudflare Tunnel 경유)로 접속했을 때 실행되는 트리거 스크립트.
# authorized_keys의 forced command로만 실행되도록 묶어둘 것 — 그러면 이 SSH 키가
# 유출돼도 공격자가 임의 명령을 못 돌리고 딱 이 스크립트만 실행할 수 있다.
#
# HMAC 서명을 여기서 직접 계산해서 로컬 웹훅 수신기(127.0.0.1)를 호출한다.
# 시크릿이 GitHub Actions 쪽 커맨드라인에 실릴 필요가 없다는 게 핵심 —
# 전부 이 서버의 .env에서만 읽는다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
set +a

: "${WEBHOOK_HMAC_SECRET:?WEBHOOK_HMAC_SECRET가 .env에 설정되어야 합니다}"
: "${WEBHOOK_AUTH_TOKEN:?WEBHOOK_AUTH_TOKEN이 .env에 설정되어야 합니다}"
: "${CUSTOM_AUTH_HEADER_NAME:?CUSTOM_AUTH_HEADER_NAME이 .env에 설정되어야 합니다}"

PORT="${PORT:-4000}"
PAYLOAD='{"ref":"refs/heads/main"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$WEBHOOK_HMAC_SECRET" | cut -d' ' -f2)

RESPONSE_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "${CUSTOM_AUTH_HEADER_NAME}: ${WEBHOOK_AUTH_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "http://127.0.0.1:${PORT}/deploy-webhook")

echo "webhook responded: $RESPONSE_CODE"

if [ "$RESPONSE_CODE" -ne 202 ] && [ "$RESPONSE_CODE" -ne 200 ]; then
  echo "Webhook trigger failed with status $RESPONSE_CODE"
  exit 1
fi
