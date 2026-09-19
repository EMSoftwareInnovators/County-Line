/* ============================================================
   incidents.js -- the things that go wrong on an ordinary night.

   THE RULE FOR THIS FILE, and it is the brief's rule: NOTHING IN HERE
   IS STRANGE. Every incident is something a night clerk at a bus
   station in 1998 dealt with before midnight and did not think about
   again. A breaker, a spill, a bag on the wrong rack, a driver who
   wants coffee, somebody asleep in the waiting room at half past
   twelve. There are no anomalies, no impossible calls, no altered
   clocks and no Route 117 in this file or anywhere near it.

   WHY THEY EXIST. A shift where the only thing that ever happens is
   the schedule is a shift you can do on autopilot by the third coach,
   and the brief asks for something that is fun before it is anything
   else. What makes a job fun is that it goes slightly wrong in ways
   you can fix. That is all these are.

   WHAT AN INCIDENT IS: a trigger, a line of text, and a way to clear
   it -- usually a station the player has to walk to. Nothing here
   resolves itself, and nothing here ends the shift.
   ============================================================ */

export const KIND = {
  ELECTRICAL: 'electrical',
  HOUSEKEEPING: 'housekeeping',
  BAGGAGE: 'baggage',
  PEOPLE: 'people',
  PAPERWORK: 'paperwork',
};

/**
 * @typedef Incident {
 *   id, kind,
 *   text,      what the player is told when it happens
 *   note,      the line it leaves on the shift log until it is cleared
 *   at,        the station id that clears it, or null for a thing that
 *              is only ever noticed
 *   clear,     what the prompt says at that station
 *   after,     minutes into the shift before it can happen
 *   weight,    how likely, against the others available
 *   once,      true if it is at most one a night
 * }
 */
export const INCIDENTS = [
  {
    id: 'east-wing-trip', kind: KIND.ELECTRICAL, once: true,
    text: 'The lights in the east wing have gone out.',
    note: 'East wing breaker tripped',
    at: 'panel-b', clear: 'Reset the east wing',
    after: 70, weight: 0,   // the load model causes this one; see power.js
  },
  {
    id: 'coffee-spill', kind: KIND.HOUSEKEEPING,
    text: 'Somebody has knocked a coffee over on the bench by the doors.',
    note: 'Spill in the lobby',
    at: 'lobby-spill', clear: 'Mop it up',
    after: 20, weight: 3,
  },
  {
    id: 'wrong-rack', kind: KIND.BAGGAGE,
    text: 'There is a case on the Savannah rack with an Atlanta tag on it.',
    note: 'Bag on the wrong rack',
    at: 'baggage-tags', clear: 'Put it where it belongs',
    after: 40, weight: 4,
  },
  {
    id: 'driver-coffee', kind: KIND.PEOPLE,
    text: 'A driver wants to know if there is any coffee made.',
    note: 'Driver waiting on coffee',
    at: 'coffee', clear: 'Put a pot on',
    after: 15, weight: 4,
  },
  {
    id: 'sleeper', kind: KIND.PEOPLE,
    text: 'Somebody is asleep across three seats in the waiting room.',
    note: 'Sleeper in the waiting room',
    at: 'gate-board', clear: 'Wake them and ask where they are going',
    after: 120, weight: 3,
  },
  {
    id: 'stuck-printer', kind: KIND.PAPERWORK,
    text: 'The ticket printer has jammed on a blank.',
    note: 'Printer jammed',
    at: 'ticket-printer', clear: 'Clear the jam',
    after: 45, weight: 3,
  },
  {
    id: 'restroom', kind: KIND.HOUSEKEEPING,
    text: 'A passenger says there is no paper in the restroom.',
    note: 'Restroom needs seeing to',
    at: 'restroom-check', clear: 'See to it',
    after: 30, weight: 3,
  },
  {
    id: 'forms', kind: KIND.PAPERWORK, once: true,
    text: 'The timetable forms have run out. There is a carton upstairs.',
    note: 'Fetch timetable forms from the second floor',
    at: 'forms-carton', clear: 'Take a carton down',
    after: 55, weight: 0,   // the shift schedules this one; it is THE errand
  },
  {
    id: 'unclaimed', kind: KIND.BAGGAGE,
    text: 'There is a bag at the baggage desk that nobody has come for.',
    note: 'Unclaimed bag',
    at: 'lost-found', clear: 'Book it into lost property',
    after: 100, weight: 3,
  },
  {
    id: 'tube', kind: KIND.ELECTRICAL,
    text: 'The strip over the baggage scale has started flickering.',
    note: 'Flickering tube over the scale',
    at: 'tube-store', clear: 'Fetch a four-foot tube',
    after: 80, weight: 2,
  },
  {
    id: 'change', kind: KIND.PAPERWORK,
    text: 'The drawer is getting short of ones.',
    note: 'Drawer short of small notes',
    at: 'shift-log', clear: 'Note it for the morning',
    after: 90, weight: 2,
  },
  {
    id: 'manifest-short', kind: KIND.PAPERWORK,
    text: 'A driver says his manifest is one short of what he has aboard.',
    note: 'Manifest count disputed',
    at: 'manifest-board', clear: 'Count it again',
    after: 60, weight: 3,
  },
];

export const INCIDENT_BY_ID = new Map(INCIDENTS.map((i) => [i.id, i]));

/* ============================================================
   THE POOL
   ============================================================ */
export class IncidentPool {
  /**
   * @param opt { r, onRaise(incident), onClear(incident), spacing }
   */
  constructor(opt = {}) {
    this.opt = opt;
    this.r = opt.r || Math.random;
    /** Currently outstanding, in the order they happened. */
    this.open = [];
    /** Ids that have already had their turn. */
    this.used = new Set();
    /** Minutes of shift since the last one, so they do not bunch. */
    this.since = 0;
    this.spacing = opt.spacing === undefined ? 22 : opt.spacing;
  }

  get count() { return this.open.length; }
  has(id) { return this.open.some((i) => i.id === id); }

  /** Raise one by name. This is how the shift script fires its own. */
  raise(id) {
    const def = INCIDENT_BY_ID.get(id);
    if (!def || this.has(id)) return null;
    if (def.once && this.used.has(id)) return null;
    this.used.add(id);
    const live = { ...def, raisedAt: this.opt.now ? this.opt.now() : 0 };
    this.open.push(live);
    this.since = 0;
    if (this.opt.onRaise) this.opt.onRaise(live);
    return live;
  }

  /**
   * Maybe raise one, given how far into the shift it is.
   *
   * @param minutes how long the shift has been running
   * @param busy    true if the player already has their hands full, in
   *                which case nothing new happens: the pool exists to
   *                keep a quiet stretch from being empty, not to pile
   *                on when a coach is boarding.
   */
  tick(minutes, dtMinutes, busy) {
    this.since += dtMinutes;
    if (busy || this.since < this.spacing) return null;
    if (this.open.length >= 3) return null;
    const able = INCIDENTS.filter((i) => i.weight > 0
      && minutes >= i.after
      && !this.has(i.id)
      && !(i.once && this.used.has(i.id)));
    if (!able.length) return null;
    let total = 0;
    for (const i of able) total += i.weight;
    let pickAt = this.r() * total;
    for (const i of able) {
      pickAt -= i.weight;
      if (pickAt <= 0) return this.raise(i.id);
    }
    return this.raise(able[able.length - 1].id);
  }

  /** The player has dealt with it. */
  clear(id) {
    const i = this.open.findIndex((x) => x.id === id);
    if (i < 0) return null;
    const [done] = this.open.splice(i, 1);
    if (this.opt.onClear) this.opt.onClear(done);
    return done;
  }

  /** Whatever this station would clear, if anything. */
  at(stationId) {
    return this.open.find((i) => i.at === stationId) || null;
  }

  /** The lines on the shift log. */
  notes() { return this.open.map((i) => i.note); }

  save() {
    return { open: this.open.map((i) => i.id), used: [...this.used], since: this.since };
  }

  restore(d) {
    if (!d) return false;
    this.open = (d.open || []).map((id) => INCIDENT_BY_ID.get(id)).filter(Boolean)
      .map((def) => ({ ...def }));
    this.used = new Set(d.used || []);
    this.since = d.since || 0;
    return true;
  }
}
