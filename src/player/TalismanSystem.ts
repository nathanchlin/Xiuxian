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
  private expiredNames: string[] = [];

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

    // If same type already equipped, refresh durability instead of duplicating
    const existingIdx = this.slots.findIndex(s => s?.type === type);
    if (existingIdx >= 0) {
      const existing = this.slots[existingIdx]!;
      existing.durability = Math.min(existing.durability + durability, durability * 2);
      return;
    }

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
        const cfg = CONFIG.talismans.types[t.type];
        this.expiredNames.push(cfg.name);
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

  consumeExpired(): string[] {
    const names = this.expiredNames;
    this.expiredNames = [];
    return names;
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
    this.sfx.thunder();

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
    this.pendingHeal += cfg.healAmount;

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

    // Main thick bolt
    const geo = new THREE.CylinderGeometry(0.6, 0.2, length, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, opacity: 0.95 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(targetPos.x, targetPos.y + length / 2, targetPos.z);
    this.scene.add(mesh);
    this.effects.push({ mesh, timer: 0.4 });

    // Inner bright core
    const coreGeo = new THREE.CylinderGeometry(0.15, 0.05, length, 4);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(targetPos.x, targetPos.y + length / 2, targetPos.z);
    this.scene.add(core);
    this.effects.push({ mesh: core, timer: 0.3 });

    // Impact ring at target
    const ringGeo = new THREE.RingGeometry(0.5, 4, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xaa88ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(targetPos);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.effects.push({ mesh: ring, timer: 0.5 });

    // Point light flash (parented to lightHolder for auto-cleanup)
    const light = new THREE.PointLight(0xaa88ff, 5, 20);
    const lightHolder = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial({ visible: false }));
    lightHolder.add(light);
    lightHolder.position.copy(targetPos);
    this.scene.add(lightHolder);
    this.effects.push({ mesh: lightHolder, timer: 0.4 });
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

  // Trail
  private trail: THREE.Line;
  private trailPositions: THREE.Vector3[] = [];
  private readonly maxTrailPoints = 12;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, targetPos: THREE.Vector3, scene: THREE.Scene) {
    const cfg = CONFIG.talismans.types.soulseeker;
    this.velocity = direction.multiplyScalar(cfg.projectileSpeed);
    this.targetPos = targetPos;

    // Larger glowing sphere
    const geo = new THREE.SphereGeometry(0.4, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);

    // Point light for glow
    const light = new THREE.PointLight(cfg.color, 2, 8);
    this.mesh.add(light);

    // Trail line
    for (let i = 0; i < this.maxTrailPoints; i++) {
      this.trailPositions.push(origin.clone());
    }
    const trailGeo = new THREE.BufferGeometry().setFromPoints(this.trailPositions);
    const trailMat = new THREE.LineBasicMaterial({ color: cfg.color, transparent: true, opacity: 0.6 });
    this.trail = new THREE.Line(trailGeo, trailMat);
    scene.add(this.trail);
  }

  update(dt: number): void {
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

    // Update trail
    this.trailPositions.pop();
    this.trailPositions.unshift(this.mesh.position.clone());
    const positions = new Float32Array(this.trailPositions.length * 3);
    for (let i = 0; i < this.trailPositions.length; i++) {
      positions[i * 3] = this.trailPositions[i]!.x;
      positions[i * 3 + 1] = this.trailPositions[i]!.y;
      positions[i * 3 + 2] = this.trailPositions[i]!.z;
    }
    this.trail.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.trail.geometry.attributes['position']!.needsUpdate = true;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    scene.remove(this.trail);
    this.trail.geometry.dispose();
    (this.trail.material as THREE.Material).dispose();
  }
}

// ─── Effect entry ────────────────────────────────────────

interface TalismanEffect {
  mesh: THREE.Mesh;
  timer: number;
}
