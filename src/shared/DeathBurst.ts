import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  timer: number;
  maxTime: number;
  gravity: number;
  spinSpeed: number;
}

export class DeathBurst {
  private particles: Particle[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn a burst of particles at position */
  spawn(position: THREE.Vector3, color: number, count = 12, type?: string): void {
    for (let i = 0; i < count; i++) {
      // Type-specific geometry
      let geo: THREE.BufferGeometry;
      let speed = 15 + Math.random() * 10;
      let yBias = 0.5;
      let gravity = 30;
      let spinSpeed = 10;

      if (type === 'crow') {
        // Flat feather-like rectangles, wide spread, fast spin
        geo = new THREE.BoxGeometry(0.15, 0.02, 0.4);
        speed = 12 + Math.random() * 8;
        yBias = 0.8;
        gravity = 15;
        spinSpeed = 15;
      } else if (type === 'serpent') {
        // Thin elongated shards, tight upward cone
        geo = new THREE.BoxGeometry(0.08, 0.08, 0.6);
        speed = 10 + Math.random() * 8;
        yBias = 1.2;
        gravity = 35;
        spinSpeed = 8;
      } else if (type === 'dragon') {
        // Large heavy chunks
        geo = new THREE.BoxGeometry(0.5, 0.4, 0.3);
        speed = 20 + Math.random() * 12;
        yBias = 0.3;
        gravity = 40;
        spinSpeed = 6;
      } else {
        geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      }

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
        Math.random() * 1.5 + yBias,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(speed);

      const maxTime = 0.4 + Math.random() * 0.3;
      this.particles.push({ mesh, velocity: dir, timer: maxTime, maxTime, gravity, spinSpeed });
    }
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.timer -= dt;

      // Move + gravity
      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * p.spinSpeed;
      p.mesh.rotation.z += dt * p.spinSpeed * 0.8;

      // Shrink + fade
      const t = Math.max(0, p.timer / p.maxTime);
      p.mesh.scale.setScalar(t);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t;

      if (p.timer <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }
}
