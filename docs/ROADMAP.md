# Roadmap

This roadmap mirrors the iteration path of the "24h GTA 6" experiment, rebuilt on a
clean, studio-grade foundation. Each milestone is meant to be independently playable.

## ✅ M0 — First playable base (current)

- [x] Engine core: fixed-timestep loop, renderer, input, camera
- [x] Procedural city: ground, road grid, buildings, streetlights
- [x] Procedural sky (day-lit) + fog
- [x] Third-person player controller (walk, sprint, jump, mouse-look)
- [x] Play/pause flow and HUD scaffolding

## ✅ M1 — A city that looks alive

- [x] Seamless procedural textures for roads, sidewalks, ground, sand
- [x] Sky gradient dome with sun
- [x] Denser, more varied buildings; districts (downtown, residential, beach, park)
- [x] Props & decoration (palms, benches, hydrants, bins)

## ✅ M2 — Vehicles

- [x] Drivable cars with arcade physics (accelerate, brake, reverse, steer)
- [x] Enter/exit vehicle flow, chase camera + speedometer HUD
- [x] Autonomous traffic on the road grid (lanes, turns, collision braking)

## ✅ M3 — NPCs & world simulation

- [x] Pedestrians that walk the sidewalk network (animated walk cycle)
- [x] Simple crowd AI: wander targets, flee from approaching cars
- [x] Day/night cycle (sun arc, sky/fog palette, streetlights at dusk)
- [x] Mini-map (roads, buildings, traffic blips), money & clock HUD

## ✅ M4 — Action

- [x] Weapons (pistol, SMG, bazooka) visible in hand, hitscan + rockets
- [x] Police + wanted system (stars, decay, pursuit AI that brakes into turns)
- [x] Particles (muzzle flash, impacts, explosions), burning vehicle wrecks

## ✅ M5 — Content

- [x] First mission ("Rico") with objectives and rewards: phone call, beacon
      checkpoints, car theft → 2-star pursuit, delivery, $ reward, retry on fail
- [x] Radio with music tracks (3 procedurally synthesized Web Audio stations)

## ✅ M5.5 — Wings

- [x] Airport zone (runway with markings, hangar, control tower, apron)
- [x] Flyable plane: arcade flight (taxi, takeoff threshold, climb/dive/bank,
      stall, altitude ceiling), crash explosions on buildings/hard landings

## M6 — Polish & AI assets

- [ ] Swap procedural placeholders for AI-generated models/textures/audio
- [ ] Intro cinematic
- [ ] Performance pass (instancing, LOD, culling)

See [AI_ASSETS.md](AI_ASSETS.md) for how AI-generated assets slot in throughout.
