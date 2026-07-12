import * as THREE from 'three';
import type { System } from '@/core/System';
import { Vehicle } from '@/entities/Vehicle';
import type { World } from '@/world/World';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { makeLightbar } from '@/assets/procedural/car';
import { GameConfig } from '@/config/gameConfig';
import { Random } from '@/core/Random';
import { resolveVehicleAgainstBuildings } from './vehicleCollision';

interface Cop {
  vehicle: Vehicle;
  red: THREE.MeshStandardMaterial;
  blue: THREE.MeshStandardMaterial;
}

/**
 * Police response to the wanted level.
 *
 * When stars appear, patrol cars spawn out of sight and converge on the player;
 * more stars, more cars. Pursuit steering is deliberately simple — turn toward
 * the target, full speed, collide with buildings like every other car — which
 * produces the classic swarming/boxing-in behaviour. Cars flash their light
 * bars, get replaced if the player blows them up while still wanted, teleport
 * closer if they fall too far behind, and leave when the heat dies down.
 *
 * Police cars join the shared `vehicles` list, so weapons, traffic avoidance
 * and the mini-map treat them like any other car.
 */
export class PoliceSystem implements System {
  readonly name = 'PoliceSystem';

  private readonly cops: Cop[] = [];
  private stars = 0;
  private flashTimer = 0;
  private respawnCooldown = 0;
  private readonly rng: Random;
  private readonly tmp = new THREE.Vector3();
  private readonly unsubscribe: () => void;

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
    private readonly vehicles: Vehicle[],
    private readonly target: () => THREE.Vector3,
    bus: EventBus<GameEvents>,
  ) {
    this.rng = new Random(GameConfig.seed ^ 0xc09);
    this.unsubscribe = bus.on('wanted:changed', ({ level }) => {
      this.stars = level;
    });
  }

  fixedUpdate(dt: number): void {
    const cfg = GameConfig.police;
    const targetPos = this.target();
    this.respawnCooldown = Math.max(0, this.respawnCooldown - dt);

    // Match the fleet size to the wanted level (wrecked cops don't count).
    const wanted = Math.min(cfg.maxCars, this.stars * cfg.carsPerStar);
    const active = this.cops.filter((c) => !c.vehicle.destroyed).length;
    if (active < wanted && this.respawnCooldown <= 0) {
      this.spawnCop(targetPos);
      this.respawnCooldown = 1.2;
    } else if (wanted === 0 && this.cops.length > 0) {
      this.despawnAll();
    }

    // Pursue.
    for (const cop of this.cops) {
      const v = cop.vehicle;
      if (v.destroyed) continue;

      // Teleport back into range if the chase left them far behind.
      if (v.position.distanceTo(targetPos) > cfg.leashRange) {
        this.placeNear(v, targetPos);
      }

      // Steer the heading toward the player. Forward is (-sin h, -cos h).
      const dx = targetPos.x - v.position.x;
      const dz = targetPos.z - v.position.z;
      const desired = Math.atan2(-dx, -dz);
      let delta = desired - v.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      const turnRate = 2.2; // rad/s
      v.heading += Math.sign(delta) * Math.min(Math.abs(delta), turnRate * dt);

      // Speed control like a real driver: brake for sharp turns (otherwise the
      // turning radius exceeds the approach distance and the car orbits its
      // target forever), and ease off when close to box in rather than ram past.
      const dist = Math.hypot(dx, dz);
      const misalignment = Math.abs(delta); // 0 = dead ahead, PI = behind us
      const turnFactor = Math.max(0.3, 1 - (misalignment / Math.PI) * 1.4);
      const closeFactor = dist < 14 ? Math.max(0.35, dist / 14) : 1;
      const targetSpeed = cfg.speed * Math.min(turnFactor, closeFactor);
      v.speed += Math.sign(targetSpeed - v.speed) * Math.min(14 * dt, Math.abs(targetSpeed - v.speed));

      v.integrate(dt);
      if (resolveVehicleAgainstBuildings(v, this.world.buildingBoxes)) {
        v.speed *= 0.5;
      }
    }
  }

  update(dt: number): void {
    // Flash the light bars: alternate red/blue emissive every ~0.25 s.
    this.flashTimer += dt;
    const phase = Math.floor(this.flashTimer / 0.25) % 2 === 0;
    for (const cop of this.cops) {
      if (cop.vehicle.destroyed) continue;
      cop.red.emissiveIntensity = phase ? 2.4 : 0.15;
      cop.blue.emissiveIntensity = phase ? 0.15 : 2.4;
    }
  }

  private spawnCop(targetPos: THREE.Vector3): void {
    const vehicle = new Vehicle(0xf2f2f2);
    const { group, red, blue } = makeLightbar();
    group.position.set(0, 1.36, -0.1);
    vehicle.object.add(group);

    this.placeNear(vehicle, targetPos);
    this.vehicles.push(vehicle);
    this.scene.add(vehicle.object);
    this.cops.push({ vehicle, red, blue });
  }

  /** Drop a car on the map ~45–65 m away from the target, inside bounds. */
  private placeNear(v: Vehicle, targetPos: THREE.Vector3): void {
    const angle = this.rng.range(0, Math.PI * 2);
    const dist = this.rng.range(45, 65);
    const half = this.world.city.bounds.half;
    const x = Math.max(-half, Math.min(half, targetPos.x + Math.cos(angle) * dist));
    const z = Math.max(-half, Math.min(half, targetPos.z + Math.sin(angle) * dist));
    this.tmp.set(targetPos.x - x, 0, targetPos.z - z);
    const heading = Math.atan2(-this.tmp.x, -this.tmp.z);
    v.placeAt(x, z, heading);
    v.speed = GameConfig.police.speed * 0.5;
  }

  private despawnAll(): void {
    for (const cop of this.cops) {
      // Wrecks stay in the world as scenery; only live cars drive off the map.
      if (!cop.vehicle.destroyed) {
        this.scene.remove(cop.vehicle.object);
        const idx = this.vehicles.indexOf(cop.vehicle);
        if (idx >= 0) this.vehicles.splice(idx, 1);
        cop.vehicle.dispose();
      }
    }
    this.cops.length = 0;
  }

  dispose(): void {
    this.unsubscribe();
    this.despawnAll();
  }
}
