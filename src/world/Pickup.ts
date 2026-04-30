import * as THREE from 'three';
import { CONFIG } from '../config';

export type PickupType = 'spirit' | 'health' | 'missile';

export class Pickup {
  readonly mesh: THREE.Mesh;
  readonly type: PickupType;
  readonly position: THREE.Vector3;
  collected = false;

  constructor(type: PickupType, position: THREE.Vector3, scene: THREE.Scene) {
    this.type = type;
    this.position = position.clone();

    const cfgMap = {
      spirit: { color: CONFIG.pickups.spiritOrb.color, size: 0.6 },
      health: { color: CONFIG.pickups.healthPill.color, size: 0.5 },
      missile: { color: CONFIG.pickups.missileBox.color, size: 0.7 },
    };
    const cfg = cfgMap[type];

    const geo = type === 'missile'
      ? new THREE.BoxGeometry(cfg.size, cfg.size, cfg.size)
      : new THREE.SphereGeometry(cfg.size / 2, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.5, roughness: 0.3,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  update(_dt: number): void {
    if (this.collected) return;
    this.mesh.position.y = this.position.y + Math.sin(performance.now() * 0.003 + this.position.x) * 0.5;
    this.mesh.rotation.y += 0.02;
  }

  checkCollect(playerPos: THREE.Vector3, playerRadius: number): boolean {
    if (this.collected) return false;
    return this.mesh.position.distanceTo(playerPos) < playerRadius + 1.0;
  }

  collect(): { spirit: number; health: number; missiles: number } {
    this.collected = true;
    this.mesh.visible = false;
    switch (this.type) {
      case 'spirit': return { spirit: CONFIG.pickups.spiritOrb.value, health: 0, missiles: 0 };
      case 'health': return { spirit: 0, health: CONFIG.pickups.healthPill.value, missiles: 0 };
      case 'missile': return { spirit: 0, health: 0, missiles: CONFIG.pickups.missileBox.value };
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
