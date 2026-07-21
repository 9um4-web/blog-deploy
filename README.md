# blog-deploy

9um4 블로그의 서버측 배포 스크립트. self-hosted GitHub Actions 러너가 이 저장소를
직접 실행한다 — 웹훅 수신기나 별도 데몬은 없다.

## 아키텍처

```
01_blog (public)              9um4/blog-deploy-trigger (private)     9um4-server
  push → main                   repository_dispatch 수신               self-hosted runner
    ↓ build/test (GitHub-hosted)   ↓                                    ↓
    ↓ GHCR push (private)          runs-on: self-hosted  ─────────→  deploy-with-notify.sh
    ↓ repository_dispatch 전송                                          ↓ deploy.sh
                                                                        (git reset --hard
                                                                         + docker compose
                                                                         pull/up)
```

- **빌드는 GitHub-hosted 러너**에서만 한다. 신뢰할 수 없는 PR(fork)에서 온 코드가
  self-hosted 러너(서버 접근 권한 있음)에서 실행될 일이 없다 — self-hosted 러너를
  건드리는 워크플로는 `repository_dispatch`뿐이고, 그건 `01_blog`의 `push`
  워크플로(저장소 owner만 트리거 가능)가 성공했을 때만 보낸다.
- **GHCR은 private로 유지**한다. self-hosted 러너가 매 잡마다 자동 발급받는
  임시 `GITHUB_TOKEN`으로 `docker login`하므로, 과거처럼 30일마다 만료되는 PAT을
  따로 관리하거나 이미지를 public으로 돌릴 필요가 없다.
- **배포 자체는 서버 로컬에서** 이 저장소의 스크립트가 실행한다. 외부에서 서버로
  들어오는 요청(웹훅, SSH 등)이 전혀 없다 — 러너가 GitHub에 아웃바운드로 폴링
  연결만 유지하는 구조라 서버에 포트를 열 필요가 없다.

## 구조

```
deploy.sh              실제 배포 동작 (git reset --hard + docker compose pull/up)
deploy-with-notify.sh   락 + 시작/성공/실패 알림 + 로그 마스킹, deploy.sh를 감싸는 래퍼
notify.sh               Discord/Telegram 알림 유틸리티
.env.example            서버 로컬 설정 템플릿
```

`deploy.sh`는 "무엇을 배포하는지"만 안다. 락/알림 같은 운영 관심사는
`deploy-with-notify.sh`가 맡는다 — 알림 채널을 바꾸거나 락 방식을 바꿀 때
`deploy.sh`를 건드릴 필요가 없다.

## 왜 이렇게 나눴나

- **웹훅 수신기(Express) + SSH 트리거를 없앤 이유**: Cloudflare 무료 플랜의
  Bot Fight Mode가 공개 HTTPS 웹훅을 구조적으로 막았고, 이를 SSH-over-Tunnel로
  우회했지만 여전히 "외부에서 서버로 들어오는 경로"를 인증/락/레이트리밋으로
  방어해야 하는 부담이 있었다. self-hosted 러너는 서버가 GitHub으로 아웃바운드
  연결만 유지하므로 이 방어선 자체가 필요 없어진다.
- **락에 `flock`을 쓰는 이유**: 이전 버전(인메모리 락 + 타임아웃)은 프로세스가
  멈추면 락이 영원히 안 풀리는 문제가 있었다. `flock`은 파일 디스크립터를 쥔
  프로세스가 죽으면 커널이 자동으로 락을 해제하므로 별도 타임아웃 로직이 필요 없다.
- **`redact()`가 있는 이유**: `deploy.sh`가 실패 로그를 Discord로 올릴 때
  `.env`에 있는 시크릿이 우연히 stdout/stderr에 섞여 나가는 걸 막는 마지막
  방어선. 지금 당장 `deploy.sh`가 시크릿을 출력할 경로는 없지만, 나중에
  디버깅용 명령이 추가되는 순간 조용히 위험해지는 종류의 문제라 미리 걸어둔다.

## 서버 설치

```bash
git clone <이 저장소> ~/blog-deploy
cd ~/blog-deploy
cp .env.example .env
# .env 채우기: PROJECT_DIR(블로그 소스 clone 경로), DISCORD/TELEGRAM 값

chmod +x deploy.sh deploy-with-notify.sh
```

self-hosted 러너 설치 자체는 이 저장소 밖의 별도 작업이다 — private 트리거
저장소(`blog-deploy-trigger`)의 **Settings → Actions → Runners → New self-hosted
runner** 안내를 그대로 따르면 된다.

## 동작 확인 (수동)

러너를 등록한 뒤, 실제 push 없이 먼저 수동으로 검증한다.

```bash
cd ~/blog-deploy
./deploy-with-notify.sh
```

Discord에 시작/성공(또는 실패) 알림이 오고, `docker compose ps`로 컨테이너가
재기동됐는지 확인되면 성공. 이후 `blog-deploy-trigger`의 워크플로를 GitHub
Actions 대시보드에서 **Run workflow** 수동 트리거로 한 번 더 확인한 다음,
`01_blog`에 실제 push해서 전체 파이프라인을 검증한다.
