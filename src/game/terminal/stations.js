/* ============================================================
   stations.js -- what happens when the player presses the key.

   THE LEVEL SAID WHERE. shift.js says WHAT IS GOING ON. This file is
   the third thing: it turns the two into a line of text and an action,
   once per station, and it is the only place in the game where a
   prompt is written.

   THE ORDER A STATION ANSWERS IN, and it is the same everywhere:

     1  IS SOMETHING WRONG HERE? An incident beats everything. If the
        printer is jammed, the printer does not print, it un-jams.
     2  IS THERE A JOB HERE RIGHT NOW? The window when somebody is at
        it, the bay when a coach is boarding, the register when there
        is money on the counter.
     3  WHATEVER WAS ALREADY BOUND. The breaker panels and the switch
        bank belong to power.js and this file does not take them over;
        it wraps them, so an incident on a panel still shows and the
        panel still works underneath.
     4  AND OTHERWISE, what the thing is. A station with nothing to do
        still says what it is, because a building where half the
        objects do not answer is a building that feels unfinished.

   There is no UI in here beyond `text` and `sub`. The brief asks for
   minimal diegetic interface and that is what a two-line prompt over a
   reticle is.
   ============================================================ */
import { money, sayChange } from './money.js';
import { STEP, bagsFor, moveBags, bagLine } from './service.js';
import { BOARD, boardingReason } from './manifest.js';
import { PSTATE } from './crowd.js';
import { DSTATE } from './drivers.js';
import { CALL } from './pa.js';
import { ROUTE_BY_ID, clockAt } from './routes.js';
import { OPEN_JOBS, CLOSE_JOBS, PHASE, WORKING_ZONES } from './shift.js';

const nothing = (st) => ({ text: st.name, sub: '', action: null, hold: 0 });

/* ============================================================
   THE WINDOW
   ============================================================ */
function window_(sh, ctx, st) {
  const p = sh.crowd.atWindow;
  if (!p) return { text: st.name, sub: 'Nobody waiting.', action: null, hold: 0 };

  /* Somebody who is not buying a ticket. They still have to be dealt
     with, and dealing with them is one press and a sentence. */
  if (!sh.sale) {
    const answer = {
      nothing: 'Tell them which bay it goes from',
      meet: 'Tell them whether it is in',
      parcel: 'Send them round to the baggage desk',
      refund: 'Put them on the next one',
    }[p.req.want] || 'Deal with them';
    return {
      text: answer,
      sub: `${p.req.who} — ${p.says}`,
      action: () => {
        sh.log(`${p.req.who}: ${p.req.want}.`);
        sh.clearWindow();
      },
      hold: 0,
    };
  }

  const line = sh.sale.promptAt('window', sh.drawer);
  if (!line) return { text: st.name, sub: p.says, action: null, hold: 0 };

  if (sh.sale.step === STEP.ASKED) {
    return {
      ...line,
      action: () => {
        if (!sh.sale.fare) { sh.log(`Turned away: ${p.req.to}.`); sh.clearWindow(); return; }
        sh.sale.quote();
      },
      hold: 0,
    };
  }
  if (sh.sale.step === STEP.PRINTED) {
    return { ...line, action: () => sh.sale.finish(), hold: 0 };
  }
  return { ...line, action: null, hold: 0 };
}

/* ============================================================
   THE REGISTER
   ============================================================ */
function register(sh, ctx, st) {
  /* Opening and closing both happen here, and both beat a sale --
     there is no sale at five past eight or at ten to one. */
  if (sh.wants('float')) {
    return {
      text: 'Count the float in',
      sub: `${money(sh.drawer.total)} — thirty ones, ten fives, five tens and twenty in coin`,
      action: () => sh.finish('float'),
      hold: 0.8,
    };
  }
  if (sh.wants('cash-up')) {
    const r = sh.reconcile();
    return {
      text: 'Cash up',
      sub: `${money(r.actual)} against ${money(r.expect)}`
        + (r.out ? ` — ${money(Math.abs(r.out))} ${r.out > 0 ? 'over' : 'short'}` : ' — square'),
      action: () => {
        sh.log(`Cashed up: took ${money(r.took)}, ${r.out ? `${money(Math.abs(r.out))} ${r.out > 0 ? 'over' : 'short'}` : 'square'}.`);
        sh.finish('cash-up');
      },
      hold: 1.2,
    };
  }

  const sale = sh.sale;
  if (!sale) {
    return {
      text: st.name,
      sub: `${money(sh.drawer.total)} in the drawer`,
      action: null, hold: 0,
    };
  }
  const line = sale.promptAt('register', sh.drawer);
  if (!line) return { text: st.name, sub: `${money(sh.drawer.total)} in the drawer`, action: null, hold: 0 };

  if (sale.step === STEP.QUOTED) {
    /* Somebody who has not got enough out is asked for the rest, and
       finds it. One extra press, which is what it takes in life. */
    if (sale.shortBy) {
      return {
        ...line,
        action: () => {
          const was = sale.shortBy;
          sale.topUp();
          sh.log(`${sale.req.who} was ${money(was)} short and found it.`);
        },
        hold: 0,
      };
    }
    return {
      ...line,
      action: () => {
        if (!sale.take()) {
          sh.d.toast(`${sale.req.who} is short. They are counting it again.`);
          return;
        }
        /* What they handed over goes in the drawer, in the notes they
           would actually have had. */
        const notes = sh.drawer.change ? null : null;
        void notes;
        sh.drawer.take(noteBreakdown(sale.paid), 'fare');
      },
      hold: 0,
    };
  }
  if (sale.step === STEP.PAID) {
    const r = sh.drawer.change(sale.changeDue);
    if (!r.ok) {
      return {
        text: 'Short of change',
        sub: `${money(r.short)} that the drawer cannot make`,
        action: null, hold: 0,
      };
    }
    return {
      ...line,
      action: () => {
        const got = sale.change(sh.drawer);
        if (got.ok) sh.drawer.give(got.parts, 'change');
      },
      hold: 0,
    };
  }
  return { ...line, action: null, hold: 0 };
}

/** The notes somebody hands over for an amount, biggest first. */
function noteBreakdown(cents) {
  const out = [];
  let left = cents;
  for (const [id, v] of [['b50', 5000], ['b20', 2000], ['b10', 1000], ['b5', 500],
    ['b1', 100], ['c25', 25], ['c10', 10], ['c5', 5], ['c1', 1]]) {
    const n = Math.floor(left / v);
    if (n > 0) { out.push({ id, n, cents: v * n }); left -= v * n; }
  }
  return out;
}

/* ============================================================
   THE PRINTER
   ============================================================ */
function printer(sh, ctx, st) {
  const sale = sh.sale;
  const line = sale && sale.promptAt('printer');
  if (!line) {
    return { text: st.name, sub: `roll at ${sh.book.next}`, action: null, hold: 0 };
  }
  return {
    ...line,
    action: () => {
      sale.issue(sh.book, Math.round(sh.now));
      if (sale.checks.length) {
        sh.log(`${sale.checks.length} checked to ${sale.req.to}.`);
      }
    },
    hold: 0.35,
  };
}

/* ============================================================
   THE BOARD, THE LOG, THE DESK AND THE PA
   ============================================================ */
function gateBoard(sh, ctx, st) {
  if (sh.wants('board')) {
    return {
      text: 'Put tonight’s departures up',
      sub: `${sh.manifests.size} services`,
      action: () => sh.finish('board'),
      hold: 0.8,
    };
  }
  const rows = sh.board().filter((b) => b.status !== 'DEPARTED').slice(0, 4);
  return {
    text: st.name,
    sub: rows.length
      ? rows.map((b) => `${b.time} ${b.name} bay ${b.bay}${b.status === 'NOW BOARDING' ? ' — BOARDING' : ''}`).join('   ')
      : 'Nothing further tonight.',
    action: null, hold: 0,
  };
}

function shiftLog(sh, ctx, st) {
  if (sh.wants('log')) {
    return {
      text: 'Write up the shift log',
      sub: `${sh.logLines.length} lines, ${sh.incidents.count} still open`,
      action: () => sh.finish('log'),
      hold: 1.0,
    };
  }
  return { text: st.name, sub: sh.logText().slice(-1)[0] || 'Nothing written yet.', action: null, hold: 0 };
}

function clerkDesk(sh, ctx, st) {
  const next = sh.board().find((b) => b.status !== 'DEPARTED');
  return {
    text: st.name,
    sub: next
      ? `Next out: ${next.time} ${next.name}, bay ${next.bay}.`
      : 'Nothing further tonight.',
    action: null, hold: 0,
  };
}

function clerkPhone(sh, ctx, st) {
  if (sh.phone.ringing) {
    return {
      text: 'Answer it',
      sub: sh.phone.ringing.who,
      action: () => {
        const c = sh.phone.answer();
        if (c) { sh.d.toast(`${c.who}: “${c.text}”`); sh.log(`Call: ${c.who}.`); }
      },
      hold: 0,
    };
  }
  return { text: st.name, sub: sh.phone.missed ? `${sh.phone.missed} missed` : '', action: null, hold: 0 };
}

function paDesk(sh, ctx, st) {
  if (!sh.pa.live) {
    return { text: st.name, sub: 'Dead. The amplifier has no power.', action: null, hold: 0 };
  }
  if (sh.pa.busy) return { text: st.name, sub: 'On air.', action: null, hold: 0 };
  /* What is worth announcing is whatever is boarding, or the next one
     that is not. One button, and it says which. */
  const boarding = [...sh.manifests.values()].find((m) => m.state === 'boarding');
  if (boarding) {
    return {
      text: `Call the ${boarding.time}`,
      sub: `${ROUTE_BY_ID.get(boarding.route).name}, bay ${boarding.bay}`,
      action: () => sh.pa.say(CALL.FINAL, boarding),
      hold: 0,
    };
  }
  return { text: st.name, sub: 'Nothing to call.', action: null, hold: 0 };
}

/* ============================================================
   BAGGAGE
   ============================================================ */
function tagDesk(sh, ctx, st) {
  /* Everything at the desk, by route, moved a cart at a time. */
  const waiting = [...sh.book.checks.values()].filter((b) => b.where === 'desk');
  if (!waiting.length) {
    return { text: st.name, sub: 'Nothing waiting to go out.', action: null, hold: 0 };
  }
  const byRoute = new Map();
  for (const b of waiting) byRoute.set(b.route, (byRoute.get(b.route) || 0) + 1);
  const [route, n] = [...byRoute.entries()].sort((a, b) => b[1] - a[1])[0];
  const r = ROUTE_BY_ID.get(route);
  return {
    text: `Take the ${r ? r.name.toLowerCase() : route} bags out to staging`,
    sub: `${n} piece${n === 1 ? '' : 's'}`,
    action: () => {
      const moved = moveBags(sh.book, route, 'desk', 'staging');
      sh.log(`${moved} to staging for ${r ? r.name : route}.`);
    },
    hold: 0.6,
  };
}

function staging(sh, ctx, st, code) {
  const route = code;
  const here = bagsFor(sh.book, route, 'staging');
  const r = ROUTE_BY_ID.get(route);
  return {
    text: st.name,
    sub: here.length
      ? `${here.length} piece${here.length === 1 ? '' : 's'} for ${r ? r.name : route}`
      : 'Empty.',
    action: null, hold: 0,
  };
}

function lostFound(sh, ctx, st) {
  const un = [...sh.book.checks.values()].filter((b) => b.where === 'unclaimed');
  return {
    text: st.name,
    sub: un.length ? `${un.length} unclaimed` : 'A shelf, a ledger, and a box of umbrellas.',
    action: null, hold: 0,
  };
}

function scale(sh, ctx, st) {
  const heavy = [...sh.book.checks.values()].filter((b) => b.weight > 50 && b.where === 'desk');
  return {
    text: st.name,
    sub: heavy.length ? `${heavy.length} over the allowance` : 'Reads zero.',
    action: null, hold: 0,
  };
}

function manifestBoard(sh, ctx, st) {
  const live = [...sh.manifests.values()].filter((m) => m.state !== 'departed');
  return {
    text: st.name,
    sub: live.length
      ? live.map((m) => `${m.time} ${m.boarded.length}p ${m.loaded.length}b`).join('   ')
      : 'All away.',
    action: null, hold: 0,
  };
}

/* ============================================================
   THE BAYS

   The busiest station in the game, and the one with the most to say.
   In order: put the bags on, take the tickets, sign the manifest, and
   send it.
   ============================================================ */
function bay(sh, ctx, st, n) {
  const id = Number(n);
  const m = [...sh.manifests.values()].find((x) => x.bay === id && x.state === 'boarding');
  const coach = sh.fleet && sh.fleet.atBay(id);
  if (!m) {
    return {
      text: st.name,
      sub: coach ? `${coach.sign} standing` : 'No coach at this bay.',
      action: null, hold: 0,
    };
  }
  const r = ROUTE_BY_ID.get(m.route);

  /* 1. bags */
  const ready = bagsFor(sh.book, m.route, 'staging');
  if (ready.length) {
    return {
      text: `Load ${ready.length} piece${ready.length === 1 ? '' : 's'}`,
      sub: `${r.name}, bay ${id}`,
      action: () => {
        for (const b of ready) m.load(b);
        sh.log(`${ready.length} loaded on the ${m.time}.`);
      },
      hold: 0.7,
    };
  }

  /* 2. the people standing at the door */
  const line = sh.crowd.atPlatform(m.route);
  if (line.length) {
    const p = line[0];
    const res = m.check(p.ticket);
    if (res !== BOARD.OK) {
      const other = [...sh.manifests.values()]
        .find((x) => x.route === p.ticket.route && x.state !== 'departed');
      return {
        text: 'Turn them back',
        sub: boardingReason(res, m, other),
        action: () => { sh.crowd.release(p, ctx); },
        hold: 0,
      };
    }
    return {
      text: `Take ${p.req.who}’s ticket`,
      sub: `${line.length} waiting to get on`,
      action: () => { m.lift(p.ticket); sh.crowd.board(p); },
      hold: 0,
    };
  }

  /* 3. the driver's paperwork */
  const drv = sh.crew.driver(m.id) || sh.crew.present.find((d) => d.manifest === m);
  if (!m.signed) {
    const wrong = m.problems(sh.book);
    if (wrong.length) {
      return { text: 'Manifest is not right', sub: wrong[0], action: null, hold: 0 };
    }
    return {
      text: 'Sign the manifest off',
      sub: `${m.boarded.length} aboard, ${m.loaded.length} bags`
        + (drv ? ` — ${drv.name}` : ''),
      action: () => { m.sign(); sh.log(`${m.time} manifest signed.`); },
      hold: 0.8,
    };
  }

  /* 4. and away -- but NOT EARLY. A coach that leaves before its
     time leaves without the people who are still walking out to it,
     and "the eleven forty-five went at eleven twenty" is a phone call
     from Savannah in the morning. Three minutes of grace, which is
     what a driver takes. */
  if (sh.now < m.depart - 3) {
    return {
      text: `${r.name} is ready`,
      sub: `away at ${m.time}`,
      action: null, hold: 0,
    };
  }
  return {
    text: `Send the ${m.time}`,
    sub: `${r.name}, bay ${id}`,
    action: () => sh._depart(m, ctx),
    hold: 0.5,
  };
}

/* ============================================================
   THE CREW SIDE
   ============================================================ */
function timeClock(sh, ctx, st) {
  if (sh.wants('clock-in')) {
    return { text: 'Punch in', sub: clockAt(sh.now), action: () => sh.finish('clock-in'), hold: 0.5 };
  }
  if (sh.wants('clock-out')) {
    return { text: 'Punch out', sub: clockAt(sh.now), action: () => sh.finish('clock-out'), hold: 0.5 };
  }
  return { text: st.name, sub: clockAt(sh.now), action: null, hold: 0 };
}

function driverBoard(sh, ctx, st) {
  const here = sh.crew.present;
  return {
    text: st.name,
    sub: here.length
      ? here.map((d) => `${d.name}${d.state === DSTATE.BREAK ? '' : ' (out)'}`).join(', ')
      : 'Nobody in tonight yet.',
    action: null, hold: 0,
  };
}

/* ============================================================
   THE TABLE
   ============================================================ */
function lobbyMat(sh, ctx, st) {
  if (sh.wants('doors')) {
    return {
      text: 'Unlock the front doors',
      sub: 'and prop them, the way they stay all night',
      action: () => sh.finish('doors'),
      hold: 0.5,
    };
  }
  if (sh.wants('lock')) {
    return {
      text: 'Lock the front doors',
      sub: 'nobody else is getting on anything tonight',
      action: () => sh.finish('lock'),
      hold: 0.5,
    };
  }
  return { text: st.name, sub: '', action: null, hold: 0 };
}

const HANDLERS = {
  'lobby-mat': lobbyMat,
  'ticket-counter': window_,
  register,
  'ticket-printer': printer,
  'gate-board': gateBoard,
  'shift-log': shiftLog,
  'clerk-desk': clerkDesk,
  'clerk-phone': clerkPhone,
  'pa-desk': paDesk,
  'baggage-tags': tagDesk,
  'baggage-scale': scale,
  'lost-found': lostFound,
  'manifest-board': manifestBoard,
  'time-clock': timeClock,
  'driver-board': driverBoard,
};

/**
 * Hang all of it off the stations the level declared.
 *
 * Handlers already bound -- the breaker panels, the switch bank, the
 * conveyor -- are WRAPPED rather than replaced, so power.js keeps its
 * stations and an incident on one of them still shows through.
 */
export function bindShift(level, shift, ctx) {
  void ctx;
  for (const [id, st] of level.stations) {
    const prev = st.handler;
    let mine = HANDLERS[id] || null;
    let arg = null;
    if (!mine && id.startsWith('staging.')) { mine = staging; arg = id.slice(8); }
    if (!mine && id.startsWith('bay-')) { mine = bay; arg = id.slice(4); }
    st.handler = (c, s) => {
      /* 1. is something wrong here */
      const inc = shift.incidents.at(id);
      if (inc) {
        return {
          text: inc.clear,
          sub: inc.note,
          action: () => {
            shift.incidents.clear(inc.id);
            shift.log(`${inc.note} — dealt with.`);
            if (inc.id === 'forms') shift.d.toast('Forms fetched. That is the second floor done with.');
            /* AND ACTUALLY DO THE THING. Where a station already had a
               handler -- a breaker panel, a switch, a machine -- that
               handler IS how the incident is dealt with: clearing
               "driver waiting on coffee" at the coffee maker is
               putting a pot on, and clearing "east wing tripped" at
               panel B is pushing the breaker back up. Anything else
               is a player who has ticked a box. */
            if (prev) {
              const under = prev(c, s);
              if (under && under.action) under.action();
            }
          },
          hold: 0.7,
        };
      }
      /* 2. is there a job here */
      if (mine) {
        const r = mine(shift, c, s, arg);
        if (r) return r;
      }
      /* 3. whatever was bound before this */
      if (prev) return prev(c, s);
      /* 4. and otherwise, what it is */
      return nothing(s);
    };
  }
  return level;
}

export { OPEN_JOBS, CLOSE_JOBS, PHASE, WORKING_ZONES, PSTATE, sayChange, bagLine };
