#!/usr/bin/env bash
# self-hosted runner의 워크플로 스텝이 직접 실행하는 진입점.
# 락 → 시작 알림 → deploy.sh 실행 → 성공/실패 알림, 실패 시 로그 첨부까지 한 번에 처리한다.
#
# 이 스크립트가 존재하는 이유: deploy.sh 자체는 "무엇을 배포하는지"만 알아야 하고
# 락/알림 같은 운영 관심사를 몰라야 한다(관심사 분리). 러너가 push마다 동시에 여러 잡을
# 띄우는 경우는 거의 없지만, 수동 재실행 + 자동 실행이 겹치는 경우까지 대비해 락은 유지한다.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

set -a
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
set +a

source "$SCRIPT_DIR/notify.sh"

LOCK_FILE="$SCRIPT_DIR/.deploy.lock"
LOG_FILE="$(mktemp)"
trap 'rm -f "$LOG_FILE"' EXIT

# --- 락: 같은 배포가 겹쳐 돌지 않게. flock은 이 프로세스가 죽어도(크래시 등)
# 커널이 자동으로 풀어주므로 deployRunner.js 시절 겪었던 "멈추면 영원히 락" 문제가
# 구조적으로 재발하지 않는다 — 별도 타임아웃 로직이 필요 없다.
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "이미 배포가 진행 중입니다. 종료." >&2
  discord_embed "⚠️ 배포 스킵" "다른 배포가 이미 진행 중이라 이번 실행은 건너뜁니다." 16753920
  exit 1
fi

# --- 로그에 섞일 수 있는 값 마스킹 ---
redact() {
  local text="$1"
  for secret in "$POSTGRES_PASSWORD" "$SESSION_SECRET" "$ADMIN_PASSWORD_HASH"; do
    [ -n "${secret:-}" ] && text="${text//$secret/[REDACTED]}"
  done
  printf '%s' "$text"
}

COMMIT_SHA="${GITHUB_SHA:-unknown}"
COMMIT_MSG="${DEPLOY_COMMIT_MESSAGE:-}"

discord_embed "🚚 배포 시작 (Deploy Started)" \
  "서버에서 배포를 시작합니다.\nCommit: \`${COMMIT_SHA:0:7}\` ${COMMIT_MSG}" \
  3447003

if bash "$SCRIPT_DIR/deploy.sh" >"$LOG_FILE" 2>&1; then
  discord_embed "✅ 배포 성공 (Deploy Succeeded)" "정상적으로 배포되었습니다." 3066993
  telegram_text "✅ *배포 성공* — \`${COMMIT_SHA:0:7}\`"
  exit_code=0
else
  exit_code=$?
  SUMMARY="$(redact "$(tail -n 15 "$LOG_FILE")")"
  discord_embed "❌ 배포 실패 (Deploy Failed)" "\`\`\`\n${SUMMARY}\n\`\`\`" 16711680
  telegram_text "❌ *배포 실패* — \`${COMMIT_SHA:0:7}\` (Discord에서 로그 확인)"

  REDACTED_LOG="$(mktemp)"
  redact "$(cat "$LOG_FILE")" >"$REDACTED_LOG"
  discord_file "$REDACTED_LOG"
  rm -f "$REDACTED_LOG"
fi

flock -u 200
exit "$exit_code"
