/* ============================================================
   people.js -- who comes through the door, and what they want.

   FIFTEEN ARCHETYPES, and the point of them is not variety for its own
   sake. It is that the job has to be a JUDGEMENT and not a procedure:
   if everybody wants an adult one-way to the terminus and pays with a
   twenty, the five moves at the window collapse back into pressing E
   five times. So the pool is built out of the things that make a clerk
   stop and think --

     somebody who is not buying a ticket at all;
     somebody buying three tickets of two different classes;
     somebody who names a town rather than a city;
     somebody who pays with a fifty at half past eleven;
     somebody whose coach has already gone;
     somebody who wants the cheapest fare to anywhere;

   -- and every one of those is an ordinary night in a bus station in
   1998. NONE of them is strange. There is nothing in this file that a
   person working a real counter has not dealt with before supper.

   HOW THEY ARE WRITTEN. An archetype is a description and a set of
   WEIGHTS, not a script: which routes they are likely to want, how
   they pay, how patient they are, what they say. The night rolls them
   against the schedule, so the same archetype is a different passenger
   every time and the same passenger is never quite the same twice.
   ============================================================ */
import { ROUTES, ROUTE_BY_ID, FARE } from './routes.js';

/* ---- how a passenger behaves at the window ---- */
export const PAY = {
  EXACT: 'exact',       // counts it out, which is slow and costs nothing
  NOTE: 'note',         // a twenty, usually
  BIG: 'big',           // a fifty, and it is always the worst moment
  COINS: 'coins',       // a handful, counted twice
};

/**
 * @typedef Archetype {
 *   id, who,          what the prompt calls them
 *   line,             what they say when they reach the window
 *   want,             'ticket' | 'nothing' | 'parcel' | 'refund' | 'meet'
 *   routes,           route ids they might be going to, or 'any'
 *   far,              0..1 -- how likely the terminus rather than a stop
 *   cls,              class, or a list to pick from
 *   roundTrip,        chance of a return
 *   bags,             [min, max] pieces
 *   heavy,            chance one of them is over fifty pounds
 *   pay,              a PAY, or a list
 *   patience,         seconds at the window before they get restless
 *   sits,             do they sit down afterwards
 * }
 */
export const ARCHETYPES = [
  {
    id: 'soldier', who: 'a soldier with a duffel',
    line: 'Fort Gordon pass runs out Sunday. One to Atlanta.',
    want: 'ticket', routes: ['atl'], far: 0.9, cls: 'military',
    roundTrip: 0.5, bags: [1, 1], heavy: 0.4, pay: PAY.EXACT,
    patience: 90, sits: true,
  },
  {
    id: 'mother', who: 'a woman with two children',
    line: 'Me and the two of them. They are nine and six.',
    want: 'ticket', routes: ['sav', 'mcn'], far: 0.6, cls: 'adult',
    roundTrip: 0.2, bags: [2, 3], heavy: 0.2, pay: PAY.BIG,
    patience: 70, sits: true, party: 3, partyCls: 'child',
  },
  {
    id: 'student', who: 'a student with a rucksack',
    line: 'Macon. Whatever is cheapest.',
    want: 'ticket', routes: ['mcn', 'atl'], far: 0.8, cls: 'adult',
    roundTrip: 0.1, bags: [0, 1], heavy: 0, pay: PAY.NOTE,
    patience: 120, sits: true,
  },
  {
    id: 'waiting', who: 'a man who has been here since six',
    line: 'Which bay is the Savannah on tonight?',
    want: 'nothing', patience: 40, sits: true,
  },
  {
    id: 'couple', who: 'an elderly couple',
    line: 'Two returns to Aiken, and we come back Thursday.',
    want: 'ticket', routes: ['chs'], far: 0.15, cls: 'senior',
    roundTrip: 0.9, bags: [1, 2], heavy: 0, pay: PAY.EXACT,
    patience: 150, sits: true, party: 2,
  },
  {
    id: 'nurse', who: 'a woman in scrubs',
    line: 'Waynesboro, one way, and I have eleven minutes.',
    want: 'ticket', routes: ['sav'], far: 0.05, cls: 'adult',
    roundTrip: 0, bags: [0, 0], heavy: 0, pay: PAY.EXACT,
    patience: 35, sits: false,
  },
  {
    id: 'parcel', who: 'a man with a taped-up box',
    line: 'This has to be in Milledgeville tomorrow.',
    want: 'parcel', routes: ['mcn'], far: 0.3,
    bags: [1, 1], heavy: 0.5, pay: PAY.NOTE, patience: 80, sits: false,
  },
  {
    id: 'meeting', who: 'a woman watching the platform door',
    line: 'Is the Savannah in? I am meeting somebody off it.',
    want: 'meet', routes: ['sav'], patience: 200, sits: true,
  },
  {
    id: 'drifter', who: 'a man counting change',
    line: 'How far does eleven dollars get me?',
    want: 'ticket', routes: 'any', far: 0.05, cls: 'adult',
    roundTrip: 0, bags: [0, 1], heavy: 0, pay: PAY.COINS,
    patience: 180, sits: true, thrifty: true,
  },
  {
    id: 'company', who: 'a man in a suit with a briefcase',
    line: 'Atlanta return. And I need a receipt for it.',
    want: 'ticket', routes: ['atl'], far: 1, cls: 'adult',
    roundTrip: 1, bags: [0, 1], heavy: 0, pay: PAY.BIG,
    patience: 55, sits: false, receipt: true,
  },
  {
    id: 'arguing', who: 'two people arguing over a timetable',
    line: 'He says the ten-thirty. I say there is no ten-thirty.',
    want: 'nothing', patience: 60, sits: true, party: 2,
  },
  {
    id: 'missed', who: 'a man who has missed his coach',
    line: 'I was in the restroom. Can you put me on the next one?',
    want: 'refund', routes: 'any', patience: 45, sits: true,
  },
  {
    id: 'minor', who: 'a girl of about eleven, and her aunt',
    line: 'She is going to her mother in Statesboro. On her own.',
    want: 'ticket', routes: ['sav'], far: 0.4, cls: 'child',
    roundTrip: 0, bags: [1, 1], heavy: 0, pay: PAY.NOTE,
    patience: 100, sits: true, form: 'unaccompanied minor',
  },
  {
    id: 'dog', who: 'a woman with a carrier',
    line: 'Does he have to go in the baggage bay, or can he sit with me?',
    want: 'ticket', routes: ['chs', 'atl'], far: 0.5, cls: 'adult',
    roundTrip: 0.3, bags: [1, 1], heavy: 0, pay: PAY.NOTE,
    patience: 90, sits: true, question: 'animals',
  },
  {
    id: 'trucker', who: 'a driver whose rig is on the interstate',
    line: 'Atlanta. I have to get back to the yard before six.',
    want: 'ticket', routes: ['atl'], far: 1, cls: 'adult',
    roundTrip: 0, bags: [0, 1], heavy: 0, pay: PAY.NOTE,
    patience: 65, sits: true,
  },
];

export const ARCHETYPE_BY_ID = new Map(ARCHETYPES.map((a) => [a.id, a]));

/* ============================================================
   ROLLING ONE

   A passenger is an archetype plus the dice. What comes out is a
   request the window can serve -- which is exactly the shape
   service.js's Sale takes, and no more.
   ============================================================ */

/** A tiny deterministic generator, so a shift replays the same. */
export function rng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

const pick = (list, r) => list[Math.floor(r() * list.length) % list.length];

/**
 * @param spec { archetype, route, r } -- route forces where they are
 *        going, for a passenger rolled against a particular departure.
 */
export function rollPassenger(spec) {
  const r = spec.r || Math.random;
  const a = typeof spec.archetype === 'string'
    ? ARCHETYPE_BY_ID.get(spec.archetype) : spec.archetype;
  if (!a) return null;

  let route = spec.route || null;
  if (!route) {
    if (a.routes === 'any') route = pick(ROUTES, r).id;
    else if (Array.isArray(a.routes)) route = pick(a.routes, r);
  }
  const rt = ROUTE_BY_ID.get(route);

  /* Where on that road. `far` is how often somebody is going all the
     way rather than to a town on it, and a terminal's traffic is
     mostly the terminus -- but not all of it, which is the whole
     reason the mileage chart exists. */
  let to = null;
  if (rt) {
    const last = rt.stops[rt.stops.length - 1];
    to = (r() < (a.far === undefined ? 0.7 : a.far))
      ? last.name
      : pick(rt.stops.slice(0, -1), r).name;
  }

  const bagRange = a.bags || [0, 0];
  const n = bagRange[0] + Math.floor(r() * (bagRange[1] - bagRange[0] + 1));
  const bags = [];
  for (let i = 0; i < n; i++) {
    const heavy = r() < (a.heavy || 0);
    bags.push(heavy ? 52 + Math.floor(r() * 14) : 14 + Math.floor(r() * 26));
  }

  return {
    archetype: a.id,
    who: a.who,
    line: a.line,
    want: a.want || 'ticket',
    route, to,
    cls: a.cls || 'adult',
    party: a.party || 1,
    partyCls: a.partyCls || null,
    roundTrip: r() < (a.roundTrip || 0),
    bags,
    pay: a.pay || PAY.NOTE,
    patience: a.patience || 90,
    sits: a.sits !== false,
    receipt: !!a.receipt,
    form: a.form || null,
    question: a.question || null,
    thrifty: !!a.thrifty,
  };
}

/** How much this passenger hands over for a fare, in cents. */
export function paymentFor(p, total, r) {
  const roll = r || Math.random;
  switch (p.pay) {
    case PAY.EXACT: return total;
    case PAY.BIG: return Math.ceil(total / 5000) * 5000;
    case PAY.COINS: {
      /* Enough, but in the smallest things they have, and it takes a
         minute. Never more than a dollar over. */
      return total + Math.floor(roll() * 100);
    }
    default: {
      const n = Math.ceil(total / 2000) * 2000;
      return n === total ? n + 2000 : n;
    }
  }
}

/** What a party of this shape costs as separate tickets. */
export function ticketsFor(p) {
  const out = [{ cls: p.cls, n: 1 }];
  if (p.party > 1) {
    out.push({ cls: p.partyCls || p.cls, n: p.party - 1 });
  }
  return out;
}

/** Everything the desk would charge them, before the clerk quotes it. */
export const maxBags = () => FARE.freeBags;
