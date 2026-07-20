const https = require("https");
const fs = require("fs");
const path = require("path");

/** Discord/Telegram 알림. 실패해도 배포 흐름을 막으면 안 되므로 전부 fire-and-forget. */
class Notifier {
  constructor({ discordWebhookUrl, telegramBotToken, telegramChatId, telegramProxyHost }) {
    this.discordWebhookUrl = discordWebhookUrl;
    this.telegramBotToken = telegramBotToken?.trim();
    this.telegramChatId = telegramChatId?.trim();
    this.telegramHost = (telegramProxyHost || "api.telegram.org").trim();
  }

  telegram(text, parseMode = "HTML") {
    if (!this.telegramBotToken || !this.telegramChatId) return;
    const payload = JSON.stringify({ chat_id: this.telegramChatId, text, parse_mode: parseMode });
    this._postJson(this.telegramHost, `/bot${this.telegramBotToken}/sendMessage`, payload);
  }

  discordEmbed(title, description, color) {
    if (!this.discordWebhookUrl) return;
    const payload = JSON.stringify({
      embeds: [{ title, description, color, timestamp: new Date().toISOString() }],
    });
    const url = new URL(this.discordWebhookUrl);
    this._postJson(url.hostname, url.pathname + url.search, payload);
  }

  discordFile(filePath) {
    if (!this.discordWebhookUrl) return;
    const url = new URL(this.discordWebhookUrl);
    const boundary = "----blogDeployBoundary" + Math.random().toString(36).slice(2);
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      },
      (res) => console.log(`[Notifier] discord file upload -> ${res.statusCode}`),
    );
    req.on("error", (e) => console.error("[Notifier] discord file upload failed:", e.message));
    req.write(Buffer.from(header, "utf-8"));
    req.write(fileContent);
    req.write(Buffer.from(footer, "utf-8"));
    req.end();
  }

  _postJson(hostname, reqPath, payload) {
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
        });
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", (e) => console.error(`[Notifier] ${hostname} request failed:`, e.message));
    req.write(payload);
    req.end();
  }
}

module.exports = { Notifier };
