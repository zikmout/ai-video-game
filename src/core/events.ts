/**
 * The central catalogue of game events and their payloads.
 *
 * Keep this list authoritative: every cross-system message flows through here so
 * payloads stay type-checked and discoverable. Namespaced by domain
 * (`game:*`, `player:*`, `wanted:*`, …).
 */
export interface GameEvents {
  // Lifecycle
  'game:started': void;
  'game:paused': void;
  'game:resumed': void;

  // Player
  'player:spawned': { position: [number, number, number] };
  'player:died': { cause: string };

  // World / progression (used by later milestones)
  'wanted:changed': { level: number };
  'money:changed': { amount: number; delta: number };

  // Debug
  'debug:toggle': void;
}
