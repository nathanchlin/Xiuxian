import * as THREE from 'three';

interface FloatingText {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  timer: number;
  maxTime: number;
}

export class DamageNumbers {
  private pool: FloatingText[] = [];
  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Spawn a damage number at world position */
  spawn(position: THREE.Vector3, damage: number, color = 0xff4444): void {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(`${damage}`, 64, 32);

    // Fill
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.fillStyle = hex;
    ctx.fillText(`${damage}`, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 1.5;
    // Random horizontal offset so overlapping numbers don't stack
    sprite.position.x += (Math.random() - 0.5) * 1.5;
    sprite.scale.set(2.5, 1.25, 1);
    sprite.renderOrder = 1001;

    this.scene.add(sprite);

    const maxTime = 0.8 + Math.random() * 0.3;
    this.pool.push({
      sprite,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 8, (Math.random() - 0.5) * 2),
      timer: maxTime,
      maxTime,
    });
  }

  update(dt: number): void {
    for (let i = this.pool.length - 1; i >= 0; i--) {
      const ft = this.pool[i]!;
      ft.timer -= dt;

      // Float upward
      ft.sprite.position.addScaledVector(ft.velocity, dt);
      ft.velocity.multiplyScalar(0.95);

      // Fade out
      const alpha = Math.max(0, ft.timer / ft.maxTime);
      (ft.sprite.material as THREE.SpriteMaterial).opacity = alpha;

      // Billboard: sprites auto-face camera, so no manual rotation needed

      if (ft.timer <= 0) {
        this.scene.remove(ft.sprite);
        ft.sprite.material.map?.dispose();
        ft.sprite.material.dispose();
        this.pool.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const ft of this.pool) {
      this.scene.remove(ft.sprite);
      ft.sprite.material.map?.dispose();
      ft.sprite.material.dispose();
    }
    this.pool = [];
  }
}
