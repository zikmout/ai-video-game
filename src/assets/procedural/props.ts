import * as THREE from 'three';

/**
 * Procedural street props built from primitives. Each factory returns a fresh
 * `THREE.Group` positioned at the origin; callers place/rotate it. Geometries
 * and materials are shared per-factory via a small cache so a city full of palms
 * doesn't allocate thousands of duplicate buffers.
 *
 * These are placeholders for future AI-generated meshes (see docs/AI_ASSETS.md);
 * the world code that places props won't change when real models arrive.
 */

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

/** A palm tree: segmented trunk + a crown of angled fronds. */
export function makePalmTree(height = 6): THREE.Group {
  const g = new THREE.Group();
  g.name = 'PalmTree';

  const trunkGeo = geo('palmTrunk', () => new THREE.CylinderGeometry(0.18, 0.28, 1, 6));
  const trunk = new THREE.Mesh(trunkGeo, trunkMat());
  trunk.scale.y = height;
  trunk.position.y = height / 2;
  trunk.castShadow = true;
  // Gentle lean.
  trunk.rotation.z = (Math.random() - 0.5) * 0.12;
  g.add(trunk);

  const frondGeo = geo('palmFrond', () => new THREE.ConeGeometry(0.35, 2.6, 4, 1, true));
  const crownY = height - 0.2;
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    const frond = new THREE.Mesh(frondGeo, leafMat());
    const a = (i / fronds) * Math.PI * 2;
    frond.position.set(Math.cos(a) * 0.9, crownY, Math.sin(a) * 0.9);
    frond.rotation.z = Math.PI / 2.4;
    frond.rotation.y = -a;
    frond.castShadow = true;
    g.add(frond);
  }
  // Coconut cluster.
  const nutGeo = geo('coconut', () => new THREE.SphereGeometry(0.16, 6, 6));
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(nutGeo, trunkMat());
    nut.position.set((Math.random() - 0.5) * 0.4, crownY - 0.1, (Math.random() - 0.5) * 0.4);
    g.add(nut);
  }
  return g;
}

/** A park bench: slatted seat + back on metal legs. */
export function makeBench(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Bench';
  const slatGeo = geo('benchSlat', () => new THREE.BoxGeometry(1.6, 0.06, 0.12));
  for (let i = 0; i < 3; i++) {
    const seat = new THREE.Mesh(slatGeo, woodMat());
    seat.position.set(0, 0.45, -0.18 + i * 0.16);
    seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(slatGeo, woodMat());
    back.position.set(0, 0.62 + i * 0.14, -0.34);
    back.rotation.x = -0.35;
    g.add(back);
  }
  const legGeo = geo('benchLeg', () => new THREE.BoxGeometry(0.08, 0.45, 0.5));
  for (const x of [-0.7, 0.7]) {
    const leg = new THREE.Mesh(legGeo, metalDark());
    leg.position.set(x, 0.22, -0.2);
    leg.castShadow = true;
    g.add(leg);
  }
  return g;
}

/** A fire hydrant. */
export function makeHydrant(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'Hydrant';
  const body = new THREE.Mesh(
    geo('hydrantBody', () => new THREE.CylinderGeometry(0.16, 0.2, 0.7, 10)),
    redMat(),
  );
  body.position.y = 0.35;
  body.castShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(geo('hydrantCap', () => new THREE.SphereGeometry(0.17, 10, 8)), redMat());
  cap.position.y = 0.72;
  g.add(cap);
  const nozzleGeo = geo('hydrantNozzle', () => new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8));
  for (const [x, z, ry] of [[0.18, 0, Math.PI / 2] as const, [0, 0.18, 0] as const]) {
    const n = new THREE.Mesh(nozzleGeo, redMat());
    n.position.set(x, 0.45, z);
    n.rotation.z = ry === Math.PI / 2 ? Math.PI / 2 : 0;
    n.rotation.x = ry === 0 ? Math.PI / 2 : 0;
    g.add(n);
  }
  return g;
}

/** A simple trash bin. */
export function makeTrashBin(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'TrashBin';
  const body = new THREE.Mesh(
    geo('binBody', () => new THREE.CylinderGeometry(0.22, 0.18, 0.6, 12)),
    metalDark(),
  );
  body.position.y = 0.3;
  body.castShadow = true;
  g.add(body);
  return g;
}

/** Dispose all cached prop geometries/materials (call on teardown). */
export function disposePropCache(): void {
  for (const v of cache.values()) v.dispose();
  cache.clear();
}
