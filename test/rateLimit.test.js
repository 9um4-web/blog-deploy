import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "../src/rateLimit.js";

describe("RateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("임계치 미만 실패는 잠기지 않는다", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxFailures: 5 });
    for (let i = 0; i < 4; i++) rl.recordFailure("1.2.3.4");
    expect(rl.lockedForSeconds("1.2.3.4")).toBeNull();
  });

  it("임계치에 도달하면 잠긴다", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxFailures: 5 });
    for (let i = 0; i < 5; i++) rl.recordFailure("1.2.3.4");
    expect(rl.lockedForSeconds("1.2.3.4")).toBeGreaterThan(0);
  });

  it("윈도우 경과 후 자동 해제된다", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxFailures: 5 });
    for (let i = 0; i < 5; i++) rl.recordFailure("1.2.3.4");
    vi.advanceTimersByTime(1001);
    expect(rl.lockedForSeconds("1.2.3.4")).toBeNull();
  });

  it("clear() 호출 시 즉시 초기화된다 (인증 성공 시 사용)", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxFailures: 5 });
    for (let i = 0; i < 4; i++) rl.recordFailure("1.2.3.4");
    rl.clear("1.2.3.4");
    rl.recordFailure("1.2.3.4");
    expect(rl.lockedForSeconds("1.2.3.4")).toBeNull();
  });

  it("키(IP)별로 독립적으로 카운트된다", () => {
    const rl = new RateLimiter({ windowMs: 1000, maxFailures: 5 });
    for (let i = 0; i < 5; i++) rl.recordFailure("1.2.3.4");
    expect(rl.lockedForSeconds("5.6.7.8")).toBeNull();
  });
});
