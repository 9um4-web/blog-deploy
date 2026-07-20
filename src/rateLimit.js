/**
 * 인증 실패 횟수 기반 슬라이딩 윈도우 락아웃. 01_blog의 lib/auth/rate-limit.ts와
 * 같은 패턴 — 키(보통 IP)별로 실패를 세고, 윈도우 안에서 임계치를 넘으면 잠근다.
 *
 * 단일 프로세스 인메모리 전제. 다중 인스턴스로 확장하면 Redis 등으로 교체.
 */
class RateLimiter {
  constructor({ windowMs = 15 * 60 * 1000, maxFailures = 10 } = {}) {
    this.windowMs = windowMs;
    this.maxFailures = maxFailures;
    this.failures = new Map();
  }

  _prune(now) {
    for (const [key, entry] of this.failures) {
      if (entry.resetAt <= now) this.failures.delete(key);
    }
  }

  /** 잠금 상태면 남은 초를, 아니면 null을 반환 */
  lockedForSeconds(key) {
    const now = Date.now();
    this._prune(now);
    const entry = this.failures.get(key);
    if (!entry || entry.count < this.maxFailures) return null;
    return Math.ceil((entry.resetAt - now) / 1000);
  }

  recordFailure(key) {
    const now = Date.now();
    const entry = this.failures.get(key);
    if (!entry || entry.resetAt <= now) {
      this.failures.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
    }
  }

  clear(key) {
    this.failures.delete(key);
  }
}

module.exports = { RateLimiter };
