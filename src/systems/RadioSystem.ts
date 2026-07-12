import type { System } from '@/core/System';
import type { Input } from '@/engine/Input';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { GameConfig } from '@/config/gameConfig';
import { STATIONS, StationPlayer } from '@/assets/procedural/music';

/**
 * In-car radio. Pressing R while driving cycles: off → station 1 → 2 → 3 → off.
 * The selected station keeps playing across cars (it pauses when on foot and
 * resumes on the next ride), mirroring how GTA radios follow the player.
 *
 * Audio starts lazily on the first R press — a user gesture, which is exactly
 * when browsers allow an AudioContext to start. Environments without working
 * audio (headless probes) degrade gracefully: station selection still cycles,
 * only playback is skipped.
 */
export class RadioSystem implements System {
  readonly name = 'RadioSystem';

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private player: StationPlayer | null = null;
  /** Index into STATIONS, or -1 for "off". */
  private stationIndex = -1;
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly input: Input,
    private readonly isDriving: () => boolean,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.unsubscribers.push(
      bus.on('vehicle:entered', () => this.applyPlayback()),
      bus.on('vehicle:exited', () => this.applyPlayback()),
    );
  }

  /** Current station name, or null when the radio is off. */
  get stationName(): string | null {
    return this.stationIndex >= 0 ? STATIONS[this.stationIndex]!.name : null;
  }

  /** True while a station is actually being synthesized. */
  get isPlaying(): boolean {
    return this.player !== null;
  }

  update(_dt: number): void {
    if (this.input.wasPressed('radio') && this.isDriving()) this.cycle();
    // Keep the schedule ahead of the audio clock.
    this.player?.tick(GameConfig.radio.lookahead);
  }

  /** Advance off → 1 → 2 → 3 → off and announce the change. */
  private cycle(): void {
    this.stationIndex = this.stationIndex >= STATIONS.length - 1 ? -1 : this.stationIndex + 1;
    this.applyPlayback();
    this.bus.emit('radio:changed', { station: this.stationName });
  }

  /** Start/stop the synth to match (station selected) && (driving). */
  private applyPlayback(): void {
    const shouldPlay = this.stationIndex >= 0 && this.isDriving();
    if (!shouldPlay) {
      this.stopPlayer();
      return;
    }
    if (!this.ensureAudio()) return;
    // Recreate the player so switching stations restarts the loop cleanly.
    this.stopPlayer();
    this.player = new StationPlayer(this.ctx!, this.master!, STATIONS[this.stationIndex]!);
  }

  /** Lazily create the AudioContext; false if audio is unavailable. */
  private ensureAudio(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      return true;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = GameConfig.radio.volume;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      this.ctx = null;
      this.master = null;
      return false;
    }
  }

  private stopPlayer(): void {
    // Dropping the player stops new notes; in-flight ones decay in <0.3 s.
    this.player = null;
  }

  dispose(): void {
    this.unsubscribers.forEach((u) => u());
    this.stopPlayer();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}
