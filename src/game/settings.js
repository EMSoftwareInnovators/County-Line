/* ============================================================
   settings.js -- what the player has chosen, and making it stick.

   Final Rental kept its options in a plain object on the Game and wrote
   exactly one of them to disk (the pad bindings). Volume, sensitivity,
   invert-Y and the filter toggles were all forgotten the moment the tab
   closed. There was nothing to inherit, so this is built properly and
   built once:

     * ONE record, under `countyline.settings`, versioned and migrated
       like everything else in storage.js.
     * SEPARATE FROM THE CAMPAIGN. Deleting a save must not reset the
       player's sensitivity, and starting a new game must not either.
       Two records, two lifetimes.
     * DEFAULTS DECLARED IN ONE PLACE, and a load that merges stored
       values over them by type, so a settings file written by an older
       build keeps what it knew and picks up what it did not.
   ============================================================ */
import { Record, KEYS, mergeTyped } from '../engine/storage.js';
import { defaultKeyBinds, sanitizeKeyBinds, sanitizePadBinds } from '../engine/input.js';
import { PRESETS } from '../engine/postfx.js';

export const SETTINGS_VERSION = 1;

/** Internal render resolutions, lowest first. 4:3 throughout. */
export const RESOLUTIONS = [
  [256, 192, '256 x 192'],
  [320, 240, '320 x 240'],
  [400, 300, '400 x 300'],
  [512, 384, '512 x 384'],
];

export const RETRO_LEVELS = ['off', 'light', 'full'];

/**
 * How honestly the rasterizer maps textures, worst to best.
 *
 * `step` is `Raster.perspStep`: 0 is fully affine -- the authentic PS1
 * swim, and on a ninety-four-foot elevation an unusable amount of it --
 * and any n above 0 is a perspective-correct sample every n pixels with
 * affine mapping between. 8 is indistinguishable from exact on anything
 * you can walk up to and costs an eighth of the divides.
 *
 * BALANCED is the default because architecture has to be readable. The
 * retro look in this game comes from resolution, color depth, dither and
 * vertex snapping, none of which this touches.
 */
export const TEXTURE_STABILITY = [
  { id: 'retro', label: 'Retro (affine)', step: 0 },
  { id: 'balanced', label: 'Balanced', step: 8 },
  { id: 'stable', label: 'Stable', step: 1 },
];

export function defaultSettings() {
  return {
    /* ---- audio, one per bus ---- */
    volMaster: 0.8,
    volAmbience: 0.8,
    volSfx: 0.9,
    volVoice: 1.0,
    volUi: 0.7,

    /* ---- looking ---- */
    mouseSensitivity: 0.5,     // 0..1, mapped to radians per count on apply
    padSensitivity: 0.5,       // 0..1
    invertY: false,

    /* ---- picture ---- */
    resolution: 1,             // index into RESOLUTIONS
    retro: 'full',             // key of PRESETS
    vertexSnap: true,          // the PS1 polygon wobble
    textureStability: 1,       // index into TEXTURE_STABILITY
    fieldOfView: 65,           // degrees, vertical

    /* ---- bindings ---- */
    keyBinds: defaultKeyBinds(),
    padBinds: {},              // empty means "whatever the pad deserves"
  };
}

const record = new Record({
  key: KEYS.settings,
  version: SETTINGS_VERSION,
  defaults: defaultSettings,
  /* Nothing to migrate yet. The hook exists so that the first schema
     change is a five-line diff and not an argument about whether losing
     everyone's controls is acceptable. */
  migrate: (data, from) => (from < SETTINGS_VERSION ? data : null),
  validate: (d) => d && typeof d === 'object' && typeof d.volMaster === 'number',
});

export class Settings {
  constructor() {
    this.values = defaultSettings();
    this.lastError = null;
  }

  load() {
    const r = record.load();
    const d = defaultSettings();
    this.values = mergeTyped(d, r.data);
    this.values.keyBinds = sanitizeKeyBinds(r.data && r.data.keyBinds);
    this.values.padBinds = sanitizePadBinds(r.data && r.data.padBinds);
    if (!RETRO_LEVELS.includes(this.values.retro)) this.values.retro = 'full';
    this.values.resolution = Math.max(0, Math.min(RESOLUTIONS.length - 1,
      Math.round(this.values.resolution)));
    this.values.textureStability = Math.max(0, Math.min(TEXTURE_STABILITY.length - 1,
      Math.round(this.values.textureStability)));
    this.lastError = r.rejected || null;
    return this.values;
  }

  save() { return record.save(this.values); }

  reset() { this.values = defaultSettings(); return this.values; }

  get(k) { return this.values[k]; }
  set(k, v) { this.values[k] = v; return v; }

  /**
   * Push every setting into the systems that care.
   *
   * Deliberately one function. Options screens change one value and call
   * this; nothing has to remember which subsystem owns which slider, and
   * a setting can never be applied on load but forgotten on change.
   */
  apply({ input, audio, raster, post, game }) {
    const v = this.values;

    if (audio) {
      audio.setLevel('master', v.volMaster);
      audio.setLevel('ambience', v.volAmbience);
      audio.setLevel('sfx', v.volSfx);
      audio.setLevel('voice', v.volVoice);
      audio.setLevel('ui', v.volUi);
    }

    if (input) {
      /* 0.5 on the slider lands on Final Rental's default feel. The curve
         is linear because a sensitivity slider that is not linear is a
         sensitivity slider players cannot set. */
      input.sensitivity = 0.0009 + v.mouseSensitivity * 0.0032;
      input.padSensitivity = 1.8 + v.padSensitivity * 5.0;
      input.invertY = !!v.invertY;
      input.keyBinds = sanitizeKeyBinds(v.keyBinds);
      input.keyBindsAreUser = true;
      if (Object.keys(v.padBinds).length) {
        input.padBinds = sanitizePadBinds(v.padBinds);
        input.padBindsAreUser = true;
      }
    }

    if (raster) {
      raster.snap = v.vertexSnap ? 1 : 0;
      const t = TEXTURE_STABILITY[v.textureStability] || TEXTURE_STABILITY[1];
      raster.perspStep = t.step;
    }

    if (post) {
      const p = PRESETS[v.retro] || PRESETS.full;
      post.setVignette(p.vignette);
    }

    if (game) game.onSettingsApplied(v);
    return v;
  }

  /** The post-processing parameters for the current retro level. */
  postParams() { return PRESETS[this.values.retro] || PRESETS.full; }

  /** Pull the live bindings back out of the input layer before saving. */
  captureBinds(input) {
    this.values.keyBinds = sanitizeKeyBinds(input.keyBinds);
    this.values.padBinds = input.padBindsAreUser ? sanitizePadBinds(input.padBinds) : {};
  }
}

export const settingsRecord = record;
