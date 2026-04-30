import * as THREE from 'three';
import { CONFIG } from '../config';
import type { FlightController } from './FlightController';
import type { Sfx } from '../shared/Sfx';

export type WeaponSlot = 'beam' | 'missile' | 'sword';

export interface WeaponHitResult {
  targetId: number;
  point: THREE.Vector3;
  damage: number;
}

export class WeaponSystem {
  private beamCooldown = 0;
  private missileAmmo: number;
  private swordCooldown = 0;
  private activeWeapon: WeaponSlot = 'beam';

  // Lock-on state (used when missile system is implemented)
  lockTarget: THREE.Object3D | null = null;
  lockTimer = 0;
  locked = false;

  private beamLine: THREE.Line | null = null;
  private beamTimer = 0;

  readonly missiles: Missile[] = [];

  private enemyMeshes: THREE.Object3D[] = [];
  private enemyMap = new Map<number, { id: number; mesh: THREE.Object3D }>();

  private readonly raycaster = new THREE.Raycaster();

  constructor(
    private readonly flight: FlightController,
    private readonly scene: THREE.Scene,
    private readonly sfx: Sfx,
  ) {
    this.missileAmmo = CONFIG.weapons.missile.initialAmmo;
  }

  setEnemyTargets(targets: Array<{ id: number; mesh: THREE.Object3D }>): void {
    this.enemyMeshes = targets.map(t => t.mesh);
    this.enemyMap.clear();
    for (const t of targets) {
      this.enemyMap.set(t.mesh.id, t);
    }
  }

  getActiveWeapon(): WeaponSlot { return this.activeWeapon; }
  getMissileAmmo(): number { return this.missileAmmo; }
  isLocked(): boolean { return this.locked; }

  fireBeam(): WeaponHitResult | null {
    if (this.beamCooldown > 0) return null;
    const cfg = CONFIG.weapons.beam;
    if (!this.flight.consumeSpirit(cfg.spiritCost)) return null;

    this.beamCooldown = cfg.fireRate;
    this.sfx.shoot();

    const origin = this.flight.position.clone();
    const dir = this.flight.getForward();
    this.raycaster.set(origin, dir);
    this.raycaster.far = cfg.maxRange;

    this.showBeamVisual(origin, origin.clone().add(dir.clone().multiplyScalar(cfg.maxRange)));

    const hits = this.raycaster.intersectObjects(this.enemyMeshes, false);
    if (hits.length > 0) {
      const first = hits[0]!;
      const target = this.enemyMap.get(first.object.id);
      if (target) {
        this.showBeamVisual(origin, first.point.clone());
        return { targetId: target.id, point: first.point.clone(), damage: cfg.damage };
      }
    }
    return null;
  }

  private showBeamVisual(start: THREE.Vector3, end: THREE.Vector3): void {
    if (this.beamLine) {
      this.scene.remove(this.beamLine);
      this.beamLine.geometry.dispose();
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const material = new THREE.LineBasicMaterial({ color: CONFIG.weapons.beam.color, transparent: true, opacity: 0.8 });
    this.beamLine = new THREE.Line(geometry, material);
    this.scene.add(this.beamLine);
    this.beamTimer = 0.1;
  }

  addMissileAmmo(amount: number): void { this.missileAmmo += amount; }

  update(dt: number): void {
    if (this.beamCooldown > 0) this.beamCooldown -= dt;
    if (this.swordCooldown > 0) this.swordCooldown -= dt;

    if (this.beamTimer > 0) {
      this.beamTimer -= dt;
      if (this.beamTimer <= 0 && this.beamLine) {
        this.scene.remove(this.beamLine);
        this.beamLine.geometry.dispose();
        (this.beamLine.material as THREE.Material).dispose();
        this.beamLine = null;
      }
    }

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i]!;
      m.update(dt);
      if (m.expired) {
        m.dispose(this.scene);
        this.missiles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    if (this.beamLine) {
      this.scene.remove(this.beamLine);
      this.beamLine.geometry.dispose();
      (this.beamLine.material as THREE.Material).dispose();
    }
    for (const m of this.missiles) m.dispose(this.scene);
  }
}

export class Missile {
  readonly mesh: THREE.Mesh;
  readonly position = new THREE.Vector3();
  private velocity = new THREE.Vector3();
  private target: THREE.Object3D | null = null;
  private lifetime: number;
  expired = false;
  targetId = -1;

  constructor(origin: THREE.Vector3, direction: THREE.Vector3, target: THREE.Object3D | null, targetId: number, scene: THREE.Scene) {
    this.position.copy(origin);
    this.velocity.copy(direction).multiplyScalar(60);
    this.target = target;
    this.targetId = targetId;
    this.lifetime = CONFIG.weapons.missile.trackDuration;

    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: CONFIG.weapons.missile.color });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(origin);
    scene.add(this.mesh);
  }

  update(dt: number): void {
    this.lifetime -= dt;
    if (this.lifetime <= 0) { this.expired = true; return; }

    if (this.target) {
      const toTarget = new THREE.Vector3();
      this.target.getWorldPosition(toTarget);
      toTarget.sub(this.position).normalize();
      const currentDir = this.velocity.clone().normalize();
      currentDir.lerp(toTarget, Math.min(1, 3 * dt));
      currentDir.normalize();
      this.velocity.copy(currentDir).multiplyScalar(60);
    }

    this.position.addScaledVector(this.velocity, dt);
    this.mesh.position.copy(this.position);
    this.mesh.lookAt(this.position.clone().add(this.velocity));

    if (this.position.length() > CONFIG.weapons.missile.maxRange) { this.expired = true; }
  }

  checkHit(targetPos: THREE.Vector3, radius: number): boolean {
    return this.position.distanceTo(targetPos) < radius + 0.5;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
