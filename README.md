# blog-deploy

9um4 블로그의 배포 웹훅 수신기 + build-once/pull-and-restart 배포 스크립트.

GitHub Actions가 이미지를 빌드해서 GHCR에 올리면, 이 프로젝트가 그 완제품 이미지를
받아와 서버 컨테이너를 재기동한다. 무거운 빌드는 절대 이 서버에서 하지 않는다.

## 구조

```
bin/start.js        진입점 — .env 로드 → config 검증 → express 서버 기동
src/config.js        환경변수 로딩/검증 (필수값 없으면 즉시 실패)
src/auth.js           웹훅 요청 검증: HMAC 서명 + 커스텀 헤더 토큰, 둘 다 독립적으로 확인
src/rateLimit.js        인증 실패 IP 레이트리밋 (슬라이딩 윈도우 락아웃)
src/clientKey.js        레이트리밋용 클라이언트 IP 추출 (Cloudflare 헤더 우선)
src/lock.js            배포 중복 실행 방지 락 (타임아웃 있는 인메모리 락)
src/notify.js          Discord/Telegram 알림
src/deployRunner.js    deploy.sh 실행 + 로그 시크릿 마스킹
deploy.sh              실제 배포 동작 (git reset --hard + docker compose pull/up)
systemd/               systemd user service 템플릿
test/                  vitest 단위 테스트
```

모듈은 서로를 모른다 — `src/server.js`에서만 조립한다. 인증 로직을 바꾸거나, 락을
Redis로 바꾸거나, 알림 채널을 추가할 때 다른 모듈을 안 건드리고 해당 파일만 고치면
된다.

## 왜 이렇게 나눴나

- **`auth.js`가 독립 모듈인 이유**: 웹훅 인증은 이 프로젝트에서 가장 자주 실수가
  나올 수 있는 지점이라(실제로 이전 버전엔 커스텀 헤더 검증이 통째로 빠져 있었다),
  단위 테스트로 서명 위조/헤더 누락/길이 불일치 같은 케이스를 각각 검증해뒀다
  (`test/auth.test.js`).
- **`lock.js`가 타임아웃을 갖는 이유**: `deploy.sh`가 멈춰버리면 콜백이 영영 안 불려서
  락이 안 풀리는 게 실제로 겪은 문제였다. 파일 락이나 Redis 락으로 갈 필요 없이,
  현재 규모(단일 서버·단일 프로세스)에서는 타임아웃 있는 인메모리 락으로 충분하다.
- **`deployRunner.js`가 마스킹을 하는 이유**: 지금의 `deploy.sh`는 시크릿을 stdout에
  찍지 않지만, 나중에 디버깅용 명령이 추가되는 순간 조용히 위험해지는 종류의 문제라
  기본 방어선을 깔아뒀다.
- **`rateLimit.js`가 있는 이유**: `WEBHOOK_AUTH_TOKEN`이 32바이트 랜덤값이라 브루트포스가
  현실적으로 불가능하긴 하지만, 이 저장소가 public이 되면 정확히 어떤 인증 프로토콜을
  쓰는지도 같이 공개된다. 로그인 엔드포인트(`01_blog`)와 동일한 패턴으로 IP당 실패
  횟수를 제한해 최소한의 방어선을 하나 더 둔다. 401(인증 실패)만 카운트하고 400(본문
  누락 등 인증 시도 자체가 아닌 경우)은 카운트에서 제외한다.

## 로컬 개발

```bash
npm install
cp .env.example .env   # 값 채우기
npm run test           # vitest 단위 테스트
npm start               # bin/start.js 실행
```

## 서버 설치

```bash
git clone <이 저장소> ~/blog-deploy
cd ~/blog-deploy
npm ci --omit=dev
cp .env.example .env
# .env 채우기: WEBHOOK_HMAC_SECRET, WEBHOOK_AUTH_TOKEN, CUSTOM_AUTH_HEADER_NAME,
#             PROJECT_DIR(블로그 소스 clone 경로), DISCORD/TELEGRAM 값

mkdir -p ~/.config/systemd/user
cp systemd/blog-webhook.service.example ~/.config/systemd/user/blog-webhook.service
systemctl --user daemon-reload
systemctl --user enable --now blog-webhook
loginctl enable-linger $USER   # 로그아웃 후에도 서비스 유지
```

## 웹훅 인증 확인

배포 전에 수동으로 인증이 실제로 걸러내는지 확인하는 걸 권장한다.

```bash
PAYLOAD='{"ref":"refs/heads/main"}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "<WEBHOOK_HMAC_SECRET>" | cut -d' ' -f2)

# 정상 요청 — 202 예상
curl -i -X POST \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "<CUSTOM_AUTH_HEADER_NAME>: <WEBHOOK_AUTH_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  http://127.0.0.1:<PORT>/deploy-webhook

# 토큰 틀리게 — 401 예상 (인증이 실제로 걸러내고 있다는 증거)
```

## GitHub Actions 쪽 시크릿

이 프로젝트가 검증하는 `WEBHOOK_HMAC_SECRET`/`WEBHOOK_AUTH_TOKEN`/`CUSTOM_AUTH_HEADER_NAME`은
블로그 소스 저장소(`01_blog`)의 `.github/workflows/deploy.yml`이 보내는 값과
정확히 일치해야 한다. 두 저장소의 GitHub Secrets에 같은 값을 등록해둘 것.
