import * as THREE from 'three';
import { CONFIG } from '../config';
import type { EnemyTypeName } from './enemy-types';
import { getEnemyConfig } from './enemy-types';

export type EnemyState = 'patrol' | 'chase' | 'attack' | 'flee' | 'dead';

export class Enemy {
  readonly group = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly id: number;
  readonly typeName: EnemyTypeName;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  hp: number;
  maxHp: number;
  alive = true;
  state: EnemyState = 'patrol';

  private readonly speed: number;
  private readonly attackDamage: number;
  private readonly color: number;
  private attackCooldown = 0;
  private readonly attackCooldownTime = 3.5;
  private bodyMat: THREE.MeshStandardMaterial;
  private deathTimer = 0;
  private spawnFlashTimer = 0.3;
  private hitRecoil = 0;
  private hitFlashTimer = 0;
  private patrolTarget = new THREE.Vector3();
  private patrolTimer = 0;
  private hpBarBg: THREE.Mesh;
  private hpBarFill: THREE.Mesh;
  private readonly hpBarWidth = 2;

  constructor(id: number, spawn: THREE.Vector3, typeName: EnemyTypeName, level: number, scene: THREE.Scene) {
    this.id = id;
    this.typeName = typeName;
    this.position.copy(spawn);

    const cfg = getEnemyConfig(typeName, level);
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.attackDamage = cfg.attackDamage;
    this.color = cfg.color;

    this.bodyMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.4, metalness: 0.1 });
    const scale = cfg.scale;
    const wingMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });

    // Type-specific geometry
    let bodyGeo: THREE.BoxGeometry;
    if (typeName === 'serpent') {
      // Elongated snake body, no wings, hood crest on top
      bodyGeo = new THREE.BoxGeometry(0.8 * scale, 0.6 * scale, 3.0 * scale);
      const body = new THREE.Mesh(bodyGeo, this.bodyMat);
      this.group.add(body);
      // Hood crest
      const hoodGeo = new THREE.BoxGeometry(1.4 * scale, 0.15 * scale, 0.8 * scale);
      const hood = new THREE.Mesh(hoodGeo, wingMat);
      hood.position.set(0, 0.4 * scale, -1.0 * scale);
      this.group.add(hood);
      // Green eyes
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x44ff44, emissiveIntensity: 2.0 });
      const eyeGeo = new THREE.SphereGeometry(0.18 * scale, 6, 6);
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.2 * scale, 0.15 * scale, -1.5 * scale);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.2 * scale, 0.15 * scale, -1.5 * scale);
      this.group.add(le, re);
    } else if (typeName === 'dragon') {
      // Bulkier body, angled wings, tail, horns
      bodyGeo = new THREE.BoxGeometry(1.4 * scale, 1.0 * scale, 2.2 * scale);
      const body = new THREE.Mesh(bodyGeo, this.bodyMat);
      this.group.add(body);
      // Angled wings
      const wGeo = new THREE.BoxGeometry(3.5 * scale, 0.1 * scale, 1.4 * scale);
      const lw = new THREE.Mesh(wGeo, wingMat); lw.position.set(-1.8 * scale, 0.3 * scale, 0); lw.rotation.z = 0.25;
      const rw = new THREE.Mesh(wGeo, wingMat); rw.position.set(1.8 * scale, 0.3 * scale, 0); rw.rotation.z = -0.25;
      this.group.add(lw, rw);
      // Tail
      const tailGeo = new THREE.BoxGeometry(0.3 * scale, 0.3 * scale, 1.8 * scale);
      const tail = new THREE.Mesh(tailGeo, this.bodyMat); tail.position.z = 1.8 * scale;
      this.group.add(tail);
      // Horns + cyan eyes
      const hornGeo = new THREE.ConeGeometry(0.12 * scale, 0.6 * scale, 4);
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, roughness: 0.3 });
      const lh = new THREE.Mesh(hornGeo, hornMat); lh.position.set(-0.3 * scale, 0.7 * scale, -0.8 * scale); lh.rotation.x = -0.3;
      const rh = new THREE.Mesh(hornGeo, hornMat); rh.position.set(0.3 * scale, 0.7 * scale, -0.8 * scale); rh.rotation.x = -0.3;
      this.group.add(lh, rh);
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x22ccff, emissive: 0x22ccff, emissiveIntensity: 2.5 });
      const eyeGeo = new THREE.SphereGeometry(0.18 * scale, 6, 6);
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.35 * scale, 0.3 * scale, -1.1 * scale);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.35 * scale, 0.3 * scale, -1.1 * scale);
      this.group.add(le, re);
    } else {
      // Crow: compact body + flat wings + beak + yellow eyes
      bodyGeo = new THREE.BoxGeometry(1.0 * scale, 0.6 * scale, 1.6 * scale);
      const body = new THREE.Mesh(bodyGeo, this.bodyMat);
      this.group.add(body);
      const wGeo = new THREE.BoxGeometry(2.8 * scale, 0.08 * scale, 0.8 * scale);
      const lw = new THREE.Mesh(wGeo, wingMat); lw.position.x = -1.4 * scale;
      const rw = new THREE.Mesh(wGeo, wingMat); rw.position.x = 1.4 * scale;
      this.group.add(lw, rw);
      // Beak
      const beakGeo = new THREE.ConeGeometry(0.12 * scale, 0.4 * scale, 4);
      const beak = new THREE.Mesh(beakGeo, this.bodyMat);
      beak.position.set(0, 0, -1.0 * scale); beak.rotation.x = Math.PI / 2;
      this.group.add(beak);
      // Yellow eyes
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffcc00, emissiveIntensity: 2.0 });
      const eyeGeo = new THREE.SphereGeometry(0.12 * scale, 6, 6);
      const le = new THREE.Mesh(eyeGeo, eyeMat); le.position.set(-0.25 * scale, 0.2 * scale, -0.8 * scale);
      const re = new THREE.Mesh(eyeGeo, eyeMat); re.position.set(0.25 * scale, 0.2 * scale, -0.8 * scale);
      this.group.add(le, re);
    }

    // Wireframe
    this.group.add(new THREE.LineSegments(new THREE.EdgesGeometry(bodyGeo), new THREE.LineBasicMaterial({ color: 0x000000 })));

    // Hitbox (invisible, larger for easy targeting)
    this.hitbox = new THREE.Mesh(
      new THREE.BoxGeometry(3.5 * scale, 1.5 * scale, 2.5 * scale),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.group.add(this.hitbox);

    this.group.position.copy(spawn);
    scene.add(this.group);
    this.randomPatrolTarget();

    // Spawn flash — bright emissive glow that fades
    this.bodyMat.emissive.setHex(0xffffff);
    this.bodyMat.emissiveIntensity = 2.0;

    // Health bar
    const barY = scale * 1.2 + 0.5;
    this.hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(this.hpBarWidth, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide, depthTest: false }),
    );
    this.hpBarBg.position.y = barY;
    this.hpBarBg.renderOrder = 999;
    this.group.add(this.hpBarBg);

    this.hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(this.hpBarWidth, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide, depthTest: false }),
    );
    this.hpBarFill.position.y = barY;
    this.hpBarFill.renderOrder = 1000;
    this.group.add(this.hpBarFill);
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.bodyMat.color.setHex(0xffffff);
    this.hitFlashTimer = 0.08;
    this.hitRecoil = 0.15;
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  private die(): void {
    this.alive = false;
    this.state = 'dead';
    this.deathTimer = 2.0;
    this.bodyMat.color.setHex(0x666666);
    this.bodyMat.opacity = 0.5;
    this.bodyMat.transparent = true;
    this.hpBarBg.visible = false;
    this.hpBarFill.visible = false;
  }

  update(dt: number, playerPos: THREE.Vector3): { attacked: boolean; damage: number } {
    if (!this.alive) {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        this.group.position.y -= 20 * dt;
        this.bodyMat.opacity = Math.max(0, this.deathTimer / 2.0);
      }
      return { attacked: false, damage: 0 };
    }

    // Spawn flash decay
    if (this.spawnFlashTimer > 0) {
      this.spawnFlashTimer -= dt;
      const t = Math.max(0, this.spawnFlashTimer / 0.3);
      this.bodyMat.emissiveIntensity = t * 2.0;
      if (this.spawnFlashTimer <= 0) {
        this.bodyMat.emissive.setHex(0x000000);
        this.bodyMat.emissiveIntensity = 0;
      }
    }

    // Hit flash decay
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      if (this.hitFlashTimer <= 0 && this.alive) {
        this.bodyMat.color.setHex(this.color);
      }
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const toPlayer = playerPos.clone().sub(this.position);

    // Attack telegraph: red pulsing glow when about to attack
    const dist = toPlayer.length();
    if (this.spawnFlashTimer <= 0 && this.attackCooldown > 0 && this.attackCooldown < 0.6 && dist < CONFIG.enemies.engageDistance) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.02);
      this.bodyMat.emissive.setHex(0xff2222);
      this.bodyMat.emissiveIntensity = pulse * 1.2;
    } else if (this.spawnFlashTimer <= 0 && this.state !== 'attack') {
      this.bodyMat.emissive.setHex(0x000000);
      this.bodyMat.emissiveIntensity = 0;
    }
    const fleeThreshold = this.maxHp * CONFIG.enemies.fleeHpPercent;

    let attacked = false;

    if (this.hp < fleeThreshold) {
      this.state = 'flee';
      const fleeDir = toPlayer.normalize().negate();
      this.velocity.lerp(fleeDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
      // Auto-die if fled too far from player
      if (dist > 150) {
        this.die();
        return { attacked: false, damage: 0 };
      }
    } else if (dist < CONFIG.enemies.engageDistance && this.attackCooldown <= 0) {
      this.state = 'attack';
      this.attackCooldown = this.attackCooldownTime;
      attacked = true;
      this.group.lookAt(playerPos);
    } else if (dist < CONFIG.enemies.engageDistance) {
      this.state = 'chase';
      const chaseDir = toPlayer.normalize();
      const strafe = new THREE.Vector3(-chaseDir.z, 0, chaseDir.x).multiplyScalar(
        Math.sin(performance.now() * 0.002 + this.id) * 0.3,
      );
      // Keep minimum distance — avoid clipping into player
      const minDist = CONFIG.enemies.avoidDistance;
      if (dist < minDist) {
        // Too close: back off
        const retreatDir = chaseDir.clone().negate();
        this.velocity.lerp(retreatDir.multiplyScalar(this.speed * 0.6), Math.min(1, 4 * dt));
      } else {
        const moveDir = chaseDir.add(strafe).normalize();
        this.velocity.lerp(moveDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
      }
    } else {
      this.state = 'patrol';
      this.patrolTimer -= dt;
      if (this.patrolTimer <= 0 || this.position.distanceTo(this.patrolTarget) < 5) {
        this.randomPatrolTarget();
      }
      const toTarget = this.patrolTarget.clone().sub(this.position).normalize();
      this.velocity.lerp(toTarget.multiplyScalar(this.speed * 0.5), Math.min(1, 2 * dt));
    }

    this.position.addScaledVector(this.velocity, dt);
    if (this.position.y < 20) this.position.y = 20;
    this.group.position.copy(this.position);
    if (this.velocity.lengthSq() > 0.1) {
      this.group.lookAt(this.position.clone().add(this.velocity));
    }
    this.group.position.y += Math.sin(performance.now() * 0.003 + this.id * 7) * 0.3;

    // Hit recoil: scale squish + position push
    if (this.hitRecoil > 0) {
      this.hitRecoil -= dt;
      const t = Math.max(0, this.hitRecoil / 0.15);
      this.group.scale.set(1 + t * 0.2, 1 - t * 0.15, 1 + t * 0.2);
      this.group.position.y -= t * 1.5;
      if (this.hitRecoil <= 0) this.group.scale.set(1, 1, 1);
    }

    // Update health bar
    const pct = Math.max(0, this.hp / this.maxHp);
    this.hpBarFill.scale.x = pct;
    this.hpBarFill.position.x = -(1 - pct) * this.hpBarWidth / 2;
    const hpColor = pct > 0.5 ? 0x00ff00 : pct > 0.25 ? 0xffaa00 : 0xff0000;
    (this.hpBarFill.material as THREE.MeshBasicMaterial).color.setHex(hpColor);
    this.hpBarBg.lookAt(playerPos);
    this.hpBarFill.lookAt(playerPos);

    return { attacked, damage: attacked ? this.attackDamage : 0 };
  }

  private randomPatrolTarget(): void {
    this.patrolTarget.set(
      this.position.x + (Math.random() - 0.5) * 100,
      30 + Math.random() * 80,
      this.position.z + (Math.random() - 0.5) * 100,
    );
    this.patrolTimer = 5 + Math.random() * 5;
  }

  getPosition(): THREE.Vector3 { return this.position.clone(); }

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
