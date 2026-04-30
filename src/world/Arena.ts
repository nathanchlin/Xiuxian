import * as THREE from 'three';
import { CONFIG } from '../config';
import type { AABB3D } from '../shared/collision';
import { resolveSphereVsAABB3Ds } from '../shared/collision';

export interface LevelConfig {
  buildings: number;
  bridges: number;
  islands: number;
  spread: number;
  skyTint: string;
}

export class Arena {
  readonly group = new THREE.Group();
  readonly colliders: AABB3D[] = [];
  readonly pickupSpots: THREE.Vector3[] = [];
  private skybox: Skybox | null = null;
  private config: LevelConfig;

  constructor(scene: THREE.Scene, level: number) {
    this.config = this.getLevelConfig(level);
    this.generate();
    scene.add(this.group);
  }

  private getLevelConfig(level: number): LevelConfig {
    const presets = CONFIG.arena.levelConfigs;
    if (level <= presets.length) {
      return presets[level - 1]!;
    }
    const base = presets[presets.length - 1]!;
    const extra = level - presets.length;
    const tintIdx = (level - 1) % CONFIG.arena.skyTintPresets.length;
    return {
      buildings: base.buildings + extra * CONFIG.arena.buildingsPerLevel,
      bridges: base.bridges + Math.floor(extra * 0.5),
      islands: base.islands + extra,
      spread: base.spread + extra * CONFIG.arena.spreadPerLevel,
      skyTint: CONFIG.arena.skyTintPresets[tintIdx]!,
    };
  }

  private generate(): void {
    const cfg = this.config;
    const arenaCfg = CONFIG.arena;

    // Buildings
    const anchors = this.poissonDisk(cfg.buildings, cfg.spread, arenaCfg.buildingMinGap);
    const bodyMat = new THREE.MeshStandardMaterial({ color: arenaCfg.bodyColor, roughness: 0.4, metalness: 0.0 });
    const outlineMat = new THREE.LineBasicMaterial({ color: arenaCfg.accentColor });

    for (const anchor of anchors) {
      const w = 8 + Math.random() * 12;
      const d = 8 + Math.random() * 12;
      const h = arenaCfg.heightRange[0] + Math.random() * (arenaCfg.heightRange[1] - arenaCfg.heightRange[0]);
      const baseY = 20 + Math.random() * 40;

      const boxGeo = new THREE.BoxGeometry(w, h, d);
      const box = new THREE.Mesh(boxGeo, bodyMat);
      box.position.set(anchor.x, baseY + h / 2, anchor.z);
      box.castShadow = true;
      box.receiveShadow = true;
      this.group.add(box);

      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), outlineMat);
      edges.position.copy(box.position);
      this.group.add(edges);

      // Roof
      const roofGeo = new THREE.BoxGeometry(w + 2, 1.5, d + 2);
      const roof = new THREE.Mesh(roofGeo, bodyMat);
      roof.position.set(anchor.x, baseY + h + 0.75, anchor.z);
      this.group.add(roof);
      const roofEdges = new THREE.LineSegments(new THREE.EdgesGeometry(roofGeo), outlineMat);
      roofEdges.position.copy(roof.position);
      this.group.add(roofEdges);

      // Bottom rocks
      const rockGeo = new THREE.BoxGeometry(w * 0.6, 8, d * 0.6);
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 0.8 });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(anchor.x, baseY - 4, anchor.z);
      this.group.add(rock);

      // Collision AABB covers main box + roof
      this.colliders.push({
        minX: anchor.x - w / 2, maxX: anchor.x + w / 2,
        minY: baseY, maxY: baseY + h + 1.5,
        minZ: anchor.z - d / 2, maxZ: anchor.z + d / 2,
      });

      // Pickup spot on top
      this.pickupSpots.push(new THREE.Vector3(anchor.x, baseY + h + 3, anchor.z));
    }

    // Bridges
    const bridgeMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 });
    let bridgeCount = 0;
    for (let i = 0; i < anchors.length && bridgeCount < cfg.bridges; i++) {
      for (let j = i + 1; j < anchors.length && bridgeCount < cfg.bridges; j++) {
        const dx = anchors[j]!.x - anchors[i]!.x;
        const dz = anchors[j]!.z - anchors[i]!.z;
        const dist = Math.hypot(dx, dz);
        if (dist < arenaCfg.buildingMinGap * 3) {
          const midX = (anchors[i]!.x + anchors[j]!.x) / 2;
          const midZ = (anchors[i]!.z + anchors[j]!.z) / 2;
          const bridgeGeo = new THREE.BoxGeometry(dist, 0.3, 2);
          const bridge = new THREE.Mesh(bridgeGeo, bridgeMat);
          bridge.position.set(midX, 50, midZ);
          bridge.rotation.y = Math.atan2(dz, dx);
          this.group.add(bridge);
          bridgeCount++;
        }
      }
    }

    // Floating islands
    const islandMat = new THREE.MeshStandardMaterial({ color: 0xaabb88, roughness: 0.7 });
    for (let i = 0; i < cfg.islands; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * cfg.spread * 0.8;
      const ix = Math.cos(angle) * r;
      const iz = Math.sin(angle) * r;
      const iy = 30 + Math.random() * 60;
      const ir = arenaCfg.islandRadius[0] + Math.random() * (arenaCfg.islandRadius[1] - arenaCfg.islandRadius[0]);
      const islandGeo = new THREE.SphereGeometry(ir, 8, 6);
      const island = new THREE.Mesh(islandGeo, islandMat);
      island.scale.y = 0.4;
      island.position.set(ix, iy, iz);
      this.group.add(island);
      this.pickupSpots.push(new THREE.Vector3(ix, iy + ir * 0.5, iz));
    }

    // Cloud sea
    const cloudGeo = new THREE.PlaneGeometry(cfg.spread * 3, cfg.spread * 3);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0x8888cc, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.rotation.x = -Math.PI / 2;
    cloud.position.y = 0;
    this.group.add(cloud);

    // Atmosphere particles
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * cfg.spread * 2;
      positions[i * 3 + 1] = Math.random() * 150;
      positions[i * 3 + 2] = (Math.random() - 0.5) * cfg.spread * 2;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({ color: 0xaaccff, size: 0.5, transparent: true, opacity: 0.6 });
    this.group.add(new THREE.Points(particleGeo, particleMat));

    // Lighting
    this.group.add(new THREE.AmbientLight(CONFIG.render.ambientColor, CONFIG.render.ambientIntensity));
    const moon = new THREE.DirectionalLight(CONFIG.render.moonColor, CONFIG.render.moonIntensity);
    moon.position.set(100, 200, 100);
    moon.castShadow = true;
    moon.shadow.camera.left = -200;
    moon.shadow.camera.right = 200;
    moon.shadow.camera.top = 200;
    moon.shadow.camera.bottom = -200;
    moon.shadow.mapSize.set(2048, 2048);
    this.group.add(moon);
    this.group.add(moon.target);

    // Skybox
    this.skybox = new Skybox(cfg.skyTint);
    this.group.add(this.skybox.mesh);
  }

  private poissonDisk(count: number, spread: number, minDist: number): Array<{ x: number; z: number }> {
    const points: Array<{ x: number; z: number }> = [];
    const maxAttempts = count * 30;
    let attempts = 0;
    while (points.length < count && attempts < maxAttempts) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      let valid = true;
      for (const p of points) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < minDist * minDist) { valid = false; break; }
      }
      if (valid) points.push({ x, z });
      attempts++;
    }
    return points;
  }

  resolveSphereVsBuildings(x: number, y: number, z: number, radius: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number } {
    return resolveSphereVsAABB3Ds(x, y, z, radius, this.colliders);
  }

  dispose(scene: THREE.Scene): void {
    if (this.skybox) this.skybox.dispose();
    scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }
}

// Skybox — gradient sky dome (embedded to avoid extra file)
class Skybox {
  readonly mesh: THREE.Mesh;

  constructor(tintHex: string) {
    const tintColor = new THREE.Color(tintHex);
    const topColor = new THREE.Color(0x000011).lerp(tintColor, 0.3);
    const bottomColor = tintColor.clone();
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: topColor },
        bottomColor: { value: bottomColor },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
