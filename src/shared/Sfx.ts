/**
 * Sfx — Web Audio programmatic sound effects, zero asset files.
 * Lazy AudioContext, unlock on first user interaction.
 */

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  // Wind ambient
  private windGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;

  unlock(): void {
    if (this.unlocked) return;
    try {
      const AC = window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.18;
      this.master.connect(this.ctx.destination);
      void this.ctx.resume();
      this.unlocked = true;
    } catch {
      this.unlocked = false;
    }
  }

  shoot(): void {
    if (!this.ready()) return;
    // Low-end body + noise burst
    this.sweep(180, 60, 0.12, 'sawtooth', 0.6);
    this.noise(0.06, 2500, 1.2);
  }

  hit(): void {
    if (!this.ready()) return;
    this.beep(320, 0.05, 'square', 0.5);
    this.beep(180, 0.08, 'sine', 0.3);
  }

  empty(): void {
    if (!this.ready()) return;
    this.beep(220, 0.04, 'square', 0.3);
  }

  damage(): void {
    if (!this.ready()) return;
    this.sweep(220, 80, 0.25, 'triangle', 0.6);
  }

  death(): void {
    if (!this.ready()) return;
    this.sweep(440, 55, 0.8, 'sawtooth', 0.8);
  }

  enemyDie(): void {
    if (!this.ready()) return;
    this.sweep(180, 40, 0.5, 'square', 0.5);
    this.noise(0.12, 600, 0.8);
  }

  chestOpen(): void {
    if (!this.ready()) return;
    this.beep(440, 0.1, 'sine', 0.5);
    this.beep(660, 0.1, 'sine', 0.4);
    this.beep(880, 0.15, 'sine', 0.3);
  }

  pickup(): void {
    if (!this.ready()) return;
    this.beep(660, 0.06, 'sine', 0.4);
    this.beep(990, 0.08, 'sine', 0.3);
  }

  spiritBeam(): void {
    if (!this.ready()) return;
    this.sweep(2000, 800, 0.08, 'sawtooth', 0.5);
    this.beep(1500, 0.04, 'sine', 0.3);
  }

  swordDash(): void {
    if (!this.ready()) return;
    this.sweep(300, 2000, 0.15, 'sawtooth', 0.7);
    this.beep(1000, 0.05, 'sine', 0.4);
  }

  bossPhaseChange(): void {
    if (!this.ready()) return;
    this.sweep(80, 40, 1.0, 'sawtooth', 0.9);
    this.noise(0.5, 200, 0.6);
    this.beep(220, 0.5, 'triangle', 0.4);
  }

  boost(): void {
    if (!this.ready()) return;
    this.sweep(60, 120, 0.3, 'sawtooth', 0.5);
    this.beep(80, 0.2, 'square', 0.3);
  }

  levelComplete(): void {
    if (!this.ready()) return;
    this.beep(440, 0.15, 'sine', 0.5);
    this.beep(660, 0.15, 'sine', 0.5);
    this.beep(880, 0.2, 'sine', 0.5);
    this.sweep(440, 880, 0.5, 'triangle', 0.4);
  }

  bladeFan(): void {
    if (!this.ready()) return;
    this.sweep(800, 2000, 0.1, 'sawtooth', 0.5);
    this.beep(1200, 0.05, 'sine', 0.3);
  }

  parryActivate(): void {
    if (!this.ready()) return;
    this.beep(600, 0.1, 'triangle', 0.5);
    this.sweep(400, 800, 0.15, 'sine', 0.3);
  }

  parrySuccess(): void {
    if (!this.ready()) return;
    this.sweep(800, 200, 0.2, 'sawtooth', 0.7);
    this.noise(0.15, 1200, 0.8);
    this.beep(1000, 0.1, 'sine', 0.5);
  }

  finalStrikeCharge(): void {
    if (!this.ready()) return;
    this.sweep(100, 600, 0.5, 'sawtooth', 0.6);
    this.beep(200, 0.3, 'triangle', 0.3);
  }

  finalStrikeRelease(): void {
    if (!this.ready()) return;
    this.sweep(600, 60, 0.6, 'sawtooth', 0.9);
    this.noise(0.4, 400, 1.0);
    this.beep(880, 0.2, 'sine', 0.5);
  }

  talismanEquip(): void {
    if (!this.ready()) return;
    this.beep(880, 0.1, 'sine', 0.5);
    this.beep(1100, 0.12, 'sine', 0.4);
    this.sweep(600, 1200, 0.2, 'triangle', 0.3);
  }

  talismanExpire(): void {
    if (!this.ready()) return;
    this.sweep(600, 200, 0.3, 'triangle', 0.4);
  }

  thunder(): void {
    if (!this.ready()) return;
    this.noise(0.3, 300, 0.9);
    this.sweep(200, 50, 0.4, 'sawtooth', 0.7);
    this.beep(100, 0.15, 'square', 0.5);
  }

  /** Low-HP heartbeat warning — quiet deep thump */
  heartbeat(): void {
    if (!this.ready()) return;
    this.sweep(100, 50, 0.15, 'sine', 0.3);
  }

  // --- wind ambient -------------------------------------------------------

  startWind(): void {
    if (!this.ready() || this.windSource) return;
    const ctx = this.ctx!, master = this.master!;
    // Create a 4-second looping noise buffer
    const dur = 4;
    const bufferSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.5;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.02;
    src.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(master);
    src.start();
    this.windSource = src;
  }

  updateWind(speed: number): void {
    if (!this.windGain) return;
    // Speed 0-100 → volume 0.01-0.12, bandpass 300-800Hz
    const t = Math.min(1, speed / 80);
    this.windGain.gain.value = 0.01 + t * 0.11;
  }

  stopWind(): void {
    if (this.windSource) {
      this.windSource.stop();
      this.windSource = null;
    }
    this.windGain = null;
  }

  // --- primitives --------------------------------------------------------

  private beep(freq: number, duration: number, type: OscType, vol = 1): void {
    const ctx = this.ctx!, master = this.master!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.005);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private sweep(f0: number, f1: number, duration: number, type: OscType, vol = 1): void {
    const ctx = this.ctx!, master = this.master!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  private noise(duration: number, bandpassFreq: number, vol: number): void {
    const ctx = this.ctx!, master = this.master!;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = bandpassFreq;
    filter.Q.value = 1;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  private ready(): boolean {
    return this.unlocked && this.ctx != null && this.master != null;
  }
}
