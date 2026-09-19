/* ============================================================
   service.js -- selling a ticket, which is the job.

   THE BRIEF SAYS: not "press E and a ticket appears", and also not
   tedious. What is in between is the shape of the real transaction,
   and the real transaction has five moves in it:

     1  SERVE     somebody steps up and says where they are going.
                  They do not say the fare and they do not always say
                  it clearly.
     2  QUOTE     you look it up and tell them. This is the step that
                  makes the fare card furniture rather than decoration.
     3  TAKE      they hand you money, usually the wrong shape of it.
     4  CHANGE    you count it back out of the drawer you counted in.
     5  ISSUE     you print it and hand it over.

   Five presses a passenger, at four different places behind one
   counter, with a different question on the prompt each time. Fast
   once you know it and impossible to do on autopilot, which is what
   "not tedious" and "not press E" mean together.

   BAGGAGE IS CHECKED AT THE SAME WINDOW and moves by the cart-load,
   not the bag. A passenger with two cases gets two claim checks here
   and the cases go on the trolley behind the counter; getting them to
   the coach is ONE action per departure at the staging square and ONE
   at the bay. The brief is explicit that the player is not to drag
   every bag a hundred and fifty feet, and this is how: the paperwork
   is per passenger because that is the part with judgement in it, and
   the carrying is per coach because that part is just carrying.

   NOTHING HERE KNOWS WHAT A PASSENGER IS. A request is four fields
   and a promise to be told when it is finished. People are npc.js's
   business and they arrive in the next stage.
   ============================================================ */
import { fareFor, baggageFee, ROUTE_BY_ID, stopOn, FARE } from './routes.js';
import { money, sayChange, makeChange } from './money.js';

export const STEP = {
  IDLE: 'idle',
  ASKED: 'asked',
  QUOTED: 'quoted',
  PAID: 'paid',
  CHANGED: 'changed',
  PRINTED: 'printed',
};

/**
 * One transaction at the window.
 *
 * @param req {
 *   who,        a label for the prompt -- "the woman with the holdall"
 *   route, to,  where they are going
 *   cls,        adult | child | senior | military
 *   roundTrip,
 *   bags,       [lb, lb] -- what they want checked, if anything
 *   paid,       cents they hand over when asked
 *   onDone,     (result) => void
 * }
 */
export class Sale {
  constructor(req) {
    this.req = req;
    this.step = STEP.IDLE;
    /** Cents: the card price for what they asked for. */
    this.fare = 0;
    this.bagFee = 0;
    /** What the clerk actually quoted, which may not be the card. */
    this.quoted = 0;
    this.paid = 0;
    this.changeDue = 0;
    this.ticket = null;
    this.checks = [];
    /** Anything that went wrong, in the clerk's words. */
    this.trouble = '';
  }

  get route_() { return ROUTE_BY_ID.get(this.req.route) || null; }
  get total() { return this.quoted + this.bagFee; }

  /** What the passenger said, for the prompt at step one. */
  get asking() {
    const r = this.route_;
    const bits = [`${this.req.to || (r ? r.name : '?')}`];
    if (this.req.roundTrip) bits.push('return');
    if (this.req.cls && this.req.cls !== 'adult') bits.push(this.req.cls);
    if (this.req.bags && this.req.bags.length) {
      bits.push(`${this.req.bags.length} to check`);
    }
    return bits.join(', ');
  }

  /* ---------------- the five moves ---------------- */

  /** 1. They step up and say it. */
  serve() {
    if (this.step !== STEP.IDLE) return false;
    this.fare = fareFor(this.req);
    this.bagFee = baggageFee(this.req.bags || []);
    this.step = STEP.ASKED;
    if (!this.fare) this.trouble = 'we do not go there on that road';
    return true;
  }

  /**
   * 2. You look it up and say the price.
   *
   * @param cents what the clerk quotes. Omitted means the card price,
   *              which is what the station does; a different number is
   *              a clerk who has read the wrong line, and the shift
   *              reconciliation at one o'clock will find it.
   */
  quote(cents) {
    if (this.step !== STEP.ASKED || !this.fare) return false;
    this.quoted = cents === undefined ? this.fare : Math.max(0, Math.round(cents));
    this.step = STEP.QUOTED;
    return true;
  }

  /** 3. They pay. Returns false if they are short. */
  take() {
    if (this.step !== STEP.QUOTED) return false;
    const offered = this.req.paid === undefined ? this.total : this.req.paid;
    if (offered < this.total) { this.trouble = 'they are short'; return false; }
    this.paid = offered;
    this.changeDue = offered - this.total;
    this.step = STEP.PAID;
    return true;
  }

  /**
   * 4. Count it back. Needs a drawer that can actually make it.
   * @returns { ok, parts, short }
   */
  change(drawer) {
    if (this.step !== STEP.PAID) return { ok: false, parts: [], short: 0 };
    const r = drawer ? drawer.change(this.changeDue) : makeChange(this.changeDue);
    if (!r.ok) { this.trouble = `short of change by ${money(r.short)}`; return r; }
    this.step = STEP.CHANGED;
    return r;
  }

  /** 5. Print it, and the claim checks with it. */
  issue(book, now) {
    if (this.step !== STEP.CHANGED) return null;
    this.ticket = book.issue({
      route: this.req.route, to: this.req.to, cls: this.req.cls,
      roundTrip: this.req.roundTrip, fare: this.quoted,
      issued: now, holder: this.req.who,
    });
    for (const lb of this.req.bags || []) {
      this.checks.push(book.check({
        route: this.req.route, to: this.req.to, weight: lb,
        fee: 0, issued: now, holder: this.req.who, where: 'desk',
      }));
    }
    /* The baggage charge rides on the ticket, not on each tag: one
       line on the day sheet, which is how the desk did it. */
    if (this.checks.length && this.bagFee) this.checks[0].fee = this.bagFee;
    this.step = STEP.PRINTED;
    return this.ticket;
  }

  /** And hand it over, which is the end of it. */
  finish() {
    if (this.step !== STEP.PRINTED) return null;
    const out = {
      ticket: this.ticket,
      checks: this.checks.slice(),
      took: this.paid,
      gave: this.changeDue,
      overOrUnder: this.quoted - this.fare,
    };
    this.step = STEP.IDLE;
    if (this.req.onDone) this.req.onDone(out);
    return out;
  }

  /** Somebody walks off, or the clerk voids it. Nothing is kept. */
  abandon() {
    this.step = STEP.IDLE;
    this.trouble = '';
    return this;
  }

  /* ---------------- what the prompt says ---------------- */

  /**
   * The line on the window, for whichever station the player is
   * looking at. Returns null when that station has nothing to do.
   */
  promptAt(station, drawer) {
    switch (station) {
      case 'window':
        if (this.step === STEP.IDLE) return null;
        if (this.step === STEP.ASKED) {
          return this.fare
            ? { text: `Quote the fare — ${money(this.fare)}`, sub: this.asking }
            : { text: 'Tell them we do not go there', sub: this.asking };
        }
        if (this.step === STEP.PRINTED) {
          return {
            text: 'Hand over the ticket',
            sub: this.checks.length
              ? `and ${this.checks.length} claim check${this.checks.length === 1 ? '' : 's'}`
              : this.ticket.text,
          };
        }
        return { text: 'Serving', sub: this.asking };
      case 'register':
        if (this.step === STEP.QUOTED) {
          const offered = this.req.paid === undefined ? this.total : this.req.paid;
          return { text: `Take ${money(offered)}`, sub: `${money(this.total)} due` };
        }
        if (this.step === STEP.PAID) {
          const r = drawer ? drawer.change(this.changeDue) : makeChange(this.changeDue);
          return r.ok
            ? { text: `Count out ${money(this.changeDue)}`, sub: sayChange(r.parts) }
            : { text: 'No change in the drawer', sub: `short ${money(r.short)}` };
        }
        return null;
      case 'printer':
        if (this.step !== STEP.CHANGED) return null;
        return {
          text: 'Print the ticket',
          sub: `${this.route_ ? this.route_.name : '?'} / ${this.req.to}`,
        };
      default:
        return null;
    }
  }
}

/* ============================================================
   THE BAGGAGE THAT IS WAITING

   Two helpers, and they are the whole of why the player is not
   carrying suitcases one at a time: everything moves by route, in
   one action, and the state a bag is in is a word on its claim check.
   ============================================================ */

/** Every check in the book for a route, at a given stage. */
export function bagsFor(book, route, where) {
  const out = [];
  for (const b of book.checks.values()) {
    if (b.route !== route) continue;
    if (where && b.where !== where) continue;
    out.push(b);
  }
  return out;
}

/**
 * Move a route's bags one stage along.
 * @returns how many moved
 */
export function moveBags(book, route, from, to) {
  let n = 0;
  for (const b of bagsFor(book, route, from)) { b.where = to; n++; }
  return n;
}

/** What the baggage charge would be, said the way the desk says it. */
export function bagLine(weights) {
  const w = weights || [];
  if (!w.length) return 'nothing to check';
  const fee = baggageFee(w);
  const heavy = w.filter((lb) => lb > FARE.heavyOver).length;
  const bits = [`${w.length} piece${w.length === 1 ? '' : 's'}`];
  if (w.length > FARE.freeBags) bits.push(`${w.length - FARE.freeBags} over the allowance`);
  if (heavy) bits.push(`${heavy} over fifty pounds`);
  return `${bits.join(', ')} — ${fee ? money(fee) : 'no charge'}`;
}

/** Does this route serve that town at all. */
export const goesTo = (route, to) => !!stopOn(route, to);
