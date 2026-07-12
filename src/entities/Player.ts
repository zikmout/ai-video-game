import * as THREE from 'three';
import { GameConfig } from '@/config/gameConfig';

/**
 * The player entity: a simple stylised character built from primitives (a
 * placeholder for a future AI-generated, rigged model). It owns its visual
 * `object` and a tiny bit of animation state (a walk bob) so movement reads
 * clearly. Physics/collision live in the PlayerController system, keeping the
 * entity a plain data + visuals holder.
 */
export class Player {
  readonly object = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  onGround = false;

  private readonly body: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly legL: THREE.Mesh;
  private readonly legR: THREE.Mesh;
  private walkPhase = 0;

  constructor() {
    this.object.name = 'Player';

    const skin = new THREE.MeshStandardMaterial({ color: 0xe0a878, roughness: 0.8 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2e6f9e, roughness: 0.7 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.8 });

    // Torso
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 6, 12), shirt);
    this.body.position.y = 1.15;
    this.body.castShadow = true;
    this.object.add(this.body);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), skin);
    this.head.position.y = 1.72;
    this.head.castShadow = true;
    this.object.add(this.head);

    // Legs
    const legGeo = new THREE.CapsuleGeometry(0.13, 0.5, 4, 8);
    this.legL = new THREE.Mesh(legGeo, pants);
    this.legL.position.set(-0.14, 0.5, 0);
    this.legL.castShadow = true;
    this.legR = new THREE.Mesh(legGeo, pants);
    this.legR.position.set(0.14, 0.5, 0);
    this.legR.castShadow = true;
    this.object.add(this.legL, this.legR);
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  /** Point of interest the camera focuses on (head height). */
  getFocus(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.object.position).add(new THREE.Vector3(0, 1.5, 0));
  }

  /** Face the given horizontal direction (radians around Y). */
  setFacing(yaw: number): void {
    this.object.rotation.y = yaw;
  }

  /**
   * Advance the walk animation. `speed01` is 0..1 of max speed; drives a leg
   * swing and a subtle body bob. Called from the controller each frame.
   */
  animate(speed01: number, dt: number): void {
    if (speed01 > 0.05 && this.onGround) {
      this.walkPhase += dt * (6 + speed01 * 6);
      const swing = Math.sin(this.walkPhase) * 0.5 * speed01;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.body.position.y = 1.15 + Math.abs(Math.sin(this.walkPhase)) * 0.03 * speed01;
    } else {
      // Ease back to neutral.
      this.legL.rotation.x *= 1 - Math.min(1, dt * 10);
      this.legR.rotation.x *= 1 - Math.min(1, dt * 10);
    }
  }

  get radius(): number {
    return GameConfig.player.radius;
  }
}
