import * as THREE from 'three';
import type { System } from '@/core/System';
import type { Input } from '@/engine/Input';
import type { CameraController } from '@/engine/CameraController';
import type { Player } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import type { World } from '@/world/World';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { GameConfig } from '@/config/gameConfig';
import { moveTowards, clamp } from '@/core/math';
import { resolveVehicleAgainstBuildings } from './vehicleCollision';

/**
 * Owns the player↔vehicle relationship and drives the occupied car.
 *
 * - When on foot near a car, pressing interact (E/F) enters it: the player mesh
 *   is hidden and control transfers to the car.
 * - While driving, W/S accelerate/brake+reverse, A/D steer, Space handbrakes.
 *   Physics uses the Vehicle's bicycle model; the car is kept out of buildings.
 * - Pressing interact again exits beside the car and restores on-foot control.
 *
 * `isDriving` lets the Game route the camera (chase vs orbit) and skip the
 * on-foot controller while in a car. The traffic system integrates the other
 * cars; this system only integrates the one the player drives.
 */
export class VehicleController implements System {
  readonly name = 'VehicleController';

  private current: Vehicle | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly prevPos = new THREE.Vector3();

  constructor(
    private readonly player: Player,
    private readonly input: Input,
    private readonly camera: CameraController,
    private readonly world: World,
    private readonly vehicles: Vehicle[],
    private readonly bus: EventBus<GameEvents>,
  ) {}

  get isDriving(): boolean {
    return this.current !== null;
  }

  /** The car currently driven, or null. */
  get vehicle(): Vehicle | null {
    return this.current;
  }

  update(_dt: number): void {
    // Enter/exit is edge-triggered on the interact action.
    if (this.input.wasPressed('interact')) {
      if (this.current) this.exit();
      else this.tryEnter();
    }
  }

  fixedUpdate(dt: number): void {
    const v = this.current;
    if (!v) return;

    // The car blew up under us — bail out.
    if (v.destroyed) {
      this.exit();
      return;
    }

    const cfg = GameConfig.vehicle;
    const throttle = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
    const steerInput = (this.input.isDown('left') ? 1 : 0) - (this.input.isDown('right') ? 1 : 0);
    const handbrake = this.input.isDown('jump');

    // Longitudinal dynamics.
    if (handbrake) {
      v.speed = moveTowards(v.speed, 0, cfg.brakeForce * 1.6 * dt);
    } else if (throttle > 0) {
      v.speed = moveTowards(v.speed, cfg.maxSpeed, cfg.acceleration * dt);
    } else if (throttle < 0) {
      // Brake if moving forward, else reverse.
      if (v.speed > 0.2) v.speed = moveTowards(v.speed, 0, cfg.brakeForce * dt);
      else v.speed = moveTowards(v.speed, -cfg.maxReverse, cfg.acceleration * 0.7 * dt);
    } else {
      // Coast: rolling drag toward 0.
      v.speed = moveTowards(v.speed, 0, cfg.drag * dt);
    }

    // Steering: less authority at high speed for stability. Steering flips sign
    // in reverse so the car handles intuitively when backing up.
    const speed01 = clamp(Math.abs(v.speed) / cfg.maxSpeed, 0, 1);
    const steerLimit = cfg.maxSteer * (1 - (1 - cfg.highSpeedSteerFactor) * speed01);
    const dir = v.speed >= 0 ? 1 : -1;
    v.steer = moveTowards(v.steer, steerInput * steerLimit * dir, 4 * dt);

    // Integrate motion, then resolve collisions against buildings.
    this.prevPos.copy(v.position);
    v.integrate(dt);
    this.resolveCollisions(v);
    this.keepInBounds(v);
  }

  /** Public entry point for demos/tests: enter the nearest car immediately. */
  enterNearest(): void {
    if (!this.current) this.tryEnter();
  }

  private tryEnter(): void {
    const range = GameConfig.vehicle.enterRange;
    let best: Vehicle | null = null;
    let bestDist = range * range;
    for (const v of this.vehicles) {
      if (v.occupied || v.destroyed) continue;
      const d = this.tmp.copy(v.position).sub(this.player.position).lengthSq();
      if (d < bestDist) {
        bestDist = d;
        best = v;
      }
    }
    if (!best) return;

    best.occupied = true;
    this.current = best;
    this.player.object.visible = false;
    // Align the on-foot camera yaw so exiting is smooth.
    this.camera.yaw = best.heading + Math.PI;
    this.bus.emit('vehicle:entered', undefined);
  }

  private exit(): void {
    const v = this.current;
    if (!v) return;
    v.occupied = false;
    // Reduce leftover speed so the parked car doesn't roll away.
    v.speed = 0;
    v.steer = 0;

    // Drop the player just to the driver's-left of the car.
    const left = this.tmp.set(-Math.cos(v.heading), 0, Math.sin(v.heading)).multiplyScalar(1.6);
    this.player.position.set(v.position.x + left.x, 0, v.position.z + left.z);
    this.player.setFacing(v.heading + Math.PI);
    this.player.object.visible = true;
    this.player.velocity.set(0, 0, 0);
    this.player.onGround = true;

    this.current = null;
    this.bus.emit('vehicle:exited', undefined);
  }

  /** Slide the car out of overlapping building AABBs (XZ), and kill speed. */
  private resolveCollisions(v: Vehicle): void {
    if (resolveVehicleAgainstBuildings(v, this.world.buildingBoxes)) {
      v.speed *= 0.3; // crunch: lose most momentum
    }
  }

  private keepInBounds(v: Vehicle): void {
    const limit = this.world.city.bounds.half + 30;
    v.position.x = clamp(v.position.x, -limit, limit);
    v.position.z = clamp(v.position.z, -limit, limit);
  }

  /** Focus point the chase camera should track (car centre, slightly up). */
  getCameraFocus(out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.current;
    if (!v) return out.set(0, 0, 0);
    return out.copy(v.position).add(new THREE.Vector3(0, 1, 0));
  }
}
