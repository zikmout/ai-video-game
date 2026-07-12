/**
 * Time is a small clock utility that wraps `performance.now()` and exposes
 * elapsed / delta values in seconds. It is deliberately independent of the
 * game loop so it can be reused (e.g. for animation, cooldowns, timelines).
 */
export class Time {
  /** Seconds since the clock was created (or last reset). */
  public elapsed = 0;
  /** Seconds between the two most recent `tick()` calls, clamped. */
  public delta = 0;

  private last: number;
  private readonly maxDelta: number;

  /**
   * @param maxDelta Largest delta (seconds) reported by `tick()`. Guards against
   * huge jumps after the tab is backgrounded or the debugger pauses.
   */
  constructor(maxDelta = 0.25) {
    this.maxDelta = maxDelta;
    this.last = performance.now();
  }

  /** Advance the clock. Returns the (clamped) delta in seconds. */
  tick(): number {
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    this.last = now;
    this.delta = Math.min(raw, this.maxDelta);
    this.elapsed += this.delta;
    return this.delta;
  }

  reset(): void {
    this.last = performance.now();
    this.elapsed = 0;
    this.delta = 0;
  }
}
