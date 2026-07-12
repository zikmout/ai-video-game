import * as THREE from 'three';
import type { System } from '@/core/System';
import { Pedestrian } from '@/entities/Pedestrian';
import type { World } from '@/world/World';
import type { Vehicle } from '@/entities/Vehicle';
import { Random } from '@/core/Random';
import { GameConfig } from '@/config/gameConfig';

/**
 * Wandering pedestrian crowd.
 *
 * Pedestrians walk the sidewalk band that borders each block. Each picks a
 * target point on the sidewalk grid, walks to it, then picks another — so the
 * crowd drifts naturally along pavements rather than through roads or buildings.
 * When a car comes close they flee perpendicular to it for a moment, then resume
 * wandering. Limbs animate through the entity's walk cycle.
 *
 * Steering is intentionally lightweight (seek + flee, no navmesh); it reads as a
 * living crowd while staying cheap for dozens of agents.
 */
export class CrowdSystem implements System {
  readonly name = 'CrowdSystem';

  private readonly peds: Pedestrian[] = [];
  private readonly rng: Random;
  private readonly sidewalkCoords: number[] = [];
  private readonly half: number;

  private readonly tmp = new THREE.Vector3();
  private readonly flee = new THREE.Vector3();

  /** Recent gunshot/explosion peds should scatter from (world XZ). */
  private readonly panicPoint = new THREE.Vector3();
  private panicTimer = 0;
  private static readonly PANIC_RADIUS = 30;

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
    private readonly vehicles: Vehicle[],
    private readonly playerPos: () => THREE.Vector3,
  ) {
    this.rng = new Random(GameConfig.seed ^ 0x9ed5);
    this.half = this.world.city.bounds.half;

    // Sidewalk lines run just inside each block edge, i.e. offset from the road
    // centrelines by half the road + a small inset.
    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    const inset = roadWidth / 2 + 1.5;
    for (let i = 0; i <= blocks; i++) {
      const road = -this.half + i * cell - roadWidth / 2;
      this.sidewalkCoords.push(road - inset);
      this.sidewalkCoords.push(road + inset);
    }

    this.spawn();
  }

  private spawn(): void {
    for (let i = 0; i < GameConfig.crowd.count; i++) {
      const ped = new Pedestrian(() => this.rng.next());
      const [x, z] = this.randomSidewalkPoint();
      ped.object.position.set(x, 0, z);
      ped.setFacing(this.rng.range(0, Math.PI * 2));
      this.pickTarget(ped);
      this.peds.push(ped);
      this.scene.add(ped.object);
    }
  }

  /** A random point sitting on a sidewalk line (one axis snapped, one free). */
  private randomSidewalkPoint(): [number, number] {
    const snapped = this.rng.pick(this.sidewalkCoords);
    const free = this.rng.range(-this.half, this.half);
    return this.rng.bool() ? [free, snapped] : [snapped, free];
  }

  private pickTarget(ped: Pedestrian): void {
    const [x, z] = this.randomSidewalkPoint();
    ped.target.set(x, 0, z);
  }

  /** Make everyone near `pos` scatter (gunshots, explosions). */
  panicAt(pos: THREE.Vector3): void {
    this.panicPoint.copy(pos);
    this.panicTimer = 4;
  }

  /** Kill the pedestrian nearest to `pos` within `radius`. Returns it, or null. */
  killNearest(pos: THREE.Vector3, radius: number): Pedestrian | null {
    let best: Pedestrian | null = null;
    let bestD = radius * radius;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const d = ped.position.distanceToSquared(pos);
      if (d < bestD) {
        bestD = d;
        best = ped;
      }
    }
    if (best) best.die();
    return best;
  }

  /** Kill every living pedestrian within `radius` of `pos`. Returns the count. */
  killInRadius(pos: THREE.Vector3, radius: number): number {
    let killed = 0;
    const r2 = radius * radius;
    for (const ped of this.peds) {
      if (ped.dead) continue;
      if (ped.position.distanceToSquared(pos) < r2) {
        ped.die();
        killed++;
      }
    }
    return killed;
  }

  fixedUpdate(dt: number): void {
    const cfg = GameConfig.crowd;
    const player = this.playerPos();
    if (this.panicTimer > 0) this.panicTimer -= dt;

    for (const ped of this.peds) {
      // Dead peds lie where they fell, then get recycled elsewhere.
      if (ped.dead) {
        ped.despawnTimer -= dt;
        if (ped.despawnTimer <= 0) {
          const [x, z] = this.randomSidewalkPoint();
          ped.revive(x, z);
          this.pickTarget(ped);
        }
        continue;
      }

      // Detect a nearby fast car to flee from.
      let fleeing = false;
      this.flee.set(0, 0, 0);
      for (const v of this.vehicles) {
        if (Math.abs(v.speed) < 1) continue;
        const dist = this.tmp.copy(v.position).sub(ped.position);
        dist.y = 0;
        const d = dist.length();
        if (d < cfg.fleeRadius && d > 0.001) {
          fleeing = true;
          // Flee directly away from the car, weighted by proximity.
          this.flee.addScaledVector(dist.multiplyScalar(-1 / (d * d)), 1);
        }
      }

      // Scatter from recent gunfire too.
      if (this.panicTimer > 0) {
        const away = this.tmp.copy(ped.position).sub(this.panicPoint);
        away.y = 0;
        const d = away.length();
        if (d < CrowdSystem.PANIC_RADIUS && d > 0.001) {
          fleeing = true;
          this.flee.addScaledVector(away.multiplyScalar(1 / (d * d)), 2);
        }
      }

      ped.fleeing = fleeing;

      let speed = cfg.speed;
      let dir: THREE.Vector3;
      if (fleeing && this.flee.lengthSq() > 1e-5) {
        dir = this.flee.normalize();
        speed *= cfg.fleeMultiplier;
      } else {
        // Seek the wander target.
        this.tmp.copy(ped.target).sub(ped.position);
        this.tmp.y = 0;
        if (this.tmp.length() < 1.2) {
          this.pickTarget(ped);
          this.tmp.copy(ped.target).sub(ped.position);
          this.tmp.y = 0;
        }
        dir = this.tmp.normalize();
      }

      // Move and face travel direction.
      ped.position.addScaledVector(dir, speed * dt);
      const targetYaw = Math.atan2(dir.x, dir.z);
      const cur = ped.object.rotation.y;
      // Shortest-arc smoothing.
      let delta = targetYaw - cur;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      ped.setFacing(cur + delta * Math.min(1, dt * 10));

      // Nudge away from the player a touch so they don't stand inside them.
      const toPlayer = this.tmp.copy(player).sub(ped.position);
      toPlayer.y = 0;
      const pd = toPlayer.length();
      if (pd < 0.8 && pd > 0.001) {
        ped.position.addScaledVector(toPlayer.multiplyScalar(-1 / pd), (0.8 - pd));
      }

      this.keepInBounds(ped.position);
    }
  }

  update(dt: number): void {
    for (const ped of this.peds) {
      if (ped.dead) continue;
      const speed01 = ped.fleeing ? 1 : 0.7;
      ped.animate(speed01, dt);
    }
  }

  private keepInBounds(pos: THREE.Vector3): void {
    const limit = this.half + 5;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));
  }

  /** Expose positions for the mini-map. */
  get pedestrians(): readonly Pedestrian[] {
    return this.peds;
  }

  dispose(): void {
    for (const ped of this.peds) {
      this.scene.remove(ped.object);
      ped.dispose();
    }
    this.peds.length = 0;
  }
}
