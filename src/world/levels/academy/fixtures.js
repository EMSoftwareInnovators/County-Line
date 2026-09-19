/* ============================================================
   fixtures.js -- the panel schedule, and the lights themselves.

   ------------------------------------------------------------
   THE BUILDING FACT THIS WHOLE MODULE EXISTS FOR

   The Old Academy opened in 1802. It has no electrical service in its
   fabric, because nobody had any. What it has is a retrofit: a supply
   brought in at some point after 1890 and extended, re-extended and
   patched ever since, all of it on the surface of the plaster, all of it
   fed from one place -- the room the museum called the DOCENT LIBRARY,
   which Richmond Central uses as its night clerk's office because that
   is where the panels are.

   So: twelve circuits, one panel wall, and a bank of labelled switches
   beside it. Every light in the building is on exactly one of them, and
   every powered device names one. Turning a breaker off turns a wing of
   the terminal off.
   ------------------------------------------------------------

   HOW IT IS BAKED. Vertex light is baked once, which is why it is cheap
   and why a switch normally cannot do anything. Every vertex therefore
   carries two shade values -- lit and dark -- and a circuit going out
   sets a blend per room chunk. See MeshBuilder.dark and Level.chunkLit.

   The consequence, stated so nobody has to find it out: SPILL DOES NOT
   MOVE. The lit bake includes every fitting in the building, so light
   spilling from the lobby into the waiting room is baked into the
   waiting room. Switch the lobby off and the waiting room loses its own
   fittings but keeps that spill in the lit term it is blending away
   from. At one shade value per vertex there is no honest way around it,
   and at this resolution nobody has noticed.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { fillLight, pointLight, wiredDown, wiredFill } from '../../lighting.js';
import { ROOMS, room } from './rooms.js';
import { pendant, strip, utility, sconce, lantern, flood, pole, bulkhead } from './fittings.js';
import { YARD } from './terminal/platform.js';

/* ============================================================
   THE PANEL SCHEDULE

   Twelve circuits. Not one per bulb -- a panel with a hundred and forty
   breakers in it is a panel nobody can use, and it is not what is on the
   wall of a building like this. `label` is what is typed on the card
   inside the cabinet door, and it is what the player reads.

   `panel` is which cabinet: A is the original 1920s six-way with four of
   its ways still live, B is the 1950s addition that took the wings, C is
   the 1970s subpanel that took the second floor and the yard.

   `rating` is what the way is good for, in amps, and it is the reason
   the east wing is the one that trips. Panel A's ways are 1920s
   fifteens. B and C are twenties. The east rear circuit carries the
   baggage room's lights, the scale, the conveyor and a vending machine
   whose compressor cycles, and the sum of the last three with the first
   is four amps over what a 1950s panel way was ever meant to hold. See
   electrical.js -- nothing in this building trips except arithmetic.
   ============================================================ */
export const CIRCUITS = [
  { id: 'lobby', panel: 'A', breaker: 2, rating: 15, label: 'MAIN LOBBY',
    rooms: ['academy.central'] },
  { id: 'west-front', panel: 'A', breaker: 4, rating: 15, label: 'WAITING RM - WEST',
    rooms: ['academy.indians', 'academy.west.store'] },
  { id: 'east-front', panel: 'A', breaker: 6, rating: 15, label: 'WAITING RM - EAST / NEWSSTAND',
    rooms: ['academy.giftshop', 'academy.americana.main'] },
  { id: 'clerk', panel: 'A', breaker: 8, rating: 15, label: 'OFFICE & DISPATCH',
    rooms: ['academy.west.docent', 'academy.west.offices'] },

  { id: 'west-rear', panel: 'B', breaker: 1, rating: 20, label: 'W REAR / RESTRM / W STAIR',
    rooms: ['academy.west.rearhall', 'academy.west.restroom', 'academy.west.stairhall'] },
  { id: 'east-rear', panel: 'B', breaker: 3, rating: 20, label: 'E REAR / BAGGAGE / E STAIR',
    rooms: ['academy.east.rearhall', 'academy.east.animal', 'academy.east.staff',
      'academy.east.stairhall', 'academy.east.entry', 'academy.east.service',
      'academy.east.vestibule', 'academy.east.council'] },
  { id: 'porch-rear', panel: 'B', breaker: 5, rating: 20, label: 'REAR PORCH',
    rooms: ['academy.porch.rear'] },
  { id: 'front-ext', panel: 'B', breaker: 7, rating: 20, label: 'FRONT EXTERIOR',
    rooms: ['academy.porch.front', 'academy.gallery', 'academy.grounds.front'] },

  { id: 'floor2-west', panel: 'C', breaker: 2, rating: 20, label: '2ND FL WEST',
    rooms: ['academy.upper.west.rotating', 'academy.upper.west.landing',
      'academy.upper.west.history'] },
  { id: 'floor2-center', panel: 'C', breaker: 4, rating: 20, label: '2ND FL CENTER',
    rooms: ['academy.upper.center.war', 'academy.upper.center.mammals'] },
  { id: 'floor2-east', panel: 'C', breaker: 6, rating: 20, label: '2ND FL EAST',
    rooms: ['academy.upper.east.natural', 'academy.upper.east.landing',
      'academy.upper.east.minerals', 'academy.upper.east.archives'] },
  { id: 'garden', panel: 'C', breaker: 8, rating: 20, label: 'GARDEN / REAR EXT',
    rooms: ['academy.garden', 'academy.grounds.rear'] },
  { id: 'platform', panel: 'C', breaker: 10, rating: 20, label: 'PLATFORM & SERVICE EXT',
    rooms: ['academy.grounds.west', 'academy.grounds.east'] },
];

/** Circuit id -> record. */
export const CIRCUIT_BY_ID = new Map(CIRCUITS.map((c) => [c.id, c]));

/** Room id -> circuit id, so a chunk knows which breaker dims it. */
export const ROOM_CIRCUIT = (() => {
  const m = new Map();
  for (const c of CIRCUITS) for (const r of c.rooms) m.set(r, c.id);
  return m;
})();

/* ============================================================
   THE FITTING SCHEDULE

   One row per room: what kind of fitting, how many and in what grid, how
   high above that room's floor the lamp hangs, and how bright the floor
   directly under it should end up.

   THE REACH AND THE INTENSITY ARE DERIVED, NOT TUNED. The sampler falls
   off as (1 - d/r) squared, so a fitting fourteen feet over a floor and
   a fitting nine feet over one need completely different numbers to put
   the same light on the boards -- and hand-tuning forty of them is how a
   building ends up with one room lit like an operating theater and the
   next like a cellar. That happened once already on the way here. So a
   row states the two things a lighting designer actually decides, `mount`
   and `target`, and the arithmetic below turns them into a radius and an
   intensity.

   REACH is the radius as a multiple of the mounting height, and it is
   the one aesthetic number here: raise it and the light spreads into a
   flat wash, lower it and every fitting becomes a spotlight on a black
   stage. It is also what decides how far a fitting reaches THROUGH A
   WALL, because nothing here casts a shadow. 2.8 looked right in one
   room and lit the next one through the plaster; 2.2 stops a pool about
   twelve feet out from a fitting ten feet up, which in a thirty-one foot
   room means a lit middle, dark corners, and not much arriving next
   door. Which is the brief.

   `target` is where the gloom is actually decided:

       0.78 - 0.82   the lobby, the waiting rooms, the stair halls: a
                     working level
       0.62 - 0.76   halls, baggage, the break room, the clerk's office,
                     the restroom -- all of which also collect spill
                     from whatever is next to them, so they are set
                     lower than they read
       0.54 - 0.62   stores, closets, records
       0.52 - 0.58   the whole upper floor

   Ambient adds 0.30 to all of it. Nothing in the building reaches 1.0
   except the lamps themselves.

   ------------------------------------------------------------
   THESE NUMBERS HAVE BEEN WRONG TWICE, AND THE SECOND TIME IS WHY
   tools/lum.mjs EXISTS.

   The first set was tuned against the sampler: 0.72 on the boards under
   a pendant, which is a perfectly respectable number, and the rendered
   lobby came back at a mean pixel of 32 of 255.

   The second set was tuned against the MEAN PIXEL of nine views, the
   means came back in the fifties, and the building was still not
   playable -- every room in it but the ticket hall was reported by the
   person playing it as having "absolutely no way to see". The mean was
   measuring the wrong thing. A frame with a lit doorway in it and
   everything else near black has a perfectly respectable mean, and what
   a player experiences is the part of the frame carrying no
   information at all.

   So the third set was tuned against the DARK TAIL, over every room in
   the building rather than nine views, from places a player can
   actually stand -- and three of the four causes turned out not to be
   in this table at all. See tools/lum.mjs, postfx.js (the tube was
   multiplying the shadows toward zero), lighting.js (the pools fell off
   too fast to meet each other) and fittings.js (every lamp body in the
   building was rendering as a black slab). This table did the rest.
   ------------------------------------------------------------

   WHY THE LIGHT DOES NOT LEAK EVERYWHERE, given radii of thirty feet in
   rooms half that across and no shadowing of any kind: the half-lambert
   term. A wall's inner face is turned away from a fitting on the other
   side of it, and a ceiling is turned away from a bulb on the floor
   above, so both get 22% of what the distance alone would give. That is
   not occlusion, but at one shade value per vertex it is a remarkably
   good imitation of it.
   ============================================================ */
const REACH = 2.2;

export const SCHEDULE = [
  /* ---- public, first floor ----
     The rooms a whole shift is spent in. These carry a working level:
     you count change, read a manifest and check a tag against a ticket
     in them, and the brief is explicit that normal work must not be
     frustrating. */
  { id: 'academy.central', fit: 'pendant', mount: 11.25, target: 0.92 },
  /* THE TASK LIGHTS. A room's grid lights the room; these light the
     work. Two four-foot strips over the ticket counter, hung lower
     than the pendants and on the same way, which is exactly what a bus
     company does to a hall it has to count change in. */
  {
    id: 'academy.central', fit: 'strip', mount: 9.5, target: 0.70, len: ftin(4, 0),
    at: [[ft(-16), ft(4.6)], [ft(-8), ft(4.6)]],
  },
  { id: 'academy.indians', fit: 'pendant', mount: 11.5, target: 0.92 },
  { id: 'academy.giftshop', fit: 'pendant', mount: 11.5, target: 0.88 },
  { id: 'academy.americana.main', fit: 'pendant', mount: 11.5, target: 0.90 },
  /* over the transfers and refunds window at the north end */
  {
    id: 'academy.americana.main', fit: 'strip', mount: 9.5, target: 0.60, len: ftin(4, 0),
    at: [[ft(43), ft(4)]],
  },
  /* and over the newsstand counter, down the west wall */
  {
    id: 'academy.giftshop', fit: 'strip', mount: 9.5, target: 0.60, len: ftin(4, 0),
    axis: 'z', at: [[ft(26), ft(-18.5)]],
  },

  /* ---- staff and service, first floor ----
     Chain-hung fluorescent, ten feet up, which is what a bus company
     screws into a fifteen-foot room it has to work in. Barely under the
     public rooms: these are workrooms, and a bus company lights a
     baggage room it loses suitcases in better than its own lobby. */
  { id: 'academy.west.docent', fit: 'strip', mount: 10, target: 0.88, len: ftin(4, 0) },
  { id: 'academy.west.store', fit: 'utility', mount: 10, target: 0.72 },
  { id: 'academy.west.offices', fit: 'strip', mount: 10, target: 0.80, len: ftin(4, 0) },
  { id: 'academy.west.rearhall', fit: 'strip', mount: 10, target: 0.76, len: ftin(4, 0), axis: 'z' },
  /* a four-foot-deep room takes one row down its length, not a grid */
  { id: 'academy.west.restroom', fit: 'strip', nz: 1, mount: 9.5, target: 0.80, len: ftin(4, 0) },
  { id: 'academy.west.stairhall', fit: 'pendant', mount: 10.75, target: 0.86 },
  { id: 'academy.east.rearhall', fit: 'strip', mount: 10, target: 0.76, len: ftin(4, 0), axis: 'z' },
  { id: 'academy.east.stairhall', fit: 'pendant', mount: 10.75, target: 0.86 },
  { id: 'academy.east.entry', fit: 'strip', nz: 1, mount: 10, target: 0.76, len: ftin(4, 0) },
  { id: 'academy.east.animal', fit: 'strip', mount: 10, target: 0.88, len: ftin(4, 0) },
  /* over the scale and the tag desk, which is where the work is */
  {
    id: 'academy.east.animal', fit: 'strip', mount: 8.5, target: 0.56, len: ftin(4, 0),
    axis: 'z', at: [[ft(27.25), ft(29.5)]],
  },
  { id: 'academy.east.staff', fit: 'strip', mount: 10, target: 0.86, len: ftin(4, 0) },
  { id: 'academy.east.service', fit: 'utility', mount: 10, target: 0.74 },
  { id: 'academy.east.vestibule', fit: 'utility', mount: 9.5, target: 0.74 },
  { id: 'academy.east.council', fit: 'utility', mount: 10, target: 0.76 },

  /* ---- the upper floor ----
     A bulb on a cord, and dimmer bulbs than downstairs. The bus company
     inherited a whole second story it never needed and lights it like
     the store room it uses it as. This is most of why upstairs reads as
     unfamiliar, and it is on purpose -- but it is a floor the player is
     sent to do an errand on, so unfamiliar is as far as it goes. The
     grid is derived like everywhere else, which is the change that
     matters up here: these rooms are the biggest in the building and
     had four bulbs between eleven hundred square feet. */
  { id: 'academy.upper.west.rotating', fit: 'utility', mount: 12, target: 0.68 },
  { id: 'academy.upper.west.landing', fit: 'utility', mount: 12, target: 0.72 },
  { id: 'academy.upper.west.history', fit: 'utility', mount: 12, target: 0.68 },
  { id: 'academy.upper.center.war', fit: 'pendant', mount: 8.5, target: 0.72 },
  { id: 'academy.upper.center.mammals', fit: 'pendant', mount: 8.5, target: 0.72 },
  { id: 'academy.upper.east.natural', fit: 'utility', mount: 12, target: 0.68 },
  { id: 'academy.upper.east.landing', fit: 'utility', mount: 12, target: 0.72 },
  { id: 'academy.upper.east.minerals', fit: 'utility', mount: 12, target: 0.70 },
  { id: 'academy.upper.east.archives', fit: 'utility', mount: 12, target: 0.68 },
];

/* ============================================================
   HOW MANY FITTINGS A ROOM GETS

   THE GRID IS DERIVED FROM THE ROOM, not typed into the table.

   It used to be typed in, and the table was wrong almost everywhere,
   because `nx: 2, nz: 2` looks equally reasonable next to a twelve-foot
   store room and next to the thirty-one by thirty-eight foot gallery
   over the west wing -- and those are a hundred and twenty square feet
   per lamp and two hundred and ninety. Four bare bulbs in eleven
   hundred square feet is not a dark room by choice, it is a room nobody
   counted. Half the building was lit like that, which is why it stayed
   unplayable after the levels went up: the levels were right and the
   COUNT was wrong.

   So a row says what kind of fitting and how bright, and the spacing
   below says how far apart that kind goes. A room takes as many as it
   needs to hold that spacing, rounded to a whole number and never fewer
   than one. Rooms may still say `nx`/`nz` when the answer is not a grid
   -- a four-foot-deep restroom wants one row of two, not two by two --
   and `at` when somebody hung a lamp over a work surface on purpose.

   The spacings are what the fitting can actually cover at the height it
   hangs, which is why they differ: a pendant eleven feet up throws
   further than a bare bulb screwed to a twelve-foot ceiling with a
   shade the size of a teacup.
   ============================================================ */
const SPACING = {
  pendant: ft(12.5),
  strip: ft(11),
  utility: ft(10.5),
};

/** How many fittings fit across a span, at that kind's spacing. */
const countFor = (span, fit) =>
  Math.max(1, Math.round(span / (SPACING[fit] || ft(11))));

/**
 * Where the fittings in a room actually hang.
 *
 * A row is normally a GRID, spread evenly, which is what a contractor
 * does to a room with nothing in it yet. A row may instead give `at`, a
 * list of world coordinates, which is what happens when somebody later
 * hangs a light over the thing people actually work at: the ticket
 * counter, the tag desk, the refund window. Those are separate rows on
 * the same room, and that is the point -- the room has its general
 * light AND its task light, and they are different fittings at
 * different heights answering different questions.
 */
export function positions(r, row) {
  if (row.at) return row.at;
  const nx = row.nx || countFor(r.w, row.fit);
  const nz = row.nz || countFor(r.d, row.fit);
  const out = [];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      out.push([
        r.x0 + r.w * ((i + 0.5) / nx),
        r.z0 + r.d * ((j + 0.5) / nz),
      ]);
    }
  }
  return out;
}

/** The lamp's own height, and how far it hangs under the plaster. */
const mountY = (r, row) => r.y + ft(row.mount);
const dropOf = (r, row) => r.ceil - ft(row.mount);
const reachOf = (row) => ft(row.mount) * REACH;

/**
 * What one fitting has to be worth for the floor under it to reach
 * `target` -- WITH THE REST OF THE ROOM'S FITTINGS ADDING IN.
 *
 * This is not `target / UNDER`. That is right for a room with one
 * fitting in it and wrong everywhere else: the clerk's office is ten
 * feet deep with two strips five feet apart, so each lands most of its
 * own pool on the other's, and the first cut of this had that room
 * pinned at the clamp -- a blown-out white box in a building whose whole
 * point is gloom.
 *
 * So the model is evaluated instead of assumed. Every fitting in the
 * room contributes to the point under the first one, through the same
 * distance falloff and the same downward-shade term the sampler uses,
 * and the intensity is whatever makes that sum come out at `target`.
 */
function powerOf(r, row) {
  const reach = reachOf(row);
  const h = ft(row.mount);
  const pos = positions(r, row);
  const [px, pz] = pos[0];
  let sum = 0;
  for (const [x, z] of pos) {
    const flat = Math.hypot(x - px, z - pz);
    const d = Math.hypot(flat, h);
    if (d >= reach) continue;
    /* The same shape the sampler uses. These two have to agree: the
       whole point of deriving intensity rather than tuning it is that
       `target` means the illumination that actually arrives, and it
       stops meaning that the moment this line and lighting.js disagree
       about how a pool falls off. */
    const k = 1 - d / reach;
    const a = k * k * 0.62 + k * 0.38;
    const below = h / d;
    sum += a * (below * below * 0.75 + below * 0.25);
  }
  return row.target / Math.max(1e-6, sum);
}

/* ============================================================
   EXTERIOR AND PORCH FITTINGS

   Declared by hand rather than from the room table: a porch is a
   rectangle with no ceiling to hang anything from, and where a lantern
   goes is decided by where the door is.
   ============================================================ */
const EXTERIOR = [
  /* ---- the front portico ----
     A lantern each side of the double doors, one at each end of the
     recess, and a flood high on each flanking wall over the steps.

     EVERY ONE OF THESE MOUNTS ON A WALL FACE, EXACTLY. Two inches
     proud is a fitting floating off the plaster; two inches shy is a
     fitting inside it, sharing the masonry's own face plane and fighting
     it for the pixels. The faces are X_BAY_W / X_BAY_E for the recess
     sides, Z_CENTRAL_S_OUT for the wall the doors are in. */
  { c: 'front-ext', fit: 'lantern', x: -ftin(4, 6), z: D.Z_CENTRAL_S_OUT, y: ftin(8, 0), face: 'south', mount: 8, target: 0.6 },
  { c: 'front-ext', fit: 'lantern', x: ftin(4, 6), z: D.Z_CENTRAL_S_OUT, y: ftin(8, 0), face: 'south', mount: 8, target: 0.6 },
  { c: 'front-ext', fit: 'lantern', x: D.X_BAY_W, z: ft(-21), y: ftin(8, 0), face: 'east', mount: 8, target: 0.46 },
  { c: 'front-ext', fit: 'lantern', x: D.X_BAY_E, z: ft(-21), y: ftin(8, 0), face: 'west', mount: 8, target: 0.46 },
  { c: 'front-ext', fit: 'flood', x: D.X_BAY_W, z: ft(-28), y: ftin(13, 0), face: 'east', mount: 13, target: 0.44 },
  { c: 'front-ext', fit: 'flood', x: D.X_BAY_E, z: ft(-28), y: ftin(13, 0), face: 'west', mount: 13, target: 0.44 },

  /* rear porch: three lanterns along the central block's north wall */
  { c: 'porch-rear', fit: 'lantern', x: -ftin(12, 0), z: D.Z_CENTRAL_N_OUT, y: ftin(8, 6), face: 'north', mount: 8.5, target: 0.52 },
  { c: 'porch-rear', fit: 'lantern', x: 0, z: D.Z_CENTRAL_N_OUT, y: ftin(8, 6), face: 'north', mount: 8.5, target: 0.52 },
  { c: 'porch-rear', fit: 'lantern', x: ftin(12, 0), z: D.Z_CENTRAL_N_OUT, y: ftin(8, 6), face: 'north', mount: 8.5, target: 0.52 },

  /* The garden: one flood on each wing's garden wall, aimed down into
     the court, and nothing else. It is mostly dark and meant to be --
     the brief says the garden is lit by what spills out of the windows
     and the porch, and two floods is already generous. */
  { c: 'garden', fit: 'flood', x: D.X_BAY_W, z: ft(34), y: ftin(12, 0), face: 'east', mount: 12, target: 0.3 },
  { c: 'garden', fit: 'flood', x: D.X_BAY_E, z: ft(50), y: ftin(12, 0), face: 'west', mount: 12, target: 0.3 },

  /* The two historic side doors: the west one is the coach platform
     route, the east ones are staff and service. */
  { c: 'platform', fit: 'lantern', x: D.X_W_OUT, z: ft(43), y: ftin(8, 6), face: 'west', mount: 11.5, target: 0.54 },
  { c: 'platform', fit: 'lantern', x: D.X_E_OUT, z: ft(43), y: ftin(8, 6), face: 'east', mount: 11.5, target: 0.52 },
  { c: 'platform', fit: 'lantern', x: D.X_E_OUT, z: ft(19.5), y: ftin(8, 6), face: 'east', mount: 11.5, target: 0.52 },

  /* ============================================================
     THE COACH YARD

     THE FIRST CUT OF THIS HAD NO LIGHT IN IT AT ALL, which nobody
     noticed until the whole yard came back from the screenshot harness
     at ninety-seven per cent black. The fittings were there -- three
     floods drawn on the canopy fascia -- but they were drawn in
     platform.js, and vertex light is BAKED AS GEOMETRY IS CREATED, so
     anything declared after the shell lights nothing. Every light in
     the building is declared here, before a single wall exists, and
     that is not a style rule.

     Three kinds, because a yard has three jobs:

       BULKHEADS under the canopy soffit, over the walking lane and
       the coach doors. This is the light passengers read a ticket by.
       FLOODS on the canopy fascia, aimed west over the berths, so a
       driver can see the painted lines and a loader can see a bay
       door.
       TWO POLES in the drive aisle, twenty-one feet up, which is what
       a company puts in a yard it reverses forty-foot coaches around
       in -- high enough to be out of a driver's mirror.

     Nothing is fixed to the 1856 elevation. See platform.js.
     ============================================================ */
  ...[ft(20), ft(34), ft(48), ft(62), ft(76)].map((z) => ({
    c: 'platform', fit: 'bulkhead',
    x: YARD.platX0 + ftin(4, 0), z, y: D.GRADE + ftin(11, 2),
    mount: 11.2, target: 0.58,
  })),
  ...[ft(21), ft(45), ft(69)].map((z) => ({
    c: 'platform', fit: 'flood',
    x: YARD.platX0 - inch(8), z, y: D.GRADE + ftin(10, 2), face: 'west',
    mount: 10.2, target: 0.44,
  })),
  ...[ft(22), ft(51), ft(80)].map((z) => ({
    c: 'platform', fit: 'pole',
    x: ft(-136), z, y: D.GRADE + ftin(21, 0), arm: 'east',
    mount: 21, target: 0.4,
  })),
];

/* ============================================================
   PHASE ONE: THE LIGHTS

   Called before any geometry, because vertex light is baked as geometry
   is created. Nothing here draws anything.
   ============================================================ */
export function declareLights(b) {
  /* ---- what is burning whatever the panel says ----
     The moon, the streetlights on Telfair Street, and the glow off the
     city. These carry no circuit, so they are in the DARK bake too: a
     room with its breaker off still has a window in it. */
  b.light(fillLight(0, ft(120), ft(20), ft(400), 0.07));
  for (const x of [ft(-70), ft(70)]) {
    b.light(pointLight(x, ftin(22, 0), D.Z_FACADE - ft(58), ft(80), 0.16));
  }

  /* ---- EVERY ROOM IN THE BUILDING IS LIT ----
     Not "every room somebody remembered". The schedule is a hand-written
     list and rooms.js is the truth, and a room that falls out of the
     first while staying in the second is a room with no ceiling fitting
     in it at all -- which is not a dark room by choice, it is a bug that
     looks exactly like one. Cheap to check, and it can only ever fire
     while a room is being added. */
  const lit = new Set(SCHEDULE.map((row) => row.id));
  const unlit = ROOMS.filter((r) => !lit.has(r.id)).map((r) => r.id);
  if (unlit.length) {
    throw new Error(`rooms with no ceiling fitting: ${unlit.join(', ')}`);
  }

  /* ---- the fittings, room by room ---- */
  for (const row of SCHEDULE) {
    const r = room(row.id);
    const c = ROOM_CIRCUIT.get(row.id);
    if (!c) throw new Error(`room ${row.id} is on no circuit`);
    const y = mountY(r, row);
    const reach = reachOf(row), power = powerOf(r, row);
    for (const [x, z] of positions(r, row)) {
      b.light(wiredDown(c, x, y, z, reach, power));
      /* Bounce off the floor under each fitting, so the room does not
         read as a spotlight on a black stage. It goes out with the same
         breaker.

         THIS IS THE TERM THAT LIGHTS UNDERSIDES. It is a `fill`, so it
         ignores which way a surface faces, and that is exactly what a
         soffit needs: every fitting in this building throws down, so the
         underside of a stair run, a counter or a shelf is turned away
         from every lamp that could reach it and the half-lambert leaves
         it at 22%. Against dark stair wood that came out as a black
         wedge across a third of the west stair hall. */
      b.light(wiredFill(c, x, r.y + ftin(2, 6), z, reach * 0.52, row.target * 0.38));
    }
  }

  /* ---- outdoors ---- */
  for (const e of EXTERIOR) {
    const out = (e.face === 'south' || e.face === 'west') ? -1 : 1;
    const alongX = e.face === 'north' || e.face === 'south';
    /* A fitting on a wall stands seven inches off it; one hanging from
       a soffit or a pole arm is already where it is. */
    const off = e.face ? inch(7) : 0;
    const lx = alongX ? e.x : e.x + out * off;
    const lz = alongX ? e.z + out * off : e.z;
    /* A single fitting outdoors, so the one-lamp arithmetic is right
       here: what the falloff leaves directly under it, at REACH. */
    const reach = ft(e.mount) * REACH;
    const k = 1 - 1 / REACH;
    const power = e.target / (k * k * 0.62 + k * 0.38);
    b.light(wiredDown(e.c, lx, e.y, lz, reach, power));
    b.light(wiredFill(e.c, lx, e.y - ftin(4, 0), lz, reach * 0.45, e.target * 0.3));
  }
}

/* ============================================================
   PHASE TWO: THE FITTINGS THEMSELVES

   Called after the shell and the floors, so there are ceilings to hang
   things from. Geometry only -- the light was declared above.
   ============================================================ */
export function buildFixtures(b) {
  /* The wiring itself, as data. The level says what is on what; what a
     breaker DOES is game/terminal/electrical.js's business. */
  b.electrical({ circuits: CIRCUITS, chunks: chunkCircuits() });

  for (const row of SCHEDULE) {
    const r = room(row.id);
    b.chunk(row.id);
    b.detail(2.4);
    const ceil = r.ceilY;
    const drop = dropOf(r, row);
    for (const [x, z] of positions(r, row)) {
      if (row.fit === 'pendant') pendant(b, { x, z, ceil, drop });
      else if (row.fit === 'strip') strip(b, { x, z, ceil, len: row.len, axis: row.axis, drop });
      else utility(b, { x, z, ceil, drop });
    }
  }

  /* ============================================================
     WHAT THE FITTINGS SOUND LIKE

     A four-foot fluorescent strip hums at a hundred and twenty hertz
     and it is one of the two sounds a 1998 back office has. Every
     strip in the schedule gets an emitter at the fitting, which means
     the hum is in the room the fitting is in and stops with that
     room's breaker -- see game/terminal/sound.js, which gates them on
     the circuit. The pendants and the bulbs on cords are silent,
     because incandescent lamps are.
     ============================================================ */
  for (const row of SCHEDULE) {
    if (row.fit !== 'strip') continue;
    const r = room(row.id);
    for (const [x, z] of positions(r, row)) {
      b.ambience({
        kind: 'fluorescent', x, y: mountY(r, row), z,
        maxDist: ft(26), gain: 0.34, room: row.id,
      });
    }
  }

  for (const e of EXTERIOR) {
    b.chunk(CIRCUIT_BY_ID.get(e.c).rooms[0]);
    b.detail(2.4);
    if (e.fit === 'lantern') lantern(b, e);
    else if (e.fit === 'flood') flood(b, e);
    else if (e.fit === 'pole') pole(b, { ...e, ground: D.GRADE + inch(1) });
    else if (e.fit === 'bulkhead') bulkhead(b, e);
    else sconce(b, e);
  }
}

/* ============================================================
   WHAT EACH CIRCUIT DIMS

   A room's own chunk holds its floor finish, its partitions, its trim
   and its furniture, so a room is one circuit and that is easy. The
   problem is everything else the player can see from inside it:

     THE ENVELOPE. A wall's geometry lives in one chunk per elevation
     segment -- ext.west.north is sixty feet of masonry from grade to
     parapet -- and that one mesh carries the inside faces of TWO floors
     of rooms as well as the outside face of the building. It cannot
     belong to one circuit.

     THE SLABS. floor2.west.front is the second floor's boards on top
     and the first floor's plaster ceiling underneath. Two circuits, one
     mesh, and nobody is going to split it.

   So a chunk names every circuit that lights it and gets the MEAN: an
   elevation with two of its four circuits burning comes out half lit.
   That is an approximation and it is the right one -- a wall is about
   as bright as the rooms burning next to it, and the alternative is
   either a dark room with a glowing window wall or forty more chunks.

   The bands the envelope and the slabs are cut into are the building's
   own: front (the front block), mid (the middle band with the stairs
   and the cross halls) and north (the long rear rooms).
   ============================================================ */
export const CHUNK_CIRCUITS = {
  /* ---- the front elevation, either side of the portico ---- */
  'ext.front.west': ['clerk', 'west-front', 'floor2-west', 'front-ext'],
  'ext.front.east': ['east-front', 'floor2-east', 'front-ext'],
  /* ---- the two long side elevations ---- */
  'ext.west.front': ['clerk', 'west-front', 'floor2-west', 'platform'],
  'ext.west.mid': ['west-rear', 'floor2-west', 'platform'],
  'ext.west.north': ['west-rear', 'floor2-west', 'platform'],
  'ext.east.front': ['east-front', 'floor2-east', 'platform'],
  'ext.east.mid': ['east-rear', 'floor2-east', 'platform'],
  'ext.east.north': ['east-rear', 'floor2-east', 'platform'],
  /* ---- the north ends of the wings, and their garden faces ---- */
  'ext.north.west': ['west-rear', 'floor2-west', 'garden'],
  'ext.north.east': ['east-rear', 'floor2-east', 'garden'],
  'ext.garden.west': ['west-rear', 'floor2-west', 'garden', 'porch-rear'],
  'ext.garden.east': ['east-rear', 'floor2-east', 'garden', 'porch-rear'],
  /* ---- the central block ---- */
  'ext.central.south': ['lobby', 'floor2-center', 'front-ext'],
  'ext.central.north': ['lobby', 'floor2-center', 'porch-rear', 'garden'],
  /* ---- the first floor's boards ---- */
  'floor1.west.front': ['clerk', 'west-front'],
  'floor1.west.mid': ['west-rear'],
  'floor1.west.north': ['west-rear'],
  'floor1.east.front': ['east-front'],
  'floor1.east.mid': ['east-rear'],
  'floor1.east.north': ['east-rear'],
  'floor1.central': ['lobby'],
  /* ---- and the second floor's, which are also the ceilings below ---- */
  'floor2.west.front': ['floor2-west', 'clerk', 'west-front'],
  'floor2.west.mid': ['floor2-west', 'west-rear'],
  'floor2.west.north': ['floor2-west', 'west-rear'],
  'floor2.east.front': ['floor2-east', 'east-front'],
  'floor2.east.mid': ['floor2-east', 'east-rear'],
  'floor2.east.north': ['floor2-east', 'east-rear'],
  'floor2.central': ['floor2-center', 'lobby'],
};

/**
 * Chunk id -> the circuits that light it, rooms and shell together.
 * This is what the level hands the electrical system.
 */
export function chunkCircuits() {
  const m = new Map();
  for (const [room, id] of ROOM_CIRCUIT) m.set(room, [id]);
  for (const [chunk, ids] of Object.entries(CHUNK_CIRCUITS)) m.set(chunk, ids.slice());
  return m;
}

export function circuitChunks(circuitId) {
  const out = [];
  for (const [chunk, ids] of chunkCircuits()) if (ids.includes(circuitId)) out.push(chunk);
  return out;
}

/** Every room the panel knows about, for the invariant that checks it. */
export const WIRED_ROOMS = new Set(ROOM_CIRCUIT.keys());

/** Rooms in the building that no circuit claims. Should be empty. */
export function unwiredRooms() {
  return ROOMS.filter((r) => !ROOM_CIRCUIT.has(r.id)).map((r) => r.id);
}
