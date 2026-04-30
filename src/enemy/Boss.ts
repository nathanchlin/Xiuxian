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
  private shieldMesh: THREE.Mesh | null = null;
  private shieldHp = 0;
  private attackCooldown = 0;
  private dashCooldown = 0;
  private readonly baseSpeed = 30;
  private deathTimer = 0;
  private phase2Summoned = false;

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
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    if (this.shieldHp > 0) {
      this.shieldHp -= amount;
      if (this.shieldHp <= 0) { this.shieldHp = 0; if (this.shieldMesh) this.shieldMesh.visible = false; }
      return false;
    }
    this.hp -= amount;
    this.bodyMat.emissiveIntensity = 1.0;
    setTimeout(() => { if (this.alive) this.bodyMat.emissiveIntensity = 0.3; }, 100);

    const hpPct = this.hp / this.maxHp;
    if (this.phase === 1 && hpPct <= CONFIG.boss.phase1Threshold) { this.phase = 2; this.onPhaseChange?.(2); }
    else if (this.phase === 2 && hpPct <= CONFIG.boss.phase2Threshold) { this.phase = 3; this.onPhaseChange?.(3); this.activateShield(); }

    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  private activateShield(): void {
    this.shieldHp = CONFIG.boss.shieldHp;
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

  private die(): void {
    this.alive = false;
    this.deathTimer = 3.0;
    this.bodyMat.emissiveIntensity = 0;
    this.bodyMat.color.setHex(0x333333);
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

    const toPlayer = playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const speed = this.getPhaseSpeed();

    let attacked = false, damage = 0, aoe = false;

    if (this.phase === 1) {
      if (dist > 30) {
        this.velocity.lerp(toPlayer.clone().normalize().multiplyScalar(speed), Math.min(1, 3 * dt));
      }
      if (this.attackCooldown <= 0 && dist < 80) {
        this.attackCooldown = 1.5; attacked = true; damage = 20;
      }
    } else if (this.phase === 2) {
      if (!this.phase2Summoned) { this.phase2Summoned = true; this.onSummon?.(CONFIG.boss.summonCount, this.position.clone()); }
      if (this.attackCooldown <= 0 && dist < 60) {
        this.attackCooldown = 1.0; attacked = true; damage = 25; aoe = dist < 20;
      }
      this.velocity.lerp(toPlayer.clone().normalize().multiplyScalar(speed), Math.min(1, 4 * dt));
    } else {
      if (this.dashCooldown <= 0 && dist < 50) {
        this.dashCooldown = 2.0;
        this.velocity.copy(toPlayer.clone().normalize().multiplyScalar(speed * 2));
        attacked = true; damage = 40;
      } else {
        this.velocity.lerp(toPlayer.clone().normalize().multiplyScalar(speed), Math.min(1, 5 * dt));
      }
    }

    this.position.addScaledVector(this.velocity, dt);
    this.velocity.multiplyScalar(0.95);
    if (this.position.y < 30) this.position.y = 30;

    this.group.position.copy(this.position);
    if (dist > 1) this.group.lookAt(playerPos);

    if (this.shieldMesh && this.shieldMesh.visible) this.shieldMesh.rotation.y += dt * 2;

    return { attacked, damage, aoe };
  }

  private getPhaseSpeed(): number {
    if (this.phase === 2) return this.baseSpeed * CONFIG.boss.phase2SpeedBoost;
    if (this.phase === 3) return this.baseSpeed * CONFIG.boss.phase3SpeedBoost;
    return this.baseSpeed;
  }

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
