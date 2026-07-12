import * as THREE from 'three';
import { GameConfig } from '@/config/gameConfig';

/**
 * Engine owns the Three.js rendering stack: the `WebGLRenderer`, the active
 * scene and camera, and window-resize handling. It is intentionally game-
 * agnostic — it renders whatever scene/camera it is given.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;

  private resizeObserver?: ResizeObserver;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, GameConfig.renderer.maxPixelRatio));
    this.renderer.setClearColor(GameConfig.renderer.clearColor);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0; // focusable so it can receive/keep input focus
    container.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(
      GameConfig.renderer.fogColor,
      GameConfig.renderer.fogNear,
      GameConfig.renderer.fogFar,
    );

    this.camera = new THREE.PerspectiveCamera(
      GameConfig.camera.fov,
      1,
      GameConfig.camera.near,
      GameConfig.camera.far,
    );
    this.camera.position.set(0, 5, 12);

    this.resize(container.clientWidth, container.clientHeight);
    this.observeResize(container);
  }

  private observeResize(container: HTMLElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.resize(container.clientWidth, container.clientHeight);
    });
    this.resizeObserver.observe(container);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
