import * as THREE from 'three';
import { makeCar, type CarModel } from '@/assets/procedural/car';
import { GameConfig } from '@/config/gameConfig';

/**
 * A car in the world. Holds the visual model plus kinematic state (heading,
 * forward speed, steering). Both the player-driven controller and the traffic
 * system operate on this same entity, so a hijacked traffic car drives exactly
 * like a spawned one.
 *
 * Motion uses a simple "bicycle" model: the car moves along its heading, and
 * steering changes heading proportionally to speed. This gives satisfying arcade
 * handling without a full rigid-body solver.
 */
export class Vehicle {
  readonly object: THREE.Group;
  readonly model: CarModel;

  /** Signed forward speed (m/s); negative = reversing. */
  speed = 0;
  /** Heading angle around +Y (radians). 0 faces -Z. */
  heading = 0;
  /** Current steering angle (radians). */
  steer = 0;
  /** True while a driver (player) occupies it. */
  occupied = false;

  /** Hit points; at 0 the car explodes and becomes a wreck. */
  health: number = GameConfig.vehicleHealth.max;
  /** A destroyed car is an inert, blackened wreck (can't be entered/driven). */
  destroyed = false;

  private wheelSpin = 0;

  constructor(color?: number) {
    this.model = makeCar(color);
    this.object = this.model.group;
  }

  /**
   * Apply damage. Returns true if this hit destroyed the car (transition to the
   * wreck state happens exactly once; caller triggers effects/events).
   */
  applyDamage(amount: number): boolean {
    if (this.destroyed) return false;
    this.health -= amount;
    if (this.health > 0) return false;
    this.destroyed = true;
    this.health = 0;
    this.speed = 0;
    this.steer = 0;
    this.blacken();
    return true;
  }

  /** Char the wreck: darken every material (clone to avoid sharing paint). */
  private blacken(): void {
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const darken = (m: THREE.Material): THREE.Material => {
        const clone = m.clone() as THREE.MeshStandardMaterial;
        if (clone.color) clone.color.multiplyScalar(0.12);
        if ('emissive' in clone && clone.emissive) clone.emissive.setHex(0x000000);
        if ('emissiveIntensity' in clone) clone.emissiveIntensity = 0;
        clone.transparent = false;
        clone.opacity = 1;
        return clone;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(darken)
        : darken(mesh.material);
    });
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Forward unit vector on the XZ plane derived from heading. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  /**
   * Integrate one step. `steerInput` and `throttle` are already resolved by the
   * caller (player input or AI). Updates heading, position and wheel visuals.
   */
  integrate(dt: number): void {
    // Apply heading change from the bicycle model. Turn rate scales with speed
    // and steering angle; near-zero speed barely turns (realistic + stable).
    const turnRate = (this.speed / 3.0) * Math.tan(this.steer) * 0.6;
    this.heading += turnRate * dt;

    // Advance along heading.
    const fwd = this.forward();
    this.object.position.addScaledVector(fwd, this.speed * dt);
    this.object.rotation.y = this.heading;

    // Visuals: spin wheels by distance travelled, steer the front pair.
    this.wheelSpin += (this.speed * dt) / 0.36;
    const wheels = this.model.wheels;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i]!;
      // Front wheels (indices 0,1) also yaw with steering.
      const isFront = i < 2;
      w.rotation.set(Math.PI / 2, 0, 0);
      w.rotateY(isFront ? this.steer : 0);
      w.rotateX(this.wheelSpin);
    }
  }

  /** Place the car flat at a world position with a given heading. */
  placeAt(x: number, z: number, heading: number): void {
    this.object.position.set(x, 0, z);
    this.heading = heading;
    this.object.rotation.y = heading;
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
