/**
 * A tiny, type-safe publish/subscribe bus.
 *
 * Systems communicate through named events instead of holding references to one
 * another. The event map is declared centrally (see `GameEvents`) so payloads
 * are checked at compile time.
 *
 * Usage:
 *   bus.on('wanted:changed', ({ level }) => hud.setStars(level));
 *   bus.emit('wanted:changed', { level: 3 });
 */
// An event map maps event names to their payload types. `object` (rather than
// `Record<string, unknown>`) lets declared `interface`s satisfy the constraint.
export type EventMap = object;

type Handler<T> = (payload: T) => void;

export class EventBus<Events extends EventMap> {
  private readonly handlers = new Map<keyof Events, Set<Handler<unknown>>>();

  /** Subscribe. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  /** Subscribe for a single emission. */
  once<K extends keyof Events>(event: K, handler: Handler<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, handler: Handler<Events[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Copy to allow handlers to unsubscribe during emission.
    for (const handler of [...set]) {
      (handler as Handler<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
