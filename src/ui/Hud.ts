import { CONFIG } from '../config';

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
  color?: string;
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
  private killEl: HTMLDivElement;
  private timerEl: HTMLDivElement;

  // Crosshair lines
  private crosshairLines: HTMLDivElement[] = [];
  private crosshairSpread = 0;
  private finalStrikeDot: HTMLDivElement;

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
  private cultLevelEl: HTMLDivElement;
  private cultExpBar: HTMLDivElement;

  // Radar
  private radarCanvas: HTMLCanvasElement;
  private radarCtx: CanvasRenderingContext2D;

  // Overlays
  private damageOverlay: HTMLDivElement;
  private lowHpVignette: HTMLDivElement;
  private boundaryOverlay: HTMLDivElement;
  private hitMarker: HTMLDivElement;
  private killText: HTMLDivElement;
  private killFeed: HTMLDivElement[] = [];
  private killTimers: number[] = [];
  private bossPhaseText: HTMLDivElement;

  // Boss HP bar
  private bossHpContainer: HTMLDivElement;
  private bossHpBar: HTMLDivElement;
  private bossHpFill: HTMLDivElement;
  private bossShieldBar: HTMLDivElement;
  private bossShieldFill: HTMLDivElement;

  // Timers
  private damageTimer = 0;
  private hitMarkerTimer = 0;
  private bossPhaseTimer = 0;
  private damageDirTimer = 0;
  private breakthroughTimer = 0;
  private comboAnimTimer = 0;

  // Skill HUD
  private intentIcons: HTMLDivElement[] = [];
  private intentContainer!: HTMLDivElement;
  private skillCdContainer!: HTMLDivElement;
  private skillCds!: { q: HTMLDivElement; f: HTMLDivElement; r: HTMLDivElement };
  private skillCdOverlays!: { q: HTMLDivElement; f: HTMLDivElement; r: HTMLDivElement };
  private finalStrikeHint!: HTMLDivElement;

  // Talisman HUD
  private talismanSlots: HTMLDivElement[] = [];
  private talismanDurTexts: HTMLDivElement[] = [];
  private talismanNameTexts: HTMLDivElement[] = [];
  private talismanPickupEl!: HTMLDivElement;
  private talismanPickupTimer = 0;

  // Skill level display
  private skillLevelUpEl!: HTMLDivElement;
  private skillLevelUpTimer = 0;

  // Enemy tracker arrows (screen-edge indicators)
  private trackerArrows: HTMLDivElement[] = [];

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
    this.killEl = div(`color:${GOLD};`);
    this.killEl.textContent = '击杀: 0';
    this.timerEl = div(`color:#8af;`);
    this.timerEl.textContent = '0:00';
    topBar.append(this.levelEl, this.waveEl, this.enemyEl, this.killEl, this.timerEl);
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
    // Final strike ready indicator (center dot)
    this.finalStrikeDot = div(
      `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);` +
        `width:6px;height:6px;border-radius:50%;background:transparent;` +
        `box-shadow:none;transition:all 0.2s;`,
    );
    crossContainer.appendChild(this.finalStrikeDot);
    this.root.appendChild(crossContainer);

    // ── Bottom-left: weapon info (hidden — replaced by skill cooldowns) ────────
    const weaponPanel = div(
      `${BASE}bottom:90px;left:18px;background:${SEMI};` +
        `padding:6px 12px;border-radius:6px;font-size:13px;display:none;`,
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

    // Cultivation level badge
    const cultWrapper = div(`display:flex;flex-direction:column;align-items:center;font-size:11px;gap:2px;`);
    const cultLbl = div(`color:${GOLD};`);
    cultLbl.textContent = '修为';
    this.cultLevelEl = div(`font-size:14px;font-weight:bold;color:${GOLD};`);
    this.cultLevelEl.textContent = '第 0 层';
    // Exp progress bar
    const cultExpBarBg = div(`width:60px;height:3px;background:rgba(255,215,0,0.2);border-radius:2px;overflow:hidden;`);
    this.cultExpBar = div(`width:0%;height:100%;background:${GOLD};border-radius:2px;transition:width 0.3s;`);
    cultExpBarBg.appendChild(this.cultExpBar);
    cultWrapper.append(cultLbl, this.cultLevelEl, cultExpBarBg);
    bottomBar.appendChild(cultWrapper);

    // ── Sword Intent indicator (above bottom bar) ────────────────────
    this.intentContainer = div(
      `${BASE}bottom:80px;left:50%;transform:translateX(-50%);` +
        `display:flex;gap:8px;`,
    );
    for (let i = 0; i < 5; i++) {
      const icon = div(
        `width:20px;height:28px;border:2px solid #555;border-radius:2px;` +
          `background:transparent;transition:all 0.2s;` +
          `clip-path:polygon(50% 0%, 100% 30%, 100% 100%, 0% 100%, 0% 30%);`,
      );
      this.intentIcons.push(icon);
      this.intentContainer.appendChild(icon);
    }
    this.root.appendChild(this.intentContainer);

    // ── Skill cooldown indicators (left side, above bottom bar) ────
    this.skillCdContainer = div(
      `${BASE}bottom:80px;left:18px;display:flex;gap:6px;font-size:12px;`,
    );
    const makeCdBox = (label: string): { box: HTMLDivElement; overlay: HTMLDivElement } => {
      const box = div(
        `position:relative;width:36px;height:36px;border:1px solid ${GOLD};border-radius:4px;` +
          `display:flex;align-items:center;justify-content:center;` +
          `background:rgba(0,0,0,0.6);color:${GOLD};font-weight:bold;overflow:hidden;`,
      );
      box.textContent = label;
      const overlay = div(
        `position:absolute;inset:0;border-radius:3px;pointer-events:none;`,
      );
      overlay.style.display = 'none';
      box.appendChild(overlay);
      return { box, overlay };
    };
    const cd1 = makeCdBox('1'), cd2 = makeCdBox('2'), cd3 = makeCdBox('3');
    this.skillCds = { q: cd1.box, f: cd2.box, r: cd3.box };
    this.skillCdOverlays = { q: cd1.overlay, f: cd2.overlay, r: cd3.overlay };
    this.skillCdContainer.append(this.skillCds.q, this.skillCds.f, this.skillCds.r);
    this.root.appendChild(this.skillCdContainer);

    // ── Skill level-up notification ──────────────────────────────────
    this.skillLevelUpEl = div(
      `${BASE}top:42%;left:50%;transform:translateX(-50%);` +
        `font-size:20px;font-weight:bold;color:#44ffcc;letter-spacing:2px;` +
        `text-shadow:0 0 10px rgba(68,255,204,0.8);opacity:0;transition:all 0.3s;`,
    );
    this.root.appendChild(this.skillLevelUpEl);

    // ── Final strike hint ────────────────────────────────────────────
    this.finalStrikeHint = div(
      `${BASE}top:55%;left:50%;transform:translateX(-50%);` +
        `font-size:16px;color:${GOLD};letter-spacing:2px;` +
        `text-shadow:0 0 12px rgba(255,215,0,0.8);opacity:0;transition:opacity 0.3s;`,
    );
    this.finalStrikeHint.textContent = '按左键 — 万剑归宗';
    this.root.appendChild(this.finalStrikeHint);

    // ── Talisman slots (bottom bar, after HP) ────────────────────────
    const talismanContainer = div(
      `${BASE}bottom:80px;right:180px;display:flex;gap:6px;`,
    );
    for (let i = 0; i < 2; i++) {
      const slotWrapper = div(`position:relative;display:flex;flex-direction:column;align-items:center;`);
      const slot = div(
        `width:28px;height:28px;border:1px solid #555;border-radius:4px;` +
          `background:rgba(0,0,0,0.5);position:relative;`,
      );
      const durText = div(
        `position:absolute;bottom:1px;right:2px;font-size:9px;color:#fff;` +
          `text-shadow:0 0 3px #000;`,
      );
      const nameText = div(
        `font-size:9px;color:#aaa;margin-top:1px;white-space:nowrap;`,
      );
      slot.appendChild(durText);
      slotWrapper.appendChild(slot);
      slotWrapper.appendChild(nameText);
      this.talismanSlots.push(slot);
      this.talismanDurTexts.push(durText);
      this.talismanNameTexts.push(nameText);
      talismanContainer.appendChild(slotWrapper);
    }
    this.root.appendChild(talismanContainer);

    // ── Talisman pickup notification ─────────────────────────────────
    this.talismanPickupEl = div(
      `${BASE}top:35%;left:50%;transform:translate(-50%,-50%) scale(0.8);` +
        `text-align:center;opacity:0;transition:all 0.2s;pointer-events:none;`,
    );
    this.root.appendChild(this.talismanPickupEl);

    this.root.appendChild(bottomBar);

    // ── Damage flash overlay ──────────────────────────────────────────────────
    this.damageOverlay = div(
      `${BASE}top:0;left:0;width:100%;height:100%;` +
        `background:radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,0.55) 100%);` +
        `opacity:0;transition:opacity 0.05s;`,
    );
    this.root.appendChild(this.damageOverlay);

    // ── Combo tier border glow ────────────────────────────────────────────
    this.comboBorderGlow = div(
      `${BASE}top:0;left:0;width:100%;height:100%;pointer-events:none;` +
        `box-shadow:inset 0 0 60px transparent;opacity:0;transition:opacity 0.3s,box-shadow 0.3s;`,
    );
    this.root.appendChild(this.comboBorderGlow);

    // ── Low HP vignette (persistent, fades in when HP < 30%) ──────────────
    this.lowHpVignette = div(
      `${BASE}top:0;left:0;width:100%;height:100%;` +
        `background:radial-gradient(ellipse at center, transparent 30%, rgba(120,0,0,0.35) 100%);` +
        `opacity:0;transition:opacity 0.5s;pointer-events:none;`,
    );
    this.root.appendChild(this.lowHpVignette);

    // ── Boundary proximity warning (amber edge glow) ────────────────────────
    this.boundaryOverlay = div(
      `${BASE}top:0;left:0;width:100%;height:100%;` +
        `box-shadow:inset 0 0 80px rgba(218,165,32,0.6);` +
        `opacity:0;transition:opacity 0.3s;pointer-events:none;`,
    );
    this.root.appendChild(this.boundaryOverlay);

    // ── Hit marker ────────────────────────────────────────────────────────────
    this.hitMarker = div(
      `${BASE}top:50%;left:50%;transform:translate(-50%,-50%);` +
        `font-size:22px;font-weight:bold;color:#f1c40f;opacity:0;transition:opacity 0.05s;`,
    );
    this.hitMarker.textContent = '+';
    this.root.appendChild(this.hitMarker);

    // ── Kill notification (3-line rolling feed) ────────────────────────────────
    const killContainer = div(
      `${BASE}top:32%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;`,
    );
    for (let i = 0; i < 3; i++) {
      const line = div(
        `font-size:16px;color:${GOLD};letter-spacing:2px;text-shadow:0 0 8px #000;opacity:0;transition:opacity 0.5s;white-space:nowrap;`,
      );
      this.killFeed.push(line);
      killContainer.appendChild(line);
    }
    this.killText = div(''); // kept for hideEndScreens compat
    this.killText.style.display = 'none';
    this.root.appendChild(killContainer);

    // ── Boss phase text ───────────────────────────────────────────────────────
    this.bossPhaseText = div(
      `${BASE}top:30%;left:50%;transform:translateX(-50%);` +
        `font-size:22px;font-weight:bold;color:#c0392b;letter-spacing:3px;` +
        `text-shadow:0 0 12px rgba(200,0,0,0.8);opacity:0;`,
    );
    this.root.appendChild(this.bossPhaseText);

    // ── Boss HP bar (hidden until boss fight) ────────────────────────────────
    this.bossHpContainer = div(
      `${BASE}top:8%;left:50%;transform:translateX(-50%);width:40%;display:none;flex-direction:column;align-items:center;gap:3px;`,
    );
    const bossLabel = div(`font-size:12px;color:#c0392b;letter-spacing:2px;`, '妖王');
    this.bossHpBar = div(`width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;`);
    this.bossHpFill = div(`width:100%;height:100%;background:linear-gradient(90deg,#c0392b,#e74c3c);border-radius:4px;transition:width 0.2s;`);
    this.bossHpBar.appendChild(this.bossHpFill);
    this.bossShieldBar = div(`width:100%;height:5px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;display:none;`);
    this.bossShieldFill = div(`width:100%;height:100%;background:linear-gradient(90deg,#9b59b6,#8e44ad);border-radius:3px;transition:width 0.15s;`);
    this.bossShieldBar.appendChild(this.bossShieldFill);
    this.bossHpContainer.appendChild(bossLabel);
    this.bossHpContainer.appendChild(this.bossHpBar);
    this.bossHpContainer.appendChild(this.bossShieldBar);
    this.root.appendChild(this.bossHpContainer);

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

  private waveCountdownEl: HTMLDivElement | null = null;
  setWaveCountdown(seconds: number): void {
    if (seconds <= 0) {
      if (this.waveCountdownEl) {
        this.waveCountdownEl.remove();
        this.waveCountdownEl = null;
      }
      return;
    }
    if (!this.waveCountdownEl) {
      this.waveCountdownEl = div(
        `position:fixed;top:22%;left:50%;transform:translateX(-50%);` +
        `font-family:monospace;font-size:24px;font-weight:bold;color:#aaf;` +
        `letter-spacing:2px;pointer-events:none;z-index:50;opacity:0.7;`,
      );
      document.body.appendChild(this.waveCountdownEl);
    }
    this.waveCountdownEl.textContent = `${Math.ceil(seconds)}`;
  }

  setEnemyCount(count: number): void {
    this.enemyEl.textContent = `敌人: ${count}`;
  }

  setKillCount(count: number): void {
    this.killEl.textContent = `击杀: ${count}`;
  }

  setTimer(elapsed: number): void {
    const mins = Math.floor(elapsed / 60);
    const secs = Math.floor(elapsed % 60);
    this.timerEl.textContent = `${mins}:${String(secs).padStart(2, '0')}`;
  }

  private comboContainer: HTMLDivElement | null = null;
  private comboBorderGlow: HTMLDivElement;
  setCombo(count: number, multiplier: number, urgent = false): void {
    if (count <= 1) {
      if (this.comboContainer) {
        this.comboContainer.remove();
        this.comboContainer = null;
      }
      this.comboBorderGlow.style.opacity = '0';
      return;
    }
    if (!this.comboContainer) {
      this.comboContainer = document.createElement('div');
      this.comboContainer.style.cssText =
        `position:fixed;top:18%;left:50%;transform:translateX(-50%);` +
        `font-family:monospace;font-size:28px;font-weight:bold;` +
        `color:${GOLD};letter-spacing:3px;pointer-events:none;z-index:50;` +
        `text-shadow:0 0 10px rgba(255,215,0,0.5);transition:transform 0.15s;`;
      document.body.appendChild(this.comboContainer);
    }
    this.comboContainer.textContent = `${count}连斩 x${multiplier.toFixed(1)}`;
    // Urgency blink when combo about to expire
    if (urgent) {
      const blink = Math.sin(performance.now() * 0.02) > 0;
      this.comboContainer.style.color = blink ? '#ff4444' : GOLD;
    } else {
      this.comboContainer.style.color = GOLD;
    }
    // Punch animation
    this.comboContainer.style.transform = 'translateX(-50%) scale(1.2)';
    clearTimeout(this.comboAnimTimer);
    this.comboAnimTimer = window.setTimeout(() => {
      if (this.comboContainer) this.comboContainer.style.transform = 'translateX(-50%) scale(1)';
      this.comboAnimTimer = 0;
    }, 100);
    // Combo tier screen border glow
    if (count >= 10) {
      const pulse = 0.4 + 0.3 * Math.sin(performance.now() * 0.006);
      this.comboBorderGlow.style.opacity = `${pulse}`;
      this.comboBorderGlow.style.boxShadow = 'inset 0 0 80px rgba(255,50,0,0.5)';
    } else if (count >= 5) {
      const pulse = 0.3 + 0.2 * Math.sin(performance.now() * 0.005);
      this.comboBorderGlow.style.opacity = `${pulse}`;
      this.comboBorderGlow.style.boxShadow = 'inset 0 0 60px rgba(255,170,0,0.4)';
    } else {
      this.comboBorderGlow.style.opacity = '0';
    }
  }

  private hpPrev = 0;
  private hpFlashTimer = 0;

  setHp(hp: number, max: number, dt = 1 / 60): void {
    const pct = Math.max(0, Math.min(1, hp / max)) * 100;
    this.hpBar.style.width = `${pct}%`;
    this.hpText.textContent = `${Math.ceil(hp)}/${Math.ceil(max)}`;

    // Green glow flash on HP gain (mirrors spirit bar cyan flash)
    if (hp > this.hpPrev + 1) {
      this.hpFlashTimer = 0.35;
      this.hpBar.style.boxShadow = '0 0 12px #44ff44, 0 0 4px #ffffff';
      this.hpBar.style.filter = 'brightness(1.8)';
    }
    this.hpPrev = hp;
    if (this.hpFlashTimer > 0) {
      this.hpFlashTimer -= dt;
      if (this.hpFlashTimer <= 0) {
        this.hpBar.style.boxShadow = 'none';
        this.hpBar.style.filter = 'none';
      }
    }

    // Pulse warning when below 25%
    if (pct < 25) {
      const pulse = Math.sin(performance.now() * 0.008) * 0.3 + 0.7;
      this.hpBar.style.opacity = `${pulse}`;
    } else {
      this.hpBar.style.opacity = '1';
    }
    // Low HP vignette below 30%
    this.lowHpVignette.style.opacity = pct < 30 ? `${1 - pct / 30}` : '0';
  }

  setBoundaryWarning(penetration: number): void {
    // penetration: 0 = safe, 1 = at boundary edge
    this.boundaryOverlay.style.opacity = penetration > 0 ? `${Math.min(1, penetration)}` : '0';
  }

  private spiritPrev = 0;
  private spiritFlashTimer = 0;

  setSpirit(spirit: number, max: number, dt = 1 / 60): void {
    const pct = Math.max(0, Math.min(1, spirit / max)) * 100;
    this.spiritBar.style.width = `${pct}%`;
    this.spiritText.textContent = `${Math.floor(spirit)}/${Math.ceil(max)}`;

    // Flash cyan glow on spirit gain
    if (spirit > this.spiritPrev + 1) {
      this.spiritFlashTimer = 0.35;
      this.spiritBar.style.boxShadow = '0 0 12px #44aaff, 0 0 4px #ffffff';
      this.spiritBar.style.filter = 'brightness(1.8)';
    }
    this.spiritPrev = spirit;
    if (this.spiritFlashTimer > 0) {
      this.spiritFlashTimer -= dt;
      if (this.spiritFlashTimer <= 0) {
        this.spiritBar.style.boxShadow = 'none';
        this.spiritBar.style.filter = 'none';
      }
    }

    // Pulse warning when below 25%
    if (pct < 25) {
      const pulse = Math.sin(performance.now() * 0.008) * 0.3 + 0.7;
      this.spiritBar.style.opacity = `${pulse}`;
    } else {
      this.spiritBar.style.opacity = '1';
    }
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

  setCultivationLevel(level: number, expPct?: number): void {
    this.cultLevelEl.textContent = `第 ${level} 层`;
    if (expPct !== undefined) {
      this.cultExpBar.style.width = `${Math.min(100, expPct * 100)}%`;
    }
  }

  setWeapon(name: string, ammoText: string): void {
    this.weaponNameEl.textContent = name;
    this.ammoEl.textContent = ammoText;
  }

  setCrosshairLocked(locked: boolean, dt = 1 / 60): void {
    const color = locked ? '#e74c3c' : '#fff';
    // Decay crosshair spread
    if (this.crosshairSpread > 0) {
      this.crosshairSpread = Math.max(0, this.crosshairSpread - dt);
    }
    const s = this.crosshairSpread * 5; // max 5px spread
    const styles = [
      `position:absolute;background:${color};top:${-s}px;left:50%;transform:translateX(-50%);width:2px;height:${8 + s}px;`,
      `position:absolute;background:${color};bottom:${-s}px;left:50%;transform:translateX(-50%);width:2px;height:${8 + s}px;`,
      `position:absolute;background:${color};left:${-s}px;top:50%;transform:translateY(-50%);width:${8 + s}px;height:2px;`,
      `position:absolute;background:${color};right:${-s}px;top:50%;transform:translateY(-50%);width:${8 + s}px;height:2px;`,
    ];
    for (let i = 0; i < this.crosshairLines.length; i++) {
      this.crosshairLines[i]!.style.cssText = styles[i]!;
    }
  }

  pulseCrosshair(): void {
    this.crosshairSpread = 1;
  }

  setSwordIntent(stacks: number, max: number): void {
    const full = stacks >= max;
    for (let i = 0; i < this.intentIcons.length; i++) {
      const icon = this.intentIcons[i]!;
      if (i < stacks) {
        icon.style.background = full ? '#ffd700' : '#44ffcc';
        icon.style.borderColor = full ? '#ffd700' : '#44ffcc';
        icon.style.boxShadow = full ? '0 0 8px #ffd700' : 'none';
      } else {
        icon.style.background = 'transparent';
        icon.style.borderColor = '#555';
        icon.style.boxShadow = 'none';
      }
    }
    if (full) {
      this.intentContainer.style.filter = `brightness(${1 + 0.3 * Math.sin(Date.now() * 0.005)})`;
      this.finalStrikeDot.style.background = '#ffd700';
      this.finalStrikeDot.style.boxShadow = '0 0 8px #ffd700, 0 0 16px rgba(255,215,0,0.4)';
    } else {
      this.intentContainer.style.filter = 'none';
      this.finalStrikeDot.style.background = 'transparent';
      this.finalStrikeDot.style.boxShadow = 'none';
    }
  }

  setSkillCooldowns(bladeFan: number, swordDash: number, parry: number, opts: { bladeFan: number; swordDash: number; parry: number; bladeFanTotal?: number; swordDashTotal?: number; parryTotal?: number }): void {
    const setCd = (el: HTMLDivElement, overlay: HTMLDivElement, cd: number, totalCd: number, key: string, cost: number) => {
      if (cd > 0) {
        const pct = cd / totalCd;
        const deg = Math.round(pct * 360);
        overlay.style.display = 'block';
        overlay.style.background = `conic-gradient(rgba(0,0,0,0.7) ${deg}deg, transparent ${deg}deg)`;
        el.style.color = '#888';
        el.textContent = cd.toFixed(1);
        el.style.opacity = '1';
      } else {
        overlay.style.display = 'none';
        el.style.opacity = '1';
        el.textContent = `${key} ⬡${cost}`;
        el.style.color = GOLD;
      }
    };
    setCd(this.skillCds.q, this.skillCdOverlays.q, bladeFan, opts.bladeFanTotal ?? CONFIG.skills.bladeFan.cooldown, '1', opts.bladeFan);
    setCd(this.skillCds.f, this.skillCdOverlays.f, swordDash, opts.swordDashTotal ?? CONFIG.skills.swordDash.cooldown, '2', opts.swordDash);
    setCd(this.skillCds.r, this.skillCdOverlays.r, parry, opts.parryTotal ?? CONFIG.skills.parry.cooldown, '3', opts.parry);
  }

  setFinalStrikeReady(ready: boolean): void {
    this.finalStrikeHint.style.opacity = ready ? '1' : '0';
  }

  setTalismanSlots(slots: Array<{ type: string; durability: number; color: number; name?: string } | null>): void {
    for (let i = 0; i < 2; i++) {
      const slot = this.talismanSlots[i]!;
      const durText = this.talismanDurTexts[i]!;
      const nameText = this.talismanNameTexts[i]!;
      const data = slots[i] ?? null;
      if (data) {
        const hex = '#' + data.color.toString(16).padStart(6, '0');
        slot.style.borderColor = hex;
        slot.style.background = hex + '44';
        slot.style.boxShadow = `0 0 6px ${hex}`;
        durText.textContent = `${data.durability}`;
        nameText.textContent = data.name ?? '';
        nameText.style.color = hex;
      } else {
        slot.style.borderColor = '#555';
        slot.style.background = 'rgba(0,0,0,0.5)';
        slot.style.boxShadow = 'none';
        durText.textContent = '';
        nameText.textContent = '';
      }
    }
  }

  showTalismanPickup(name: string, description: string): void {
    this.talismanPickupEl.innerHTML =
      `<div style="font-size:28px;font-weight:bold;color:#ffd700;text-shadow:0 0 12px rgba(255,215,0,0.8);letter-spacing:3px;">` +
      `「获得 ${name}」</div>` +
      `<div style="font-size:14px;color:#ccc;margin-top:6px;">${description}</div>`;
    this.talismanPickupEl.style.opacity = '1';
    this.talismanPickupEl.style.transform = 'translate(-50%,-50%) scale(1)';
    clearTimeout(this.talismanPickupTimer);
    this.talismanPickupTimer = window.setTimeout(() => {
      this.talismanPickupEl.style.opacity = '0';
      this.talismanPickupEl.style.transform = 'translate(-50%,-50%) scale(0.8)';
    }, 1500);
  }

  setSkillLevels(bladeFan: number, swordDash: number, parry: number): void {
    const levels = [bladeFan, swordDash, parry];
    for (let i = 0; i < 3; i++) {
      const cdBox = [this.skillCds.q, this.skillCds.f, this.skillCds.r][i]!;
      const lv = levels[i]!;
      if (lv > 0) {
        cdBox.style.borderWidth = '2px';
        cdBox.title = `Lv.${lv}`;
        // Show level as small text at top-left corner
        let lvEl = cdBox.querySelector('.skill-lv') as HTMLDivElement | null;
        if (!lvEl) {
          lvEl = div(`position:absolute;top:-8px;left:-4px;font-size:8px;color:#44ffcc;text-shadow:0 0 3px #000;`);
          lvEl.className = 'skill-lv';
          cdBox.style.position = 'relative';
          cdBox.appendChild(lvEl);
        }
        lvEl.textContent = `${lv}`;
      }
    }
  }

  showSkillLevelUp(name: string, level: number): void {
    this.skillLevelUpEl.textContent = `${name} 升至 Lv.${level}`;
    this.skillLevelUpEl.style.opacity = '1';
    clearTimeout(this.skillLevelUpTimer);
    this.skillLevelUpTimer = window.setTimeout(() => {
      this.skillLevelUpEl.style.opacity = '0';
    }, 2000);
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

  private damageDirEl: HTMLDivElement | null = null;
  flashDamageDirection(source: { x: number; z: number }, player: { x: number; z: number }, playerQuat: { x: number; y: number; z: number; w: number }): void {
    // Calculate angle from player to source in world space
    const dx = source.x - player.x;
    const dz = source.z - player.z;
    // Transform to player-local space using quaternion yaw
    const sinY = 2 * (playerQuat.w * playerQuat.y - playerQuat.x * playerQuat.z);
    const cosY = 1 - 2 * (playerQuat.y * playerQuat.y + playerQuat.z * playerQuat.z);
    const localX = dx * cosY + dz * sinY;
    const localZ = -dx * sinY + dz * cosY;
    // Screen angle: 0=right, 90=bottom, etc. (player forward = -Z = top of screen)
    const angle = Math.atan2(localX, -localZ);

    if (!this.damageDirEl) {
      this.damageDirEl = document.createElement('div');
      this.damageDirEl.style.cssText =
        `position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:80;`;
      document.body.appendChild(this.damageDirEl);
    }
    // Red gradient from the direction of the hit
    const deg = (angle * 180 / Math.PI) - 90; // CSS gradient angle
    this.damageDirEl.style.background =
      `linear-gradient(${deg}deg, rgba(200,30,30,0.5) 0%, transparent 40%)`;
    this.damageDirEl.style.transition = 'opacity 0s';
    this.damageDirEl.style.opacity = '1';
    clearTimeout(this.damageDirTimer);
    this.damageDirTimer = window.setTimeout(() => {
      if (this.damageDirEl) {
        this.damageDirEl.style.transition = 'opacity 0.4s';
        this.damageDirEl.style.opacity = '0';
      }
      this.damageDirTimer = 0;
    }, 200);
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
    // Shift entries: [1]→[0], [2]→[1], new→[2]
    for (let i = 0; i < 2; i++) {
      const from = this.killFeed[i + 1]!;
      const to = this.killFeed[i]!;
      to.textContent = from.textContent;
      to.style.opacity = from.style.opacity;
      clearTimeout(this.killTimers[i]);
      this.killTimers[i] = this.killTimers[i + 1];
    }
    // Clear old timer on slot 2
    clearTimeout(this.killTimers[2]);
    // Set new message on slot 2 (bottom = newest)
    const slot = this.killFeed[2]!;
    slot.textContent = text;
    slot.style.transition = 'opacity 0s';
    slot.style.opacity = '1';
    this.killTimers[2] = window.setTimeout(() => {
      slot.style.transition = 'opacity 0.5s';
      slot.style.opacity = '0';
      this.killTimers[2] = 0;
    }, 2500);
  }

  private breakthroughFlash: HTMLDivElement | null = null;
  showBreakthroughFlash(): void {
    if (!this.breakthroughFlash) {
      this.breakthroughFlash = document.createElement('div');
      this.breakthroughFlash.style.cssText =
        `position:fixed;top:0;left:0;width:100%;height:100%;` +
        `background:radial-gradient(ellipse at center,rgba(255,215,0,0.4),transparent 70%);` +
        `pointer-events:none;z-index:90;opacity:0;transition:opacity 0.3s;`;
      document.body.appendChild(this.breakthroughFlash);
    }
    this.breakthroughFlash.style.transition = 'opacity 0s';
    this.breakthroughFlash.style.opacity = '1';
    clearTimeout(this.breakthroughTimer);
    this.breakthroughTimer = window.setTimeout(() => {
      if (this.breakthroughFlash) {
        this.breakthroughFlash.style.transition = 'opacity 1.0s';
        this.breakthroughFlash.style.opacity = '0';
      }
      this.breakthroughTimer = 0;
    }, 200);
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

  private deathVignetteEl: HTMLDivElement | null = null;
  setDeathVignette(pct: number): void {
    if (pct <= 0) {
      if (this.deathVignetteEl) { this.deathVignetteEl.style.display = 'none'; }
      return;
    }
    if (!this.deathVignetteEl) {
      this.deathVignetteEl = document.createElement('div');
      this.deathVignetteEl.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:200;' +
        'background:radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.7) 100%);';
      document.body.appendChild(this.deathVignetteEl);
    }
    this.deathVignetteEl.style.display = 'block';
    this.deathVignetteEl.style.opacity = String(pct);
  }

  /** Show/hide the boss HP bar at the top of the screen */
  setBossHpVisible(visible: boolean): void {
    this.bossHpContainer.style.display = visible ? 'flex' : 'none';
  }

  setBossHp(hp: number, maxHp: number): void {
    const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
    this.bossHpFill.style.width = `${pct}%`;
    // Color shifts: red → orange → bright crimson as health drops
    if (pct > 50) {
      this.bossHpFill.style.background = 'linear-gradient(90deg,#c0392b,#e74c3c)';
    } else if (pct > 25) {
      this.bossHpFill.style.background = 'linear-gradient(90deg,#e67e22,#f39c12)';
    } else {
      this.bossHpFill.style.background = 'linear-gradient(90deg,#ff2200,#ff4422)';
    }
    // Pulse urgency below 30%
    if (pct < 30) {
      const pulse = Math.sin(performance.now() * 0.008) * 0.3 + 0.7;
      this.bossHpFill.style.opacity = `${pulse}`;
    } else {
      this.bossHpFill.style.opacity = '1';
    }
  }

  setBossShield(shield: number, maxShield: number): void {
    if (shield <= 0) {
      this.bossShieldBar.style.display = 'none';
      return;
    }
    this.bossShieldBar.style.display = 'block';
    const pct = Math.max(0, Math.min(100, (shield / maxShield) * 100));
    this.bossShieldFill.style.width = `${pct}%`;
  }

  /** Show a large centered announcement (level start, wave, etc.) */
  private announcementEl: HTMLDivElement | null = null;
  private announcementTimer = 0;
  showAnnouncement(text: string, color = '#daa520'): void {
    if (!this.announcementEl) {
      this.announcementEl = div(
        `${BASE}top:35%;left:50%;transform:translateX(-50%);` +
          `font-size:36px;font-weight:bold;letter-spacing:6px;` +
          `text-shadow:0 0 20px rgba(0,0,0,0.8),0 2px 4px rgba(0,0,0,0.5);` +
          `opacity:0;pointer-events:none;`,
      );
      this.root.appendChild(this.announcementEl);
    }
    clearTimeout(this.announcementTimer);
    this.announcementEl.textContent = text;
    this.announcementEl.style.color = color;
    // Phase 1: start big, slam in with deceleration
    this.announcementEl.style.transition = 'none';
    this.announcementEl.style.transform = 'translateX(-50%) scale(2.0)';
    this.announcementEl.style.opacity = '0';
    void this.announcementEl.offsetHeight; // force reflow
    this.announcementEl.style.transition = 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)';
    this.announcementEl.style.transform = 'translateX(-50%) scale(1.0)';
    this.announcementEl.style.opacity = '1';
    // Phase 2: shrink-fade out
    this.announcementTimer = window.setTimeout(() => {
      if (this.announcementEl) {
        this.announcementEl.style.transition = 'all 0.6s ease-in';
        this.announcementEl.style.transform = 'translateX(-50%) scale(0.9)';
        this.announcementEl.style.opacity = '0';
      }
    }, 1500);
  }

  updateRadar(
    playerX: number,
    playerZ: number,
    playerYaw: number,
    enemies: EnemyBlip[],
    pickups: PickupBlip[],
    boss?: { x: number; z: number },
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

    // Sweep line — rotating golden scan animation
    const sweepSpeed = 1.5;
    const sweepAngle = (performance.now() / 1000) * sweepSpeed;
    const sweepTail = Math.PI * 0.35;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, sweepAngle - sweepTail, sweepAngle);
    ctx.closePath();
    const grad = ctx.createConicGradient(sweepAngle - sweepTail, cx, cy);
    grad.addColorStop(0, 'rgba(218,165,32,0)');
    grad.addColorStop(0.7, 'rgba(218,165,32,0.08)');
    grad.addColorStop(1, 'rgba(218,165,32,0)');
    ctx.fillStyle = grad;
    ctx.fill();
    // Leading edge line
    ctx.strokeStyle = 'rgba(218,165,32,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sweepAngle) * R, cy + Math.sin(sweepAngle) * R);
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

    // Pickups (colored dots by type)
    for (const p of pickups) {
      const [bx, by] = toBlip(p.x, p.z);
      if ((bx - cx) ** 2 + (by - cy) ** 2 > R * R) continue;
      ctx.beginPath();
      ctx.arc(bx, by, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color ?? '#4af';
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

    // Boss (large purple diamond)
    if (boss) {
      const [bx, by] = toBlip(boss.x, boss.z);
      if ((bx - cx) ** 2 + (by - cy) ** 2 <= R * R) {
        const s = 7;
        ctx.beginPath();
        ctx.moveTo(bx, by - s);
        ctx.lineTo(bx + s, by);
        ctx.lineTo(bx, by + s);
        ctx.lineTo(bx - s, by);
        ctx.closePath();
        ctx.fillStyle = '#bb44ff';
        ctx.fill();
        // Pulsing glow ring
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
        ctx.strokeStyle = `rgba(187,68,255,${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, s + 2 + pulse * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
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

  /**
   * Show screen-edge arrows pointing toward off-screen enemies.
   * Called every frame when alive enemy count <= threshold (e.g. 3).
   * Each entry: screenX/screenY in NDC (-1..1), isOnScreen, distance in world units.
   */
  updateTrackers(
    trackers: Array<{ ndcX: number; ndcY: number; isOnScreen: boolean; distance: number }>,
  ): void {
    // Ensure we have enough arrow DOM elements
    while (this.trackerArrows.length < trackers.length) {
      const arrow = div(
        `${BASE}font-size:13px;font-weight:bold;color:#e74c3c;` +
          `text-shadow:0 0 6px rgba(231,76,60,0.8);transition:opacity 0.15s;`,
      );
      this.root.appendChild(arrow);
      this.trackerArrows.push(arrow);
    }
    // Hide excess arrows
    for (let i = trackers.length; i < this.trackerArrows.length; i++) {
      this.trackerArrows[i]!.style.opacity = '0';
    }

    const margin = 50; // px from screen edge
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    for (let i = 0; i < trackers.length; i++) {
      const t = trackers[i]!;
      const arrow = this.trackerArrows[i]!;

      if (t.isOnScreen) {
        // Enemy is on screen — show a subtle diamond marker above it
        const sx = ((t.ndcX + 1) / 2) * vw;
        const sy = ((1 - t.ndcY) / 2) * vh;
        arrow.style.left = `${sx}px`;
        arrow.style.top = `${sy - 30}px`;
        arrow.style.transform = 'translate(-50%,-50%)';
        arrow.innerHTML =
          `<span style="color:#f88;font-size:10px;">${Math.floor(t.distance)}m</span>`;
        arrow.style.opacity = '0.7';
      } else {
        // Enemy is off-screen — clamp to edge with directional arrow
        const angle = Math.atan2(-t.ndcY, t.ndcX);

        // Clamp to screen edges with margin
        const halfW = vw / 2 - margin;
        const halfH = vh / 2 - margin;

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const absCos = Math.abs(cos);
        const absSin = Math.abs(sin);

        let ex: number, ey: number;
        if (absCos * halfH > absSin * halfW) {
          // Hits left or right edge
          ex = vw / 2 + Math.sign(cos) * halfW;
          ey = vh / 2 - (sin / absCos) * halfW;
        } else {
          // Hits top or bottom edge
          ex = vw / 2 + (cos / absSin) * halfH;
          ey = vh / 2 - Math.sign(sin) * halfH;
        }
        // Clamp within screen
        ex = Math.max(margin, Math.min(vw - margin, ex));
        ey = Math.max(margin, Math.min(vh - margin, ey));

        // Unicode arrow rotation — pick closest arrow character
        const deg = angle * (180 / Math.PI);
        const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘'];
        const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;

        arrow.style.left = `${ex}px`;
        arrow.style.top = `${ey}px`;
        arrow.style.transform = 'translate(-50%,-50%)';
        arrow.innerHTML =
          `<span style="font-size:20px;">${arrows[idx]}</span>` +
          `<br><span style="font-size:11px;">${Math.floor(t.distance)}m</span>`;
        arrow.style.textAlign = 'center';
        // Pulse opacity for urgency
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
        arrow.style.opacity = `${pulse}`;
      }
    }
  }

  hideTrackers(): void {
    for (const arrow of this.trackerArrows) {
      arrow.style.opacity = '0';
    }
  }

  showGameOver(stats: { level: number; kills: number; time: number; maxCombo: number; newBest?: boolean; cultivation?: number }): void {
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
      `最高 <span style="color:${GOLD}">${stats.maxCombo}</span> 连斩&emsp;` +
      `修为 <span style="color:${GOLD}">${stats.cultivation ?? 0}</span> 层&emsp;` +
      `历时 <span style="color:${GOLD}">${mins}:${String(secs).padStart(2, '0')}</span>`;
    const bestTag = stats.newBest ? div(`margin-top:8px;font-size:14px;color:${GOLD};letter-spacing:2px;`) : null;
    if (bestTag) bestTag.textContent = '★ 新纪录 ★';
    const btn = document.createElement('button');
    btn.id = 'hud-restart';
    btn.textContent = '重新修炼';
    btn.style.cssText =
      `margin-top:32px;padding:12px 40px;font-size:18px;font-family:monospace;` +
      `background:rgba(192,57,43,0.7);color:#fff;border:2px solid #c0392b;` +
      `border-radius:6px;cursor:pointer;letter-spacing:2px;pointer-events:auto;`;
    if (bestTag) overlay.append(title, info, bestTag, btn);
    else overlay.append(title, info, btn);
    document.body.appendChild(overlay);
  }

  showVictory(stats: { level: number; kills: number; time: number; maxCombo: number; newBest?: boolean; cultivation?: number }): void {
    this.hideEndScreens();
    const overlay = div(
      `position:fixed;top:0;left:0;width:100%;height:100%;` +
        `background:rgba(0,0,0,0.85);display:flex;flex-direction:column;` +
        `align-items:center;justify-content:center;z-index:200;pointer-events:auto;` +
        `font-family:monospace;color:#fff;`,
      'hud-end-victory',
    );
    const title = div(
      `font-size:48px;font-weight:bold;color:${GOLD};letter-spacing:6px;margin-bottom:8px;` +
        `text-shadow:0 0 20px rgba(255,215,0,0.6),0 0 40px rgba(255,215,0,0.3);`,
    );
    title.textContent = '飞升成功';
    const subtitle = div(
      `font-size:18px;color:rgba(255,215,0,0.7);letter-spacing:3px;margin-bottom:32px;`,
    );
    subtitle.textContent = '道途圆满，大道已成';
    const info = div(`font-size:16px;color:#ccc;line-height:2.2;text-align:center;`);
    const mins = Math.floor(stats.time / 60);
    const secs = Math.floor(stats.time % 60);
    info.innerHTML =
      `通关 <span style="color:${GOLD}">${stats.level}</span> 关&emsp;` +
      `斩杀 <span style="color:${GOLD}">${stats.kills}</span> 敌&emsp;` +
      `最高 <span style="color:${GOLD}">${stats.maxCombo}</span> 连斩&emsp;` +
      `修为 <span style="color:${GOLD}">${stats.cultivation ?? 0}</span> 层&emsp;` +
      `历时 <span style="color:${GOLD}">${mins}:${String(secs).padStart(2, '0')}</span>`;
    const bestTag = stats.newBest ? div(`margin-top:8px;font-size:14px;color:${GOLD};letter-spacing:2px;`) : null;
    if (bestTag) bestTag.textContent = '★ 新纪录 ★';
    const btn = document.createElement('button');
    btn.id = 'hud-restart';
    btn.textContent = '再入轮回';
    btn.style.cssText =
      `margin-top:32px;padding:12px 40px;font-size:18px;font-family:monospace;` +
      `background:rgba(255,215,0,0.15);color:${GOLD};border:2px solid rgba(255,215,0,0.6);` +
      `border-radius:6px;cursor:pointer;letter-spacing:2px;pointer-events:auto;`;
    if (bestTag) overlay.append(title, subtitle, info, bestTag, btn);
    else overlay.append(title, subtitle, info, btn);
    document.body.appendChild(overlay);
  }

  showLevelComplete(level: number, grade: string, stats?: { kills: number; maxCombo: number }): void {
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
    const gradeEl = div(`font-size:56px;font-weight:bold;margin-bottom:12px;`);
    const gradeColors: Record<string, string> = { S: '#ffd700', A: '#44ff88', B: '#4488ff', C: '#aaaaaa' };
    gradeEl.style.color = gradeColors[grade] ?? '#fff';
    gradeEl.textContent = grade;
    const info = div(`font-size:14px;color:#aaa;line-height:2;text-align:center;`);
    if (stats) {
      info.innerHTML =
        `斩杀 <span style="color:${GOLD}">${stats.kills}</span> 敌&emsp;` +
        `最高 <span style="color:${GOLD}">${stats.maxCombo}</span> 连斩`;
    }
    const btn = document.createElement('button');
    btn.id = 'hud-next-level';
    btn.textContent = '继续前行';
    btn.style.cssText =
      `margin-top:16px;padding:12px 40px;font-size:18px;font-family:monospace;` +
      `background:rgba(218,165,32,0.3);color:#fff;border:2px solid ${GOLD};` +
      `border-radius:6px;cursor:pointer;letter-spacing:2px;pointer-events:auto;`;
    overlay.append(title, gradeEl, info, btn);
    document.body.appendChild(overlay);
  }

  hideEndScreens(): void {
    for (const id of ['hud-end-game-over', 'hud-end-victory', 'hud-end-level-complete']) {
      document.getElementById(id)?.remove();
    }
    if (this.comboContainer) {
      this.comboContainer.remove();
      this.comboContainer = null;
    }
    if (this.damageDirEl) {
      this.damageDirEl.style.opacity = '0';
    }
    // Clear kill feed
    for (let i = 0; i < this.killFeed.length; i++) {
      clearTimeout(this.killTimers[i]);
      this.killFeed[i]!.style.opacity = '0';
    }
    if (this.breakthroughFlash) {
      this.breakthroughFlash.style.opacity = '0';
    }
    if (this.deathVignetteEl) {
      this.deathVignetteEl.style.display = 'none';
    }
  }

  dispose(): void {
    // Clear all pending timers to prevent stale callbacks on disposed DOM
    clearTimeout(this.damageTimer);
    clearTimeout(this.hitMarkerTimer);
    clearTimeout(this.bossPhaseTimer);
    clearTimeout(this.damageDirTimer);
    clearTimeout(this.breakthroughTimer);
    clearTimeout(this.comboAnimTimer);
    clearTimeout(this.talismanPickupTimer);
    clearTimeout(this.skillLevelUpTimer);
    clearTimeout(this.announcementTimer);
    for (let i = 0; i < this.killTimers.length; i++) clearTimeout(this.killTimers[i]);
    this.killTimers.length = 0;

    this.root.remove();
    this.hideEndScreens();
    // Clean up elements appended to document.body (not this.root)
    if (this.waveCountdownEl) { this.waveCountdownEl.remove(); this.waveCountdownEl = null; }
    if (this.announcementEl) { this.announcementEl.remove(); this.announcementEl = null; }
    if (this.deathVignetteEl) { this.deathVignetteEl.remove(); this.deathVignetteEl = null; }
    for (const arrow of this.trackerArrows) arrow.remove();
    this.trackerArrows.length = 0;
    if (this.damageDirEl) { this.damageDirEl.remove(); this.damageDirEl = null; }
    if (this.breakthroughFlash) { this.breakthroughFlash.remove(); this.breakthroughFlash = null; }
  }
}
