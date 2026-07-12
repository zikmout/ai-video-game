import * as THREE from 'three';
import type { System } from '@/core/System';
import type { Input } from '@/engine/Input';
import type { CameraController } from '@/engine/CameraController';
import type { Player } from '@/entities/Player';
import type { World } from '@/world/World';
import { GameConfig } from '@/config/gameConfig';
import { moveTowards } from '@/core/math';

/**
 * Drives the player: reads input, moves relative to the camera yaw, applies
 * gravity and jumping in the fixed step, and resolves collisions against the
 * city's building boxes. Rotation follows movement direction so the character
 * faces where it walks.
 *
 * Split of responsibilities:
 * - `fixedUpdate`: physics (deterministic).
 * - `update`: reads look input, orients the camera and character, animates.
 */
export class PlayerController implements System {
  readonly name = 'PlayerController';

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private readonly horizVel = new THREE.Vector3();
  private targetYaw = 0;
  private currentSpeed01 = 0;

  constructor(
    private readonly player: Player,
    private readonly input: Input,
    private readonly camera: CameraController,
    private readonly world: World,
  ) {}

  update(dt: number): void {
    // Mouse look drives the camera.
    const look = this.input.consumeLook();
    this.camera.addLook(look.yaw, look.pitch);

    // Orient the character toward movement direction, smoothly.
    const axis = this.input.getMoveAxis();
    if (axis.x !== 0 || axis.y !== 0) {
      this.camera.getForwardXZ(this.forward);
      this.camera.getRightXZ(this.right);
      this.wish
        .set(0, 0, 0)
        .addScaledVector(this.forward, axis.y)
        .addScaledVector(this.right, axis.x);
      if (this.wish.lengthSq() > 1e-4) {
        this.targetYaw = Math.atan2(this.wish.x, this.wish.z);
      }
    }
    // Smoothly rotate toward target yaw (shortest path).
    const cur = this.player.object.rotation.y;
    let delta = this.targetYaw - cur;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.player.setFacing(cur + delta * Math.min(1, dt * 12));

    this.player.animate(this.currentSpeed01, dt);
  }

  fixedUpdate(dt: number): void {
    const cfg = GameConfig.player;
    const axis = this.input.getMoveAxis();

    // Build desired horizontal velocity in world space, camera-relative.
    this.camera.getForwardXZ(this.forward);
    this.camera.getRightXZ(this.right);
    this.wish
      .set(0, 0, 0)
      .addScaledVector(this.forward, axis.y)
      .addScaledVector(this.right, axis.x);
    const hasInput = this.wish.lengthSq() > 1e-4;
    if (hasInput) this.wish.normalize();

    const sprinting = this.input.isDown('sprint');
    const maxSpeed = sprinting ? cfg.sprintSpeed : cfg.walkSpeed;

    // Accelerate/decelerate horizontal velocity toward the wish direction.
    this.horizVel.set(this.player.velocity.x, 0, this.player.velocity.z);
    const control = this.player.onGround ? 1 : cfg.airControl;
    if (hasInput) {
      const targetVel = this.wish.clone().multiplyScalar(maxSpeed);
      this.horizVel.x = moveTowards(this.horizVel.x, targetVel.x, cfg.acceleration * control * dt);
      this.horizVel.z = moveTowards(this.horizVel.z, targetVel.z, cfg.acceleration * control * dt);
    } else {
      const decel = cfg.deceleration * control * dt;
      this.horizVel.x = moveTowards(this.horizVel.x, 0, decel);
      this.horizVel.z = moveTowards(this.horizVel.z, 0, decel);
    }
    this.player.velocity.x = this.horizVel.x;
    this.player.velocity.z = this.horizVel.z;

    // Track speed for animation (0..1).
    this.currentSpeed01 = Math.min(1, this.horizVel.length() / cfg.sprintSpeed);

    // Gravity + jump.
    if (this.player.onGround && this.input.wasPressed('jump')) {
      this.player.velocity.y = cfg.jumpSpeed;
      this.player.onGround = false;
    }
    this.player.velocity.y -= GameConfig.simulation.gravity * dt;

    // Integrate position.
    const pos = this.player.position;
    pos.x += this.player.velocity.x * dt;
    pos.y += this.player.velocity.y * dt;
    pos.z += this.player.velocity.z * dt;

    this.resolveBuildingCollisions(pos);

    // Ground clamp.
    const ground = this.world.groundHeight(pos.x, pos.z);
    if (pos.y <= ground) {
      pos.y = ground;
      this.player.velocity.y = 0;
      this.player.onGround = true;
    } else {
      this.player.onGround = false;
    }

    this.keepInBounds(pos);
  }

  /** Push the player capsule out of any overlapping building AABB (XZ only). */
  private resolveBuildingCollisions(pos: THREE.Vector3): void {
    const r = this.player.radius;
    for (const box of this.world.buildingBoxes) {
      // Only consider boxes near the player's height range.
      if (pos.y > box.max.y) continue;
      const closestX = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const closestZ = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - closestX;
      const dz = pos.z - closestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= r * r) continue;

      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = (r - dist) / dist;
        pos.x += dx * push;
        pos.z += dz * push;
      } else {
        // Centre inside the box: eject along the smallest penetration axis.
        const toMinX = pos.x - box.min.x;
        const toMaxX = box.max.x - pos.x;
        const toMinZ = pos.z - box.min.z;
        const toMaxZ = box.max.z - pos.z;
        const minPen = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);
        if (minPen === toMinX) pos.x = box.min.x - r;
        else if (minPen === toMaxX) pos.x = box.max.x + r;
        else if (minPen === toMinZ) pos.z = box.min.z - r;
        else pos.z = box.max.z + r;
      }
      // Kill velocity into the wall.
      this.player.velocity.x *= 0.2;
      this.player.velocity.z *= 0.2;
    }
  }

  private keepInBounds(pos: THREE.Vector3): void {
    const limit = this.world.city.bounds.half + 40;
    pos.x = Math.max(-limit, Math.min(limit, pos.x));
    pos.z = Math.max(-limit, Math.min(limit, pos.z));
  }
}
