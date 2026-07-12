import * as THREE from 'three';
import type { System } from '@/core/System';
import type { Input } from '@/engine/Input';
import type { CameraController } from '@/engine/CameraController';
import type { Player } from '@/entities/Player';
import type { Plane } from '@/entities/Plane';
import type { World } from '@/world/World';
import type { ParticleSystem } from '@/systems/ParticleSystem';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { GameConfig } from '@/config/gameConfig';
import { moveTowards, clamp } from '@/core/math';

/**
 * Owns the player↔plane relationship and flies the occupied aircraft with
 * arcade physics:
 *
 * - On the ground it taxis like a slow car; past takeoff speed, holding Space
 *   (pull up) rotates the nose and the plane climbs away.
 * - In the air: W/S throttle, A/D turn (banking visually), Space/Shift pitch.
 *   Below stall speed the nose drops and the plane sinks.
 * - Hitting a building, or the ground nose-down/too fast a sink, destroys the
 *   plane: explosion, blackened wreck, and the player is dropped beside it.
 *
 * Mirrors VehicleController so Game can route camera/HUD the same way.
 */
export class PlaneController implements System {
  readonly name = 'PlaneController';

  private piloting = false;
  private readonly tmp = new THREE.Vector3();
  private readonly box = new THREE.Box3();
  /** Coarse collision volume around the fuselage (narrower than the wings). */
  private readonly hullSize = new THREE.Vector3(2.2, 2.2, 2.2);

  constructor(
    private readonly player: Player,
    private readonly input: Input,
    private readonly camera: CameraController,
    private readonly world: World,
    private readonly plane: Plane,
    private readonly particles: ParticleSystem,
    private readonly bus: EventBus<GameEvents>,
    private readonly isDrivingCar: () => boolean,
  ) {}

  get isFlying(): boolean {
    return this.piloting;
  }

  /** The aircraft (single instance for now). */
  get aircraft(): Plane {
    return this.plane;
  }

  update(_dt: number): void {
    if (!this.input.wasPressed('interact')) return;
    if (this.piloting) {
      // Bail out only once (nearly) on the ground — no mid-air exits.
      if (this.plane.altitude < 2) this.exit();
    } else {
      this.tryEnter();
    }
  }

  fixedUpdate(dt: number): void {
    if (!this.piloting) return;
    const p = this.plane;
    const cfg = GameConfig.plane;

    if (p.destroyed) {
      this.exit();
      return;
    }

    const throttle = (this.input.isDown('forward') ? 1 : 0) - (this.input.isDown('back') ? 1 : 0);
    const turn = (this.input.isDown('left') ? 1 : 0) - (this.input.isDown('right') ? 1 : 0);
    const pitchInput =
      (this.input.isDown('jump') ? 1 : 0) - (this.input.isDown('sprint') ? 1 : 0);

    // Airspeed.
    if (throttle > 0) {
      p.speed = moveTowards(p.speed, cfg.maxSpeed, cfg.acceleration * dt);
    } else if (throttle < 0) {
      const decel = p.airborne ? cfg.acceleration * 0.6 : cfg.brakeForce;
      p.speed = moveTowards(p.speed, 0, decel * dt);
    } else {
      p.speed = moveTowards(p.speed, 0, cfg.drag * dt);
    }

    // Yaw: full authority in the air, taxi authority scales with speed.
    const yawAuthority = p.airborne ? 1 : clamp(p.speed / cfg.takeoffSpeed, 0, 1);
    p.heading += turn * cfg.turnRate * yawAuthority * dt;

    // Pitch. On the ground the nose only lifts past takeoff speed.
    const canRotate = p.airborne || p.speed >= cfg.takeoffSpeed;
    let targetPitch = canRotate ? pitchInput * cfg.maxPitch : 0;
    // Stall: below flying speed the nose drops no matter what.
    if (p.airborne && p.speed < cfg.stallSpeed) targetPitch = -cfg.maxPitch;
    p.pitch = moveTowards(p.pitch, targetPitch, cfg.pitchRate * dt);

    // Cosmetic banking into turns while airborne.
    const targetBank = p.airborne ? turn * cfg.bankAngle : 0;
    p.bank = moveTowards(p.bank, targetBank, 2.5 * dt);

    const sinkBefore = p.speed * Math.sin(p.pitch); // vertical speed (m/s)
    const wasAirborne = p.airborne;
    p.integrate(dt);
    // Extra sink when stalled, on top of the nose-down drift.
    if (p.airborne && p.speed < cfg.stallSpeed) {
      p.position.y = Math.max(0, p.position.y - cfg.stallSink * dt);
      if (p.position.y === 0) p.airborne = false;
    }

    // Touching down too hard (or nose-first) is a crash; gentle contact lands.
    if (wasAirborne && !p.airborne && -sinkBefore > cfg.crashSink) {
      this.crash();
      return;
    }
    if (!p.airborne) p.pitch = Math.max(0, p.pitch);

    // Flying into a building always ends badly.
    this.box.setFromCenterAndSize(
      this.tmp.copy(p.position).setY(p.position.y + p.model.halfExtents.y),
      this.hullSize,
    );
    for (const b of this.world.buildingBoxes) {
      if (this.box.intersectsBox(b)) {
        this.crash();
        return;
      }
    }

    // Keep within the ground plane so the world never runs out beneath us.
    const limit = this.world.city.bounds.half * 2.4;
    p.position.x = clamp(p.position.x, -limit, limit);
    p.position.z = clamp(p.position.z, -limit, limit);
  }

  /** Public entry point for demos/tests: board the plane immediately. */
  enterNow(): void {
    if (!this.piloting && !this.plane.destroyed) this.board();
  }

  private tryEnter(): void {
    if (this.isDrivingCar() || this.plane.destroyed || this.plane.occupied) return;
    const range = GameConfig.plane.enterRange;
    if (this.plane.position.distanceToSquared(this.player.position) > range * range) return;
    this.board();
  }

  private board(): void {
    this.plane.occupied = true;
    this.piloting = true;
    this.player.object.visible = false;
    this.camera.yaw = this.plane.heading + Math.PI;
    this.bus.emit('plane:entered', undefined);
  }

  private exit(): void {
    const p = this.plane;
    p.occupied = false;
    p.speed = 0;
    this.piloting = false;

    const left = this.tmp
      .set(-Math.cos(p.heading), 0, Math.sin(p.heading))
      .multiplyScalar(3.2);
    this.player.position.set(p.position.x + left.x, 0, p.position.z + left.z);
    this.player.setFacing(p.heading + Math.PI);
    this.player.object.visible = true;
    this.player.velocity.set(0, 0, 0);
    this.player.onGround = true;
    this.bus.emit('plane:exited', undefined);
  }

  private crash(): void {
    const p = this.plane;
    p.destroyed = true;
    p.speed = 0;
    p.pitch = 0;
    p.position.y = 0;
    p.blacken();
    this.particles.explosion(this.tmp.copy(p.position).add(new THREE.Vector3(0, 1.2, 0)));
    this.bus.emit('plane:crashed', {
      position: [p.position.x, p.position.y, p.position.z],
    });
    this.exit();
  }

  /** Focus point for the chase camera (fuselage centre, slightly up). */
  getCameraFocus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.plane.position).add(this.tmp.set(0, 1.6, 0));
  }
}
