/* ============================================================
   sfx.js -- County Line's sound library.

   The engine (src/engine/audio.js) knows how to make a noise. This knows
   what the game's noises are. Keeping them apart is the point: Final
   Rental's Sound class held the mixer, the synthesizer AND sixty cues,
   half of which were a tabletop VHS rewinder, a popcorn cart and a
   boombox playing a four-bar loop. None of that could be reused and none
   of it could be deleted without taking the mixer with it.

   Stage 1 needs only enough to prove the routing works and to make the
   test level feel like it has surfaces. Real content comes later.
   ============================================================ */

/** Footstep timbre per surface. Keyed by a floor's `material`. */
const STEP = {
  wood: { freq: 320, q: 1.1, gain: 0.075, d: 0.11, rate: 0.7 },
  stone: { freq: 480, q: 1.6, gain: 0.085, d: 0.09, rate: 0.9 },
  tile: { freq: 620, q: 2.2, gain: 0.080, d: 0.08, rate: 1.0 },
  carpet: { freq: 210, q: 0.8, gain: 0.045, d: 0.14, rate: 0.55 },
  grass: { freq: 260, q: 0.7, gain: 0.050, d: 0.13, rate: 0.6 },
  metal: { freq: 900, q: 3.0, gain: 0.075, d: 0.12, rate: 1.2 },
  default: { freq: 380, q: 1.2, gain: 0.065, d: 0.11, rate: 0.75 },
};

export class Sfx {
  constructor(audio) { this.audio = audio; }

  /* ---------------- the player ---------------- */

  footstep(material, running) {
    const s = STEP[material] || STEP.default;
    this.audio.noise({
      filter: 'lowpass',
      freq: s.freq * (running ? 1.35 : 1),
      q: s.q,
      gain: s.gain * (running ? 1.4 : 1),
      a: 0.002,
      d: s.d * (running ? 0.8 : 1),
      rate: s.rate * (0.85 + Math.random() * 0.3),
      bus: 'sfx',
    });
  }

  land(height) {
    const k = Math.min(1, Math.max(0.2, height / 1.5));
    this.audio.noise({ filter: 'lowpass', freq: 220, q: 1, gain: 0.1 * k, a: 0.002, d: 0.16 });
    this.audio.tone({ freq: 90, type: 'sine', gain: 0.07 * k, a: 0.002, d: 0.12 });
  }

  /* ---------------- doors and fittings ---------------- */

  doorOpen(pan = 0) {
    this.audio.noise({ filter: 'bandpass', freq: 520, to: 230, q: 2, gain: 0.14, a: 0.01, d: 0.45, pan });
    this.audio.tone({ freq: 160, type: 'sine', gain: 0.05, a: 0.02, d: 0.35, pan });
  }

  doorClose(pan = 0) {
    this.audio.noise({ filter: 'bandpass', freq: 300, to: 140, q: 1.6, gain: 0.13, a: 0.008, d: 0.3, pan });
    this.audio.tone({ freq: 110, type: 'square', gain: 0.09, a: 0.002, d: 0.1, when: 0.22, filter: 'lowpass', cutoff: 600, pan });
  }

  /** The bolt going over, or coming back. */
  lock(locked, pan = 0) {
    this.audio.tone({ freq: locked ? 180 : 240, type: 'square', gain: 0.14, a: 0.001, d: 0.06, filter: 'lowpass', cutoff: 900, pan });
    this.audio.noise({ freq: 2400, q: 3, gain: 0.12, a: 0.001, d: 0.05, pan });
    this.audio.tone({ freq: locked ? 90 : 130, type: 'square', gain: 0.1, a: 0.001, d: 0.09, when: 0.07, pan });
  }

  /** A handle worked against a lock that is not going to give. */
  lockedRattle(pan = 0) {
    for (let i = 0; i < 3; i++) {
      this.audio.noise({ filter: 'bandpass', freq: 1500 + Math.random() * 700, q: 5,
        gain: 0.09, a: 0.001, d: 0.05, when: i * 0.07, pan });
    }
    this.audio.tone({ freq: 140, type: 'square', gain: 0.06, a: 0.002, d: 0.1, filter: 'lowpass', cutoff: 500, pan });
  }

  /** A toggle switch, a breaker, a push-button. */
  switchClick(on, pan = 0) {
    this.audio.tone({ freq: on ? 2100 : 1700, type: 'square', gain: 0.07, a: 0.001, d: 0.035, filter: 'lowpass', cutoff: 4000, pan });
    this.audio.noise({ filter: 'bandpass', freq: 3200, q: 6, gain: 0.06, a: 0.001, d: 0.03, pan });
  }

  pickUp(pan = 0) {
    this.audio.noise({ filter: 'bandpass', freq: 1800, q: 1.4, gain: 0.09, a: 0.002, d: 0.09, pan });
    this.audio.tone({ freq: 520, type: 'triangle', gain: 0.05, a: 0.002, d: 0.07, pan });
  }

  putDown(pan = 0) {
    this.audio.noise({ filter: 'lowpass', freq: 700, q: 1, gain: 0.11, a: 0.002, d: 0.13, pan });
  }

  /* ---------------- interface ---------------- */

  uiMove() { this.audio.tone({ bus: 'ui', freq: 660, type: 'square', gain: 0.05, a: 0.002, d: 0.04, filter: 'lowpass', cutoff: 2200 }); }
  uiSelect() {
    this.audio.tone({ bus: 'ui', freq: 880, type: 'square', gain: 0.07, a: 0.002, d: 0.07, filter: 'lowpass', cutoff: 2600 });
    this.audio.tone({ bus: 'ui', freq: 1320, type: 'square', gain: 0.045, a: 0.002, d: 0.09, when: 0.05 });
  }
  uiBack() { this.audio.tone({ bus: 'ui', freq: 320, type: 'square', gain: 0.06, a: 0.002, d: 0.09, filter: 'lowpass', cutoff: 1400 }); }
  uiError() {
    this.audio.tone({ bus: 'ui', freq: 160, type: 'square', gain: 0.1, a: 0.002, d: 0.18, filter: 'lowpass', cutoff: 900 });
    this.audio.tone({ bus: 'ui', freq: 120, type: 'square', gain: 0.08, a: 0.002, d: 0.24, when: 0.12, filter: 'lowpass', cutoff: 700 });
  }

  /** A speech blip, pitched per speaker. On the VOICE bus, so it has a
      level of its own and pulls the room down while it runs. */
  blip(pitch = 1, rough = 0) {
    this.audio.duckAmbience(0.25);
    this.audio.tone({
      bus: 'voice',
      freq: 210 * pitch, type: rough > 0.5 ? 'square' : 'triangle',
      gain: 0.05, a: 0.004, d: 0.045,
      filter: 'lowpass', cutoff: 1400 + rough * 1800,
    });
  }

  /* ---------------- beds ----------------
     Emitters rather than one global bed: County Line's rooms are far
     apart and the point of a hum is that you can hear which room it is
     coming from. */

  /** Mains hum for a light fitting: 120 Hz and its first two harmonics. */
  fluorescent(x, y, z, opt = {}) {
    return this.audio.emitter(x, y, z, (ctx, dest) => {
      const oscs = [];
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 800;
      lp.connect(dest);
      for (const [f, g] of [[120, 1], [240, 0.4], [360, 0.15]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f;
        const gg = ctx.createGain(); gg.gain.value = g * 0.22;
        o.connect(gg).connect(lp); o.start();
        oscs.push(o);
      }
      return { stop: () => oscs.forEach((o) => { try { o.stop(); } catch (e) { /* gone */ } }) };
    }, { maxDist: opt.maxDist || 9, gain: opt.gain === undefined ? 0.5 : opt.gain, bus: 'ambience' });
  }

  /** Broadband air: a room's own tone, or wind through an open door. */
  airbed(x, y, z, opt = {}) {
    return this.audio.emitter(x, y, z, (ctx, dest) => {
      const src = ctx.createBufferSource();
      src.buffer = this.audio.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = opt.filter || 'lowpass';
      f.frequency.value = opt.cutoff || 360;
      f.Q.value = opt.q || 0.7;
      src.connect(f).connect(dest);
      src.start();
      return { stop: () => { try { src.stop(); } catch (e) { /* gone */ } } };
    }, { maxDist: opt.maxDist || 20, gain: opt.gain === undefined ? 0.35 : opt.gain, bus: 'ambience' });
  }
}
