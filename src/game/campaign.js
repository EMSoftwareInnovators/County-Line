/* ============================================================
   campaign.js -- the shape of a County Line playthrough, with no County
   Line in it yet.

   Final Rental's night.js is the right IDEA and the wrong CONTENT. It
   generated a night: a seed, a length, a customer schedule, a suspect, a
   case file, a bulletin of traits, a deputy who visits on certain nights
   and stands down on others, and a grade at the end. Underneath all of
   that is a structure worth keeping -- a campaign is an ordered list of
   shifts, each with its own configuration, a set of story flags that
   persist between them, and a completion state.

   So this is that structure, empty:

     CampaignDef   the ordered shifts, declared as data
     Campaign      which shift is current, what the flags say, how a shift
                   starts, ends and is graded
     Shift         one unit of play

   THERE IS NO STORY HERE, and there must not be one before its stage.
   No routes, no vehicles, no passengers, no hauntings, no endings. What
   there is, is a single TEST SHIFT which starts, runs a clock and can be
   completed -- enough to prove that starting, saving, loading, resuming
   and finishing all work end to end.
   ============================================================ */

/** What a shift is doing right now. */
export const PHASE = {
  IDLE: 'IDLE',           // nothing started
  BRIEFING: 'BRIEFING',   // pre-shift screen, if a shift wants one
  ACTIVE: 'ACTIVE',       // being played
  ENDING: 'ENDING',       // wrapping up, fading out
  COMPLETE: 'COMPLETE',   // finished, results available
};

/**
 * One playable unit.
 *
 * @param def {
 *   id, name,
 *   level,                 which level module to load
 *   durationSeconds,       0 for "until something ends it"
 *   clock: { startHour, endHour },   what the in-game clock reads
 *   objectives: [{ id, text, optional }],
 *   onStart(campaign, ctx), onEnd(campaign, ctx, result)
 * }
 */
export class Shift {
  constructor(def) {
    Object.assign(this, def);
    this.durationSeconds = def.durationSeconds || 0;
    this.objectives = def.objectives || [];
  }
}

export class CampaignDef {
  constructor({ id, name, shifts }) {
    this.id = id;
    this.name = name;
    this.shifts = shifts.map((s) => new Shift(s));
  }
  shift(index) { return this.shifts[index] || null; }
  byId(id) { return this.shifts.find((s) => s.id === id) || null; }
  get length() { return this.shifts.length; }
}

export class Campaign {
  constructor(def) {
    this.def = def;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.phase = PHASE.IDLE;
    /** Persistent, shift to shift. A flag is a name and a value, nothing more. */
    this.flags = {};
    /** Per-shift, cleared when a shift starts. */
    this.progress = {};
    this.elapsed = 0;
    this.completed = [];
    /** Set when the campaign has run out of shifts. */
    this.finished = false;
    this.result = null;
  }

  get shift() { return this.def.shift(this.index); }

  /* ---------------- flags ---------------- */

  flag(name) { return this.flags[name]; }
  setFlag(name, value = true) { this.flags[name] = value; return value; }
  hasFlag(name) { return !!this.flags[name]; }

  /* ---------------- objectives ---------------- */

  objectiveDone(id) { return !!(this.progress.objectives && this.progress.objectives[id]); }
  completeObjective(id) {
    this.progress.objectives = this.progress.objectives || {};
    this.progress.objectives[id] = true;
    return this.remainingObjectives().length === 0;
  }
  remainingObjectives() {
    const s = this.shift;
    if (!s) return [];
    return s.objectives.filter((o) => !o.optional && !this.objectiveDone(o.id));
  }

  /* ---------------- lifecycle ---------------- */

  start(index, ctx) {
    this.index = Math.max(0, Math.min(this.def.length - 1, index | 0));
    this.phase = PHASE.ACTIVE;
    this.elapsed = 0;
    this.progress = { objectives: {} };
    this.result = null;
    const s = this.shift;
    if (s && s.onStart) s.onStart(this, ctx);
    return s;
  }

  update(dt) {
    if (this.phase !== PHASE.ACTIVE) return;
    this.elapsed += dt;
    const s = this.shift;
    if (s && s.durationSeconds && this.elapsed >= s.durationSeconds) this.end('time');
  }

  /** @param reason 'time' | 'objectives' | whatever a later stage adds */
  end(reason, ctx) {
    if (this.phase === PHASE.COMPLETE) return this.result;
    const s = this.shift;
    this.phase = PHASE.COMPLETE;
    this.result = {
      shift: s ? s.id : null,
      reason,
      elapsed: this.elapsed,
      objectives: { ...(this.progress.objectives || {}) },
      outstanding: this.remainingObjectives().map((o) => o.id),
    };
    if (s && s.onEnd) s.onEnd(this, ctx, this.result);
    if (!this.completed.includes(this.index)) this.completed.push(this.index);
    return this.result;
  }

  /** Move to the next shift. @returns false when the campaign is over. */
  advance() {
    if (this.index + 1 >= this.def.length) { this.finished = true; return false; }
    this.index++;
    this.phase = PHASE.IDLE;
    return true;
  }

  /* ---------------- the in-game clock ----------------
     A shift reads a wall clock rather than a countdown, which is how
     Final Rental did it and how anything with a timetable has to. */

  clockString() {
    const s = this.shift;
    if (!s || !s.clock) return '';
    const span = (s.clock.endHour - s.clock.startHour + 24) % 24 || 1;
    const t = s.durationSeconds ? Math.min(1, this.elapsed / s.durationSeconds) : 0;
    const total = s.clock.startHour * 60 + t * span * 60;
    const h24 = Math.floor(total / 60) % 24;
    const m = Math.floor(total % 60);
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  }

  /* ---------------- serialization ---------------- */

  toJSON() {
    return {
      campaign: this.def.id,
      index: this.index,
      phase: this.phase,
      elapsed: this.elapsed,
      flags: { ...this.flags },
      progress: JSON.parse(JSON.stringify(this.progress || {})),
      completed: this.completed.slice(),
      finished: this.finished,
    };
  }

  fromJSON(d) {
    if (!d || typeof d !== 'object') return false;
    this.index = Math.max(0, Math.min(this.def.length - 1, d.index | 0));
    this.phase = PHASE[d.phase] ? d.phase : PHASE.IDLE;
    this.elapsed = typeof d.elapsed === 'number' && isFinite(d.elapsed) ? d.elapsed : 0;
    this.flags = (d.flags && typeof d.flags === 'object') ? { ...d.flags } : {};
    this.progress = (d.progress && typeof d.progress === 'object') ? d.progress : {};
    this.completed = Array.isArray(d.completed) ? d.completed.filter((n) => Number.isInteger(n)) : [];
    this.finished = !!d.finished;
    return true;
  }
}

/* ============================================================
   THE STAGE 1 CAMPAIGN

   One shift, on the technical test level, with one objective that exists
   only so that objective tracking has something to track. Replaced
   wholesale when the real campaign arrives.
   ============================================================ */
export const TEST_CAMPAIGN = new CampaignDef({
  id: 'test',
  name: 'Technical Test',
  shifts: [
    {
      id: 'test-shift',
      name: 'Test Shift',
      level: 'testbed',
      durationSeconds: 0,            // runs until the player stops it
      clock: { startHour: 21, endHour: 24 },
      objectives: [
        { id: 'walk-upstairs', text: 'Get to the upper floor' },
        { id: 'go-outside', text: 'Step outside' },
        { id: 'use-something', text: 'Use the test interactable', optional: true },
      ],
    },
  ],
});
