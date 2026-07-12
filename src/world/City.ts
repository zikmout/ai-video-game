import * as THREE from 'three';
import { GameConfig } from '@/config/gameConfig';
import { Random } from '@/core/Random';
import {
  makeAsphaltTexture,
  makeSidewalkTexture,
  makeGroundTexture,
  makeFacadeTexture,
} from '@/assets/procedural/textures';

/**
 * Procedural city generator.
 *
 * Lays out a regular grid of blocks separated by roads. Each block gets a
 * sidewalk border and a randomly sized/coloured building. Streetlights line the
 * roads. Everything is deterministic from `GameConfig.seed`, and building
 * bases sit exactly on the ground (a bug the source experiment kept hitting).
 *
 * The whole city is added under a single `group` so the world can add/remove it
 * atomically, and geometries/materials are tracked for disposal.
 */
export class City {
  readonly group = new THREE.Group();
  readonly bounds: { size: number; half: number };

  private readonly rng: Random;
  private readonly disposables: Array<{ dispose(): void }> = [];
  /** Axis-aligned building boxes for simple collision in later milestones. */
  readonly buildingBoxes: THREE.Box3[] = [];

  private readonly buildingPalette = [
    '#c8c2b6',
    '#a9b7c6',
    '#d8c8b8',
    '#b7a99a',
    '#9fb0a4',
    '#cdb9a3',
    '#8fa1b3',
  ];

  constructor() {
    this.group.name = 'City';
    this.rng = new Random(GameConfig.seed);

    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    const size = blocks * cell;
    this.bounds = { size, half: size / 2 };

    this.buildGround();
    this.buildRoads();
    this.buildBlocks();
    this.buildStreetlights();
  }

  private track<T extends { dispose(): void }>(obj: T): T {
    this.disposables.push(obj);
    return obj;
  }

  /** Grassy ground plane extending well beyond the city for a horizon. */
  private buildGround(): void {
    const extent = this.bounds.size * 3;
    const tex = this.track(makeGroundTexture(extent / 6));
    const geo = this.track(new THREE.PlaneGeometry(extent, extent));
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.02;
    mesh.receiveShadow = true;
    mesh.name = 'Ground';
    this.group.add(mesh);
  }

  /**
   * A single asphalt slab under the whole grid, with painted lane lines drawn as
   * thin light strips along each road centre. Cheaper and seam-free versus many
   * road quads.
   */
  private buildRoads(): void {
    const { size } = this.bounds;
    const tex = this.track(makeAsphaltTexture(size / 8));
    const geo = this.track(new THREE.PlaneGeometry(size, size));
    const mat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    const road = new THREE.Mesh(geo, mat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0;
    road.receiveShadow = true;
    road.name = 'Roads';
    this.group.add(road);

    this.buildLaneMarkings();
  }

  private buildLaneMarkings(): void {
    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    const { half } = this.bounds;
    const markMat = this.track(
      new THREE.MeshBasicMaterial({ color: 0xf3e9c6, toneMapped: false }),
    );
    const dashLen = 3;
    const dashGap = 3;
    const lineWidth = 0.25;

    // Dashed centre lines along each road (both axes), at road centres.
    for (let i = 0; i <= blocks; i++) {
      const roadCentre = -half + i * cell + blockSize + roadWidth / 2 - cell + roadWidth / 2;
      // Simpler: road i runs between block (i-1) and block i.
      const pos = -half + i * cell - roadWidth / 2;
      void roadCentre;
      this.addDashedLine(markMat, pos, 'x', dashLen, dashGap, lineWidth);
      this.addDashedLine(markMat, pos, 'z', dashLen, dashGap, lineWidth);
    }
  }

  private addDashedLine(
    material: THREE.Material,
    coord: number,
    axis: 'x' | 'z',
    dashLen: number,
    gap: number,
    width: number,
  ): void {
    const { size, half } = this.bounds;
    const count = Math.floor(size / (dashLen + gap));
    const geo = this.track(new THREE.PlaneGeometry(width, dashLen));
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.name = `Lane_${axis}_${coord.toFixed(0)}`;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const along = -half + i * (dashLen + gap) + dashLen / 2;
      if (axis === 'x') {
        dummy.position.set(coord, 0.02, along);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
      } else {
        dummy.position.set(along, 0.02, coord);
        dummy.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
  }

  private buildBlocks(): void {
    const { blocks, blockSize, roadWidth, sidewalkWidth } = GameConfig.city;
    const cell = blockSize + roadWidth;
    const { half } = this.bounds;

    const sidewalkTex = this.track(makeSidewalkTexture(6));
    const sidewalkMat = this.track(
      new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 1 }),
    );

    for (let bx = 0; bx < blocks; bx++) {
      for (let bz = 0; bz < blocks; bz++) {
        const cx = -half + bx * cell + blockSize / 2 + roadWidth / 2;
        const cz = -half + bz * cell + blockSize / 2 + roadWidth / 2;

        // Sidewalk pad (slightly raised) covering the block footprint.
        const padGeo = this.track(
          new THREE.BoxGeometry(blockSize, 0.12, blockSize),
        );
        const pad = new THREE.Mesh(padGeo, sidewalkMat);
        pad.position.set(cx, 0.06, cz);
        pad.receiveShadow = true;
        this.group.add(pad);

        this.buildBuilding(cx, cz, blockSize - sidewalkWidth * 2);
      }
    }
  }

  private buildBuilding(cx: number, cz: number, maxFootprint: number): void {
    const cfg = GameConfig.city.building;
    const floors = this.rng.int(cfg.minFloors, cfg.maxFloors);
    const height = floors * cfg.floorHeight;

    // Footprint with a little variation, always within the sidewalk.
    const fw = maxFootprint * this.rng.range(0.7, 0.98);
    const fd = maxFootprint * this.rng.range(0.7, 0.98);

    const baseColor = this.rng.pick(this.buildingPalette);
    const windowColor = this.rng.bool(0.5) ? '#ffe9a8' : '#bfe4ff';
    const columns = Math.max(3, Math.round(fw / 4));

    const facade = this.track(makeFacadeTexture(baseColor, windowColor, floors, columns));
    const roofMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.9 }),
    );
    const wallMat = this.track(
      new THREE.MeshStandardMaterial({ map: facade, roughness: 0.85, metalness: 0.05 }),
    );

    const geo = this.track(new THREE.BoxGeometry(fw, height, fd));
    // Materials order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
    const materials = [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat];
    const building = new THREE.Mesh(geo, materials);
    // Base sits exactly on the sidewalk pad top (y = 0.12), centre at height/2.
    building.position.set(cx, height / 2 + 0.12, cz);
    building.castShadow = true;
    building.receiveShadow = true;
    building.name = 'Building';
    this.group.add(building);

    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(cx, height / 2 + 0.12, cz),
      new THREE.Vector3(fw, height, fd),
    );
    this.buildingBoxes.push(box);
  }

  private buildStreetlights(): void {
    const { blocks, blockSize, roadWidth } = GameConfig.city;
    const { spacing, height } = GameConfig.city.streetlights;
    const cell = blockSize + roadWidth;
    const { half, size } = this.bounds;

    const poleGeo = this.track(new THREE.CylinderGeometry(0.12, 0.16, height, 8));
    const poleMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: 0.6, metalness: 0.5 }),
    );
    const headGeo = this.track(new THREE.SphereGeometry(0.28, 12, 12));
    const headMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xfff2c0,
        emissive: 0xffe08a,
        emissiveIntensity: 0.8,
        roughness: 0.4,
      }),
    );

    const positions: Array<[number, number]> = [];
    // Place lights along each road line at fixed spacing.
    const perRoad = Math.floor(size / spacing);
    for (let i = 0; i <= blocks; i++) {
      const roadCoord = -half + i * cell - roadWidth / 2;
      for (let j = 0; j < perRoad; j++) {
        const along = -half + j * spacing + spacing / 2;
        positions.push([roadCoord, along]);
        positions.push([along, roadCoord]);
      }
    }

    const poles = new THREE.InstancedMesh(poleGeo, poleMat, positions.length);
    const heads = new THREE.InstancedMesh(headGeo, headMat, positions.length);
    poles.name = 'StreetlightPoles';
    heads.name = 'StreetlightHeads';
    const dummy = new THREE.Object3D();
    positions.forEach(([x, z], i) => {
      dummy.position.set(x, height / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, height + 0.1, z);
      dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    this.group.add(poles, heads);
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
    this.group.clear();
  }
}
