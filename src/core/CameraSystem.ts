import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from '../player/FlightController';

export type CameraMode = 'third_person' | 'first_person';

/**
 * CameraSystem — dual-mode camera with smooth transitions.
 *
 * Third-person: Spring-damper follow behind and above the player.
 * First-person: Camera at player position, looking along player forward.
 * V key toggles with 0.4s smooth interpolation.
 */
export class CameraSystem {
  readonly camera: THREE.PerspectiveCamera;
  private mode: CameraMode = 'third_person';
  private transitioning = false;
  private transitionProgress = 0;

  private currentLookAt = new THREE.Vector3();

  // Screen shake
  private shakeIntensity = 0;
  private shakeTimer = 0;

  // Snapshot of camera state when transition starts
  private transitionStartPos = new THREE.Vector3();
  private transitionStartLookAt = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  isTransitioning(): boolean {
    return this.transitioning;
  }

  toggleMode(): void {
    if (this.transitioning) return;
    // Snapshot current actual camera state before switching
    this.transitionStartPos.copy(this.camera.position);
    this.transitionStartLookAt.copy(this.currentLookAt);

    this.mode = this.mode === 'third_person' ? 'first_person' : 'third_person';
    this.transitioning = true;
    this.transitionProgress = 0;
  }

  update(dt: number, flight: FlightController): void {
    const cfg = CONFIG.camera;
    const playerPos = flight.position;
    const playerQuat = flight.quaternion;

    // Third-person: offset behind and above in player's local frame
    const thirdOffset = new THREE.Vector3(0, cfg.thirdPersonHeight, cfg.thirdPersonDistance);
    thirdOffset.applyQuaternion(playerQuat);
    const thirdTarget = playerPos.clone().add(thirdOffset);
    const thirdLookAt = playerPos.clone();

    // Derive forward direction from player quaternion (local -Z = forward)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerQuat);

    // First-person: at eye level, looking forward
    const eyeOffset = new THREE.Vector3(0, 1.0, 0);
    const firstTarget = playerPos.clone().add(eyeOffset);
    const firstLookAt = firstTarget.clone().add(forward.multiplyScalar(10));

    // Handle transition
    if (this.transitioning) {
      this.transitionProgress += dt / cfg.transitionDuration;
      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.transitioning = false;
      }
    }

    const t = this.transitioning ? this.easeInOut(this.transitionProgress) : 1;

    let targetPos: THREE.Vector3;
    let lookAt: THREE.Vector3;

    if (this.mode === 'third_person') {
      if (this.transitioning) {
        targetPos = this.transitionStartPos.clone().lerp(thirdTarget, t);
        lookAt = this.transitionStartLookAt.clone().lerp(thirdLookAt, t);
      } else {
        targetPos = thirdTarget;
        lookAt = thirdLookAt;
      }
    } else {
      if (this.transitioning) {
        targetPos = this.transitionStartPos.clone().lerp(firstTarget, t);
        lookAt = this.transitionStartLookAt.clone().lerp(firstLookAt, t);
      } else {
        targetPos = firstTarget;
        lookAt = firstLookAt;
      }
    }

    // Spring-damper follow (smooths out jitter in third-person)
    if (this.mode === 'third_person' && !this.transitioning) {
      const stiffness = cfg.springStiffness;
      const damping = cfg.springDamping;
      const diff = targetPos.clone().sub(this.camera.position);
      const springForce = diff.multiplyScalar(stiffness * dt);
      this.camera.position.add(springForce);
      this.currentLookAt.lerp(lookAt, Math.min(1, damping * dt));
      this.camera.lookAt(this.currentLookAt);
    } else if (this.mode === 'first_person' && !this.transitioning) {
      // First-person: direct quaternion
      this.camera.position.copy(targetPos);
      this.camera.quaternion.copy(playerQuat);
      this.currentLookAt.copy(firstLookAt);
    } else {
      // During transition: direct placement
      this.camera.position.copy(targetPos);
      this.camera.lookAt(lookAt);
      this.currentLookAt.copy(lookAt);
    }

    // Apply screen shake
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const factor = this.shakeTimer > 0 ? this.shakeIntensity * (this.shakeTimer / 0.15) : 0;
      this.camera.position.x += (Math.random() - 0.5) * factor * 2;
      this.camera.position.y += (Math.random() - 0.5) * factor * 2;
    }

    // Dynamic FOV — widen when boosting or dashing for speed sensation
    const baseFov: number = cfg.fov;
    const boostFov = baseFov + 12;
    const dashFov = baseFov + 8;
    let targetFov: number = baseFov;
    if (flight.getBoostState().active) targetFov = boostFov;
    else if (flight.dashing) targetFov = dashFov;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();
  }

  private easeInOut(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  /** Trigger a screen shake */
  shake(intensity = 0.5, duration = 0.15): void {
    this.shakeIntensity = intensity;
    this.shakeTimer = duration;
  }

  /** Instantly snap camera to follow target — no spring delay. Use after teleport/level change. */
  snapTo(flight: FlightController): void {
    const cfg = CONFIG.camera;
    const offset = new THREE.Vector3(0, cfg.thirdPersonHeight, cfg.thirdPersonDistance);
    offset.applyQuaternion(flight.quaternion);
    this.camera.position.copy(flight.position).add(offset);
    this.currentLookAt.copy(flight.position);
    this.camera.lookAt(this.currentLookAt);
    this.transitioning = false;
  }

  dispose(): void {}
}
