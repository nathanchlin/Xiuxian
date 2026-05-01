import * as THREE from 'three';
import type { FlightController } from './FlightController';
import type { CameraSystem } from '../core/CameraSystem';

/**
 * PlayerModel — third-person character visible when in third-person camera.
 * Procedural humanoid on flying sword with tilt animations.
 * Hidden in first-person mode.
 */
export class PlayerModel {
  readonly group = new THREE.Group();
  private swordTrail: THREE.Mesh;
  private bodyMeshes: THREE.Mesh[] = [];
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  private damageFlashTimer = 0;
  private intentRing: THREE.Mesh;

  constructor(private readonly scene: THREE.Scene) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x2244aa, emissiveIntensity: 0.5 });
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x222222 });

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.6, 1.0, 0.4);
    const torso = new THREE.Mesh(torsoGeo, bodyMat);
    torso.position.y = 0.5;
    this.group.add(torso);
    this.bodyMeshes.push(torso);
    this.bodyMats.push(bodyMat);
    const torsoWire = new THREE.LineSegments(new THREE.EdgesGeometry(torsoGeo), outlineMat);
    torsoWire.position.copy(torso.position);
    this.group.add(torsoWire);

    // Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.2;
    this.group.add(head);
    this.bodyMeshes.push(head);
    this.bodyMats.push(bodyMat);

    // Flying sword platform beneath feet
    const swordGeo = new THREE.BoxGeometry(0.3, 0.05, 1.2);
    const sword = new THREE.Mesh(swordGeo, accentMat);
    sword.position.y = -0.2;
    this.group.add(sword);

    // Sword glow trail
    const trailGeo = new THREE.PlaneGeometry(0.2, 2);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x4488ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
    });
    this.swordTrail = new THREE.Mesh(trailGeo, trailMat);
    this.swordTrail.position.set(0, -0.2, 1.2);
    this.swordTrail.rotation.x = Math.PI / 2;
    this.group.add(this.swordTrail);

    // Sword intent aura ring
    const intentGeo = new THREE.RingGeometry(1.5, 2.0, 24);
    const intentMat = new THREE.MeshBasicMaterial({
      color: 0x44ffcc, transparent: true, opacity: 0, side: THREE.DoubleSide,
    });
    this.intentRing = new THREE.Mesh(intentGeo, intentMat);
    this.intentRing.position.y = -0.5;
    this.intentRing.rotation.x = -Math.PI / 2;
    this.intentRing.renderOrder = 997;
    this.group.add(this.intentRing);

    scene.add(this.group);
  }

  update(flight: FlightController, camera: CameraSystem, dt: number): void {
    this.group.position.copy(flight.position);
    this.group.quaternion.copy(flight.quaternion);
    this.group.visible = camera.getMode() === 'third_person';

    const speed = flight.getSpeed();
    const trailMat = this.swordTrail.material as THREE.MeshBasicMaterial;
    trailMat.opacity = Math.min(0.6, speed / 100);

    // 加速时拖尾变长
    const baseLength = 2;
    const maxLength = 8;
    const speedRatio = Math.min(1, speed / 100);
    const trailLength = baseLength + (maxLength - baseLength) * speedRatio;
    this.swordTrail.scale.y = trailLength / baseLength;
    this.swordTrail.position.z = 1.2 + (trailLength - baseLength) * 0.5;

    // Damage flash decay
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer -= dt;
      if (this.damageFlashTimer <= 0) {
        for (const mat of this.bodyMats) {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
      }
    }

    // Sword intent aura ring
    const intent = flight.swordIntent;
    const ringMat = this.intentRing.material as THREE.MeshBasicMaterial;
    if (intent > 0) {
      const maxStacks = 5; // CONFIG.skills.swordIntent.maxStacks
      const ratio = intent / maxStacks;
      ringMat.opacity = 0.15 + ratio * 0.45;
      this.intentRing.rotation.z += dt * (1 + ratio * 3);
      if (intent >= maxStacks) {
        ringMat.color.setHex(0xffd700);
      } else {
        ringMat.color.setHex(0x44ffcc);
      }
    } else {
      ringMat.opacity = 0;
    }
  }

  flashDamage(): void {
    this.damageFlashTimer = 0.15;
    for (const mat of this.bodyMats) {
      mat.emissive.setHex(0xff2222);
      mat.emissiveIntensity = 1.5;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}
