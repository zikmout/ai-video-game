/**
 * The update contract shared by every game system.
 *
 * A system implements whichever hooks it needs:
 * - `fixedUpdate` — constant-rate simulation (physics, movement integration).
 * - `update`      — per-frame work with variable dt (input, camera, animation).
 * - `lateUpdate`  — after `update`; `alpha` is the render interpolation factor.
 *
 * The `Game` owns an ordered list of systems and calls them each tick.
 */
export interface System {
  readonly name: string;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  lateUpdate?(alpha: number): void;
  dispose?(): void;
}
