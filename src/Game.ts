import * as THREE from 'three';
import { CONFIG } from './config';
import { Engine, type EngineConfig } from './shared/Engine';
import { Input } from './shared/Input';
import { Sfx } from './shared/Sfx';
import { FlightController } from './player/FlightController';
import { CameraSystem } from './core/CameraSystem';
import { Arena } from './world/Arena';
import { WeaponSystem } from './player/WeaponSystem';
import { Enemy } from './enemy/Enemy';
import { Boss } from './enemy/Boss';
import { Hud } from './ui/Hud';
import { PlayerModel } from './player/PlayerModel';
import { Pickup, type PickupType } from './world/Pickup';
import type { EnemyTypeName } from './enemy/enemy-types';
import type { WeaponHitResult } from './player/WeaponSystem';

export type GameState = 'menu' | 'briefing' | 'playing' | 'paused' | 'dead' | 'level_complete' | 'game_over';

export class Game {
  readonly engine: Engine;
  readonly input: Input;
  readonly sfx: Sfx;
  readonly flight: FlightController;
  readonly cameraSystem: CameraSystem;
  readonly weaponSystem: WeaponSystem;
  readonly hud: Hud;

  private state: GameState = 'menu';
  private arena!: Arena;
  private playerModel!: PlayerModel;
  private enemies: Enemy[] = [];
  private boss: Boss | null = null;
  private pickups: Pickup[] = [];

  private level = 1;
  private wave = 0;
  private kills = 0;
  private startTime = 0;
  private nextEnemyId = 1;

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
    this.weaponSystem = new WeaponSystem(this.flight, this.engine.scene, this.sfx);

    // ── Key bindings ───────────────────────────────────────────────
    this.input.registerKey('v', () => {
      if (this.state === 'playing') this.cameraSystem.toggleMode();
    });

    this.input.registerKey('tab', () => {
      if (this.state !== 'playing') return;
      if (this.flight.tryBoost()) {
        this.sfx.boost();
      }
    });

    this.input.registerKey('f', () => {
      if (this.state !== 'playing') return;
      // Sword dash stub — will be implemented in WeaponSystem later
      this.sfx.swordDash();
    });

    // Mouse click fires Spirit Beam
    this.input.onMouseDown.push(() => {
      if (this.state !== 'playing') return;
      const hit = this.weaponSystem.fireBeam();
      if (hit) this.onWeaponHit(hit);
    });

    // Main update loop
    this.engine.addUpdater((dt) => this.update(dt));
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
    this.briefingTimer = 1.5;
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
    this.nextEnemyId = 1;
    this.restTimer = 0;
    this.startTime = performance.now() / 1000;

    // Reset player
    this.flight.hp = CONFIG.player.maxHealth;
    this.flight.spirit = CONFIG.spirit.maxSpirit;
    this.flight.alive = true;
    this.flight.teleportTo(0, CONFIG.player.startHeight, 0);

    this.initLevel(1);
    this.state = 'briefing';
    this.briefingTimer = 1.5;
    this.input.requestPointerLock();
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
    this.flight.hp = CONFIG.player.maxHealth;
    this.flight.spirit = CONFIG.spirit.maxSpirit;
    this.flight.alive = true;
    this.flight.teleportTo(0, CONFIG.player.startHeight, 0);

    // HUD updates
    this.hud.setLevel(level);
    this.hud.setWave(1, CONFIG.progression.wavesPerLevel);
    this.hud.setHp(this.flight.hp, CONFIG.player.maxHealth);
    this.hud.setSpirit(this.flight.spirit, CONFIG.spirit.maxSpirit);

    // Start first wave
    this.nextWave();

    // Spawn pickups from arena spots
    this.spawnPickups();
  }

  /* ═══════════════════════════════════════════════════════════════════
     WAVE SYSTEM
     ═══════════════════════════════════════════════════════════════════ */

  private nextWave(): void {
    this.wave++;
    this.hud.setWave(this.wave, CONFIG.progression.wavesPerLevel);

    const isBossLevel = (CONFIG.progression.bossLevels as readonly number[]).includes(this.level);
    const isFinalWave = this.wave >= CONFIG.progression.wavesPerLevel;

    if (isBossLevel && isFinalWave) {
      this.spawnBoss();
    } else {
      this.spawnEnemies();
    }

    this.updateWeaponTargets();
  }

  private spawnEnemies(): void {
    const count = Math.floor(
      CONFIG.progression.scaling.enemyCountBase +
      CONFIG.progression.scaling.enemyCountPerLevel * this.level,
    );

    const types = this.getEnemyTypesForLevel(this.level);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 80;
      const spawn = new THREE.Vector3(
        this.flight.position.x + Math.cos(angle) * dist,
        40 + Math.random() * 60,
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
      this.updateWeaponTargets();
    };

    this.boss.onPhaseChange = (phase) => {
      this.sfx.bossPhaseChange();
      this.hud.showBossPhase(phase);
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
    const types: PickupType[] = ['spirit', 'health', 'missile'];
    for (let i = 0; i < spots.length; i++) {
      const type = types[i % types.length]!;
      this.pickups.push(new Pickup(type, spots[i]!, this.engine.scene));
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     MAIN UPDATE LOOP
     ═══════════════════════════════════════════════════════════════════ */

  private update(dt: number): void {
    // Briefing countdown
    if (this.state === 'briefing') {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) {
        this.state = 'playing';
      }
      // Still render camera during briefing
      this.cameraSystem.update(dt, this.flight);
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
    if (this.playerModel) this.playerModel.update(this.flight, this.cameraSystem);

    // 4. Weapon system
    this.weaponSystem.update(dt);

    // 5. Enemy updates + damage to player
    const playerPos = this.flight.position;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const result = enemy.update(dt, playerPos);
      if (result.attacked) {
        this.applyDamageToPlayer(result.damage);
      }
    }

    // 6. Boss update
    if (this.boss && this.boss.alive) {
      const bossResult = this.boss.update(dt, playerPos);
      if (bossResult.attacked) {
        this.applyDamageToPlayer(bossResult.damage);
      }
    }

    // 7. Pickup collection
    for (const pickup of this.pickups) {
      pickup.update(dt);
      if (pickup.checkCollect(this.flight.position, CONFIG.flight.playerRadius)) {
        const loot = pickup.collect();
        if (loot.health > 0) this.flight.hp = Math.min(CONFIG.player.maxHealth, this.flight.hp + loot.health);
        if (loot.spirit > 0) this.flight.spirit = Math.min(CONFIG.spirit.maxSpirit, this.flight.spirit + loot.spirit);
        if (loot.missiles > 0) this.weaponSystem.addMissileAmmo(loot.missiles);
        this.sfx.chestOpen();
      }
    }

    // 8. Missile hit detection
    for (let mi = this.weaponSystem.missiles.length - 1; mi >= 0; mi--) {
      const missile = this.weaponSystem.missiles[mi]!;
      if (missile.expired) continue;

      // Check vs enemies
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        if (missile.checkHit(enemy.position, 2.5)) {
          const killed = enemy.takeDamage(CONFIG.weapons.missile.damage);
          this.sfx.missileExplode();
          this.hud.flashHitMarker();
          if (killed) this.onEnemyKilled(enemy.typeName);
          missile.expired = true;
          break;
        }
      }

      // Check vs boss
      if (!missile.expired && this.boss && this.boss.alive) {
        if (missile.checkHit(this.boss.position, 3.5)) {
          const killed = this.boss.takeDamage(CONFIG.weapons.missile.damage);
          this.sfx.missileExplode();
          this.hud.flashHitMarker();
          if (killed) this.onBossKilled();
          missile.expired = true;
        }
      }
    }

    // 9. Wave progression — check if all enemies dead
    const aliveEnemies = this.enemies.filter((e) => e.alive).length;
    const bossAlive = this.boss ? this.boss.alive : false;

    if (aliveEnemies === 0 && !bossAlive && this.restTimer <= 0) {
      if (this.wave >= CONFIG.progression.wavesPerLevel) {
        this.onLevelComplete();
        return;
      } else {
        this.restTimer = CONFIG.progression.waveRestTime;
      }
    }

    // 10. Rest timer countdown
    if (this.restTimer > 0) {
      this.restTimer -= dt;
      if (this.restTimer <= 0) {
        this.restTimer = 0;
        this.nextWave();
      }
    }

    // 11. Update weapon targets (alive enemies + boss)
    this.updateWeaponTargets();

    // 12. Update HUD
    this.updateHud();
  }

  /* ═══════════════════════════════════════════════════════════════════
     DAMAGE & COMBAT
     ═══════════════════════════════════════════════════════════════════ */

  private applyDamageToPlayer(damage: number): void {
    const died = this.flight.takeDamage(damage);
    this.sfx.damage();
    this.hud.flashDamage();
    if (died) this.onDeath();
  }

  private onWeaponHit(hit: WeaponHitResult): void {
    this.sfx.hit();
    this.hud.flashHitMarker();

    // Check enemies
    for (const enemy of this.enemies) {
      if (enemy.id === hit.targetId && enemy.alive) {
        const killed = enemy.takeDamage(hit.damage);
        if (killed) this.onEnemyKilled(enemy.typeName);
        return;
      }
    }

    // Check boss
    if (this.boss && this.boss.id === hit.targetId && this.boss.alive) {
      const killed = this.boss.takeDamage(hit.damage);
      if (killed) this.onBossKilled();
    }
  }

  private onEnemyKilled(typeName: string): void {
    this.kills++;
    this.sfx.enemyDie();
    this.hud.showKill(`${typeName} 已斩`);
  }

  private onBossKilled(): void {
    this.kills++;
    this.sfx.enemyDie();
    this.hud.showKill('妖王已诛!');
  }

  /* ═══════════════════════════════════════════════════════════════════
     DEATH / LEVEL COMPLETE
     ═══════════════════════════════════════════════════════════════════ */

  private onDeath(): void {
    this.state = 'dead';
    this.sfx.death();
    this.input.exitPointerLock();

    const elapsed = performance.now() / 1000 - this.startTime;
    this.hud.showGameOver({ level: this.level, kills: this.kills, time: elapsed });

    // Bind restart button (created dynamically by HUD)
    requestAnimationFrame(() => {
      const btn = document.getElementById('hud-restart');
      if (btn) btn.addEventListener('click', () => this.restart());
    });
  }

  private onLevelComplete(): void {
    if (this.level >= CONFIG.progression.totalLevels) {
      this.state = 'game_over';
      this.sfx.levelComplete();
      this.input.exitPointerLock();
      const elapsed = performance.now() / 1000 - this.startTime;
      this.hud.showGameOver({ level: this.level, kills: this.kills, time: elapsed });
      requestAnimationFrame(() => {
        const btn = document.getElementById('hud-restart');
        if (btn) btn.addEventListener('click', () => this.restart());
      });
      return;
    }

    this.state = 'level_complete';
    this.sfx.levelComplete();
    this.input.exitPointerLock();

    const hpPct = this.flight.hp / CONFIG.player.maxHealth;
    let grade: string;
    if (hpPct >= 0.9) grade = 'S';
    else if (hpPct >= 0.7) grade = 'A';
    else if (hpPct >= 0.4) grade = 'B';
    else grade = 'C';

    this.hud.showLevelComplete(this.level, grade);

    // Bind next-level button
    requestAnimationFrame(() => {
      const btn = document.getElementById('hud-next-level');
      if (btn) {
        btn.addEventListener('click', () => {
          this.hud.hideEndScreens();
          this.initLevel(this.level + 1);
          this.state = 'briefing';
          this.briefingTimer = 1.5;
          this.input.requestPointerLock();
        });
      }
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════════════ */

  private updateWeaponTargets(): void {
    const targets: Array<{ id: number; mesh: THREE.Object3D }> = [];
    for (const e of this.enemies) {
      if (e.alive) targets.push({ id: e.id, mesh: e.hitbox });
    }
    if (this.boss && this.boss.alive) {
      targets.push({ id: this.boss.id, mesh: this.boss.hitbox });
    }
    this.weaponSystem.setEnemyTargets(targets);
  }

  private updateHud(): void {
    this.hud.setHp(this.flight.hp, CONFIG.player.maxHealth);
    this.hud.setSpirit(this.flight.spirit, CONFIG.spirit.maxSpirit);
    this.hud.setAltitude(this.flight.getAltitude());
    this.hud.setSpeed(this.flight.getSpeed());

    const aliveCount = this.enemies.filter((e) => e.alive).length + (this.boss?.alive ? 1 : 0);
    this.hud.setEnemyCount(aliveCount);

    const weapon = this.weaponSystem.getActiveWeapon();
    if (weapon === 'beam') {
      this.hud.setWeapon(CONFIG.weapons.beam.name, `灵力: ${Math.floor(this.flight.spirit)}`);
    } else if (weapon === 'missile') {
      this.hud.setWeapon(CONFIG.weapons.missile.name, `弹药: ${this.weaponSystem.getMissileAmmo()}`);
    } else {
      this.hud.setWeapon(CONFIG.weapons.sword.name, '');
    }

    this.hud.setCrosshairLocked(this.weaponSystem.isLocked());

    // Radar
    const euler = new THREE.Euler().setFromQuaternion(this.flight.quaternion, 'YXZ');
    const enemyBlips = this.enemies
      .filter((e) => e.alive)
      .map((e) => ({ x: e.position.x, z: e.position.z }));
    if (this.boss?.alive) {
      enemyBlips.push({ x: this.boss.position.x, z: this.boss.position.z });
    }
    const pickupBlips = this.pickups.map((p) => ({ x: p.position.x, z: p.position.z }));
    this.hud.updateRadar(
      this.flight.position.x,
      this.flight.position.z,
      euler.y,
      enemyBlips,
      pickupBlips,
    );
  }

  /* ═══════════════════════════════════════════════════════════════════
     DISPOSE
     ═══════════════════════════════════════════════════════════════════ */

  dispose(): void {
    this.clearEnemies();
    for (const p of this.pickups) p.dispose(this.engine.scene);
    if (this.arena) this.arena.dispose(this.engine.scene);
    this.playerModel?.dispose();
    this.hud.dispose();
    this.flight.dispose();
    this.cameraSystem.dispose();
    this.weaponSystem.dispose();
    this.input.dispose();
    this.engine.dispose();
  }
}
