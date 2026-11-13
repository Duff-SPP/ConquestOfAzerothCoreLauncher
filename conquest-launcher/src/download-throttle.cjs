// Copyright (C) 2026 Duff (Duff-SPP). GPL-3.0-only; see LICENSE and ATTRIBUTION.md at the repository root.
const { setTimeout: sleep } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');

class DownloadThrottle {
  constructor(limit, { now = () => performance.now(), wait = sleep } = {}) {
    this.limit = limit; this.now = now; this.wait = wait;
  }
  async consume(bytes, signal) {
    let remaining = bytes;
    let previous = this.now();
    while (remaining > 0) {
      signal.throwIfAborted();
      const rate = this.limit();
      if (!Number.isFinite(rate) || rate <= 0) return;
      // Re-read the setting regularly; pausing interrupts the wait immediately.
      await this.wait(Math.max(1, Math.min(200, remaining * 1000 / rate)), undefined, { signal });
      const current = this.now();
      remaining -= Math.max(0, current - previous) * rate / 1000;
      previous = current;
    }
  }
}

module.exports = { DownloadThrottle };
