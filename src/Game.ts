import * as THREE from 'three';
import { GameLoop } from '@/core/GameLoop';
import { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import type { System } from '@/core/System';
import { GameConfig } from '@/config/gameConfig';

import { Engine } from '@/engine/Engine';
import { Input } from '@/engine/Input';
import { CameraController } from '@/engine/CameraController';

import { World } from '@/world/World';
import { Player } from '@/entities/Player';
import { Vehicle } from '@/entities/Vehicle';
import { PlayerController } from '@/systems/PlayerController';
import { VehicleController } from '@/systems/VehicleController';
import { TrafficSystem } from '@/systems/TrafficSystem';
import { CrowdSystem } from '@/systems/CrowdSystem';
import { DayNightCycle } from '@/systems/DayNightCycle';
import { ParticleSystem } from '@/systems/ParticleSystem';
import { WeaponSystem } from '@/systems/WeaponSystem';
import { WantedSystem } from '@/systems/WantedSystem';
import { PoliceSystem } from '@/systems/PoliceSystem';
import { MissionSystem } from '@/systems/MissionSystem';
import { RadioSystem } from '@/systems/RadioSystem';

import { HUD } from '@/ui/HUD';
import { MiniMap } from '@/ui/MiniMap';

type GameState = 'menu' | 'playing' | 'paused';

/**
 * Game is the composition root: it builds the engine, world, player, systems and
 * HUD, wires them together, and drives them from a fixed-timestep loop.
 *
 * It owns the high-level state machine (menu → playing → paused) and translates
 * player intent (Play, Esc) into loop and input actions. Feature work generally
 * means adding a System here, not changing the loop.
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();

  private readonly engine: Engine;
  private readonly input: Input;
  private readonly cameraController: CameraController;
  private readonly world: World;
  private readonly player: Player;
  private readonly vehicles: Vehicle[] = [];
  private readonly vehicleController: VehicleController;
  private readonly playerController: PlayerController;
  private readonly systems: System[] = [];
  private readonly hud: HUD;
  private readonly miniMap: MiniMap;
  private readonly dayNight: DayNightCycle;
  private readonly weapons: WeaponSystem;
  /** Public for dev probes: mission phase and radio station are inspectable. */
  readonly mission: MissionSystem;
  readonly radio: RadioSystem;
  private readonly loop: GameLoop;
  private readonly driveFocus = new THREE.Vector3();
  private wasDriving = false;
  private money = 2500;
  private hudAccum = 0;
  private lastWeaponName: string | null = null;

  private state: GameState = 'menu';
  private readonly focus = new THREE.Vector3();

  // FPS smoothing.
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor(root: HTMLElement) {
    this.engine = new Engine(root);
    this.input = new Input(this.engine.canvas);
    this.input.attach();

    this.cameraController = new CameraController(this.engine.camera);

    this.world = new World(this.engine.scene);

    this.player = new Player();
    this.player.position.set(...GameConfig.player.spawn);
    this.engine.scene.add(this.player.object);

    // A few parked cars the player can walk up to and drive.
    this.spawnParkedCars();

    // Traffic spawns its own AI cars and appends them to `vehicles`.
    const traffic = new TrafficSystem(this.world, this.vehicles, this.engine.scene);

    this.vehicleController = new VehicleController(
      this.player,
      this.input,
      this.cameraController,
      this.world,
      this.vehicles,
      this.bus,
    );

    this.playerController = new PlayerController(
      this.player,
      this.input,
      this.cameraController,
      this.world,
    );

    const crowd = new CrowdSystem(
      this.world,
      this.engine.scene,
      this.vehicles,
      () => this.player.position,
    );

    this.dayNight = new DayNightCycle(this.world);

    const particles = new ParticleSystem(this.engine.scene);

    this.weapons = new WeaponSystem(
      this.player,
      this.input,
      this.cameraController,
      this.world,
      this.vehicles,
      crowd,
      particles,
      this.engine.scene,
      this.bus,
      () => this.vehicleController.isDriving,
    );

    const wanted = new WantedSystem(this.bus);
    const police = new PoliceSystem(
      this.world,
      this.engine.scene,
      this.vehicles,
      () => this.currentFocusPosition(),
      this.bus,
    );

    this.mission = new MissionSystem(
      this.engine.scene,
      this.vehicles,
      () => this.currentFocusPosition(),
      () => this.vehicleController.vehicle,
      this.bus,
    );

    this.radio = new RadioSystem(this.input, () => this.vehicleController.isDriving, this.bus);

    // Order matters: vehicle enter/exit before on-foot movement; weapons before
    // the world reacts; traffic/crowd/police simulate; ambience last.
    this.systems.push(
      this.vehicleController,
      this.playerController,
      this.weapons,
      traffic,
      crowd,
      police,
      wanted,
      this.mission,
      this.radio,
      particles,
      this.dayNight,
    );

    this.hud = new HUD(root, { onPlay: () => this.play() });
    this.miniMap = new MiniMap(this.hud.getMinimapRoot(), this.world);
    this.hud.setMoney(this.money);
    this.bus.on('wanted:changed', ({ level }) => this.hud.setStars(level));

    // Mission + radio flow: systems talk on the bus, Game routes to the HUD.
    this.bus.on('mission:call', ({ caller, lines }) => this.hud.showPhoneCall(caller, lines));
    this.bus.on('mission:objective', ({ text }) => {
      this.hud.hidePhoneCall();
      this.hud.setObjective(text);
      if (!text) this.hud.setObjectiveDistance(null);
    });
    this.bus.on('mission:completed', ({ reward }) => {
      this.money += reward;
      this.hud.setMoney(this.money);
      this.bus.emit('money:changed', { amount: this.money, delta: reward });
      this.hud.showBanner(`Mission accomplie — +$${reward.toLocaleString('en-US')}`, 'success');
    });
    this.bus.on('mission:failed', ({ reason }) => {
      this.hud.showBanner(`Mission échouée — ${reason}`, 'fail');
    });
    this.bus.on('radio:changed', ({ station }) => this.hud.setRadio(station));

    this.loop = new GameLoop(
      {
        fixedUpdate: (dt) => this.fixedUpdate(dt),
        update: (dt) => this.update(dt),
        render: (alpha) => this.render(alpha),
      },
      GameConfig.simulation.hz,
    );

    // Esc pauses; clicking the canvas while playing (re)captures the mouse.
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.state === 'playing') this.pause();
    });
    this.engine.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) {
        this.input.requestPointerLock();
      }
    });

    // Render one frame behind the menu so the world is visible immediately.
    this.loop.start();
    this.bus.emit('player:spawned', { position: GameConfig.player.spawn });

    // Dev/demo convenience via query params.
    const params = new URLSearchParams(window.location.search);
    if (params.has('play') || params.has('drive') || params.has('mission')) {
      this.play();
    }
    // `?mission` makes Rico call immediately; `?mission=go` also skips the call
    // so the checkpoint marker is up right away (screenshots/probes).
    if (params.has('mission')) {
      this.mission.startNow(params.get('mission') === 'go');
    }
    // `?tp=x,z` teleports the player (framing screenshots at exact spots).
    const tp = params.get('tp');
    if (tp) {
      const [x, z] = tp.split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(z)) this.player.position.set(x!, 0, z!);
    }
    if (params.has('drive')) {
      // Teleport the player onto the nearest parked car and enter it, so the
      // driving view is reachable for demos/screenshots without input.
      const car = this.vehicles[0];
      if (car) {
        this.player.position.set(car.position.x + 0.4, 0, car.position.z + 0.4);
        this.vehicleController.enterNearest();
      }
    }
    // `?hour=21` forces a time of day (demos/screenshots of the night cycle).
    const hourParam = params.get('hour');
    if (hourParam !== null) {
      const h = Number(hourParam);
      if (Number.isFinite(h)) this.dayNight.hour = ((h % 24) + 24) % 24;
    }
  }

  /**
   * Spawn a handful of parked, player-drivable cars near the spawn so the
   * vehicle loop is reachable immediately. Positions are along the road just off
   * the spawn point; they're added to the shared `vehicles` list so the same
   * enter/drive path works for them and for hijacked traffic.
   */
  private spawnParkedCars(): void {
    const [sx, , sz] = GameConfig.player.spawn;
    const layout: Array<[number, number, number]> = [
      [sx + 4, sz - 2, 0],
      [sx - 4, sz + 6, Math.PI],
      [sx + 3, sz - 14, 0],
    ];
    for (const [x, z, heading] of layout) {
      const car = new Vehicle();
      car.placeAt(x, z, heading);
      this.vehicles.push(car);
      this.engine.scene.add(car.object);
    }
  }

  private play(): void {
    const resuming = this.state === 'paused';
    this.hud.hideMenu();
    this.hud.showHUD();
    this.state = 'playing';
    this.input.requestPointerLock();
    this.bus.emit(resuming ? 'game:resumed' : 'game:started', undefined);
  }

  private pause(): void {
    this.state = 'paused';
    this.input.exitPointerLock();
    this.hud.showMenu(true);
    this.bus.emit('game:paused', undefined);
  }

  private fixedUpdate(dt: number): void {
    if (this.state !== 'playing') return;
    const driving = this.vehicleController.isDriving;
    for (const s of this.systems) {
      // Skip on-foot movement while the player is in a car.
      if (driving && s === this.playerController) continue;
      s.fixedUpdate?.(dt);
    }
  }

  private update(dt: number): void {
    const driving = this.vehicleController.isDriving;

    if (this.state === 'playing') {
      for (const s of this.systems) {
        if (driving && s === this.playerController) continue;
        s.update?.(dt);
      }
    }

    this.updateCameraAndHud(dt, driving);

    // Reset per-frame input at the very end.
    this.input.endFrame();

    // FPS meter.
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.hud.setFps(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  }

  /** Route the camera (chase vs orbit) and update contextual HUD. */
  private updateCameraAndHud(dt: number, driving: boolean): void {
    if (driving && this.vehicleController.vehicle) {
      const v = this.vehicleController.vehicle;
      this.vehicleController.getCameraFocus(this.driveFocus);
      const c = GameConfig.vehicle.driveCamera;
      this.cameraController.chase(this.driveFocus, v.heading, c.distance, c.height, c.lambda, dt);
      this.world.update(this.engine.camera.position, this.driveFocus);
      this.hud.setSpeed(v.speed);
      this.hud.setPrompt('E — Sortir');
    } else {
      this.player.getFocus(this.focus);
      this.cameraController.update(this.focus, dt);
      this.world.update(this.engine.camera.position, this.focus);
      this.hud.setPrompt(this.nearbyCarPrompt());
    }

    if (driving !== this.wasDriving) {
      this.hud.setDriving(driving);
      this.wasDriving = driving;
    }

    // Mini-map: centre on and rotate to whatever the player controls.
    const heading = driving && this.vehicleController.vehicle
      ? this.vehicleController.vehicle.heading
      : this.player.object.rotation.y;
    const center = driving && this.vehicleController.vehicle
      ? this.vehicleController.vehicle.position
      : this.player.position;
    this.miniMap.render(center, heading, this.vehicles, this.mission.targetPosition, this.mission.car);

    // Live distance readout next to the mission objective.
    const target = this.mission.targetPosition;
    this.hud.setObjectiveDistance(target ? target.distanceTo(center) : null);

    // Weapon label follows the equipped weapon (hidden while driving).
    const weaponName = driving ? null : this.weapons.weaponName;
    if (weaponName !== this.lastWeaponName) {
      this.hud.setWeapon(weaponName);
      this.lastWeaponName = weaponName;
    }

    // Throttle text HUD updates (clock) to a few times a second.
    this.hudAccum += dt;
    if (this.hudAccum >= 0.25) {
      this.hud.setClock(this.dayNight.getClockString());
      this.hudAccum = 0;
    }
  }

  /** "E — Monter" when the player stands near an enterable car, else empty. */
  private nearbyCarPrompt(): string {
    if (this.state !== 'playing') return '';
    const range = GameConfig.vehicle.enterRange;
    const rangeSq = range * range;
    for (const v of this.vehicles) {
      if (v.occupied || v.destroyed) continue;
      if (v.position.distanceToSquared(this.player.position) < rangeSq) return 'E — Monter';
    }
    return '';
  }

  /** Where the player effectively is: on foot, or inside the driven car. */
  private currentFocusPosition(): THREE.Vector3 {
    const v = this.vehicleController.vehicle;
    return v ? v.position : this.player.position;
  }

  private render(alpha: number): void {
    for (const s of this.systems) s.lateUpdate?.(alpha);
    this.engine.render();
  }

  dispose(): void {
    this.loop.stop();
    this.systems.forEach((s) => s.dispose?.());
    this.world.dispose();
    this.input.dispose();
    this.engine.dispose();
    this.bus.clear();
  }
}
