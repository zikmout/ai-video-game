import * as THREE from 'three';
import type { System } from '@/core/System';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { Vehicle } from '@/entities/Vehicle';
import { MissionMarker } from '@/entities/MissionMarker';
import { GameConfig } from '@/config/gameConfig';

/** Phases of the Rico mission, in order of progression. */
export type MissionPhase =
  | 'idle' // waiting for Rico to call
  | 'calling' // phone dialog on screen
  | 'goto' // reach the marker near the bank
  | 'steal' // get into the turquoise Miura
  | 'evade' // shake the 2-star pursuit
  | 'deliver' // bring the car to the parking spot
  | 'done';

const MARKER_YELLOW = 0xffd24a;
const MARKER_GREEN = 0x35d065;

/**
 * The first story mission ("Rico"), as a small state machine.
 *
 * Rico calls a few seconds into the game and asks the player to steal a
 * turquoise Miura parked downtown and deliver it to a parking spot — stealing
 * it triggers a 2-star pursuit that must be shaken before delivery. Progress,
 * dialogue and rewards all flow over the event bus (`mission:*`), so the HUD
 * and money stay out of this system.
 *
 * The mission car is a regular `Vehicle` pushed into the shared list: traffic
 * avoids it, police chase it, and the normal enter/drive path works — stealing
 * is detected simply by "the driven car is the mission car". If the Miura is
 * destroyed mid-mission, the mission fails and Rico calls back later.
 */
export class MissionSystem implements System {
  readonly name = 'MissionSystem';

  private phaseState: MissionPhase = 'idle';
  private timer = 0;
  private started = false;
  private wantedLevel = 0;
  private missionCar: Vehicle | null = null;
  private readonly marker: MissionMarker;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly vehicles: Vehicle[],
    private readonly getPlayerPosition: () => THREE.Vector3,
    private readonly getDrivenVehicle: () => Vehicle | null,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.marker = new MissionMarker(GameConfig.mission.rico.checkpointRadius, MARKER_YELLOW);
    scene.add(this.marker.object);

    this.unsubscribers.push(
      bus.on('game:started', () => {
        this.started = true;
      }),
      bus.on('wanted:changed', ({ level }) => {
        this.wantedLevel = level;
      }),
    );
  }

  /** Current phase — read by dev probes and the HUD routing in Game. */
  get phase(): MissionPhase {
    return this.phaseState;
  }

  /** World position the HUD/minimap should point at, or null when none. */
  get targetPosition(): THREE.Vector3 | null {
    return this.marker.visible ? this.marker.position : null;
  }

  /** The mission car once spawned (dev probes / minimap tinting). */
  get car(): Vehicle | null {
    return this.missionCar;
  }

  /**
   * Dev/demo: skip the wait so Rico calls on the next update; with `skipCall`
   * the phone dialog is skipped too and the checkpoint goes straight up.
   */
  startNow(skipCall = false): void {
    if (this.phaseState !== 'idle') return;
    this.started = true;
    this.timer = GameConfig.mission.rico.callDelay;
    if (skipCall) {
      this.beginCall();
      this.beginGoto();
    }
  }

  fixedUpdate(dt: number): void {
    if (!this.started) return;
    const cfg = GameConfig.mission.rico;
    this.timer += dt;

    // A destroyed Miura fails the mission in any active phase.
    if (
      this.missionCar?.destroyed &&
      this.phaseState !== 'idle' &&
      this.phaseState !== 'done'
    ) {
      this.fail('La Miura est détruite');
      return;
    }

    switch (this.phaseState) {
      case 'idle':
        if (this.timer >= cfg.callDelay) this.beginCall();
        break;
      case 'calling':
        // Stealing early (player already near the car) skips ahead.
        if (this.checkStolen()) break;
        if (this.timer >= cfg.callDuration) this.beginGoto();
        break;
      case 'goto': {
        if (this.checkStolen()) break;
        const d = this.getPlayerPosition().distanceTo(this.marker.position);
        if (d <= cfg.checkpointRadius + 1) this.beginSteal();
        break;
      }
      case 'steal':
        this.checkStolen();
        break;
      case 'evade':
        if (this.wantedLevel === 0) this.beginDeliver();
        break;
      case 'deliver': {
        const car = this.missionCar;
        if (!car) break;
        const d2 = car.position.distanceTo(this.marker.position);
        if (d2 <= cfg.deliverRadius && Math.abs(car.speed) < 2) this.complete();
        break;
      }
      case 'done':
        break;
    }
  }

  update(dt: number): void {
    this.marker.update(dt);
  }

  private beginCall(): void {
    this.phaseState = 'calling';
    this.timer = 0;
    this.spawnMissionCar();
    this.bus.emit('mission:call', {
      caller: 'Rico',
      lines: [
        'Eh, l’ami ! Une Miura turquoise dort devant la banque du centre.',
        'Ramène-la au parking de la marina. Discrètement… ou pas.',
        'Il y a 1 500 $ pour toi. Ne la raye pas.',
      ],
    });
  }

  private beginGoto(): void {
    this.phaseState = 'goto';
    const { pickup } = GameConfig.mission.rico;
    this.marker.setColor(MARKER_YELLOW);
    this.marker.moveTo(pickup.x, pickup.z);
    this.marker.visible = true;
    this.bus.emit('mission:objective', { text: 'Rejoignez la Miura devant la banque' });
  }

  private beginSteal(): void {
    this.phaseState = 'steal';
    this.marker.visible = false;
    this.bus.emit('mission:objective', { text: 'Volez la Miura turquoise' });
  }

  /** True (and advances to evade) when the player is driving the Miura. */
  private checkStolen(): boolean {
    if (!this.missionCar || this.getDrivenVehicle() !== this.missionCar) return false;
    this.phaseState = 'evade';
    this.marker.visible = false;
    this.bus.emit('crime:committed', { kind: 'carStolen' });
    this.bus.emit('mission:objective', { text: 'Semez la police !' });
    return true;
  }

  private beginDeliver(): void {
    this.phaseState = 'deliver';
    const { delivery } = GameConfig.mission.rico;
    this.marker.setColor(MARKER_GREEN);
    this.marker.moveTo(delivery.x, delivery.z);
    this.marker.visible = true;
    this.bus.emit('mission:objective', { text: 'Livrez la Miura au parking de la marina' });
  }

  private complete(): void {
    this.phaseState = 'done';
    this.marker.visible = false;
    this.bus.emit('mission:objective', { text: null });
    this.bus.emit('mission:completed', { id: 'rico', reward: GameConfig.mission.rico.reward });
  }

  private fail(reason: string): void {
    this.phaseState = 'idle';
    // Rico calls back after a cooldown: rewind the timer below the call delay.
    this.timer = GameConfig.mission.rico.callDelay - GameConfig.mission.rico.retryDelay;
    this.marker.visible = false;
    this.removeMissionCar();
    this.bus.emit('mission:objective', { text: null });
    this.bus.emit('mission:failed', { id: 'rico', reason });
  }

  /** Park the turquoise Miura at the pickup point (idempotent per attempt). */
  private spawnMissionCar(): void {
    const cfg = GameConfig.mission.rico;
    const car = new Vehicle(cfg.carColor);
    car.placeAt(cfg.pickup.x, cfg.pickup.z, cfg.pickup.heading);
    this.vehicles.push(car);
    this.scene.add(car.object);
    this.missionCar = car;
  }

  private removeMissionCar(): void {
    const car = this.missionCar;
    if (!car) return;
    const i = this.vehicles.indexOf(car);
    if (i >= 0) this.vehicles.splice(i, 1);
    this.scene.remove(car.object);
    car.dispose();
    this.missionCar = null;
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.scene.remove(this.marker.object);
    this.marker.dispose();
    this.removeMissionCar();
  }
}
