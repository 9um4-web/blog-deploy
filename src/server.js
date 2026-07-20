const express = require("express");
const { WebhookAuthenticator } = require("./auth");
const { DeployLock } = require("./lock");
const { Notifier } = require("./notify");
const { runDeploy } = require("./deployRunner");
const { RateLimiter } = require("./rateLimit");
const { clientKey } = require("./clientKey");

/**
 * config를 받아 express app을 조립한다. 모듈들을 여기서만 서로 연결하고, 각 모듈은 서로를 모른다.
 * notifier도 같이 반환한다 — 호출자(bin/start.js)가 listen 성공/실패 시 알림을 보낼 수 있어야 하는데,
 * app만 반환하면 notifier가 이 함수 스코프 안에 갇혀서 밖에서 못 쓴다.
 */
function createApp(config) {
  const app = express();
  // Cloudflare/nginx 등 리버스 프록시 뒤에 있다는 전제 — x-forwarded-for를 신뢰해야
  // clientKey()가 실제 클라이언트 IP를 잡는다. 프록시 없이 직접 노출한다면 이 줄을 지울 것.
  app.set("trust proxy", true);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const auth = new WebhookAuthenticator({
    hmacSecret: config.webhookHmacSecret,
    authToken: config.webhookAuthToken,
    authHeaderName: config.customAuthHeaderName,
  });
  const lock = new DeployLock({ timeoutMs: config.deployTimeoutMs });
  const notifier = new Notifier({
    discordWebhookUrl: config.discordWebhookUrl,
    telegramBotToken: config.telegramBotToken,
    telegramChatId: config.telegramChatId,
    telegramProxyHost: config.telegramProxyHost,
  });
  const rateLimiter = new RateLimiter({
    windowMs: config.rateLimitWindowMs,
    maxFailures: config.rateLimitMaxFailures,
  });

  app.post("/deploy-webhook", async (req, res) => {
    const key = clientKey(req);

    const lockedFor = rateLimiter.lockedForSeconds(key);
    if (lockedFor !== null) {
      res.set("Retry-After", String(lockedFor));
      return res.status(429).send(`Too many failed attempts. Retry after ${lockedFor}s`);
    }

    const verdict = auth.verify(req);
    if (!verdict.ok) {
      // 400(본문 없음)은 인증 시도 자체가 아니므로 실패 카운트에서 제외 —
      // 실제 위조/추측 시도만 카운트해서 정상 클라이언트의 우발적 오류로 잠기지 않게 한다.
      if (verdict.status === 401) rateLimiter.recordFailure(key);
      return res.status(verdict.status).send(verdict.reason);
    }
    rateLimiter.clear(key);

    if (req.body.ref !== "refs/heads/main") {
      return res.status(200).send("Not main branch");
    }

    if (!lock.acquire()) {
      console.warn("Deploy skipped: another build is already running.");
      // 순서를 보장하려면 반드시 await — fire-and-forget으로 두면 여러 요청이 동시에 나가서
      // Discord/Telegram에 도착하는 순서가 코드 순서와 달라질 수 있다.
      await notifier.telegram("⚠️ <b>배포 보류 (Deploy Skipped)</b>\n이미 빌드가 진행 중이어서 중복 요청이 안전하게 무시되었습니다.");
      await notifier.discordEmbed(
        "⚠️ 배포 보류 (Deploy Skipped)",
        "이미 다른 빌드 프로세스가 동작 중이어서 이번 배포 요청이 중복 실행 방지를 위해 건너뛰어졌습니다.",
        0xe67e22,
      );
      return res.status(202).send("Deploy skipped");
    }

    res.status(202).send("Deploying...");
    await notifier.telegram("🏗️ <b>서버 배포 시작 (Server Deploy Started)</b>\n웹훅 수신 성공. 서버 내부에서 코드 갱신 및 컨테이너 재가동을 진행합니다.");
    await notifier.discordEmbed(
      "🏗️ 서버 배포 시작 (Server Deploy Started)",
      "웹훅 수신 성공. 서버 내부에서 코드 갱신 및 컨테이너 재가동을 진행합니다.",
      0xf1c40f,
    );

    try {
      const { ok, log } = await runDeploy({
        scriptPath: config.deployScriptPath,
        secretsToRedact: [config.webhookHmacSecret, config.webhookAuthToken, ...config.secretsToRedact],
      });

      if (ok) {
        console.log("Deploy success:\n" + log);
        await notifier.telegram("✅ <b>배포 성공 (Deploy Success)</b>\n블로그 서비스가 에러 없이 성공적으로 최신화되었습니다.");
        await notifier.discordEmbed("✅ 배포 성공 (Deploy Success)", "블로그 서비스가 에러 없이 성공적으로 최신화되었습니다.", 0x2ecc71);
      } else {
        console.error("Deploy failed:\n" + log);
        await notifier.telegram("❌ <b>배포 실패 (Deploy Failed)</b>\n실서버 컨테이너 갱신 도중 오류가 발생했습니다. (디스코드 로그 확인)");
        await notifier.discordEmbed(
          "❌ 배포 실패 (Deploy Failed)",
          "실서버 컨테이너 기동(deploy.sh) 도중 에러가 발생했습니다. (상세 내역은 아래 로그를 확인하세요)",
          0xff0000,
        );

        const summary = log.length > 500 ? "... (앞부분 생략) ...\n\n" + log.slice(-500) : log;
        await notifier.discordEmbed("❌ 빌드 실패 상세 내역 (Build Error Detail)", `**에러 요약:**\n\`\`\`bash\n${summary}\n\`\`\``, 0xff0000);

        // discordFile까지 순서대로 await한 뒤에 임시 파일을 지운다 — 순서 보장 목적이지,
        // 업로드 자체는 파일을 다 읽은 뒤 요청을 보내므로 unlink 타이밍 자체가 안전에 영향을 주진 않는다.
        const errorTempPath = require("path").join(require("os").tmpdir(), `deploy_error_${Date.now()}.txt`);
        require("fs").writeFileSync(errorTempPath, log);
        await notifier.discordFile(errorTempPath);
        try {
          require("fs").unlinkSync(errorTempPath);
        } catch {
          // best-effort cleanup
        }
      }
    } finally {
      // 성공/실패 어느 쪽이든 반드시 락을 푼다 — try/finally가 핵심.
      lock.release();
    }
  });

  return { app, notifier };
}

module.exports = { createApp };
