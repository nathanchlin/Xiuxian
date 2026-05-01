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
  expired = false; // true when expireTimer ran out (vs player pickup)
  talismanType: TalismanTypeName | null = null;
  expireTimer = -1;

  // For new loot types
  itemId: string | null = null;
  itemType: 'skill_book' | 'treasure' | 'consumable' | null = null;
  cultivationExp = 0;

  private glowLight: THREE.PointLight | null = null;
  private glowBase = 0;
  private glowSpeed = 1;

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
        this.expireTimer = 60;
        break;
      case 'health':
        color = CONFIG.pickups.healthPill.color;
        size = 0.5;
        this.expireTimer = 60;
        break;
      case 'missile':
        color = CONFIG.pickups.missileBox.color;
        size = 0.7;
        useBox = true;
        this.expireTimer = 60;
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
        this.expireTimer = 60;
        break;
      case 'skill_book':
        color = this.getItemColor();
        size = 0.8;
        useBox = true;
        this.expireTimer = 30;
        break;
      case 'treasure_drop':
        color = this.getItemColor();
        size = 0.9;
        useBox = true;
        this.expireTimer = 30;
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

    // Rarity glow light for special drops
    if (type === 'treasure_drop' || type === 'skill_book') {
      const lightColor = this.getItemQualityColor();
      const intensity = type === 'skill_book' ? 3.0 : this.getQualityIntensity();
      const distance = type === 'skill_book' ? 8 : this.getQualityRadius();
      this.glowLight = new THREE.PointLight(lightColor, intensity, distance);
      this.glowBase = intensity;
      this.glowSpeed = this.getQualityPulseSpeed();
      this.mesh.add(this.glowLight);
    }
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

  private getItemQuality(): string {
    if (!this.itemId) return 'common';
    const treasures = CONFIG.items.treasures as Record<string, { quality: string }>;
    return treasures[this.itemId]?.quality ?? 'common';
  }

  private getItemQualityColor(): number {
    const q = this.getItemQuality();
    return (CONFIG.items.qualityColors as Record<string, number>)[q] ?? 0xcccccc;
  }

  private getQualityIntensity(): number {
    const q = this.getItemQuality();
    if (q === 'epic') return 6.0;
    if (q === 'rare') return 3.0;
    return 1.5;
  }

  private getQualityRadius(): number {
    const q = this.getItemQuality();
    if (q === 'epic') return 18;
    if (q === 'rare') return 10;
    return 5;
  }

  private getQualityPulseSpeed(): number {
    const q = this.getItemQuality();
    if (q === 'epic') return 3;
    if (q === 'rare') return 2;
    return 1;
  }

  update(dt: number): void {
    if (this.collected) return;
    this.position.y = this.position.y; // keep base position stable
    this.mesh.position.x = this.position.x;
    this.mesh.position.z = this.position.z;
    this.mesh.position.y = this.position.y + Math.sin(performance.now() * 0.003 + this.position.x) * 0.5;
    this.mesh.rotation.y += 0.02;

    // Pulse glow light
    if (this.glowLight) {
      this.glowLight.intensity = this.glowBase * (0.6 + 0.4 * Math.sin(performance.now() * 0.003 * this.glowSpeed));
    }

    if (this.expireTimer > 0) {
      this.expireTimer -= dt;
      // Blink warning when about to expire — frequency increases as timer runs out
      if (this.expireTimer < 5) {
        const urgency = 1 - this.expireTimer / 5;
        const blinkFreq = 3 + urgency * 12;
        this.mesh.visible = Math.sin(this.expireTimer * blinkFreq * Math.PI * 2) > 0;
      }
      if (this.expireTimer <= 0) {
        this.collected = true;
        this.expired = true;
        this.mesh.visible = false;
      }
    }
  }

  /** Pull toward player when within magnet range */
  attract(playerPos: THREE.Vector3, dt: number): void {
    if (this.collected) return;
    const magnetRadius = 18;
    const dx = playerPos.x - this.position.x;
    const dy = playerPos.y - this.position.y;
    const dz = playerPos.z - this.position.z;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    if (distXZ < magnetRadius && distXZ > 0.1) {
      const pullStrength = (1 - distXZ / magnetRadius) * 40;
      this.position.x += (dx / distXZ) * pullStrength * dt;
      this.position.z += (dz / distXZ) * pullStrength * dt;
      // Also pull Y toward player to prevent items hovering below
      this.position.y += dy * Math.min(1, pullStrength * dt / Math.abs(dy + 0.01));
    }
  }

  checkCollect(playerPos: THREE.Vector3, playerRadius: number): boolean {
    if (this.collected) return false;
    const collectRadius = this.type === 'cultivation_orb' ? 3.0 : this.type === 'chest' ? 2.0 : 1.5;
    const dx = this.mesh.position.x - playerPos.x;
    const dz = this.mesh.position.z - playerPos.z;
    const dy = this.mesh.position.y - playerPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist < playerRadius + collectRadius;
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
    if (this.glowLight) {
      this.mesh.remove(this.glowLight);
      this.glowLight.dispose();
    }
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
