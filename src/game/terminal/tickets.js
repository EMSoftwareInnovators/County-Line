/* ============================================================
   tickets.js -- physical tickets, physical claim checks, and the
   serial numbers that make them physical.

   A TICKET IS AN OBJECT, NOT A FLAG. It has a serial off a numbered
   roll, a route, a destination, a class, a fare and a time it was
   printed, and once it is printed it exists whether or not anybody
   gets on a coach with it. That matters for three reasons the brief
   asks for and one it does not:

     a passenger can be holding one while standing in the wrong line;
     a manifest is a list of serials, so boarding is a lookup;
     a refund is a void against a serial;

   and, later, a ticket that is in the book but not in anybody's hand
   is a thing somebody can find. Not tonight.

   THE SERIALS ARE A ROLL. Tickets come off one roll and baggage checks
   off another, both numbered, both continuing across a save, because a
   terminal that starts at 00001 every night is a terminal nobody has
   ever worked in. The prefix is the company's and the year.
   ============================================================ */
import { ROUTE_BY_ID, fareFor, CLASS_BY_ID, stopOn } from './routes.js';

export const TICKET_PREFIX = 'GCL';
export const BAG_PREFIX = 'GC';

/** Where tonight's rolls start. Somebody has been selling tickets here
    since August and the numbers say so. */
export const ROLL_START = { ticket: 41883, bag: 17204 };

export class Ticket {
  constructor(spec) {
    this.serial = spec.serial;
    this.route = spec.route;
    this.to = spec.to;
    this.cls = spec.cls || 'adult';
    this.roundTrip = !!spec.roundTrip;
    /** Cents. What was actually charged, which is not always the card. */
    this.fare = spec.fare;
    /** Minutes after eight, from the shift clock. */
    this.issued = spec.issued === undefined ? 0 : spec.issued;
    /** The departure it is good for, once one exists. */
    this.departure = spec.departure || null;
    /** Set when it is taken at the door. */
    this.lifted = false;
    this.voided = false;
    /** Who is holding it, for the passenger it belongs to. */
    this.holder = spec.holder || null;
  }

  get route_() { return ROUTE_BY_ID.get(this.route) || null; }

  /** What is printed on it, as a human reads it out. */
  get text() {
    const r = this.route_;
    const c = CLASS_BY_ID.get(this.cls);
    return `${TICKET_PREFIX} ${this.serial} — ${r ? r.name : '?'} / ${this.to}`
      + `${this.roundTrip ? ' RT' : ''}${c && c.id !== 'adult' ? ` (${c.name})` : ''}`;
  }

  save() {
    return {
      s: this.serial, r: this.route, to: this.to, c: this.cls,
      rt: this.roundTrip ? 1 : 0, f: this.fare, i: this.issued,
      d: this.departure, l: this.lifted ? 1 : 0, v: this.voided ? 1 : 0,
      h: this.holder,
    };
  }

  static load(d) {
    const t = new Ticket({
      serial: d.s, route: d.r, to: d.to, cls: d.c, roundTrip: !!d.rt,
      fare: d.f, issued: d.i, departure: d.d, holder: d.h,
    });
    t.lifted = !!d.l;
    t.voided = !!d.v;
    return t;
  }
}

export class BaggageCheck {
  constructor(spec) {
    this.claim = spec.claim;
    this.route = spec.route;
    this.to = spec.to;
    /** Pounds. The scale reads whole pounds and so does the tag. */
    this.weight = spec.weight;
    this.fee = spec.fee || 0;
    this.issued = spec.issued === undefined ? 0 : spec.issued;
    this.holder = spec.holder || null;
    /** Where the bag itself is: 'desk', 'rack', 'staging', 'loaded',
        'delivered', 'unclaimed'. */
    this.where = spec.where || 'desk';
    this.departure = spec.departure || null;
  }

  get text() {
    return `${BAG_PREFIX} ${this.claim} — ${this.to}, ${this.weight} lb`;
  }

  save() {
    return {
      c: this.claim, r: this.route, to: this.to, w: this.weight,
      f: this.fee, i: this.issued, h: this.holder, p: this.where,
      d: this.departure,
    };
  }

  static load(d) {
    return new BaggageCheck({
      claim: d.c, route: d.r, to: d.to, weight: d.w, fee: d.f,
      issued: d.i, holder: d.h, where: d.p, departure: d.d,
    });
  }
}

/* ============================================================
   THE BOOKS
   ============================================================ */

export class TicketBook {
  constructor(start) {
    this.next = (start && start.ticket) || ROLL_START.ticket;
    this.nextBag = (start && start.bag) || ROLL_START.bag;
    /** Serial -> Ticket, everything printed tonight. */
    this.tickets = new Map();
    /** Claim -> BaggageCheck. */
    this.checks = new Map();
  }

  /**
   * Print one.
   *
   * @param spec { route, to, cls, roundTrip, issued, holder, fare }
   *        `fare` is optional: without it the card price is used, and
   *        with it the clerk has charged something else, which is a
   *        thing that has to be possible or the fare card is decoration.
   */
  issue(spec) {
    if (!stopOn(spec.route, spec.to)) return null;
    const fare = spec.fare === undefined ? fareFor(spec) : spec.fare;
    const t = new Ticket({ ...spec, fare, serial: this.next++ });
    this.tickets.set(t.serial, t);
    return t;
  }

  /** A claim check against a weighed bag. */
  check(spec) {
    const c = new BaggageCheck({ ...spec, claim: this.nextBag++ });
    this.checks.set(c.claim, c);
    return c;
  }

  ticket(serial) { return this.tickets.get(Number(serial)) || null; }
  bag(claim) { return this.checks.get(Number(claim)) || null; }

  /** A refund or a mistake. The serial stays used; that is the point. */
  void(serial) {
    const t = this.ticket(serial);
    if (!t || t.lifted) return false;
    t.voided = true;
    return true;
  }

  /** Everything sold tonight, in money. */
  takings() {
    let c = 0;
    for (const t of this.tickets.values()) if (!t.voided) c += t.fare;
    for (const b of this.checks.values()) c += b.fee;
    return c;
  }

  save() {
    return {
      next: this.next, nextBag: this.nextBag,
      t: [...this.tickets.values()].map((x) => x.save()),
      b: [...this.checks.values()].map((x) => x.save()),
    };
  }

  restore(d) {
    if (!d) return false;
    this.next = d.next || this.next;
    this.nextBag = d.nextBag || this.nextBag;
    this.tickets.clear();
    this.checks.clear();
    for (const r of d.t || []) { const t = Ticket.load(r); this.tickets.set(t.serial, t); }
    for (const r of d.b || []) { const b = BaggageCheck.load(r); this.checks.set(b.claim, b); }
    return true;
  }
}
