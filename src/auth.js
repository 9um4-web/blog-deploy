const crypto = require("crypto");

/**
 * 길이가 다르면 crypto.timingSafeEqual이 예외를 던지므로 먼저 걸러준다.
 * 그래야 "정상적인 인증 실패(401)"와 "구현 결함으로 인한 예외(500)"가 안 섞인다.
 */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a ?? "", "utf8");
  const bufB = Buffer.from(b ?? "", "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 웹훅 요청을 두 계층으로 검증한다.
 *  1) HMAC 서명 (X-Hub-Signature-256) — 페이로드 무결성
 *  2) 커스텀 헤더 토큰 — HMAC과 별개 시크릿. 한쪽 값이 새어도 다른 쪽 인증은 살아있게 하는 게 목적이라,
 *     반드시 webhookHmacSecret과 webhookAuthToken은 다른 값이어야 한다.
 */
class WebhookAuthenticator {
  constructor({ hmacSecret, authToken, authHeaderName }) {
    if (!hmacSecret || !authToken) {
      throw new Error("WebhookAuthenticator: hmacSecret/authToken은 필수입니다.");
    }
    this.hmacSecret = hmacSecret;
    this.authToken = authToken;
    this.authHeaderName = authHeaderName.toLowerCase();
  }

  /** req.rawBody(Buffer)가 미리 세팅돼 있어야 한다 — express.json()의 verify 훅에서 채운다. */
  verify(req) {
    if (!req.rawBody) return { ok: false, status: 400, reason: "no-body" };

    const signature = req.headers["x-hub-signature-256"];
    if (!signature) return { ok: false, status: 401, reason: "no-signature" };

    const digest =
      "sha256=" + crypto.createHmac("sha256", this.hmacSecret).update(req.rawBody).digest("hex");
    if (!timingSafeEqualStr(signature, digest)) {
      return { ok: false, status: 401, reason: "bad-signature" };
    }

    const token = req.headers[this.authHeaderName];
    if (!token) return { ok: false, status: 401, reason: "no-token" };
    if (!timingSafeEqualStr(token, this.authToken)) {
      return { ok: false, status: 401, reason: "bad-token" };
    }

    return { ok: true };
  }
}

module.exports = { WebhookAuthenticator, timingSafeEqualStr };
