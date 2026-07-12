import { Random } from '@/core/Random';

/**
 * Procedural radio music — placeholder "stations" synthesized with Web Audio,
 * standing in for AI-generated tracks later (see docs/AI_ASSETS.md).
 *
 * Each station is a 16-step loop (kick, hi-hat, bass, lead) generated
 * deterministically from a seed, so a station always plays "its" track. The
 * player schedules a short window ahead of the audio clock each tick, which is
 * the standard Web Audio pattern for glitch-free sequencing.
 */
export interface StationSpec {
  name: string;
  bpm: number;
  /** Root frequency of the bass line (Hz). */
  root: number;
  /** Scale intervals in semitones used for bass/lead notes. */
  scale: number[];
  lead: OscillatorType;
  bass: OscillatorType;
  /** Steps (0-15) on which the kick hits. */
  kickSteps: number[];
  /** Steps on which the hi-hat ticks. */
  hatSteps: number[];
  /** Seed for the generated bass/lead note patterns. */
  seed: number;
}

export const STATIONS: StationSpec[] = [
  {
    name: 'Asetinos FM',
    bpm: 104,
    root: 87.31, // F2
    scale: [0, 3, 5, 7, 10, 12], // minor pentatonic-ish, synthwave mood
    lead: 'sawtooth',
    bass: 'sawtooth',
    kickSteps: [0, 4, 8, 12],
    hatSteps: [2, 6, 10, 14],
    seed: 101,
  },
  {
    name: 'Radio Playa',
    bpm: 82,
    root: 98.0, // G2
    scale: [0, 4, 5, 7, 9, 12], // major, laid-back beach skank
    lead: 'triangle',
    bass: 'triangle',
    kickSteps: [0, 8],
    hatSteps: [4, 12], // offbeat
    seed: 202,
  },
  {
    name: 'K-BOOM',
    bpm: 138,
    root: 82.41, // E2
    scale: [0, 3, 5, 6, 7, 10], // blues scale, aggressive
    lead: 'square',
    bass: 'sawtooth',
    kickSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    hatSteps: [1, 3, 5, 7, 9, 11, 13, 15],
    seed: 303,
  },
];

const STEPS = 16;

/** Plays one station's generated loop into a destination node. */
export class StationPlayer {
  private step = 0;
  private nextStepTime: number;
  private readonly stepDuration: number;
  private readonly bassNotes: number[];
  private readonly leadNotes: Array<number | null>;
  private readonly noiseBuffer: AudioBuffer;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly spec: StationSpec,
  ) {
    this.stepDuration = 60 / spec.bpm / 4; // 16ths
    this.nextStepTime = ctx.currentTime + 0.05;

    // Deterministic note patterns per station.
    const rng = new Random(spec.seed);
    this.bassNotes = Array.from({ length: STEPS }, (_, i) =>
      i % 4 === 0 ? 0 : spec.scale[rng.int(0, spec.scale.length - 1)]!,
    );
    this.leadNotes = Array.from({ length: STEPS }, () =>
      rng.bool(0.55) ? spec.scale[rng.int(0, spec.scale.length - 1)]! : null,
    );

    // Short white-noise buffer shared by hats.
    const len = Math.floor(ctx.sampleRate * 0.06);
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = rng.range(-1, 1);
  }

  /** Schedule any steps falling inside [now, now + lookahead). */
  tick(lookahead: number): void {
    while (this.nextStepTime < this.ctx.currentTime + lookahead) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % STEPS;
      this.nextStepTime += this.stepDuration;
    }
  }

  private scheduleStep(step: number, t: number): void {
    const spec = this.spec;
    if (spec.kickSteps.includes(step)) this.kick(t);
    if (spec.hatSteps.includes(step)) this.hat(t);

    // Bass on every even 16th, lead sparkles per its pattern.
    if (step % 2 === 0) this.pluck(spec.bass, spec.root, this.bassNotes[step]!, t, 0.22, 0.5);
    const leadNote = this.leadNotes[step] ?? null;
    if (leadNote !== null) this.pluck(spec.lead, spec.root * 4, leadNote, t, 0.14, 0.18);
  }

  private kick(t: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  private hat(t: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t);
  }

  /** A plucked note: `semitones` above `base`, short exponential decay. */
  private pluck(
    type: OscillatorType,
    base: number,
    semitones: number,
    t: number,
    duration: number,
    level: number,
  ): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    osc.type = type;
    osc.frequency.value = base * Math.pow(2, semitones / 12);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(filter).connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }
}
