import * as THREE from 'three';
import type { System } from '@/core/System';
import type { Input } from '@/engine/Input';
import type { CameraController } from '@/engine/CameraController';
import type { Player } from '@/entities/Player';
import type { Vehicle } from '@/entities/Vehicle';
import type { World } from '@/world/World';
import type { CrowdSystem } from '@/systems/CrowdSystem';
import type { ParticleSystem } from '@/systems/ParticleSystem';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import type { WeaponKind } from '@/assets/procedural/guns';
import { GameConfig } from '@/config/gameConfig';

interface Rocket {
  mesh: THREE.Mesh;
  dir: THREE.Vector3;
  life: number;
}

interface BurningWreck {
  vehicle: Vehicle;
  timer: number;
  puffAccum: number;
}

/**
 * Player weapons: pistol, SMG and bazooka.
 *
 * - `1`/`2`/`3` equips (the model appears in the player's hand), `H`/`0`
 *   holsters. Left mouse fires; the SMG is fully automatic.
 * - Guns are hitscan: a ray from the player's chest along the camera's aim,
 *   tested against pedestrians, vehicles, buildings and the ground — nearest
 *   hit wins. Impacts spark; vehicles take damage and eventually explode into
 *   blackened, smoking wrecks.
 * - The bazooka fires a slow visible rocket that detonates on contact with an
 *   area-of-effect blast.
 * - Every shot panics the nearby crowd and raises the wanted level via crime
 *   events (gunfire is throttled so automatic fire doesn't max the stars in a
 *   second; kills and destroyed vehicles are always counted).
 *
 * Firing is disabled while driving; the weapon re-appears on exit.
 */
export class WeaponSystem implements System {
  readonly name = 'WeaponSystem';

  private current: WeaponKind | null = null;
  private cooldown = 0;
  private gunfireCrimeCooldown = 0;
  private readonly rockets: Rocket[] = [];
  private readonly wrecks: BurningWreck[] = [];

  private readonly aimDir = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly muzzle = new THREE.Vector3();
  private readonly hitPoint = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly tmp = new THREE.Vector3();

  private readonly rocketGeo = new THREE.SphereGeometry(0.16, 8, 8);
  private readonly rocketMat = new THREE.MeshStandardMaterial({
    color: 0xffd27a,
    emissive: 0xff9d3c,
    emissiveIntensity: 2,
  });

  constructor(
    private readonly player: Player,
    private readonly input: Input,
    private readonly camera: CameraController,
    private readonly world: World,
    private readonly vehicles: Vehicle[],
    private readonly crowd: CrowdSystem,
    private readonly particles: ParticleSystem,
    private readonly scene: THREE.Scene,
    private readonly bus: EventBus<GameEvents>,
    private readonly isDriving: () => boolean,
  ) {}

  /** Currently equipped weapon's display name (for the HUD), or null. */
  get weaponName(): string | null {
    if (!this.current) return null;
    return GameConfig.weapons[this.current].name;
  }

  update(_dt: number): void {
    // Weapon switching works on foot only.
    if (this.isDriving()) return;
    if (this.input.wasPressed('weapon1')) this.equip('pistol');
    else if (this.input.wasPressed('weapon2')) this.equip('smg');
    else if (this.input.wasPressed('weapon3')) this.equip('bazooka');
    else if (this.input.wasPressed('holster')) this.equip(null);
  }

  private equip(kind: WeaponKind | null): void {
    this.current = kind;
    this.player.equip(kind);
  }

  fixedUpdate(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.gunfireCrimeCooldown = Math.max(0, this.gunfireCrimeCooldown - dt);

    this.updateRockets(dt);
    this.updateWrecks(dt);

    if (!this.current || this.isDriving()) return;

    const spec = GameConfig.weapons[this.current];
    const wantsFire = spec.auto ? this.input.isFireDown() : this.input.wasFirePressed();
    if (!wantsFire || this.cooldown > 0) return;

    this.cooldown = spec.fireInterval;
    this.fire(this.current);
  }

  /** Aim ray: from the player's chest along the camera's look direction. */
  private computeAim(): void {
    const yaw = this.camera.yaw;
    const pitch = this.camera.pitch;
    this.aimDir
      .set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
      .normalize();
    this.origin.copy(this.player.position).add(this.tmp.set(0, 1.3, 0));
  }

  private fire(kind: WeaponKind): void {
    this.computeAim();
    this.player.getMuzzleWorld(this.muzzle);

    // Muzzle flash + panic + gunfire noise for everyone.
    this.particles.muzzleFlash(this.muzzle, this.aimDir);
    this.crowd.panicAt(this.player.position);
    this.bus.emit('gun:fired', {
      position: [this.origin.x, this.origin.y, this.origin.z],
    });
    if (this.gunfireCrimeCooldown <= 0) {
      this.gunfireCrimeCooldown = 1.5;
      this.bus.emit('crime:committed', { kind: 'gunfire' });
    }

    if (kind === 'bazooka') {
      this.launchRocket();
      return;
    }

    // Hitscan with spread.
    const spec = GameConfig.weapons[kind];
    this.aimDir.x += (Math.random() - 0.5) * 2 * spec.spread;
    this.aimDir.y += (Math.random() - 0.5) * 2 * spec.spread;
    this.aimDir.z += (Math.random() - 0.5) * 2 * spec.spread;
    this.aimDir.normalize();

    const hit = this.raycast(this.origin, this.aimDir, GameConfig.weapons.range);
    if (!hit) return;

    this.particles.impact(hit.point);
    if (hit.kind === 'ped') {
      const killed = this.crowd.killNearest(hit.point, 1.2);
      if (killed) this.bus.emit('crime:committed', { kind: 'pedKilled' });
    } else if (hit.kind === 'vehicle' && hit.vehicle) {
      this.damageVehicle(hit.vehicle, spec.damage);
    }
  }

  private launchRocket(): void {
    const mesh = new THREE.Mesh(this.rocketGeo, this.rocketMat);
    mesh.position.copy(this.muzzle).addScaledVector(this.aimDir, 0.8);
    this.scene.add(mesh);
    this.rockets.push({
      mesh,
      dir: this.aimDir.clone(),
      life: GameConfig.weapons.rocket.lifetime,
    });
  }

  private updateRockets(dt: number): void {
    const cfg = GameConfig.weapons.rocket;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i]!;
      r.life -= dt;
      r.mesh.position.addScaledVector(r.dir, cfg.speed * dt);
      // Exhaust trail.
      if (Math.random() < 0.6) this.particles.smokePuff(r.mesh.position);

      const p = r.mesh.position;
      let detonate = r.life <= 0 || p.y <= 0.05;

      if (!detonate) {
        for (const box of this.world.buildingBoxes) {
          if (box.containsPoint(p)) {
            detonate = true;
            break;
          }
        }
      }
      if (!detonate) {
        for (const v of this.vehicles) {
          if (!v.destroyed && v.position.distanceToSquared(p) < 2.2 * 2.2) {
            detonate = true;
            break;
          }
        }
      }

      if (detonate) {
        this.explode(p);
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
      }
    }
  }

  /** Area damage: destroy/damage vehicles, kill peds, big fireball. */
  private explode(pos: THREE.Vector3): void {
    const { blastRadius } = GameConfig.weapons.rocket;
    this.particles.explosion(pos);
    this.crowd.panicAt(pos);

    const killed = this.crowd.killInRadius(pos, blastRadius);
    for (let i = 0; i < killed; i++) this.bus.emit('crime:committed', { kind: 'pedKilled' });

    const r2 = blastRadius * blastRadius;
    for (const v of this.vehicles) {
      if (v.destroyed) continue;
      if (v.position.distanceToSquared(pos) < r2) {
        this.damageVehicle(v, GameConfig.weapons.bazooka.damage);
      }
    }
  }

  private damageVehicle(v: Vehicle, amount: number): void {
    const destroyed = v.applyDamage(amount);
    if (!destroyed) return;
    this.particles.explosion(this.tmp.copy(v.position).add(new THREE.Vector3(0, 0.8, 0)));
    this.crowd.panicAt(v.position);
    this.wrecks.push({ vehicle: v, timer: 10, puffAccum: 0 });
    this.bus.emit('vehicle:destroyed', {
      position: [v.position.x, v.position.y, v.position.z],
    });
    this.bus.emit('crime:committed', { kind: 'vehicleDestroyed' });
  }

  /** Fresh wrecks smoke for a while. */
  private updateWrecks(dt: number): void {
    for (let i = this.wrecks.length - 1; i >= 0; i--) {
      const w = this.wrecks[i]!;
      w.timer -= dt;
      w.puffAccum += dt;
      if (w.puffAccum >= 0.3) {
        w.puffAccum = 0;
        this.particles.smokePuff(
          this.tmp.copy(w.vehicle.position).add(new THREE.Vector3(0, 0.9, 0)),
        );
      }
      if (w.timer <= 0) this.wrecks.splice(i, 1);
    }
  }

  /** Nearest hit along the ray among peds, vehicles, buildings and the ground. */
  private raycast(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    range: number,
  ): { point: THREE.Vector3; kind: 'ped' | 'vehicle' | 'building' | 'ground'; vehicle?: Vehicle } | null {
    this.ray.set(origin, dir);
    let bestT = range;
    let bestKind: 'ped' | 'vehicle' | 'building' | 'ground' | null = null;
    let bestVehicle: Vehicle | undefined;

    // Ground plane (y = 0).
    if (dir.y < -1e-4) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestT) {
        bestT = t;
        bestKind = 'ground';
      }
    }

    // Buildings (AABBs).
    for (const box of this.world.buildingBoxes) {
      const p = this.ray.intersectBox(box, this.tmp);
      if (p) {
        const t = p.distanceTo(origin);
        if (t < bestT) {
          bestT = t;
          bestKind = 'building';
        }
      }
    }

    // Vehicles (spheres around the body).
    for (const v of this.vehicles) {
      const t = this.raySphere(origin, dir, v.position.x, v.position.y + 0.7, v.position.z, 1.6);
      if (t !== null && t < bestT) {
        bestT = t;
        bestKind = 'vehicle';
        bestVehicle = v;
      }
    }

    // Pedestrians (spheres at chest height).
    for (const ped of this.crowd.pedestrians) {
      if (ped.dead) continue;
      const t = this.raySphere(origin, dir, ped.position.x, ped.position.y + 0.9, ped.position.z, 0.55);
      if (t !== null && t < bestT) {
        bestT = t;
        bestKind = 'ped';
        bestVehicle = undefined;
      }
    }

    if (!bestKind) return null;
    this.hitPoint.copy(origin).addScaledVector(dir, bestT);
    const result: { point: THREE.Vector3; kind: typeof bestKind; vehicle?: Vehicle } = {
      point: this.hitPoint,
      kind: bestKind,
    };
    if (bestVehicle) result.vehicle = bestVehicle;
    return result;
  }

  /** Ray/sphere intersection returning the nearest positive t, or null. */
  private raySphere(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
  ): number | null {
    const ox = origin.x - cx;
    const oy = origin.y - cy;
    const oz = origin.z - cz;
    const b = ox * dir.x + oy * dir.y + oz * dir.z;
    const c = ox * ox + oy * oy + oz * oz - radius * radius;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 ? t : null;
  }

  dispose(): void {
    for (const r of this.rockets) this.scene.remove(r.mesh);
    this.rockets.length = 0;
    this.rocketGeo.dispose();
    this.rocketMat.dispose();
  }
}
