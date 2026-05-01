/**
 * Inventory — Player inventory, cultivation, and equipment system.
 *
 * Lightweight list-based inventory: items auto-stack by id.
 * Equipment: up to 3 treasure slots.
 * Cultivation: exp → level → global stat bonuses.
 */
import { CONFIG } from '../config';

export interface InventoryItem {
  id: string;
  type: 'skill_book' | 'treasure' | 'consumable';
  count: number;
}

export interface EquippedTreasure {
  id: string;
}

export interface StatBonuses {
  damage: number;      // multiplier (e.g. 0.15 = +15%)
  speed: number;
  hp: number;
  spirit: number;
  parryWindow: number; // flat seconds added
}

export class Inventory {
  items: InventoryItem[] = [];
  equipped: (EquippedTreasure | null)[] = [null, null, null];

  cultivationLevel = 0;
  cultivationExp = 0;

  // ─── Add item ──────────────────────────────────────────

  addItem(id: string, type: 'skill_book' | 'treasure' | 'consumable', count = 1): void {
    const existing = this.items.find(i => i.id === id);
    if (existing) {
      existing.count += count;
    } else {
      this.items.push({ id, type, count });
    }
  }

  removeItem(id: string, count = 1): boolean {
    const item = this.items.find(i => i.id === id);
    if (!item || item.count < count) return false;
    item.count -= count;
    if (item.count <= 0) {
      this.items = this.items.filter(i => i.id !== id);
    }
    return true;
  }

  getItem(id: string): InventoryItem | null {
    return this.items.find(i => i.id === id) ?? null;
  }

  getItemsByType(type: 'skill_book' | 'treasure' | 'consumable'): InventoryItem[] {
    return this.items.filter(i => i.type === type);
  }

  // ─── Cultivation ───────────────────────────────────────

  addCultivationExp(amount: number): boolean {
    this.cultivationExp += amount;
    const cfg = CONFIG.items.cultivation;
    let leveledUp = false;
    while (
      this.cultivationLevel < cfg.maxLevel &&
      this.cultivationExp >= (cfg.expPerLevel[this.cultivationLevel + 1] ?? Infinity)
    ) {
      this.cultivationLevel++;
      leveledUp = true;
    }
    return leveledUp;
  }

  getCultivationBonus(): number {
    return this.cultivationLevel * CONFIG.items.cultivation.bonusPerLevel;
  }

  getExpForNextLevel(): number {
    const cfg = CONFIG.items.cultivation;
    if (this.cultivationLevel >= cfg.maxLevel) return Infinity;
    return cfg.expPerLevel[this.cultivationLevel + 1] ?? Infinity;
  }

  // ─── Equipment ─────────────────────────────────────────

  equipTreasure(id: string): boolean {
    // Must own the treasure
    if (!this.getItem(id)) return false;

    // Already equipped?
    if (this.equipped.some(e => e?.id === id)) return false;

    // Find empty slot or return false
    const emptyIdx = this.equipped.indexOf(null);
    if (emptyIdx < 0) return false;

    this.equipped[emptyIdx] = { id };
    return true;
  }

  unequipTreasure(slotIdx: number): string | null {
    const eq = this.equipped[slotIdx];
    if (!eq) return null;
    this.equipped[slotIdx] = null;
    return eq.id;
  }

  getStatBonuses(): StatBonuses {
    const bonuses: StatBonuses = { damage: 0, speed: 0, hp: 0, spirit: 0, parryWindow: 0 };

    // Cultivation bonuses
    const cultBonus = this.getCultivationBonus();
    bonuses.damage += cultBonus;
    bonuses.hp += cultBonus;
    bonuses.spirit += cultBonus;

    // Equipment bonuses
    for (const eq of this.equipped) {
      if (!eq) continue;
      const cfg = CONFIG.items.treasures[eq.id];
      if (!cfg) continue;
      const stat = cfg.stat as keyof StatBonuses;
      if (stat in bonuses) {
        bonuses[stat] += cfg.value;
      }
    }

    return bonuses;
  }

  // ─── Reset ─────────────────────────────────────────────

  reset(): void {
    this.items = [];
    this.equipped = [null, null, null];
    this.cultivationLevel = 0;
    this.cultivationExp = 0;
  }
}
