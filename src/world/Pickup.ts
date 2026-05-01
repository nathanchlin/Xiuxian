import * as THREE from 'three';
import { CONFIG } from '../config';

export type PickupType = 'spirit' | 'health' | 'missile' | 'chest' | 'talisman_drop'
  | 'cultivation_orb' | 'skill_book' | 'treasure_drop' | 'consumable_drop';

export type TalismanTypeName = 'soulseeker' | 'thunderbolt' | 'ironguard';

const TALISMAN_TYPES: TalismanTypeName[] = ['soulseeker', 'thunderbolt', 'ironguard'];

export function randomTalismanType(): TalismanTypeName {
  return TALISMAN_TYPES[Math.floor(Math.random() * TALISMAN_TYPES.length)]!;
}

export interface LootData {
  spirit: number;
  health: number;
  missiles: number;
  talismanType: TalismanTypeName | null;
  cultivationExp: number;
  itemId: string | null;
  itemType: 'skill_book' | 'treasure' | 'consumable' | null;
}

export class Pickup {
  readonly mesh: THREE.Mesh;
  readonly type: PickupType;
  readonly position: THREE.Vector3;
  collected = false;
  talismanType: TalismanTypeName | null = null;
  expireTimer = -1;

  // For new loot types
  itemId: string | null = null;
  itemType: 'skill_book' | 'treasure' | 'consumable' | null = null;
  cultivationExp = 0;

  constructor(type: PickupType, position: THREE.Vector3, scene: THREE.Scene, extra?: {
    talismanType?: TalismanTypeName;
    itemId?: string;
    itemType?: 'skill_book' | 'treasure' | 'consumable';
    cultivationExp?: number;
  }) {
    this.type = type;
    this.position = position.clone();
    this.talismanType = extra?.talismanType ?? null;
    this.itemId = extra?.itemId ?? null;
    this.itemType = extra?.itemType ?? null;
    this.cultivationExp = extra?.cultivationExp ?? 0;

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
      case 'cultivation_orb':
        color = 0xffd700;
        size = 0.4;
        break;
      case 'skill_book':
        color = this.getItemColor();
        size = 0.8;
        useBox = true;
        this.expireTimer = 15;
        break;
      case 'treasure_drop':
        color = this.getItemColor();
        size = 0.9;
        useBox = true;
        this.expireTimer = 15;
        break;
      case 'consumable_drop':
        color = this.getItemColor();
        size = 0.5;
        this.expireTimer = 15;
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

  private getItemColor(): number {
    if (!this.itemId) return 0xffffff;
    const books = CONFIG.items.skillBooks as Record<string, { color: number }>;
    const treasures = CONFIG.items.treasures as Record<string, { color: number }>;
    const consumables = CONFIG.items.consumables as Record<string, { color: number }>;
    return books[this.itemId]?.color
      ?? treasures[this.itemId]?.color
      ?? consumables[this.itemId]?.color
      ?? 0xffffff;
  }

  update(dt: number): void {
    if (this.collected) return;
    this.position.y = this.position.y; // keep base position stable
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
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

  /** Pull toward player when within magnet range */
  attract(playerPos: THREE.Vector3, dt: number): void {
    if (this.collected) return;
    const magnetRadius = 18;
    const dist = this.position.distanceTo(playerPos);
    if (dist < magnetRadius && dist > 0.1) {
      const pullStrength = (1 - dist / magnetRadius) * 40; // stronger when closer
      const dir = playerPos.clone().sub(this.position).normalize();
      this.position.addScaledVector(dir, pullStrength * dt);
    }
  }

  checkCollect(playerPos: THREE.Vector3, playerRadius: number): boolean {
    if (this.collected) return false;
    const collectRadius = this.type === 'cultivation_orb' ? 3.0 : this.type === 'chest' ? 2.0 : 1.5;
    return this.mesh.position.distanceTo(playerPos) < playerRadius + collectRadius;
  }

  collect(): LootData {
    this.collected = true;
    this.mesh.visible = false;
    const empty: LootData = { spirit: 0, health: 0, missiles: 0, talismanType: null, cultivationExp: 0, itemId: null, itemType: null };

    switch (this.type) {
      case 'spirit': return { ...empty, spirit: CONFIG.pickups.spiritOrb.value };
      case 'health': return { ...empty, health: CONFIG.pickups.healthPill.value };
      case 'missile': return { ...empty, missiles: CONFIG.pickups.missileBox.value };
      case 'chest': return { ...empty, talismanType: randomTalismanType() };
      case 'talisman_drop': return { ...empty, talismanType: this.talismanType };
      case 'cultivation_orb': return { ...empty, cultivationExp: this.cultivationExp };
      case 'skill_book':
      case 'treasure_drop':
      case 'consumable_drop':
        return { ...empty, itemId: this.itemId, itemType: this.itemType };
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
