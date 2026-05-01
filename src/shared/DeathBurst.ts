import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  timer: number;
  maxTime: number;
}

export class DeathBurst {
  private particles: Particle[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn a burst of particles at position */
  spawn(position: THREE.Vector3, color: number, count = 12): void {
    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);

    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      mesh.renderOrder = 998;
      this.scene.add(mesh);

      // Random outward velocity
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(15 + Math.random() * 10);

      const maxTime = 0.4 + Math.random() * 0.3;
      this.particles.push({ mesh, velocity: dir, timer: maxTime, maxTime });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.timer -= dt;

      // Move + gravity
      p.velocity.y -= 30 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 10;
      p.mesh.rotation.z += dt * 8;

      // Shrink + fade
      const t = Math.max(0, p.timer / p.maxTime);
      p.mesh.scale.setScalar(t);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;

      if (p.timer <= 0) {
        this.scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }
}
