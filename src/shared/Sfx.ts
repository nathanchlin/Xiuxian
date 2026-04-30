/**
 * Sfx — Web Audio programmatic sound effects, zero asset files.
 * Lazy AudioContext, unlock on first user interaction.
 */

type OscType = 'sine' | 'square' | 'sawtooth' | 'triangle';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

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
    this.beep(220, 0.04, 'square', 0.3);
  }

  damage(): void {
    this.sweep(220, 80, 0.25, 'triangle', 0.6);
  }

  death(): void {
    this.sweep(440, 55, 0.8, 'sawtooth', 0.8);
  }

  enemyDie(): void {
    this.sweep(180, 40, 0.5, 'square', 0.5);
    this.noise(0.12, 600, 0.8);
  }

  doorOpen(): void {
    if (!this.ready()) return;
    this.sweep(400, 200, 0.2, 'triangle', 0.4);
    this.beep(600, 0.08, 'sine', 0.3);
  }

  chestOpen(): void {
    if (!this.ready()) return;
    this.beep(440, 0.1, 'sine', 0.5);
    this.beep(660, 0.1, 'sine', 0.4);
    this.beep(880, 0.15, 'sine', 0.3);
  }

  floorTransition(): void {
    if (!this.ready()) return;
    this.sweep(200, 800, 0.5, 'sine', 0.5);
    this.beep(440, 0.3, 'triangle', 0.3);
  }

  cardSelect(): void {
    if (!this.ready()) return;
    this.beep(520, 0.08, 'sine', 0.4);
    this.beep(780, 0.12, 'sine', 0.5);
    this.sweep(400, 1200, 0.3, 'triangle', 0.3);
  }

  spiritBeam(): void {
    if (!this.ready()) return;
    this.sweep(2000, 800, 0.08, 'sawtooth', 0.5);
    this.beep(1500, 0.04, 'sine', 0.3);
  }

  missileLaunch(): void {
    if (!this.ready()) return;
    this.sweep(100, 400, 0.3, 'square', 0.6);
    this.beep(200, 0.1, 'sine', 0.4);
  }

  missileExplode(): void {
    if (!this.ready()) return;
    this.noise(0.3, 600, 1.0);
    this.sweep(200, 40, 0.4, 'sawtooth', 0.8);
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
