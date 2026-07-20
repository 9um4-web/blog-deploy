import { describe, it, expect } from "vitest";
import { redact } from "../src/deployRunner.js";

describe("redact", () => {
  it("주어진 시크릿 값을 [REDACTED]로 치환한다", () => {
    const log = "DATABASE_URL=postgres://blog:hunter2@db:5432/blog\nOK";
    expect(redact(log, ["hunter2"])).toBe("DATABASE_URL=postgres://blog:[REDACTED]@db:5432/blog\nOK");
  });

  it("빈/undefined 시크릿은 무시하고 원본을 그대로 둔다", () => {
    const log = "hello world";
    expect(redact(log, [undefined, "", null])).toBe("hello world");
  });

  it("여러 시크릿을 동시에 마스킹한다", () => {
    const log = "hmac=abc token=xyz";
    expect(redact(log, ["abc", "xyz"])).toBe("hmac=[REDACTED] token=[REDACTED]");
  });
});
