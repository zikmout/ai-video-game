import * as THREE from 'three';
import { GameConfig } from '@/config/gameConfig';
import { clamp, damp } from '@/core/math';

/**
 * A third-person orbit/follow camera.
 *
 * The player controls `yaw` (horizontal) and `pitch` (vertical) via the mouse.
 * Each frame the camera is placed on a sphere around the follow target and
 * smoothly damped toward that ideal position, so motion feels weighty rather
 * than rigid. Yaw is also exposed so the player controller can move relative to
 * where the camera is looking.
 */
export class CameraController {
  yaw = 0;
  pitch = -0.15;

  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {}

  /** Apply look input (radians) with clamping on pitch. */
  addLook(yawDelta: number, pitchDelta: number): void {
    this.yaw += yawDelta;
    this.pitch = clamp(
      this.pitch + pitchDelta,
      GameConfig.camera.pitchMin,
      GameConfig.camera.pitchMax,
    );
  }

  /**
   * Position the camera behind `focus` (the point to look at, typically the
   * player's head), smoothing over `dt` seconds.
   */
  update(focus: THREE.Vector3, dt: number): void {
    const { followDistance, followHeight, followLambda } = GameConfig.camera;

    this.target.copy(focus);

    // Spherical offset from yaw/pitch.
    const cosPitch = Math.cos(this.pitch);
    const offsetX = Math.sin(this.yaw) * cosPitch * followDistance;
    const offsetZ = Math.cos(this.yaw) * cosPitch * followDistance;
    const offsetY = followHeight - Math.sin(this.pitch) * followDistance;

    this.desired.set(
      this.target.x - offsetX,
      this.target.y + offsetY,
      this.target.z - offsetZ,
    );

    // Damp toward the desired position for smooth follow.
    this.camera.position.x = damp(this.camera.position.x, this.desired.x, followLambda, dt);
    this.camera.position.y = damp(this.camera.position.y, this.desired.y, followLambda, dt);
    this.camera.position.z = damp(this.camera.position.z, this.desired.z, followLambda, dt);

    this.lookAt.copy(this.target).add(new THREE.Vector3(0, 0.6, 0));
    this.camera.lookAt(this.lookAt);
  }

  /**
   * Chase camera for driving: sits behind the car along its heading and looks
   * ahead. Independent of mouse yaw/pitch. On exit, `syncYawTo` should be called
   * so the on-foot camera picks up where this left off.
   */
  chase(
    focus: THREE.Vector3,
    heading: number,
    distance: number,
    height: number,
    lambda: number,
    dt: number,
  ): void {
    // Car forward is (-sin, 0, -cos) of heading; camera sits opposite.
    const backX = Math.sin(heading);
    const backZ = Math.cos(heading);
    this.desired.set(
      focus.x + backX * distance,
      focus.y + height,
      focus.z + backZ * distance,
    );
    this.camera.position.x = damp(this.camera.position.x, this.desired.x, lambda, dt);
    this.camera.position.y = damp(this.camera.position.y, this.desired.y, lambda, dt);
    this.camera.position.z = damp(this.camera.position.z, this.desired.z, lambda, dt);

    this.lookAt.copy(focus).add(new THREE.Vector3(0, 0.8, 0));
    this.camera.lookAt(this.lookAt);
    // Keep on-foot yaw aligned with travel direction for a smooth handover.
    this.yaw = heading + Math.PI;
  }

  /** Forward direction on the XZ plane (unit vector), driven by yaw. */
  getForwardXZ(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  /** Right direction on the XZ plane (unit vector). */
  getRightXZ(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }
}
