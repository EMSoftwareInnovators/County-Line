/* ============================================================
   save.js -- the campaign save, and the profile that outlives it.

   Final Rental had neither: a night was played in one sitting and the tab
   remembered nothing. So this is designed rather than ported, and it is
   designed for a game that does not exist yet. The requirement that
   drives every decision below is that a save written in Stage 1 must
   still open in Stage 6, by which point the campaign will have shifts,
   flags, an inventory, a world state and a job log that nobody has
   invented.

   THE FORMAT
     { v, t, d }                      -- written by storage.js
     d = {
       campaign,                      which campaign def this belongs to
       state,                         Campaign.toJSON()
       player: { x, y, z, yaw, pitch, level },
       world:  { doors: {...}, flags: {...} },
       meta:   { savedAt, playtime, build }
     }

   THE RULES
     1. Every section is optional on load and defaulted. A save missing a
        section it did not have yet is not corrupt, it is old.
     2. Unknown keys inside `world` are preserved on load and written back
        out. A Stage 4 save opened by a Stage 3 build must not silently
        lose Stage 4's world state.
     3. A save naming a campaign or a level this build does not have is
        rejected cleanly, not loaded into the wrong game.
     4. Autosave and manual save are the same record. There is one save
        per profile and it is the player's position in the story; a slot
        system is a decision for a stage that knows whether the game wants
        one.
   ============================================================ */
import { Record, KEYS } from '../engine/storage.js';

export const SAVE_VERSION = 1;
export const PROFILE_VERSION = 1;

function defaultSave() {
  return {
    campaign: null,
    state: null,
    player: null,
    world: { doors: {}, flags: {} },
    meta: { savedAt: 0, playtime: 0, build: SAVE_VERSION },
  };
}

const saveRecord = new Record({
  key: KEYS.save,
  version: SAVE_VERSION,
  defaults: defaultSave,
  migrate: (data, from) => {
    /* The migration chain. Each step takes the shape one version wrote and
       returns the shape the next one expects. Writing it as a chain rather
       than a switch means adding v3 later is one more line here and no
       changes anywhere else. */
    let d = data;
    // if (from < 2) d = toV2(d);
    // if (from < 3) d = toV3(d);
    return from < SAVE_VERSION ? d : null;
  },
  validate: (d) => (
    d && typeof d === 'object'
    && (d.campaign === null || typeof d.campaign === 'string')
    && (d.state === null || typeof d.state === 'object')
  ),
});

/**
 * The profile: everything true of the player rather than of a playthrough.
 * Starting a new game clears the save and leaves this alone.
 */
function defaultProfile() {
  return {
    /* Deliberately thin. Stage 1 has nothing to unlock and inventing
       achievements before there is a game to achieve anything in is how a
       save format ends up carrying dead fields forever. */
    seen: {},              // one-off prompts the player has been shown
    totalPlaytime: 0,
    firstRunAt: 0,
  };
}

const profileRecord = new Record({
  key: KEYS.profile,
  version: PROFILE_VERSION,
  defaults: defaultProfile,
  migrate: (data, from) => (from < PROFILE_VERSION ? data : null),
  validate: (d) => d && typeof d === 'object' && typeof d.seen === 'object',
});

export class SaveGame {
  constructor() {
    this.data = defaultSave();
    this.lastError = null;
  }

  /** Is there anything stored at all? */
  static exists() { return saveRecord.exists(); }

  /**
   * Is there a save worth offering CONTINUE for?
   *
   * Not the same question as "is there a save". A campaign that has been
   * FINISHED is stored -- the result is worth keeping -- but resuming it
   * would drop the player back into a shift that is already over. Offering
   * it is how a player ends up replaying an ending they have seen, or
   * standing in a level with nothing left to do and no way to tell why.
   */
  resumable(known) {
    if (!saveRecord.exists()) return false;
    const probe = new SaveGame();
    if (!probe.load(known).ok) return false;
    const st = probe.data.state;
    if (!st) return false;
    return st.phase !== 'COMPLETE' && st.finished !== true;
  }

  /**
   * @param known { campaigns: Set<string>, levels: Set<string> }
   * @returns { ok, reason } -- `ok` false means start a new game instead
   */
  load(known) {
    const r = saveRecord.load();
    this.lastError = r.rejected || null;
    if (r.fresh) return { ok: false, reason: r.rejected || 'no save' };

    const d = r.data;
    if (known && d.campaign && !known.campaigns.has(d.campaign)) {
      saveRecord.clear();
      return { ok: false, reason: `unknown campaign "${d.campaign}"` };
    }
    if (known && d.player && d.player.level && !known.levels.has(d.player.level)) {
      saveRecord.clear();
      return { ok: false, reason: `unknown level "${d.player.level}"` };
    }
    this.data = { ...defaultSave(), ...d, world: { doors: {}, flags: {}, ...(d.world || {}) } };
    return { ok: true, migrated: r.migrated };
  }

  /**
   * @param campaign a Campaign
   * @param player   the live player object
   * @param level    the live Level
   * @param playtime seconds
   */
  capture(campaign, player, level, playtime) {
    const doors = {};
    if (level) {
      for (const d of level.doors) doors[d.id] = { open: d.open, locked: d.locked };
    }
    this.data = {
      campaign: campaign.def.id,
      state: campaign.toJSON(),
      player: player ? {
        x: round(player.x), y: round(player.y), z: round(player.z),
        yaw: round(player.yaw), pitch: round(player.pitch),
        level: level ? level.id : null,
      } : null,
      /* Keep whatever a newer build wrote that this one does not
         understand. Rule 2. */
      world: { ...(this.data.world || {}), doors, flags: { ...(this.data.world && this.data.world.flags) } },
      meta: { savedAt: Date.now(), playtime: Math.round(playtime || 0), build: SAVE_VERSION },
    };
    return this.data;
  }

  write() { return saveRecord.save(this.data); }

  /** capture + write, the call an autosave actually makes. */
  autosave(campaign, player, level, playtime) {
    this.capture(campaign, player, level, playtime);
    return this.write();
  }

  /** Put a loaded save back into the live objects. */
  restore(campaign, player, level) {
    const d = this.data;
    let ok = true;
    if (d.state) ok = campaign.fromJSON(d.state) && ok;
    if (d.player && player) {
      player.x = num(d.player.x, player.x);
      player.y = num(d.player.y, player.y);
      player.z = num(d.player.z, player.z);
      player.yaw = num(d.player.yaw, player.yaw);
      player.pitch = num(d.player.pitch, player.pitch);
      player.vx = 0; player.vz = 0; player.vy = 0;
    }
    if (d.world && d.world.doors && level) {
      for (const door of level.doors) {
        const s = d.world.doors[door.id];
        if (!s) continue;
        door.locked = !!s.locked;
        door.target = s.open ? 1 : 0;
        door.amount = door.target;
      }
    }
    return ok;
  }

  clear() { saveRecord.clear(); this.data = defaultSave(); }
}

export class Profile {
  constructor() { this.data = defaultProfile(); }
  load() {
    const r = profileRecord.load();
    this.data = r.data;
    if (!this.data.firstRunAt) { this.data.firstRunAt = Date.now(); this.write(); }
    return this.data;
  }
  write() { return profileRecord.save(this.data); }
  markSeen(id) { this.data.seen[id] = true; this.write(); }
  hasSeen(id) { return !!this.data.seen[id]; }
  addPlaytime(seconds) {
    this.data.totalPlaytime = Math.round((this.data.totalPlaytime || 0) + seconds);
  }
}

const round = (v) => Math.round(v * 1000) / 1000;
const num = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);

export { saveRecord, profileRecord };
