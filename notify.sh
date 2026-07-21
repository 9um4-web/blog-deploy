#!/usr/bin/env bash
# Discord/Telegram 알림 유틸리티. deploy-with-notify.sh에서 source해서 쓴다.
# 01_blog의 .github/scripts/notify.sh와 같은 패턴 — 필요 환경변수는 .env에서 온다:
#   DISCORD_WEBHOOK_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
#
# 모든 페이로드는 jq -n으로 조립한다 — 문자열 직접 삽입은 값에 따옴표/개행이 섞이면
# JSON이 깨지거나 페이로드 구조가 의도와 달라질 수 있어 쓰지 않는다.

set -euo pipefail

# 호출부에서 "...\n..."처럼 큰따옴표 문자열에 \n을 그대로 적어도 되게 해주는 헬퍼.
_expand_newlines() {
  printf '%b' "$1"
}

discord_embed() {
  local title="$1" desc desc_raw="$2" color="$3"
  desc="$(_expand_newlines "$desc_raw")"
  [ -z "${DISCORD_WEBHOOK_URL:-}" ] && return 0
  local payload
  payload=$(jq -n --arg title "$title" --arg desc "$desc" --argjson color "$color" \
    '{embeds: [{title: $title, description: $desc, color: $color}]}')
  curl -sS -o /dev/null -w "discord_embed -> %{http_code}\n" \
    -H "Content-Type: application/json" -X POST -d "$payload" "$DISCORD_WEBHOOK_URL"
}

discord_file() {
  local filepath="$1"
  [ -z "${DISCORD_WEBHOOK_URL:-}" ] && return 0
  curl -sS -o /dev/null -w "discord_file -> %{http_code}\n" \
    -F "files[0]=@${filepath}" "$DISCORD_WEBHOOK_URL"
}

telegram_text() {
  local text text_raw="$1" parse_mode="${2:-Markdown}"
  [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ] && return 0
  text="$(_expand_newlines "$text_raw")"
  local payload
  payload=$(jq -n --arg chat_id "$TELEGRAM_CHAT_ID" --arg text "$text" --arg parse_mode "$parse_mode" \
    '{chat_id: $chat_id, text: $text, parse_mode: $parse_mode}')
  curl -sS -o /dev/null -w "telegram_text -> %{http_code}\n" \
    -H "Content-Type: application/json" -X POST -d "$payload" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"
}
