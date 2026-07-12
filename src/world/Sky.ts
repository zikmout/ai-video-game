import * as THREE from 'three';

/**
 * A gradient sky dome.
 *
 * Rather than a flat cartoon colour (the first thing the source experiment
 * flagged as ugly), this renders a vertical gradient from horizon to zenith on
 * the inside of a large sphere, with a soft sun glow. It's cheap, seam-free, and
 * a clean seam for later swapping in an HDRI / AI-generated skybox.
 */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(radius = 900) {
    const geometry = new THREE.SphereGeometry(radius, 32, 16);

    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2b6fb0) },
        horizonColor: { value: new THREE.Color(0xbfe0f5) },
        bottomColor: { value: new THREE.Color(0xcfd6dc) },
        sunDirection: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() },
        sunColor: { value: new THREE.Color(0xfff3d6) },
        offset: { value: 0.05 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vWorldDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vWorldDir;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        uniform float offset;

        void main() {
          float h = normalize(vWorldDir).y;
          // Sky: blend horizon -> top for h in [0, 1].
          vec3 upper = mix(horizonColor, topColor, clamp(pow(max(h + offset, 0.0), 0.55), 0.0, 1.0));
          // Ground haze below the horizon.
          vec3 lower = mix(horizonColor, bottomColor, clamp(-h * 3.0, 0.0, 1.0));
          vec3 color = h > 0.0 ? upper : lower;

          // Sun glow.
          float sun = max(dot(normalize(vWorldDir), normalize(sunDirection)), 0.0);
          color += sunColor * pow(sun, 220.0) * 1.2;        // disc
          color += sunColor * pow(sun, 12.0) * 0.20;        // halo

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    this.material = material;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Sky';
    // Render behind everything; never culled by frustum.
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;
  }

  /** Keep the dome centred on the camera so it never appears to move. */
  update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  /** Set the three gradient colours (used by the day/night cycle). */
  setColors(top: THREE.Color, horizon: THREE.Color, bottom: THREE.Color): void {
    (this.material.uniforms.topColor!.value as THREE.Color).copy(top);
    (this.material.uniforms.horizonColor!.value as THREE.Color).copy(horizon);
    (this.material.uniforms.bottomColor!.value as THREE.Color).copy(bottom);
  }

  /** Point the sun glow along a world-space direction. */
  setSunDirection(dir: THREE.Vector3): void {
    (this.material.uniforms.sunDirection!.value as THREE.Vector3).copy(dir).normalize();
  }

  /** Tint the sun disc/halo (warmer at dawn/dusk). */
  setSunColor(color: THREE.Color): void {
    (this.material.uniforms.sunColor!.value as THREE.Color).copy(color);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
