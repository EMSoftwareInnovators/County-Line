/* ============================================================
   manifest.js -- what is supposed to be on a coach, and what boarding
   actually checks.

   A MANIFEST IS THE DEPARTURE'S PAPERWORK and it is the join between
   every other system in here: the schedule made it, the ticket counter
   fills the passenger side of it, the baggage room fills the other,
   the driver signs it, and it is the thing the player closes out. A
   departure with no manifest is a coach that left and nobody knows
   who was on it, which in 1998 was a phone call from Atlanta at two in
   the morning.

   BOARDING IS A LOOKUP, NOT A SCRIPT. A ticket is good for a departure
   if it is for this route, it has not been lifted, it has not been
   voided, and the coach has not gone. Everything the door does is one
   of those four failing, and each one has its own answer -- which is
   what makes standing at the door a job rather than a cutscene:

     WRONG ROUTE      the eleven-forty is the Savannah. Yours is the
                      Macon, at half ten, bay three.
     ALREADY LIFTED   this one has been taken. Somebody has it.
     VOIDED           this was refunded at the window.
     GONE             that coach left twenty minutes ago.
   ============================================================ */
import { ROUTE_BY_ID, clockAt } from './routes.js';

export const BOARD = {
  OK: 'ok',
  WRONG_ROUTE: 'wrong-route',
  LIFTED: 'already-lifted',
  VOIDED: 'voided',
  GONE: 'gone',
  NOT_OPEN: 'not-boarding',
  UNKNOWN: 'no-such-ticket',
};

export class Manifest {
  /**
   * @param spec { id, route, bay, depart (minutes), driver, coach }
   */
  constructor(spec) {
    this.id = spec.id;
    this.route = spec.route;
    this.bay = spec.bay;
    this.depart = spec.depart;
    this.driver = spec.driver || '';
    /** The coach id once one is standing at the bay. */
    this.coach = spec.coach || null;
    /** Ticket serials lifted at the door, in the order they boarded. */
    this.boarded = [];
    /** Claim numbers loaded into the bays. */
    this.loaded = [];
    /** 'pending' | 'boarding' | 'closed' | 'departed' */
    this.state = 'pending';
    this.signed = false;
    /** Anything the clerk wrote on it. */
    this.notes = [];
  }

  get route_() { return ROUTE_BY_ID.get(this.route) || null; }
  get time() { return clockAt(this.depart); }

  /** The line this departure gets on the board. */
  boardLine() {
    const r = this.route_;
    return {
      time: this.time,
      name: r ? r.name : '?',
      bay: this.bay,
      status: this.state === 'departed' ? 'DEPARTED'
        : this.state === 'boarding' ? 'NOW BOARDING'
          : this.state === 'closed' ? 'CLOSED' : 'ON TIME',
    };
  }

  open() { if (this.state === 'pending') this.state = 'boarding'; return this; }
  close() { if (this.state === 'boarding') this.state = 'closed'; return this; }

  /**
   * Can this ticket get on? Answers, it does not act.
   * @returns one of BOARD
   */
  check(ticket) {
    if (!ticket) return BOARD.UNKNOWN;
    if (this.state === 'departed') return BOARD.GONE;
    if (this.state !== 'boarding') return BOARD.NOT_OPEN;
    if (ticket.voided) return BOARD.VOIDED;
    if (ticket.lifted) return BOARD.LIFTED;
    if (ticket.route !== this.route) return BOARD.WRONG_ROUTE;
    return BOARD.OK;
  }

  /** Lift it. Returns the same answers as check, and only acts on OK. */
  lift(ticket) {
    const r = this.check(ticket);
    if (r !== BOARD.OK) return r;
    ticket.lifted = true;
    ticket.departure = this.id;
    this.boarded.push(ticket.serial);
    return BOARD.OK;
  }

  /** Put a checked bag in the bays. */
  load(bagCheck) {
    if (!bagCheck || this.state === 'departed') return false;
    if (bagCheck.route !== this.route) return false;
    if (this.loaded.includes(bagCheck.claim)) return false;
    bagCheck.where = 'loaded';
    bagCheck.departure = this.id;
    this.loaded.push(bagCheck.claim);
    return true;
  }

  note(text) { this.notes.push(text); return this; }

  /**
   * What is wrong with this manifest, if anything, in the words the
   * clerk would use. Empty means the driver can sign it.
   */
  problems(book) {
    const out = [];
    if (!this.coach) out.push('no coach at the bay');
    if (!this.boarded.length && !this.loaded.length) out.push('nobody and nothing on it');
    for (const claim of this.loaded) {
      const b = book && book.bag(claim);
      if (b && b.route !== this.route) out.push(`bag ${claim} is not going this way`);
    }
    return out;
  }

  /**
   * The driver signs for what is on his coach.
   *
   * HE SIGNS WHILE IT IS STILL BOARDING, not after. A manifest that
   * could only be signed once boarding had CLOSED meant that signing
   * it closed it, which meant the bay stopped offering to take
   * anybody's ticket the moment the paperwork was done -- six people
   * stood on a platform beside an open coach door for ten minutes and
   * the headless playtest counted them every time. Signing is a
   * signature. Closing is closing.
   */
  sign() {
    if (this.state !== 'boarding' && this.state !== 'closed') return false;
    this.signed = true;
    return true;
  }

  depart_() {
    this.state = 'departed';
    return this;
  }

  save() {
    return {
      id: this.id, r: this.route, b: this.bay, d: this.depart,
      dr: this.driver, c: this.coach, s: this.state,
      bo: this.boarded.slice(), lo: this.loaded.slice(),
      sg: this.signed ? 1 : 0, n: this.notes.slice(),
    };
  }

  static load(d) {
    const m = new Manifest({
      id: d.id, route: d.r, bay: d.b, depart: d.d, driver: d.dr, coach: d.c,
    });
    m.state = d.s;
    m.boarded = Array.isArray(d.bo) ? d.bo.slice() : [];
    m.loaded = Array.isArray(d.lo) ? d.lo.slice() : [];
    m.signed = !!d.sg;
    m.notes = Array.isArray(d.n) ? d.n.slice() : [];
    return m;
  }
}

/** What the door says when a ticket does not work. */
export function boardingReason(result, manifest, other) {
  switch (result) {
    case BOARD.OK: return '';
    case BOARD.WRONG_ROUTE:
      return other
        ? `That is the ${other.route_ ? other.route_.name : 'other'} — ${other.time}, bay ${other.bay}.`
        : 'That ticket is not for this coach.';
    case BOARD.LIFTED: return 'This one has already been taken.';
    case BOARD.VOIDED: return 'This was refunded at the window.';
    case BOARD.GONE: return `The ${manifest ? manifest.time : 'that'} has gone.`;
    case BOARD.NOT_OPEN: return 'Not boarding yet.';
    default: return 'That is not one of ours.';
  }
}
