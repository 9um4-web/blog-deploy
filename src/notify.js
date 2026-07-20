const https = require("https");
const fs = require("fs");
const path = require("path");

/**
 * Discord/Telegram 알림. 각 메서드는 요청이 실제로 끝날 때(성공이든 실패든) resolve되는
 * Promise를 반환한다 — 실패해도 reject하지 않는다(알림 실패로 배포 흐름 자체가 죽으면 안 되므로).
 *
 * 호출자가 반드시 await 해야 순서가 보장된다. await 없이 연달아 호출하면 여러 HTTPS 요청이
 * 동시에 나가서 네트워크 타이밍에 따라 Discord/Telegram에 도착하는 순서가 코드 순서와
 * 달라질 수 있다(실제로 로그 파일이 상세 내역 임베드보다 먼저 도착하는 문제로 나타났었다).
 */
class Notifier {
  constructor({ discordWebhookUrl, telegramBotToken, telegramChatId, telegramProxyHost }) {
    this.discordWebhookUrl = discordWebhookUrl;
    this.telegramBotToken = telegramBotToken?.trim();
    this.telegramChatId = telegramChatId?.trim();
    this.telegramHost = (telegramProxyHost || "api.telegram.org").trim();
  }

  telegram(text, parseMode = "HTML") {
    if (!this.telegramBotToken || !this.telegramChatId) return Promise.resolve();
    const payload = JSON.stringify({ chat_id: this.telegramChatId, text, parse_mode: parseMode });
    return this._postJson(this.telegramHost, `/bot${this.telegramBotToken}/sendMessage`, payload);
  }

  discordEmbed(title, description, color) {
    if (!this.discordWebhookUrl) return Promise.resolve();
    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: new Date().toISOString() }],
    });
    const url = new URL(this.discordWebhookUrl);
    return this._postJson(url.hostname, url.pathname + url.search, payload);
  }

  discordFile(filePath) {
    if (!this.discordWebhookUrl) return Promise.resolve();
    const url = new URL(this.discordWebhookUrl);
    const boundary = "----blogDeployBoundary" + Math.random().toString(36).slice(2);
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    return new Promise((resolve) => {
      const req = https.request(
        {
          method: "POST",
          hostname: url.hostname,
          path: url.pathname + url.search,
          headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
        },
        (res) => {
          res.on("data", () => {});
          res.on("end", () => {
            console.log(`[Notifier] discord file upload -> ${res.statusCode}`);
            resolve();
          });
        },
      );
      req.on("error", (e) => {
        console.error("[Notifier] discord file upload failed:", e.message);
        resolve();
      });
      req.write(Buffer.from(header, "utf-8"));
      req.write(fileContent);
      req.write(Buffer.from(footer, "utf-8"));
      req.end();
    });
  }

  _postJson(hostname, reqPath, payload) {
    return new Promise((resolve) => {
      const req = https.request(
        {
          hostname,
          path: reqPath,
          method: "POST",
          timeout: 5000,
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += chunk));
          res.on("end", () => {
            if (res.statusCode >= 300) console.error(`[Notifier] ${hostname} -> ${res.statusCode}: ${body}`);
            resolve();
          });
        },
      );
      req.on("timeout", () => {
        req.destroy();
        resolve();
      });
      req.on("error", (e) => {
        console.error(`[Notifier] ${hostname} request failed:`, e.message);
        resolve();
      });
      req.write(payload);
      req.end();
    });
  }
}

module.exports = { Notifier };
