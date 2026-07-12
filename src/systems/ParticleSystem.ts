import * as THREE from 'three';
import type { System } from '@/core/System';

/**
 * A pooled CPU particle system rendered as a single additive `THREE.Points`.
 *
 * A fixed pool of particles is recycled; spawning never allocates. Each frame,
 * live particles integrate simple ballistics (velocity + gravity + drag), fade
 * out over their lifetime, and write into pre-allocated buffer attributes.
 *
 * Presets cover the effects M4 needs: muzzle flashes, bullet impacts, and the
 * big car explosion (fireball + sparks + lingering smoke). Additive blending
 * makes fire/sparks glow; "smoke" particles just use dark colours, which reads
 * fine additively at low alpha.
 */
interface Particle {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
}

const POOL_SIZE = 2048;

export class ParticleSystem implements System {
  readonly name = 'ParticleSystem';

  private readonly particles: Particle[] = [];
  private readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.particles.push({
        alive: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        color: new THREE.Color(),
        size: 1,
        life: 0,
        maxLife: 1,
        gravity: 0,
        drag: 0,
      });
    }

    this.positions = new Float32Array(POOL_SIZE * 3);
    this.colors = new Float32Array(POOL_SIZE * 3);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    // Hide dead particles far below the world.
    this.positions.fill(0);
    for (let i = 0; i < POOL_SIZE; i++) this.positions[i * 3 + 1] = -9999;

    this.material = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.name = 'Particles';
    scene.add(this.points);
  }

  /** Spawn one particle (recycling the oldest slot). */
  private spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: number,
    life: number,
    size: number,
    gravity: number,
    drag: number,
  ): void {
    const p = this.particles[this.cursor]!;
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    p.alive = true;
    p.pos.copy(pos);
    p.vel.copy(vel);
    p.color.setHex(color);
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    p.drag = drag;
  }

  private readonly v = new THREE.Vector3();

  /** Random unit-ish vector inside a cone around `dir` (or full sphere if none). */
  private randomDir(dir?: THREE.Vector3, spread = 1): THREE.Vector3 {
    this.v.set(
      (Math.random() - 0.5) * 2 * spread,
      (Math.random() - 0.5) * 2 * spread,
      (Math.random() - 0.5) * 2 * spread,
    );
    if (dir) this.v.add(dir);
    return this.v.normalize();
  }

  // ── Presets ────────────────────────────────────────────────────────────────

  /** Short bright flash at a gun muzzle. */
  muzzleFlash(pos: THREE.Vector3, dir: THREE.Vector3): void {
    for (let i = 0; i < 6; i++) {
      const d = this.randomDir(dir, 0.35).multiplyScalar(6 + Math.random() * 5);
      this.spawn(pos, d, i % 2 ? 0xffd27a : 0xfff3b0, 0.08 + Math.random() * 0.05, 0.5, 0, 6);
    }
  }

  /** Sparks + dust where a bullet lands. */
  impact(pos: THREE.Vector3): void {
    for (let i = 0; i < 10; i++) {
      const d = this.randomDir(undefined, 1).multiplyScalar(3 + Math.random() * 4);
      d.y = Math.abs(d.y) + 1.5;
      this.spawn(pos, d, i % 3 ? 0xffc46a : 0xaaaaaa, 0.25 + Math.random() * 0.2, 0.35, 14, 2);
    }
  }

  /** Big fireball + sparks + smoke for a destroyed vehicle. */
  explosion(pos: THREE.Vector3): void {
    // Fireball core.
    for (let i = 0; i < 60; i++) {
      const d = this.randomDir().multiplyScalar(4 + Math.random() * 9);
      d.y = Math.abs(d.y) * 1.4 + 2;
      const c = [0xffe08a, 0xff9d3c, 0xff5722, 0xd8341c][i % 4]!;
      this.spawn(pos, d, c, 0.5 + Math.random() * 0.5, 1.4, 6, 2.2);
    }
    // Fast sparks.
    for (let i = 0; i < 30; i++) {
      const d = this.randomDir().multiplyScalar(12 + Math.random() * 14);
      this.spawn(pos, d, 0xfff0b0, 0.35 + Math.random() * 0.3, 0.45, 16, 1);
    }
    // Rising smoke (dark, slow).
    for (let i = 0; i < 26; i++) {
      const d = this.randomDir().multiplyScalar(1.2);
      d.y = 2.2 + Math.random() * 2.4;
      this.spawn(pos, d, 0x2a2a2a, 1.4 + Math.random() * 1.2, 2.2, -0.8, 1.4);
    }
  }

  /** A puff of exhaust-style smoke (used for burning wrecks). */
  smokePuff(pos: THREE.Vector3): void {
    for (let i = 0; i < 3; i++) {
      const d = this.randomDir().multiplyScalar(0.5);
      d.y = 1.6 + Math.random() * 1.2;
      this.spawn(pos, d, i % 2 ? 0x333333 : 0x552f18, 1.2 + Math.random(), 1.5, -0.6, 1.2);
    }
  }

  update(dt: number): void {
    const posAttr = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.geometry.getAttribute('color') as THREE.BufferAttribute;

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = this.particles[i]!;
      if (!p.alive) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.positions[i * 3 + 1] = -9999;
        continue;
      }

      // Ballistics.
      p.vel.y -= p.gravity * dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vel.multiplyScalar(damp);
      p.pos.addScaledVector(p.vel, dt);

      const t = p.life / p.maxLife; // 1 → 0
      this.positions[i * 3] = p.pos.x;
      this.positions[i * 3 + 1] = p.pos.y;
      this.positions[i * 3 + 2] = p.pos.z;
      // Fade by scaling colour toward black (additive blending ⇒ invisible).
      this.colors[i * 3] = p.color.r * t;
      this.colors[i * 3 + 1] = p.color.g * t;
      this.colors[i * 3 + 2] = p.color.b * t;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.points.parent?.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
