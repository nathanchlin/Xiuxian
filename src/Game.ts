import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine, type EngineConfig } from './shared/Engine';
import { Input } from './shared/Input';
import { Sfx } from './shared/Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import { Arena } from './world/Arena';
import { SkillSystem, type SkillHitResult } from './player/SkillSystem';
import { Enemy } from './enemy/Enemy';
import { Boss } from './enemy/Boss';
import { Hud } from './ui/Hud';
import { PlayerModel } from './player/PlayerModel';
import { TalismanSystem } from './player/TalismanSystem';
import { Pickup, type PickupType, randomTalismanType, type TalismanTypeName } from './world/Pickup';
import { Inventory } from './player/Inventory';
import { InventoryPanel } from './ui/InventoryPanel';
import { DamageNumbers } from './ui/DamageNumbers';
import { DeathBurst } from './shared/DeathBurst';
import type { EnemyTypeName } from './enemy/enemy-types';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly flight: FlightController;
  readonly cameraSystem: CameraSystem;
  readonly skillSystem: SkillSystem;
  readonly hud: Hud;

  private _state: GameState = 'menu';

  get state(): GameState { return this._state; }
  private set state(v: GameState) { this._state = v; }
  private arena!: Arena;
  private playerModel!: PlayerModel;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private pickups: Pickup[] = [];
  readonly talismanSystem: TalismanSystem;
  readonly inventory: Inventory;
  readonly inventoryPanel: InventoryPanel;
  private damageNumbers!: DamageNumbers;
  private deathBurst!: DeathBurst;
  private lootDrops: Pickup[] = [];
  private talismanDrops: Pickup[] = [];

  // ─── Dash trail afterimages ───
  private dashAfterimages: { mesh: THREE.Mesh; life: number }[] = [];
  private dashTrailTimer = 0;

  private level = 1;
  private wave = 0;
  private kills = 0;
  private startTime = 0;
  private nextEnemyId = 1;

  // ─── Combo ───
  private comboCount = 0;
  private comboTimer = 0;
  private comboMultiplier = 1.0;
  private maxCombo = 0;

  private restTimer = 0;
  private briefingTimer = 0;

  constructor(container: HTMLElement) {
    const engineCfg: EngineConfig = {
      fogColor: CONFIG.render.fogColor,
      fogDensity: CONFIG.render.fogDensity,
      fov: CONFIG.render.fov,
      near: CONFIG.render.near,
      far: CONFIG.render.far,
      cameraY: CONFIG.player.startHeight,
      cameraZ: 0,
    };
    this.engine = new Engine(container, engineCfg);
    this.input = new Input(this.engine.renderer.domElement);
    this.sfx = new Sfx();
    this.hud = new Hud();

    this.flight = new FlightController(this.input);
    this.cameraSystem = new CameraSystem(this.engine.camera);
    this.skillSystem = new SkillSystem(this.flight, this.engine.scene, this.sfx);
    this.talismanSystem = new TalismanSystem(this.flight, this.engine.scene, this.sfx);
    this.inventory = new Inventory();
    this.inventoryPanel = new InventoryPanel();
    this.damageNumbers = new DamageNumbers(this.engine.scene);
    this.deathBurst = new DeathBurst(this.engine.scene);
    this.setupInventoryCallbacks();

    // ── Key bindings ───────────────────────────────────────────────
    this.input.registerKey('v', () => {
      if (this.state === 'playing') this.cameraSystem.toggleMode();
    });

    this.input.registerKey('shift', () => {
      if (this.state !== 'playing') return;
      if (this.flight.tryBoost()) {
        this.sfx.boost();
      }
    });

    this.input.registerKey('1', () => {
      if (this.state !== 'playing') return;
      this.skillSystem.fireBladeFan();
    });

    this.input.registerKey('2', () => {
      if (this.state !== 'playing') return;
      this.skillSystem.activateSwordDash();
    });

    this.input.registerKey('3', () => {
      if (this.state !== 'playing') return;
      this.skillSystem.activateParry();
    });

    this.input.registerKey('b', () => {
      if (this.state !== 'playing' && this.state !== 'paused') return;
      this.toggleInventoryPanel();
    });

    // Mouse click fires skills
    this.input.onMouseDown.push(() => {
      if (this.state !== 'playing') return;
      if (this.flight.swordIntent >= CONFIG.skills.finalStrike.requiredIntent) {
        if (this.skillSystem.tryFinalStrike()) return;
      }
      const hit = this.skillSystem.fireNormalBeam();
      if (hit) this.onSkillHit(hit);
    });

    // Main update loop
    this.engine.addUpdater((dt) => this.update(dt));

    // Pause when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.state = 'paused';
        this.input.exitPointerLock();
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     START / RESTART
     ═══════════════════════════════════════════════════════════════════ */

  start(): void {
    this.sfx.unlock();
    this.input.requestPointerLock();
    this.startTime = performance.now() / 1000;
    this.kills = 0;
    this.state = 'briefing';
    this.briefingTimer = 1.0;
    this.initLevel(1);
    this.engine.start();
  }

  private restart(): void {
    // Clean up old state
    this.clearEnemies();
    if (this.arena) this.arena.dispose(this.engine.scene);
    this.hud.hideEndScreens();

    this.level = 1;
    this.wave = 0;
    this.kills = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMultiplier = 1.0;
    this.maxCombo = 0;
    this.nextEnemyId = 1;
    this.restTimer = 0;
    this.dashTrailTimer = 0;
    for (const ai of this.dashAfterimages) {
      this.engine.scene.remove(ai.mesh);
      ai.mesh.geometry.dispose();
      (ai.mesh.material as THREE.MeshBasicMaterial).dispose();
    }
    this.dashAfterimages.length = 0;
    this.startTime = performance.now() / 1000;

    // Reset player
    this.flight.hp = this.getEffectiveMaxHealth();
    this.flight.spirit = this.getEffectiveMaxSpirit();
    this.flight.alive = true;
    this.flight.teleportTo(0, CONFIG.player.startHeight, 0);

    // Snap camera to player — eliminates spring-catch-up lag after teleport
    this.cameraSystem.snapTo(this.flight);

    this.talismanSystem.reset();
    for (const d of this.talismanDrops) d.dispose(this.engine.scene);
    this.talismanDrops = [];
    for (const d of this.lootDrops) d.dispose(this.engine.scene);
    this.lootDrops = [];
    this.inventory.reset();

    this.flight.skillKills = { bladeFan: 0, swordDash: 0, parry: 0, finalStrike: 0 };

    this.initLevel(1);
    this.state = 'briefing';
    this.briefingTimer = 1.0;
  }

  /** Resume from paused state (tab hidden, ESC, etc.) */
  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     LEVEL INITIALIZATION
     ═══════════════════════════════════════════════════════════════════ */

  private initLevel(level: number): void {
    this.level = level;
    this.wave = 0;
    this.restTimer = 0;

    // Dispose old pickups
    for (const p of this.pickups) p.dispose(this.engine.scene);
    this.pickups = [];
    for (const d of this.talismanDrops) d.dispose(this.engine.scene);
    this.talismanDrops = [];
    for (const d of this.lootDrops) d.dispose(this.engine.scene);
    this.lootDrops = [];

    // Dispose old arena
    if (this.arena) this.arena.dispose(this.engine.scene);
    this.clearEnemies();

    // Create new arena
    this.arena = new Arena(this.engine.scene, level);

    // Create player model (once)
    if (!this.playerModel) {
      this.playerModel = new PlayerModel(this.engine.scene);
    }

    // Reset player
    this.flight.hp = this.getEffectiveMaxHealth();
    this.flight.spirit = this.getEffectiveMaxSpirit();
    this.flight.alive = true;
    this.flight.teleportTo(0, CONFIG.player.startHeight, 0);

    // Snap camera to player — eliminates spring-catch-up lag after teleport
    this.cameraSystem.snapTo(this.flight);

    // HUD updates
    this.hud.setLevel(level);
    this.hud.setWave(1, CONFIG.progression.wavesPerLevel);
    this.hud.showAnnouncement(`第 ${level} 关`, '#daa520');
    this.hud.setHp(this.flight.hp, this.getEffectiveMaxHealth());
    this.hud.setSpirit(this.flight.spirit, this.getEffectiveMaxSpirit());
    this.nextWave();

    // Spawn pickups from arena spots
    this.spawnPickups();
  }

  /* ═══════════════════════════════════════════════════════════════════
     WAVE SYSTEM
     ═══════════════════════════════════════════════════════════════════ */

  private nextWave(): void {
    this.wave++;
    console.log(`[WAVE] Starting wave ${this.wave}, enemies before: ${this.enemies.length}`);
    this.hud.setWave(this.wave, CONFIG.progression.wavesPerLevel);

    const isBossLevel = (CONFIG.progression.bossLevels as readonly number[]).includes(this.level);
    const isFinalWave = this.wave >= CONFIG.progression.wavesPerLevel;

    if (isBossLevel && isFinalWave) {
      this.spawnBoss();
      this.hud.showAnnouncement('妖王降临', '#c0392b');
    } else {
      this.spawnEnemies();
      this.hud.showAnnouncement(`第 ${this.wave} 波`, '#88aaff');
    }

    this.updateSkillTargets();
  }

  private spawnEnemies(): void {
    const count = Math.floor(
      CONFIG.progression.scaling.enemyCountBase +
      CONFIG.progression.scaling.enemyCountPerLevel * this.level,
    );
    console.log(`[WAVE] spawnEnemies: count=${count}, level=${this.level}, wave=${this.wave}`);

    const types = this.getEnemyTypesForLevel(this.level);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 40 + Math.random() * 30;
      const spawn = new THREE.Vector3(
        this.flight.position.x + Math.cos(angle) * dist,
        40 + Math.random() * 40,
        this.flight.position.z + Math.sin(angle) * dist,
      );
      const typeName = types[i % types.length]!;
      const enemy = new Enemy(this.nextEnemyId++, spawn, typeName, this.level, this.engine.scene);
      this.enemies.push(enemy);
    }
  }

  private spawnBoss(): void {
    const spawn = new THREE.Vector3(
      this.flight.position.x + 80,
      60,
      this.flight.position.z,
    );
    this.boss = new Boss(this.nextEnemyId++, spawn, this.level, this.engine.scene);

    this.boss.onSummon = (count, pos) => {
      for (let i = 0; i < count; i++) {
        const offset = new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 40,
        );
        const s = pos.clone().add(offset);
        const enemy = new Enemy(this.nextEnemyId++, s, 'crow', this.level, this.engine.scene);
        this.enemies.push(enemy);
      }
      this.updateSkillTargets();
    };

    this.boss.onPhaseChange = (phase) => {
      this.sfx.bossPhaseChange();
      this.hud.showBossPhase(phase);
      this.deathBurst.spawn(this.boss!.position.clone(), CONFIG.boss.color, 15);
      this.cameraSystem.shake(1.0, 0.3);
    };
  }

  private getEnemyTypesForLevel(level: number): EnemyTypeName[] {
    if (level <= 3) return ['crow'];
    if (level <= 6) return ['crow', 'serpent'];
    if (level <= 9) return ['crow', 'serpent', 'dragon'];
    return ['serpent', 'dragon'];
  }

  private clearEnemies(): void {
    for (const e of this.enemies) e.dispose(this.engine.scene);
    this.enemies = [];
    if (this.boss) {
      this.boss.dispose(this.engine.scene);
      this.boss = null;
    }
  }

  private spawnPickups(): void {
    for (const p of this.pickups) p.dispose(this.engine.scene);
    this.pickups = [];
    const spots = this.arena.pickupSpots.slice(0, 10);

    const basicTypes: PickupType[] = ['spirit', 'health', 'spirit'];
    for (let i = 0; i < Math.min(basicTypes.length, spots.length); i++) {
      this.pickups.push(new Pickup(basicTypes[i]!, spots[i]!, this.engine.scene));
    }

    const chestCount = CONFIG.talismans.chestPerLevel;
    for (let i = basicTypes.length; i < basicTypes.length + chestCount && i < spots.length; i++) {
      this.pickups.push(new Pickup('chest', spots[i]!, this.engine.scene));
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     MAIN UPDATE LOOP
     ═══════════════════════════════════════════════════════════════════ */

  private update(dt: number): void {
    // Paused (inventory open)
    if (this.state === 'paused') return;

    // Briefing countdown
    if (this.state === 'briefing') {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) {
        this.state = 'playing';
      }
      // Update camera + player model during briefing so scene is visible
      this.cameraSystem.update(dt, this.flight);
      if (this.playerModel) this.playerModel.update(this.flight, this.cameraSystem, dt);
      return;
    }

    if (this.state !== 'playing') return;

    // 1. Flight controller
    this.flight.update(dt);

    // 2. Arena collision
    const resolved = this.arena.resolveSphereVsBuildings(
      this.flight.position.x,
      this.flight.position.y,
      this.flight.position.z,
      CONFIG.flight.playerRadius,
    );
    this.flight.position.set(resolved.x, resolved.y, resolved.z);

    // 3. Camera
    this.cameraSystem.update(dt, this.flight);

    // 3.5 Player model (third-person visible mesh)
    if (this.playerModel) this.playerModel.update(this.flight, this.cameraSystem, dt);

    // 3.6 Dash afterimage trail
    if (this.flight.dashing) {
      this.dashTrailTimer -= dt;
      if (this.dashTrailTimer <= 0) {
        this.dashTrailTimer = 0.03;
        const geo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
        const mat = new THREE.MeshBasicMaterial({
          color: 0x44ffcc, transparent: true, opacity: 0.5,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(this.flight.position);
        mesh.quaternion.copy(this.flight.quaternion);
        mesh.renderOrder = 999;
        this.engine.scene.add(mesh);
        this.dashAfterimages.push({ mesh, life: 0.35 });
      }
    }
    for (let i = this.dashAfterimages.length - 1; i >= 0; i--) {
      const ai = this.dashAfterimages[i];
      ai.life -= dt;
      const mat = ai.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, ai.life / 0.35) * 0.5;
      ai.mesh.scale.multiplyScalar(0.97);
      if (ai.life <= 0) {
        this.engine.scene.remove(ai.mesh);
        ai.mesh.geometry.dispose();
        mat.dispose();
        this.dashAfterimages.splice(i, 1);
      }
    }

    // 4. Skill system
    this.skillSystem.update(dt);

    // Process blade hits
    for (const hit of this.skillSystem.consumeBladeHits()) {
      this.onSkillHit(hit, 'bladeFan');
    }

    // Process dash hits
    for (const id of this.skillSystem.consumeDashHits()) {
      this.onSkillHit({ targetId: id, damage: this.skillSystem.getScaledSwordDashDamage() }, 'swordDash');
    }

    // Final strike release when charge completes
    if (this.skillSystem.isCharging() && this.skillSystem.chargeTimer <= 0) {
      const hits = this.skillSystem.releaseFinalStrike();
      for (const hit of hits) {
        this.onSkillHit(hit, 'finalStrike');
      }
    }

    // 4.5 Talisman system
    this.talismanSystem.update(dt);
    for (const hit of this.talismanSystem.consumeHits()) {
      for (const id of hit.targetIds) {
        this.onSkillHit({ targetId: id, damage: hit.damage });
      }
    }
    const heal = this.talismanSystem.consumeHeal();
    if (heal > 0) {
      this.flight.hp = Math.min(this.getEffectiveMaxHealth(), this.flight.hp + heal);
    }
    for (const name of this.talismanSystem.consumeExpired()) {
      this.hud.showKill(`${name} 已耗尽`);
      this.sfx.talismanExpire();
    }

    // 5. Enemy updates + damage to player
    const playerPos = this.flight.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const result = enemy.update(dt, playerPos);
      if (result.attacked) {
        const parryResult = this.skillSystem.tryParryReflect();
        if (parryResult.reflected) {
          const killed = enemy.takeDamage(parryResult.reflectDamage);
          if (killed) {
            this.onEnemyKilled(enemy.typeName, enemy.position.clone());
            const leveledUp = this.flight.addSkillKill('parry');
            if (leveledUp) {
              this.hud.showSkillLevelUp('剑气护体', this.flight.getSkillLevel('parry'));
            }
          }
          this.hud.flashHitMarker();
        } else {
          this.applyDamageToPlayer(result.damage, enemy.position);
        }
      }
    }

    // 6. Boss update
    if (this.boss && this.boss.alive) {
      const bossResult = this.boss.update(dt, playerPos);
      if (bossResult.attacked) {
        const parryResult = this.skillSystem.tryParryReflect();
        if (parryResult.reflected) {
          const killed = this.boss.takeDamage(parryResult.reflectDamage);
          if (killed) {
            this.onBossKilled();
            const leveledUp = this.flight.addSkillKill('parry');
            if (leveledUp) {
              this.hud.showSkillLevelUp('剑气护体', this.flight.getSkillLevel('parry'));
            }
          }
          this.hud.flashHitMarker();
        } else {
          this.applyDamageToPlayer(bossResult.damage, this.boss.position);
        }
      }
    }

    // 7. Pickup collection (pickups + talisman drops + loot drops)
    const allPickups = [...this.pickups, ...this.talismanDrops, ...this.lootDrops];
    for (const pickup of allPickups) {
      pickup.attract(this.flight.position, dt);
      pickup.update(dt);
      if (pickup.checkCollect(this.flight.position, CONFIG.flight.playerRadius)) {
        const loot = pickup.collect();
        if (loot.health > 0) {
            this.flight.hp = Math.min(this.getEffectiveMaxHealth(), this.flight.hp + loot.health);
            this.damageNumbers.spawn(this.flight.position.clone(), loot.health, 0x44ff44, '+');
            this.sfx.pickup();
          }
          if (loot.spirit > 0) {
            this.flight.spirit = Math.min(this.getEffectiveMaxSpirit(), this.flight.spirit + loot.spirit);
            this.damageNumbers.spawn(this.flight.position.clone(), loot.spirit, 0x44aaff, '+');
            this.sfx.pickup();
          }
        if (loot.talismanType) {
          this.equipTalisman(loot.talismanType);
        } else if (loot.cultivationExp > 0) {
          const leveledUp = this.inventory.addCultivationExp(loot.cultivationExp);
          if (leveledUp) {
            this.hud.showKill(`修为突破 — 第${this.inventory.cultivationLevel}层`);
            this.hud.showBreakthroughFlash();
            this.cameraSystem.shake(0.8, 0.3);
            this.deathBurst.spawn(this.flight.position.clone(), 0xffd700, 8);
            this.sfx.levelComplete();
          }
        } else if (loot.itemId && loot.itemType) {
          this.inventory.addItem(loot.itemId, loot.itemType);
          const itemName = this.getItemName(loot.itemId);
          this.hud.showKill(`获得 ${itemName}`);
          this.sfx.chestOpen();
        } else {
          this.sfx.chestOpen();
        }
      }
    }
    this.talismanDrops = this.talismanDrops.filter(d => {
      if (d.collected) {
        d.dispose(this.engine.scene);
        return false;
      }
      return true;
    });
    this.lootDrops = this.lootDrops.filter(d => {
      if (d.collected) {
        d.dispose(this.engine.scene);
        return false;
      }
      return true;
    });

    // 9. Wave progression — check if all enemies dead
    const aliveEnemies = this.enemies.filter((e) => e.alive).length;
    const bossAlive = this.boss ? this.boss.alive : false;

    if (aliveEnemies === 0 && !bossAlive && this.restTimer <= 0) {
      console.log(`[WAVE] All enemies dead. wave=${this.wave}, wavesPerLevel=${CONFIG.progression.wavesPerLevel}`);
      if (this.wave >= CONFIG.progression.wavesPerLevel) {
        this.onLevelComplete();
        return;
      } else {
        this.restTimer = CONFIG.progression.waveRestTime;
        this.hud.showKill(`第 ${this.wave + 1} 波即将来袭...`);
      }
    }

    // 10. Rest timer countdown
    if (this.restTimer > 0) {
      this.restTimer -= dt;
      this.hud.setWaveCountdown(this.restTimer);
      if (this.restTimer <= 0) {
        this.restTimer = 0;
        this.hud.setWaveCountdown(0);
        // Clear dead enemies before spawning new wave
        this.enemies = this.enemies.filter((e) => e.alive);
        this.nextWave();
      }
    }

    // 11. Update weapon targets (alive enemies + boss)
    this.updateSkillTargets();

    // 11.5 Auto-use consumables when HP/Spirit low
    this.autoUseConsumables();

    // 11.6 Update damage numbers + death particles
    this.damageNumbers.update(dt);
    this.deathBurst.update(dt);

    // 12. Update HUD
    this.updateHud();

    // 13. Combo decay
    this.updateCombo(dt);
  }

  /* ═══════════════════════════════════════════════════════════════════
     DAMAGE & COMBAT
     ═══════════════════════════════════════════════════════════════════ */

  private applyDamageToPlayer(damage: number, sourcePos?: THREE.Vector3): void {
    const died = this.flight.takeDamage(damage);
    this.sfx.damage();
    this.hud.flashDamage();
    this.cameraSystem.shake(0.6, 0.15);
    if (this.playerModel) this.playerModel.flashDamage();
    if (sourcePos) {
      this.hud.flashDamageDirection(sourcePos, this.flight.position, this.flight.quaternion);
      // Knockback impulse away from damage source
      const knockDir = this.flight.position.clone().sub(sourcePos).normalize();
      knockDir.y = Math.max(knockDir.y, 0.3); // slight upward push
      this.flight.velocity.add(knockDir.multiplyScalar(15));
    }
    if (died) this.onDeath();
  }

  private onSkillHit(hit: SkillHitResult, skillName?: string): void {
    this.hud.flashHitMarker();

    // Apply combo multiplier to damage
    const finalDamage = Math.round(hit.damage * this.comboMultiplier);

    // Show damage number at the target's position
    const targetEnemy = this.enemies.find(e => e.id === hit.targetId && e.alive);
    const targetBoss = (!targetEnemy && this.boss?.id === hit.targetId && this.boss.alive) ? this.boss : null;
    const targetPos = targetEnemy?.position ?? targetBoss?.position;
    if (targetPos) {
      this.damageNumbers.spawn(targetPos, finalDamage);
    }

    for (const enemy of this.enemies) {
      if (enemy.id === hit.targetId && enemy.alive) {
        const killed = enemy.takeDamage(finalDamage);
        if (killed) {
          this.onEnemyKilled(enemy.typeName, enemy.position.clone());
          if (skillName) {
            const leveledUp = this.flight.addSkillKill(skillName);
            if (leveledUp) {
              const level = this.flight.getSkillLevel(skillName);
              const names: Record<string, string> = {
                bladeFan: '万剑齐发', swordDash: '御剑突刺',
                parry: '剑气护体', finalStrike: '万剑归宗',
              };
              this.hud.showSkillLevelUp(names[skillName] ?? skillName, level);
            }
          }
        }
        return;
      }
    }

    if (this.boss && this.boss.id === hit.targetId && this.boss.alive) {
      const killed = this.boss.takeDamage(finalDamage);
      if (killed) {
        this.onBossKilled();
        if (skillName) {
          const leveledUp = this.flight.addSkillKill(skillName);
          if (leveledUp) {
            const level = this.flight.getSkillLevel(skillName);
            const names: Record<string, string> = {
              bladeFan: '灵刃散射', swordDash: '御剑突刺',
              parry: '剑气护体', finalStrike: '万剑归宗',
            };
            this.hud.showSkillLevelUp(names[skillName] ?? skillName, level);
          }
        }
      }
    }
  }

  private onEnemyKilled(typeName: string, position?: THREE.Vector3): void {
    this.kills++;
    this.registerCombo();
    this.sfx.enemyDie();
    this.hud.showKill(`${typeName} 已斩`);
    if (position) this.deathBurst.spawn(position, this.getEnemyColor(typeName));

    if (position) {
      // Talisman drops (existing system)
      const dropRate = CONFIG.talismans.dropRates[typeName] ?? 0;
      if (Math.random() < dropRate) {
        const tType = randomTalismanType();
        const drop = new Pickup('talisman_drop', position, this.engine.scene, { talismanType: tType });
        this.talismanDrops.push(drop);
      }

      // New loot drops
      this.spawnLootDrops(typeName, position);
    }
  }

  private onBossKilled(): void {
    this.kills++;
    this.registerCombo();
    this.sfx.enemyDie();
    this.hud.showKill('妖王已诛!');
    this.deathBurst.spawn(this.boss!.position, CONFIG.boss.color, 30);

    if (this.boss) {
      const pos = this.boss.position.clone();
      const tType = randomTalismanType();
      const drop = new Pickup('talisman_drop', pos, this.engine.scene, { talismanType: tType });
      this.talismanDrops.push(drop);

      // Boss always drops good loot
      this.spawnLootDrops('boss', pos);
    }
  }

  private registerCombo(): void {
    this.comboCount++;
    if (this.comboCount > this.maxCombo) this.maxCombo = this.comboCount;
    this.comboTimer = CONFIG.skills.combo.timeout;
    this.comboMultiplier = Math.min(
      CONFIG.skills.combo.maxMultiplier,
      1.0 + (this.comboCount - 1) * CONFIG.skills.combo.damagePerHit,
    );
    this.hud.setCombo(this.comboCount, this.comboMultiplier);
  }

  private updateCombo(dt: number): void {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboMultiplier = 1.0;
        this.hud.setCombo(0, 1.0);
      }
    }
  }

  private spawnLootDrops(typeName: string, position: THREE.Vector3): void {
    const table = CONFIG.items.dropTable[typeName];
    if (!table) return;
    const offset = () => new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 2, (Math.random() - 0.5) * 6);

    // Cultivation exp orb (always drops)
    const expAmount = CONFIG.items.cultivation.dropAmounts[typeName] ?? 5;
    const orbPos = position.clone().add(offset());
    this.lootDrops.push(new Pickup('cultivation_orb', orbPos, this.engine.scene, { cultivationExp: expAmount }));

    // Skill book
    if (Math.random() < table.skillBook) {
      const bookKeys = Object.keys(CONFIG.items.skillBooks);
      const bookId = bookKeys[Math.floor(Math.random() * bookKeys.length)]!;
      const dropPos = position.clone().add(offset());
      this.lootDrops.push(new Pickup('skill_book', dropPos, this.engine.scene, { itemId: bookId, itemType: 'skill_book' }));
    }

    // Treasure
    if (Math.random() < table.treasure) {
      const treasureKeys = Object.keys(CONFIG.items.treasures);
      const treasureId = treasureKeys[Math.floor(Math.random() * treasureKeys.length)]!;
      const dropPos = position.clone().add(offset());
      this.lootDrops.push(new Pickup('treasure_drop', dropPos, this.engine.scene, { itemId: treasureId, itemType: 'treasure' }));
    }

    // Consumable
    if (Math.random() < table.consumable) {
      const conKeys = Object.keys(CONFIG.items.consumables);
      const conId = conKeys[Math.floor(Math.random() * conKeys.length)]!;
      const dropPos = position.clone().add(offset());
      this.lootDrops.push(new Pickup('consumable_drop', dropPos, this.engine.scene, { itemId: conId, itemType: 'consumable' }));
    }
  }

  private equipTalisman(type: TalismanTypeName): void {
    this.talismanSystem.equip(type);
    const cfg = CONFIG.talismans.types[type];
    this.hud.showTalismanPickup(cfg.name, cfg.description);
    this.sfx.talismanEquip();
  }

  /* ═══════════════════════════════════════════════════════════════════
     DEATH / LEVEL COMPLETE
     ═══════════════════════════════════════════════════════════════════ */

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();

    // Death burst particles at player position
    this.deathBurst.spawn(this.flight.position.clone(), 0x4488ff, 20);
    // Hide player model so burst is visible
    if (this.playerModel) this.playerModel.group.visible = false;

    const elapsed = performance.now() / 1000 - this.startTime;
    const isNewBest = this.saveHighScore(this.level, this.kills, elapsed);
    this.hud.showGameOver({ level: this.level, kills: this.kills, time: elapsed, maxCombo: this.maxCombo, newBest: isNewBest });

    // Bind restart button (created dynamically by HUD)
    requestAnimationFrame(() => {
      const btn = document.getElementById('hud-restart');
      if (btn) btn.addEventListener('click', () => {
        this.input.requestPointerLock();
        this.restart();
      });
    });
  }

  private onLevelComplete(): void {
    if (this.level >= CONFIG.progression.totalLevels) {
      this.state = 'game_over';
      this.sfx.levelComplete();
      this.input.exitPointerLock();
      const elapsed = performance.now() / 1000 - this.startTime;
      const isNewBest = this.saveHighScore(this.level, this.kills, elapsed);
      this.hud.showVictory({ level: this.level, kills: this.kills, time: elapsed, maxCombo: this.maxCombo, newBest: isNewBest });
      requestAnimationFrame(() => {
        const btn = document.getElementById('hud-restart');
        if (btn) btn.addEventListener('click', () => this.restart());
      });
      return;
    }

    this.state = 'level_complete';
    this.sfx.levelComplete();
    this.input.exitPointerLock();

    const hpPct = this.flight.hp / this.getEffectiveMaxHealth();
    let grade: string;
    if (hpPct >= 0.9) grade = 'S';
    else if (hpPct >= 0.7) grade = 'A';
    else if (hpPct >= 0.4) grade = 'B';
    else grade = 'C';

    this.hud.showLevelComplete(this.level, grade, { kills: this.kills, maxCombo: this.maxCombo });

    // Bind next-level button
    requestAnimationFrame(() => {
      const btn = document.getElementById('hud-next-level');
      if (btn) {
        btn.addEventListener('click', () => {
          this.hud.hideEndScreens();
          this.initLevel(this.level + 1);
          this.state = 'briefing';
          this.briefingTimer = 1.0;
          this.input.requestPointerLock();
        });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════════ */

  private getEffectiveMaxHealth(): number {
    const bonuses = this.inventory.getStatBonuses();
    return Math.floor(CONFIG.player.maxHealth * (1 + bonuses.hp));
  }

  private getEffectiveMaxSpirit(): number {
    const bonuses = this.inventory.getStatBonuses();
    return Math.floor(CONFIG.spirit.maxSpirit * (1 + bonuses.spirit));
  }

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

  private getEnemyColor(typeName: string): number {
    const colors: Record<string, number> = { crow: 0x444444, serpent: 0x22cc44, dragon: 0xff4444 };
    return colors[typeName] ?? 0xffffff;
  }

  /** Save high score to localStorage. Returns true if new best. */
  private saveHighScore(level: number, kills: number, time: number): boolean {
    try {
      const key = 'xiuxian_best';
      const prev = JSON.parse(localStorage.getItem(key) ?? '{"level":0,"kills":0}');
      const isNewBest = level > prev.level || (level === prev.level && kills > prev.kills);
      if (isNewBest) {
        localStorage.setItem(key, JSON.stringify({ level, kills, time: Math.floor(time) }));
      }
      return isNewBest;
    } catch {
      return false;
    }
  }

  private getItemName(id: string): string {
    const books = CONFIG.items.skillBooks as Record<string, { name: string }>;
    const treasures = CONFIG.items.treasures as Record<string, { name: string }>;
    const consumables = CONFIG.items.consumables as Record<string, { name: string }>;
    return books[id]?.name ?? treasures[id]?.name ?? consumables[id]?.name ?? id;
  }

  private autoUseConsumables(): void {
    const hpPct = this.flight.hp / this.getEffectiveMaxHealth();
    const spPct = this.flight.spirit / this.getEffectiveMaxSpirit();

    // Auto HP pill when below 40%
    if (hpPct < 0.4) {
      const pill = this.inventory.getItem('pill_hp');
      if (pill && pill.count > 0) {
        this.inventory.removeItem('pill_hp');
        const cfg = CONFIG.items.consumables['pill_hp'] as { value: number };
        this.flight.hp = Math.min(this.getEffectiveMaxHealth(), this.flight.hp + cfg.value);
        this.hud.showKill('自动服用 回血丹');
      }
    }

    // Auto Spirit pill when below 20%
    if (spPct < 0.2) {
      const pill = this.inventory.getItem('pill_spirit');
      if (pill && pill.count > 0) {
        this.inventory.removeItem('pill_spirit');
        const cfg = CONFIG.items.consumables['pill_spirit'] as { value: number };
        this.flight.spirit = Math.min(this.getEffectiveMaxSpirit(), this.flight.spirit + cfg.value);
        this.hud.showKill('自动服用 聚灵丹');
      }
    }
  }

  private updateHud(): void {
    const bonuses = this.inventory.getStatBonuses();
    this.skillSystem.setDamageBonus(bonuses.damage);
    this.flight.speedBonus = bonuses.speed;
    this.flight.spiritBonus = bonuses.spirit;
    this.flight.parryWindowBonus = bonuses.parryWindow;
    this.hud.setHp(this.flight.hp, this.getEffectiveMaxHealth());
    this.hud.setSpirit(this.flight.spirit, this.getEffectiveMaxSpirit());
    this.hud.setAltitude(this.flight.getAltitude());
    this.hud.setSpeed(this.flight.getSpeed());
    // Cultivation level + exp progress
    const nextExp = this.inventory.getExpForNextLevel();
    const curExp = this.inventory.cultivationExp;
    const prevLevelExp = this.inventory.cultivationLevel > 0
      ? (CONFIG.items.cultivation.expPerLevel[this.inventory.cultivationLevel] ?? 0)
      : 0;
    const expPct = nextExp === Infinity ? 1 : (curExp - prevLevelExp) / (nextExp - prevLevelExp);
    this.hud.setCultivationLevel(this.inventory.cultivationLevel, Math.max(0, Math.min(1, expPct)));
    if (this.playerModel) this.playerModel.setCultivationLevel(this.inventory.cultivationLevel);
    const boost = this.flight.getBoostState();
    this.hud.setBoost(boost.active ? 1 : boost.cooldownPct);

    const aliveCount = this.enemies.filter((e) => e.alive).length + (this.boss?.alive ? 1 : 0);
    this.hud.setEnemyCount(aliveCount);
    this.hud.setKillCount(this.kills);
    this.hud.setTimer(performance.now() / 1000 - this.startTime);

    // Crosshair lock: check if any enemy is in the forward aim cone
    const origin = this.flight.position;
    const forward = this.flight.getForward();
    let locked = false;
    const beamRange = CONFIG.weapons.beam.maxRange;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const toTarget = e.position.clone().sub(origin);
      const dist = toTarget.length();
      if (dist > beamRange) continue;
      if (toTarget.normalize().dot(forward) > 0.3) { locked = true; break; }
    }
    if (!locked && this.boss?.alive) {
      const toTarget = this.boss.position.clone().sub(origin);
      if (toTarget.length() <= beamRange && toTarget.normalize().dot(forward) > 0.3) locked = true;
    }
    this.hud.setCrosshairLocked(locked);

    // Boss HP bar on HUD
    if (this.boss && this.boss.alive) {
      this.hud.setBossHpVisible(true);
      this.hud.setBossHp(this.boss.hp, this.boss.maxHp);
    } else {
      this.hud.setBossHpVisible(false);
    }

    // Skill HUD
    const intent = this.flight.swordIntent;
    const maxIntent = CONFIG.skills.swordIntent.maxStacks;
    this.hud.setSwordIntent(intent, maxIntent);

    const cds = this.skillSystem.getCooldowns();
    this.hud.setSkillCooldowns(cds.bladeFan, cds.swordDash, cds.parry, {
      bladeFan: CONFIG.skills.bladeFan.spiritCost,
      swordDash: CONFIG.skills.swordDash.spiritCost,
      parry: CONFIG.skills.parry.spiritCost,
    });
    this.hud.setFinalStrikeReady(intent >= maxIntent);

    // Skill levels
    this.hud.setSkillLevels(
      this.flight.getSkillLevel('bladeFan'),
      this.flight.getSkillLevel('swordDash'),
      this.flight.getSkillLevel('parry'),
    );

    const tSlots = this.talismanSystem.getSlots();
    this.hud.setTalismanSlots(tSlots.map(s => {
      if (!s) return null;
      const cfg = CONFIG.talismans.types[s.type];
      return { type: s.type, durability: s.durability, color: cfg.color };
    }));

    // Radar
    const euler = new THREE.Euler().setFromQuaternion(this.flight.quaternion, 'YXZ');
    const enemyBlips = this.enemies
      .filter((e) => e.alive)
      .map((e) => ({ x: e.position.x, z: e.position.z }));
    const bossBlip = this.boss?.alive
      ? { x: this.boss.position.x, z: this.boss.position.z }
      : undefined;
    const pickupBlips = [...this.pickups, ...this.talismanDrops, ...this.lootDrops]
      .filter(p => !p.collected)
      .map((p) => ({ x: p.position.x, z: p.position.z }));
    this.hud.updateRadar(
      this.flight.position.x,
      this.flight.position.z,
      euler.y,
      enemyBlips,
      pickupBlips,
      bossBlip,
    );

    // Enemy tracker arrows — show when few enemies remain
    const aliveEnemyList = this.enemies.filter(e => e.alive);
    const allTargets: Array<{ position: THREE.Vector3 }> = [...aliveEnemyList];
    if (this.boss?.alive) allTargets.push(this.boss);

    if (allTargets.length > 0 && allTargets.length <= 3) {
      const camera = this.engine.camera;
      const trackers: Array<{ ndcX: number; ndcY: number; isOnScreen: boolean; distance: number }> = [];

      for (const target of allTargets) {
        const pos = target.position.clone();
        const dist = pos.distanceTo(this.flight.position);

        // Project to NDC
        const ndc = pos.clone().project(camera);

        const isOnScreen =
          ndc.x >= -1 && ndc.x <= 1 &&
          ndc.y >= -1 && ndc.y <= 1 &&
          ndc.z > 0 && ndc.z < 1;

        if (!isOnScreen && ndc.z < 0) {
          // Behind camera — flip to show correct direction
          ndc.x = -ndc.x;
          ndc.y = -ndc.y;
        }

        trackers.push({ ndcX: ndc.x, ndcY: ndc.y, isOnScreen, distance: dist });
      }

      this.hud.updateTrackers(trackers);
    } else {
      this.hud.hideTrackers();
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     INVENTORY PANEL
     ═══════════════════════════════════════════════════════════════════ */

  toggleInventoryPanel(): void {
    if (this.inventoryPanel.isVisible()) {
      this.inventoryPanel.hide();
      this.state = 'playing';
      this.input.requestPointerLock();
    } else {
      this.inventoryPanel.show(this.inventory, this.flight);
      this.state = 'paused';
      this.input.exitPointerLock();
    }
  }

  private setupInventoryCallbacks(): void {
    this.inventoryPanel.onClose = () => this.toggleInventoryPanel();

    this.inventoryPanel.onUseSkillBook = (bookId: string) => {
      const bookCfg = (CONFIG.items.skillBooks as Record<string, { skill: string }>)[bookId];
      if (!bookCfg) return;
      if (!this.inventory.removeItem(bookId)) return;
      // Add kills to trigger level-up through existing system
      const killsNeeded = CONFIG.skills.growth.killsPerLevel;
      this.flight.skillKills[bookCfg.skill] = (this.flight.skillKills[bookCfg.skill] ?? 0) + killsNeeded;
      const names: Record<string, string> = {
        bladeFan: '灵刃散射', swordDash: '御剑突刺',
        parry: '剑气护体', finalStrike: '万剑归宗',
      };
      this.hud.showSkillLevelUp(names[bookCfg.skill] ?? bookCfg.skill, this.flight.getSkillLevel(bookCfg.skill));
    };

    this.inventoryPanel.onUseConsumable = (itemId: string) => {
      const cfg = (CONFIG.items.consumables as Record<string, { effect: string; value: number }>)[itemId];
      if (!cfg) return;
      if (!this.inventory.removeItem(itemId)) return;
      switch (cfg.effect) {
        case 'hp':
          this.flight.hp = Math.min(this.getEffectiveMaxHealth(), this.flight.hp + cfg.value);
          break;
        case 'spirit':
          this.flight.spirit = Math.min(this.getEffectiveMaxSpirit(), this.flight.spirit + cfg.value);
          break;
        case 'invincible':
          this.flight.dashInvincible = true;
          setTimeout(() => { this.flight.dashInvincible = false; }, cfg.value * 1000);
          break;
      }
    };

    this.inventoryPanel.onEquipTreasure = (itemId: string) => {
      this.inventory.equipTreasure(itemId);
    };

    this.inventoryPanel.onUnequipTreasure = (slotIdx: number) => {
      this.inventory.unequipTreasure(slotIdx);
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     DISPOSE
     ═══════════════════════════════════════════════════════════════════ */

  dispose(): void {
    this.clearEnemies();
    for (const p of this.pickups) p.dispose(this.engine.scene);
    this.talismanSystem.dispose();
    for (const d of this.talismanDrops) d.dispose(this.engine.scene);
    for (const d of this.lootDrops) d.dispose(this.engine.scene);
    if (this.arena) this.arena.dispose(this.engine.scene);
    this.playerModel?.dispose();
    this.inventoryPanel.dispose();
    this.damageNumbers.dispose();
    this.deathBurst.dispose();
    this.hud.dispose();
    this.flight.dispose();
    this.cameraSystem.dispose();
    this.skillSystem.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
