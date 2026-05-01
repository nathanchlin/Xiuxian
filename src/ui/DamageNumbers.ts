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
  spawn(position: THREE.Vector3, damage: number, color = 0xff8866, prefix = ''): void {
    const sizeScale = Math.min(1.4, 0.6 + Math.log10(Math.max(1, damage)) * 0.25);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    const fontSize = Math.round(24 + 12 * sizeScale);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = `${prefix}${Math.round(damage)}`;

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeText(text, 64, 32);

    // Fill
    const hex = '#' + color.toString(16).padStart(6, '0');
    ctx.fillStyle = hex;
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.position.y += 1.5;
    sprite.position.x += (Math.random() - 0.5) * 1.5;
    sprite.scale.set(1.8 * sizeScale, 0.9 * sizeScale, 1);

    this.scene.add(sprite);

    const maxTime = 0.6 + Math.random() * 0.2;
    this.pool.push({
      sprite,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1, 5, (Math.random() - 0.5) * 1),
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
