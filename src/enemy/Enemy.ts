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
  private readonly attackCooldownTime = 2.0;
  private bodyMat: THREE.MeshStandardMaterial;
  private deathTimer = 0;
  private patrolTarget = new THREE.Vector3();
  private patrolTimer = 0;

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

    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2 * scale, 0.8 * scale, 2.0 * scale);
    const body = new THREE.Mesh(bodyGeo, this.bodyMat);
    this.group.add(body);

    // Wings
    const wingGeo = new THREE.BoxGeometry(3.0 * scale, 0.1 * scale, 1.0 * scale);
    const wingMat = new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.5 });
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.x = -1.5 * scale;
    this.group.add(leftWing);
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.x = 1.5 * scale;
    this.group.add(rightWing);

    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.0 });
    const eyeGeo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.3 * scale, 0.2 * scale, -1.0 * scale);
    this.group.add(leftEye);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.3 * scale, 0.2 * scale, -1.0 * scale);
    this.group.add(rightEye);

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
  }

  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.bodyMat.color.setHex(0xffffff);
    setTimeout(() => { if (this.alive) this.bodyMat.color.setHex(this.color); }, 80);
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

    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    const toPlayer = playerPos.clone().sub(this.position);
    const dist = toPlayer.length();
    const fleeThreshold = this.maxHp * CONFIG.enemies.fleeHpPercent;

    let attacked = false;

    if (this.hp < fleeThreshold) {
      this.state = 'flee';
      const fleeDir = toPlayer.normalize().negate();
      this.velocity.lerp(fleeDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
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
      const moveDir = chaseDir.add(strafe).normalize();
      this.velocity.lerp(moveDir.multiplyScalar(this.speed), Math.min(1, 3 * dt));
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
