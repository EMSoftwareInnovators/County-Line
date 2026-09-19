/* ============================================================
   routes.js -- where the coaches go, what it costs, and what is
   running tonight.

   ALL OF IT IS DATA. Nothing in this file does anything; it is the
   timetable, the mileage chart and the fare card, which is what a
   terminal actually runs on. The systems that sell a ticket, load a
   bag and close a manifest read it and none of them contain a
   destination or a price.

   GEOGRAPHY. Augusta sits on the Savannah River at the South Carolina
   line, and in 1998 a company running out of it ran four ways: west up
   the Georgia Railroad corridor to Atlanta, south-east down to
   Savannah, south-west to Macon, and east across the river into South
   Carolina for Charleston. The intermediate stops are the towns that
   corridor actually passes through, and the mileages are road miles,
   because a passenger who wants Waynesboro is buying thirty-two miles
   and not a hundred and twenty-eight.

   FARES. Base plus mileage, rounded to the quarter, which is how an
   interstate carrier's tariff worked and why every fare on the card
   ends in 00, 25, 50 or 75. Four passenger classes, a round-trip
   multiplier under two so the return is worth buying, and no tax line
   -- the federal excise on intercity bus tickets was repealed in 1982
   and Georgia did not levy one.
   ============================================================ */

/**
 * @typedef Stop { name, miles } -- road miles from Augusta.
 */

export const ROUTES = [
  {
    id: 'atl', code: 'ATL', name: 'ATLANTA',
    /** What goes on the roll over the windshield. */
    sign: 'ATLANTA',
    stops: [
      { name: 'Thomson', miles: 34 },
      { name: 'Union Point', miles: 68 },
      { name: 'Madison', miles: 92 },
      { name: 'Conyers', miles: 122 },
      { name: 'Atlanta', miles: 145 },
    ],
  },
  {
    id: 'sav', code: 'SAV', name: 'SAVANNAH',
    sign: 'SAVANNAH',
    stops: [
      { name: 'Waynesboro', miles: 32 },
      { name: 'Millen', miles: 58 },
      { name: 'Statesboro', miles: 84 },
      { name: 'Savannah', miles: 128 },
    ],
  },
  {
    id: 'mcn', code: 'MCN', name: 'MACON',
    sign: 'MACON',
    stops: [
      { name: 'Wrens', miles: 28 },
      { name: 'Sandersville', miles: 56 },
      { name: 'Milledgeville', miles: 78 },
      { name: 'Macon', miles: 105 },
    ],
  },
  {
    id: 'chs', code: 'CHS', name: 'CHARLESTON',
    sign: 'CHARLESTON',
    stops: [
      { name: 'Aiken', miles: 19 },
      { name: 'Barnwell', miles: 48 },
      { name: 'Orangeburg', miles: 88 },
      { name: 'Summerville', miles: 132 },
      { name: 'Charleston', miles: 152 },
    ],
  },
];

export const ROUTE_BY_ID = new Map(ROUTES.map((r) => [r.id, r]));
export const ROUTE_BY_CODE = new Map(ROUTES.map((r) => [r.code, r]));

/* ============================================================
   THE FARE CARD
   ============================================================ */
export const FARE = {
  /** Cents. Every fare is base + miles * perMile, rounded to a quarter. */
  base: 450,
  perMile: 16,
  /** What a return costs as a multiple of the one way. */
  roundTrip: 1.8,
  classes: [
    { id: 'adult', name: 'Adult', factor: 1, note: '' },
    { id: 'child', name: 'Child', factor: 0.5, note: 'under 12, with an adult' },
    { id: 'senior', name: 'Senior', factor: 0.85, note: '65 and over' },
    { id: 'military', name: 'Military', factor: 0.8, note: 'with ID' },
  ],
  /** Checked baggage: two free, then a flat charge a piece. */
  freeBags: 2,
  extraBag: 300,
  /** And over fifty pounds. */
  heavyOver: 50,
  heavyFee: 500,
};

export const CLASS_BY_ID = new Map(FARE.classes.map((c) => [c.id, c]));

/** Round to the nearest quarter, which is what the tariff does. */
export const toQuarter = (cents) => Math.round(cents / 25) * 25;

/** Every stop on every route, for a passenger who names a town. */
export function allStops() {
  const out = [];
  for (const r of ROUTES) for (const s of r.stops) out.push({ route: r.id, ...s });
  return out;
}

/** The stop record, by route and name. Null if that route does not go. */
export function stopOn(routeId, name) {
  const r = ROUTE_BY_ID.get(routeId);
  if (!r) return null;
  const k = String(name).toLowerCase();
  return r.stops.find((s) => s.name.toLowerCase() === k) || null;
}

/**
 * What a ticket costs, in cents.
 *
 * @param spec { route, to, cls, roundTrip }
 * @returns cents, or 0 if that route does not serve that stop
 */
export function fareFor(spec) {
  const stop = stopOn(spec.route, spec.to);
  if (!stop) return 0;
  const cls = CLASS_BY_ID.get(spec.cls || 'adult') || CLASS_BY_ID.get('adult');
  const one = toQuarter(FARE.base + stop.miles * FARE.perMile);
  const total = spec.roundTrip ? one * FARE.roundTrip : one;
  return toQuarter(total * cls.factor);
}

/** What the baggage desk charges for n pieces at these weights. */
export function baggageFee(weights) {
  const w = Array.isArray(weights) ? weights : [];
  let cents = 0;
  if (w.length > FARE.freeBags) cents += (w.length - FARE.freeBags) * FARE.extraBag;
  for (const lb of w) if (lb > FARE.heavyOver) cents += FARE.heavyFee;
  return cents;
}

/* ============================================================
   TONIGHT

   Five coaches between eight and one, which is what a terminal this
   size handles on a Tuesday: two departures out, two arrivals in, and
   one that comes in, turns and goes back out -- which is the one the
   whole shift is shaped around, because it is the only time the player
   is unloading and loading at once.

   Times are minutes from eight o'clock, so the shift clock and the
   schedule cannot disagree about what "21:15" means.
   ============================================================ */
const at = (h, m) => (h - 20) * 60 + m;

export const NIGHT = [
  {
    id: 'gcl-1142', kind: 'depart', route: 'atl', bay: 1,
    time: at(20, 55), driver: 'Pruitt',
    /** Minutes before departure the coach is at the bay. */
    lead: 20,
  },
  {
    id: 'gcl-0863', kind: 'arrive', route: 'sav', bay: 2,
    time: at(21, 40), driver: 'Nance',
    /** How long it stands before it is taken off the bay. */
    stand: 25,
  },
  {
    id: 'gcl-2207', kind: 'turn', route: 'mcn', bay: 3,
    time: at(22, 30), driver: 'Gilliard',
    /** Arrives, unloads, reloads and goes back out as this. */
    outRoute: 'chs', outTime: at(23, 5), lead: 0, stand: 35,
  },
  {
    id: 'gcl-1509', kind: 'depart', route: 'sav', bay: 2,
    time: at(23, 45), driver: 'Odom', lead: 20,
  },
  {
    id: 'gcl-0418', kind: 'arrive', route: 'chs', bay: 4,
    time: at(24, 35), driver: 'Weeks', stand: 20,
  },
];

/**
 * "21:15" from minutes-after-eight, for a board or a manifest.
 *
 * THE MINUTES ARE FLOORED, and they have to be: the shift clock runs
 * at seven and a half terminal minutes a second and is therefore
 * fractional every frame, and a clock that reads 8:0.154 PM is the
 * sort of thing that ships.
 */
export function clockAt(minutes) {
  const t = Math.floor((20 * 60 + minutes) % (24 * 60));
  const h = Math.floor(t / 60), m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** And the same in the twelve-hour form a 1998 departure board used. */
export function boardTime(minutes) {
  const t = Math.floor((20 * 60 + minutes) % (24 * 60));
  const h24 = Math.floor(t / 60), m = t % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}
