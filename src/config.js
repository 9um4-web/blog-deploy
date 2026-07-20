const path = require("path");

/** 필수 환경변수가 없으면 즉시 죽는다 — 잘못된 설정으로 조용히 뜨는 걸 방지. */
function required(env, name) {
  const value = env[name];
  if (!value) throw new Error(`환경변수 ${name}가 설정되지 않았습니다.`);
  return value;
}

function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 4000),

    projectDir: env.PROJECT_DIR, // deploy.sh 쪽에서만 쓰지만 로그 마스킹 등에 참조할 수 있어 여기 함께 둠
    dockerHost: env.DOCKER_HOST,

    webhookHmacSecret: required(env, "WEBHOOK_HMAC_SECRET"),
    webhookAuthToken: required(env, "WEBHOOK_AUTH_TOKEN"),
    customAuthHeaderName: (env.CUSTOM_AUTH_HEADER_NAME || "x-deploy-token").toLowerCase(),
    deployTimeoutMs: Number(env.DEPLOY_TIMEOUT_MS || 10 * 60 * 1000),

    deployScriptPath: env.DEPLOY_SCRIPT_PATH || path.join(__dirname, "..", "deploy.sh"),

    // 인증 실패 레이트리밋 — 윈도우 안에서 이 횟수를 넘기면 IP를 잠근다.
    rateLimitWindowMs: Number(env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    rateLimitMaxFailures: Number(env.RATE_LIMIT_MAX_FAILURES || 10),

    discordWebhookUrl: env.DISCORD_WEBHOOK_URL,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN,
    telegramChatId: env.TELEGRAM_CHAT_ID,
    telegramProxyHost: env.TELEGRAM_PROXY_HOST,

    // deploy.sh 실행 로그에 섞여 나올 수 있는 값들 — 있으면 업로드 전 마스킹 대상에 포함
    secretsToRedact: [env.POSTGRES_PASSWORD, env.SESSION_SECRET, env.ADMIN_PASSWORD_HASH].filter(Boolean),
  };
}

module.exports = { loadConfig, required };
