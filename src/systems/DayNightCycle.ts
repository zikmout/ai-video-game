import * as THREE from 'three';
import type { System } from '@/core/System';
import type { World } from '@/world/World';
import { GameConfig } from '@/config/gameConfig';
import { clamp, lerp } from '@/core/math';

/**
 * Day/night cycle.
 *
 * Advances an in-game clock, and each frame recomputes the sun direction and the
 * palette (sky gradient, fog, sun/ambient intensity and colour) for the current
 * hour. Streetlights fade on at dusk and off at dawn. Colours are interpolated
 * between four keyframes — night, dawn, day, dusk — so transitions are smooth.
 *
 * The clock is exposed as `hour` (0..24) for the HUD.
 */
interface SkyKey {
  sun: number; // sun/key light intensity
  ambient: number; // hemisphere intensity
  sunColor: THREE.Color;
  top: THREE.Color;
  horizon: THREE.Color;
  bottom: THREE.Color;
  fog: THREE.Color;
}

const c = (hex: number) => new THREE.Color(hex);

const NIGHT: SkyKey = {
  sun: 0.15,
  ambient: 0.35,
  sunColor: c(0x6a7ba8),
  top: c(0x070b18),
  horizon: c(0x1b2440),
  bottom: c(0x0a0e1a),
  fog: c(0x141b2e),
};
const DAWN: SkyKey = {
  sun: 1.8,
  ambient: 0.9,
  sunColor: c(0xffb27a),
  top: c(0x3a5a8c),
  horizon: c(0xffb98a),
  bottom: c(0x9aa0ac),
  fog: c(0xc9b0a0),
};
const DAY: SkyKey = {
  sun: 2.6,
  ambient: 1.1,
  sunColor: c(0xfff3d6),
  top: c(0x2b6fb0),
  horizon: c(0xbfe0f5),
  bottom: c(0xcfd6dc),
  fog: c(0xbfd4e6),
};
const DUSK: SkyKey = {
  sun: 1.6,
  ambient: 0.8,
  sunColor: c(0xff8a5c),
  top: c(0x27406e),
  horizon: c(0xff8f6a),
  bottom: c(0x6a6a78),
  fog: c(0xa88a86),
};

export class DayNightCycle implements System {
  readonly name = 'DayNightCycle';

  /** Current hour, 0..24. */
  hour: number;

  private readonly sunDir = new THREE.Vector3();
  private readonly key: SkyKey = {
    sun: DAY.sun,
    ambient: DAY.ambient,
    sunColor: DAY.sunColor.clone(),
    top: DAY.top.clone(),
    horizon: DAY.horizon.clone(),
    bottom: DAY.bottom.clone(),
    fog: DAY.fog.clone(),
  };

  constructor(private readonly world: World) {
    this.hour = GameConfig.dayNight.startHour;
    this.applyToWorld();
  }

  fixedUpdate(dt: number): void {
    const hoursPerSecond = 24 / GameConfig.dayNight.dayLengthSeconds;
    this.hour = (this.hour + dt * hoursPerSecond) % 24;
  }

  update(_dt: number): void {
    this.computeKey();
    this.applyToWorld();
  }

  /** Interpolate the palette between keyframes for the current hour. */
  private computeKey(): void {
    const h = this.hour;
    // Segments: [0..5] night, [5..8] dawn, [8..17] day, [17..20] dusk,
    //           [20..24] night.
    let a: SkyKey;
    let b: SkyKey;
    let t: number;
    if (h < 5) {
      a = NIGHT;
      b = NIGHT;
      t = 0;
    } else if (h < 8) {
      a = NIGHT;
      b = DAWN;
      t = (h - 5) / 3;
    } else if (h < 10) {
      a = DAWN;
      b = DAY;
      t = (h - 8) / 2;
    } else if (h < 17) {
      a = DAY;
      b = DAY;
      t = 0;
    } else if (h < 19) {
      a = DAY;
      b = DUSK;
      t = (h - 17) / 2;
    } else if (h < 21) {
      a = DUSK;
      b = NIGHT;
      t = (h - 19) / 2;
    } else {
      a = NIGHT;
      b = NIGHT;
      t = 0;
    }

    this.key.sun = lerp(a.sun, b.sun, t);
    this.key.ambient = lerp(a.ambient, b.ambient, t);
    this.key.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    this.key.top.copy(a.top).lerp(b.top, t);
    this.key.horizon.copy(a.horizon).lerp(b.horizon, t);
    this.key.bottom.copy(a.bottom).lerp(b.bottom, t);
    this.key.fog.copy(a.fog).lerp(b.fog, t);
  }

  private applyToWorld(): void {
    const env = this.world.environment;

    // Sun travels an arc: angle from hour (noon = overhead).
    // Map hour 6→sunrise(east), 12→noon(up), 18→sunset(west).
    const dayAngle = ((this.hour - 6) / 12) * Math.PI; // 0 at 6h, PI at 18h
    const elevation = Math.sin(dayAngle); // >0 during day
    const azimuth = Math.cos(dayAngle);
    this.sunDir.set(azimuth, Math.max(elevation, -0.2), 0.35 * azimuth).normalize();

    env.sun.intensity = this.key.sun;
    env.sun.color.copy(this.key.sunColor);
    env.setAmbientIntensity(this.key.ambient);
    env.setSunDirection(this.sunDir);
    env.sky.setColors(this.key.top, this.key.horizon, this.key.bottom);
    env.sky.setSunColor(this.key.sunColor);

    // Fog colour follows the sky.
    env.setFogColor(this.key.fog);

    // Streetlights: fade on when the sun is low.
    const nightAmount = clamp((0.15 - elevation) / 0.4, 0, 1);
    const mat = this.world.city.streetlightMaterial;
    if (mat) mat.emissiveIntensity = lerp(0.15, 2.2, nightAmount);
  }

  /** "HH:MM" for the HUD. */
  getClockString(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
