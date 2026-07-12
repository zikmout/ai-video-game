import * as THREE from 'three';
import type { System } from '@/core/System';
import { Vehicle } from '@/entities/Vehicle';
import type { World } from '@/world/World';
import { Random } from '@/core/Random';
import { GameConfig } from '@/config/gameConfig';

/**
 * Autonomous traffic on the road grid.
 *
 * The city is a regular grid: roads run along lines
 *   coord(i) = -half + i*cell - roadWidth/2,  i in [0..blocks]
 * on both axes, meeting at intersections. Each AI car drives in a lane toward
 * the next intersection; on arrival it picks a new cardinal direction (usually
 * straight, sometimes turning), so cars flow through the network indefinitely.
 *
 * Cars brake for whatever is close ahead (player car or another AI car) via a
 * simple lookahead, which keeps them from piling into each other or the player.
 *
 * This is deliberately grid-following rather than full pathfinding — cheap,
 * stable, and reads as "traffic". It shares the `Vehicle` entity with the
 * player, so nothing special distinguishes a car you could (later) hijack.
 */
type Dir = 0 | 1 | 2 | 3; // 0:+X 1:-X 2:+Z 3:-Z

const DIR_VECTORS: Record<Dir, [number, number]> = {
  0: [1, 0],
  1: [-1, 0],
  2: [0, 1],
  3: [0, -1],
};
const DIR_HEADING: Record<Dir, number> = {
  // heading 0 faces -Z; forward = (-sin h, -cos h)
  0: -Math.PI / 2, // +X
  1: Math.PI / 2, // -X
  2: Math.PI, // +Z
  3: 0, // -Z
};

interface Agent {
  vehicle: Vehicle;
  dir: Dir;
  /** Lane offset from the road centreline (so opposing lanes don't overlap). */
  laneOffset: number;
  targetIndex: number; // next intersection index along travel axis
}

export class TrafficSystem implements System {
  readonly name = 'TrafficSystem';

  private readonly agents: Agent[] = [];
  private readonly rng: Random;
  private readonly roadCoords: number[] = [];
  private readonly half: number;
  private readonly laneWidth: number;

  constructor(
    private readonly world: World,
    private readonly vehicles: Vehicle[],
    private readonly scene: THREE.Scene,
  ) {
    this.rng = new Random(GameConfig.seed ^ 0x51ed);
    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    this.half = this.world.city.bounds.half;
    this.laneWidth = roadWidth * 0.22;

    for (let i = 0; i <= blocks; i++) {
      this.roadCoords.push(-this.half + i * cell - roadWidth / 2);
    }

    this.spawn();
  }

  private spawn(): void {
    const count = GameConfig.traffic.count;
    for (let n = 0; n < count; n++) {
      const vehicle = new Vehicle();
      this.vehicles.push(vehicle);
      this.scene.add(vehicle.object);

      // Place on a random road, travelling along it.
      const horizontal = this.rng.bool();
      const roadIdx = this.rng.int(0, this.roadCoords.length - 1);
      const roadC = this.roadCoords[roadIdx]!;
      const dir: Dir = horizontal
        ? this.rng.bool()
          ? 0
          : 1
        : this.rng.bool()
          ? 2
          : 3;
      const laneOffset = this.laneSign(dir) * this.laneWidth;

      // Position along the road at a random point between intersections.
      const along = this.rng.range(-this.half, this.half);
      let x: number;
      let z: number;
      if (horizontal) {
        z = roadC + laneOffset;
        x = along;
      } else {
        x = roadC + laneOffset;
        z = along;
      }
      vehicle.placeAt(x, z, DIR_HEADING[dir]);
      vehicle.speed = GameConfig.traffic.speed;

      this.agents.push({
        vehicle,
        dir,
        laneOffset,
        targetIndex: this.nextIntersectionIndex(horizontal ? x : z, dir),
      });
    }
  }

  /** Lane sign keeps opposing directions on their own side of the centreline. */
  private laneSign(dir: Dir): number {
    return dir === 0 || dir === 3 ? 1 : -1;
  }

  private nextIntersectionIndex(alongCoord: number, dir: Dir): number {
    const [dx, dz] = DIR_VECTORS[dir];
    const travelPositive = dx + dz > 0;
    // Find the first road coordinate strictly ahead in travel direction.
    if (travelPositive) {
      for (let i = 0; i < this.roadCoords.length; i++) {
        if (this.roadCoords[i]! > alongCoord + 0.5) return i;
      }
      return this.roadCoords.length - 1;
    } else {
      for (let i = this.roadCoords.length - 1; i >= 0; i--) {
        if (this.roadCoords[i]! < alongCoord - 0.5) return i;
      }
      return 0;
    }
  }

  fixedUpdate(dt: number): void {
    const cruise = GameConfig.traffic.speed;
    const look = GameConfig.traffic.lookahead;

    for (const agent of this.agents) {
      const v = agent.vehicle;
      if (v.occupied) continue; // player hijacked this one — skip AI

      // Slow down if something is close ahead in our lane.
      const blocked = this.obstacleAhead(agent, look);
      const targetSpeed = blocked ? 0 : cruise;
      const rate = blocked ? 20 : 8;
      v.speed += Math.sign(targetSpeed - v.speed) * Math.min(rate * dt, Math.abs(targetSpeed - v.speed));

      // Advance and check whether we've reached the next intersection.
      v.integrate(dt);
      this.followLane(agent);
    }
  }

  /** Keep the car snapped to its lane and handle turns at intersections. */
  private followLane(agent: Agent): void {
    const v = agent.vehicle;
    const horizontal = agent.dir === 0 || agent.dir === 1;
    const [dx, dz] = DIR_VECTORS[agent.dir];
    const travelPositive = dx + dz > 0;

    const alongCoord = horizontal ? v.position.x : v.position.z;
    const targetRoad = this.roadCoords[agent.targetIndex]!;

    const reached = travelPositive
      ? alongCoord >= targetRoad
      : alongCoord <= targetRoad;

    if (reached) {
      // Snap to the intersection centre and choose a new direction.
      this.turnAtIntersection(agent);
    } else {
      // Correct lateral drift back to the lane line.
      if (horizontal) {
        const roadC = this.currentCrossCoord(agent);
        v.position.z = roadC + agent.laneOffset;
        v.heading = DIR_HEADING[agent.dir];
      } else {
        const roadC = this.currentCrossCoord(agent);
        v.position.x = roadC + agent.laneOffset;
        v.heading = DIR_HEADING[agent.dir];
      }
    }
  }

  /** The cross-axis road coordinate the car is currently travelling along. */
  private currentCrossCoord(agent: Agent): number {
    // The lane line the car rides is the nearest road coord on the cross axis.
    const horizontal = agent.dir === 0 || agent.dir === 1;
    const cross = horizontal ? agent.vehicle.position.z : agent.vehicle.position.x;
    return this.nearestRoad(cross - agent.laneOffset);
  }

  private nearestRoad(coord: number): number {
    let best = this.roadCoords[0]!;
    let bestD = Math.abs(coord - best);
    for (const c of this.roadCoords) {
      const d = Math.abs(coord - c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  private turnAtIntersection(agent: Agent): void {
    const v = agent.vehicle;
    const targetRoad = this.roadCoords[agent.targetIndex]!;
    const crossRoad = this.currentCrossCoord(agent);
    const horizontal = agent.dir === 0 || agent.dir === 1;

    // Snap exactly onto the intersection.
    if (horizontal) {
      v.position.x = targetRoad;
      v.position.z = crossRoad;
    } else {
      v.position.z = targetRoad;
      v.position.x = crossRoad;
    }

    // Choose new direction: mostly straight, sometimes turn, never U-turn.
    const roll = this.rng.next();
    let newDir: Dir = agent.dir;
    if (roll < 0.55) {
      newDir = agent.dir; // straight
    } else {
      newDir = this.turnFrom(agent.dir, roll < 0.775 ? 'left' : 'right');
    }

    // If continuing straight would leave the grid, force a turn instead.
    if (this.wouldLeaveGrid(v.position.x, v.position.z, newDir)) {
      newDir = this.turnFrom(agent.dir, 'left');
      if (this.wouldLeaveGrid(v.position.x, v.position.z, newDir)) {
        newDir = this.turnFrom(agent.dir, 'right');
      }
    }

    agent.dir = newDir;
    agent.laneOffset = this.laneSign(newDir) * this.laneWidth;
    v.heading = DIR_HEADING[newDir];

    // Snap onto the new lane, then compute the next intersection ahead.
    this.snapToNewLane(agent, targetRoad, crossRoad);
    const newHorizontal = newDir === 0 || newDir === 1;
    const along = newHorizontal ? v.position.x : v.position.z;
    agent.targetIndex = this.nextIntersectionIndex(along, newDir);
  }

  private snapToNewLane(agent: Agent, targetRoad: number, crossRoad: number): void {
    const v = agent.vehicle;
    const newHorizontal = agent.dir === 0 || agent.dir === 1;
    if (newHorizontal) {
      // Travelling along X now; ride the road line at z = targetRoad.
      v.position.z = targetRoad + agent.laneOffset;
      v.position.x = crossRoad;
    } else {
      v.position.x = targetRoad + agent.laneOffset;
      v.position.z = crossRoad;
    }
  }

  private turnFrom(dir: Dir, side: 'left' | 'right'): Dir {
    // +X(0) -X(1) +Z(2) -Z(3)
    const leftMap: Record<Dir, Dir> = { 0: 3, 3: 1, 1: 2, 2: 0 };
    const rightMap: Record<Dir, Dir> = { 0: 2, 2: 1, 1: 3, 3: 0 };
    return side === 'left' ? leftMap[dir] : rightMap[dir];
  }

  private wouldLeaveGrid(x: number, z: number, dir: Dir): boolean {
    const [dx, dz] = DIR_VECTORS[dir];
    const margin = 4;
    const nx = x + dx * (this.half + margin);
    const nz = z + dz * (this.half + margin);
    return Math.abs(nx) > this.half + margin || Math.abs(nz) > this.half + margin;
  }

  /** Is there a car (or the player's car) close ahead in this agent's path? */
  private obstacleAhead(agent: Agent, distance: number): boolean {
    const v = agent.vehicle;
    const [dx, dz] = DIR_VECTORS[agent.dir];
    const laneHalf = 1.6;
    for (const other of this.vehicles) {
      if (other === v) continue;
      const ox = other.position.x - v.position.x;
      const oz = other.position.z - v.position.z;
      // Project onto travel axis; must be in front and within lane width.
      const forwardDist = ox * dx + oz * dz;
      if (forwardDist <= 0.5 || forwardDist > distance) continue;
      const lateral = Math.abs(ox * dz - oz * dx); // perpendicular distance
      if (lateral < laneHalf) return true;
    }
    return false;
  }

  dispose(): void {
    for (const agent of this.agents) {
      this.scene.remove(agent.vehicle.object);
      agent.vehicle.dispose();
    }
    this.agents.length = 0;
  }
}
