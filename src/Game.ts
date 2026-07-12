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

import { HUD } from '@/ui/HUD';

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
  private readonly loop: GameLoop;
  private readonly driveFocus = new THREE.Vector3();
  private wasDriving = false;

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

    // Order matters: vehicle enter/exit before on-foot movement; traffic last.
    this.systems.push(this.vehicleController, this.playerController, traffic);

    this.hud = new HUD(root, { onPlay: () => this.play() });

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
    if (params.has('play') || params.has('drive')) {
      this.play();
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
  }

  /** "E — Monter" when the player stands near an enterable car, else empty. */
  private nearbyCarPrompt(): string {
    if (this.state !== 'playing') return '';
    const range = GameConfig.vehicle.enterRange;
    const rangeSq = range * range;
    for (const v of this.vehicles) {
      if (v.occupied) continue;
      if (v.position.distanceToSquared(this.player.position) < rangeSq) return 'E — Monter';
    }
    return '';
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
