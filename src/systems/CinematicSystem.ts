import * as THREE from 'three';
import type { System } from '@/core/System';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';

/**
 * The intro cinematic: a scripted camera flyover of the city that ends behind
 * the player, GTA-style. While `active`, the Game hands the camera over and
 * gates player input; the world (traffic, pedestrians, day/night) keeps
 * simulating underneath, which is what sells the shot.
 *
 * The path is a Catmull-Rom spline from high over the coast down to street
 * level; the look-at eases from the city centre onto the player. Any key or
 * click skips. Start/end are announced on the bus so the HUD can letterbox.
 */
export class CinematicSystem implements System {
  readonly name = 'CinematicSystem';

  private curve: THREE.CatmullRomCurve3 | null = null;
  private readonly lookFrom = new THREE.Vector3(0, 24, 0);
  private readonly lookTarget = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly pos = new THREE.Vector3();
  private t = 0;
  private skipRequested = false;

  /** Total flyover duration (s). */
  private readonly duration = 13;

  private readonly onSkip = (): void => {
    this.skipRequested = true;
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly bus: EventBus<GameEvents>,
  ) {}

  get active(): boolean {
    return this.curve !== null;
  }

  /** Begin the flyover, ending just behind `playerPos`. */
  start(playerPos: THREE.Vector3): void {
    if (this.curve) return;
    this.lookTarget.copy(playerPos).add(new THREE.Vector3(0, 1.5, 0));
    // High over the coast → across downtown → swoop to street level behind
    // the player (the on-foot camera picks up smoothly from there).
    this.curve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(330, 150, 330),
        new THREE.Vector3(140, 95, 90),
        new THREE.Vector3(-90, 55, -110),
        new THREE.Vector3(playerPos.x - 30, 26, playerPos.z - 60),
        new THREE.Vector3(playerPos.x, 9, playerPos.z - 18),
      ],
      false,
      'catmullrom',
      0.5,
    );
    this.t = 0;
    this.skipRequested = false;
    window.addEventListener('keydown', this.onSkip);
    window.addEventListener('mousedown', this.onSkip);
    this.bus.emit('cinematic:started', undefined);
  }

  update(dt: number): void {
    if (!this.curve) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    if (this.skipRequested) this.t = 1;

    // Ease the run so it launches and lands gently.
    const e = this.t * this.t * (3 - 2 * this.t); // smoothstep
    this.curve.getPointAt(e, this.pos);
    this.camera.position.copy(this.pos);

    // Gaze drifts from the city centre onto the player as we descend.
    const gaze = Math.pow(e, 1.6);
    this.lookAt.lerpVectors(this.lookFrom, this.lookTarget, gaze);
    this.camera.lookAt(this.lookAt);

    if (this.t >= 1) this.finish();
  }

  private finish(): void {
    this.curve = null;
    window.removeEventListener('keydown', this.onSkip);
    window.removeEventListener('mousedown', this.onSkip);
    this.bus.emit('cinematic:ended', undefined);
  }

  dispose(): void {
    if (this.curve) this.finish();
  }
}
