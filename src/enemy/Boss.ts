import * as THREE from 'three';
import { CONFIG } from '../config';

export type BossPhase = 1 | 2 | 3;

export class Boss {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly id: number;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  hp: number;
  maxHp: number;
  alive = true;
  phase: BossPhase = 1;

  private bodyMat: THREE.MeshStandardMaterial;
  private readonly bodyColor: number;
  private shieldMesh: THREE.Mesh | null = null;
  private shieldHp = 0;
  get currentShieldHp(): number { return this.shieldHp; }
  private attackCooldown = 0;
  private dashCooldown = 0;
  private readonly baseSpeed = 30;
  private deathTimer = 0;
  private phase2Summoned = false;
  private hpBarBg: THREE.Mesh;
  private hpBarFill: THREE.Mesh;
  private shieldBarFill: THREE.Mesh;
  private readonly hpBarWidth = 4;
  private strafeSign = 1;
  private strafeTimer = 2;
  private hitRecoil = 0;
  private hitFlashTimer = 0;
  private shieldFlashTimer = 0;

  onSummon: ((count: number, pos: THREE.Vector3) => void) | null = null;
  onPhaseChange: ((phase: BossPhase) => void) | null = null;

  constructor(id: number, spawn: THREE.Vector3, level: number, scene: THREE.Scene) {
    this.id = id;
    this.position.copy(spawn);

    const scaling = CONFIG.progression.scaling;
    this.hp = Math.round(CONFIG.boss.baseHp * Math.pow(scaling.hpPerLevel, level));
    this.maxHp = this.hp;

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: CONFIG.boss.color, roughness: 0.3, metalness: 0.2,
      emissive: CONFIG.boss.color, emissiveIntensity: 0.3,
    });
    this.bodyColor = CONFIG.boss.color;

    // Torso
    const torsoGeo = new THREE.BoxGeometry(2, 3, 1.5);
    const torso = new THREE.Mesh(torsoGeo, this.bodyMat);
    torso.position.y = 1.5;
    this.group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(1, 1, 1);
    const head = new THREE.Mesh(headGeo, this.bodyMat);
    head.position.y = 3.5;
    this.group.add(head);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3.0 });
    const eyeGeo = new THREE.SphereGeometry(0.15, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.25, 3.6, -0.5);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.25, 3.6, -0.5);
    this.group.add(rightEye);

    // Wireframe
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffcc00 });
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), outlineMat));
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(headGeo), outlineMat));

    // Hitbox
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(4, 5, 3),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.hitbox.position.y = 2;
    this.group.add(this.hitbox);

    this.group.position.copy(spawn);
    scene.add(this.group);

    // Health bar (boss-sized)
    const barY = 5;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(this.hpBarWidth, 0.3),
      new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide, depthTest: false }),
    );
    this.hpBarBg.position.y = barY;
    this.hpBarBg.renderOrder = 999;
    this.group.add(this.hpBarBg);

    this.hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.hpBarWidth, 0.24),
      new THREE.MeshBasicMaterial({ color: 0xff3300, side: THREE.DoubleSide, depthTest: false }),
    );
    this.hpBarFill.position.y = barY;
    this.hpBarFill.renderOrder = 1000;
    this.group.add(this.hpBarFill);

    // Shield bar (purple, hidden until shield activates)
    this.shieldBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.hpBarWidth, 0.18),
      new THREE.MeshBasicMaterial({ color: 0x8800ff, side: THREE.DoubleSide, depthTest: false }),
    );
    this.shieldBarFill.position.y = barY + 0.35;
    this.shieldBarFill.renderOrder = 1000;
    this.shieldBarFill.visible = false;
    this.group.add(this.shieldBarFill);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    if (this.shieldHp > 0) {
      this.shieldHp -= amount;
      this.updateShieldBar();
      // Shield hit flash
      if (this.shieldMesh) {
        const sm = this.shieldMesh.material as THREE.MeshBasicMaterial;
        sm.opacity = 0.7;
        sm.color.setHex(0xffffff);
        this.shieldFlashTimer = 0.08;
      }
      if (this.shieldHp <= 0) { this.shieldHp = 0; if (this.shieldMesh) this.shieldMesh.visible = false; this.shieldBarFill.visible = false; }
      return false;
    }
    this.hp -= amount;
    // White flash on hit
    this.bodyMat.color.setHex(0xffffff);
    this.bodyMat.emissiveIntensity = 1.0;
    this.hitRecoil = 0.2;
    this.hitFlashTimer = 0.1;

    const hpPct = this.hp / this.maxHp;
    if (this.phase === 1 && hpPct <= CONFIG.boss.phase1Threshold) { this.phase = 2; this.onPhaseChange?.(2); this.updateVisualsForPhase(2); }
    else if (this.phase === 2 && hpPct <= CONFIG.boss.phase2Threshold) { this.phase = 3; this.onPhaseChange?.(3); this.activateShield(); this.updateVisualsForPhase(3); }

    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  private activateShield(): void {
    this.shieldHp = CONFIG.boss.shieldHp;
    this.shieldBarFill.visible = true;
    this.updateShieldBar();
    if (!this.shieldMesh) {
      this.shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(4, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x8800ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
      );
      this.shieldMesh.position.y = 2;
      this.group.add(this.shieldMesh);
    }
    this.shieldMesh.visible = true;
  }

  /** Update boss visual appearance based on phase */
  private updateVisualsForPhase(phase: BossPhase): void {
    // Phase colors: 1=base red, 2=orange enraged, 3=dark crimson
    const phaseColors: Record<number, number> = { 1: this.bodyColor, 2: 0xff6622, 3: 0x880022 };
    const phaseScale: Record<number, number> = { 1: 1.0, 2: 1.15, 3: 1.3 };
    this.bodyMat.color.setHex(phaseColors[phase] ?? this.bodyColor);
    this.bodyMat.emissive.setHex(phaseColors[phase] ?? this.bodyColor);
    this.bodyMat.emissiveIntensity = 0.3 + (phase - 1) * 0.2;
    this.group.scale.setScalar(phaseScale[phase] ?? 1.0);
  }

  private die(): void {
    this.alive = false;
    this.deathTimer = 3.0;
    this.bodyMat.emissiveIntensity = 0;
    this.bodyMat.color.setHex(0x333333);
    this.hpBarBg.visible = false;
    this.hpBarFill.visible = false;
    this.shieldBarFill.visible = false;
  }

  private updateShieldBar(): void {
    const pct = Math.max(0, this.shieldHp / CONFIG.boss.shieldHp);
    this.shieldBarFill.scale.x = pct;
    this.shieldBarFill.position.x = -(1 - pct) * this.hpBarWidth / 2;
  }

  update(dt: number, playerPos: THREE.Vector3): { attacked: boolean; damage: number; aoe: boolean } {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        this.group.position.y -= 10 * dt;
        this.group.rotation.x += dt * 0.5;
      }
      return { attacked: false, damage: 0, aoe: false };
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    // Hit flash decay
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0 && this.alive) {
        this.bodyMat.color.setHex(this.bodyColor);
        this.bodyMat.emissiveIntensity = 0.3;
      }
    }

    // Shield hit flash decay
    if (this.shieldFlashTimer > 0) {
      this.shieldFlashTimer -= dt;
      if (this.shieldFlashTimer <= 0 && this.shieldMesh) {
        const sm = this.shieldMesh.material as THREE.MeshBasicMaterial;
        sm.opacity = 0.3;
        sm.color.setHex(0x8800ff);
      }
    }

    const toPlayer = playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const speed = this.getPhaseSpeed();

    let attacked = false, damage = 0, aoe = false;

    // Strafe timer — flip direction periodically
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) { this.strafeSign *= -1; this.strafeTimer = 2 + Math.random() * 3; }
    const strafeDir = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize()
      .multiplyScalar(this.strafeSign);

    if (this.phase === 1) {
      // Phase 1: cautious orbit + approach
      const approach = toPlayer.clone().normalize().multiplyScalar(speed * 0.7);
      const moveDir = approach.add(strafeDir.multiplyScalar(speed * 0.35));
      this.velocity.lerp(moveDir, Math.min(1, 3 * dt));
      if (this.attackCooldown <= 0 && dist < 80) {
        this.attackCooldown = 1.5; attacked = true; damage = 20;
      }
    } else if (this.phase === 2) {
      // Phase 2: aggressive strafe + faster approach
      if (!this.phase2Summoned) { this.phase2Summoned = true; this.onSummon?.(CONFIG.boss.summonCount, this.position.clone()); }
      const approach = toPlayer.clone().normalize().multiplyScalar(speed * 0.6);
      const moveDir = approach.add(strafeDir.multiplyScalar(speed * 0.5));
      this.velocity.lerp(moveDir, Math.min(1, 4 * dt));
      if (this.attackCooldown <= 0 && dist < 60) {
        this.attackCooldown = 1.0; attacked = true; damage = 25; aoe = dist < 20;
      }
    } else {
      // Phase 3: dash attack + weave between dashes
      if (this.dashCooldown <= 0 && dist < 50) {
        this.dashCooldown = 2.0;
        this.velocity.copy(toPlayer.clone().normalize().multiplyScalar(speed * 2));
        attacked = true; damage = 40;
      } else {
        const approach = toPlayer.clone().normalize().multiplyScalar(speed);
        const weave = strafeDir.multiplyScalar(speed * 0.25);
        this.velocity.lerp(approach.add(weave), Math.min(1, 5 * dt));
      }
    }

    this.position.addScaledVector(this.velocity, dt);
    this.velocity.multiplyScalar(0.95);
    if (this.position.y < 30) this.position.y = 30;

    this.group.position.copy(this.position);
    if (dist > 1) this.group.lookAt(playerPos);

    // Update health bar
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.scale.x = pct;
    this.hpBarFill.position.x = -(1 - pct) * this.hpBarWidth / 2;
    this.hpBarBg.lookAt(playerPos);
    this.hpBarFill.lookAt(playerPos);
    if (this.shieldBarFill.visible) this.shieldBarFill.lookAt(playerPos);

    if (this.shieldMesh && this.shieldMesh.visible) this.shieldMesh.rotation.y += dt * 2;

    // Hit recoil: scale squish + position push
    if (this.hitRecoil > 0) {
      this.hitRecoil -= dt;
      const t = Math.max(0, this.hitRecoil / 0.2);
      this.group.scale.set(1 + t * 0.25, 1 - t * 0.2, 1 + t * 0.25);
      this.group.position.y -= t * 2.0;
      if (this.hitRecoil <= 0) {
        const phaseScale: Record<number, number> = { 1: 1.0, 2: 1.15, 3: 1.3 };
        this.group.scale.setScalar(phaseScale[this.phase] ?? 1.0);
      }
    }

    return { attacked, damage, aoe };
  }

  private getPhaseSpeed(): number {
    if (this.phase === 2) return this.baseSpeed * CONFIG.boss.phase2SpeedBoost;
    if (this.phase === 3) return this.baseSpeed * CONFIG.boss.phase3SpeedBoost;
    return this.baseSpeed;
  }

  isDeathDone(): boolean { return !this.alive && this.deathTimer <= 0; }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
