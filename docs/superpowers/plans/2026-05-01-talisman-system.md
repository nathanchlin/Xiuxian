# 符箓副武器系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现3种符箓副武器（追魂符/雷罚符/金刚符），通过宝箱和击杀掉落获取，自动攻击/回复，次数制耐久，最多携带2个。

**Architecture:** 新建 `TalismanSystem` 管理符箓携带和自动行为。扩展 `Pickup` 支持宝箱和符箓掉落类型。Game.ts 在敌人死亡时按概率生成掉落物，在 update 循环中驱动 TalismanSystem。HUD 添加符箓槽位和拾取大字提示。

**Tech Stack:** Three.js, TypeScript, Vite HMR

**Spec:** `docs/superpowers/specs/2026-05-01-talisman-system-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/config.ts` | Modify | 添加 `talismans` 配置段 |
| `src/world/Pickup.ts` | Modify | 添加 `chest` 和 `talisman_drop` 类型 |
| `src/player/TalismanSystem.ts` | **Create** | 符箓携带、自动攻击/回复、耐久、视觉 |
| `src/shared/Sfx.ts` | Modify | 添加符箓音效 |
| `src/ui/Hud.ts` | Modify | 添加符箓槽位 + 拾取大字提示 |
| `src/Game.ts` | Modify | 宝箱生成、击杀掉落、TalismanSystem 集成 |

---

### Task 1: config.ts — 添加符箓配置

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: 添加 talismans 配置段**

在 `pickups` 段之后、`progression` 段之前添加：

```typescript
// ─── Talismans (符箓副武器) ───
talismans: {
  maxCarry: 2,
  dropExpireTime: 10,
  chestPerLevel: 3,
  dropRates: {
    crow: 0.15,
    serpent: 0.30,
    dragon: 0.50,
    boss: 1.0,
  } as Record<string, number>,
  types: {
    soulseeker: {
      name: '追魂符',
      description: '自动追踪攻击最近敌人',
      durability: 20,
      damage: 12,
      interval: 1.0,
      range: 60,
      projectileSpeed: 50,
      trackingLerp: 2,
      color: 0xffaa00,
    },
    thunderbolt: {
      name: '雷罚符',
      description: '对最近敌人释放雷电AOE',
      durability: 10,
      damage: 30,
      interval: 2.5,
      range: 40,
      aoeRadius: 8,
      color: 0xaa88ff,
    },
    ironguard: {
      name: '金刚符',
      description: '持续恢复生命力',
      durability: 15,
      healAmount: 8,
      interval: 3.0,
      color: 0x88ff44,
    },
  },
},
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: 添加符箓副武器配置段"
```

---

### Task 2: Pickup.ts — 添加宝箱和掉落类型

**Files:**
- Modify: `src/world/Pickup.ts`

- [ ] **Step 1: 扩展 PickupType 和构造函数**

将 `PickupType` 和整个 `Pickup` 类替换为：

```typescript
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
  /** For talisman_drop: which talisman type */
  talismanType: TalismanTypeName | null = null;
  /** For talisman_drop: time remaining before auto-despawn */
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

    // Expire timer for drops
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
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/world/Pickup.ts
git commit -m "feat: Pickup支持宝箱和符箓掉落类型"
```

---

### Task 3: TalismanSystem.ts — 符箓核心逻辑

**Files:**
- Create: `src/player/TalismanSystem.ts`

- [ ] **Step 1: 创建完整的 TalismanSystem**

```typescript
import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from './FlightController';
import type { Sfx } from '../shared/Sfx';
import type { TalismanTypeName } from '../world/Pickup';

export interface TalismanHitResult {
  targetIds: number[];
  damage: number;
}

export interface TalismanTarget {
  id: number;
  position: THREE.Vector3;
  alive: boolean;
}

interface ActiveTalisman {
  type: TalismanTypeName;
  durability: number;
  cooldownTimer: number;
  floatingMesh: THREE.Mesh;
}

export class TalismanSystem {
  private slots: (ActiveTalisman | null)[] = [null, null];
  private targets: TalismanTarget[] = [];

  // Projectiles from soulseeker
  readonly projectiles: SoulseekerBolt[] = [];

  // Visual effects queue (lightning, heal glow)
  private effects: TalismanEffect[] = [];

  // Hit results to be consumed by Game each frame
  private pendingHits: TalismanHitResult[] = [];
  private pendingHeal = 0;

  constructor(
    private readonly flight: FlightController,
    private readonly scene: THREE.Scene,
    private readonly sfx: Sfx,
  ) {}

  setTargets(targets: TalismanTarget[]): void {
    this.targets = targets;
  }

  getSlots(): Array<{ type: TalismanTypeName; durability: number } | null> {
    return this.slots.map(s => s ? { type: s.type, durability: s.durability } : null);
  }

  // ─── Equip ─────────────────────────────────────────────

  equip(type: TalismanTypeName): void {
    const cfg = CONFIG.talismans.types[type];
    const durability = 'durability' in cfg ? cfg.durability : 0;

    const mat = new THREE.MeshBasicMaterial({
      color: cfg.color, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(0.6, 0.8);
    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);

    const talisman: ActiveTalisman = {
      type,
      durability,
      cooldownTimer: 0.5, // brief delay before first activation
      floatingMesh: mesh,
    };

    // Find empty slot or replace oldest
    const emptyIdx = this.slots.indexOf(null);
    if (emptyIdx >= 0) {
      this.slots[emptyIdx] = talisman;
    } else {
      // Replace slot 0 (oldest)
      this.removeTalisman(0);
      this.slots[0] = talisman;
    }
  }

  private removeTalisman(slotIdx: number): void {
    const t = this.slots[slotIdx];
    if (t) {
      this.scene.remove(t.floatingMesh);
      t.floatingMesh.geometry.dispose();
      (t.floatingMesh.material as THREE.Material).dispose();
      this.slots[slotIdx] = null;
    }
  }

  // ─── Update ────────────────────────────────────────────

  update(dt: number): void {
    this.pendingHits = [];
    this.pendingHeal = 0;

    // Update each active talisman
    for (let i = 0; i < this.slots.length; i++) {
      const t = this.slots[i]!;
      if (!t) continue;

      // Float mesh near player
      this.updateFloatingMesh(t, i, dt);

      // Cooldown
      t.cooldownTimer -= dt;
      if (t.cooldownTimer > 0) continue;

      // Activate
      switch (t.type) {
        case 'soulseeker':
          this.activateSoulseeker(t);
          break;
        case 'thunderbolt':
          this.activateThunderbolt(t);
          break;
        case 'ironguard':
          this.activateIronguard(t);
          break;
      }

      // Check durability
      if (t.durability <= 0) {
        this.removeTalisman(i);
      }
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]!;
      p.update(dt);

      if (p.expired) {
        p.dispose(this.scene);
        this.projectiles.splice(i, 1);
        continue;
      }

      // Hit detection
      for (const target of this.targets) {
        if (!target.alive) continue;
        if (p.mesh.position.distanceTo(target.position) < 2.5) {
          this.pendingHits.push({ targetIds: [target.id], damage: CONFIG.talismans.types.soulseeker.damage });
          this.sfx.hit();
          p.expired = true;
          break;
        }
      }
    }

    // Update effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]!;
      e.timer -= dt;
      if (e.timer <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  consumeHits(): TalismanHitResult[] {
    return this.pendingHits;
  }

  consumeHeal(): number {
    return this.pendingHeal;
  }

  // ─── Talisman Behaviors ────────────────────────────────

  private activateSoulseeker(t: ActiveTalisman): void {
    const cfg = CONFIG.talismans.types.soulseeker;
    const nearest = this.findNearest(cfg.range);
    if (!nearest) return;

    t.durability--;
    t.cooldownTimer = cfg.interval;
    this.sfx.shoot();

    const origin = this.flight.position.clone();
    const dir = nearest.position.clone().sub(origin).normalize();
    this.projectiles.push(new SoulseekerBolt(origin, dir, nearest.position.clone(), this.scene));
  }

  private activateThunderbolt(t: ActiveTalisman): void {
    const cfg = CONFIG.talismans.types.thunderbolt;
    const nearest = this.findNearest(cfg.range);
    if (!nearest) return;

    t.durability--;
    t.cooldownTimer = cfg.interval;
    this.sfx.parrySuccess(); // reuse as thunder sound

    // AOE: hit all enemies within radius
    const hitIds: number[] = [];
    for (const target of this.targets) {
      if (!target.alive) continue;
      if (target.position.distanceTo(nearest.position) < cfg.aoeRadius) {
        hitIds.push(target.id);
      }
    }
    if (hitIds.length > 0) {
      this.pendingHits.push({ targetIds: hitIds, damage: cfg.damage });
    }

    // Lightning visual
    this.showLightning(nearest.position.clone());
  }

  private activateIronguard(t: ActiveTalisman): void {
    const cfg = CONFIG.talismans.types.ironguard;
    t.durability--;
    t.cooldownTimer = cfg.interval;
    this.pendingHeal = cfg.healAmount;

    // Heal glow visual
    this.showHealGlow();
  }

  // ─── Helpers ───────────────────────────────────────────

  private findNearest(range: number): TalismanTarget | null {
    let best: TalismanTarget | null = null;
    let bestDist = range;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const d = this.flight.position.distanceTo(t.position);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    return best;
  }

  private updateFloatingMesh(t: ActiveTalisman, slotIdx: number, _dt: number): void {
    const offset = slotIdx === 0
      ? new THREE.Vector3(-1.5, 0.5, 0)
      : new THREE.Vector3(1.5, 0.5, 0);
    offset.applyQuaternion(this.flight.quaternion);
    t.floatingMesh.position.copy(this.flight.position).add(offset);
    t.floatingMesh.position.y += Math.sin(performance.now() * 0.004 + slotIdx * 3) * 0.2;
    t.floatingMesh.quaternion.copy(this.flight.quaternion);
    t.floatingMesh.rotateY(performance.now() * 0.002);
  }

  // ─── Visual Effects ────────────────────────────────────

  private showLightning(targetPos: THREE.Vector3): void {
    const topY = 150;
    const length = topY - targetPos.y;
    const geo = new THREE.CylinderGeometry(0.3, 0.1, length, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(targetPos.x, targetPos.y + length / 2, targetPos.z);
    this.scene.add(mesh);
    this.effects.push({ mesh, timer: 0.2 });
  }

  private showHealGlow(): void {
    const geo = new THREE.RingGeometry(1, 2.5, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ff44, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(this.flight.position);
    mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    this.effects.push({ mesh, timer: 0.3 });
  }

  // ─── Reset / Dispose ──────────────────────────────────

  reset(): void {
    for (let i = 0; i < this.slots.length; i++) this.removeTalisman(i);
    for (const p of this.projectiles) p.dispose(this.scene);
    this.projectiles.length = 0;
    for (const e of this.effects) {
      this.scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.effects.length = 0;
  }

  dispose(): void {
    this.reset();
  }
}

// ─── Soulseeker Bolt ─────────────────────────────────────

class SoulseekerBolt {
  readonly mesh: THREE.Mesh;
  private velocity: THREE.Vector3;
  private targetPos: THREE.Vector3;
  private distanceTraveled = 0;
  expired = false;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, targetPos: THREE.Vector3, scene: THREE.Scene) {
    const cfg = CONFIG.talismans.types.soulseeker;
    this.velocity = direction.multiplyScalar(cfg.projectileSpeed);
    this.targetPos = targetPos;

    const geo = new THREE.SphereGeometry(0.2, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    // Light tracking
    const toTarget = this.targetPos.clone().sub(this.mesh.position).normalize();
    const currentDir = this.velocity.clone().normalize();
    currentDir.lerp(toTarget, Math.min(1, CONFIG.talismans.types.soulseeker.trackingLerp * dt));
    currentDir.normalize();
    this.velocity.copy(currentDir).multiplyScalar(CONFIG.talismans.types.soulseeker.projectileSpeed);

    const step = this.velocity.clone().multiplyScalar(dt);
    this.mesh.position.add(step);
    this.distanceTraveled += step.length();

    if (this.distanceTraveled > CONFIG.talismans.types.soulseeker.range) {
      this.expired = true;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ─── Effect entry ────────────────────────────────────────

interface TalismanEffect {
  mesh: THREE.Mesh;
  timer: number;
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/player/TalismanSystem.ts
git commit -m "feat: 创建TalismanSystem — 3种符箓自动攻击/回复逻辑"
```

---

### Task 4: Sfx.ts — 添加符箓音效

**Files:**
- Modify: `src/shared/Sfx.ts`

- [ ] **Step 1: 添加音效方法**

在 `finalStrikeRelease()` 方法之后、`// --- primitives ---` 之前添加：

```typescript
talismanEquip(): void {
  if (!this.ready()) return;
  this.beep(880, 0.1, 'sine', 0.5);
  this.beep(1100, 0.12, 'sine', 0.4);
  this.sweep(600, 1200, 0.2, 'triangle', 0.3);
}

talismanExpire(): void {
  if (!this.ready()) return;
  this.sweep(600, 200, 0.3, 'triangle', 0.4);
}

thunder(): void {
  if (!this.ready()) return;
  this.noise(0.3, 300, 0.9);
  this.sweep(200, 50, 0.4, 'sawtooth', 0.7);
  this.beep(100, 0.15, 'square', 0.5);
}
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/shared/Sfx.ts
git commit -m "feat: 添加符箓装备/过期/雷电音效"
```

---

### Task 5: Hud.ts — 符箓槽位和拾取提示

**Files:**
- Modify: `src/ui/Hud.ts`

- [ ] **Step 1: 添加属性**

在 `private finalStrikeHint!: HTMLDivElement;` 之后添加：

```typescript
// Talisman HUD
private talismanSlots: HTMLDivElement[] = [];
private talismanDurTexts: HTMLDivElement[] = [];
private talismanPickupEl!: HTMLDivElement;
private talismanPickupTimer = 0;
```

- [ ] **Step 2: 添加DOM创建**

在 `this.root.appendChild(this.finalStrikeHint);` 之后、`this.root.appendChild(bottomBar);` 之前添加：

```typescript
// ── Talisman slots (bottom bar, after HP) ────────────────────────
const talismanContainer = div(
  `${BASE}bottom:80px;right:180px;display:flex;gap:6px;`,
);
for (let i = 0; i < 2; i++) {
  const slot = div(
    `width:28px;height:28px;border:1px solid #555;border-radius:4px;` +
      `background:rgba(0,0,0,0.5);position:relative;`,
  );
  const durText = div(
    `position:absolute;bottom:1px;right:2px;font-size:9px;color:#fff;` +
      `text-shadow:0 0 3px #000;`,
  );
  slot.appendChild(durText);
  this.talismanSlots.push(slot);
  this.talismanDurTexts.push(durText);
  talismanContainer.appendChild(slot);
}
this.root.appendChild(talismanContainer);

// ── Talisman pickup notification ─────────────────────────────────
this.talismanPickupEl = div(
  `${BASE}top:35%;left:50%;transform:translate(-50%,-50%) scale(0.8);` +
    `text-align:center;opacity:0;transition:all 0.2s;pointer-events:none;`,
);
this.root.appendChild(this.talismanPickupEl);
```

- [ ] **Step 3: 添加public方法**

在 `setFinalStrikeReady` 方法之后添加：

```typescript
setTalismanSlots(slots: Array<{ type: string; durability: number; color: number } | null>): void {
  for (let i = 0; i < 2; i++) {
    const slot = this.talismanSlots[i]!;
    const durText = this.talismanDurTexts[i]!;
    const data = slots[i] ?? null;
    if (data) {
      const hex = '#' + data.color.toString(16).padStart(6, '0');
      slot.style.borderColor = hex;
      slot.style.background = hex + '44';
      slot.style.boxShadow = `0 0 6px ${hex}`;
      durText.textContent = `${data.durability}`;
    } else {
      slot.style.borderColor = '#555';
      slot.style.background = 'rgba(0,0,0,0.5)';
      slot.style.boxShadow = 'none';
      durText.textContent = '';
    }
  }
}

showTalismanPickup(name: string, description: string): void {
  this.talismanPickupEl.innerHTML =
    `<div style="font-size:28px;font-weight:bold;color:#ffd700;text-shadow:0 0 12px rgba(255,215,0,0.8);letter-spacing:3px;">` +
    `「获得 ${name}」</div>` +
    `<div style="font-size:14px;color:#ccc;margin-top:6px;">${description}</div>`;
  this.talismanPickupEl.style.opacity = '1';
  this.talismanPickupEl.style.transform = 'translate(-50%,-50%) scale(1)';
  clearTimeout(this.talismanPickupTimer);
  this.talismanPickupTimer = window.setTimeout(() => {
    this.talismanPickupEl.style.opacity = '0';
    this.talismanPickupEl.style.transform = 'translate(-50%,-50%) scale(0.8)';
  }, 1500);
}
```

- [ ] **Step 4: 验证编译**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/ui/Hud.ts
git commit -m "feat: HUD添加符箓槽位显示和拾取大字提示"
```

---

### Task 6: Game.ts — 集成符箓系统

**Files:**
- Modify: `src/Game.ts`

- [ ] **Step 1: 添加import和属性**

顶部添加 import：
```typescript
import { TalismanSystem } from './player/TalismanSystem';
import type { TalismanTypeName } from './world/Pickup';
```

在 class 属性中添加（`private pickups` 附近）：
```typescript
readonly talismanSystem: TalismanSystem;
private talismanDrops: Pickup[] = [];
```

- [ ] **Step 2: 在constructor中初始化**

在 `this.skillSystem = new SkillSystem(...)` 之后添加：
```typescript
this.talismanSystem = new TalismanSystem(this.flight, this.engine.scene, this.sfx);
```

- [ ] **Step 3: 修改 spawnPickups — 生成宝箱替代旧道具**

替换 `spawnPickups` 方法：
```typescript
private spawnPickups(): void {
  for (const p of this.pickups) p.dispose(this.engine.scene);
  this.pickups = [];
  const spots = this.arena.pickupSpots.slice(0, 10);

  // First few spots: health/spirit pickups
  const basicTypes: PickupType[] = ['spirit', 'health', 'spirit'];
  for (let i = 0; i < Math.min(basicTypes.length, spots.length); i++) {
    this.pickups.push(new Pickup(basicTypes[i]!, spots[i]!, this.engine.scene));
  }

  // Next spots: treasure chests
  const chestCount = CONFIG.talismans.chestPerLevel;
  for (let i = basicTypes.length; i < basicTypes.length + chestCount && i < spots.length; i++) {
    this.pickups.push(new Pickup('chest', spots[i]!, this.engine.scene));
  }
}
```

- [ ] **Step 4: 修改 pickup collection — 处理宝箱和符箓掉落**

替换 `// 7. Pickup collection` 区块为：
```typescript
// 7. Pickup collection (pickups + talisman drops)
const allPickups = [...this.pickups, ...this.talismanDrops];
for (const pickup of allPickups) {
  pickup.update(dt);
  if (pickup.checkCollect(this.flight.position, CONFIG.flight.playerRadius)) {
    const loot = pickup.collect();
    if (loot.health > 0) this.flight.hp = Math.min(CONFIG.player.maxHealth, this.flight.hp + loot.health);
    if (loot.spirit > 0) this.flight.spirit = Math.min(CONFIG.spirit.maxSpirit, this.flight.spirit + loot.spirit);
    if (loot.talismanType) {
      this.equipTalisman(loot.talismanType);
    }
    this.sfx.chestOpen();
  }
}
// Clean up expired talisman drops
this.talismanDrops = this.talismanDrops.filter(d => {
  if (d.collected || d.expireTimer <= 0) {
    d.dispose(this.engine.scene);
    return false;
  }
  return true;
});
```

- [ ] **Step 5: 添加 equipTalisman 方法**

在 `onBossKilled` 方法之后添加：
```typescript
private equipTalisman(type: TalismanTypeName): void {
  this.talismanSystem.equip(type);
  const cfg = CONFIG.talismans.types[type];
  this.hud.showTalismanPickup(cfg.name, cfg.description);
  this.sfx.talismanEquip();
}
```

- [ ] **Step 6: 修改 onEnemyKilled — 添加掉落逻辑**

替换 `onEnemyKilled` 方法：
```typescript
private onEnemyKilled(typeName: string, position?: THREE.Vector3): void {
  this.kills++;
  this.sfx.enemyDie();
  this.hud.showKill(`${typeName} 已斩`);

  // Talisman drop chance
  if (position) {
    const dropRate = CONFIG.talismans.dropRates[typeName] ?? 0;
    if (Math.random() < dropRate) {
      const tType = (await import('../world/Pickup')).randomTalismanType();
      const drop = new Pickup('talisman_drop', position, this.engine.scene, tType);
      this.talismanDrops.push(drop);
    }
  }
}
```

等等 — 动态 import 在这里不合适。改为顶部已有 import 的 `randomTalismanType`。更新顶部 import 行：
```typescript
import { Pickup, type PickupType, randomTalismanType } from './world/Pickup';
```

然后 `onEnemyKilled` 中直接用：
```typescript
private onEnemyKilled(typeName: string, position?: THREE.Vector3): void {
  this.kills++;
  this.sfx.enemyDie();
  this.hud.showKill(`${typeName} 已斩`);

  if (position) {
    const dropRate = CONFIG.talismans.dropRates[typeName] ?? 0;
    if (Math.random() < dropRate) {
      const tType = randomTalismanType();
      const drop = new Pickup('talisman_drop', position, this.engine.scene, tType);
      this.talismanDrops.push(drop);
    }
  }
}
```

同样修改 `onBossKilled`：
```typescript
private onBossKilled(): void {
  this.kills++;
  this.sfx.enemyDie();
  this.hud.showKill('妖王已诛!');

  if (this.boss) {
    const tType = randomTalismanType();
    const drop = new Pickup('talisman_drop', this.boss.position, this.engine.scene, tType);
    this.talismanDrops.push(drop);
  }
}
```

- [ ] **Step 7: 修改 onSkillHit — 传递敌人位置给 onEnemyKilled**

在 `onSkillHit` 中，找到调用 `this.onEnemyKilled(enemy.typeName)` 的地方，改为传递位置：
```typescript
if (killed) this.onEnemyKilled(enemy.typeName, enemy.position.clone());
```
同样在 boss 部分：
```typescript
if (killed) this.onBossKilled();
```
（boss 已经在 onBossKilled 内部取 this.boss.position）

也要更新 parry reflect 中的 onEnemyKilled 调用：
```typescript
if (killed) this.onEnemyKilled(enemy.typeName, enemy.position.clone());
```

- [ ] **Step 8: 在 update 循环中添加 TalismanSystem 更新**

在步骤 4（skill system update）之后添加：
```typescript
// 4.5 Talisman system
this.talismanSystem.setTargets(
  this.targets_cache ?? [] // reuse targets from updateSkillTargets
);
this.talismanSystem.update(dt);

// Process talisman hits
for (const hit of this.talismanSystem.consumeHits()) {
  for (const id of hit.targetIds) {
    this.onSkillHit({ targetId: id, damage: hit.damage });
  }
}

// Process talisman heal
const heal = this.talismanSystem.consumeHeal();
if (heal > 0) {
  this.flight.hp = Math.min(CONFIG.player.maxHealth, this.flight.hp + heal);
}
```

实际上 targets 需要共享。最简单的方式：在 `updateSkillTargets` 中同时设置 talismanSystem 的 targets。修改 `updateSkillTargets`：
```typescript
private updateSkillTargets(): void {
  const targets = [];
  for (const e of this.enemies) {
    if (e.alive) targets.push({ id: e.id, mesh: e.hitbox, position: e.position, alive: e.alive });
  }
  if (this.boss && this.boss.alive) {
    targets.push({ id: this.boss.id, mesh: this.boss.hitbox, position: this.boss.position, alive: this.boss.alive });
  }
  this.skillSystem.setTargets(targets);
  this.talismanSystem.setTargets(targets.map(t => ({ id: t.id, position: t.position, alive: t.alive })));
}
```

然后步骤 4.5 简化为（在 skill system update 之后、步骤5之前）：
```typescript
// 4.5 Talisman system
this.talismanSystem.update(dt);
for (const hit of this.talismanSystem.consumeHits()) {
  for (const id of hit.targetIds) {
    this.onSkillHit({ targetId: id, damage: hit.damage });
  }
}
const heal = this.talismanSystem.consumeHeal();
if (heal > 0) {
  this.flight.hp = Math.min(CONFIG.player.maxHealth, this.flight.hp + heal);
}
```

- [ ] **Step 9: 在 updateHud 中添加符箓 HUD 更新**

在 `setFinalStrikeReady` 调用之后添加：
```typescript
// Talisman HUD
const tSlots = this.talismanSystem.getSlots();
this.hud.setTalismanSlots(tSlots.map(s => {
  if (!s) return null;
  const cfg = CONFIG.talismans.types[s.type];
  return { type: s.type, durability: s.durability, color: cfg.color };
}));
```

- [ ] **Step 10: 在 restart/initLevel 中重置符箓**

在 `restart()` 方法中，`this.flight.teleportTo(...)` 之后添加：
```typescript
this.talismanSystem.reset();
for (const d of this.talismanDrops) d.dispose(this.engine.scene);
this.talismanDrops = [];
```

在 `initLevel()` 中 `for (const p of this.pickups)` 之后添加：
```typescript
for (const d of this.talismanDrops) d.dispose(this.engine.scene);
this.talismanDrops = [];
```

- [ ] **Step 11: 在 dispose 中清理**

在 `dispose()` 中添加：
```typescript
this.talismanSystem.dispose();
for (const d of this.talismanDrops) d.dispose(this.engine.scene);
```

- [ ] **Step 12: 验证编译和构建**

Run: `npx tsc --noEmit`
Run: `npm run build`

- [ ] **Step 13: Commit**

```bash
git add src/Game.ts
git commit -m "feat: Game.ts集成符箓系统——宝箱生成、击杀掉落、自动攻击"
```

---

### Task 7: 构建验证和部署

**Files:** None (build + deploy only)

- [ ] **Step 1: 验证构建**

Run: `npm run build`
Expected: 成功

- [ ] **Step 2: 部署**

Run: `npx gh-pages -d dist`

- [ ] **Step 3: Commit and push**

```bash
git push
```
