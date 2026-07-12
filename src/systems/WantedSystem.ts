import type { System } from '@/core/System';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';
import { GameConfig } from '@/config/gameConfig';
import { clamp } from '@/core/math';

/**
 * GTA-style wanted level.
 *
 * Crimes (reported on the event bus) add heat points; 100 points = 1 star, up
 * to 5. After a quiet spell the heat decays star by star until clean. Star
 * changes are broadcast as `wanted:changed` so the HUD and the police react
 * without knowing about each other.
 */
export class WantedSystem implements System {
  readonly name = 'WantedSystem';

  private points = 0;
  private stars = 0;
  private sinceLastCrime = Infinity;
  private readonly unsubscribe: () => void;

  constructor(private readonly bus: EventBus<GameEvents>) {
    this.unsubscribe = bus.on('crime:committed', ({ kind }) => {
      this.points += GameConfig.wanted.points[kind];
      this.sinceLastCrime = 0;
      this.recomputeStars();
    });
  }

  get level(): number {
    return this.stars;
  }

  fixedUpdate(dt: number): void {
    this.sinceLastCrime += dt;
    const cfg = GameConfig.wanted;
    if (this.points > 0 && this.sinceLastCrime > cfg.decayDelay) {
      // Drain one star's worth of points every `decayPerStar` seconds.
      this.points = Math.max(0, this.points - (100 / cfg.decayPerStar) * dt);
      this.recomputeStars();
    }
  }

  private recomputeStars(): void {
    const cfg = GameConfig.wanted;
    this.points = clamp(this.points, 0, cfg.maxStars * 100 + 99);
    const stars = clamp(Math.floor(this.points / 100), 0, cfg.maxStars);
    if (stars !== this.stars) {
      this.stars = stars;
      this.bus.emit('wanted:changed', { level: stars });
    }
  }

  dispose(): void {
    this.unsubscribe();
  }
}
