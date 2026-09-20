/* ============================================================
   shift.js -- one night at Richmond Central, from eight to one.

   THIS IS THE ONE FILE THAT KNOWS WHAT TIME IT IS. Everything else --
   the fare card, the drawer, the line, the coaches, the panel -- is a
   system that can be driven from anywhere. This is what drives them,
   in the order a Tuesday night drives them, and it is deliberately the
   only place where "at twenty-two thirty the Macon comes in" is
   written down.

   THE CLOCK. Five hours of terminal time in forty minutes of real
   time: seven and a half minutes a minute. That ratio is the whole
   design of the shift and it was chosen by working backwards from the
   brief's thirty-five to fifty. Five coaches at that rate leaves
   roughly six real minutes between departures -- long enough that a
   quiet stretch feels quiet, short enough that being behind on one
   coach is still being behind when the next one is called.

   THE SHAPE OF A NIGHT:

     20:00  OPENING. The night man has left the lobby lit and nothing
            else. You count the float, put the zones on, put the board
            up and unlock the doors. Four jobs, none of them explained,
            all of them findable -- which is how this game teaches
            itself.
     20:20  The first passengers. One coach out at 20:55.
     21:40  An arrival, and its driver wants coffee.
     22:30  The Macon comes in, turns, and goes back out as the
            Charleston at 23:05. This is the only time you are
            unloading and loading at once and it is the middle of the
            shift on purpose.
     23:45  The Savannah out.
     00:35  The last arrival.
     00:40  CLOSING. Cash up, write the log, zones off, punch out.

   ONE ERRAND UPSTAIRS, ONCE, at about ten past ten: the timetable
   forms have run out and the carton is in the old history room. That
   is the whole of the second floor's role tonight and the brief asks
   for exactly that.

   ONE BREAKER, ONCE. Nothing in this file trips it. The conveyor is
   twelve and a half amps, the coffee maker is seven and a half, the
   east wing's way is twenty, and the shift arranges for both to be
   running during the turnaround. The arithmetic in electrical.js does
   the rest, which is the difference between an event and a mechanic.

   NOTHING IN HERE IS STRANGE. No anomalies, no impossible calls, no
   altered clocks, no Route 117. It is a night shift.
   ============================================================ */
import { NIGHT, ROUTE_BY_ID, clockAt, boardTime } from './routes.js';
import { Drawer, OPENING_FLOAT, money } from './money.js';
import { TicketBook } from './tickets.js';
import { Manifest } from './manifest.js';
import { Sale, moveBags, bagsFor } from './service.js';
import { Crowd, PSTATE, offerOf } from './crowd.js';
import { CrewRoom, DSTATE } from './drivers.js';
import { PublicAddress, Telephone, CALL } from './pa.js';
import { IncidentPool } from './incidents.js';
import { rng, ARCHETYPES } from './people.js';
import { conversation } from './counter.js';
import { separate } from '../npc.js';

/** Terminal minutes per real second. 300 minutes in 40 real ones. */
export const RATE = 300 / (40 * 60);

export const PHASE = {
  BEFORE: 'before',
  OPENING: 'opening',
  RUNNING: 'running',
  CLOSING: 'closing',
  DONE: 'done',
};

/** Minutes after eight. */
export const WHEN = {
  openBy: 18,
  firstPassenger: 16,
  lastCall: 280,
  closed: 300,
  errand: 130,
};

/* ============================================================
   THE OPENING AND CLOSING PROCEDURES

   Four jobs each, written as data so the shift log, the objective
   line and the station prompts are all reading the same list. The
   order is not enforced: a clerk who lights the building before
   counting the drawer has not done anything wrong.
   ============================================================ */
export const OPEN_JOBS = [
  {
    id: 'float', at: 'register', text: 'Count the float into the drawer',
    said: 'Drawer counted in',
  },
  {
    id: 'lights', at: null, text: 'Put the zones on at the switch bank',
    said: 'Zones on',
  },
  {
    id: 'board', at: 'gate-board', text: 'Put tonight’s departures up',
    said: 'Board set',
  },
  {
    id: 'doors', at: 'lobby-mat', text: 'Unlock the front doors',
    said: 'Doors open',
  },
  {
    id: 'clock-in', at: 'time-clock', text: 'Punch in', said: 'Punched in',
  },
];

export const CLOSE_JOBS = [
  {
    id: 'cash-up', at: 'register', text: 'Cash up the drawer', said: 'Drawer cashed up',
  },
  {
    id: 'log', at: 'shift-log', text: 'Write up the shift log', said: 'Log written',
  },
  {
    id: 'zones-off', at: null, text: 'Put the zones off', said: 'Zones off',
  },
  {
    id: 'lock', at: 'lobby-mat', text: 'Lock the front doors',
    said: 'Doors locked',
  },
  {
    id: 'clock-out', at: 'time-clock', text: 'Punch out', said: 'Punched out',
  },
];

/** The zones a working terminal has lit, and what the opening job wants. */
/** The doors the public comes in by, which are bolted out of hours. */
export const PUBLIC_DOORS = ['central-front'];
/** The ones staff use, which are only ever propped or not. */
export const SERVICE_DOORS = ['central-westhall', 'west-side'];

export const WORKING_ZONES = [
  'lobby', 'west-front', 'east-front', 'clerk',
  'west-rear', 'east-rear', 'platform',
];

/* ============================================================
   THE SHIFT
   ============================================================ */
export class Shift {
  /**
   * @param deps {
   *   level, power, fleet, ctx,
   *   toast(text, kind), say(line), objective(text),
   *   seed,
   * }
   */
  constructor(deps) {
    this.d = deps;
    this.level = deps.level;
    this.power = deps.power || null;
    this.fleet = deps.fleet || null;
    this.r = rng(deps.seed || 19981020);

    this.phase = PHASE.BEFORE;
    /** Minutes after eight. */
    this.now = 0;
    this.real = 0;

    this.book = new TicketBook();
    this.drawer = new Drawer(OPENING_FLOAT);
    this.crowd = new Crowd(this.level, {
      seed: (deps.seed || 19981020) + 7,
      skins: 12,
      onWindow: (p) => this._openSale(p),
      onGrumble: (p) => this._grumble(p),
    });
    this.crew = new CrewRoom(this.level, {
      r: this.r, skins: 12,
      onAsk: (drv, what) => this.d.toast(`${drv.name} is ${what}.`),
    });
    this.pa = new PublicAddress({
      powered: () => !this.power || this.power.working('pa-amp'),
      onLine: (t) => this.d.say(t),
    });
    this.phone = new Telephone({
      powered: () => !this.power || this.power.working('clerk-crt'),
      r: this.r,
      onRing: () => this.d.toast('The telephone is ringing in the office.'),
    });
    this.incidents = new IncidentPool({
      r: this.r,
      now: () => this.now,
      onRaise: (i) => this.d.toast(i.text, 'warn'),
      onClear: () => {},
    });

    /** id -> Manifest, tonight's departures. */
    this.manifests = new Map();
    /** The schedule, expanded into things that happen at a minute. */
    this.events = [];
    /** What has been done off the two checklists. */
    this.done = new Set();
    /** The sale at the window, if anybody is at it. */
    this.sale = null;
    /** Lines for the shift log. */
    this.logLines = [];
    /** Money counted at the end, once it has been. */
    this.cashedUp = null;
    this._paxDue = [];
  }

  get running() { return this.phase !== PHASE.BEFORE && this.phase !== PHASE.DONE; }
  get clock() { return boardTime(this.now); }
  get clock24() { return clockAt(this.now); }

  /* ---------------- starting ---------------- */

  start() {
    this.phase = PHASE.OPENING;
    this.now = 0;
    this._build();
    /* WHAT THE NIGHT MAN LEFT ON.
     *
     * The lobby, the front of the building, and the way to the office
     * -- which is to say his own lights, and the ones he needed to walk
     * out by. Everything else is off, and putting it up is the first
     * job of the shift.
     *
     * THIS USED TO BE THE LOBBY ALONE, and it was the single worst bug
     * in the game. The clerk starts at the front door and the switch
     * bank is in the old docent library at the other end of the west
     * wing, so the first thing every player did was walk out of the one
     * lit room in the building into twenty-six unlit ones and try to
     * find a panel they had not been told about. It was reported as
     * "the lighting is unusable in every room except the first floor
     * central room", twice, and twice it was looked for in the lighting
     * rig -- which was measured, lit, and fine. The building was not too
     * dark. It was SWITCHED OFF, and nothing said so.
     *
     * The job is unchanged: WORKING_ZONES still wants all seven and
     * these are three of them. What is gone is being asked to find a
     * light switch in the dark. */
    if (this.power) {
      const ON = ['lobby', 'west-front', 'clerk', 'front-ext'];
      for (const c of this.power.system.circuits) {
        c.switched = ON.includes(c.id);
      }
      this.power.system.revision++;
      this.power.apply();
    }
    /* Bolted until the clerk opens up, which is what makes the first
       job a job. */
    this.setDoors(false);
    this.log('Came on at eight.');
    return this;
  }

  /** Expand the timetable into manifests and a list of timed events. */
  _build() {
    this.events.length = 0;
    this.manifests.clear();
    for (const n of NIGHT) {
      if (n.kind === 'depart') this._departure(n, n.route, n.time, n.bay, n.lead);
      else if (n.kind === 'arrive') this._arrival(n, n.route, n.time, n.bay, n.stand);
      else if (n.kind === 'turn') {
        /* A TURNAROUND IS ONE COACH, NOT TWO. It comes in as the Macon,
           stands at bay three while it is unloaded and loaded again,
           and goes back out as the Charleston -- same bus, same
           driver, new roll on the front. The first cut of this put a
           second coach on top of the first one at the same bay, which
           is the sort of thing you only see in a screenshot. */
        this._arrival(n, n.route, n.time, n.bay, null);
        this._departure({ ...n, id: `${n.id}-out` }, n.outRoute, n.outTime, n.bay, 0, n.id);
        this.events.push({ at: n.time + 8, kind: 'resign', id: n.id, route: n.outRoute });
      }
    }
    this.events.sort((a, b) => a.at - b.at);
    /* Passengers for each departure: they turn up over the
       three-quarters of an hour before it and not evenly. */
    for (const m of this.manifests.values()) {
      const n = 5 + Math.floor(this.r() * 4);
      for (let i = 0; i < n; i++) {
        const lead = 12 + Math.floor(this.r() * 40);
        this._paxDue.push({ at: Math.max(WHEN.firstPassenger, m.depart - lead), route: m.route });
      }
    }
    /* And a few who are not travelling. */
    for (let i = 0; i < 4; i++) {
      this._paxDue.push({
        at: 25 + Math.floor(this.r() * 230),
        archetype: ['waiting', 'meeting', 'arguing', 'missed'][i],
      });
    }
    this._paxDue.sort((a, b) => a.at - b.at);

    /* ---- the two things that are not left to the dice ----

       THE ERRAND. The brief asks for exactly one ordinary reason to go
       upstairs in a whole shift, and this is it: the timetable forms
       run out at about ten past ten and the carton is in the old
       history room. It is scheduled rather than rolled because "about
       one" and "on average one" are different promises.

       THE COFFEE. Nothing in this file trips a breaker. What it does
       is put the coffee maker in the driver's hands three minutes
       after the turnaround's belt starts, and then the east wing is
       carrying twelve and a half amps of conveyor and seven and a half
       of coffee on a twenty-amp way. electrical.js does the rest,
       twelve seconds later, and the difference between that and
       scripting a blackout is the whole point. */
    const turn = NIGHT.find((n) => n.kind === 'turn');
    this.events.push({ at: WHEN.errand, kind: 'incident', id: 'forms' });
    if (turn) this.events.push({ at: turn.time + 3, kind: 'incident', id: 'driver-coffee' });
    this.events.sort((a, b) => a.at - b.at);
  }

  _departure(n, route, time, bay, lead, onCoach) {
    const m = new Manifest({
      id: n.id, route, bay, depart: time, driver: n.driver,
    });
    if (onCoach) m.coach = onCoach;
    this.manifests.set(m.id, m);
    if (!onCoach) {
      this.events.push({ at: Math.max(0, time - (lead || 0)), kind: 'coach-in', id: m.id });
    }
    this.events.push({ at: time - 12, kind: 'board', id: m.id });
    this.events.push({ at: time - 4, kind: 'final', id: m.id });
    this.events.push({ at: time, kind: 'go', id: m.id });
  }

  _arrival(n, route, time, bay, stand) {
    this.events.push({ at: time - 3, kind: 'due', id: n.id, route, bay });
    this.events.push({ at: time, kind: 'in', id: n.id, route, bay, driver: n.driver });
    /* `stand: null` means it is not leaving as itself -- it is turning
       round, and the outbound departure takes it away. */
    if (stand !== null) {
      this.events.push({ at: time + (stand || 20), kind: 'out', id: n.id, route, bay });
    }
  }

  /* ---------------- the loop ---------------- */

  update(dt, ctx) {
    if (!this.running) return;
    this.real += dt;
    const was = this.now;
    this.now += dt * RATE;

    this._events(was, this.now, ctx);
    this._passengers(was, this.now, ctx);

    this.crowd.update(dt, ctx);
    this.crew.update(dt, ctx);
    /* AFTER EVERYONE HAS MOVED, and here rather than in game.js: the
       crowd is the shift's, and anything that drives a shift -- the
       game loop, a harness, whatever comes later -- has to get the same
       people out of each other. Putting it in the renderer's update
       meant the only thing that separated a line was the one code path
       nothing tests. See npc.js/separate. */
    separate(this.actors(), ctx && ctx.player, ctx);
    this.pa.update(dt);
    this.phone.update(dt);
    this.incidents.tick(this.now, (this.now - was), this._busy());

    /* The telephone, about twice a night, when nothing else is on. */
    if (!this._busy() && !this.phone.ringing && this.r() < dt * 0.004) this.phone.ring();

    if (this.phase === PHASE.OPENING && this.done.size >= OPEN_JOBS.length) {
      this.phase = PHASE.RUNNING;
      this.log('Terminal open.');
    }
    if (this.phase === PHASE.RUNNING && this.now >= WHEN.lastCall) {
      this.phase = PHASE.CLOSING;
      this.pa.say(CALL.CLOSING, null);
      this.log('Last call.');
    }
    if (this.phase === PHASE.CLOSING
      && CLOSE_JOBS.every((j) => this.done.has(j.id))) {
      this.phase = PHASE.DONE;
      this.log(`Off at ${this.clock24}.`);
    }
  }

  /** Is the player's plate already full: a coach boarding, or a line. */
  _busy() {
    if (this.crowd.lineLength >= 3) return true;
    for (const m of this.manifests.values()) if (m.state === 'boarding') return true;
    return false;
  }

  _events(from, to, ctx) {
    for (const e of this.events) {
      if (e.fired || e.at > to || e.at <= from) continue;
      e.fired = true;
      this._fire(e, ctx);
    }
  }

  _fire(e, ctx) {
    const m = this.manifests.get(e.id);
    switch (e.kind) {
      case 'coach-in': {
        if (!this.fleet || !this.fleet.enabled) break;
        const r = ROUTE_BY_ID.get(m.route);
        const c = this.fleet.add({
          id: m.id, route: m.route, sign: r ? r.sign : m.route, bay: m.bay,
        });
        if (c) { c.arrive(); m.coach = c.id; }
        break;
      }
      case 'board':
        m.open();
        this.pa.say(CALL.BOARDING, m);
        this._callThem(m, ctx);
        break;
      case 'final':
        this.pa.say(CALL.FINAL, m);
        break;
      case 'go':
        this._depart(m, ctx);
        break;
      case 'due':
        this.pa.say(CALL.ARRIVED, { route: e.route, bay: e.bay, depart: this.now });
        break;
      case 'in': {
        if (this.fleet && this.fleet.enabled) {
          const r = ROUTE_BY_ID.get(e.route);
          const c = this.fleet.add({
            id: e.id, route: e.route, sign: r ? r.sign : e.route, bay: e.bay,
          });
          if (c) c.arrive();
        }
        const bay = this.fleet && this.fleet.bay(e.bay);
        if (bay) {
          this.crowd.disembark(2 + Math.floor(this.r() * 4),
            { x: bay.boardX, z: bay.boardZ, y: 0 }, ctx);
          const out = this.manifests.get(`${e.id}-out`);
          this.crew.arrive({
            id: e.id, name: e.driver || 'a driver', manifest: out || null,
            from: { x: bay.boardX, z: bay.boardZ },
          }, ctx);
        }
        /* Unloading is when the belt runs, and the belt is half of why
           the east wing's way is about to go. */
        if (this.power) this.power.run('conveyor', true);
        break;
      }
      case 'incident':
        this.incidents.raise(e.id);
        break;
      case 'resign': {
        /* New roll on the front. The driver winds it while the belt
           is running and nobody watches him do it. */
        const c = this.fleet && this.fleet.coach(e.id);
        const r = ROUTE_BY_ID.get(e.route);
        if (c && r && this.fleet.resign) this.fleet.resign(c, r.sign);
        break;
      }
      case 'out': {
        const c = this.fleet && this.fleet.coach(e.id);
        if (c) c.depart();
        if (this.power) this.power.run('conveyor', false);
        break;
      }
      default:
        break;
    }
  }

  /** Everybody holding a ticket for this one gets up and walks out. */
  _callThem(m, ctx) {
    const bay = this.fleet && this.fleet.bay(m.bay);
    if (!bay) return 0;
    return this.crowd.call(m.route, { x: bay.boardX, z: bay.boardZ, y: 0 }, ctx);
  }

  _depart(m, ctx) {
    void ctx;
    /* ONCE. The player sends a coach when it is loaded and the
       timetable sends it at its time, and on a good night both
       happen -- the first one wins and the second is a coach that
       has already gone. */
    if (m.state === 'departed') return m;
    m.close();
    m.depart_();
    const c = this.fleet && this.fleet.coach(m.coach || m.id);
    if (c) c.depart();
    this.crew.depart(m.coach || m.id);
    if (this.power) this.power.run('conveyor', false);
    const left = this.crowd.atPlatform(m.route).length;
    this.log(`${m.time} ${ROUTE_BY_ID.get(m.route).name}: ${m.boarded.length} aboard, `
      + `${m.loaded.length} bags${left ? `, ${left} missed it` : ''}.`);
    if (left) this.d.toast(`${left} passenger${left === 1 ? '' : 's'} missed the ${m.time}.`, 'warn');
    return m;
  }

  _passengers(from, to, ctx) {
    for (const p of this._paxDue) {
      if (p.fired || p.at > to || p.at <= from) continue;
      p.fired = true;
      this.crowd.arrive({ route: p.route, archetype: p.archetype }, ctx);
    }
  }

  /* ---------------- the window ---------------- */

  _openSale(p) {
    if (p.req.want !== 'ticket') { this.sale = null; return; }
    this.sale = new Sale({
      who: p.req.who,
      route: p.req.route, to: p.req.to, cls: p.req.cls,
      roundTrip: p.req.roundTrip, bags: p.req.bags,
      paid: undefined,
      onDone: (out) => this._sold(p, out),
    });
    this.sale.pax = p;
    this.sale.serve();
    /* WHAT THEY ARE HOLDING is the fare AND the baggage charge, and
       it is written out longhand rather than read off `sale.total`,
       because `total` is the QUOTED price plus the bags and nothing
       has been quoted yet -- so it is the bag fee on its own, and a
       soldier paying the exact money turns up five dollars in hand
       for a forty-five dollar ticket. Off the fare alone he is short
       by the bags instead, the window never moves, and the line
       behind it never moves either: a headless playtest found
       nineteen people standing in a lobby at half past midnight
       because of that one. */
    this.sale.req.paid = offerOf(p, this.sale.fare + this.sale.bagFee, this.r);
  }

  _sold(p, out) {
    p.ticket = out.ticket;
    p.checks = out.checks;
    if (out.ticket) {
      this.drawer.take([{ id: 'b20', n: 0, cents: 0 }].filter(() => false), 'sale');
    }
    this.crowd.release(p, this.d.ctx ? this.d.ctx() : null);
    this.sale = null;
  }

  _grumble(p) {
    if (p.grumbles === 1) this.d.toast(`${p.req.who} is looking at the clock.`);
    else if (p.grumbles >= 3) this.d.toast(`${p.req.who} has given up and sat down.`, 'warn');
  }

  /** The player has finished with whoever is at the window. */
  clearWindow() {
    const p = this.crowd.atWindow;
    if (!p) return false;
    this.crowd.release(p, this.d.ctx ? this.d.ctx() : null);
    this.sale = null;
    return true;
  }

  /* ---------------- checklists ---------------- */

  /**
   * Say the first thing the window offers.
   *
   * THE BOX MUST NOT BE THE ONLY WAY IN. Routing the ticket window
   * through a piece of UI made the whole transaction undriveable by
   * anything that is not a browser with a keyboard in front of it --
   * which took out two harnesses immediately, and would have taken out
   * anything else that ever needs to serve somebody without a person
   * watching. The box chooses between these lines; this is what
   * choosing the top one does, and it is the same call either way.
   */
  serve() {
    const c = conversation(this, () => {});
    if (!c) return false;
    const o = c.options.find((x) => !x.disabled && x.act);
    if (!o) return false;
    o.act();
    return true;
  }

  jobs() { return this.phase === PHASE.CLOSING ? CLOSE_JOBS : OPEN_JOBS; }

  /** Is that checklist job outstanding right now. */
  wants(id) {
    if (this.phase === PHASE.OPENING) return OPEN_JOBS.some((j) => j.id === id) && !this.done.has(id);
    if (this.phase === PHASE.CLOSING) return CLOSE_JOBS.some((j) => j.id === id) && !this.done.has(id);
    return false;
  }

  finish(id) {
    if (!this.wants(id)) return false;
    this.done.add(id);
    if (id === 'doors') this.setDoors(true);
    if (id === 'lock') this.setDoors(false);
    const j = [...OPEN_JOBS, ...CLOSE_JOBS].find((x) => x.id === id);
    if (j) this.log(j.said);
    return true;
  }

  /**
   * THE DOORS A SHIFT PROPS OPEN, which are the ones on the route
   * between the street and a coach:
   *
   *     central-front      the front doors on Telfair Street
   *     central-westhall   the lobby's north-west doorway, under the
   *                        GATES 1-4 sign
   *     west-side          the 1856 "Entrance to Railroad" door, which
   *                        is the one the whole yard was put where it
   *                        is for
   *
   * All three are propped for the night and shut at one, which is what
   * a terminal does -- and is also the difference between a line at
   * the window and nineteen people standing on the portico wondering
   * why the handle does not turn. Nobody in this building can open a
   * door for themselves, so a door the shift forgets is a wall. The
   * headless playtest found both of those before a player did: first
   * the front doors, and then six passengers standing in a lobby
   * doorway at ten to nine with a coach fifty yards away.
   */
  /**
   * Open the terminal up, or shut it.
   *
   * THE FRONT DOORS ARE ACTUALLY LOCKED, which they were not. "Unlock
   * the front doors" used to be a job that recorded itself and changed
   * nothing you could see: the doors were never bolted, so there was
   * nothing to unlock, and the only place the job could be done was a
   * floor mat whose prompt the doors themselves took off the reticle.
   * It read, correctly, as a job with no way to do it.
   *
   * Now the public doors start bolted and the job is done AT THE DOOR,
   * which is where somebody unlocking a door stands. The two service
   * doors are only propped -- staff doors are not bolted against staff.
   */
  setDoors(open) {
    for (const id of PUBLIC_DOORS) {
      const d = this.level.doorById && this.level.doorById(id);
      if (!d) continue;
      d.locked = !open;
      d.lockedText = 'Bolted. Opening up is the first job of the night.';
      d.target = open ? 1 : 0;
      d.amount = d.target;
    }
    for (const id of SERVICE_DOORS) {
      const d = this.level.doorById && this.level.doorById(id);
      if (!d) continue;
      d.locked = false;
      d.target = open ? 1 : 0;
      d.amount = d.target;
    }
    return this;
  }

  /** The zones job is not a station: it is the state of the bank. */
  checkZones() {
    if (!this.power) return false;
    if (this.phase === PHASE.OPENING && this.wants('lights')) {
      const on = WORKING_ZONES.every((id) => {
        const c = this.power.system.circuit(id);
        return c && c.switched;
      });
      if (on) return this.finish('lights');
    }
    if (this.phase === PHASE.CLOSING && this.wants('zones-off')) {
      const off = WORKING_ZONES.filter((id) => id !== 'platform').every((id) => {
        const c = this.power.system.circuit(id);
        return c && !c.switched;
      });
      if (off) return this.finish('zones-off');
    }
    return false;
  }

  /* ---------------- money and paperwork ---------------- */

  /** Cash up: what is in the drawer against what should be. */
  reconcile() {
    const took = this.book.takings();
    const expect = 15000 + took;
    const actual = this.drawer.total;
    this.cashedUp = { took, expect, actual, out: actual - expect };
    return this.cashedUp;
  }

  log(line) {
    this.logLines.push(`${this.clock24}  ${line}`);
    return this;
  }

  /** The lines the shift log station shows. */
  logText() {
    const out = this.logLines.slice(-8);
    for (const n of this.incidents.notes()) out.push(`      open: ${n}`);
    return out;
  }

  /* ---------------- what the HUD says ---------------- */

  objective() {
    if (this.phase === PHASE.OPENING) {
      const j = OPEN_JOBS.find((x) => !this.done.has(x.id));
      return j ? j.text : 'Open up';
    }
    if (this.phase === PHASE.CLOSING) {
      const j = CLOSE_JOBS.find((x) => !this.done.has(x.id));
      return j ? j.text : 'Lock up';
    }
    if (this.phase === PHASE.DONE) return 'Shift over';
    /* Running: whatever is nearest. A coach boarding beats a line,
       and a line beats an incident. */
    for (const m of this.manifests.values()) {
      if (m.state === 'boarding') {
        return `${m.time} ${ROUTE_BY_ID.get(m.route).name} boarding, bay ${m.bay}`;
      }
    }
    if (this.crowd.lineLength) {
      const n = this.crowd.lineLength;
      return `${n} at the window`;
    }
    const inc = this.incidents.open[0];
    if (inc) return inc.note;
    const next = this._nextDeparture();
    return next ? `${next.time} ${ROUTE_BY_ID.get(next.route).name} at ${next.time}` : 'Quiet';
  }

  _nextDeparture() {
    let best = null;
    for (const m of this.manifests.values()) {
      if (m.state === 'departed') continue;
      if (!best || m.depart < best.depart) best = m;
    }
    return best;
  }

  /** Every departure, for the board in the lobby. */
  board() {
    return [...this.manifests.values()]
      .sort((a, b) => a.depart - b.depart)
      .map((m) => m.boardLine());
  }

  actors() {
    return this.crowd.actors().concat(this.crew.actors());
  }

  /* ---------------- persistence ---------------- */

  save() {
    return {
      phase: this.phase, now: this.now, real: this.real,
      book: this.book.save(),
      drawer: this.drawer.save(),
      crowd: this.crowd.save(),
      crew: this.crew.save(),
      pa: this.pa.save(),
      phone: this.phone.save(),
      incidents: this.incidents.save(),
      manifests: [...this.manifests.values()].map((m) => m.save()),
      events: this.events.map((e) => (e.fired ? 1 : 0)),
      pax: this._paxDue.map((p) => (p.fired ? 1 : 0)),
      done: [...this.done],
      log: this.logLines.slice(-40),
      cashedUp: this.cashedUp,
    };
  }

  restore(d, ctx) {
    if (!d) return false;
    this._build();
    this.phase = d.phase || PHASE.BEFORE;
    this.now = d.now || 0;
    this.real = d.real || 0;
    this.book.restore(d.book);
    this.drawer.restore(d.drawer);
    this.manifests.clear();
    for (const r of d.manifests || []) {
      const m = Manifest.load(r);
      this.manifests.set(m.id, m);
    }
    (d.events || []).forEach((f, i) => { if (this.events[i]) this.events[i].fired = !!f; });
    (d.pax || []).forEach((f, i) => { if (this._paxDue[i]) this._paxDue[i].fired = !!f; });
    this.crowd.restore(d.crowd, this.book, ctx);
    this.crew.restore(d.crew, this.manifests, ctx);
    this.pa.restore(d.pa);
    this.phone.restore(d.phone);
    this.incidents.restore(d.incidents);
    this.done = new Set(d.done || []);
    this.logLines = (d.log || []).slice();
    this.cashedUp = d.cashedUp || null;
    this.sale = null;
    const at = this.crowd.atWindow;
    if (at) this._openSale(at);
    return true;
  }
}

/* Re-exported so the station bindings do not import five files. */
export { PSTATE, DSTATE, moveBags, bagsFor, money, ARCHETYPES };
