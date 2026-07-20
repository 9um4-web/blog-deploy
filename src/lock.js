/**
 * 인메모리 배포 락. 단일 프로세스·단일 서버 전제 (다중 인스턴스로 확장하면 파일/Redis 락으로 교체).
 *
 * 진짜 위험은 "프로세스 재시작 시 락 초기화"가 아니라 deploy.sh가 멈춰버려서
 * exec 콜백이 영영 안 불리는 경우였다 — 그래서 타임아웃을 넣어 오래된 락은 자동으로
 * 죽은 락으로 간주하고 풀어준다. acquire()/release() 인터페이스만 유지하면 나중에
 * 구현체를 바꿔 끼워도 호출부는 손댈 필요 없다.
 */
class DeployLock {
  constructor({ timeoutMs = 10 * 60 * 1000 } = {}) {
    this.timeoutMs = timeoutMs;
    this._locked = false;
    this._startedAt = 0;
  }

  acquire() {
    if (this._isHeld()) return false;
    this._locked = true;
    this._startedAt = Date.now();
    return true;
  }

  release() {
    this._locked = false;
  }

  _isHeld() {
    if (!this._locked) return false;
    if (Date.now() - this._startedAt > this.timeoutMs) {
      console.warn("[DeployLock] stale lock detected — force releasing");
      this._locked = false;
      return false;
    }
    return true;
  }
}

module.exports = { DeployLock };
