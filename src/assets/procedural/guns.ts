import * as THREE from 'three';

/**
 * Procedural handheld weapon models. Each factory returns a group oriented with
 * the barrel along +Z (the player's local forward), sized to sit in/on the
 * player's right hand. The source experiment was called out for guns not
 * appearing in hand — these make the equipped weapon visible.
 */
export type WeaponKind = 'pistol' | 'smg' | 'bazooka';

const gunMetal = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.45, metalness: 0.7 });
const gunGrip = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.8 });
const tubeGreen = new THREE.MeshStandardMaterial({ color: 0x3d4a2e, roughness: 0.7 });

export function makeGun(kind: WeaponKind): THREE.Group {
  const g = new THREE.Group();
  g.name = `Gun_${kind}`;

  if (kind === 'pistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.26), gunMetal);
    slide.position.set(0, 0.04, 0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.07), gunGrip);
    grip.position.set(0, -0.06, -0.02);
    grip.rotation.x = 0.25;
    g.add(slide, grip);
  } else if (kind === 'smg') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.42), gunMetal);
    body.position.set(0, 0.03, 0.12);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.06), gunMetal);
    mag.position.set(0, -0.1, 0.06);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.16), gunGrip);
    stock.position.set(0, 0.02, -0.14);
    g.add(body, mag, stock);
  } else {
    // Bazooka: a fat shoulder tube.
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.95, 12), tubeGreen);
    tube.rotation.x = Math.PI / 2;
    tube.position.set(0, 0.08, 0.1);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.14, 12), gunMetal);
    muzzle.rotation.x = Math.PI / 2;
    muzzle.position.set(0, 0.08, 0.62);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), gunGrip);
    grip.position.set(0, -0.06, 0.15);
    g.add(tube, muzzle, grip);
  }

  g.traverse((o) => {
    (o as THREE.Mesh).castShadow = true;
  });
  return g;
}
