import * as THREE from 'three';
import { CONFIG } from '../config';

export type PickupType = 'spirit' | 'health' | 'missile' | 'chest' | 'talisman_drop';

export type TalismanTypeName = 'soulseeker' | 'thunderbolt' | 'ironguard';

const TALISMAN_TYPES: TalismanTypeName[] = ['soulseeker', 'thunderbolt', 'ironguard'];

export function randomTalismanType(): TalismanTypeName {
  return TALISMAN_TYPES[Math.floor(Math.random() * TALISMAN_TYPES.length)]!;
}

export class Pickup {
  readonly mesh: THREE.Mesh;
  readonly type: PickupType;
  readonly position: THREE.Vector3;
  collected = false;
  talismanType: TalismanTypeName | null = null;
  expireTimer = -1;

  constructor(type: PickupType, position: THREE.Vector3, scene: THREE.Scene, talismanType?: TalismanTypeName) {
    this.type = type;
    this.position = position.clone();
    this.talismanType = talismanType ?? null;

    let color: number;
    let size: number;
    let useBox = false;

    switch (type) {
      case 'spirit':
        color = CONFIG.pickups.spiritOrb.color;
        size = 0.6;
        break;
      case 'health':
        color = CONFIG.pickups.healthPill.color;
        size = 0.5;
        break;
      case 'missile':
        color = CONFIG.pickups.missileBox.color;
        size = 0.7;
        useBox = true;
        break;
      case 'chest':
        color = 0xdaa520;
        size = 1.0;
        useBox = true;
        break;
      case 'talisman_drop':
        color = 0xffaa00;
        size = 0.7;
        useBox = true;
        this.expireTimer = CONFIG.talismans.dropExpireTime;
        break;
    }

    const geo = useBox
      ? new THREE.BoxGeometry(size, size, size)
      : new THREE.SphereGeometry(size / 2, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.5, roughness: 0.3,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(position);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    if (this.collected) return;
    this.mesh.position.y = this.position.y + Math.sin(performance.now() * 0.003 + this.position.x) * 0.5;
    this.mesh.rotation.y += 0.02;

    if (this.expireTimer > 0) {
      this.expireTimer -= dt;
      if (this.expireTimer <= 0) {
        this.collected = true;
        this.mesh.visible = false;
      }
    }
  }

  checkCollect(playerPos: THREE.Vector3, playerRadius: number): boolean {
    if (this.collected) return false;
    const collectRadius = this.type === 'chest' ? 2.0 : 1.0;
    return this.mesh.position.distanceTo(playerPos) < playerRadius + collectRadius;
  }

  collect(): { spirit: number; health: number; missiles: number; talismanType: TalismanTypeName | null } {
    this.collected = true;
    this.mesh.visible = false;
    switch (this.type) {
      case 'spirit': return { spirit: CONFIG.pickups.spiritOrb.value, health: 0, missiles: 0, talismanType: null };
      case 'health': return { spirit: 0, health: CONFIG.pickups.healthPill.value, missiles: 0, talismanType: null };
      case 'missile': return { spirit: 0, health: 0, missiles: CONFIG.pickups.missileBox.value, talismanType: null };
      case 'chest': {
        const t = randomTalismanType();
        return { spirit: 0, health: 0, missiles: 0, talismanType: t };
      }
      case 'talisman_drop':
        return { spirit: 0, health: 0, missiles: 0, talismanType: this.talismanType };
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
