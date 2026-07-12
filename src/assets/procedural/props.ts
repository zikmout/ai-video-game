import * as THREE from 'three';

/**
 * Procedural street props, described as instancing-friendly *part lists*.
 *
 * A prop (palm, bench, …) is a set of parts, each pairing a shared geometry +
 * material with the part's local transform at unit scale. The city collects
 * every placement of a prop type, then renders each part as ONE InstancedMesh
 * across all placements — a whole city of palms costs 11 draw calls instead of
 * 11 per tree.
 *
 * These are placeholders for future AI-generated meshes (see docs/AI_ASSETS.md);
 * the world code that places props won't change when real models arrive.
 */

export type PropType = 'palm' | 'bench' | 'hydrant' | 'bin';

export interface PropPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Local transform of this part within the prop, at unit prop scale. */
  matrix: THREE.Matrix4;
}

// ── Shared material/geometry cache ──────────────────────────────────────────
const cache = new Map<string, THREE.Material | THREE.BufferGeometry>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key) as THREE.Material | undefined;
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key) as THREE.BufferGeometry | undefined;
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

const trunkMat = () => mat('trunk', () => new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9 }));
const leafMat = () => mat('leaf', () => new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.7 }));
const metalDark = () => mat('metalDark', () => new THREE.MeshStandardMaterial({ color: 0x2c3037, roughness: 0.5, metalness: 0.6 }));
const woodMat = () => mat('wood', () => new THREE.MeshStandardMaterial({ color: 0x9c6b3f, roughness: 0.85 }));
const redMat = () => mat('red', () => new THREE.MeshStandardMaterial({ color: 0xb23b2e, roughness: 0.6 }));

function part(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): PropPart {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  return { geometry, material, matrix };
}

/** Palm at unit scale ≈ 6.5 m tall; vary per instance with a uniform scale. */
function palmParts(): PropPart[] {
  const height = 6.5;
  const parts: PropPart[] = [];
  const trunkGeo = geo('palmTrunk', () => new THREE.CylinderGeometry(0.18, 0.28, 1, 6));
  parts.push(part(trunkGeo, trunkMat(), [0, height / 2, 0], [0, 0, 0.05], [1, height, 1]));

  const frondGeo = geo('palmFrond', () => new THREE.ConeGeometry(0.35, 2.6, 4, 1, true));
  const crownY = height - 0.2;
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    parts.push(
      part(
        frondGeo,
        leafMat(),
        [Math.cos(a) * 0.9, crownY, Math.sin(a) * 0.9],
        [0, -a, Math.PI / 2.4],
      ),
    );
  }
  const nutGeo = geo('coconut', () => new THREE.SphereGeometry(0.16, 6, 6));
  const nutOffsets: Array<[number, number]> = [
    [0.14, 0.06],
    [-0.1, 0.15],
    [0.02, -0.16],
  ];
  for (const [nx, nz] of nutOffsets) {
    parts.push(part(nutGeo, trunkMat(), [nx, crownY - 0.1, nz]));
  }
  return parts;
}

/** Park bench: slatted seat + back on metal legs. */
function benchParts(): PropPart[] {
  const parts: PropPart[] = [];
  const slatGeo = geo('benchSlat', () => new THREE.BoxGeometry(1.6, 0.06, 0.12));
  for (let i = 0; i < 3; i++) {
    parts.push(part(slatGeo, woodMat(), [0, 0.45, -0.18 + i * 0.16]));
    parts.push(part(slatGeo, woodMat(), [0, 0.62 + i * 0.14, -0.34], [-0.35, 0, 0]));
  }
  const legGeo = geo('benchLeg', () => new THREE.BoxGeometry(0.08, 0.45, 0.5));
  for (const x of [-0.7, 0.7]) {
    parts.push(part(legGeo, metalDark(), [x, 0.22, -0.2]));
  }
  return parts;
}

function hydrantParts(): PropPart[] {
  return [
    part(
      geo('hydrantBody', () => new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10)),
      redMat(),
      [0, 0.35, 0],
    ),
    part(geo('hydrantCap', () => new THREE.SphereGeometry(0.17, 10, 8)), redMat(), [0, 0.72, 0]),
    part(
      geo('hydrantNozzle', () => new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8)),
      redMat(),
      [0.18, 0.45, 0],
      [0, 0, Math.PI / 2],
    ),
    part(
      geo('hydrantNozzle', () => new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8)),
      redMat(),
      [0, 0.45, 0.18],
      [Math.PI / 2, 0, 0],
    ),
  ];
}

function binParts(): PropPart[] {
  return [
    part(
      geo('binBody', () => new THREE.CylinderGeometry(0.22, 0.18, 0.6, 12)),
      metalDark(),
      [0, 0.3, 0],
    ),
  ];
}

const PART_BUILDERS: Record<PropType, () => PropPart[]> = {
  palm: palmParts,
  bench: benchParts,
  hydrant: hydrantParts,
  bin: binParts,
};

const partCache = new Map<PropType, PropPart[]>();

/** The part list for a prop type (cached; geometries/materials are shared). */
export function getPropParts(type: PropType): PropPart[] {
  let parts = partCache.get(type);
  if (!parts) {
    parts = PART_BUILDERS[type]();
    partCache.set(type, parts);
  }
  return parts;
}

/** Dispose all cached prop geometries/materials (call on teardown). */
export function disposePropCache(): void {
  for (const v of cache.values()) v.dispose();
  cache.clear();
  partCache.clear();
}
