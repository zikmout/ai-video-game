import * as THREE from 'three';

/**
 * A procedural pedestrian: a simple bipedal figure built from primitives, with
 * limbs exposed so the crowd system can animate a walk cycle. A stylised
 * placeholder for a future AI-generated, rigged character (see docs/AI_ASSETS.md).
 *
 * The figure stands on y=0 (feet at ground). Body parts are returned so the
 * animator can swing arms/legs without re-querying the hierarchy each frame.
 */
export interface PedestrianModel {
  group: THREE.Group;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
}

const SKIN = [0xf0c8a0, 0xe0a878, 0xc68642, 0x8d5524, 0xffe0bd];
const SHIRT = [0x2e6f9e, 0xb23b3b, 0x2fa84f, 0xe0a12e, 0x6a4c93, 0x333840, 0x16a3a3, 0xdddddd];
const PANTS = [0x33373d, 0x24435c, 0x5a4632, 0x2b2b2b, 0x556070];

/** Deterministic-ish pick using a provided 0..1 value. */
const pick = <T>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length] as T;

export function makePedestrian(rng: () => number): PedestrianModel {
  const group = new THREE.Group();
  group.name = 'Pedestrian';

  const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN, rng()), roughness: 0.8 });
  const shirt = new THREE.MeshStandardMaterial({ color: pick(SHIRT, rng()), roughness: 0.75 });
  const pants = new THREE.MeshStandardMaterial({ color: pick(PANTS, rng()), roughness: 0.8 });

  // Slight height variation.
  const scale = 0.92 + rng() * 0.2;
  group.scale.setScalar(scale);

  // Torso.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 8), shirt);
  torso.position.y = 1.05;
  torso.castShadow = true;
  group.add(torso);

  // Head.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), skin);
  head.position.y = 1.5;
  head.castShadow = true;
  group.add(head);

  // Arms (pivot at shoulder). We offset the geometry down so rotation swings
  // the arm about the shoulder, not the centre.
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.42, 4, 6);
  armGeo.translate(0, -0.24, 0);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.27, 1.28, 0);
  armL.castShadow = true;
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.27, 1.28, 0);
  armR.castShadow = true;
  group.add(armL, armR);

  // Legs (pivot at hip).
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 6);
  legGeo.translate(0, -0.3, 0);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.11, 0.85, 0);
  legL.castShadow = true;
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.11, 0.85, 0);
  legR.castShadow = true;
  group.add(legL, legR);

  return { group, legL, legR, armL, armR };
}
