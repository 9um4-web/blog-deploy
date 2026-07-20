import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DeployLock } from "../src/lock.js";

describe("DeployLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("처음 acquire는 성공한다", () => {
    const lock = new DeployLock({ timeoutMs: 1000 });
    expect(lock.acquire()).toBe(true);
  });

  it("이미 잡힌 락은 재획득할 수 없다 (중복 배포 방지)", () => {
    const lock = new DeployLock({ timeoutMs: 1000 });
    lock.acquire();
    expect(lock.acquire()).toBe(false);
  });

  it("release 후에는 다시 acquire할 수 있다", () => {
    const lock = new DeployLock({ timeoutMs: 1000 });
    lock.acquire();
    lock.release();
    expect(lock.acquire()).toBe(true);
  });

  it("타임아웃을 넘긴 락은 자동으로 죽은 락으로 간주되어 풀린다 (deploy.sh가 멈춘 경우 대비)", () => {
    const lock = new DeployLock({ timeoutMs: 1000 });
    lock.acquire();
    vi.advanceTimersByTime(1001);
    expect(lock.acquire()).toBe(true);
  });

  it("타임아웃 전에는 계속 잠긴 상태를 유지한다", () => {
    const lock = new DeployLock({ timeoutMs: 1000 });
    lock.acquire();
    vi.advanceTimersByTime(999);
    expect(lock.acquire()).toBe(false);
  });
});
