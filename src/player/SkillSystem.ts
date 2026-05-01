import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from './FlightController';
import type { Sfx } from '../shared/Sfx';

export interface SkillHitResult {
  targetId: number;
  damage: number;
}

export interface EnemyTarget {
  id: number;
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  alive: boolean;
}

export class SkillSystem {
  private bladeFanCd = 0;
  private parrySparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private swordDashCd = 0;
  private parryCd = 0;

  private charging = false;
  chargeTimer = 0;

  readonly blades: Blade[] = [];
  private dashHitIds = new Set<number>();
  private dashHitsThisFrame: number[] = [];

  private targets: EnemyTarget[] = [];
  private damageBonus = 0;

  private beamTrails: Array<{ mesh: THREE.Mesh; timer: number }> = [];
  private parryShield: THREE.Group | null = null;

  constructor(
    private readonly flight: FlightController,
    private readonly scene: THREE.Scene,
    private readonly sfx: Sfx,
  ) {}

  setDamageBonus(bonus: number): void {
    this.damageBonus = bonus;
  }

  setTargets(targets: EnemyTarget[]): void {
    this.targets = targets;
  }

  isCharging(): boolean {
    return this.charging;
  }

  getSwordIntent(): number {
    return this.flight.swordIntent;
  }

  getCooldowns(): { bladeFan: number; swordDash: number; parry: number } {
    return {
      bladeFan: this.bladeFanCd,
      swordDash: this.swordDashCd,
      parry: this.parryCd,
    };
  }

  private scaleDamage(base: number, skill: string): number {
    const level = this.flight.getSkillLevel(skill);
    return Math.floor(base * (1 + level * CONFIG.skills.growth.damagePerLevel) * (1 + this.damageBonus));
  }

  private scaleCooldown(base: number, skill: string): number {
    const level = this.flight.getSkillLevel(skill);
    return Math.max(CONFIG.skills.growth.minCooldown, base * (1 - level * CONFIG.skills.growth.cooldownPerLevel));
  }

  getScaledSwordDashDamage(): number {
    return this.scaleDamage(CONFIG.skills.swordDash.damage, 'swordDash');
  }

  // ─── Skill 1: Blade Fan (Q) ───────────────────────────

  fireBladeFan(): void {
    const cfg = CONFIG.skills.bladeFan;
    if (this.bladeFanCd > 0) return;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return;

    this.bladeFanCd = this.scaleCooldown(cfg.cooldown, 'bladeFan');
    this.sfx.bladeFan();

    const origin = this.flight.position.clone();
    const forward = this.flight.getForward();

    // Collect alive targets for homing
    const aliveTargets = this.targets.filter(t => t.alive);

    for (let i = 0; i < cfg.bladeCount; i++) {
      const angleOffset = (i - (cfg.bladeCount - 1) / 2) * cfg.fanAngle;
      const dir = forward.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), angleOffset).normalize();
      // Assign target: round-robin among alive enemies
      const target = aliveTargets.length > 0 ? aliveTargets[i % aliveTargets.length]! : null;
      this.blades.push(new Blade(origin.clone(), dir, this.scene, target?.position ?? null));
    }
  }

  // ─── Skill 2: Sword Dash (F) ──────────────────────────

  activateSwordDash(): void {
    const cfg = CONFIG.skills.swordDash;
    if (this.swordDashCd > 0) return;
    if (this.flight.dashing) return;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return;

    this.swordDashCd = this.scaleCooldown(cfg.cooldown, 'swordDash');
    this.dashHitIds.clear();
    this.sfx.swordDash();

    const dir = this.flight.getForward();
    this.flight.startDash(dir, cfg.dashDuration);
  }

  // ─── Skill 3: Parry (R) ───────────────────────────────

  activateParry(): void {
    const cfg = CONFIG.skills.parry;
    if (this.parryCd > 0) return;
    if (this.flight.parrying) return;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return;

    this.parryCd = this.scaleCooldown(cfg.cooldown, 'parry');
    this.flight.startParry();
    this.sfx.parryActivate();
    this.showParryShield();
  }

  tryParryReflect(): { reflected: boolean; reflectDamage: number } {
    if (!this.flight.parrying) {
      return { reflected: false, reflectDamage: 0 };
    }
    this.flight.endParry();
    this.flight.addSwordIntent(CONFIG.skills.parry.intentOnSuccess);
    this.sfx.parrySuccess();
    this.flashParrySuccess();
    return { reflected: true, reflectDamage: this.scaleDamage(CONFIG.skills.parry.reflectDamage, 'parry') };
  }

  // ─── Skill 4: Final Strike (Left Click when 5 stacks) ─

  tryFinalStrike(): boolean {
    const cfg = CONFIG.skills.finalStrike;
    if (this.flight.swordIntent < cfg.requiredIntent) return false;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return false;
    if (this.charging) return false;

    this.flight.consumeSwordIntent(cfg.requiredIntent);
    this.charging = true;
    this.chargeTimer = this.scaleCooldown(cfg.chargeTime, 'finalStrike');
    this.sfx.finalStrikeCharge();
    return true;
  }

  releaseFinalStrike(): SkillHitResult[] {
    this.charging = false;
    this.chargeTimer = 0;
    const cfg = CONFIG.skills.finalStrike;
    const results: SkillHitResult[] = [];

    const origin = this.flight.position.clone();
    const dir = this.flight.getForward();

    for (const target of this.targets) {
      if (!target.alive) continue;
      const toTarget = target.position.clone().sub(origin);
      const dist = toTarget.length();
      if (dist > cfg.range) continue;

      const dot = toTarget.dot(dir);
      if (dot < 0) continue;
      const closest = origin.clone().add(dir.clone().multiplyScalar(dot));
      const perpDist = closest.distanceTo(target.position);
      if (perpDist < cfg.beamRadius + 2) {
        results.push({ targetId: target.id, damage: this.scaleDamage(cfg.damage, 'finalStrike') });
      }
    }

    this.sfx.finalStrikeRelease();
    this.showFinalStrikeBeam(origin, dir, cfg.range);
    return results;
  }

  // ─── Normal Beam (Left Click without 5 stacks) ────────

  fireNormalBeam(): SkillHitResult | null {
    const cfg = CONFIG.weapons.beam;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return null;

    this.sfx.shoot();

    const origin = this.flight.position.clone();
    const forward = this.flight.getForward();

    // Auto-target: find nearest alive enemy within forward cone and range
    let closest: EnemyTarget | null = null;
    let closestDist: number = cfg.maxRange;
    for (const target of this.targets) {
      if (!target.alive) continue;
      const d = origin.distanceTo(target.position);
      if (d >= closestDist) continue;
      const toTarget = target.position.clone().sub(origin).normalize();
      if (toTarget.dot(forward) < 0.3) continue;
      closestDist = d;
      closest = target;
    }

    if (closest) {
      const endPoint = closest.position.clone();
      this.showBeamVisual(origin, endPoint);
      return { targetId: closest.id, damage: cfg.damage };
    }

    // No target in range — fire forward into empty space
    const dir = this.flight.getForward();
    const endPoint = origin.clone().add(dir.clone().multiplyScalar(cfg.maxRange));
    this.showBeamVisual(origin, endPoint);
    return null;
  }

  // ─── Update ────────────────────────────────────────────

  update(dt: number): void {
    if (this.bladeFanCd > 0) this.bladeFanCd = Math.max(0, this.bladeFanCd - dt);
    if (this.swordDashCd > 0) this.swordDashCd = Math.max(0, this.swordDashCd - dt);
    if (this.parryCd > 0) this.parryCd = Math.max(0, this.parryCd - dt);

    if (this.charging) {
      this.chargeTimer -= dt;
    }

    // Blade projectiles
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const blade = this.blades[i]!;
      blade.update(dt);

      if (blade.expired) {
        blade.dispose(this.scene);
        this.blades.splice(i, 1);
        continue;
      }

      for (const target of this.targets) {
        if (!target.alive) continue;
        if (blade.checkHit(target.position, CONFIG.skills.bladeFan.projectileRadius + 1.5)) {
          blade.expired = true;
          this.flight.addSwordIntent(CONFIG.skills.bladeFan.intentPerHit);
          this.sfx.hit();
          blade.hitTargetId = target.id;
          break;
        }
      }
    }

    // Dash hit detection
    this.dashHitsThisFrame = [];
    if (this.flight.dashing) {
      const dashCfg = CONFIG.skills.swordDash;
      for (const target of this.targets) {
        if (!target.alive) continue;
        if (this.dashHitIds.has(target.id)) continue;
        const dist = this.flight.position.distanceTo(target.position);
        if (dist < dashCfg.hitRadius + 2) {
          this.dashHitIds.add(target.id);
          this.dashHitsThisFrame.push(target.id);
          this.flight.addSwordIntent(dashCfg.intentPerHit);
          this.sfx.hit();
        }
      }
    }

    // Beam trail timers
    for (let i = this.beamTrails.length - 1; i >= 0; i--) {
      const trail = this.beamTrails[i]!;
      trail.timer -= dt;
      // Fade out
      const mat = trail.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, trail.timer / 0.25) * 0.8;
      if (trail.timer <= 0) {
        this.scene.remove(trail.mesh);
        trail.mesh.geometry.dispose();
        mat.dispose();
        this.beamTrails.splice(i, 1);
      }
    }

    // Parry shield visual
    if (this.parryShield) {
      if (!this.flight.parrying) {
        this.scene.remove(this.parryShield);
        this.parryShield = null;
      } else {
        this.parryShield.position.copy(this.flight.position);
        this.parryShield.rotation.y += dt * 4;
      }
    }

    // Parry spark decay
    for (let i = this.parrySparks.length - 1; i >= 0; i--) {
      const s = this.parrySparks[i]!;
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(0.92);
      const t = Math.max(0, s.life / 0.4);
      s.mesh.scale.setScalar(t);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.parrySparks.splice(i, 1);
      }
    }
  }

  consumeDashHits(): number[] {
    return this.dashHitsThisFrame;
  }

  consumeBladeHits(): SkillHitResult[] {
    const results: SkillHitResult[] = [];
    for (const blade of this.blades) {
      if (blade.hitTargetId >= 0) {
        results.push({ targetId: blade.hitTargetId, damage: this.scaleDamage(CONFIG.skills.bladeFan.damage, 'bladeFan') });
        blade.hitTargetId = -1;
      }
    }
    return results;
  }

  // ─── Visuals ───────────────────────────────────────────

  private showBeamVisual(start: THREE.Vector3, end: THREE.Vector3): void {
    // Quadratic bezier — control point offset sideways/upward for arc
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    // Random lateral + upward offset for organic arc feel
    const right = new THREE.Vector3().crossVectors(
      end.clone().sub(start).normalize(),
      new THREE.Vector3(0, 1, 0),
    ).normalize();
    const arcHeight = dist * (0.15 + Math.random() * 0.1);
    const lateralOffset = dist * (Math.random() - 0.5) * 0.12;
    const control = mid.clone()
      .addScaledVector(new THREE.Vector3(0, 1, 0), arcHeight)
      .addScaledVector(right, lateralOffset);

    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    const segments = Math.max(12, Math.floor(dist / 3));
    const geo = new THREE.TubeGeometry(curve, segments, 0.08, 4, false);
    const mat = new THREE.MeshBasicMaterial({
      color: CONFIG.weapons.beam.color,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.beamTrails.push({ mesh, timer: 0.25 });
  }

  private showFinalStrikeBeam(origin: THREE.Vector3, dir: THREE.Vector3, range: number): void {
    const cfg = CONFIG.skills.finalStrike;
    const end = origin.clone().add(dir.clone().multiplyScalar(range));

    // Dramatic wide arc for ultimate beam
    const mid = origin.clone().add(end).multiplyScalar(0.5);
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const control = mid.clone()
      .addScaledVector(new THREE.Vector3(0, 1, 0), range * 0.08)
      .addScaledVector(right, range * 0.03);

    const curve = new THREE.QuadraticBezierCurve3(origin, control, end);
    const geo = new THREE.TubeGeometry(curve, 32, cfg.beamRadius, 8, false);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.beamTrails.push({ mesh, timer: cfg.beamDuration });
  }

  private showParryShield(): void {
    if (this.parryShield) {
      this.scene.remove(this.parryShield);
    }
    this.parryShield = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: CONFIG.skills.parry.color, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const swordGeo = new THREE.BoxGeometry(0.1, 0.8, 0.05);
      const sword = new THREE.Mesh(swordGeo, mat);
      sword.position.set(Math.cos(angle) * 2, Math.sin(angle) * 2, 0);
      sword.rotation.z = angle;
      this.parryShield.add(sword);
    }
    const ringGeo = new THREE.RingGeometry(1.8, 2.2, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: CONFIG.skills.parry.color, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    this.parryShield.add(new THREE.Mesh(ringGeo, ringMat));
    this.parryShield.position.copy(this.flight.position);
    this.scene.add(this.parryShield);
  }

  private flashParrySuccess(): void {
    if (this.parryShield) {
      this.parryShield.scale.setScalar(3);
      setTimeout(() => {
        if (this.parryShield) {
          this.scene.remove(this.parryShield);
          this.parryShield = null;
        }
      }, 150);
    }

    // Spark burst at player position
    const pos = this.flight.position;
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffee44, transparent: true, opacity: 1, depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.renderOrder = 999;
      this.scene.add(mesh);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(12 + Math.random() * 8);
      this.parrySparks.push({ mesh, vel, life: 0.4 });
    }
  }

  // ─── Dispose ───────────────────────────────────────────

  dispose(): void {
    for (const b of this.blades) b.dispose(this.scene);
    for (const trail of this.beamTrails) {
      this.scene.remove(trail.mesh);
      trail.mesh.geometry.dispose();
      (trail.mesh.material as THREE.Material).dispose();
    }
    this.beamTrails = [];
    if (this.parryShield) {
      this.scene.remove(this.parryShield);
    }
  }
}

// ─── Blade Projectile ────────────────────────────────────

class Blade {
  readonly mesh: THREE.Mesh;
  private velocity: THREE.Vector3;
  private targetPos: THREE.Vector3 | null;
  private distanceTraveled = 0;
  private readonly trackingLerp = 5;
  expired = false;
  hitTargetId = -1;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, scene: THREE.Scene, targetPos: THREE.Vector3 | null) {
    const cfg = CONFIG.skills.bladeFan;
    this.velocity = direction.clone().multiplyScalar(cfg.projectileSpeed);
    this.targetPos = targetPos;

    const geo = new THREE.BoxGeometry(0.8, 0.1, 0.3);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.8 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    this.mesh.lookAt(origin.clone().add(direction));
    scene.add(this.mesh);
  }

  update(dt: number): void {
    // Homing: steer toward target
    if (this.targetPos && this.distanceTraveled > 3) {
      const toTarget = this.targetPos.clone().sub(this.mesh.position).normalize();
      const currentDir = this.velocity.clone().normalize();
      currentDir.lerp(toTarget, Math.min(1, this.trackingLerp * dt));
      currentDir.normalize();
      this.velocity.copy(currentDir).multiplyScalar(CONFIG.skills.bladeFan.projectileSpeed);
    }

    const step = this.velocity.clone().multiplyScalar(dt);
    this.mesh.position.add(step);
    this.distanceTraveled += step.length();
    if (this.distanceTraveled > CONFIG.skills.bladeFan.range) {
      this.expired = true;
    }
    this.mesh.rotation.z += dt * 10;
    // Face movement direction
    const ahead = this.mesh.position.clone().add(this.velocity);
    this.mesh.lookAt(ahead);
  }

  checkHit(targetPos: THREE.Vector3, radius: number): boolean {
    return this.mesh.position.distanceTo(targetPos) < radius;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
