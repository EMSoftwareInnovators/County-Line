/* ============================================================
   glyphs.js -- naming a control in whatever language the player's hands
   are speaking.

   Straight out of Final Rental's ui.js, and one of the best things in
   that repository: every prompt in the game says "press this" without
   knowing what "this" is, and the answer changes when a pad is picked up.
   One table, three columns -- a keyboard cap, an Xbox face button, a
   PlayStation shape.

   The one change is where the keyboard column comes from. Final Rental
   kept a hand-written CAPS table because its keyboard bindings were
   fixed. County Line's are not, so the cap is derived from the live
   binding: rebind interact to F and every prompt in the game says F.
   ============================================================ */
import { ACTIONS } from '../engine/input.js';

/** What each button is CALLED, by index, under the standard mapping. */
const PAD_BUTTONS = {
  0: ['A', '✕', 'x-a', 'p-x'],
  1: ['B', '○', 'x-b', 'p-o'],
  2: ['X', '□', 'x-x', 'p-s'],
  3: ['Y', '△', 'x-y', 'p-t'],
  4: ['LB', 'L1', 'x-m', 'p-m'],
  5: ['RB', 'R1', 'x-m', 'p-m'],
  6: ['LT', 'L2', 'x-m', 'p-m'],
  7: ['RT', 'R2', 'x-m', 'p-m'],
  8: ['⧉', 'CREATE', 'x-m', 'p-m'],
  9: ['☰', '☰', 'x-m', 'p-m'],
  10: ['L3', 'L3', 'x-m', 'p-m'],
  11: ['R3', 'R3', 'x-m', 'p-m'],
  12: ['↑', '↑', 'x-d', 'p-d'],
  13: ['↓', '↓', 'x-d', 'p-d'],
  14: ['←', '←', 'x-d', 'p-d'],
  15: ['→', '→', 'x-d', 'p-d'],
};

/** The two sticks, which are not buttons and never move. */
const STICKS = {
  move: ['WASD', '◎ L', 'x-d', 'p-d'],
  look: ['MOUSE', '◎ R', 'x-d', 'p-d'],
};

/** KeyboardEvent.code -> what is printed on the key. */
const KEY_CAPS = {
  Escape: 'ESC', Enter: 'ENTER', Space: 'SPACE', Tab: 'TAB', Backspace: 'BKSP',
  ShiftLeft: 'SHIFT', ShiftRight: 'RSHIFT', ControlLeft: 'CTRL', ControlRight: 'RCTRL',
  AltLeft: 'ALT', AltRight: 'RALT', CapsLock: 'CAPS',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
};

export function keyCap(code) {
  if (!code) return '--';
  if (KEY_CAPS[code]) return KEY_CAPS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6);
  if (/^F\d+$/.test(code)) return code;
  return code.toUpperCase();
}

let SCHEME = 'kbm';
let INPUT = null;

/** Told by the game whenever the active device or a binding changes. */
export function setScheme(s) { SCHEME = s || 'kbm'; }
export function currentScheme() { return SCHEME; }
/** Where live bindings are read from. */
export function setInput(input) { INPUT = input; }

function padGlyph(i) {
  const b = PAD_BUTTONS[i];
  /* NB: class "btn", not "pad" -- "pad" is the paper-panel class, and a
     glyph wearing it inherits the panel's absolute positioning. */
  if (!b) return `<span class="key btn x-m">${i}</span>`;
  const ps = SCHEME === 'playstation';
  return `<span class="key btn ${ps ? b[3] : b[2]}">${ps ? b[1] : b[0]}</span>`;
}

function padText(i) {
  const b = PAD_BUTTONS[i];
  if (!b) return `BUTTON ${i}`;
  return SCHEME === 'playstation' ? b[1] : b[0];
}

function keysFor(action) {
  if (INPUT) return INPUT.keysFor(action);
  return (ACTIONS[action] && ACTIONS[action].keys) || [];
}

function padFor(action) {
  if (INPUT && INPUT.padBindsAreUser) return INPUT.padButtonsFor(action);
  if (INPUT) return INPUT.padButtonsFor(action);
  return (ACTIONS[action] && ACTIONS[action].pad) || [];
}

/** The markup for one control. */
export function glyph(action) {
  const stick = STICKS[action];
  if (stick) {
    if (SCHEME === 'kbm') return `<span class="key">${stick[0]}</span>`;
    const ps = SCHEME === 'playstation';
    return `<span class="key btn ${ps ? stick[3] : stick[2]}">${stick[1]}</span>`;
  }
  if (SCHEME === 'kbm') {
    const k = keysFor(action);
    if (!k.length) return `<span class="key unbound">--</span>`;
    return `<span class="key">${keyCap(k[0])}</span>`;
  }
  const on = padFor(action);
  if (!on.length) {
    const k = keysFor(action);
    return `<span class="key">${k.length ? keyCap(k[0]) : '--'}</span>`;
  }
  /* An action can sit on more than one button -- run is on both triggers.
     Two is plenty; the panel has to fit a 4:3 screen without scrolling. */
  return on.slice(0, 2).map(padGlyph).join('<span class="key-or"> </span>');
}

/** Bare text, for places that cannot take markup. */
export function glyphText(action) {
  const stick = STICKS[action];
  if (stick) return SCHEME === 'kbm' ? stick[0] : stick[1];
  if (SCHEME === 'kbm') {
    const k = keysFor(action);
    return k.length ? keyCap(k[0]) : '--';
  }
  const on = padFor(action);
  if (!on.length) {
    const k = keysFor(action);
    return k.length ? keyCap(k[0]) : '--';
  }
  return on.slice(0, 2).map(padText).join('/');
}

/** Every key on an action, for the controls screen. */
export function keyList(action) {
  const k = keysFor(action);
  return k.length ? k.map(keyCap).join('  /  ') : '--';
}

/** Every pad button on an action, for the controls screen. */
export function padList(action) {
  const on = padFor(action);
  return on.length ? on.map(padText).join('  /  ') : '--';
}

export const escapeHtml = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
