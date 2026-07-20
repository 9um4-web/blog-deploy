#!/bin/bash
set -e

# 이 스크립트 자신의 위치를 기준으로 .env를 찾는다 — 어느 계정/경로에 설치되든
# 코드 수정 없이 .env만 맞추면 동작한다 (절대경로 하드코딩 금지)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

set -a
[ -f "$SCRIPT_DIR/.env" ] && source "$SCRIPT_DIR/.env"
set +a

export PATH="$HOME/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export DOCKER_HOST="${DOCKER_HOST:-unix:///run/user/$(id -u)/docker.sock}"

: "${PROJECT_DIR:?PROJECT_DIR가 .env에 설정되어야 합니다 (블로그 소스 git clone 경로)}"
cd "$PROJECT_DIR"

# 1. docker-compose.yml 갱신을 위해 최신 메타 코드 가볍게 pull
git fetch origin main
git reset --hard origin/main

# 2. GHCR에서 완제품 이미지 다운로드 (빌드는 GitHub Actions가 이미 끝냄)
docker compose pull

# 3. 새 컨테이너 기동
docker compose up -d

# 4. 미사용 구형 캐시 이미지 청소
docker image prune -f
