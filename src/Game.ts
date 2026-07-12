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
import { PlayerController } from '@/systems/PlayerController';

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
  private readonly systems: System[] = [];
  private readonly hud: HUD;
  private readonly loop: GameLoop;

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

    this.systems.push(
      new PlayerController(this.player, this.input, this.cameraController, this.world),
    );

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

    // Dev/demo convenience: `?play` auto-starts, skipping the menu click.
    if (new URLSearchParams(window.location.search).has('play')) {
      this.play();
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
    for (const s of this.systems) s.fixedUpdate?.(dt);
  }

  private update(dt: number): void {
    if (this.state === 'playing') {
      for (const s of this.systems) s.update?.(dt);
    }

    // Camera follows the player even in menu/pause for a nice backdrop.
    this.player.getFocus(this.focus);
    this.cameraController.update(this.focus, dt);
    this.world.update(this.engine.camera.position, this.focus);

    // Sync the player mesh Y with any interpolation-free position.
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
