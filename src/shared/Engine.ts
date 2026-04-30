import * as THREE from 'three';

export interface EngineConfig {
  fogColor: number;
  fogDensity: number;
  fov: number;
  near: number;
  far: number;
  cameraY: number;
  cameraZ: number;
}

/**
 * Engine — owns scene, camera, renderer and main loop.
 * Systems register update callbacks.
 */
export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly clock: THREE.Clock;

  private readonly updaters: Array<(dt: number, elapsed: number) => void> = [];
  private rafId: number | null = null;
  private running = false;

  constructor(container: HTMLElement, config: EngineConfig) {
    // Scene + fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(config.fogColor);
    this.scene.fog = new THREE.FogExp2(config.fogColor, config.fogDensity);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      config.fov,
      window.innerWidth / window.innerHeight,
      config.near,
      config.far,
    );
    this.camera.position.set(0, config.cameraY, config.cameraZ);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    window.addEventListener('resize', this.onResize);
  }

  addUpdater(fn: (dt: number, elapsed: number) => void): void {
    this.updaters.push(fn);
  }

  removeUpdater(fn: (dt: number, elapsed: number) => void): void {
    const i = this.updaters.indexOf(fn);
    if (i >= 0) this.updaters.splice(i, 1);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId != null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clock.stop();
  }

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    // clamp dt to prevent jumps after tab unfocus
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;
    for (const fn of this.updaters) fn(dt, elapsed);
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  dispose(): void {
    this.stop();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
