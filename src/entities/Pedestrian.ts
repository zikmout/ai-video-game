import * as THREE from 'three';
import { makePedestrian, type PedestrianModel } from '@/assets/procedural/pedestrian';

/**
 * A pedestrian entity: visual model plus a little state (heading, a wander
 * target, walk-cycle phase). The CrowdSystem steers a flock of these along the
 * sidewalks and animates their limbs; the entity just holds data and knows how
 * to pose itself.
 */
export class Pedestrian {
  readonly object: THREE.Group;
  private readonly model: PedestrianModel;

  heading = 0;
  /** Current world-space wander target on the sidewalk network. */
  readonly target = new THREE.Vector3();
  /** True while fleeing (drives faster, panicked animation). */
  fleeing = false;
  /** Dead peds lie still until the crowd system recycles them. */
  dead = false;
  /** Seconds remaining before a dead ped is recycled. */
  despawnTimer = 0;

  private phase: number;

  constructor(rng: () => number) {
    this.model = makePedestrian(rng);
    this.object = this.model.group;
    this.phase = rng() * Math.PI * 2;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  setFacing(yaw: number): void {
    this.heading = yaw;
    this.object.rotation.y = yaw;
  }

  /**
   * Advance the walk cycle. `speed01` scales stride amplitude/frequency; when
   * fleeing, arms pump higher. Called each frame by the crowd system.
   */
  animate(speed01: number, dt: number): void {
    const freq = (this.fleeing ? 11 : 7) * Math.max(0.2, speed01);
    this.phase += dt * freq;
    const amp = (this.fleeing ? 1.1 : 0.7) * speed01;
    const swing = Math.sin(this.phase) * amp;

    this.model.legL.rotation.x = swing;
    this.model.legR.rotation.x = -swing;
    // Arms swing opposite to legs; raised when fleeing.
    const armBias = this.fleeing ? -1.2 : 0;
    this.model.armL.rotation.x = -swing + armBias;
    this.model.armR.rotation.x = swing + armBias;
  }

  /** Fall over and stay down; the crowd system recycles the body later. */
  die(): void {
    if (this.dead) return;
    this.dead = true;
    this.despawnTimer = 5;
    this.object.rotation.x = -Math.PI / 2;
    this.object.position.y = 0.25;
  }

  /** Reset to a living, standing state at a new position (recycling). */
  revive(x: number, z: number): void {
    this.dead = false;
    this.fleeing = false;
    this.object.rotation.x = 0;
    this.object.position.set(x, 0, z);
  }

  dispose(): void {
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const m = mesh.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    });
  }
}
