/* ============================================================
   menus.js -- menus as data, and one controller that works all of them.

   Final Rental built each screen as a template literal and then drove it
   with a bespoke update method per screen: updateTitle, updatePanelMenu,
   updatePadMenu, updatePause, updateQuitConfirm, each with its own copy
   of "did they press up, did they press down, did they press enter". That
   is five places for a navigation bug to live.

   Here a screen is a list of ROWS. A row has a label, optionally a value
   and a way to change it, and optionally something to do when it is
   chosen. The controller knows how to move a highlight, adjust a value
   and run a choice, and it is the only thing that reads the input.
   ============================================================ */
import { glyph, keyList, padList, escapeHtml } from './glyphs.js';
import { BINDABLE, ACTIONS } from '../engine/input.js';
import { RESOLUTIONS, RETRO_LEVELS, TEXTURE_STABILITY } from '../game/settings.js';

/* ---------------- row constructors ---------------- */

export const action = (label, onSelect, opt = {}) =>
  ({ kind: 'action', label, onSelect, ...opt });

export const toggle = (label, get, set, opt = {}) => ({
  kind: 'value', label,
  value: () => (get() ? 'ON' : 'OFF'),
  adjust: () => set(!get()),
  onSelect: () => set(!get()),
  ...opt,
});

export const slider = (label, get, set, opt = {}) => {
  const step = opt.step || 0.05;
  return {
    kind: 'value', label,
    value: () => bar(get()),
    adjust: (d) => set(Math.max(0, Math.min(1, Math.round((get() + d * step) * 100) / 100))),
    ...opt,
  };
};

export const choice = (label, options, get, set, opt = {}) => ({
  kind: 'value', label,
  value: () => String(options[get()] === undefined ? '?' : (opt.render ? opt.render(options[get()]) : options[get()])),
  adjust: (d) => set((get() + d + options.length) % options.length),
  onSelect: () => set((get() + 1) % options.length),
  ...opt,
});

export const text = (label, opt = {}) => ({ kind: 'text', label, ...opt });

function bar(v) {
  const n = Math.round(v * 10);
  return `[${'█'.repeat(n)}${'·'.repeat(10 - n)}] ${Math.round(v * 100)}%`;
}

/* ---------------- the controller ---------------- */

export class MenuController {
  constructor(ui, sfx) {
    this.ui = ui;
    this.sfx = sfx;
    this.screen = null;
    this.sel = 0;
    /** Pushed when a screen opens another, so Back always goes somewhere. */
    this.stack = [];
  }

  get open() { return !!this.screen; }

  show(screen) {
    if (this.screen) this.stack.push({ screen: this.screen, sel: this.sel });
    this.screen = screen;
    this.sel = this._firstSelectable(0, 1);
    this.render();
  }

  /** Replace the current screen without growing the stack. */
  replace(screen) {
    this.screen = screen;
    this.sel = this._firstSelectable(0, 1);
    this.render();
  }

  close() {
    this.screen = null;
    this.stack.length = 0;
    this.ui.hidePanel();
  }

  /** @returns true if there was somewhere to go back to */
  back() {
    if (this.screen && this.screen.onBack && this.screen.onBack() === false) return true;
    const prev = this.stack.pop();
    if (!prev) { this.close(); return false; }
    this.screen = prev.screen;
    this.sel = prev.sel;
    this.render();
    return true;
  }

  rows() { return this.screen ? this.screen.rows() : []; }

  _selectable(r) { return r && r.kind !== 'text' && !r.disabled; }

  _firstSelectable(from, dir) {
    const rows = this.rows();
    for (let i = 0; i < rows.length; i++) {
      const k = (from + dir * i + rows.length * 2) % rows.length;
      if (this._selectable(rows[k])) return k;
    }
    return 0;
  }

  move(d) {
    const rows = this.rows();
    if (!rows.length) return;
    let i = this.sel;
    for (let n = 0; n < rows.length; n++) {
      i = (i + d + rows.length) % rows.length;
      if (this._selectable(rows[i])) break;
    }
    if (i !== this.sel) { this.sel = i; if (this.sfx) this.sfx.uiMove(); }
    this.ui.panelSelect(this.sel);
  }

  adjust(d) {
    const row = this.rows()[this.sel];
    if (!row || !row.adjust) return false;
    row.adjust(d);
    if (this.sfx) this.sfx.uiMove();
    this.render();
    return true;
  }

  confirm() {
    const row = this.rows()[this.sel];
    if (!row) return false;
    if (row.onSelect) {
      if (this.sfx) this.sfx.uiSelect();
      row.onSelect();
      if (this.screen) this.render();
      return true;
    }
    if (row.adjust) return this.adjust(1);
    return false;
  }

  render() {
    if (!this.screen) return;
    const s = this.screen;
    const rows = this.rows();
    if (this.sel >= rows.length) this.sel = this._firstSelectable(0, 1);
    const body = rows.map((r, i) => {
      if (r.kind === 'text') {
        return `<li class="note${r.className ? ' ' + r.className : ''}">${r.label}</li>`;
      }
      const val = r.value ? `<span class="val">${r.value()}</span>` : '';
      const sub = r.sub ? `<span class="sub">${r.sub}</span>` : '';
      return `<li class="opt${i === this.sel ? ' sel' : ''}${r.disabled ? ' off' : ''}">`
        + `<span class="lbl">${r.label}</span>${val}${sub}</li>`;
    }).join('');
    this.ui.showPanel(
      `<h2>${s.title}</h2>`
      + (s.blurb ? `<p class="blurb">${s.blurb}</p>` : '')
      + `<ul class="menu" tabindex="-1">${body}</ul>`
      + `<p class="pad-foot">${s.footer || defaultFooter()}</p>`
    );
    /* A rebuilt panel starts scrolled to the top, so the highlight has to
       be brought back into view. */
    if (this.ui.panelReveal) this.ui.panelReveal(this.sel);
  }
}

const defaultFooter = () =>
  `${glyph('uiUp')}${glyph('uiDown')} move &nbsp;&middot;&nbsp; `
  + `${glyph('uiLeft')}${glyph('uiRight')} change &nbsp;&middot;&nbsp; `
  + `${glyph('uiConfirm')} select &nbsp;&middot;&nbsp; ${glyph('pause')} back`;

/* ============================================================
   THE SCREENS
   ============================================================ */

/*
 * SETTINGS IS A MENU OF PAGES, NOT A PAGE.
 *
 * It used to be one list: five volume sliders, three look rows, four
 * picture rows and two actions, sixteen deep. The panel clipped whatever
 * did not fit without a scrollbar, so on a short window the picture
 * settings were simply not there as far as the player was concerned --
 * and even once the panel scrolled, a setting eleven rows down a list is
 * a setting nobody finds.
 *
 * No page below is more than six rows. Everything is two keypresses from
 * the pause menu.
 */
export function settingsScreen(game) {
  return {
    title: 'SETTINGS',
    rows: () => [
      action('Audio...', () => game.menu.show(audioScreen(game))),
      action('Looking...', () => game.menu.show(lookScreen(game))),
      action('Picture...', () => game.menu.show(pictureScreen(game))),
      action('Controls...', () => game.menu.show(controlsScreen(game))),
      action('Reset all settings', () => game.menu.show(confirmScreen(game,
        'RESET ALL SETTINGS?',
        'Volumes, sensitivity, invert look, resolution and the retro filter '
        + 'go back to their defaults. Key and controller bindings are not touched.',
        /* No `menu.back()` here: confirmScreen's Yes has already popped
           itself, and a second pop threw the player out of SETTINGS
           altogether -- which looks exactly like the reset having
           closed the menu on them. */
        () => { game.resetSettings(); }))),
      action('Back', () => game.menu.back()),
    ],
  };
}

export function audioScreen(game) {
  const S = game.settings;
  const v = S.values;
  const touch = () => { S.apply(game.systems()); game.persistSettings(); };
  return {
    title: 'AUDIO',
    rows: () => [
      slider('Master', () => v.volMaster, (x) => { v.volMaster = x; touch(); }),
      slider('Ambience', () => v.volAmbience, (x) => { v.volAmbience = x; touch(); }),
      slider('Effects', () => v.volSfx, (x) => { v.volSfx = x; touch(); }),
      slider('Voice', () => v.volVoice, (x) => { v.volVoice = x; touch(); }),
      slider('Interface', () => v.volUi, (x) => { v.volUi = x; touch(); }),
      action('Back', () => game.menu.back()),
    ],
  };
}

export function lookScreen(game) {
  const S = game.settings;
  const v = S.values;
  const touch = () => { S.apply(game.systems()); game.persistSettings(); };
  return {
    title: 'LOOKING',
    blurb: 'Moving the mouse or the trackpad AWAY from you looks up. '
      + 'Turn Invert look on if you want it the other way round.',
    rows: () => [
      slider('Mouse sensitivity', () => v.mouseSensitivity, (x) => { v.mouseSensitivity = x; touch(); }),
      slider('Controller sensitivity', () => v.padSensitivity, (x) => { v.padSensitivity = x; touch(); }),
      toggle('Invert look (Y)', () => v.invertY, (x) => { v.invertY = x; touch(); }),
      slider('Field of view', () => (v.fieldOfView - 50) / 40,
        (x) => { v.fieldOfView = Math.round(50 + x * 40); touch(); },
        { value: () => `${v.fieldOfView}\u00b0` }),
      action('Back', () => game.menu.back()),
    ],
  };
}

export function pictureScreen(game) {
  const S = game.settings;
  const v = S.values;
  const touch = () => { S.apply(game.systems()); game.persistSettings(); };
  return {
    title: 'PICTURE',
    blurb: 'Resolution is the internal framebuffer, not the window. '
      + 'Texture stability trades the old swim on big surfaces for being '
      + 'able to read the building.',
    rows: () => [
      choice('Resolution', RESOLUTIONS, () => v.resolution, (i) => { v.resolution = i; touch(); },
        { render: (r) => r[2] }),
      choice('Texture stability', TEXTURE_STABILITY, () => v.textureStability,
        (i) => { v.textureStability = i; touch(); },
        { render: (r) => r.label.toUpperCase() }),
      choice('Retro filter', RETRO_LEVELS, () => RETRO_LEVELS.indexOf(v.retro),
        (i) => { v.retro = RETRO_LEVELS[i]; touch(); },
        { render: (r) => r.toUpperCase() }),
      toggle('Vertex snapping', () => v.vertexSnap, (x) => { v.vertexSnap = x; touch(); }),
      action('Back', () => game.menu.back()),
    ],
  };
}

export function controlsScreen(game) {
  const input = game.input;
  return {
    title: 'CONTROLS',
    blurb: 'Select an action to rebind it, then press the key you want. '
      + 'ESC cancels a rebind.',
    rows: () => {
      const out = [text('KEYBOARD')];
      for (const id of BINDABLE) {
        const a = ACTIONS[id];
        out.push({
          kind: 'value',
          label: a.label,
          value: () => (game.rebinding === id ? '&lt; press a key &gt;' : escapeHtml(keyList(id))),
          onSelect: () => game.beginRebind(id, 'key'),
        });
      }
      out.push(text('CONTROLLER'));
      out.push(text(input.padId
        ? `${escapeHtml(input.padId)}${input.padTrusted ? '' : ' &mdash; layout not reported by the browser'}`
        : 'No controller detected. Press a button on one.', { className: 'quiet' }));
      for (const id of BINDABLE) {
        const a = ACTIONS[id];
        out.push({
          kind: 'value',
          label: a.label,
          value: () => (game.rebinding === id && game.rebindDevice === 'pad'
            ? '&lt; press a button &gt;' : escapeHtml(padList(id))),
          onSelect: () => game.beginRebind(id, 'pad'),
        });
      }
      out.push(action('Reset keyboard to defaults', () => { input.resetKeyBinds(); game.persistSettings(); }));
      out.push(action('Reset controller to defaults', () => { input.resetPadBinds(); game.persistSettings(); }));
      out.push(action('Back', () => game.menu.back()));
      return out;
    },
  };
}

export function pauseScreen(game) {
  return {
    title: 'PAUSED',
    rows: () => [
      action('Resume', () => game.resume()),
      action('Picture', () => game.menu.show(pictureScreen(game))),
      action('Settings', () => game.menu.show(settingsScreen(game))),
      action('Controls', () => game.menu.show(controlsScreen(game))),
      action('Save', () => game.saveNow()),
      action('Quit to title', () => game.menu.show(confirmScreen(game,
        'QUIT TO TITLE?', 'Unsaved progress in this shift is lost.',
        () => game.quitToTitle()))),
    ],
  };
}

export function confirmScreen(game, title, blurb, onYes) {
  return {
    title,
    blurb,
    rows: () => [
      action('No, go back', () => game.menu.back()),
      action('Yes', () => { game.menu.back(); onYes(); }),
    ],
  };
}

/** A read-only page. Used for the "how to play" and for error reports. */
export function infoScreen(title, lines, onBack) {
  return {
    title,
    rows: () => lines.map((l) => text(l)).concat([action('Back', onBack)]),
  };
}
