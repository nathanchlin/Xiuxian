/**
 * Input — keyboard state + pointer-lock mouse deltas.
 * Single instance owned by main.ts, read by Player / Weapon per frame.
 */
export class Input {
  private keys = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;
  private mouseDown = false;
  readonly onMouseDown: Array<() => void> = [];
  readonly onInteract: Array<() => void> = [];
  readonly onKeyDown = new Map<string, Array<() => void>>();

  private locked = false;

  // Virtual input (for touch controls)
  private virtualKeys = new Map<string, boolean>();
  private virtualMouseDX = 0;
  private virtualMouseDY = 0;
  private lockedOverride = false;
  private touchFiring = false;
  private touchControls: { dispose(): void } | null = null;

  constructor(private readonly canvas: HTMLElement) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', () => {
      console.warn('Pointer lock failed');
    });
    this.registerKey('e', () => {
      for (const cb of this.onInteract) cb();
    });
  }

  static isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  requestPointerLock(): void {
    this.canvas.requestPointerLock?.();
  }

  exitPointerLock(): void {
    document.exitPointerLock?.();
  }

  isLocked(): boolean {
    return this.locked || this.lockedOverride;
  }

  isDown(key: string): boolean {
    const k = key.toLowerCase();
    return this.keys.has(k) || (this.virtualKeys.get(k) ?? false);
  }

  isMouseDown(): boolean {
    return this.mouseDown || this.touchFiring;
  }

  /** Consume and return accumulated mouse delta, then reset. */
  consumeMouseDelta(): { dx: number; dy: number } {
    const r = { dx: this.mouseDX + this.virtualMouseDX, dy: this.mouseDY + this.virtualMouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.virtualMouseDX = 0;
    this.virtualMouseDY = 0;
    return r;
  }

  registerKey(key: string, cb: () => void): void {
    const k = key.toLowerCase();
    const list = this.onKeyDown.get(k) ?? [];
    list.push(cb);
    this.onKeyDown.set(k, list);
  }

  /** Inject a virtual key state (used by TouchControls). */
  setVirtualKey(key: string, pressed: boolean): void {
    if (pressed) {
      this.virtualKeys.set(key.toLowerCase(), true);
    } else {
      this.virtualKeys.delete(key.toLowerCase());
    }
  }

  /** Inject virtual mouse delta (used by TouchControls). */
  injectMouseDelta(dx: number, dy: number): void {
    this.virtualMouseDX += dx;
    this.virtualMouseDY += dy;
  }

  /** Bypass pointer-lock check for mobile (no pointer lock available). */
  setLockedOverride(value: boolean): void {
    this.lockedOverride = value;
  }

  /** Set touch firing state. */
  setTouchFiring(value: boolean): void {
    this.touchFiring = value;
  }

  /** Attach touch controls (will be disposed with Input). */
  setTouchControls(tc: { dispose(): void }): void {
    this.touchControls = tc;
  }



  /** Trigger a single fire event (used by touch fire start). */
  fireOnce(): void {
    for (const cb of this.onMouseDown) cb();
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const k = e.key.toLowerCase();
    if (!this.keys.has(k)) {
      const list = this.onKeyDown.get(k);
      if (list) for (const cb of list) cb();
    }
    this.keys.add(k);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDX += e.movementX;
    this.mouseDY += e.movementY;
  };

  private handleMouseDown = (): void => {
    if (!this.locked) return;
    this.mouseDown = true;
    for (const cb of this.onMouseDown) cb();
  };

  private handleMouseUp = (): void => {
    this.mouseDown = false;
  };

  private handlePointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    if (this.touchControls) {
      this.touchControls.dispose();
      this.touchControls = null;
    }
  }
}
