/* ============================================================
   crowd.js -- the people in the building, and the line they stand in.

   WHAT A PASSENGER IS: an Npc from npc.js, a request rolled out of
   people.js, and a small state machine that walks them from the front
   doors to a coach. Nothing in here knows what a fare is or how a
   ticket is printed; it knows where somebody is standing and what they
   are waiting for. The window is service.js's business and the coach
   is fleet.js's.

   THE LINE IS THE WHOLE INTERFACE. Everything the player does at the
   counter happens to whoever is at the front of it, and everybody
   behind them can see how long it is taking. That is the entire
   pressure model of this shift and it needs no timer on the screen:

     one person at the window, five behind, and the Savannah is called
     in four minutes.

   PATIENCE IS NOT A FAIL STATE. Somebody who has stood too long sighs,
   asks how much longer, and eventually goes and sits down -- and then
   has to be served anyway, later, when there is even less time. The
   brief is explicit that this stage is not about threat, and a line
   that punishes you is a different game. What running late costs here
   is that the work piles up, which is what it costs in a real one.

   NOTHING IN THIS FILE IS STRANGE. Every behavior is somebody being
   ordinary in a bus station.
   ============================================================ */
import { Npc } from '../npc.js';
import { rollPassenger, paymentFor, rng } from './people.js';

export const PSTATE = {
  ENTERING: 'entering',
  LINING: 'lining',
  WINDOW: 'window',
  DONE: 'done',
  SEATED: 'seated',
  CALLED: 'called',
  PLATFORM: 'platform',
  ABOARD: 'aboard',
  LEAVING: 'leaving',
  GONE: 'gone',
};

/** How close to their spot before they stop shuffling. */
const CLOSE = 0.35;

/* ============================================================
   ONE PERSON
   ============================================================ */
export class Passenger {
  /**
   * @param spec { id, req, at: {x,y,z}, skin }
   */
  constructor(spec) {
    this.id = spec.id;
    /** What they want -- see people.js rollPassenger. */
    this.req = spec.req;
    this.state = PSTATE.ENTERING;
    this.stateT = 0;
    /** Seconds they have spent standing about waiting for somebody. */
    this.waited = 0;
    /** Set once they are holding one. */
    this.ticket = null;
    this.checks = [];
    /** Where they are sitting, if they are. */
    this.seat = null;
    /** Their place in the line, or -1. */
    this.place = -1;
    /** Said out loud when the player looks at them. */
    this.says = spec.req.line || '';
    /** Bumped when they have asked how much longer. */
    this.grumbles = 0;

    this.npc = new Npc({
      id: `pax:${spec.id}`,
      name: spec.req.who,
      x: spec.at.x, y: spec.at.y, z: spec.at.z,
      yaw: spec.at.yaw || 0,
      speed: spec.req.patience < 50 ? 1.45 : 1.15,
      states: {},
      state: null,
    });
    this.npc.skin = spec.skin === undefined ? 0 : spec.skin;
    this.npc.owner = this;
  }

  get x() { return this.npc.x; }
  get z() { return this.npc.z; }
  get arrived() { return this.npc.arrived; }
  get hidden() { return this.npc.hidden; }

  goTo(p, ctx) { this.npc.goTo(p.x, p.y === undefined ? this.npc.y : p.y, p.z, ctx); }

  setState(s) { this.state = s; this.stateT = 0; }

  /** What the player reads when they look at them. */
  describe() {
    switch (this.state) {
      case PSTATE.WINDOW: return { text: this.req.who, sub: this.says };
      case PSTATE.LINING:
        return {
          text: this.req.who,
          sub: this.grumbles ? 'looking at the clock' : `${this.place + 1} in line`,
        };
      case PSTATE.SEATED:
        return {
          text: this.req.who,
          sub: this.ticket ? `waiting for the ${destOf(this)}` : 'sitting down',
        };
      case PSTATE.PLATFORM:
        return { text: this.req.who, sub: 'ticket out, waiting to get on' };
      default: return { text: this.req.who, sub: '' };
    }
  }

  save() {
    return {
      id: this.id, req: this.req, s: this.state, w: this.waited,
      t: this.ticket ? this.ticket.serial : null,
      c: this.checks.map((k) => k.claim),
      seat: this.seat, place: this.place, g: this.grumbles,
      x: this.npc.x, y: this.npc.y, z: this.npc.z, yaw: this.npc.yaw,
      k: this.npc.skin,
    };
  }
}

const destOf = (p) => (p.ticket ? p.ticket.to : (p.req.to || ''));

/* ============================================================
   THE CROWD
   ============================================================ */
export class Crowd {
  /**
   * @param level the built level -- reads marks.service and marks.waiting
   * @param opt   { book, onWindow(passenger), onLeave(passenger),
   *                onGrumble(passenger), skins }
   */
  constructor(level, opt = {}) {
    this.level = level;
    this.opt = opt;
    const m = level.marks || {};
    this.places = m.service || null;
    this.waiting = m.waiting || null;
    this.arrivals = m.arrivals || null;
    /** Everybody in the building, in the order they arrived. */
    this.people = [];
    /** The line, front first. */
    this.line = [];
    this.nextId = 1;
    this.r = rng(opt.seed || 20481998);
    this.skins = opt.skins || 1;
    /** Seats already taken, by index into the seat list. */
    this._taken = new Set();
  }

  get enabled() { return !!this.places; }

  /** Whoever is at the window right now, or null. */
  get atWindow() {
    const p = this.line[0];
    return p && p.state === PSTATE.WINDOW ? p : null;
  }

  get lineLength() { return this.line.length; }

  person(id) { return this.people.find((p) => p.id === id) || null; }

  /* ---------------- arriving ---------------- */

  /**
   * Somebody comes in off Telfair Street.
   * @param spec { archetype, route } -- both optional; rolled otherwise
   */
  arrive(spec = {}, ctx) {
    if (!this.places) return null;
    const req = spec.req || rollPassenger({
      archetype: spec.archetype, route: spec.route, r: this.r,
    });
    if (!req) return null;
    const at = { ...this.places.outside, y: 0, yaw: 0 };
    const p = new Passenger({
      id: this.nextId++, req, at,
      skin: Math.floor(this.r() * this.skins),
    });
    this.people.push(p);
    p.goTo(this.places.entrance, ctx);
    return p;
  }

  /* ---------------- the line ---------------- */

  join(p, ctx) {
    if (p.place >= 0) return;
    p.place = this.line.length;
    this.line.push(p);
    p.setState(PSTATE.LINING);
    this._sendToPlace(p, ctx);
  }

  _placePoint(i) {
    const line = this.places.line;
    if (i <= 0) return this.places.window;
    return line[Math.min(i - 1, line.length - 1)];
  }

  _sendToPlace(p, ctx) {
    p.goTo(this._placePoint(p.place), ctx);
  }

  /** Move everybody up one. Called when the front of the line leaves. */
  shuffle(ctx) {
    for (let i = 0; i < this.line.length; i++) {
      const p = this.line[i];
      if (p.place === i) continue;
      p.place = i;
      this._sendToPlace(p, ctx);
      if (i > 0) p.setState(PSTATE.LINING);
    }
  }

  /** The front of the line is done with; they go and sit down. */
  release(p, ctx) {
    const i = this.line.indexOf(p);
    if (i >= 0) this.line.splice(i, 1);
    p.place = -1;
    p.waited = 0;
    if (p.req.sits && (p.ticket || p.req.want === 'meet')) {
      this._seat(p, ctx);
    } else {
      p.setState(PSTATE.LEAVING);
      p.goTo(this.places.outside, ctx);
    }
    this.shuffle(ctx);
    return p;
  }

  /* ---------------- sitting down ---------------- */

  _seatList(p) {
    const meeting = p.req.want === 'meet';
    const room = meeting ? this.arrivals : this.waiting;
    return (room && room.seats && room.seats.length) ? room.seats : this.places.seats;
  }

  _seat(p, ctx) {
    const seats = this._seatList(p);
    let idx = -1;
    for (let i = 0; i < seats.length; i++) {
      const key = `${seats === this.places.seats ? 'l' : 'w'}${i}`;
      if (this._taken.has(key)) continue;
      this._taken.add(key);
      p.seat = { key, ...seats[i] };
      idx = i;
      break;
    }
    if (idx < 0) {
      /* Standing room. A terminal at eleven o'clock has some. */
      p.seat = null;
      p.setState(PSTATE.SEATED);
      return;
    }
    p.setState(PSTATE.DONE);
    p.goTo(p.seat, ctx);
  }

  _unseat(p) {
    if (p.seat && p.seat.key) this._taken.delete(p.seat.key);
    p.seat = null;
  }

  /* ---------------- the platform ---------------- */

  /**
   * The PA has called a departure. Everybody holding a ticket for it
   * gets up and goes.
   *
   * @param route the route id
   * @param at    where to send them -- the bay's boarding point
   * @returns how many stood up
   */
  call(route, at, ctx) {
    let n = 0;
    for (const p of this.people) {
      if (p.state !== PSTATE.SEATED && p.state !== PSTATE.DONE) continue;
      if (!p.ticket || p.ticket.route !== route) continue;
      this._unseat(p);
      p.setState(PSTATE.CALLED);
      p.data = at;
      p.goTo(at, ctx);
      n++;
    }
    return n;
  }

  /** Everybody standing at a coach door waiting to be let on. */
  atPlatform(route) {
    return this.people.filter((p) => p.state === PSTATE.PLATFORM
      && p.ticket && p.ticket.route === route);
  }

  /** They are on. Off the floor, out of the way. */
  board(p) {
    p.setState(PSTATE.ABOARD);
    p.npc.hidden = true;
    this._unseat(p);
    return p;
  }

  /** Whoever came in off an arrival and is walking through the lobby. */
  disembark(n, at, ctx) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const req = rollPassenger({ archetype: 'waiting', r: this.r });
      req.want = 'nothing';
      req.sits = false;
      const p = new Passenger({
        id: this.nextId++, req, at: { ...at, y: at.y || 0 },
        skin: Math.floor(this.r() * this.skins),
      });
      p.setState(PSTATE.LEAVING);
      this.people.push(p);
      p.goTo(this.places.outside, ctx);
      out.push(p);
    }
    return out;
  }

  /* ---------------- the loop ---------------- */

  update(dt, ctx) {
    for (const p of this.people) {
      p.stateT += dt;
      switch (p.state) {
        case PSTATE.ENTERING:
          if (p.arrived) this.join(p, ctx);
          break;

        case PSTATE.LINING:
          if (p.place === 0 && p.arrived) {
            p.setState(PSTATE.WINDOW);
            p.npc.faceTowards(this.places.window.x, this.places.window.z + 1, 1);
            if (this.opt.onWindow) this.opt.onWindow(p);
          } else {
            p.waited += dt;
            this._maybeGrumble(p, ctx);
          }
          break;

        case PSTATE.WINDOW:
          p.waited += dt;
          this._maybeGrumble(p, ctx);
          break;

        case PSTATE.DONE:
          if (p.arrived) {
            p.setState(PSTATE.SEATED);
            if (p.seat) p.npc.yaw = p.seat.yaw || p.npc.yaw;
          }
          break;

        case PSTATE.SEATED:
          p.waited += dt;
          break;

        case PSTATE.CALLED:
          if (p.arrived) p.setState(PSTATE.PLATFORM);
          break;

        case PSTATE.PLATFORM:
          p.waited += dt;
          break;

        case PSTATE.LEAVING:
          if (p.arrived) {
            p.setState(PSTATE.GONE);
            p.npc.hidden = true;
            if (this.opt.onLeave) this.opt.onLeave(p);
          }
          break;

        default:
          break;
      }
      p.npc.update(dt, ctx);
    }
    /* Anybody gone is off the books, so the night does not grow. */
    if (this.people.length > 24) this.sweep();
  }

  _maybeGrumble(p, ctx) {
    const limit = p.req.patience * (p.grumbles + 1);
    if (p.waited < limit) return;
    p.grumbles++;
    if (this.opt.onGrumble) this.opt.onGrumble(p);
    /* Twice is a sigh. Three times and they go and sit down, and you
       have to deal with them later with less time than you have now. */
    if (p.grumbles >= 3 && p.place > 0) {
      const i = this.line.indexOf(p);
      if (i > 0) {
        this.line.splice(i, 1);
        p.place = -1;
        p.waited = 0;
        this._seat(p, ctx);
        this.shuffle(ctx);
      }
    }
  }

  sweep() {
    const before = this.people.length;
    this.people = this.people.filter((p) => p.state !== PSTATE.GONE
      && p.state !== PSTATE.ABOARD);
    return before - this.people.length;
  }

  /** Everybody who is visible, for the draw loop. */
  actors() {
    const out = [];
    for (const p of this.people) if (!p.npc.hidden) out.push(p.npc);
    return out;
  }

  /* ---------------- persistence ---------------- */

  save() {
    return {
      next: this.nextId,
      people: this.people.filter((p) => p.state !== PSTATE.GONE).map((p) => p.save()),
      line: this.line.map((p) => p.id),
    };
  }

  restore(d, book, ctx) {
    if (!d) return false;
    this.people.length = 0;
    this.line.length = 0;
    this._taken.clear();
    this.nextId = d.next || 1;
    for (const r of d.people || []) {
      const p = new Passenger({
        id: r.id, req: r.req,
        at: { x: r.x, y: r.y, z: r.z, yaw: r.yaw },
        skin: r.k,
      });
      p.state = r.s;
      p.waited = r.w || 0;
      p.grumbles = r.g || 0;
      p.place = r.place === undefined ? -1 : r.place;
      p.seat = r.seat || null;
      if (p.seat && p.seat.key) this._taken.add(p.seat.key);
      if (book && r.t) p.ticket = book.ticket(r.t);
      if (book) p.checks = (r.c || []).map((c) => book.bag(c)).filter(Boolean);
      if (p.state === PSTATE.ABOARD || p.state === PSTATE.GONE) p.npc.hidden = true;
      this.people.push(p);
    }
    for (const id of d.line || []) {
      const p = this.person(id);
      if (p) this.line.push(p);
    }
    /* Put everybody back on their feet: a save reloads into a building
       where nobody is mid-stride. */
    for (const p of this.people) {
      if (p.state === PSTATE.LINING || p.state === PSTATE.WINDOW) this._sendToPlace(p, ctx);
      else if (p.state === PSTATE.DONE && p.seat) p.goTo(p.seat, ctx);
      else if (p.state === PSTATE.CALLED && p.data) p.goTo(p.data, ctx);
    }
    return true;
  }
}

/** What a passenger hands over when the register asks. See people.js. */
export function offerOf(p, total, r) { return paymentFor(p.req, total, r); }
