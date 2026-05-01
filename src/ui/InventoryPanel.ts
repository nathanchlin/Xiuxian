/**
 * InventoryPanel — Full-screen DOM panel with 3 tabs: Character, Inventory, Skills.
 * Opens with Tab key (or mobile button), pauses game.
 * Pure DOM, no canvas dependency.
 */
import { CONFIG } from '../config';
import type { Inventory } from '../player/Inventory';
import type { FlightController } from '../player/FlightController';

type Tab = 'character' | 'inventory' | 'skills';

const GOLD = '#daa520';
const BG = 'rgba(5,5,20,0.92)';
const CARD_BG = 'rgba(255,255,255,0.06)';
const BORDER = 'rgba(218,165,32,0.3)';

function el(tag: string, css: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  if (text) e.textContent = text;
  return e;
}

export class InventoryPanel {
  private root: HTMLDivElement;
  private content: HTMLDivElement;
  private currentTab: Tab = 'character';
  private visible = false;

  // Callbacks
  onClose: (() => void) | null = null;
  onUseSkillBook: ((skillName: string) => void) | null = null;
  onUseConsumable: ((itemId: string) => void) | null = null;
  onEquipTreasure: ((itemId: string) => void) | null = null;
  onUnequipTreasure: ((slotIdx: number) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.style.cssText =
      `position:fixed;top:0;left:0;width:100%;height:100%;z-index:300;` +
      `background:${BG};display:none;font-family:monospace;color:#fff;` +
      `overflow-y:auto;-webkit-overflow-scrolling:touch;`;

    // Header
    const header = el('div',
      `display:flex;justify-content:space-between;align-items:center;padding:16px 24px;` +
      `border-bottom:1px solid ${BORDER};`,
    );
    const title = el('div', `font-size:20px;color:${GOLD};font-weight:bold;letter-spacing:3px;`, '角色总览');
    const closeBtn = el('div',
      `font-size:24px;cursor:pointer;color:#888;padding:4px 12px;pointer-events:auto;`,
      '✕',
    );
    closeBtn.addEventListener('click', () => this.onClose?.());
    header.append(title, closeBtn);
    this.root.appendChild(header);

    // Tabs
    const tabBar = el('div',
      `display:flex;gap:0;border-bottom:1px solid ${BORDER};`,
    );
    const tabs: { key: Tab; label: string }[] = [
      { key: 'character', label: '角色' },
      { key: 'inventory', label: '背包' },
      { key: 'skills', label: '技能' },
    ];
    for (const t of tabs) {
      const tabBtn = el('div',
        `flex:1;text-align:center;padding:10px;cursor:pointer;pointer-events:auto;` +
        `font-size:14px;letter-spacing:2px;color:#888;border-bottom:2px solid transparent;` +
        `transition:all 0.15s;`,
        t.label,
      );
      tabBtn.dataset['tab'] = t.key;
      tabBtn.addEventListener('click', () => {
        this.currentTab = t.key;
        this.updateTabStyles(tabBar);
        this.render();
      });
      tabBar.appendChild(tabBtn);
    }
    this.root.appendChild(tabBar);

    // Content area
    this.content = document.createElement('div');
    this.content.style.cssText = 'padding:16px 24px;';
    this.root.appendChild(this.content);

    document.body.appendChild(this.root);
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(inventory: Inventory, flight: FlightController): void {
    this.visible = true;
    this.root.style.display = 'block';
    this.renderWith(inventory, flight);
  }

  hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
  }

  toggle(inventory: Inventory, flight: FlightController): void {
    if (this.visible) this.hide();
    else this.show(inventory, flight);
  }

  // Store refs for re-render
  private _inv: Inventory | null = null;
  private _flight: FlightController | null = null;

  private renderWith(inv: Inventory, flight: FlightController): void {
    this._inv = inv;
    this._flight = flight;
    this.updateTabStyles(this.root.querySelector('div:nth-child(2)') as HTMLElement);
    this.render();
  }

  private render(): void {
    if (!this._inv || !this._flight) return;
    this.content.innerHTML = '';
    switch (this.currentTab) {
      case 'character': this.renderCharacter(this._inv, this._flight); break;
      case 'inventory': this.renderInventory(this._inv); break;
      case 'skills': this.renderSkills(this._inv, this._flight); break;
    }
  }

  private updateTabStyles(tabBar: HTMLElement | null): void {
    if (!tabBar) return;
    for (const child of Array.from(tabBar.children)) {
      const tab = child as HTMLElement;
      const isActive = tab.dataset['tab'] === this.currentTab;
      tab.style.color = isActive ? GOLD : '#888';
      tab.style.borderBottomColor = isActive ? GOLD : 'transparent';
    }
  }

  // ─── Character Tab ─────────────────────────────────────

  private renderCharacter(inv: Inventory, _flight: FlightController): void {
    const bonuses = inv.getStatBonuses();

    // Cultivation
    const cultSection = this.section('修为境界');
    const cultLevel = el('div', `font-size:28px;color:${GOLD};font-weight:bold;margin:8px 0;`,
      `第 ${inv.cultivationLevel} 层`);
    const expNext = inv.getExpForNextLevel();
    const expBar = this.progressBar(inv.cultivationExp, expNext === Infinity ? inv.cultivationExp : expNext, GOLD);
    const expText = el('div', 'font-size:11px;color:#888;margin-top:4px;',
      expNext === Infinity ? '已达巅峰' : `修为 ${inv.cultivationExp} / ${expNext}`);
    cultSection.append(cultLevel, expBar, expText);
    this.content.appendChild(cultSection);

    // Stats
    const statsSection = this.section('属性');
    const maxHp = Math.floor(CONFIG.player.maxHealth * (1 + bonuses.hp));
    const maxSp = Math.floor(CONFIG.spirit.maxSpirit * (1 + bonuses.spirit));
    const dmgBonus = Math.floor(bonuses.damage * 100);
    const spdBonus = Math.floor(bonuses.speed * 100);
    const parryBonus = bonuses.parryWindow;

    const stats = [
      { label: '生命上限', value: `${maxHp}`, color: '#e74c3c' },
      { label: '灵力上限', value: `${maxSp}`, color: '#3498db' },
      { label: '攻击加成', value: `+${dmgBonus}%`, color: '#e67e22' },
      { label: '移速加成', value: `+${spdBonus}%`, color: '#27ae60' },
      { label: '护盾加时', value: `+${parryBonus.toFixed(1)}s`, color: '#f1c40f' },
    ];
    const grid = el('div', 'display:grid;grid-template-columns:1fr 1fr;gap:8px;');
    for (const s of stats) {
      const card = el('div', `background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;padding:10px;`);
      card.innerHTML = `<div style="font-size:11px;color:#888;">${s.label}</div>` +
        `<div style="font-size:18px;color:${s.color};font-weight:bold;margin-top:4px;">${s.value}</div>`;
      grid.appendChild(card);
    }
    statsSection.appendChild(grid);
    this.content.appendChild(statsSection);

    // Equipment
    const eqSection = this.section('装备法宝（最多3件）');
    for (let i = 0; i < 3; i++) {
      const eq = inv.equipped[i];
      const slot = el('div',
        `background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;padding:10px;margin-bottom:6px;` +
        `display:flex;justify-content:space-between;align-items:center;`,
      );
      if (eq) {
        const cfg = (CONFIG.items.treasures as Record<string, { name: string; description: string; color: number; quality: string }>)[eq.id];
        if (cfg) {
          const hex = '#' + cfg.color.toString(16).padStart(6, '0');
          slot.innerHTML = `<div><span style="color:${hex};font-weight:bold;">${cfg.name}</span>` +
            `<span style="color:#888;font-size:11px;margin-left:8px;">${cfg.description}</span></div>`;
          const removeBtn = el('div',
            'color:#e74c3c;cursor:pointer;pointer-events:auto;font-size:12px;padding:4px 8px;border:1px solid #e74c3c;border-radius:4px;',
            '卸下',
          );
          removeBtn.addEventListener('click', () => {
            this.onUnequipTreasure?.(i);
            this.render();
          });
          slot.appendChild(removeBtn);
        }
      } else {
        slot.innerHTML = `<span style="color:#555;">空槽位</span>`;
      }
      eqSection.appendChild(slot);
    }
    this.content.appendChild(eqSection);
  }

  // ─── Inventory Tab ─────────────────────────────────────

  private renderInventory(inv: Inventory): void {
    const types: Array<{ key: 'skill_book' | 'treasure' | 'consumable'; label: string }> = [
      { key: 'skill_book', label: '技能书' },
      { key: 'treasure', label: '法宝' },
      { key: 'consumable', label: '消耗品' },
    ];

    if (inv.items.length === 0) {
      this.content.appendChild(el('div', 'color:#888;text-align:center;padding:40px;font-size:14px;', '背包空空如也'));
      return;
    }

    for (const t of types) {
      const items = inv.getItemsByType(t.key);
      if (items.length === 0) continue;

      const section = this.section(t.label);

      for (const item of items) {
        const card = el('div',
          `background:${CARD_BG};border:1px solid ${BORDER};border-radius:6px;padding:10px;margin-bottom:6px;` +
          `display:flex;justify-content:space-between;align-items:center;`,
        );

        const info = this.getItemInfo(item.id, t.key);
        const hex = '#' + info.color.toString(16).padStart(6, '0');
        card.innerHTML = `<div><span style="color:${hex};font-weight:bold;">${info.name}</span>` +
          `<span style="color:#888;font-size:11px;margin-left:8px;">${info.description}</span>` +
          `<span style="color:#aaa;font-size:11px;margin-left:8px;">×${item.count}</span></div>`;

        const useBtn = el('div',
          `color:${GOLD};cursor:pointer;pointer-events:auto;font-size:12px;padding:4px 8px;` +
          `border:1px solid ${GOLD};border-radius:4px;`,
          t.key === 'treasure' ? '装备' : '使用',
        );
        useBtn.addEventListener('click', () => {
          if (t.key === 'skill_book') this.onUseSkillBook?.(item.id);
          else if (t.key === 'consumable') this.onUseConsumable?.(item.id);
          else if (t.key === 'treasure') this.onEquipTreasure?.(item.id);
          this.render();
        });
        card.appendChild(useBtn);
        section.appendChild(card);
      }
      this.content.appendChild(section);
    }
  }

  // ─── Skills Tab ────────────────────────────────────────

  private renderSkills(inv: Inventory, flight: FlightController): void {
    const skills = [
      { key: 'bladeFan', name: '万剑齐发', bookId: 'skill_bladefan', desc: '发射12把自动追踪飞剑' },
      { key: 'swordDash', name: '御剑突刺', bookId: 'skill_sworddash', desc: '前方高速突进' },
      { key: 'parry', name: '剑气护体', bookId: 'skill_parry', desc: '弹反敌人攻击' },
      { key: 'finalStrike', name: '万剑归宗', bookId: 'skill_final', desc: '消耗剑意大招' },
    ];

    for (const skill of skills) {
      const level = flight.getSkillLevel(skill.key);
      const card = el('div',
        `background:${CARD_BG};border:1px solid ${BORDER};border-radius:8px;padding:14px;margin-bottom:10px;`,
      );

      const headerRow = el('div', 'display:flex;justify-content:space-between;align-items:center;');
      headerRow.innerHTML = `<div><span style="color:${GOLD};font-size:16px;font-weight:bold;">${skill.name}</span>` +
        `<span style="color:#888;font-size:12px;margin-left:8px;">${skill.desc}</span></div>` +
        `<span style="color:#44ffcc;font-size:14px;">Lv.${level}</span>`;
      card.appendChild(headerRow);

      // Check if player has the skill book
      const book = inv.getItem(skill.bookId);
      if (book && book.count > 0) {
        const upgradeBtn = el('div',
          `margin-top:8px;text-align:center;padding:6px;cursor:pointer;pointer-events:auto;` +
          `border:1px solid #44ffcc;border-radius:4px;color:#44ffcc;font-size:13px;`,
          `使用 ${this.getItemInfo(skill.bookId, 'skill_book').name} 升级 (×${book.count})`,
        );
        upgradeBtn.addEventListener('click', () => {
          this.onUseSkillBook?.(skill.bookId);
          this.render();
        });
        card.appendChild(upgradeBtn);
      } else {
        const noBook = el('div', 'margin-top:8px;color:#555;font-size:11px;', '需要技能书升级');
        card.appendChild(noBook);
      }

      this.content.appendChild(card);
    }
  }

  // ─── Helpers ───────────────────────────────────────────

  private section(title: string): HTMLElement {
    const s = el('div', 'margin-bottom:16px;');
    s.appendChild(el('div', `font-size:13px;color:${GOLD};margin-bottom:8px;letter-spacing:1px;`, title));
    return s;
  }

  private progressBar(current: number, max: number, color: string): HTMLElement {
    const track = el('div', 'width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;');
    const pct = max > 0 ? Math.min(1, current / max) * 100 : 100;
    const fill = el('div', `width:${pct}%;height:100%;background:${color};border-radius:4px;`);
    track.appendChild(fill);
    return track;
  }

  private getItemInfo(id: string, type: string): { name: string; description: string; color: number } {
    const books = CONFIG.items.skillBooks as Record<string, { name: string; description: string; color: number }>;
    const treasures = CONFIG.items.treasures as Record<string, { name: string; description: string; color: number }>;
    const consumables = CONFIG.items.consumables as Record<string, { name: string; description: string; color: number }>;
    if (type === 'skill_book') return books[id] ?? { name: id, description: '', color: 0xffffff };
    if (type === 'treasure') return treasures[id] ?? { name: id, description: '', color: 0xffffff };
    return consumables[id] ?? { name: id, description: '', color: 0xffffff };
  }

  dispose(): void {
    this.root.remove();
  }
}
