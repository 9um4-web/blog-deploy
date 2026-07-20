import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { WebhookAuthenticator } from "../src/auth.js";

function makeSignedRequest({ hmacSecret, authToken, authHeaderName, body }) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const signature = "sha256=" + crypto.createHmac("sha256", hmacSecret).update(rawBody).digest("hex");
  return {
    rawBody,
    body,
    headers: {
      "x-hub-signature-256": signature,
      [authHeaderName]: authToken,
    },
  };
}

describe("WebhookAuthenticator", () => {
  const hmacSecret = "hmac-secret-value";
  const authToken = "auth-token-value";
  const authHeaderName = "x-deploy-token";

  const auth = new WebhookAuthenticator({ hmacSecret, authToken, authHeaderName });

  it("서명과 헤더가 모두 맞으면 통과한다", () => {
    const req = makeSignedRequest({ hmacSecret, authToken, authHeaderName, body: { ref: "refs/heads/main" } });
    expect(auth.verify(req)).toEqual({ ok: true });
  });

  it("HMAC 서명이 없으면 401", () => {
    const req = makeSignedRequest({ hmacSecret, authToken, authHeaderName, body: {} });
    delete req.headers["x-hub-signature-256"];
    const result = auth.verify(req);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.reason).toBe("no-signature");
  });

  it("HMAC 서명이 틀리면 401 (본문 위변조 탐지)", () => {
    const req = makeSignedRequest({ hmacSecret, authToken, authHeaderName, body: { ref: "refs/heads/main" } });
    req.rawBody = Buffer.from(JSON.stringify({ ref: "refs/heads/evil" })); // 서명 계산 후 본문만 바꿔치기
    const result = auth.verify(req);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad-signature");
  });

  it("서명은 맞아도 커스텀 헤더 토큰이 틀리면 401 — 두 계층이 독립적으로 검증됨을 보장", () => {
    const req = makeSignedRequest({ hmacSecret, authToken: "wrong-token", authHeaderName, body: { ref: "refs/heads/main" } });
    const result = auth.verify(req);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad-token");
  });

  it("커스텀 헤더가 아예 없으면 401", () => {
    const req = makeSignedRequest({ hmacSecret, authToken, authHeaderName, body: {} });
    delete req.headers[authHeaderName];
    const result = auth.verify(req);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no-token");
  });

  it("길이가 다른 값이 들어와도 예외를 던지지 않고 401을 반환한다", () => {
    const req = makeSignedRequest({ hmacSecret, authToken: "short", authHeaderName, body: {} });
    expect(() => auth.verify(req)).not.toThrow();
    expect(auth.verify(req).ok).toBe(false);
  });

  it("rawBody가 없으면 400", () => {
    const result = auth.verify({ headers: {} });
    expect(result.status).toBe(400);
  });
});
