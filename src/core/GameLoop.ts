/**
 * A fixed-timestep game loop with a variable-rate render and interpolation.
 *
 * Simulation runs at a constant rate (`fixedDelta`) so physics and gameplay are
 * deterministic and frame-rate independent. Rendering happens as fast as the
 * display allows; `alpha` (0..1) lets the renderer interpolate between the two
 * most recent simulation states for smooth motion.
 *
 * Reference: Glenn Fiedler, "Fix Your Timestep!".
 */
export interface LoopCallbacks {
  /** Constant-rate simulation step. `dt` is `fixedDelta` in seconds. */
  fixedUpdate: (dt: number) => void;
  /** Per-frame work with variable dt (input polling, camera, animation). */
  update: (dt: number) => void;
  /** Draw. `alpha` is the interpolation factor between sim states (0..1). */
  render: (alpha: number) => void;
}

export class GameLoop {
  private readonly fixedDelta: number;
  private readonly maxFrameTime: number;
  private accumulator = 0;
  private last = 0;
  private rafId = 0;
  private running = false;

  /**
   * @param simulationHz Simulation frequency (default 60 Hz).
   * @param maxFrameTime Clamp for a single frame's elapsed time (seconds) to
   *   avoid the "spiral of death" when the tab was backgrounded.
   */
  constructor(
    private readonly callbacks: LoopCallbacks,
    simulationHz = 60,
    maxFrameTime = 0.25,
  ) {
    this.fixedDelta = 1 / simulationHz;
    this.maxFrameTime = maxFrameTime;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  get isRunning(): boolean {
    return this.running;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.frame);

    let frameTime = (now - this.last) / 1000;
    this.last = now;
    // Clamp to a sane range: a non-monotonic clock (background tabs, headless
    // virtual time, debugger pauses) can yield negative or huge deltas that
    // would corrupt the simulation. Never feed those to systems.
    if (frameTime < 0) frameTime = 0;
    else if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;

    // Drain the accumulator in fixed steps.
    this.accumulator += frameTime;
    while (this.accumulator >= this.fixedDelta) {
      this.callbacks.fixedUpdate(this.fixedDelta);
      this.accumulator -= this.fixedDelta;
    }

    // Variable-rate per-frame work.
    this.callbacks.update(frameTime);

    // Interpolate remaining sub-step for smooth rendering.
    const alpha = this.accumulator / this.fixedDelta;
    this.callbacks.render(alpha);
  };
}
