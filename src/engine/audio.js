/* ============================================================
   audio.js -- the mixer and the synthesizer.

   Like Final Rental, County Line ships no audio files. Every sound is
   built from oscillators and filtered noise at the moment it is asked
   for. That is what kept Final Rental's download under a megabyte and it
   is what keeps the repository reviewable, so it stays.

   What changed is the routing. Final Rental had a master, an `sfxBus` and
   an `ambBus`, and dialogue blips went out through the effects bus
   alongside the footsteps -- so there was no voice level to set, and
   nothing to duck the room under a line of dialogue. County Line's
   building is going to be carried by its sound (a hall two floors high,
   a public-address system, weather outside, plant rooms humming through
   a wall), so the buses are real and named from the start:

       MASTER      one fader, and a safety limiter after it
        |- AMBIENCE   beds and room tone. Never limited: a footstep must
        |             not duck the room every time the player takes one,
        |             which is what "the audio pumps while moving" is.
        |- SFX  -> compressor -> MASTER
        |- VOICE      straight through, and it ducks AMBIENCE while it runs
        |- UI         menu sounds, unaffected by anything in the world

   Positional sound is here in two forms: `spatial()` for one-shots, which
   is Final Rental's cheap distance-and-pan calculation, and `Emitter` for
   loops that live in the world and follow the listener. Both use stereo
   panning rather than HRTF -- a panner node per emitter is affordable on
   a MacBook Air and a convolving 3D panner per emitter is not.
   ============================================================ */

/** The mixer's named channels, in the order an options screen lists them. */
export const BUSES = ['master', 'ambience', 'sfx', 'voice', 'ui'];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    /** 0..1 per bus, applied whether or not the graph exists yet. */
    this.levels = { master: 0.8, ambience: 0.8, sfx: 0.9, voice: 1.0, ui: 0.7 };
    this.bus = {};
    /** Listener, updated once a frame by whoever owns the camera. */
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this._emitters = [];
    this._voices = 0;
    this._voiceWindow = 0;
    this._duckUntil = 0;
  }

  /**
   * Build the graph. MUST be called from inside a user gesture -- every
   * browser refuses to start an AudioContext otherwise, and Safari will
   * hand back a context that is permanently suspended if you try.
   */
  init() {
    if (this.ctx) return true;
    const AC = (typeof window !== 'undefined')
      && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    const ctx = this.ctx = new AC();

    /* Safety limiter across the output. Not a mix tool -- it sits nearly
       flat and only catches the case where several loud things land on the
       same frame, which synthesized audio does more often than recorded
       audio because nothing has been mastered. */
    const safety = ctx.createDynamicsCompressor();
    safety.threshold.value = -1.5;
    safety.ratio.value = 20;
    safety.attack.value = 0.002;
    safety.release.value = 0.12;
    if (safety.knee) safety.knee.value = 2;
    safety.connect(ctx.destination);
    this._safety = safety;

    const master = this.bus.master = ctx.createGain();
    master.gain.value = this.levels.master;
    master.connect(safety);

    /* The effects compressor. Final Rental learned this the expensive
       way: with the compressor across the whole mix, every footstep
       transient ducked the room tone, and at a run the entire background
       pumped in and out of the mix. Effects only. */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    comp.attack.value = 0.006;
    comp.release.value = 0.14;
    if (comp.knee) comp.knee.value = 14;
    comp.connect(master);
    this._sfxComp = comp;

    const mk = (name, dest) => {
      const g = ctx.createGain();
      g.gain.value = this.levels[name];
      g.connect(dest);
      this.bus[name] = g;
      return g;
    };
    mk('ambience', master);
    mk('sfx', comp);
    mk('voice', master);
    mk('ui', master);

    /* Two seconds of white noise, shared by every noise-based voice. */
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.ready = true;
    return true;
  }

  /** Browsers suspend contexts when a tab is hidden; call on focus. */
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      const p = this.ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Set a bus level, 0..1. Safe before init(). */
  setLevel(name, v) {
    const x = Math.max(0, Math.min(1, v));
    this.levels[name] = x;
    const g = this.bus[name];
    if (g) g.gain.setTargetAtTime(this.muted ? 0 : x, this.t, 0.02);
  }

  setMuted(m) {
    this.muted = !!m;
    for (const b of BUSES) this.setLevel(b, this.levels[b]);
  }

  /** Per-frame upkeep: emitter panning and the voice duck. */
  update(dt, listener) {
    if (!this.ready) return;
    if (listener) this.listener = listener;
    for (let i = 0; i < this._emitters.length; i++) this._emitters[i]._follow(this);
    const amb = this.bus.ambience;
    if (amb) {
      const ducking = this.t < this._duckUntil;
      const want = (this.muted ? 0 : this.levels.ambience) * (ducking ? 0.45 : 1);
      if (Math.abs(want - (this._ambSent || -1)) > 0.004) {
        this._ambSent = want;
        amb.gain.setTargetAtTime(want, this.t, ducking ? 0.08 : 0.35);
      }
    }
  }

  /** Pull the room down under a line of dialogue or an announcement. */
  duckAmbience(seconds = 0.35) {
    this._duckUntil = Math.max(this._duckUntil, this.t + seconds);
  }

  /* ---------------- voice budget ----------------
     A synthesized one-shot is several nodes; a hundred at once is a
     stutter on any machine. Fourteen inside a tenth of a second is
     comfortably more than a scene can use and comfortably less than the
     audio thread minds. */
  _budget() {
    const now = this.t;
    if (now - this._voiceWindow > 0.1) { this._voiceWindow = now; this._voices = 0; }
    if (this._voices >= 14) return false;
    this._voices++;
    return true;
  }

  _busNode(name) { return this.bus[name] || this.bus.sfx; }

  _env(node, t0, gain, a, d, s = 0, sT = 0, r = 0.02) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + a);
    if (sT > 0) {
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * s), t0 + a + d);
      g.gain.setValueAtTime(Math.max(0.0002, gain * s), t0 + a + d + sT);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + sT + r);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    }
    node.connect(g);
    return g;
  }

  /**
   * One oscillator through an envelope.
   * @param o { freq, to, type, gain, a, d, s, sT, r, when, filter, cutoff,
   *            q, detune, pan, bus, slide }
   */
  tone(o = {}) {
    if (!this.ready || this.muted || !this._budget()) return;
    const ctx = this.ctx, t0 = (o.when || 0) + this.t;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq || 440, t0);
    if (o.to) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(1, o.to), t0 + (o.slide || (o.a || 0.005) + (o.d || 0.2)));
    }
    if (o.detune) osc.detune.value = o.detune;
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.cutoff || 1200; f.Q.value = o.q || 1;
      osc.connect(f); node = f;
    }
    const g = this._env(node, t0, o.gain === undefined ? 0.25 : o.gain,
      o.a || 0.005, o.d || 0.2, o.s, o.sT, o.r);
    this._out(g, o);
    osc.start(t0);
    osc.stop(t0 + (o.a || 0.005) + (o.d || 0.2) + (o.sT || 0) + (o.r || 0.02) + 0.05);
  }

  /** Filtered noise through an envelope. Same options as tone(), plus rate. */
  noise(o = {}) {
    if (!this.ready || this.muted || !this._budget()) return;
    const ctx = this.ctx, t0 = (o.when || 0) + this.t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) {
      f.frequency.exponentialRampToValueAtTime(
        Math.max(20, o.to), t0 + (o.a || 0.005) + (o.d || 0.2));
    }
    f.Q.value = o.q || 1;
    src.connect(f);
    const g = this._env(f, t0, o.gain === undefined ? 0.2 : o.gain,
      o.a || 0.005, o.d || 0.2, o.s, o.sT, o.r);
    this._out(g, o);
    src.start(t0);
    src.stop(t0 + (o.a || 0.005) + (o.d || 0.2) + (o.sT || 0) + (o.r || 0.02) + 0.05);
  }

  _out(gainNode, o) {
    const dest = this._busNode(o.bus || 'sfx');
    if (o.pan !== undefined && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      gainNode.connect(p); p.connect(dest);
    } else {
      gainNode.connect(dest);
    }
  }

  /**
   * Distance gain and stereo pan for a one-shot at a world position.
   * Carried over from Final Rental unchanged: it is the right shape and
   * it costs two square roots.
   */
  spatial(x, y, z, maxDist = 18) {
    const L = this.listener;
    const dx = x - L.x, dz = z - L.z, dy = (y || 0) - L.y;
    const d = Math.hypot(dx, dy, dz);
    const gain = Math.max(0, 1 - d / maxDist);
    // yaw 0 faces +Z; the right vector is +X rotated by yaw
    const rx = Math.cos(L.yaw), rz = -Math.sin(L.yaw);
    const flat = Math.hypot(dx, dz);
    const pan = flat < 0.001 ? 0 : Math.max(-1, Math.min(1, (dx * rx + dz * rz) / flat));
    return { gain: gain * gain, pan, dist: d };
  }

  /** A one-shot placed in the world. Silently skipped if out of range. */
  at(x, y, z, play, maxDist = 18) {
    if (!this.ready) return;
    const s = this.spatial(x, y, z, maxDist);
    if (s.gain <= 0.004) return;
    play(s);
  }

  /**
   * A looping source that lives at a point in the world.
   * @param make (ctx, destination) => { stop() } -- builds the loop
   */
  emitter(x, y, z, make, opt = {}) {
    if (!this.ready) return null;
    const e = new Emitter(this, x, y, z, make, opt);
    this._emitters.push(e);
    return e;
  }

  _forget(e) {
    const i = this._emitters.indexOf(e);
    if (i >= 0) this._emitters.splice(i, 1);
  }

  /** Tear the graph down -- used by tests and by a hard return to title. */
  stopAll() {
    for (const e of this._emitters.slice()) e.stop();
    this._emitters.length = 0;
  }
}

/** A positional loop. Gain and pan follow the listener; the source does not. */
export class Emitter {
  constructor(engine, x, y, z, make, opt) {
    this.engine = engine;
    this.x = x; this.y = y; this.z = z;
    this.maxDist = opt.maxDist === undefined ? 18 : opt.maxDist;
    this.gain = opt.gain === undefined ? 1 : opt.gain;
    const ctx = engine.ctx;
    this.node = ctx.createGain();
    this.node.gain.value = 0;
    this.pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (this.pan) { this.node.connect(this.pan); this.pan.connect(engine._busNode(opt.bus || 'ambience')); }
    else this.node.connect(engine._busNode(opt.bus || 'ambience'));
    this.source = make(ctx, this.node);
    this._follow(engine);
  }

  moveTo(x, y, z) { this.x = x; this.y = y; this.z = z; }

  _follow(engine) {
    const s = engine.spatial(this.x, this.y, this.z, this.maxDist);
    const want = s.gain * this.gain * (engine.muted ? 0 : 1);
    if (Math.abs(want - (this._sent || -1)) > 0.003) {
      this._sent = want;
      this.node.gain.setTargetAtTime(want, engine.t, 0.08);
    }
    if (this.pan && Math.abs(s.pan - (this._panSent || -9)) > 0.02) {
      this._panSent = s.pan;
      this.pan.pan.setTargetAtTime(s.pan, engine.t, 0.08);
    }
  }

  stop() {
    try { if (this.source && this.source.stop) this.source.stop(); } catch (err) { /* already gone */ }
    try { this.node.disconnect(); } catch (err) { /* already gone */ }
    this.engine._forget(this);
  }
}
