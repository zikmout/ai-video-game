import * as THREE from 'three';
import { makePlane, type PlaneModel } from '@/assets/procedural/plane';
import { GameConfig } from '@/config/gameConfig';
import { clamp } from '@/core/math';

/**
 * The flyable aircraft. Holds the visual model plus arcade flight state:
 * heading (yaw), pitch, forward airspeed and whether it's airborne.
 *
 * Like `Vehicle`, the entity only integrates state — the controller decides
 * throttle/turn/pitch from input, and the crash/explosion flow lives in the
 * controller so effects and events stay out of the entity.
 */
export class Plane {
  readonly object: THREE.Group;
  readonly model: PlaneModel;

  /** Forward airspeed (m/s); planes don't reverse. */
  speed = 0;
  /** Yaw around +Y (radians). 0 faces -Z, matching vehicles. */
  heading = 0;
  /** Pitch (radians); positive = nose up. */
  pitch = 0;
  /** Visual bank from turning (radians); cosmetic only. */
  bank = 0;
  /** True once the wheels have left the runway. */
  airborne = false;
  /** True while the player pilots it. */
  occupied = false;
  /** A crashed plane is an inert, blackened wreck. */
  destroyed = false;

  private propSpin = 0;

  constructor() {
    this.model = makePlane();
    this.object = this.model.group;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get altitude(): number {
    return this.object.position.y;
  }

  /** Forward unit vector including pitch (points where the nose points). */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    const cosP = Math.cos(this.pitch);
    return out.set(
      -Math.sin(this.heading) * cosP,
      Math.sin(this.pitch),
      -Math.cos(this.heading) * cosP,
    );
  }

  /** Integrate one step: advance along the nose, apply visuals. */
  integrate(dt: number): void {
    const fwd = this.forward();
    this.object.position.addScaledVector(fwd, this.speed * dt);

    // Altitude floor: wheels on the ground (y=0) unless climbing away.
    if (this.object.position.y <= 0) {
      this.object.position.y = 0;
      this.airborne = false;
    } else {
      this.airborne = true;
    }
    this.object.position.y = clamp(this.object.position.y, 0, GameConfig.plane.maxAltitude);

    // Orientation: yaw, then pitch, then cosmetic bank.
    this.object.rotation.set(0, 0, 0);
    this.object.rotateY(this.heading);
    this.object.rotateX(-this.pitch);
    this.object.rotateZ(this.bank);

    // Propeller spins with airspeed + idle tick-over.
    this.propSpin += (2 + this.speed * 0.6) * dt;
    this.model.propeller.rotation.z = this.propSpin;
  }

  /** Place flat on the ground at a world position with a heading. */
  placeAt(x: number, z: number, heading: number): void {
    this.object.position.set(x, 0, z);
    this.heading = heading;
    this.pitch = 0;
    this.bank = 0;
    this.object.rotation.set(0, heading, 0);
  }

  /** Char the wreck after a crash (mirrors Vehicle.blacken). */
  blacken(): void {
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const darken = (m: THREE.Material): THREE.Material => {
        const c = m.clone() as THREE.MeshStandardMaterial;
        if (c.color) c.color.multiplyScalar(0.12);
        c.transparent = false;
        c.opacity = 1;
        return c;
      };
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(darken)
        : darken(mesh.material);
    });
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
