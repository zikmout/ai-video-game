import * as THREE from 'three';

/**
 * A procedural light aircraft built from primitives — a stylised placeholder
 * for a future AI-generated mesh. Local axes match the car: +X right, +Y up,
 * -Z forward. The model rests so its wheels touch y≈0.
 *
 * The propeller is exposed so the controller can spin it with the throttle.
 */
export interface PlaneModel {
  group: THREE.Group;
  propeller: THREE.Mesh;
  /** Half-extents of the fuselage+wing volume used for coarse collision. */
  halfExtents: THREE.Vector3;
}

export function makePlane(color = 0xe8e2d4): PlaneModel {
  const group = new THREE.Group();
  group.name = 'Plane';

  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xd23b3b, roughness: 0.5, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a2530,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.75,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14181c, roughness: 0.8 });

  const rideHeight = 1.0; // fuselage centreline above ground

  // Fuselage: a capsule-ish body from a stretched cylinder, nose to tail.
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.4, 6.2, 12), paint);
  fuselage.rotation.x = Math.PI / 2; // axis along Z
  fuselage.position.y = rideHeight;
  fuselage.castShadow = true;
  group.add(fuselage);

  // Nose cone + engine cowl.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 12), accent);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, rideHeight, -3.5);
  group.add(nose);

  // Cockpit canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), glass);
  canopy.scale.set(0.9, 0.7, 1.4);
  canopy.position.set(0, rideHeight + 0.45, -1.2);
  group.add(canopy);

  // High wing across the fuselage.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.16, 1.6), paint);
  wing.position.set(0, rideHeight + 0.55, -0.9);
  wing.castShadow = true;
  group.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 1.6), accent);
  wingTipL.position.set(-4.6, rideHeight + 0.55, -0.9);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 4.6;
  group.add(wingTipL, wingTipR);

  // Tail: vertical fin + horizontal stabiliser.
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.3, 1.1), accent);
  fin.position.set(0, rideHeight + 0.75, 2.75);
  group.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.9), paint);
  stab.position.set(0, rideHeight + 0.25, 2.8);
  group.add(stab);

  // Propeller: two blades on a spinner, at the nose tip.
  const propeller = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.24, 0.08), dark);
  propeller.position.set(0, rideHeight, -3.98);
  group.add(propeller);

  // Fixed landing gear: two mains + tail wheel.
  const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6);
  const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12);
  for (const x of [-1.1, 1.1]) {
    const leg = new THREE.Mesh(legGeo, dark);
    leg.position.set(x, 0.55, -1.6);
    group.add(leg);
    const wheel = new THREE.Mesh(wheelGeo, dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.28, -1.6);
    group.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, 0.16, 2.9);
  group.add(tailWheel);

  return {
    group,
    propeller,
    halfExtents: new THREE.Vector3(4.6, 1.1, 4.0),
  };
}
