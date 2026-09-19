/* ============================================================
   tutorial.js -- the walkthrough, and the person who gives it.

   THE PROBLEM THIS SOLVES. Richmond Central is a ninety-four-foot
   building on two floors with twenty-seven rooms, fifty-two stations,
   twelve circuits and a five-hour shift, and the brief's answer to how
   a player learns it was "tutorialization by work": put them behind the
   counter and let the job teach them. That is the right instinct and it
   is not sufficient at this scale. A player who does not know the
   baggage room exists will not find it while a coach is boarding, and a
   player who has never been told where the panels are has no reason to
   walk into the old docent library at all.

   So somebody shows them round first. Once, on the first night, before
   the doors open.

   WHAT THIS IS NOT. It is not a parallel script that teaches a
   simplified version of the job. Every task in the walkthrough is a
   REAL OPENING JOB out of shift.js -- the same five the shift asks for
   whether this runs or not -- and the walkthrough is finished by doing
   them, not by watching them. Turn the tour off and those five jobs are
   still there and still yours; all that is missing is the person
   pointing at them. Nothing here writes to the drawer, the book, the
   board or the panel: it waits for the player to.

   HOW IT RUNS. The supervisor walks a route, stops, waits until the
   player has caught up, and says their piece. A stop that names a job
   then waits for the SHIFT to record it, which means the player does it
   at the real station with the real prompt and the real consequences.
   The supervisor is an ordinary Npc on the ordinary navigator and can
   be told at any point to get on with it -- look at them and press use.

   WHO. R. Vann, day supervisor, going off shift as the player comes on.
   They have worked here eleven years, they are not a character, and
   they have no opinion about the building beyond where things are and
   what goes wrong with them.
   ============================================================ */
import { Npc } from '../npc.js';
import { Interactable } from '../interaction.js';

export const SUPERVISOR = {
  id: 'supervisor',
  name: 'R. Vann',
  role: 'Day supervisor',
  /** Which wardrobe palette. 3 is the one that reads as a work shirt. */
  skin: 3,
};

/** The one exterior door that is staff-side, not public. */
const STAFF_DOOR = 'west-side';

/** How near the player has to be before a stop's lines start. */
const NEAR = 4.2;
/** Seconds a line stays up before the next one. */
const LINE_TIME = 3.4;
/** Seconds the supervisor waits for a player who is not coming. */
const PATIENCE = 22;
/**
 * How long a leg is allowed to take, as a multiple of how long it
 * should take, plus a fixed allowance for doorways and door-opening.
 *
 * A FIXED LIMIT IS WRONG HERE and it is worth saying why: the crew room
 * to the coach bays is the length of the building and out the side
 * door, about a hundred meters, and at a walking pace that is a minute
 * and a half. A flat forty-five seconds called that leg a routing
 * failure every time while calling a genuinely stuck supervisor in the
 * ticket hall fine, which is precisely backwards.
 */
const WALK_SLACK = 2.6;
const WALK_GRACE = 12;

/* ============================================================
   THE ROUTE

   In the order somebody actually walks it: in at the front, round the
   public rooms, into the office where the power is, back out to do the
   two counter jobs, through the service side, out to the platform, up
   the stairs for ten seconds, and back to the front door to open up.

   `at` is where the supervisor stands, resolved at start() from the
   level's own marks and stations so that none of these are coordinates.
   `look` is what they turn to face while talking.
   `task` is an OPEN_JOBS id out of shift.js. A stop with one does not
   advance until the shift says it is done.
   ============================================================ */
export const TOUR = [
  {
    id: 'hall',
    at: { mark: 'service', key: 'entrance' },
    look: { station: 'ticket-counter' },
    lines: [
      'Evening. R. Vann, day side — you’re the night man, so you get the keys.',
      'Richmond Central. Used to be the Old Academy, and it still mostly is.',
      'Eight to one. Five coaches. I’ll walk you round before I go.',
    ],
  },
  {
    id: 'counter',
    at: { station: 'ticket-counter' },
    look: { station: 'register' },
    lines: [
      'This is your window. You stand behind it, they stand in front of it.',
      'Register here, ticket printer there. Fares are on the card — you read them off, you don’t guess.',
      'They rarely have it exact. You make change out of the drawer, so the drawer has to be right.',
    ],
  },
  {
    id: 'boards',
    at: { station: 'gate-board' },
    look: { station: 'gate-board' },
    lines: [
      'Departure board. Passengers read this before they read you.',
      'Anything you put up here comes off the manifest. Don’t put up what you haven’t got.',
    ],
  },
  {
    id: 'office',
    at: { station: 'clerk-desk' },
    look: { station: 'panel-a' },
    lines: [
      'Office. Dispatch, telephone, and every breaker in the building.',
      'Nothing was wired for electric — it’s all been added since, and it all comes back here.',
      'Twelve ways in those two cabinets, labelled. The switch bank beside them is the zones.',
      'Put the zones on. That’s your first job and you’ll do it every night.',
    ],
    task: 'lights',
    prompt: 'Put the zones on at the switch bank',
  },
  {
    id: 'panel',
    at: { station: 'panel-b' },
    look: { station: 'panel-b' },
    lines: [
      'When something dies, it died here. Look for the handle that’s sat halfway.',
      'The east wing goes about once a week. Belt, scale, vending and the coffee pot on one 1950s twenty.',
      'It’s not haunted, it’s overloaded. Push it back and stagger the load.',
    ],
  },
  {
    id: 'float',
    at: { station: 'register' },
    look: { station: 'register' },
    lines: [
      'Now count your float in. Hundred and fifty, in the denominations on the slip.',
      'Count it at the start and count it at the end. If it doesn’t square, it’s on your log, not mine.',
    ],
    task: 'float',
    prompt: 'Count the float into the drawer',
  },
  {
    id: 'board-job',
    at: { station: 'gate-board' },
    look: { station: 'gate-board' },
    lines: ['Set tonight’s departures up while you’re stood there.'],
    task: 'board',
    prompt: 'Put tonight’s departures up',
  },
  {
    id: 'baggage',
    at: { station: 'baggage-scale' },
    look: { station: 'baggage-tags' },
    lines: [
      'Baggage. Scale, tag desk, belt out to the platform.',
      'Two bags free, three dollars after, five if it’s over fifty pounds — that’s what the scale is for.',
      'Every bag gets a tag and the passenger keeps the claim number. No number, no bag.',
      'Load them by departure, not as they come in. You’ll thank yourself at half ten.',
    ],
  },
  {
    id: 'lost',
    at: { station: 'lost-found' },
    look: { station: 'lost-found' },
    lines: [
      'Lost and found. Anything left on a coach or a bench goes in here with the date on it.',
      'People come back for umbrellas three days later. They do.',
    ],
  },
  {
    id: 'crew',
    at: { mark: 'crew', key: 'coffee' },
    look: { station: 'coffee' },
    lines: [
      'Crew room. Drivers sit out a turnaround in here.',
      'Keep a pot on. A driver who’s waiting on coffee is a coach that leaves late.',
      'Their board’s on the wall — who’s in, who’s due, who’s overdue.',
    ],
  },
  {
    id: 'platform',
    /* ON THE PLATFORM, NOT DOWN IN THE YARD. The staging squares are
       out on the apron, which is two foot ten below the platform and
       reached by a three-foot ramp at one end of it -- fine for a
       player, who can see where they are going, and a reliable way to
       strand a walker, which spent the back half of the tour sliding
       off the side of it. It is also simply where a supervisor stands:
       you show somebody the bays from the platform, you do not walk
       them out among the coaches. */
    at: { station: 'manifest-board' },
    look: { station: 'staging.atl' },
    lines: [
      'Out here. Four bays, numbered, nose in off the aisle.',
      'Bags stage on the squares by bay. Manifest board’s on the wall there.',
      'You sign a manifest when it’s loaded and lifted, and not before.',
      'Don’t send one early. Three minutes out is early enough to be standing here.',
    ],
  },
  {
    id: 'upstairs',
    at: { station: 'forms-carton' },
    look: { station: 'records' },
    lines: [
      'Upstairs is stock and old records. Nothing runs from up here.',
      'Timetable forms, tape, spare rolls. You’ll come up maybe once a night.',
      'Light switch is at the top of the stairs. Put it off behind you.',
    ],
  },
  {
    id: 'doors',
    at: { station: 'lobby-mat' },
    look: { mark: 'service', key: 'outside' },
    lines: [
      'Right. Open up.',
      'Front doors unlocked at eight, locked at one. Not a minute either side.',
    ],
    task: 'doors',
    prompt: 'Unlock the front doors',
  },
  {
    id: 'clock',
    at: { station: 'time-clock' },
    look: { station: 'time-clock' },
    lines: ['And punch in. Payroll doesn’t take your word for it.'],
    task: 'clock-in',
    prompt: 'Punch in',
  },
  {
    id: 'leave',
    at: { mark: 'service', key: 'entrance' },
    look: { station: 'ticket-counter' },
    lines: [
      'That’s the building. Sell the tickets, tag the bags, load the coaches, keep the board honest.',
      'It’s a quiet route on a Tuesday. Anything breaks, it’s the panel.',
      'Night, then.',
    ],
  },
];

/** Where a stop's `at` / `look` actually is, given the level. */
function resolve(level, ref) {
  if (!ref) return null;
  if (ref.mark) {
    const m = level.marks[ref.mark];
    const p = m && m[ref.key];
    return p ? { x: p.x, z: p.z } : null;
  }
  const st = level.stations.get(ref.station);
  if (!st || !st.box) return null;
  const b = st.box;
  return { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
}

/**
 * Somewhere to STAND to talk about a thing, which is not the thing.
 *
 * A station's box is drawn around its own prop, so walking a person to
 * the middle of one walks them into the register.
 *
 * STANDABLE IS NOT THE SAME AS CONNECTED, and that distinction is the
 * whole of this function. The first cut backed off toward the middle of
 * the room until a body fitted, which put the supervisor in the north
 * arm of the clerk's office -- a perfectly good piece of floor with a
 * desk between it and the only waypoint in the room. Everything after
 * that looked like a pathing bug and was not: the router was handing
 * back a correct route whose first leg went through a desk, the walker
 * pressed into it, gave up a waypoint at a time, and reported itself
 * arrived. The supervisor gave two thirds of the tour from inside the
 * office with the door shut.
 *
 * So a candidate is only taken if the navigator can see a waypoint from
 * it. That is the same question the walker will ask a moment later, and
 * asking it here is the difference between standing somewhere and being
 * able to leave.
 */
function standNear(ctx, spot) {
  const level = ctx.level;
  if (!spot) return null;
  const R = 0.2794, H = 1.778;
  const room = level.roomAt(spot.x, 0, spot.z);
  const y = room ? room.y0 : 0;
  const reach = (ax, az, bx, bz) => level.collision.clearPath(ax, az, bx, bz, y, R, H);
  const connected = (x, z) => {
    if (!ctx.nav) return true;
    const i = ctx.nav.nearest(x, y, z, reach);
    if (i < 0) return false;
    const n = ctx.nav.nodes[i];
    return reach(x, z, n.x, n.z);
  };

  let fallback = null;
  /* Rings outward from the thing being talked about, nearest first, so
     the supervisor stands as close to it as the furniture allows. */
  for (let d = 0.6; d <= 3.6; d += 0.3) {
    for (let a = 0; a < 20; a++) {
      const th = (a / 20) * Math.PI * 2;
      const x = spot.x + Math.cos(th) * d;
      const z = spot.z + Math.sin(th) * d;
      if (!level.collision.fits(x, y + 0.05, z, R, H)) continue;
      if (room) {
        const here = level.roomAt(x, y + 0.1, z);
        if (!here || here.id !== room.id) continue;
      }
      if (!fallback) fallback = { x, y, z };
      if (connected(x, z)) return { x, y, z };
    }
  }
  return fallback || { x: spot.x, y, z: spot.z };
}

export const TSTATE = {
  OFF: 'off',
  WALKING: 'walking',
  WAITING: 'waiting',     // stood at the stop, player not here yet
  TALKING: 'talking',
  TASK: 'task',           // said their piece, waiting for the job to be done
  LEAVING: 'leaving',
  DONE: 'done',
};

export class Tutorial {
  constructor() {
    this.state = TSTATE.OFF;
    this.at = 0;            // index into TOUR
    this.line = 0;          // index into the current stop's lines
    this.t = 0;
    this.npc = null;
    this.waited = 0;
    this.spot = null;
    /** Stops the supervisor could not actually get to. See WALKING. */
    this.missed = [];
  }

  get running() {
    return this.state !== TSTATE.OFF && this.state !== TSTATE.DONE;
  }

  /** @param ctx the game context; needs level, nav, collision, speak */
  start(ctx) {
    const level = ctx.level;
    const entrance = resolve(level, { mark: 'service', key: 'entrance' });
    const start = standNear(ctx, entrance) || { x: 0, y: 0, z: 0 };
    this.npc = new Npc({
      id: SUPERVISOR.id,
      name: SUPERVISOR.name,
      x: start.x, y: start.y, z: start.z,
      speed: 1.15,
      data: { skin: SUPERVISOR.skin },
    });
    this.npc.skin = SUPERVISOR.skin;
    /* THE WAY OUT, and it is diegetic rather than a key prompt: look at
       them and press use. A player who already knows the building
       should not have to sit through it, and a settings toggle is no
       help to somebody who has already started. */
    this.item = level.interact.add(new Interactable({
      id: 'tutorial:supervisor',
      cylFn: () => ({ x: this.npc.x, z: this.npc.z, r: 0.55, y0: this.npc.y, y1: this.npc.y + 1.8 }),
      enabled: () => this.running && !this.npc.hidden,
      describe: () => ({
        text: `${SUPERVISOR.name} — ${SUPERVISOR.role.toLowerCase()}`,
        sub: 'Tell them you can find your own way',
        hold: 0.6,
        action: (c) => this.skip(c),
      }),
    }));
    this.state = TSTATE.WALKING;
    this.at = 0;
    this.line = 0;
    this._go(ctx);
    return this;
  }

  /** Send the supervisor to the current stop. */
  _go(ctx) {
    const stop = TOUR[this.at];
    if (!stop) { this._finish(ctx); return; }
    const level = ctx.level;
    const target = resolve(level, stop.at);
    this.spot = standNear(ctx, target) || { x: this.npc.x, y: this.npc.y, z: this.npc.z };
    /* ONCE PER LEG, not once per tour and not once per frame.

       Once per tour is too few: a door that swings shut behind the
       supervisor is a door they cannot open again -- nobody in this
       building can work one -- so propping the route open at eight
       o'clock and walking off left them outside on the platform for the
       rest of the tour.

       Once per frame is too many, and it is worse than it sounds: it
       takes the doors off the PLAYER as well, who spends the tour
       unable to shut anything because a supervisor two rooms away keeps
       pushing it back open. Every internal door in the building failed
       to close while the walkthrough was running. At the top of each
       leg is the honest reading of it anyway -- somebody walking you
       round opens what is in the way as they come to it. */
    this._openTheWay(ctx);
    this.npc.goTo(this.spot.x, this.spot.y, this.spot.z, ctx);
    this._hops = this.npc.path ? this.npc.path.length : 0;
    /* how long this leg ought to take, along the route actually chosen */
    let run = 0, px = this.npc.x, pz = this.npc.z;
    for (const wp of this.npc.path || []) {
      run += Math.hypot(wp.x - px, wp.z - pz);
      px = wp.x; pz = wp.z;
    }
    this.walkLimit = WALK_GRACE + (run / Math.max(0.2, this.npc.speed)) * WALK_SLACK;
    this.state = TSTATE.WALKING;
    this.waited = 0;
    this.line = 0;
    this.t = 0;
    this.walkT = 0;
  }

  /** The player gave up on the tour, or asked for it to end. */
  skip(ctx) {
    if (!this.running) return;
    this._say(ctx, 'Suit yourself. It’s all where I said it was.');
    this.at = TOUR.length;
    this._finish(ctx);
  }

  _finish(ctx) {
    this.state = TSTATE.DONE;
    if (this.npc) this.npc.hidden = true;
    if (this.item && ctx && ctx.level) { ctx.level.interact.remove(this.item); this.item = null; }
    if (ctx && ctx.toast) {
      ctx.toast('The day supervisor has gone home. The terminal is yours.', 'good');
    }
  }

  _say(ctx, line) {
    if (ctx && ctx.speak) ctx.speak(SUPERVISOR.name, line);
    else if (ctx && ctx.toast) ctx.toast(line);
  }

  /**
   * THE BUILDING IS OPENED UP FOR THE HANDOVER, ONCE, AT THE START.
   *
   * Nobody in this building can work a door -- passengers are walked
   * through by Shift.setDoors, which props the three a shift needs and
   * leaves the rest shut. At eight o'clock every internal door is shut,
   * so the supervisor got as far as the edge of the ticket hall and
   * then announced the breaker panels from thirteen meters away with a
   * wall in between, which the tour reported as a success because the
   * lines had been said.
   *
   * Opening them ON APPROACH does not fix it and is worth writing down:
   * the navigator asks collision.clearPath before it will use a
   * doorway, so a shut door is not a thing to be opened on the way, it
   * is a wall the route never goes through. The supervisor was never
   * walking at the door to get near enough to open it -- they were
   * walking at whatever the fallback straight line hit instead.
   *
   * So the internal doors go open when the tour starts, which is what
   * somebody handing a building over does anyway.
   *
   * THE PUBLIC DOORS ARE NOT TOUCHED: those are on the opening
   * procedure, unlocking the front of the terminal is the night clerk's
   * job, and one of the five tasks is exactly that. The STAFF door onto
   * the platform is, because it is how anybody gets to the bays and
   * because the tour goes out there fifteen minutes before the clerk is
   * asked to unlock anything. Leaving it shut left the supervisor
   * describing four coach bays from inside the west offices.
   */
  _openTheWay(ctx) {
    const level = ctx.level;
    if (!level || !level.doors) return;
    for (const d of level.doors) {
      if (d.exterior && d.id !== STAFF_DOOR) continue;
      d.locked = false;
      d.target = 1;
      d.amount = 1;
    }
  }

  /** How far the player is from where the supervisor is standing. */
  _playerGap(ctx) {
    const p = ctx.player;
    if (!p || !this.npc) return Infinity;
    return Math.hypot(p.x - this.npc.x, p.z - this.npc.z);
  }

  update(dt, ctx) {
    if (!this.running || !this.npc) return;
    const stop = TOUR[this.at];
    if (!stop) { this._finish(ctx); return; }

    this.npc.update(dt, ctx);
    const gap = this._playerGap(ctx);

    switch (this.state) {
      case TSTATE.WALKING:
        /* A TOUR MUST NEVER DEADLOCK. Everything else in this file can
           be wrong and still recoverable -- a line said in the wrong
           room is a bad tour, not a broken game -- but a supervisor who
           cannot reach the next stop leaves the player standing in a
           corridor with an objective that will never clear and five
           opening jobs they have not been told about. So walking is on
           a clock, and when it runs out they are simply there: they
           walked it while the player was catching up, which is what the
           player will assume anyway. The miss is recorded either way,
           because a stop that needs this is a routing bug and the
           harness is what has to say so. */
        this.walkT += dt;
        if (!this.npc.arrived && this.walkT > this.walkLimit) {
          this.missed.push({
            id: stop.id, by: Math.hypot(this.npc.x - this.spot.x, this.npc.z - this.spot.z),
            at: [this.npc.x, this.npc.z], want: [this.spot.x, this.spot.z],
            room: (ctx.level.roomAt(this.npc.x, this.npc.y + 0.1, this.npc.z) || {}).id || null,
            wantRoom: (ctx.level.roomAt(this.spot.x, this.spot.y + 0.1, this.spot.z) || {}).id || null,
            hops: this._hops, gaveUp: true,
          });
          this.npc.stop();
          this.npc.x = this.spot.x; this.npc.y = this.spot.y; this.npc.z = this.spot.z;
          this.state = TSTATE.WAITING;
          this.waited = 0;
          break;
        }
        if (this.npc.arrived) {
          /* ARRIVED IS NOT THE SAME AS GOT THERE. Npc.update gives up
             on a waypoint nothing can reach and calls stop(), which
             also reads as arrived -- so a supervisor wedged behind a
             filing cabinet announces the baggage room from the middle
             of the east hall and the tour carries on looking fine.
             Recorded rather than fixed here: where it happens is a
             furniture or navigation bug in the level, and the harness
             is what has to see it. */
          /* WRONG ROOM, or a long way off in the right one. Standing
             two meters from the tag desk instead of on it is a person
             standing in a room; standing in the room next door is the
             failure this is looking for. */
          const miss = Math.hypot(this.npc.x - this.spot.x, this.npc.z - this.spot.z);
          const here = ctx.level.roomAt(this.npc.x, this.npc.y + 0.1, this.npc.z);
          const want = ctx.level.roomAt(this.spot.x, this.spot.y + 0.1, this.spot.z);
          const sameRoom = here && want ? here.id === want.id : miss < 4;
          if (!sameRoom || miss > 4.5) {
            this.missed.push({
              id: stop.id, by: miss,
              at: [this.npc.x, this.npc.z], want: [this.spot.x, this.spot.z],
              room: (ctx.level.roomAt(this.npc.x, this.npc.y + 0.1, this.npc.z) || {}).id || null,
              wantRoom: (ctx.level.roomAt(this.spot.x, this.spot.y + 0.1, this.spot.z) || {}).id || null,
              hops: this._hops,
            });
          }
          this.state = TSTATE.WAITING;
          this.waited = 0;
        }
        break;

      case TSTATE.WAITING: {
        /* Face whoever is coming, and wait. A supervisor who starts
           talking to an empty room while the player is still two rooms
           back has taught nothing. */
        const p = ctx.player;
        if (p) this.npc.faceTowards(p.x, p.z, dt);
        this.waited += dt;
        if (gap <= NEAR) {
          this.state = TSTATE.TALKING;
          this.line = 0;
          this.t = LINE_TIME;      // speak the first line at once
        } else if (this.waited > PATIENCE) {
          /* Not coming. Say it anyway rather than deadlocking the
             shift, and move on. */
          this.state = TSTATE.TALKING;
          this.line = 0;
          this.t = LINE_TIME;
        }
        break;
      }

      case TSTATE.TALKING: {
        const look = resolve(ctx.level, stop.look);
        if (look) this.npc.faceTowards(look.x, look.z, dt);
        this.t += dt;
        if (this.t >= LINE_TIME) {
          this.t = 0;
          if (this.line < stop.lines.length) {
            this._say(ctx, stop.lines[this.line]);
            this.line++;
          } else if (stop.task) {
            this.state = TSTATE.TASK;
          } else {
            this.at++;
            this._go(ctx);
          }
        }
        break;
      }

      case TSTATE.TASK: {
        const p = ctx.player;
        if (p) this.npc.faceTowards(p.x, p.z, dt);
        const sh = ctx.shift;
        if (!sh || sh.done.has(stop.task)) {
          this.at++;
          this._go(ctx);
        }
        break;
      }

      default:
        break;
    }

    /* The last stop is a goodbye, not a place: once it has been said,
       the supervisor walks out of the front door and stops existing. */
    if (this.state === TSTATE.TALKING
      && this.at === TOUR.length - 1
      && this.line >= TOUR[this.at].lines.length) {
      const out = resolve(ctx.level, { mark: 'service', key: 'outside' });
      if (out) this.npc.goTo(out.x, this.npc.y, out.z, ctx);
      this.state = TSTATE.LEAVING;
    }
    if (this.state === TSTATE.LEAVING && this.npc.arrived) this._finish(ctx);
  }

  /** What the objective line says while the tour is running. */
  objective() {
    if (!this.running) return '';
    const stop = TOUR[this.at];
    if (!stop) return '';
    if (this.state === TSTATE.TASK) return stop.prompt || '';
    if (this.state === TSTATE.WAITING) return `Follow ${SUPERVISOR.name}`;
    return '';
  }

  /**
   * What the route resolves to in this level, for diagnostics.
   *
   * Every stop names its place through the level's own marks and
   * stations rather than by coordinate, which means a stop can quietly
   * stop resolving when a station is renamed or a counter moves -- and
   * the only symptom in play is a supervisor who walks to the middle of
   * the world and waits there. This is what the harness checks.
   */
  report(level) {
    return TOUR.map((stop) => ({
      id: stop.id,
      task: stop.task || null,
      ok: !!resolve(level, stop.at),
    }));
  }

  /** Everybody this module puts in the world. */
  actors() {
    return this.npc && !this.npc.hidden ? [this.npc] : [];
  }

  save() {
    return {
      state: this.state, at: this.at, line: this.line,
      npc: this.npc ? { x: this.npc.x, y: this.npc.y, z: this.npc.z, yaw: this.npc.yaw } : null,
    };
  }

  restore(d, ctx) {
    if (!d) return;
    this.state = d.state || TSTATE.OFF;
    this.at = d.at || 0;
    this.line = d.line || 0;
    if (!this.running) { this.state = TSTATE.DONE; return; }
    this.start(ctx);
    this.at = d.at || 0;
    this.line = d.line || 0;
    if (d.npc && this.npc) {
      this.npc.x = d.npc.x; this.npc.y = d.npc.y; this.npc.z = d.npc.z;
      this.npc.yaw = d.npc.yaw;
    }
    this._go(ctx);
  }
}
