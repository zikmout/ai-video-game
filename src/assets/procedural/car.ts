import * as THREE from 'three';

/**
 * A procedural car model built from primitives — a stylised placeholder for a
 * future AI-generated vehicle mesh. Returns a `THREE.Group` whose local axes
 * are: +X right, +Y up, -Z forward (matching the vehicle controller's forward).
 *
 * Wheels are exposed on `userData.wheels` so the controller can spin/steer them.
 * The body sits so that y=0 is ground level (wheels touch y≈0).
 */
export interface CarModel {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  /** Half-extents (x,y,z) of the body used for collision. */
  halfExtents: THREE.Vector3;
}

const BODY_PALETTE = [
  0xd23b3b, 0x2e6f9e, 0x2fa84f, 0xe0a12e, 0x8e44ad, 0x333840, 0xe8e8e8, 0x16a3a3,
];

export function makeCar(color?: number): CarModel {
  const group = new THREE.Group();
  group.name = 'Car';

  const bodyColor = color ?? BODY_PALETTE[Math.floor(Math.random() * BODY_PALETTE.length)]!;

  const paint = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.4, metalness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x1a2530,
    roughness: 0.15,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
  });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.6 });

  // Dimensions (metres).
  const length = 4.2;
  const width = 1.9;
  const wheelRadius = 0.36;
  const chassisHeight = 0.55;
  const chassisY = wheelRadius + chassisHeight / 2 - 0.05;

  // Lower body.
  const lower = new THREE.Mesh(new THREE.BoxGeometry(width, chassisHeight, length), paint);
  lower.position.y = chassisY;
  lower.castShadow = true;
  lower.receiveShadow = true;
  group.add(lower);

  // Cabin (greenhouse), shorter and set back a touch.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(width * 0.86, 0.5, length * 0.46), paint);
  cabin.position.set(0, chassisY + chassisHeight / 2 + 0.22, -0.1);
  cabin.castShadow = true;
  group.add(cabin);

  // Windows band around the cabin.
  const windowBand = new THREE.Mesh(
    new THREE.BoxGeometry(width * 0.88, 0.34, length * 0.48),
    glass,
  );
  windowBand.position.copy(cabin.position);
  windowBand.position.y -= 0.02;
  group.add(windowBand);

  // Headlights / taillights.
  const lightGeo = new THREE.BoxGeometry(0.28, 0.16, 0.06);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d0,
    emissive: 0xfff0b0,
    emissiveIntensity: 0.6,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x7a1010,
    emissive: 0xff2b2b,
    emissiveIntensity: 0.5,
  });
  for (const x of [-width / 2 + 0.35, width / 2 - 0.35]) {
    const head = new THREE.Mesh(lightGeo, headMat);
    head.position.set(x, chassisY, -length / 2 + 0.02);
    group.add(head);
    const tail = new THREE.Mesh(lightGeo, tailMat);
    tail.position.set(x, chassisY, length / 2 - 0.02);
    group.add(tail);
  }

  // Wheels: front-left, front-right, rear-left, rear-right.
  const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.3, 16);
  const wheels: THREE.Mesh[] = [];
  const wx = width / 2 - 0.05;
  const wz = length / 2 - 1.0;
  const wheelPositions: Array<[number, number]> = [
    [-wx, -wz],
    [wx, -wz],
    [-wx, wz],
    [wx, wz],
  ];
  for (const [x, z] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2; // align cylinder axis with X
    wheel.position.set(x, wheelRadius, z);
    wheel.castShadow = true;
    // Hubcap.
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 8), trim);
    hub.rotation.z = Math.PI / 2;
    wheel.add(hub);
    group.add(wheel);
    wheels.push(wheel);
  }

  group.userData.wheels = wheels;

  return {
    group,
    wheels,
    halfExtents: new THREE.Vector3(width / 2, (wheelRadius + chassisHeight) / 2 + 0.3, length / 2),
  };
}
