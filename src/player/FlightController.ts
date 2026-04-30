import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Input } from '../shared/Input';

/**
 * FlightController — 6DOF physics flight with thrust, drag, angular velocity.
 * Uses quaternion-based orientation for gimbal-lock-free rotation.
 *
 * Per-frame:
 * 1. Collect input → 6 thrust axes + 3 rotation axes
 * 2. Apply thrust in local frame → convert to world acceleration
 * 3. Integrate velocity (with drag) → position
 * 4. Apply angular thrust → angular velocity → quaternion rotation
 * 5. Boundary/height clamping
 */
export class FlightController {
  readonly position = new THREE.Vector3(0, CONFIG.player.startHeight, 0);
  readonly velocity = new THREE.Vector3();
  readonly quaternion = new THREE.Quaternion();
  readonly angularVelocity = new THREE.Vector3();

  hp: number = CONFIG.player.maxHealth;
  spirit: number = CONFIG.spirit.maxSpirit;
  alive = true;

  private boostActive = false;
  private boostTimer = 0;
  private boostCooldownTimer = 0;

  dashing = false;
  dashInvincible = false;

  // ─── Sword Intent ───
  swordIntent = 0;
  private intentDecayTimer = 0;

  // ─── Parry ───
  parrying = false;
  private parryTimer = 0;

  // ─── Dash (for skill system) ───
  private dashTimer = 0;
  private dashDirection = new THREE.Vector3();

  private readonly mouseSens = 0.002;

  constructor(private readonly input: Input) {}

  getForward(): THREE.Vector3 {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
  }

  getRight(): THREE.Vector3 {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(this.quaternion);
  }

  getUp(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.quaternion);
  }

  getSpeed(): number {
    return this.velocity.length();
  }

  getAltitude(): number {
    return this.position.y;
  }

  tryBoost(): boolean {
    if (this.boostActive || this.boostCooldownTimer > 0) return false;
    this.boostActive = true;
    this.boostTimer = CONFIG.flight.boostDuration;
    return true;
  }

  consumeSpirit(amount: number): boolean {
    if (this.spirit < amount) return false;
    this.spirit -= amount;
    return true;
  }

  addSwordIntent(amount: number): void {
    this.swordIntent = Math.min(CONFIG.skills.swordIntent.maxStacks, this.swordIntent + amount);
    this.intentDecayTimer = CONFIG.skills.swordIntent.decayTime;
  }

  consumeSwordIntent(amount: number): boolean {
    if (this.swordIntent < amount) return false;
    this.swordIntent -= amount;
    return true;
  }

  startParry(): void {
    if (this.parrying) return;
    this.parrying = true;
    this.parryTimer = CONFIG.skills.parry.parryWindow;
  }

  endParry(): void {
    this.parrying = false;
    this.parryTimer = 0;
  }

  startDash(direction: THREE.Vector3, duration: number): void {
    this.dashing = true;
    this.dashInvincible = true;
    this.dashDirection.copy(direction);
    this.dashTimer = duration;
  }

  takeDamage(amount: number): boolean {
    if (!this.alive || this.dashInvincible) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (!this.alive) return;

    const cfg = CONFIG.flight;

    // Spirit regen
    this.spirit = Math.min(CONFIG.spirit.maxSpirit, this.spirit + CONFIG.spirit.regenRate * dt);

    // Sword intent decay
    if (this.swordIntent > 0) {
      this.intentDecayTimer -= dt;
      if (this.intentDecayTimer <= 0) {
        this.swordIntent = Math.max(0, this.swordIntent - 1);
        this.intentDecayTimer = CONFIG.skills.swordIntent.decayTime;
      }
    }

    // Parry timer
    if (this.parrying) {
      this.parryTimer -= dt;
      if (this.parryTimer <= 0) {
        this.parrying = false;
        this.parryTimer = 0;
      }
    }

    // Dash movement (skill-driven)
    if (this.dashing && this.dashTimer > 0) {
      const dashSpeed = CONFIG.skills.swordDash.dashDistance / CONFIG.skills.swordDash.dashDuration;
      this.position.addScaledVector(this.dashDirection, dashSpeed * dt);
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) {
        this.dashing = false;
        setTimeout(() => {
          this.dashInvincible = false;
        }, (CONFIG.skills.swordDash.invincibleDuration - CONFIG.skills.swordDash.dashDuration) * 1000);
      }
    }

    // Boost management
    if (this.boostActive) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.boostActive = false;
        this.boostCooldownTimer = cfg.boostCooldown;
      }
    }
    if (this.boostCooldownTimer > 0) {
      this.boostCooldownTimer -= dt;
    }

    const thrustMult = this.boostActive ? cfg.boostMultiplier : 1.0;

    // Collect thrust input (local frame)
    let thrustX = 0,
      thrustY = 0,
      thrustZ = 0;
    if (this.input.isDown('w')) thrustZ -= 1;
    if (this.input.isDown('s')) thrustZ += 1;
    if (this.input.isDown('a')) thrustX -= 1;
    if (this.input.isDown('d')) thrustX += 1;
    if (this.input.isDown(' ')) thrustY += 1;
    if (this.input.isDown('control')) thrustY -= 1;

    const thrustLen = Math.hypot(thrustX, thrustY, thrustZ);
    if (thrustLen > 1) {
      thrustX /= thrustLen;
      thrustY /= thrustLen;
      thrustZ /= thrustLen;
    }

    const localThrust = new THREE.Vector3(thrustX, thrustY, thrustZ);
    localThrust.multiplyScalar(cfg.maxThrust * thrustMult);
    const worldAccel = localThrust.applyQuaternion(this.quaternion);

    // Integrate linear velocity
    this.velocity.add(worldAccel.multiplyScalar(dt));
    this.velocity.multiplyScalar(Math.pow(cfg.drag, dt * 60));

    const speed = this.velocity.length();
    const maxSpd = cfg.maxSpeed * thrustMult;
    if (speed > maxSpd) {
      this.velocity.multiplyScalar(maxSpd / speed);
    }

    this.position.addScaledVector(this.velocity, dt);

    // Rotation from mouse input — direct application, no accumulation
    const { dx, dy } = this.input.consumeMouseDelta();
    // Mouse directly drives yaw/pitch (responsive, no inertia feel)
    const pitchDirect = -dy * this.mouseSens;
    const yawDirect = -dx * this.mouseSens;

    // Q/E roll uses angular velocity with drag
    let rollInput = 0;
    if (this.input.isDown('q')) rollInput += cfg.angularThrust * dt;
    if (this.input.isDown('e')) rollInput -= cfg.angularThrust * dt;
    this.angularVelocity.z += rollInput;
    this.angularVelocity.z *= Math.pow(cfg.angularDrag, dt * 60);

    // Clamp roll angular speed
    this.angularVelocity.z = Math.max(-cfg.maxAngularSpeed, Math.min(cfg.maxAngularSpeed, this.angularVelocity.z));

    // Apply rotation: mouse yaw/pitch directly + roll from angular velocity
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitchDirect);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawDirect);
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.angularVelocity.z * dt);
    const dq = new THREE.Quaternion().multiply(yawQ).multiply(pitchQ).multiply(rollQ);
    this.quaternion.multiply(dq);
    this.quaternion.normalize();

    this.enforceBounds();
  }

  private enforceBounds(): void {
    const cfg = CONFIG.flight;

    if (this.position.y < cfg.minHeight) {
      this.position.y = cfg.minHeight;
      this.velocity.y = Math.max(0, this.velocity.y);
    }
    if (this.position.y > cfg.heightDragStart) {
      const over = this.position.y - cfg.heightDragStart;
      if (over > 0) {
        const factor = 1 - Math.min(0.95, over / (cfg.maxHeight - cfg.heightDragStart));
        this.velocity.y *= factor;
      }
      if (this.position.y > cfg.maxHeight) {
        this.position.y = cfg.maxHeight;
        this.velocity.y = Math.min(0, this.velocity.y);
      }
    }

    const distXZ = Math.hypot(this.position.x, this.position.z);
    const boundaryStart = cfg.boundaryRadius - cfg.boundaryDragWidth;
    if (distXZ > boundaryStart) {
      const penetration = distXZ - boundaryStart;
      const factor = 1 - Math.min(0.95, penetration / cfg.boundaryDragWidth);
      const nx = this.position.x / distXZ;
      const nz = this.position.z / distXZ;
      const outward = this.velocity.x * nx + this.velocity.z * nz;
      if (outward > 0) {
        this.velocity.x -= nx * outward * (1 - factor);
        this.velocity.z -= nz * outward * (1 - factor);
      }
      if (distXZ > cfg.boundaryRadius) {
        this.position.x = nx * cfg.boundaryRadius;
        this.position.z = nz * cfg.boundaryRadius;
      }
    }
  }

  teleportTo(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
  }

  dispose(): void {}
}
