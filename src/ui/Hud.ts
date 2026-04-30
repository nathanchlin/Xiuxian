/**
 * Flight HUD — DOM-based flight instrument overlay.
 * Builds all elements in JavaScript; no HTML template dependency.
 *
 * Layout:
 *   Top-center  : level / wave / enemy count
 *   Center      : crosshair (4 lines, turns red when locked)
 *   Bottom-left : weapon name + ammo/spirit text
 *   Bottom-right: canvas-based radar (150×150 px circle)
 *   Bottom bar  : HP bar, Spirit bar, altitude, speed, boost bar
 *   Overlays    : damage flash, hit marker, kill text, boss phase text
 */

interface EnemyBlip {
  x: number;
  z: number;
}

interface PickupBlip {
  x: number;
  z: number;
}

/** Small helper — create a div with inline style string, optionally add an id. */
function div(style: string, id?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.style.cssText = style;
  if (id) el.id = id;
  return el;
}

const BASE =
  'position:fixed;box-sizing:border-box;pointer-events:none;font-family:monospace;color:#fff;';
const GOLD = '#daa520';
const SEMI = 'rgba(0,0,0,0.55)';

export class Hud {
  private root: HTMLDivElement;

  // Top info
  private levelEl: HTMLDivElement;
  private waveEl: HTMLDivElement;
  private enemyEl: HTMLDivElement;

  // Crosshair lines
  private crosshairLines: HTMLDivElement[] = [];

  // Bottom-left weapon info
  private weaponNameEl: HTMLDivElement;
  private ammoEl: HTMLDivElement;

  // Bottom bar
  private hpBar: HTMLDivElement;
  private hpText: HTMLDivElement;
  private spiritBar: HTMLDivElement;
  private spiritText: HTMLDivElement;
  private altEl: HTMLDivElement;
  private speedEl: HTMLDivElement;
  private boostBar: HTMLDivElement;

  // Radar
  private radarCanvas: HTMLCanvasElement;
  private radarCtx: CanvasRenderingContext2D;

  // Overlays
  private damageOverlay: HTMLDivElement;
  private hitMarker: HTMLDivElement;
  private killText: HTMLDivElement;
  private bossPhaseText: HTMLDivElement;

  // Timers
  private damageTimer = 0;
  private hitMarkerTimer = 0;
  private killTimer = 0;
  private bossPhaseTimer = 0;

  constructor() {
    // ── Root ──────────────────────────────────────────────────────────────────
    this.root = div(
      'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100;',
      'hud',
    );

    // ── Top center info ───────────────────────────────────────────────────────
    const topBar = div(
      `${BASE}top:12px;left:50%;transform:translateX(-50%);` +
        `display:flex;gap:18px;background:${SEMI};padding:4px 16px;border-radius:6px;` +
        `font-size:13px;letter-spacing:1px;`,
    );
    this.levelEl = div(`color:${GOLD};`);
    this.levelEl.textContent = '第 1 关';
    this.waveEl = div(`color:#aaf;`);
    this.waveEl.textContent = '波次 1/3';
    this.enemyEl = div(`color:#f88;`);
    this.enemyEl.textContent = '敌人: 0';
    topBar.append(this.levelEl, this.waveEl, this.enemyEl);
    this.root.appendChild(topBar);

    // ── Crosshair ─────────────────────────────────────────────────────────────
    const crossContainer = div(
      `${BASE}top:50%;left:50%;transform:translate(-50%,-50%);width:30px;height:30px;`,
    );
    // 4 lines: top, bottom, left, right
    const lineStyles = [
      'top:0;left:50%;transform:translateX(-50%);width:2px;height:8px;',
      'bottom:0;left:50%;transform:translateX(-50%);width:2px;height:8px;',
      'left:0;top:50%;transform:translateY(-50%);width:8px;height:2px;',
      'right:0;top:50%;transform:translateY(-50%);width:8px;height:2px;',
    ];
    for (const s of lineStyles) {
      const line = div(`position:absolute;background:#fff;${s}`);
      this.crosshairLines.push(line);
      crossContainer.appendChild(line);
    }
    this.root.appendChild(crossContainer);

    // ── Bottom-left: weapon info ──────────────────────────────────────────────
    const weaponPanel = div(
      `${BASE}bottom:90px;left:18px;background:${SEMI};` +
        `padding:6px 12px;border-radius:6px;font-size:13px;`,
    );
    this.weaponNameEl = div(`color:${GOLD};font-size:14px;font-weight:bold;margin-bottom:2px;`);
    this.weaponNameEl.textContent = '灵力射线';
    this.ammoEl = div(`color:#ccc;`);
    this.ammoEl.textContent = '灵力: ∞';
    weaponPanel.append(this.weaponNameEl, this.ammoEl);
    this.root.appendChild(weaponPanel);

    // ── Bottom-right: radar ───────────────────────────────────────────────────
    const radarWrapper = div(
      `${BASE}bottom:20px;right:18px;width:150px;height:150px;` +
        `border-radius:50%;border:1px solid rgba(218,165,32,0.5);` +
        `background:rgba(0,0,0,0.7);overflow:hidden;`,
    );
    this.radarCanvas = document.createElement('canvas');
    this.radarCanvas.width = 150;
    this.radarCanvas.height = 150;
    this.radarCanvas.style.cssText = 'display:block;';
    radarWrapper.appendChild(this.radarCanvas);
    this.root.appendChild(radarWrapper);
    this.radarCtx = this.radarCanvas.getContext('2d')!;

    // ── Bottom bar ────────────────────────────────────────────────────────────
    const bottomBar = div(
      `${BASE}bottom:0;left:0;right:0;height:72px;` +
        `background:${SEMI};display:flex;align-items:center;gap:14px;padding:0 20px;`,
    );

    // HP
    const hpGroup = this._barGroup('HP', '#c0392b');
    this.hpBar = hpGroup.bar;
    this.hpText = hpGroup.label;
    bottomBar.appendChild(hpGroup.wrapper);

    // Spirit
    const spiritGroup = this._barGroup('灵', '#2471a3');
    this.spiritBar = spiritGroup.bar;
    this.spiritText = spiritGroup.label;
    bottomBar.appendChild(spiritGroup.wrapper);

    // Altitude
    const altWrapper = div(`display:flex;flex-direction:column;align-items:center;font-size:11px;`);
    const altLbl = div(`color:${GOLD};`);
    altLbl.textContent = '高度';
    this.altEl = div(`font-size:16px;font-weight:bold;`);
    this.altEl.textContent = '0';
    altWrapper.append(altLbl, this.altEl);
    bottomBar.appendChild(altWrapper);

    // Speed
    const speedWrapper = div(
      `display:flex;flex-direction:column;align-items:center;font-size:11px;`,
    );
    const speedLbl = div(`color:${GOLD};`);
    speedLbl.textContent = '速度';
    this.speedEl = div(`font-size:16px;font-weight:bold;`);
    this.speedEl.textContent = '0';
    speedWrapper.append(speedLbl, this.speedEl);
    bottomBar.appendChild(speedWrapper);

    // Boost bar
    const boostGroup = this._barGroup('疾冲', '#27ae60');
    this.boostBar = boostGroup.bar;
    bottomBar.appendChild(boostGroup.wrapper);

    this.root.appendChild(bottomBar);

    // ── Damage flash overlay ──────────────────────────────────────────────────
    this.damageOverlay = div(
      `${BASE}top:0;left:0;width:100%;height:100%;` +
        `background:radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,0.55) 100%);` +
        `opacity:0;transition:opacity 0.05s;`,
    );
    this.root.appendChild(this.damageOverlay);

    // ── Hit marker ────────────────────────────────────────────────────────────
    this.hitMarker = div(
      `${BASE}top:50%;left:50%;transform:translate(-50%,-50%);` +
        `font-size:22px;font-weight:bold;color:#f1c40f;opacity:0;transition:opacity 0.05s;`,
    );
    this.hitMarker.textContent = '+';
    this.root.appendChild(this.hitMarker);

    // ── Kill notification ─────────────────────────────────────────────────────
    this.killText = div(
      `${BASE}top:38%;left:50%;transform:translateX(-50%);` +
        `font-size:16px;color:${GOLD};letter-spacing:2px;text-shadow:0 0 8px #000;opacity:0;`,
    );
    this.root.appendChild(this.killText);

    // ── Boss phase text ───────────────────────────────────────────────────────
    this.bossPhaseText = div(
      `${BASE}top:30%;left:50%;transform:translateX(-50%);` +
        `font-size:22px;font-weight:bold;color:#c0392b;letter-spacing:3px;` +
        `text-shadow:0 0 12px rgba(200,0,0,0.8);opacity:0;`,
    );
    this.root.appendChild(this.bossPhaseText);

    document.body.appendChild(this.root);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _barGroup(label: string, fillColor: string) {
    const wrapper = div(
      `display:flex;flex-direction:column;gap:2px;font-size:11px;min-width:100px;`,
    );
    const row = div(`display:flex;justify-content:space-between;`);
    const lbl = div(`color:${GOLD};`);
    lbl.textContent = label;
    const labelRight = div(`color:#ccc;`);
    row.append(lbl, labelRight);
    const track = div(
      `width:100%;height:10px;background:rgba(255,255,255,0.15);border-radius:4px;overflow:hidden;`,
    );
    const bar = div(
      `height:100%;width:100%;background:${fillColor};border-radius:4px;transition:width 0.1s;`,
    );
    track.appendChild(bar);
    wrapper.append(row, track);
    return { wrapper, bar, label: labelRight };
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setLevel(level: number): void {
    this.levelEl.textContent = `第 ${level} 关`;
  }

  setWave(wave: number, total: number): void {
    this.waveEl.textContent = `波次 ${wave}/${total}`;
  }

  setEnemyCount(count: number): void {
    this.enemyEl.textContent = `敌人: ${count}`;
  }

  setHp(hp: number, max: number): void {
    const pct = Math.max(0, Math.min(1, hp / max)) * 100;
    this.hpBar.style.width = `${pct}%`;
    this.hpText.textContent = `${Math.ceil(hp)}`;
  }

  setSpirit(spirit: number, max: number): void {
    const pct = Math.max(0, Math.min(1, spirit / max)) * 100;
    this.spiritBar.style.width = `${pct}%`;
    this.spiritText.textContent = `${Math.floor(spirit)}`;
  }

  setAltitude(alt: number): void {
    this.altEl.textContent = `${Math.floor(alt)}`;
  }

  setSpeed(speed: number): void {
    this.speedEl.textContent = `${Math.floor(speed)}`;
  }

  setBoost(pct: number): void {
    this.boostBar.style.width = `${Math.max(0, Math.min(1, pct)) * 100}%`;
  }

  setWeapon(name: string, ammoText: string): void {
    this.weaponNameEl.textContent = name;
    this.ammoEl.textContent = ammoText;
  }

  setCrosshairLocked(locked: boolean): void {
    const color = locked ? '#e74c3c' : '#fff';
    for (const line of this.crosshairLines) line.style.background = color;
  }

  flashDamage(): void {
    clearTimeout(this.damageTimer);
    this.damageOverlay.style.transition = 'opacity 0s';
    this.damageOverlay.style.opacity = '1';
    this.damageTimer = window.setTimeout(() => {
      this.damageOverlay.style.transition = 'opacity 0.15s';
      this.damageOverlay.style.opacity = '0';
    }, 150);
  }

  flashHitMarker(): void {
    clearTimeout(this.hitMarkerTimer);
    this.hitMarker.style.transition = 'opacity 0s';
    this.hitMarker.style.opacity = '1';
    this.hitMarkerTimer = window.setTimeout(() => {
      this.hitMarker.style.transition = 'opacity 0.2s';
      this.hitMarker.style.opacity = '0';
    }, 200);
  }

  showKill(text: string): void {
    clearTimeout(this.killTimer);
    this.killText.textContent = text;
    this.killText.style.transition = 'opacity 0s';
    this.killText.style.opacity = '1';
    this.killTimer = window.setTimeout(() => {
      this.killText.style.transition = 'opacity 0.5s';
      this.killText.style.opacity = '0';
    }, 1500);
  }

  showBossPhase(phase: number): void {
    clearTimeout(this.bossPhaseTimer);
    this.bossPhaseText.textContent = `【第 ${phase} 阶段】`;
    this.bossPhaseText.style.transition = 'opacity 0s';
    this.bossPhaseText.style.opacity = '1';
    this.bossPhaseTimer = window.setTimeout(() => {
      this.bossPhaseText.style.transition = 'opacity 0.8s';
      this.bossPhaseText.style.opacity = '0';
    }, 2500);
  }

  updateRadar(
    playerX: number,
    playerZ: number,
    playerYaw: number,
    enemies: EnemyBlip[],
    pickups: PickupBlip[],
  ): void {
    const ctx = this.radarCtx;
    const R = 75; // canvas radius
    const cx = 75;
    const cy = 75;
    const worldR = 200; // CONFIG.hud.radarRadius — world units shown

    ctx.clearRect(0, 0, 150, 150);

    // Background circle
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.0)';
    ctx.fill();

    // Sweep rings
    ctx.strokeStyle = 'rgba(218,165,32,0.2)';
    ctx.lineWidth = 1;
    for (const r of [0.33, 0.66, 1.0]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cross hair
    ctx.strokeStyle = 'rgba(218,165,32,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.lineTo(cx, cy + R);
    ctx.moveTo(cx - R, cy);
    ctx.lineTo(cx + R, cy);
    ctx.stroke();

    const sin = Math.sin(-playerYaw);
    const cos = Math.cos(-playerYaw);

    const toBlip = (wx: number, wz: number): [number, number] => {
      const dx = wx - playerX;
      const dz = wz - playerZ;
      const rx = dx * cos - dz * sin;
      const rz = dx * sin + dz * cos;
      const bx = cx + (rx / worldR) * R;
      const by = cy + (rz / worldR) * R;
      return [bx, by];
    };

    // Pickups (blue dots)
    for (const p of pickups) {
      const [bx, by] = toBlip(p.x, p.z);
      if ((bx - cx) ** 2 + (by - cy) ** 2 > R * R) continue;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#4af';
      ctx.fill();
    }

    // Enemies (red triangles)
    for (const e of enemies) {
      const [bx, by] = toBlip(e.x, e.z);
      if ((bx - cx) ** 2 + (by - cy) ** 2 > R * R) continue;
      ctx.beginPath();
      ctx.moveTo(bx, by - 4);
      ctx.lineTo(bx - 3, by + 3);
      ctx.lineTo(bx + 3, by + 3);
      ctx.closePath();
      ctx.fillStyle = '#e74c3c';
      ctx.fill();
    }

    // Player dot (gold, center)
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = GOLD;
    ctx.fill();

    // Clip to circle
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // Border
    ctx.beginPath();
    ctx.arc(cx, cy, R - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(218,165,32,0.5)`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  showGameOver(stats: { level: number; kills: number; time: number }): void {
    this.hideEndScreens();
    const overlay = div(
      `position:fixed;top:0;left:0;width:100%;height:100%;` +
        `background:rgba(0,0,0,0.88);display:flex;flex-direction:column;` +
        `align-items:center;justify-content:center;z-index:200;pointer-events:auto;` +
        `font-family:monospace;color:#fff;`,
      'hud-end-game-over',
    );
    const title = div(
      `font-size:40px;font-weight:bold;color:#c0392b;letter-spacing:4px;margin-bottom:24px;`,
    );
    title.textContent = '道途已断';
    const info = div(`font-size:16px;color:#aaa;line-height:2;text-align:center;`);
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);
    info.innerHTML =
      `到达第 <span style="color:${GOLD}">${stats.level}</span> 关&emsp;` +
      `斩杀 <span style="color:${GOLD}">${stats.kills}</span> 敌&emsp;` +
      `历时 <span style="color:${GOLD}">${mins}:${String(secs).padStart(2, '0')}</span>`;
    const btn = document.createElement('button');
    btn.id = 'hud-restart';
    btn.textContent = '重新修炼';
    btn.style.cssText =
      `margin-top:32px;padding:12px 40px;font-size:18px;font-family:monospace;` +
      `background:rgba(192,57,43,0.7);color:#fff;border:2px solid #c0392b;` +
      `border-radius:6px;cursor:pointer;letter-spacing:2px;pointer-events:auto;`;
    overlay.append(title, info, btn);
    document.body.appendChild(overlay);
  }

  showLevelComplete(level: number, grade: string): void {
    this.hideEndScreens();
    const overlay = div(
      `position:fixed;top:0;left:0;width:100%;height:100%;` +
        `background:rgba(0,0,0,0.82);display:flex;flex-direction:column;` +
        `align-items:center;justify-content:center;z-index:200;pointer-events:auto;` +
        `font-family:monospace;color:#fff;`,
      'hud-end-level-complete',
    );
    const title = div(
      `font-size:36px;font-weight:bold;color:${GOLD};letter-spacing:4px;margin-bottom:16px;`,
    );
    title.textContent = `第 ${level} 关 通关`;
    const gradeEl = div(`font-size:56px;font-weight:bold;color:#fff;margin-bottom:20px;`);
    gradeEl.textContent = grade;
    const btn = document.createElement('button');
    btn.id = 'hud-next-level';
    btn.textContent = '继续前行';
    btn.style.cssText =
      `margin-top:16px;padding:12px 40px;font-size:18px;font-family:monospace;` +
      `background:rgba(218,165,32,0.3);color:#fff;border:2px solid ${GOLD};` +
      `border-radius:6px;cursor:pointer;letter-spacing:2px;pointer-events:auto;`;
    overlay.append(title, gradeEl, btn);
    document.body.appendChild(overlay);
  }

  hideEndScreens(): void {
    for (const id of ['hud-end-game-over', 'hud-end-level-complete']) {
      document.getElementById(id)?.remove();
    }
  }

  dispose(): void {
    this.root.remove();
    this.hideEndScreens();
  }
}
