# Architecture

Los Asetinos is structured in layers, from engine-agnostic primitives up to game
rules. The guiding principle: **the engine knows nothing about the game, and the
game talks to the engine through small, explicit interfaces.** This keeps systems
testable and lets several people work in parallel without stepping on each other.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│  ui/          HUD, menus, overlays (DOM)                 │
├─────────────────────────────────────────────────────────┤
│  gameplay/    missions, police, economy, weapons         │
├─────────────────────────────────────────────────────────┤
│  entities/    player, vehicles, npcs                     │
│  systems/     physics, spawning, ai — updated each tick  │
├─────────────────────────────────────────────────────────┤
│  world/       city generation, environment, sky          │
├─────────────────────────────────────────────────────────┤
│  engine/      renderer, camera, input, resources         │
├─────────────────────────────────────────────────────────┤
│  core/        loop, events, math, time, service locator  │
└─────────────────────────────────────────────────────────┘
```

Dependencies point **downward** only. `core` depends on nothing; `engine` depends on
`core` + Three.js; game layers depend on `engine` + `core`.

## Key building blocks

- **`core/GameLoop`** — a fixed-timestep loop. Simulation (`fixedUpdate`) runs at a
  constant rate for deterministic physics; rendering (`render`) runs as fast as the
  display allows, with interpolation. This is the standard studio pattern (see
  Gaffer's "Fix Your Timestep").
- **`core/EventBus`** — a tiny typed pub/sub so systems communicate without hard
  references (e.g. `player:died`, `wanted:changed`).
- **`core/Services`** — a minimal service locator so we avoid passing a dozen
  constructor args around. Registered once at boot.
- **`engine/Engine`** — owns the Three.js `WebGLRenderer`, the active scene and
  camera, and the render pipeline. Everything visual goes through it.
- **`Game`** — the top-level object that wires a `World`, its `System`s and the
  player together and drives them from the loop.

## The update contract

Every system implements a subset of:

```ts
interface System {
  fixedUpdate?(dt: number): void; // fixed simulation step (seconds)
  update?(dt: number): void;      // per-frame, variable dt (seconds)
  lateUpdate?(alpha: number): void; // after update; alpha = interpolation factor
}
```

The `Game` owns an ordered list of systems and calls them in order each tick. Adding
a feature usually means adding a system and/or an entity, not touching the loop.

## Adding a feature

1. Model it as an **entity** (something in the world) and/or a **system** (behaviour
   over entities).
2. Register the system with the `Game`.
3. Emit/consume events on the `EventBus` instead of reaching across modules.
4. Put tunable numbers in `config/` so designers can iterate without hunting through
   logic.
