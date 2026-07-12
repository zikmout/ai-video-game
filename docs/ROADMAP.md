# Roadmap

This roadmap mirrors the iteration path of the "24h GTA 6" experiment, rebuilt on a
clean, studio-grade foundation. Each milestone is meant to be independently playable.

## ✅ M0 — First playable base (current)

- [x] Engine core: fixed-timestep loop, renderer, input, camera
- [x] Procedural city: ground, road grid, buildings, streetlights
- [x] Procedural sky (day-lit) + fog
- [x] Third-person player controller (walk, sprint, jump, mouse-look)
- [x] Play/pause flow and HUD scaffolding

## M1 — A city that looks alive

- [ ] Seamless procedural textures for roads, sidewalks, ground
- [ ] Skybox with a real sky gradient / cubemap
- [ ] Denser, more varied buildings; districts (downtown, port, beach, park)
- [ ] Props & decoration (palms, benches, lamps, hydrants)

## M2 — Vehicles

- [ ] Drivable cars with arcade physics (accelerate, brake, steer)
- [ ] Enter/exit vehicle flow, driving camera + speedo HUD
- [ ] Autonomous traffic on the road grid (lanes, stops)

## M3 — NPCs & world simulation

- [ ] Pedestrians that walk sidewalks and cross at crossings
- [ ] Simple crowd AI, reactions to the player and to danger
- [ ] Day/night cycle, mini-map, money & clock

## M4 — Action

- [ ] Weapons (pistol, SMG, launcher) with hit/impact feedback
- [ ] Police + wanted system (stars, pursuit AI)
- [ ] Destruction/impact effects, particles

## M5 — Content

- [ ] First mission ("Rico") with objectives and rewards
- [ ] Radio with music tracks
- [ ] Interior locations (casino, airport) + flyable plane

## M6 — Polish & AI assets

- [ ] Swap procedural placeholders for AI-generated models/textures/audio
- [ ] Intro cinematic
- [ ] Performance pass (instancing, LOD, culling)

See [AI_ASSETS.md](AI_ASSETS.md) for how AI-generated assets slot in throughout.
