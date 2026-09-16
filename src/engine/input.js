/* ============================================================
   input.js -- keyboard, mouse look with pointer lock, and gamepads,
   behind one vocabulary of ACTIONS.

   Adapted from Final Rental's input.js. The gamepad half is very largely
   that file: the deadzone curves, the two different response shapes for
   moving and for looking, the stick-as-menu-arrows edge detector, the hat
   switch that has to prove it is a hat before it is believed, the layout
   table for the Xbox pads that Chrome and Safari on macOS refuse to
   describe. All of that was hard-won and none of it is about video shops.

   Two things are different.

   FIRST, THE KEYBOARD IS REBINDABLE TOO. Final Rental let you move a pad
   button but WASD was written into the movement code, so there was
   nothing to rebind and nothing to rebind it with. Here both devices bind
   into the same action table, a settings screen can capture either, and
   the movement code asks for `forward` rather than for KeyW.

   SECOND, THE ACTIONS ARE COUNTY LINE'S. Final Rental's set included
   `notes` (the suspect notepad), `drop` (put the tape down) and `bolt`
   (lock the back room against whoever is outside it). None of those mean
   anything here, and leaving them in a generic input layer is exactly the
   kind of inherited assumption this stage exists to strip out.
   ============================================================ */

/**
 * Everything the player can ask for, and where it starts out.
 *
 * `keys` are KeyboardEvent.code values -- physical positions, so WASD is
 * WASD on an AZERTY keyboard. `pad` are button indices under the standard
 * gamepad mapping. `cap` is the short label a prompt draws when the
 * binding is the default one; a rebound action labels itself.
 */
export const ACTIONS = {
  forward: { group: 'move', label: 'Walk forward', keys: ['KeyW'], pad: [], cap: 'W' },
  back: { group: 'move', label: 'Walk back', keys: ['KeyS'], pad: [], cap: 'S' },
  left: { group: 'move', label: 'Step left', keys: ['KeyA'], pad: [], cap: 'A' },
  right: { group: 'move', label: 'Step right', keys: ['KeyD'], pad: [], cap: 'D' },
  /* Not a sprint. County Line is a job, and the run is for being late. */
  run: { group: 'move', label: 'Hurry', keys: ['ShiftLeft', 'ShiftRight'], pad: [6, 7], cap: 'SHIFT' },
  crouch: { group: 'move', label: 'Crouch', keys: ['ControlLeft', 'KeyC'], pad: [10], cap: 'CTRL' },

  interact: { group: 'act', label: 'Use / pick up', keys: ['KeyE'], pad: [0], cap: 'E' },
  pause: { group: 'act', label: 'Pause', keys: ['Escape'], pad: [9], cap: 'ESC' },

  /* Menu movement. Bound to the arrows AND to the walk keys, because a
     player who has just been walking with WASD will try WASD on a menu. */
  uiUp: { group: 'ui', label: 'Menu up', keys: ['ArrowUp', 'KeyW'], pad: [12], cap: '↑' },
  uiDown: { group: 'ui', label: 'Menu down', keys: ['ArrowDown', 'KeyS'], pad: [13], cap: '↓' },
  uiLeft: { group: 'ui', label: 'Menu left', keys: ['ArrowLeft', 'KeyA'], pad: [14], cap: '←' },
  uiRight: { group: 'ui', label: 'Menu right', keys: ['ArrowRight', 'KeyD'], pad: [15], cap: '→' },
  uiConfirm: { group: 'ui', label: 'Select', keys: ['Enter', 'Space', 'KeyE'], pad: [0], cap: 'ENTER' },
  /* Its own action rather than a second name for pause. Final Rental put
     the pad's B button on Escape, which meant backing out of a submenu
     also paused the shift and the play loop could not tell the two apart. */
  uiBack: { group: 'ui', label: 'Back', keys: ['Backspace'], pad: [1], cap: 'BKSP' },
};

/** The order a controls screen lists them in. */
export const BINDABLE = [
  'forward', 'back', 'left', 'right', 'run', 'crouch', 'interact', 'pause',
  'uiUp', 'uiDown', 'uiLeft', 'uiRight', 'uiConfirm', 'uiBack',
];

/** Keys the page must not act on itself while the game has focus. */
const BLOCK = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backspace', 'Slash', 'Quote', 'F1']);

export function defaultKeyBinds() {
  const out = {};
  for (const id of Object.keys(ACTIONS)) out[id] = ACTIONS[id].keys.slice();
  return out;
}

/** button index -> the actions on it, as the standard mapping lays it out. */
export function defaultPadBinds() {
  const out = {};
  for (const id of Object.keys(ACTIONS)) {
    for (const i of ACTIONS[id].pad) (out[i] = out[i] || []).push(id);
  }
  return out;
}

/** Drop anything a stored binding names that this build no longer has. */
export function sanitizeKeyBinds(b) {
  const out = defaultKeyBinds();
  if (!b || typeof b !== 'object') return out;
  for (const id of Object.keys(out)) {
    const v = b[id];
    if (Array.isArray(v)) out[id] = v.filter((k) => typeof k === 'string' && k).slice(0, 4);
  }
  return out;
}

export function sanitizePadBinds(b) {
  const out = {};
  for (const k of Object.keys(b || {})) {
    if (!/^\d+$/.test(k)) continue;
    const v = b[k];
    const list = (Array.isArray(v) ? v : [v]).filter((a) => ACTIONS[a]);
    if (list.length) out[k] = list;
  }
  return out;
}

/** Largest single mouse event, in CSS pixels, that is taken at face value. */
const MAX_DELTA = 260;
const clampDelta = (v) => (v > MAX_DELTA ? MAX_DELTA : v < -MAX_DELTA ? -MAX_DELTA : v);

const DEAD = 0.22;

/**
 * Pad layouts the browser will not describe.
 *
 * Chrome and Safari on macOS report a first-party Xbox pad with a
 * non-standard mapping and shuffled indices. Laying the standard table
 * over those indices is worse than laying nothing over them, so an
 * un-vouched-for pad starts with nothing bound unless it is one of these.
 */
const KNOWN_LAYOUTS = [
  {
    id: 'xbox-macos',
    match: (id) => /xbox|045e|microsoft/i.test(id),
    mac: true,
    binds: { 1: ['interact', 'uiConfirm'], 2: ['uiBack'], 5: ['pause'], 11: ['run'] },
  },
];

export function knownLayout(id, platform) {
  const onMac = /mac|iphone|ipad/i.test(String(platform || ''));
  for (const L of KNOWN_LAYOUTS) {
    if (L.mac && !onMac) continue;
    if (L.match(String(id || ''))) return { id: L.id, binds: sanitizePadBinds(L.binds) };
  }
  return null;
}

/* Menu navigation off the stick: push past NAV_ON to fire, fall back
   under NAV_OFF before it can fire again, hold to repeat. */
const NAV_ON = 0.55;
const NAV_OFF = 0.35;
const NAV_DELAY = 420;
const NAV_REPEAT = 150;

/** Which family of button art a pad wants, from whatever it calls itself. */
export function schemeFor(id) {
  const s = String(id || '').toLowerCase();
  /* Order matters. Microsoft's pads report as "Xbox Wireless Controller"
     and Sony's as "Wireless Controller" with nothing else to go on, so the
     explicit vendors are tested first. */
  if (/xbox|xinput|045e|microsoft/.test(s)) return 'xbox';
  if (/dualsense|dualshock|playstation|sony|054c/.test(s)) return 'playstation';
  if (/wireless controller/.test(s)) return 'playstation';
  return 'xbox';
}

export class Input {
  constructor(target) {
    this.target = target;
    /* Raw device state. Systems should ask for actions, not for these; they
       are public for debug hotkeys and for the rebinding screen. */
    this.keysDown = new Set();
    this.keysPressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.mouse = [false, false, false];
    this.mousePressed = [false, false, false];
    this.locked = false;

    this.sensitivity = 0.0022;          // radians per mouse count
    /**
     * Mouse-delta correction, because the two browsers do not agree.
     *
     * Chromium reports pointer-lock movementX/movementY in CSS pixels.
     * Gecko reports them in DEVICE pixels -- it has never divided them by
     * the device pixel ratio (Bugzilla 1748150). On an ordinary monitor
     * the two agree; on any Retina display, which is every MacBook this
     * will be developed and played on, Firefox's numbers come out twice
     * Chromium's and the game feels like the sensitivity slider is pinned.
     *
     * This is exactly the class of bug that only shows up in the browser
     * you did not test in, so it is corrected here, once, rather than
     * being left for a player to work around with the slider -- which
     * would then be wrong in the other browser.
     */
    this.pointerScale = 1;
    this._measurePointerScale();
    this.padSensitivity = 4.2;          // radians per second at full throw
    this.invertY = false;
    this.enabled = true;

    /** Action state, rebuilt every poll. */
    this.down = new Set();
    this.pressed = new Set();

    /* Analog, merged from keyboard and stick so movement code never has to
       care which one is driving. */
    this.moveX = 0; this.moveZ = 0;
    this.lookX = 0; this.lookY = 0;

    this.keyBinds = defaultKeyBinds();
    this.padBinds = defaultPadBinds();
    this.keyBindsAreUser = false;
    this.padBindsAreUser = false;

    /** 'kbm' until a pad is used, then 'xbox' or 'playstation'. */
    this.scheme = 'kbm';
    this.padId = '';
    this.padMapping = '';
    this.padTrusted = true;
    this.padDownIndices = [];
    this.padAxes = [];
    this.padButtonCount = 0;
    this.knownAs = '';

    this._padIndex = -1;
    this._padDown = new Set();
    this._padActions = new Set();
    this._nav = { u: 0, d: 0, l: 0, r: 0 };
    this._hatSeenNeutral = false;
    this._laidOutFor = null;

    /** When set, the next input captured is bound instead of acted on. */
    this.capturing = null;       // { action, device: 'key' | 'pad' }
    this.onCaptured = null;
    this.onGesture = null;
    this.onLockChange = null;

    this._bind();
  }

  /* ---------------- device plumbing ---------------- */

  /** Recomputed on resize: moving a window between displays changes it. */
  _measurePointerScale() {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const gecko = /gecko\//i.test(navigator.userAgent) && !/webkit/i.test(navigator.userAgent);
    const dpr = window.devicePixelRatio || 1;
    this.pointerScale = gecko && dpr > 0 ? 1 / dpr : 1;
  }

  _bind() {
    const norm = (e) => {
      if (e.code) return e.code;
      return e.key && e.key.length === 1 ? 'Key' + e.key.toUpperCase() : e.key;
    };
    addEventListener('keydown', (e) => {
      const k = norm(e);
      if (BLOCK.has(k)) e.preventDefault();
      if (this.capturing && this.capturing.device === 'key') {
        e.preventDefault();
        const act = this.capturing.action;
        this.capturing = null;
        /* Escape gets out of a capture rather than being bound. There has
           to be one key that always means "never mind", or a player who
           opens the capture by accident has no way back. */
        if (k !== 'Escape') this.bindKey(act, k);
        if (this.onCaptured) this.onCaptured(act, k === 'Escape' ? null : k);
        return;
      }
      if (!this.keysDown.has(k)) this.keysPressed.add(k);
      this.keysDown.add(k);
      this.scheme = 'kbm';
      if (this.onGesture) this.onGesture();
    });
    addEventListener('keyup', (e) => { this.keysDown.delete(norm(e)); });
    addEventListener('blur', () => {
      this.keysDown.clear(); this.mouse = [false, false, false];
      this._padDown.clear(); this._padActions.clear();
      this.moveX = 0; this.moveZ = 0; this.lookX = 0; this.lookY = 0;
      this._nav.u = this._nav.d = this._nav.l = this._nav.r = 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    addEventListener('resize', () => this._measurePointerScale());
    this.target.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      /* A single event should never be worth more than a flick of the
         wrist. Operating-system pointer acceleration occasionally emits
         one enormous delta -- and so does a browser catching up after a
         stall -- and without a ceiling the camera snaps to face the other
         way for one frame. */
      const s = this.pointerScale;
      this.mdx += clampDelta((e.movementX || 0) * s);
      this.mdy += clampDelta((e.movementY || 0) * s);
    });
    this.target.addEventListener('mousedown', (e) => {
      if (e.button < 3) {
        if (!this.mouse[e.button]) this.mousePressed[e.button] = true;
        this.mouse[e.button] = true;
      }
      this.scheme = 'kbm';
      /* Fired inside the real event, which is the only place a browser
         will honor a pointer-lock request. */
      if (this.onGesture) this.onGesture();
      e.preventDefault();
    });
    addEventListener('mouseup', (e) => { if (e.button < 3) this.mouse[e.button] = false; });
    this.target.addEventListener('contextmenu', (e) => e.preventDefault());
    /* The event always carries the pad in a browser. It does not always
       carry it when something else dispatches it -- a test rig, an
       extension, a page that fakes one -- and reading through it blind
       takes the whole input layer down with a TypeError. */
    addEventListener('gamepadconnected', (e) => {
      if (e && e.gamepad && typeof e.gamepad.index === 'number') this._padIndex = e.gamepad.index;
    });
    addEventListener('gamepaddisconnected', () => { this._padIndex = -1; });
  }

  /* ---------------- per-frame ---------------- */

  /** Call once per frame, before anything reads input. */
  poll() {
    const wasDown = this.down;
    this.down = new Set();
    this.pressed.clear();
    this.moveX = 0; this.moveZ = 0; this.lookX = 0; this.lookY = 0;

    this._pollPad();

    /* Keyboard -> actions.
     *
     * A press is taken from the KEY EVENT, not from comparing this frame's
     * held set with last frame's. Those two are not the same thing: a tap
     * that goes down and up between two frames never appears in the held
     * set at all, and deriving presses from it loses the tap completely.
     * On a fast machine that is most taps -- it is why the doors in the
     * first pass of this harness could be looked at and not opened.
     */
    for (const id of Object.keys(ACTIONS)) {
      const keys = this.keyBinds[id];
      if (!keys) continue;
      for (let i = 0; i < keys.length; i++) {
        if (this.keysDown.has(keys[i])) this.down.add(id);
        if (this.keysPressed.has(keys[i])) this.pressed.add(id);
      }
    }
    for (const id of this._padActions) this.down.add(id);

    for (const id of this.down) if (!wasDown.has(id)) this.pressed.add(id);
    for (const id of this._padPressed) this.pressed.add(id);

    // keyboard movement, folded in over whatever the stick is doing
    let kx = 0, kz = 0;
    if (this.down.has('forward')) kz += 1;
    if (this.down.has('back')) kz -= 1;
    if (this.down.has('left')) kx -= 1;
    if (this.down.has('right')) kx += 1;
    if (kx || kz) { this.moveX = kx; this.moveZ = kz; }
  }

  /** Call once per frame, after every system has read input. */
  endFrame() {
    this.keysPressed.clear();
    this.mdx = 0; this.mdy = 0;
    this.mousePressed[0] = this.mousePressed[1] = this.mousePressed[2] = false;
  }

  _pollPad() {
    this._padPressed = new Set();
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads)
      ? navigator.getGamepads() : null;
    if (!pads) { this._padActions.clear(); return; }
    let pad = this._padIndex >= 0 ? pads[this._padIndex] : null;
    if (!pad || !pad.connected) {
      pad = null;
      for (let i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) { pad = pads[i]; this._padIndex = i; break; }
      }
    }
    if (!pad) { this._padDown.clear(); this._padActions.clear(); return; }

    /* Decide what this pad's buttons mean, once per pad. */
    if (this._laidOutFor !== pad.id) {
      this._laidOutFor = pad.id;
      this.padTrusted = pad.mapping === 'standard';
      this._hatSeenNeutral = false;
      const known = this.padTrusted ? null
        : knownLayout(pad.id, typeof navigator !== 'undefined' ? navigator.platform : '');
      this.knownAs = known ? known.id : '';
      if (!this.padBindsAreUser) {
        this.padBinds = this.padTrusted ? defaultPadBinds() : (known ? known.binds : {});
      }
      this._padDown.clear();
      this._padActions.clear();
    }

    let used = false;
    const ax = pad.axes || [];
    /* Movement wants a squared curve: it buys fine control near the center
       and you are only ever walking. Looking does not -- squaring it means
       half a stick gives a quarter of the turn rate, and turning around
       takes an age unless the stick is pinned to the edge. */
    const moveCurve = (v) => {
      const a = Math.abs(v);
      if (a < DEAD) return 0;
      const t = (a - DEAD) / (1 - DEAD);
      return Math.sign(v) * t * t;
    };
    const lookCurve = (v) => {
      const a = Math.abs(v);
      if (a < DEAD) return 0;
      const t = (a - DEAD) / (1 - DEAD);
      return Math.sign(v) * t * (0.35 + 0.65 * t);
    };
    const rawX = ax[0] || 0, rawY = ax[1] || 0;
    const lx = moveCurve(rawX), ly = moveCurve(rawY);
    const rx = lookCurve(ax[2] || 0), ry = lookCurve(ax[3] || 0);
    if (lx || ly) { this.moveX = lx; this.moveZ = -ly; used = true; }
    if (rx || ry) { this.lookX = rx; this.lookY = ry; used = true; }
    if (this._stickNav(rawX, rawY)) used = true;

    const btns = pad.buttons || [];
    this.padButtonCount = btns.length;
    this.padAxes = Array.prototype.slice.call(ax);
    const live = [];
    const acts = new Set();
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const on = typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5;
      if (on) live.push(i);
      const id = 'Btn' + i;
      const bound = this.padBinds[i] || [];
      if (on) {
        used = true;
        if (!this._padDown.has(id)) {
          this._padDown.add(id);
          if (this.capturing && this.capturing.device === 'pad') {
            const act = this.capturing.action;
            this.capturing = null;
            this.bindPadButton(i, act);
            if (this.onCaptured) this.onCaptured(act, i);
            continue;
          }
          for (const a of bound) this._padPressed.add(a);
          /* An unbound button on a pad we could not vouch for still works
             a menu. Nothing worse can come of it than selecting the thing
             already under the cursor, and it is the difference between a
             player getting to the controls screen and not. */
          if (!bound.length && !this.padTrusted) this._padPressed.add('uiConfirm');
        }
        for (const a of bound) acts.add(a);
      } else if (this._padDown.has(id)) {
        this._padDown.delete(id);
      }
    }
    this.padDownIndices = live;
    this._padActions = acts;

    /* Some pads report the d-pad as a hat on a ninth axis rather than as
       four buttons. A hat at rest reads OUTSIDE [-1, 1] -- 3.29 is usual --
       while an axis that is not a hat sits at 0, which decodes to "down".
       So the axis has to prove it is a hat before it is believed. */
    if (ax.length > 9) {
      const hat = ax[9];
      if (hat > 1.05 || hat < -1.05) this._hatSeenNeutral = true;
      if (this._hatSeenNeutral && hat >= -1.0 && hat <= 1.0) {
        const HAT = ['uiUp', 'uiRight', 'uiDown', 'uiLeft'];
        const pos = Math.round((hat + 1) * 3.5);   // -1 is up, clockwise
        HAT.forEach((act, q) => {
          const on = pos === q * 2 || pos === (q * 2 + 7) % 8 || pos === (q * 2 + 1) % 8;
          const id = 'Hat' + act;
          if (on) {
            used = true;
            if (!this._padDown.has(id)) { this._padDown.add(id); this._padPressed.add(act); }
            this._padActions.add(act);
          } else this._padDown.delete(id);
        });
      }
    }

    if (used) {
      this.scheme = schemeFor(pad.id);
      this.padId = pad.id;
      this.padMapping = pad.mapping || '';
    }
  }

  /**
   * Stick deflection as repeating menu-arrow edges.
   *
   * These land in `pressed` only, never in `down`: a menu asks for a press
   * and gets one per push, while the analog value the player is walking on
   * stays untouched.
   */
  _stickNav(x, y) {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const DIRS = [['u', -y, 'uiUp'], ['d', y, 'uiDown'], ['l', -x, 'uiLeft'], ['r', x, 'uiRight']];
    let any = false;
    for (let i = 0; i < DIRS.length; i++) {
      const id = DIRS[i][0], v = DIRS[i][1], act = DIRS[i][2];
      if (v >= NAV_ON) {
        any = true;
        if (!this._nav[id]) { this._nav[id] = now + NAV_DELAY; this._padPressed.add(act); }
        else if (now >= this._nav[id]) { this._nav[id] = now + NAV_REPEAT; this._padPressed.add(act); }
      } else if (v < NAV_OFF) this._nav[id] = 0;
    }
    return any;
  }

  /* ---------------- reading ---------------- */

  isDown(...actions) { return actions.some((a) => this.down.has(a)); }
  hit(...actions) { return actions.some((a) => this.pressed.has(a)); }
  /** Raw physical key, for debug hotkeys that are not player-facing. */
  rawHit(code) { return this.keysPressed.has(code); }

  /* ---------------- binding ---------------- */

  /**
   * Put a key on an action.
   *
   * The key comes off every other action first -- one physical key does
   * one thing, or a controls screen becomes a puzzle. An action keeps at
   * most two keys, NEWEST FIRST, because the first is the one prompts
   * draw: rebind "use" to F and every prompt in the game should say F,
   * not go on saying E because E happened to be listed first. Two is
   * enough for the defaults that ship with a pair -- run, on both shift
   * keys; menu movement, on the arrows and on WASD.
   */
  bindKey(action, code) {
    if (!ACTIONS[action] || !code) return;
    for (const id of Object.keys(this.keyBinds)) {
      this.keyBinds[id] = this.keyBinds[id].filter((k) => k !== code);
    }
    const list = this.keyBinds[action] || (this.keyBinds[action] = []);
    list.unshift(code);
    while (list.length > 2) list.pop();
    this.keyBindsAreUser = true;
  }

  clearKeys(action) {
    if (!ACTIONS[action]) return;
    this.keyBinds[action] = [];
    this.keyBindsAreUser = true;
  }

  /**
   * Put an action on a pad button.
   *
   * Unlike the keyboard, one button may carry several actions -- confirm
   * and interact are the same button and always should be -- so this adds
   * rather than replaces. Binding an action to the button it is already on
   * takes it off, which is how a row is cleared without a second control.
   */
  bindPadButton(index, action) {
    if (!ACTIONS[action]) return;
    const had = (this.padBinds[index] || []).includes(action);
    for (const k of Object.keys(this.padBinds)) {
      const list = this.padBinds[k].filter((a) => a !== action);
      if (list.length) this.padBinds[k] = list; else delete this.padBinds[k];
    }
    if (!had) (this.padBinds[index] = this.padBinds[index] || []).push(action);
    this.padBindsAreUser = true;
  }

  keysFor(action) { return (this.keyBinds[action] || []).slice(); }
  padButtonsFor(action) {
    return Object.keys(this.padBinds)
      .filter((k) => this.padBinds[k].includes(action))
      .map(Number).sort((a, b) => a - b);
  }
  actionsOn(index) { return (this.padBinds[index] || []).slice(); }

  /** The next key / button is bound to `action` instead of acting. */
  capture(action, device) { this.capturing = { action, device: device || 'key' }; }
  cancelCapture() { this.capturing = null; }

  resetKeyBinds() { this.keyBinds = defaultKeyBinds(); this.keyBindsAreUser = false; }
  resetPadBinds() {
    this.padBindsAreUser = false;
    this.padBinds = this.padTrusted ? defaultPadBinds() : {};
    this._padDown.clear();
  }

  /* ---------------- pointer lock ---------------- */

  /**
   * Ask for the pointer.
   *
   * Only granted off a user gesture, or shortly after a previous lock was
   * released. Asking from anywhere else fails silently, and in Chrome the
   * returned promise rejects -- Firefox returns undefined, which is why
   * the result is tested before it is used. Whoever wanted the lock should
   * set a flag and try again on the next keystroke or click.
   */
  requestLock() {
    if (this.locked || !this.target.requestPointerLock) return;
    try {
      const p = this.target.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (err) { /* refused; the next gesture will try again */ }
  }
  exitLock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); }
}
