/* ============================================================
   storage.js -- durable state, namespaced and versioned.

   Final Rental had almost nothing here: one localStorage key,
   `finalrental.padbinds`, written straight out as JSON. Options were not
   persisted at all and there was no save game, so there was no format to
   inherit -- only a namespace to stay well clear of.

   COUNTY LINE OWNS THE `countyline.` PREFIX AND NOTHING ELSE. Every key
   this module writes starts with it. Final Rental's browser storage is
   never read and can never be written, even when both games are served
   from the same origin during development, which they will be.

   Three rules the rest of the game gets for free by going through here:

     1. EVERY RECORD IS VERSIONED. A stored blob carries the version of
        the format that wrote it. Loading runs it through a chain of
        migrations up to the current version, so a save from today still
        opens after the schema changes in Stage 4.

     2. A BAD RECORD IS NOT A CRASH. Storage can be disabled, full,
        truncated by a browser clearing site data, or edited by hand.
        Anything that does not parse, does not validate, or claims a
        version from the future is treated as absent, moved aside under a
        `.corrupt` key so it can be looked at, and the caller gets its
        defaults.

     3. NOTHING THROWS. Private windows refuse localStorage outright in
        some browsers; a game that dies on the options screen because it
        could not remember a volume slider is a worse game than one that
        forgets the slider.
   ============================================================ */

export const NAMESPACE = 'countyline';

/** Every key County Line will ever write, in one list. */
export const KEYS = {
  settings: `${NAMESPACE}.settings`,
  save: `${NAMESPACE}.save`,
  profile: `${NAMESPACE}.profile`,
};

/** Is there a working localStorage? Cached, because the probe writes. */
let _available = null;
export function available() {
  if (_available !== null) return _available;
  try {
    const k = `${NAMESPACE}.__probe`;
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    _available = true;
  } catch (err) {
    _available = false;
  }
  return _available;
}

/** For tests: forget the probe result and any in-memory fallback. */
export function _reset() { _available = null; _memory.clear(); }

/* When localStorage is refused we keep records for the life of the page
   rather than dropping writes on the floor. The session still behaves;
   it simply does not survive a reload, which is the honest outcome. */
const _memory = new Map();

function readRaw(key) {
  if (available()) {
    try { return localStorage.getItem(key); } catch (err) { /* fall through */ }
  }
  return _memory.has(key) ? _memory.get(key) : null;
}

function writeRaw(key, value) {
  _memory.set(key, value);
  if (!available()) return false;
  try { localStorage.setItem(key, value); return true; } catch (err) { return false; }
}

function removeRaw(key) {
  _memory.delete(key);
  if (!available()) return;
  try { localStorage.removeItem(key); } catch (err) { /* nothing to do */ }
}

/**
 * A versioned record in storage.
 *
 * @param key        one of KEYS
 * @param version    the format this build writes
 * @param defaults   () => object, for a first run or a rejected record
 * @param migrate    (data, fromVersion) => object | null, called once per
 *                   load for anything older. Returning null rejects it.
 * @param validate   (data) => boolean, a shape check on the migrated result
 */
export class Record {
  constructor({ key, version, defaults, migrate, validate }) {
    if (!String(key).startsWith(`${NAMESPACE}.`)) {
      throw new Error(`storage key "${key}" is outside the ${NAMESPACE} namespace`);
    }
    this.key = key;
    this.version = version;
    this.defaults = defaults || (() => ({}));
    this.migrate = migrate || null;
    this.validate = validate || (() => true);
    /** Set when the last load rejected something. The UI can say so. */
    this.lastError = null;
  }

  /** True if anything is stored under this key at all. */
  exists() { return readRaw(this.key) !== null; }

  /** @returns { data, fresh, migrated } -- never throws, never returns null. */
  load() {
    this.lastError = null;
    const raw = readRaw(this.key);
    if (raw === null) return { data: this.defaults(), fresh: true, migrated: false };

    let blob;
    try { blob = JSON.parse(raw); } catch (err) {
      return this._reject(raw, 'not valid JSON');
    }
    if (!blob || typeof blob !== 'object' || typeof blob.v !== 'number' || !blob.d) {
      return this._reject(raw, 'not a County Line record');
    }
    if (blob.v > this.version) {
      /* Written by a newer build. Refusing is the only safe answer:
         silently loading fields we do not understand and writing the
         record back would throw away whatever the newer build stored. */
      return this._reject(raw, `written by a newer version (v${blob.v})`);
    }

    let data = blob.d;
    let migrated = false;
    if (blob.v < this.version) {
      if (!this.migrate) return this._reject(raw, `no migration from v${blob.v}`);
      try { data = this.migrate(data, blob.v); } catch (err) { data = null; }
      if (!data) return this._reject(raw, `migration from v${blob.v} failed`);
      migrated = true;
    }

    let ok = false;
    try { ok = !!this.validate(data); } catch (err) { ok = false; }
    if (!ok) return this._reject(raw, 'failed validation');

    return { data, fresh: false, migrated };
  }

  /** @returns true if it reached durable storage. */
  save(data) {
    let text;
    try {
      text = JSON.stringify({ v: this.version, t: Date.now(), d: data });
    } catch (err) {
      this.lastError = 'could not serialize';
      return false;
    }
    return writeRaw(this.key, text);
  }

  clear() { removeRaw(this.key); }

  /* Put a rejected record aside rather than deleting it. It costs one key
     and it is the difference between "my save is gone" and "my save is
     here and it did not open". */
  _reject(raw, why) {
    this.lastError = why;
    writeRaw(`${this.key}.corrupt`, raw);
    removeRaw(this.key);
    return { data: this.defaults(), fresh: true, migrated: false, rejected: why };
  }
}

/**
 * Merge stored values over defaults, one level deep, keeping only keys the
 * defaults declare and only values of the declared type.
 *
 * This is what makes a settings file forward- and backward-tolerant
 * without a migration for every added slider: an unknown key is dropped, a
 * missing one falls back, and a string where a number belongs does not
 * reach the audio graph.
 */
export function mergeTyped(defaults, stored) {
  const out = { ...defaults };
  if (!stored || typeof stored !== 'object') return out;
  for (const k of Object.keys(defaults)) {
    const d = defaults[k], s = stored[k];
    if (s === undefined) continue;
    if (d !== null && typeof d === 'object' && !Array.isArray(d)) {
      out[k] = mergeTyped(d, s);
    } else if (Array.isArray(d)) {
      if (Array.isArray(s)) out[k] = s;
    } else if (typeof s === typeof d) {
      out[k] = s;
    }
  }
  return out;
}
