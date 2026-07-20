#!/usr/bin/env node
require("dotenv").config();

const { loadConfig } = require("../src/config");
const { createApp } = require("../src/server");

const config = loadConfig();
const { app, notifier } = createApp(config);

const server = app.listen(config.port, "127.0.0.1", () => {
  const message = `ℹ️ 수신기 서비스 시작 (Webhook Listener Started)\nGitHub 자동 배포 수신기 서비스가 포트 ${config.port}에서 성공적으로 가동되었습니다.`;
  console.log(`Listening for webhooks on 127.0.0.1:${config.port}`);
  notifier.telegram(`ℹ️ <b>수신기 서비스 시작 (Webhook Listener Started)</b>\n자동 배포 수신기 서비스가 성공적으로 가동되었습니다.`);
  notifier.discordEmbed("ℹ️ 수신기 서비스 시작 (Webhook Listener Started)", message, 0x9b59b6);
});

// listen 자체가 실패하는 경우(포트 충돌 등) — 이전에 겪으셨던 EADDRINUSE가 바로 이 경로입니다.
// 알림 없이 systemd 재시작 루프만 도는 걸 막기 위해 여기서도 한 번 알린다.
server.on("error", (err) => {
  console.error("Failed to start server:", err.message);
  notifier.telegram(`❌ <b>수신기 서비스 기동 실패</b>\n${err.message}`);
  notifier.discordEmbed("❌ 수신기 서비스 기동 실패", `\`\`\`\n${err.message}\n\`\`\``, 0xff0000);
  // 알림 전송은 fire-and-forget(HTTPS 요청)이라 바로 종료하면 못 나갈 수 있으니 잠깐 기다렸다가 종료.
  setTimeout(() => process.exit(1), 1000);
});
