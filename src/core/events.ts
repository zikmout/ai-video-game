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

  // Vehicles
  'vehicle:entered': void;
  'vehicle:exited': void;
  'vehicle:destroyed': { position: [number, number, number] };

  // Combat / crime
  'gun:fired': { position: [number, number, number] };
  'crime:committed': {
    kind: 'gunfire' | 'pedKilled' | 'vehicleDestroyed' | 'copRammed' | 'carStolen';
  };

  // World / progression
  'wanted:changed': { level: number };
  'money:changed': { amount: number; delta: number };

  // Missions
  'mission:call': { caller: string; lines: string[] };
  'mission:objective': { text: string | null };
  'mission:completed': { id: string; reward: number };
  'mission:failed': { id: string; reason: string };

  // Radio
  'radio:changed': { station: string | null };

  // Debug
  'debug:toggle': void;
}
