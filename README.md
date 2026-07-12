# 🌴 Los Asetinos

An open-world, GTA-style sandbox game that runs **entirely in the browser**, built
with [Three.js](https://threejs.org/) + TypeScript + Vite.

This project is an AI-assisted game-dev experiment: an AI acts as the *orchestrator*
(imagining, coding and iterating on the game) while specialised AI models can be
plugged in to generate 3D models, textures, sounds, voices and cinematics. The game
is designed to run **fully offline with procedural placeholder assets**, and to
progressively swap those placeholders for AI-generated assets as provider keys are
configured.

> Inspired by the "24h to build GTA 6" experiment. Built to a studio-grade standard:
> typed, modular, and structured to grow with a team over many months.

## Quick start

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5173) and press **Play**.

## Controls

| Action            | Key                         |
| ----------------- | --------------------------- |
| Move              | `W` `A` `S` `D` / arrows    |
| Sprint            | `Shift`                     |
| Jump              | `Space`                     |
| Look around       | Mouse (click to capture)    |
| Pause / release   | `Esc`                       |

More mechanics (vehicles, NPCs, weapons, missions…) land in later iterations — see
the [roadmap](docs/ROADMAP.md).

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Start the dev server with HMR                |
| `npm run build`     | Type-check and build for production          |
| `npm run preview`   | Preview the production build                 |
| `npm run typecheck` | Run the TypeScript compiler (no emit)        |
| `npm run lint`      | Lint the source                              |
| `npm run format`    | Format the source with Prettier              |

## Architecture

The codebase is split into clear layers so multiple developers can work in parallel.
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

```
src/
  core/       Engine-agnostic building blocks (loop, events, math, time)
  engine/     Rendering, camera, input, resource management (Three.js glue)
  world/      The game world: city generation, environment, sky
  entities/   Player, vehicles, NPCs — things that live in the world
  systems/    Cross-cutting systems (physics, spawning, AI) run each frame
  gameplay/   Game rules: missions, police, economy, weapons
  assets/     Asset providers: procedural now, AI-backed later
  ui/         HUD, menus, overlays
  config/     Tunable constants and game configuration
```

## AI-generated assets

The game ships with procedural assets so it runs with zero external dependencies.
To enable AI-generated 3D models, textures, audio and cinematics, copy
`.env.example` to `.env` and add your provider keys. See
[docs/AI_ASSETS.md](docs/AI_ASSETS.md) for the design and integration points.

## License

[MIT](LICENSE) © zikmout
