import * as THREE from 'three';
import { GameConfig } from '@/config/gameConfig';
import { makeAsphaltTexture, makeSidewalkTexture } from '@/assets/procedural/textures';

/**
 * A small airfield east of the city grid: one runway with painted markings,
 * a hangar and a control tower. The hangar/tower get collision boxes so cars
 * and the plane can't drive through them.
 */
export class Airport {
  readonly group = new THREE.Group();
  /** Solid obstacles, appended to the world's building boxes. */
  readonly obstacleBoxes: THREE.Box3[] = [];

  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor() {
    this.group.name = 'Airport';
    this.buildRunway();
    this.buildApron();
    this.buildHangar();
    this.buildTower();
  }

  private track<T extends { dispose(): void }>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }

  private buildRunway(): void {
    const { runwayX, runwayHalfLength, runwayWidth } = GameConfig.airport;
    const length = runwayHalfLength * 2;

    const tex = this.track(makeAsphaltTexture(length / 12));
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    const geo = this.track(new THREE.PlaneGeometry(runwayWidth, length));
    const runway = new THREE.Mesh(geo, mat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.set(runwayX, 0.01, 0);
    runway.receiveShadow = true;
    runway.name = 'Runway';
    this.group.add(runway);

    // Centreline dashes + threshold bars, one instanced mesh each.
    const markMat = this.track(new THREE.MeshBasicMaterial({ color: 0xf4f4f4, toneMapped: false }));
    const dashGeo = this.track(new THREE.PlaneGeometry(0.6, 6));
    const dashCount = Math.floor(length / 12);
    const dashes = new THREE.InstancedMesh(dashGeo, markMat, dashCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < dashCount; i++) {
      dummy.position.set(runwayX, 0.03, -runwayHalfLength + 6 + i * 12);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.updateMatrix();
      dashes.setMatrixAt(i, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    this.group.add(dashes);

    const barGeo = this.track(new THREE.PlaneGeometry(1.4, 5));
    const bars = new THREE.InstancedMesh(barGeo, markMat, 12);
    let b = 0;
    for (const zEnd of [-runwayHalfLength + 5, runwayHalfLength - 5]) {
      for (let i = 0; i < 6; i++) {
        dummy.position.set(runwayX - runwayWidth / 2 + 3 + i * 4, 0.03, zEnd);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.updateMatrix();
        bars.setMatrixAt(b++, dummy.matrix);
      }
    }
    bars.instanceMatrix.needsUpdate = true;
    this.group.add(bars);
  }

  /** Concrete apron between the runway and the buildings. */
  private buildApron(): void {
    const { runwayX, runwayWidth } = GameConfig.airport;
    const tex = this.track(makeSidewalkTexture(8));
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    const geo = this.track(new THREE.PlaneGeometry(46, 90));
    const apron = new THREE.Mesh(geo, mat);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(runwayX + runwayWidth / 2 + 23, 0.005, 130);
    apron.receiveShadow = true;
    apron.name = 'Apron';
    this.group.add(apron);
  }

  private buildHangar(): void {
    const { runwayX, runwayWidth } = GameConfig.airport;
    const x = runwayX + runwayWidth / 2 + 30;
    const z = 155;

    const wallMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8e9aa4, roughness: 0.7, metalness: 0.3 }),
    );
    const roofMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.6, metalness: 0.2 }),
    );

    const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(22, 8, 18)), wallMat);
    body.position.set(x, 4, z);
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Barrel roof: a full cylinder laid along the hangar depth, tucked just
    // inside the walls so only the top half shows (avoids half-shell
    // orientation pitfalls and z-fighting with the flush walls).
    const roof = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(10.8, 10.8, 17.8, 16)),
      roofMat,
    );
    roof.rotation.x = Math.PI / 2;
    roof.position.set(x, 8, z);
    roof.castShadow = true;
    this.group.add(roof);

    this.obstacleBoxes.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 6, z),
        new THREE.Vector3(22, 12, 18),
      ),
    );
  }

  private buildTower(): void {
    const { runwayX, runwayWidth } = GameConfig.airport;
    const x = runwayX + runwayWidth / 2 + 16;
    const z = 100;

    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.6 }),
    );
    const glass = this.track(
      new THREE.MeshStandardMaterial({
        color: 0x2b3f52,
        roughness: 0.2,
        metalness: 0.4,
        emissive: 0x16324a,
        emissiveIntensity: 0.4,
      }),
    );

    const shaft = new THREE.Mesh(this.track(new THREE.CylinderGeometry(1.6, 2.2, 16, 10)), mat);
    shaft.position.set(x, 8, z);
    shaft.castShadow = true;
    this.group.add(shaft);

    const cab = new THREE.Mesh(this.track(new THREE.CylinderGeometry(3.4, 2.6, 3.2, 10)), glass);
    cab.position.set(x, 17.6, z);
    cab.castShadow = true;
    this.group.add(cab);

    this.obstacleBoxes.push(
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(x, 10, z),
        new THREE.Vector3(5, 20, 5),
      ),
    );
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.group.clear();
  }
}
