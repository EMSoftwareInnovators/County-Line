/* ============================================================
   pa.js -- the public address, and the telephone on the desk.

   THE PA IS A PIECE OF EQUIPMENT, not a narrator. It is an amplifier
   on a shelf in the clerk's office with a microphone on a gooseneck,
   it is on the clerk's breaker, and if that breaker goes the
   announcement does not happen -- which is a thing the player can
   discover by trying.

   WHAT IT SAYS is built out of the manifest and the fare card, so the
   words are always true: the route's own name, its own stops, its own
   bay. There is no announcement text in this file that is not
   assembled from something the terminal actually knows. That is not a
   style choice. An announcement that can say something the building
   does not know is an announcement that can lie, and this is a game
   where a thing that lies is going to mean something later.

   NO VOICE ACTING YET. The brief says so in as many words. An
   announcement is a line of text over the HUD and a burst of the room
   tone, which is exactly enough to read.
   ============================================================ */
import { ROUTE_BY_ID, boardTime } from './routes.js';

/** How long a line of announcement hangs about before the next one. */
export const LINE_SECONDS = 4.2;

export const CALL = {
  BOARDING: 'boarding',
  FINAL: 'final',
  ARRIVED: 'arrived',
  DELAY: 'delay',
  CLOSING: 'closing',
  LOST: 'lost',
};

/**
 * Build what the clerk reads out.
 *
 * Every one of these is assembled from a manifest, so the route, the
 * bay and the time are the building's own and cannot drift from it.
 */
export function announcement(kind, m, extra) {
  const r = m && ROUTE_BY_ID.get(m.route);
  const name = r ? titleCase(r.name) : 'service';
  const time = m ? boardTime(m.depart) : '';
  const via = r ? r.stops.slice(0, -1).map((s) => s.name) : [];
  switch (kind) {
    case CALL.BOARDING:
      return [
        `Georgia Coach Lines announces the departure of the ${time} to ${name},`,
        via.length ? `calling at ${list(via)}.` : 'non-stop.',
        `Now boarding at bay ${m.bay}.`,
      ];
    case CALL.FINAL:
      return [
        `Final call for the ${time} to ${name}, bay ${m.bay}.`,
        'All aboard, please.',
      ];
    case CALL.ARRIVED:
      return [
        `The ${time} from ${name} is now arriving at bay ${m.bay}.`,
        'Baggage will be unloaded at the bay.',
      ];
    case CALL.DELAY:
      return [
        `The ${time} to ${name} is running approximately ${extra || 'fifteen'} minutes late.`,
        'We apologize for the delay.',
      ];
    case CALL.CLOSING:
      return [
        'The ticket window will close at one o’clock.',
        'The waiting room closes with it.',
      ];
    case CALL.LOST:
      return [
        `Would the owner of ${extra || 'a piece of luggage'} please come to the ticket counter.`,
      ];
    default:
      return [];
  }
}

const titleCase = (s) => String(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const list = (a) => (a.length === 1 ? a[0]
  : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/* ============================================================
   THE AMPLIFIER
   ============================================================ */
export class PublicAddress {
  /**
   * @param opt { powered: () => boolean, onLine(text), onStart, onEnd }
   */
  constructor(opt = {}) {
    this.opt = opt;
    /** Lines still to read out. */
    this.pending = [];
    this.current = null;
    this.t = 0;
    /** Everything said tonight, for the shift log. */
    this.said = [];
  }

  get live() { return this.opt.powered ? !!this.opt.powered() : true; }
  get busy() { return !!this.current || this.pending.length > 0; }

  /**
   * Make an announcement. Returns false if the amplifier is dead,
   * which is the interesting case and the reason this returns anything.
   */
  say(kind, manifest, extra) {
    if (!this.live) return false;
    const lines = announcement(kind, manifest, extra);
    if (!lines.length) return false;
    this.pending.push(...lines);
    this.said.push({ kind, id: manifest ? manifest.id : null });
    if (this.opt.onStart && !this.current) this.opt.onStart();
    return true;
  }

  /** Stop mid-sentence, which is what pulling the breaker does. */
  cut() {
    this.pending.length = 0;
    this.current = null;
    this.t = 0;
  }

  update(dt) {
    if (!this.live) { if (this.busy) this.cut(); return; }
    if (this.current) {
      this.t -= dt;
      if (this.t > 0) return;
      this.current = null;
      if (!this.pending.length && this.opt.onEnd) this.opt.onEnd();
    }
    if (!this.current && this.pending.length) {
      this.current = this.pending.shift();
      this.t = LINE_SECONDS;
      if (this.opt.onLine) this.opt.onLine(this.current);
    }
  }

  save() { return { said: this.said.slice(-32) }; }
  restore(d) { this.said = (d && d.said) || []; this.cut(); return true; }
}

/* ============================================================
   THE TELEPHONE

   An ordinary desk phone that rings about ordinary things. Every call
   in the pool is something a night clerk in 1998 got: a driver on a
   payphone, a dispatcher in another city, somebody's mother. The phone
   is on the clerk's breaker too, because it is a 1998 office phone with
   a power brick on the answering machine -- the line itself would work
   in a blackout, which is a detail worth keeping for later and not
   worth explaining now.
   ============================================================ */
export const CALLS = [
  {
    id: 'running-late', who: 'Dispatch, Macon',
    text: 'Twenty-two oh-seven is twenty minutes down out of Milledgeville. Hold the connection if you can.',
    needs: 'delay',
  },
  {
    id: 'driver-payphone', who: 'a driver on a payphone',
    text: 'I am at the Amoco on Deans Bridge. Tell them I am ten minutes out.',
  },
  {
    id: 'left-a-bag', who: 'a woman in Waynesboro',
    text: 'My husband left a brown case on the nine o’clock. Can you look?',
    needs: 'lost',
  },
  {
    id: 'what-time', who: 'somebody who will not give a name',
    text: 'What time does the last one to Atlanta go?',
  },
  {
    id: 'meeting-it', who: 'a man meeting the Savannah',
    text: 'Is it in yet? I am still on Walton Way.',
  },
  {
    id: 'head-office', who: 'the district office, Columbia',
    text: 'Your day sheet for Monday is two dollars out. It can wait until morning.',
  },
  {
    id: 'wrong-number', who: 'a wrong number',
    text: 'Is that the Sanitation Department?',
  },
  {
    id: 'parcel-query', who: 'a shipper in Aiken',
    text: 'Did a carton for Orangeburg go out on the eight-forty?',
    needs: 'parcel',
  },
];

export class Telephone {
  /** @param opt { powered, onRing, onAnswer, r } */
  constructor(opt = {}) {
    this.opt = opt;
    this.ringing = null;
    this.t = 0;
    this.taken = [];
    this.missed = 0;
    this.r = opt.r || Math.random;
    this._pool = CALLS.slice();
  }

  get live() { return this.opt.powered ? !!this.opt.powered() : true; }

  /** Ring. Nothing happens if the desk has no power. */
  ring(id) {
    if (!this.live || this.ringing) return false;
    const call = id
      ? CALLS.find((c) => c.id === id)
      : this._pool[Math.floor(this.r() * this._pool.length)];
    if (!call) return false;
    this._pool = this._pool.filter((c) => c !== call);
    if (!this._pool.length) this._pool = CALLS.slice();
    this.ringing = call;
    this.t = 0;
    if (this.opt.onRing) this.opt.onRing(call);
    return true;
  }

  /** Pick it up. */
  answer() {
    if (!this.ringing) return null;
    const c = this.ringing;
    this.ringing = null;
    this.taken.push(c.id);
    if (this.opt.onAnswer) this.opt.onAnswer(c);
    return c;
  }

  update(dt) {
    if (!this.ringing) return;
    if (!this.live) { this.ringing = null; return; }
    this.t += dt;
    /* Eight rings and they hang up, which is about thirty seconds. */
    if (this.t > 30) { this.ringing = null; this.missed++; }
  }

  save() { return { taken: this.taken.slice(-16), missed: this.missed }; }

  restore(d) {
    this.taken = (d && d.taken) || [];
    this.missed = (d && d.missed) || 0;
    this.ringing = null;
    return true;
  }
}
