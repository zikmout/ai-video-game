import * as THREE from 'three';
import type { Vehicle } from '@/entities/Vehicle';
import { clamp } from '@/core/math';

/**
 * Push a vehicle out of any overlapping building AABB on the XZ plane,
 * approximating the car as a circle of its half-length. Returns true if a
 * collision was resolved (callers typically bleed off speed on impact).
 *
 * Shared by the player's VehicleController and the PoliceSystem so every car
 * collides with the city identically.
 */
export function resolveVehicleAgainstBuildings(v: Vehicle, boxes: THREE.Box3[]): boolean {
  const r = v.model.halfExtents.z;
  let hit = false;
  for (const box of boxes) {
    const closestX = clamp(v.position.x, box.min.x, box.max.x);
    const closestZ = clamp(v.position.z, box.min.z, box.max.z);
    const dx = v.position.x - closestX;
    const dz = v.position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= r * r) continue;
    hit = true;
    const dist = Math.sqrt(distSq) || 1e-4;
    const push = (r - dist) / dist;
    v.position.x += dx * push;
    v.position.z += dz * push;
  }
  return hit;
}
