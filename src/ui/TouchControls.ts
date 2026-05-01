/**
 * TouchControls — Mobile touch input overlay.
 *
 * Layout (traditional mobile game style):
 *   Left side:  Virtual joystick (movement)
 *   Right side: Touch area for camera look (drag to rotate)
 *   Right side: Skill buttons (1/2/3) + attack button + ascend/descend + boost
 *
 * Injects virtual keys and mouse deltas into the Input system.
 */
import type { Input } from '../shared/Input';

const JOYSTICK_SIZE = 120;
const JOYSTICK_KNOB = 50;
const BUTTON_SIZE = 52;
const BUTTON_GAP = 8;

function el(tag: string, css: string): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  return e;
}

function btn(label: string, color: string, size = BUTTON_SIZE): HTMLDivElement {
  const b = document.createElement('div');
  b.style.cssText =
    `width:${size}px;height:${size}px;border-radius:50%;` +
    `border:2px solid ${color};background:rgba(0,0,0,0.4);` +
    `display:flex;align-items:center;justify-content:center;` +
    `font-size:13px;font-weight:bold;color:${color};font-family:monospace;` +
    `user-select:none;-webkit-user-select:none;touch-action:none;` +
    `pointer-events:auto;`;
  b.textContent = label;
  return b;
}

export class TouchControls {
  private root: HTMLDivElement;
  private joystickBase: HTMLDivElement;
  private joystickKnob: HTMLDivElement;
  private joystickTouchId: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };

  private cameraTouchId: number | null = null;
  private cameraLast = { x: 0, y: 0 };

  // Sensitivity for camera rotation
  private readonly cameraSens = 1.8;

  // Buttons
  private skill1Btn: HTMLDivElement;
  private skill2Btn: HTMLDivElement;
  private skill3Btn: HTMLDivElement;
  private attackBtn: HTMLDivElement;
  private boostBtn: HTMLDivElement;
  private ascendBtn: HTMLDivElement;
  private descendBtn: HTMLDivElement;
  private bagBtn: HTMLDivElement;

  onBagPress: (() => void) | null = null;

  private activeTouches = new Map<number, string>(); // touchId -> action

  constructor(private readonly input: Input) {
    // Root overlay
    this.root = document.createElement('div');
    this.root.id = 'touch-controls';
    this.root.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:150;' +
      'pointer-events:none;touch-action:none;user-select:none;-webkit-user-select:none;';

    // ── Left: Joystick ──────────────────────────────────
    const joystickArea = el('div',
      `position:absolute;bottom:40px;left:30px;width:${JOYSTICK_SIZE}px;height:${JOYSTICK_SIZE}px;pointer-events:auto;touch-action:none;`,
    );

    this.joystickBase = document.createElement('div');
    this.joystickBase.style.cssText =
      `width:${JOYSTICK_SIZE}px;height:${JOYSTICK_SIZE}px;border-radius:50%;` +
      `border:2px solid rgba(218,165,32,0.5);background:rgba(0,0,0,0.3);` +
      `position:relative;`;

    this.joystickKnob = document.createElement('div');
    this.joystickKnob.style.cssText =
      `width:${JOYSTICK_KNOB}px;height:${JOYSTICK_KNOB}px;border-radius:50%;` +
      `background:rgba(218,165,32,0.6);border:2px solid #daa520;` +
      `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);` +
      `transition:none;`;

    this.joystickBase.appendChild(this.joystickKnob);
    joystickArea.appendChild(this.joystickBase);
    this.root.appendChild(joystickArea);

    // ── Right: Camera look area (invisible, covers right half) ──
    const cameraArea = el('div',
      'position:absolute;top:0;right:0;width:50%;height:60%;pointer-events:auto;touch-action:none;',
    );
    this.root.appendChild(cameraArea);

    // ── Right bottom: Skill & action buttons ────────────
    const GOLD = '#daa520';
    const RED = '#e74c3c';
    const BLUE = '#3498db';
    const GREEN = '#27ae60';

    // Attack button (big, rightmost)
    this.attackBtn = btn('攻击', RED, 64);
    this.attackBtn.style.cssText += 'position:absolute;bottom:60px;right:30px;width:64px;height:64px;';
    this.root.appendChild(this.attackBtn);

    // Skill buttons in arc above attack button
    this.skill1Btn = btn('1', GOLD);
    this.skill1Btn.style.cssText += `position:absolute;bottom:${60 + 64 + BUTTON_GAP}px;right:${30 + 64 + BUTTON_GAP}px;`;
    this.root.appendChild(this.skill1Btn);

    this.skill2Btn = btn('2', GOLD);
    this.skill2Btn.style.cssText += `position:absolute;bottom:${60 + 64 + BUTTON_GAP + BUTTON_SIZE + BUTTON_GAP}px;right:${30}px;`;
    this.root.appendChild(this.skill2Btn);

    this.skill3Btn = btn('3', GOLD);
    this.skill3Btn.style.cssText += `position:absolute;bottom:${60 + 64 + BUTTON_GAP}px;right:${30}px;`;
    this.root.appendChild(this.skill3Btn);

    // Boost button (left of attack)
    this.boostBtn = btn('冲', GREEN);
    this.boostBtn.style.cssText += `position:absolute;bottom:60px;right:${30 + 64 + BUTTON_GAP}px;`;
    this.root.appendChild(this.boostBtn);

    // Ascend / Descend on left side (above joystick)
    this.ascendBtn = btn('↑', BLUE, 44);
    this.ascendBtn.style.cssText += `position:absolute;bottom:${40 + JOYSTICK_SIZE + 16}px;left:30px;width:44px;height:44px;font-size:18px;`;
    this.root.appendChild(this.ascendBtn);

    this.descendBtn = btn('↓', BLUE, 44);
    this.descendBtn.style.cssText += `position:absolute;bottom:${40 + JOYSTICK_SIZE + 16}px;left:${30 + 44 + BUTTON_GAP}px;width:44px;height:44px;font-size:18px;`;
    this.root.appendChild(this.descendBtn);

    // Bag button (top-right corner)
    this.bagBtn = btn('包', '#daa520', 40);
    this.bagBtn.style.cssText += 'position:absolute;top:16px;right:16px;width:40px;height:40px;font-size:12px;';
    this.bagBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onBagPress?.();
    }, { passive: false });
    this.root.appendChild(this.bagBtn);

    document.body.appendChild(this.root);

    // ── Bypass pointer lock for mobile ──
    input.setLockedOverride(true);

    // ── Touch event handlers ────────────────────────────
    joystickArea.addEventListener('touchstart', this.onJoystickStart, { passive: false });
    joystickArea.addEventListener('touchmove', this.onJoystickMove, { passive: false });
    joystickArea.addEventListener('touchend', this.onJoystickEnd, { passive: false });
    joystickArea.addEventListener('touchcancel', this.onJoystickEnd, { passive: false });

    cameraArea.addEventListener('touchstart', this.onCameraStart, { passive: false });
    cameraArea.addEventListener('touchmove', this.onCameraMove, { passive: false });
    cameraArea.addEventListener('touchend', this.onCameraEnd, { passive: false });
    cameraArea.addEventListener('touchcancel', this.onCameraEnd, { passive: false });

    this.bindButton(this.attackBtn, 'attack');
    this.bindButton(this.skill1Btn, 'skill1');
    this.bindButton(this.skill2Btn, 'skill2');
    this.bindButton(this.skill3Btn, 'skill3');
    this.bindButton(this.boostBtn, 'boost');
    this.bindButton(this.ascendBtn, 'ascend');
    this.bindButton(this.descendBtn, 'descend');
  }

  // ── Joystick handlers ──────────────────────────────────

  private onJoystickStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.joystickTouchId !== null) return;
    const t = e.changedTouches[0]!;
    this.joystickTouchId = t.identifier;
    const rect = this.joystickBase.getBoundingClientRect();
    this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.updateJoystick(t.clientX, t.clientY);
  };

  private onJoystickMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier === this.joystickTouchId) {
        this.updateJoystick(t.clientX, t.clientY);
      }
    }
  };

  private onJoystickEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i]!.identifier === this.joystickTouchId) {
        this.joystickTouchId = null;
        this.joystickKnob.style.transform = 'translate(-50%,-50%)';
        this.input.setVirtualKey('w', false);
        this.input.setVirtualKey('s', false);
        this.input.setVirtualKey('a', false);
        this.input.setVirtualKey('d', false);
      }
    }
  };

  private updateJoystick(cx: number, cy: number): void {
    const dx = cx - this.joystickOrigin.x;
    const dy = cy - this.joystickOrigin.y;
    const maxR = JOYSTICK_SIZE / 2 - JOYSTICK_KNOB / 2;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, maxR);
    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * clampedDist;
    const ny = Math.sin(angle) * clampedDist;

    this.joystickKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;

    const threshold = 0.3;
    const normX = clampedDist > 0 ? nx / maxR : 0;
    const normY = clampedDist > 0 ? ny / maxR : 0;

    this.input.setVirtualKey('w', normY < -threshold);
    this.input.setVirtualKey('s', normY > threshold);
    this.input.setVirtualKey('a', normX < -threshold);
    this.input.setVirtualKey('d', normX > threshold);
  }

  // ── Camera look handlers ───────────────────────────────

  private onCameraStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (this.cameraTouchId !== null) return;
    const t = e.changedTouches[0]!;
    this.cameraTouchId = t.identifier;
    this.cameraLast = { x: t.clientX, y: t.clientY };
  };

  private onCameraMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      if (t.identifier === this.cameraTouchId) {
        const dx = (t.clientX - this.cameraLast.x) * this.cameraSens;
        const dy = (t.clientY - this.cameraLast.y) * this.cameraSens;
        this.input.injectMouseDelta(dx, dy);
        this.cameraLast = { x: t.clientX, y: t.clientY };
      }
    }
  };

  private onCameraEnd = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i]!.identifier === this.cameraTouchId) {
        this.cameraTouchId = null;
      }
    }
  };

  // ── Button handlers ────────────────────────────────────

  private bindButton(element: HTMLDivElement, action: string): void {
    element.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0]!;
      this.activeTouches.set(t.identifier, action);
      element.style.opacity = '0.6';
      element.style.transform = 'scale(0.9)';
      this.onButtonDown(action);
    }, { passive: false });

    element.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (this.activeTouches.get(t.identifier) === action) {
          this.activeTouches.delete(t.identifier);
          element.style.opacity = '1';
          element.style.transform = 'scale(1)';
          this.onButtonUp(action);
        }
      }
    }, { passive: false });

    element.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i]!;
        if (this.activeTouches.get(t.identifier) === action) {
          this.activeTouches.delete(t.identifier);
          element.style.opacity = '1';
          element.style.transform = 'scale(1)';
          this.onButtonUp(action);
        }
      }
    }, { passive: false });
  }

  private onButtonDown(action: string): void {
    switch (action) {
      case 'attack':
        this.input.setTouchFiring(true);
        this.input.fireOnce();
        break;
      case 'skill1': {
        const list = this.input.onKeyDown.get('1');
        if (list) for (const cb of list) cb();
        break;
      }
      case 'skill2': {
        const list = this.input.onKeyDown.get('2');
        if (list) for (const cb of list) cb();
        break;
      }
      case 'skill3': {
        const list = this.input.onKeyDown.get('3');
        if (list) for (const cb of list) cb();
        break;
      }
      case 'boost': {
        const list = this.input.onKeyDown.get('shift');
        if (list) for (const cb of list) cb();
        break;
      }
      case 'ascend':
        this.input.setVirtualKey(' ', true);
        break;
      case 'descend':
        this.input.setVirtualKey('control', true);
        break;
    }
  }

  private onButtonUp(action: string): void {
    switch (action) {
      case 'attack':
        this.input.setTouchFiring(false);
        break;
      case 'ascend':
        this.input.setVirtualKey(' ', false);
        break;
      case 'descend':
        this.input.setVirtualKey('control', false);
        break;
    }
  }

  dispose(): void {
    this.root.remove();
    this.input.setLockedOverride(false);
    // Clear all virtual keys
    for (const key of ['w', 's', 'a', 'd', ' ', 'control']) {
      this.input.setVirtualKey(key, false);
    }
    this.input.setTouchFiring(false);
  }
}
