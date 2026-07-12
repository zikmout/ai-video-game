import * as THREE from 'three';
import { Sky } from './Sky';

/**
 * Environment bundles the lighting rig and the sky so the world has consistent,
 * good-looking illumination out of the box.
 *
 * - A hemisphere light gives soft sky/ground ambient.
 * - A directional "sun" casts shadows and defines the key light.
 * - The sky dome provides the backdrop and follows the camera.
 */
export class Environment {
  readonly sky: Sky;
  readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;

  /** Unit direction from the scene toward the sun (set by the day/night cycle). */
  private readonly sunDir = new THREE.Vector3(0.55, 0.7, 0.3).normalize();
  /** Distance the directional light sits from its target. */
  private readonly sunDistance = 240;

  constructor(private readonly scene: THREE.Scene) {
    this.sky = new Sky();
    scene.add(this.sky.mesh);

    // Sky/ground ambient fills shadows with soft daylight.
    this.hemi = new THREE.HemisphereLight(0xcfe8fb, 0x6b7355, 1.1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.6);
    this.sun.position.set(120, 180, 80);
    this.sun.castShadow = true;
    this.configureSunShadow();
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  private configureSunShadow(): void {
    const cam = this.sun.shadow.camera;
    const extent = 140;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 10;
    cam.far = 520;
    cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
  }

  /** Set the sun/hemisphere ambient intensity (day/night cycle). */
  setAmbientIntensity(intensity: number): void {
    this.hemi.intensity = intensity;
  }

  /** Set the world-space direction toward the sun (day/night cycle). */
  setSunDirection(dir: THREE.Vector3): void {
    this.sunDir.copy(dir).normalize();
  }

  /** Set the scene fog colour (day/night cycle). */
  setFogColor(color: THREE.Color): void {
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(color);
  }

  /** Keep the sky centred and the shadow frustum following the focus point. */
  update(cameraPosition: THREE.Vector3, focus: THREE.Vector3): void {
    this.sky.update(cameraPosition);
    // Place the directional light along the sun direction, anchored on the
    // focus so shadows stay crisp near the player.
    this.sun.position.copy(focus).addScaledVector(this.sunDir, this.sunDistance);
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
  }

  dispose(): void {
    this.scene.remove(this.sky.mesh, this.hemi, this.sun, this.sun.target);
    this.sky.dispose();
  }
}
