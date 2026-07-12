import * as THREE from 'three';

/**
 * A mission checkpoint beacon: a tall translucent cylinder of light over a
 * ground ring, pulsing gently so it reads from far away (additive blending
 * keeps it luminous through fog and at night).
 *
 * One marker instance is reused across objectives — move it with `moveTo`,
 * recolour with `setColor`, and toggle with `visible`. Cheap enough to keep in
 * the scene permanently.
 */
export class MissionMarker {
  readonly object: THREE.Group;

  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly beam: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private pulse = 0;

  constructor(radius: number, color: number) {
    this.object = new THREE.Group();
    this.object.name = 'MissionMarker';

    this.beamMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.CylinderGeometry(radius, radius, 14, 24, 1, true);
    this.beam = new THREE.Mesh(beamGeo, this.beamMaterial);
    this.beam.position.y = 7;
    this.object.add(this.beam);

    this.ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringGeo = new THREE.RingGeometry(radius * 0.75, radius, 32);
    this.ring = new THREE.Mesh(ringGeo, this.ringMaterial);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.object.add(this.ring);

    this.object.visible = false;
  }

  get visible(): boolean {
    return this.object.visible;
  }

  set visible(v: boolean) {
    this.object.visible = v;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  moveTo(x: number, z: number): void {
    this.object.position.set(x, 0, z);
  }

  setColor(color: number): void {
    this.beamMaterial.color.setHex(color);
    this.ringMaterial.color.setHex(color);
  }

  /** Gentle breathing pulse; call every frame while visible. */
  update(dt: number): void {
    if (!this.object.visible) return;
    this.pulse += dt * 2.2;
    const s = 1 + Math.sin(this.pulse) * 0.08;
    this.ring.scale.setScalar(s);
    this.beamMaterial.opacity = 0.22 + (Math.sin(this.pulse) + 1) * 0.06;
  }

  dispose(): void {
    this.beam.geometry.dispose();
    this.ring.geometry.dispose();
    this.beamMaterial.dispose();
    this.ringMaterial.dispose();
  }
}
