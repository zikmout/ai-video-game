import * as THREE from 'three';
import { Environment } from './Environment';
import { City } from './City';
import { Airport } from './Airport';

/**
 * World composes the static environment (lighting, sky), the generated city
 * and the airfield east of it. It exposes ground height and collision data
 * the player/vehicles query.
 *
 * For M0 the world is flat (ground at y=0) and collision is limited to keeping
 * the player out of building boxes; richer terrain and physics arrive later.
 */
export class World {
  readonly environment: Environment;
  readonly city: City;
  readonly airport: Airport;

  private readonly solidBoxes: THREE.Box3[];

  constructor(private readonly scene: THREE.Scene) {
    this.environment = new Environment(scene);
    this.city = new City();
    scene.add(this.city.group);
    this.airport = new Airport();
    scene.add(this.airport.group);
    this.solidBoxes = [...this.city.buildingBoxes, ...this.airport.obstacleBoxes];
  }

  /** Ground height at a world XZ (flat for now). */
  groundHeight(_x: number, _z: number): number {
    return 0;
  }

  get buildingBoxes(): THREE.Box3[] {
    return this.solidBoxes;
  }

  update(cameraPosition: THREE.Vector3, focus: THREE.Vector3): void {
    this.environment.update(cameraPosition, focus);
  }

  dispose(): void {
    this.scene.remove(this.city.group);
    this.city.dispose();
    this.scene.remove(this.airport.group);
    this.airport.dispose();
    this.environment.dispose();
  }
}
