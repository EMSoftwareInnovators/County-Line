/* ============================================================
   academy.mjs -- walking the Old Academy.

   The Stage 2 brief lists eleven routes that have to work, and geometry
   assertions cannot tell you whether a building can be walked. So this
   drives the player with real key events, from A to K, and reports where
   it actually ended up.

   It also checks the architectural invariants that are easy to destroy by
   accident and hard to notice: that nothing is built over the garden,
   that the two upper wings never touch, that both staircases exist and
   reach the floor above, and that the overall footprint is still the
   size the measured plan says it is.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const ft = (f) => f * 0.3048;
/** meters back to feet, for messages a human can check against the plan */
const M = (m) => m / 0.3048;

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);
check('the Old Academy is the level that loads',
  (await page.evaluate(() => window.__game.level.id)) === 'academy',
  await page.evaluate(() => window.__game.level.id));

/* ============================================================
   HELPERS
   ============================================================ */
const put = (x, y, z, yaw = 0, pitch = 0) => page.evaluate(([x, y, z, yaw, pitch]) => {
  const p = window.__game.player;
  p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch;
  p.vx = 0; p.vz = 0; p.vy = 0;
  window.__game.player.frozen = false;
}, [x, y, z, yaw, pitch]);

const pos = () => page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  const r = g.level.roomAt(p.x, p.y, p.z);
  return { x: p.x, y: p.y, z: p.z, grounded: p.grounded, room: r ? r.id : null, floor: r ? r.floor : null };
});

const face = (yaw) => page.evaluate((y) => { window.__game.player.yaw = y; }, yaw);

const openAll = () => page.evaluate(() => {
  /* Routes are about whether the architecture connects, not about whether
     the player can reach a handle. Doors are opened wholesale, then the
     walking is done for real. */
  for (const d of window.__game.level.doors) { d.locked = false; d.target = 1; d.amount = 1; }
});

/**
 * Hold forward until `done(p)` is satisfied, or the player visibly stops
 * getting anywhere, or the budget runs out. Returns where we ended up.
 *
 * Fixed-duration walks were the first attempt and they were a mistake.
 * This building is 112 feet across and walking is 1.72 m/s, so a leg that
 * crosses the central room needs four seconds before it has even reached
 * the far wall -- and tuning two dozen separate timeouts hides real
 * failures behind arithmetic. So the walking is goal-directed, and the
 * assertions are about which room the player is standing in at the end.
 */
const STEP = 200;
/** Stop dead. Not a teleport -- it only zeroes the velocity, which is
    what stops a leg coasting a foot past the doorway it was aimed at. */
const halt = () => page.evaluate(() => {
  const p = window.__game.player;
  p.vx = 0; p.vz = 0;
});
const advance = async (done, opt = {}) => {
  const budget = opt.ms || 16000;
  const running = opt.run !== false;
  if (running) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  let last = await pos();
  let stalled = 0;
  for (let t = 0; t < budget; t += STEP) {
    await page.waitForTimeout(STEP);
    const p = await pos();
    if (done && done(p)) break;
    const moved = Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z);
    stalled = moved < 0.03 ? stalled + STEP : 0;
    last = p;
    if (stalled >= 600) break;
  }
  await page.keyboard.up('KeyW');
  if (running) await page.keyboard.up('ShiftLeft');
  await halt();
  await page.waitForTimeout(140);
  return pos();
};

/**
 * A positioning leg: walking pace rather than running, because a poll at
 * running speed covers two feet and a doorway is under two feet wider
 * than the player. Long traverses still run; only the legs that have to
 * stop somewhere in particular slow down.
 */
const step = (done) => advance(done, { run: false, ms: 10000 });

const inRoom = (id) => (p) => p.room === id;
const pastX = (x, s = 1) => (p) => (s > 0 ? p.x >= x : p.x <= x);
const pastZ = (z, s = 1) => (p) => (s > 0 ? p.z >= z : p.z <= z);
const belowZ = (z) => pastZ(z, -1);
const pastY = (y) => (p) => p.y >= y;
const belowY = (y) => (p) => p.y <= y;
const where = (p) => `${p.room} @ ${M(p.x).toFixed(1)},${M(p.z).toFixed(1)} ft`;

const N = 0, S = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;

/* ============================================================
   ARCHITECTURAL INVARIANTS
   ============================================================ */
const plan = await page.evaluate(() => {
  const g = window.__game;
  const m = g.level.marks.plan;
  return {
    width: m.width, depth: m.depth, bay: m.bay, wing: m.wing,
    floor2: m.floor2, facade: m.facade, north: m.north,
    rooms: g.level.rooms.map((r) => ({ id: r.id, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0: r.y0, floor: r.floor, outdoor: r.outdoor })),
    doors: g.level.doors.map((d) => d.id),
    openings: g.level.openings.length,
    chunks: g.level.chunks.map((c) => ({ id: c.id, b: c.bounds })),
    floors: g.level.collision.floors.map((f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y: f.y, tag: f.tag })),
    ceilings: g.level.collision.ceilings.map((c) => ({ x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, y: c.y, tag: c.tag })),
    ramps: g.level.collision.ramps.map((r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, yLow: r.yLow, yHigh: r.yHigh, tag: r.tag })),
  };
});

console.log('\n-- the footprint --');
check('overall width is 112 ft 9 in', Math.abs(M(plan.width) - 112.75) < 0.05, `${M(plan.width).toFixed(3)} ft`);
check('overall depth is 94 ft', Math.abs(M(plan.depth) - 94) < 0.05, `${M(plan.depth).toFixed(3)} ft`);
check('each wing is 34 ft 3 in', Math.abs(M(plan.wing) - 34.25) < 0.05, `${M(plan.wing).toFixed(3)} ft`);
check('the central bay is about 44 ft 6 in', Math.abs(M(plan.bay) - 44.5) < 0.4, `${M(plan.bay).toFixed(3)} ft`);
check('the second floor is at 17 ft 4 in', Math.abs(M(plan.floor2) - 17.3333) < 0.05, `${M(plan.floor2).toFixed(3)} ft`);
check('the plan is not a rectangle -- the wings are longer than the center is deep',
  M(plan.depth) - M(plan.bay) > 40, `${(M(plan.depth) - M(plan.bay)).toFixed(1)} ft of wing beyond the bay`);

console.log('\n-- the garden is open to the sky --');
const GX0 = -plan.bay / 2, GX1 = plan.bay / 2;
const GZ0 = ft(33), GZ1 = plan.north;
const over = plan.floors.filter((f) =>
  f.y > 1 && f.x1 > GX0 + 0.2 && f.x0 < GX1 - 0.2 && f.z1 > GZ0 + 0.2 && f.z0 < GZ1 - 0.2);
check('no floor is laid over the garden', over.length === 0,
  over.map((f) => f.tag).join(',') || 'none');
const chunksOver = plan.chunks.filter((c) =>
  c.b.y0 > 1 && c.b.x1 > GX0 + 0.5 && c.b.x0 < GX1 - 0.5 && c.b.z1 > GZ0 + 0.5 && c.b.z0 < GZ1 - 0.5);
check('and no geometry chunk sits above it', chunksOver.length === 0,
  chunksOver.map((c) => c.id).join(',') || 'none');
/* The rear porch is the other place a second floor would quietly close
   the court: a slab over it would turn the garden into a light well. */
const overPorch = plan.floors.filter((f) =>
  f.y > 1 && f.x1 > GX0 + 0.2 && f.x0 < GX1 - 0.2 && f.z1 > ft(18.2) && f.z0 < ft(32.6));
check('and none over the rear porch either', overPorch.length === 0,
  overPorch.map((f) => f.tag).join(',') || 'none');
const upperRooms = plan.rooms.filter((r) => r.floor === 2 && !r.outdoor);
const bridging = upperRooms.filter((r) => r.x0 < GX1 - 0.3 && r.x1 > GX0 + 0.3 && r.z1 > GZ0);
check('the two upper wings do not bridge the garden', bridging.length === 0,
  bridging.map((r) => r.id).join(',') || 'none');
const upW = upperRooms.filter((r) => r.x1 <= GX0 + 0.01);
const upE = upperRooms.filter((r) => r.x0 >= GX1 - 0.01);
check('there is a west upper wing', upW.length >= 2, upW.map((r) => r.id).join(','));
check('and an east upper wing', upE.length >= 2, upE.map((r) => r.id).join(','));

console.log('\n-- the rooms the brief names --');
const want = [
  'academy.central', 'academy.indians', 'academy.giftshop', 'academy.west.offices',
  'academy.west.restroom', 'academy.east.entry',
  'academy.west.stairhall', 'academy.east.stairhall',
  'academy.east.staff', 'academy.east.animal', 'academy.east.rearhall',
  'academy.west.rearhall', 'academy.porch.front', 'academy.porch.rear', 'academy.garden',
  'academy.upper.west.history', 'academy.upper.west.rotating', 'academy.upper.center.war',
  'academy.upper.east.archives', 'academy.upper.east.minerals', 'academy.upper.east.natural',
];
const ids = new Set(plan.rooms.map((r) => r.id));
const missing = want.filter((r) => !ids.has(r));
check('every named space exists', missing.length === 0, missing.join(',') || 'all present');
check('the front porch is outdoors',
  plan.rooms.find((r) => r.id === 'academy.porch.front').outdoor === true);
check('the rear porch is outdoors',
  plan.rooms.find((r) => r.id === 'academy.porch.rear').outdoor === true);
check('the garden is outdoors',
  plan.rooms.find((r) => r.id === 'academy.garden').outdoor === true);

console.log('\n-- the doors the brief requires --');
const wantDoors = [
  'central-front', 'central-rear', 'central-indians', 'central-americana',
  'central-westhall', 'central-easthall', 'west-hall-porch', 'east-hall-porch',
];
const haveDoors = new Set(plan.doors);
const missDoors = wantDoors.filter((d) => !haveDoors.has(d));
check('all eight required connections are modelled', missDoors.length === 0,
  missDoors.join(',') || 'all present');
const leaves = await page.evaluate(() => ({
  front: window.__game.level.doorById('central-front').leaves,
  rear: window.__game.level.doorById('central-rear').leaves,
}));
check('the front central doors are a real double', leaves.front === 2, String(leaves.front));
check('and so are the rear central doors', leaves.rear === 2, String(leaves.rear));

/* THE FOUR SIDE DOORWAYS ARE SYMMETRICAL. This building is, and Stage 2
   gave the exhibit pair a different size from the hall pair at a
   different distance from the room's center. */
const four = await page.evaluate(() => ['central-indians', 'central-americana',
  'central-westhall', 'central-easthall'].map((id) => {
  const d = window.__game.level.doorById(id);
  return { id, w: d.width, h: d.height, x: d.x, z: d.z };
}));
check('all four side doorways are one size',
  four.every((d) => Math.abs(d.w - four[0].w) < 1e-6 && Math.abs(d.h - four[0].h) < 1e-6),
  four.map((d) => `${M(d.w).toFixed(2)}x${M(d.h).toFixed(2)}`).join(' '));
check('and stand at mirrored stations about the room center',
  four.every((d) => four.some((o) => Math.abs(o.z + d.z) < 1e-6 && Math.abs(o.x - d.x) < 1e-6))
  && four.every((d) => four.some((o) => Math.abs(o.x + d.x) < 1e-6 && Math.abs(o.z - d.z) < 1e-6)),
  four.map((d) => `${M(d.x).toFixed(1)},${M(d.z).toFixed(1)}`).join(' '));

/* And there is ONE restroom in the building. */
const restrooms = plan.rooms.filter((r) => /restroom/i.test(r.id));
check('there is exactly one restroom, in the west wing',
  restrooms.length === 1 && restrooms[0].x1 < 0,
  restrooms.map((r) => r.id).join(',') || 'none');

/* Neither staircase has a door in front of it. */
const stairDoors = plan.doors.filter((d) => /stair/.test(d) && !/side/.test(d));
check('neither staircase has a door in front of it', stairDoors.length === 0,
  stairDoors.join(',') || 'none');

console.log('\n-- both staircases --');
const flights = plan.ramps.filter((r) => r.tag === 'stair');
check('four flights: two switchbacks, one in each wing', flights.length === 4,
  `${flights.length} flights, ${plan.ramps.length} ramps in all`);
const westFlights = flights.filter((r) => r.x1 < 0);
const eastFlights = flights.filter((r) => r.x0 > 0);
check('two of them in the west wing', westFlights.length === 2, String(westFlights.length));
check('and two in the east wing', eastFlights.length === 2, String(eastFlights.length));
check('neither staircase is anywhere near the center line',
  flights.every((r) => Math.min(Math.abs(r.x0), Math.abs(r.x1)) > ft(35)),
  flights.map((r) => M(Math.min(Math.abs(r.x0), Math.abs(r.x1))).toFixed(1)).join(', '));
check('every flight climbs a full half story',
  flights.every((r) => Math.abs(Math.abs(r.yHigh - r.yLow) - plan.floor2 / 2) < 0.02),
  flights.map((r) => M(Math.abs(r.yHigh - r.yLow)).toFixed(2)).join(', '));
/* ---- nothing may share a face plane with anything it overlaps ----
   THE FLICKER CHECK. Two boxes whose faces lie in the same plane and
   whose other two axes overlap fight for every pixel they share, and with
   integer vertex snapping and a 1/z depth buffer on top of that the
   shared area shimmers as the camera moves. It is invisible in a
   screenshot and impossible to miss in motion, so it is checked
   arithmetically rather than by eye.

   THIS SCANS EVERY BOX THAT IS DRAWN, not the colliders. The first
   version of this check read `collision.solids`, found a hundred and
   thirty-two pairs, and they were fixed -- and the building went on
   shimmering, because trim is never solid and neither are floors,
   ceilings or roof decks. Scanning the geometry instead found two
   thousand four hundred square feet of contested surface: every floor
   slab and every ceiling laid out over the walls, so its edge lay in the
   plane of the masonry's outer face; the water table and the string
   course sharing both ends with the wall they are stuck to, at every
   corner, twice; every merlon sunk two inches into the cap under it;
   every stringer step lapping the next one; the wainscot running through
   both chimney breasts; the meeting rail of all eighty-six sash windows
   lying in the same two planes as its own stiles.

   Two refinements keep it honest rather than merely loud:

     * A FACE THAT IS NOT DRAWN CANNOT FIGHT. Anything bedded in the
       ground leaves its underside off, and two undersides in one plane
       under the same lawn are not a flicker, they are nothing.
     * A FACE THAT IS BURIED CANNOT FIGHT EITHER. Two abutting pieces of
       a continuous run -- a wall built in three segments, a band course
       running past it in three more -- share their end planes by
       construction, and each end face is inside the piece that carries
       on from it. So the plane is sampled: if solid geometry covers the
       ground just past it, nothing there is visible.

   The count to beat is zero. */
const fighting = await page.evaluate(async () => {
  const mesh = await import('/src/engine/mesh.js');
  const level = await import('/src/world/level.js');
  const g = window.__game;
  const rec = [];
  const origBox = mesh.MeshBuilder.prototype.box;
  const origChunk = level.LevelBuilder.prototype.chunk;
  mesh.MeshBuilder.prototype.box = function (x0, y0, z0, x1, y1, z1, f) {
    /* Door leaves are built in their own MeshBuilder in local coordinates
       with the hinge at the origin, so every leaf in the building sits on
       top of every other one as far as these numbers go. Only a builder
       that belongs to a chunk holds world-space geometry. */
    if (this.__chunkName !== undefined) {
      const off = [];
      for (const k of ['px', 'nx', 'py', 'ny', 'pz', 'nz']) if (k in f && !f[k]) off.push(k);
      rec.push({
        c: this.__chunkName, off,
        x0: Math.min(x0, x1), x1: Math.max(x0, x1),
        y0: Math.min(y0, y1), y1: Math.max(y0, y1),
        z0: Math.min(z0, z1), z1: Math.max(z0, z1),
      });
    }
    return origBox.call(this, x0, y0, z0, x1, y1, z1, f);
  };
  level.LevelBuilder.prototype.chunk = function (n, bounds) {
    const r = origChunk.call(this, n, bounds);
    this.mb.__chunkName = n;
    return r;
  };
  try {
    g.loadLevel('academy');
  } finally {
    mesh.MeshBuilder.prototype.box = origBox;
    level.LevelBuilder.prototype.chunk = origChunk;
  }

  const S = rec.filter((b) => b.x1 - b.x0 > 1e-5 && b.y1 - b.y0 > 1e-5 && b.z1 - b.z0 > 1e-5);
  const EPS = 0.012, OVER = 0.05, CELL = 2.0;
  const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
  const same = (p1, q1) => Math.abs(p1 - q1) < EPS;
  const key = (i, j, k) => `${i},${j},${k}`;
  const grid = new Map();
  for (const b of S) {
    for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++) {
      for (let j = Math.floor(b.y0 / CELL); j <= Math.floor(b.y1 / CELL); j++) {
        for (let k = Math.floor(b.z0 / CELL); k <= Math.floor(b.z1 / CELL); k++) {
          const kk = key(i, j, k);
          if (!grid.has(kk)) grid.set(kk, []);
          grid.get(kk).push(b);
        }
      }
    }
  }
  const IN = 0.004;
  const covered = (x, y, z, A, B) => {
    const cell = grid.get(key(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL)));
    if (!cell) return false;
    for (const c of cell) {
      if (c === A || c === B) continue;
      if (x > c.x0 + IN && x < c.x1 - IN && y > c.y0 + IN && y < c.y1 - IN
        && z > c.z0 + IN && z < c.z1 - IN) return true;
    }
    return false;
  };
  const FACE = { x1: 'px', x0: 'nx', y1: 'py', y0: 'ny', z1: 'pz', z0: 'nz' };
  const out = [];
  for (let i = 0; i < S.length; i++) {
    for (let j = i + 1; j < S.length; j++) {
      const A = S[i], B = S[j];
      const ox = ov(A.x0, A.x1, B.x0, B.x1);
      const oy = ov(A.y0, A.y1, B.y0, B.y1);
      const oz = ov(A.z0, A.z1, B.z0, B.z1);
      if (ox <= 1e-6 || oy <= 1e-6 || oz <= 1e-6) continue;
      let axis = null, plane = 0, dir = 0;
      if (oy > OVER && oz > OVER && same(A.x0, B.x0)) { axis = 'x'; plane = A.x0; dir = -1; }
      else if (oy > OVER && oz > OVER && same(A.x1, B.x1)) { axis = 'x'; plane = A.x1; dir = 1; }
      else if (oy > OVER && ox > OVER && same(A.z0, B.z0)) { axis = 'z'; plane = A.z0; dir = -1; }
      else if (oy > OVER && ox > OVER && same(A.z1, B.z1)) { axis = 'z'; plane = A.z1; dir = 1; }
      else if (ox > OVER && oz > OVER && same(A.y0, B.y0)) { axis = 'y'; plane = A.y0; dir = -1; }
      else if (ox > OVER && oz > OVER && same(A.y1, B.y1)) { axis = 'y'; plane = A.y1; dir = 1; }
      if (!axis) continue;
      const fk = FACE[axis + (dir > 0 ? '1' : '0')];
      if (A.off.includes(fk) || B.off.includes(fk)) continue;
      const cx = (Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2;
      const cy = (Math.max(A.y0, B.y0) + Math.min(A.y1, B.y1)) / 2;
      const cz = (Math.max(A.z0, B.z0) + Math.min(A.z1, B.z1)) / 2;
      const q = plane + dir * 0.03;
      if (axis === 'x' ? covered(q, cy, cz, A, B)
        : axis === 'z' ? covered(cx, cy, q, A, B) : covered(cx, q, cz, A, B)) continue;
      out.push(`${A.c}/${B.c} on ${axis}`);
    }
  }
  return { n: S.length, out };
});
check('nothing drawn shares a face plane with anything it overlaps',
  fighting.out.length === 0,
  fighting.out.length
    ? `${fighting.out.length} pairs of ${fighting.n} boxes, e.g. ${fighting.out.slice(0, 3).join(', ')}`
    : `none, of ${fighting.n} boxes`);

/* A plaster ceiling was laid across both stairwells once, and the
   symptom was a player who climbed nine risers, hit their head and slid
   back down. Nothing may roof a staircase. */
const roofedStairs = plan.ceilings.filter((c) => flights.some((f) =>
  c.y < plan.floor2 - 0.05 && c.y > 1
  && c.x1 > f.x0 + 0.05 && c.x0 < f.x1 - 0.05
  && c.z1 > f.z0 + 0.05 && c.z0 < f.z1 - 0.05));
check('no ceiling is laid over a staircase', roofedStairs.length === 0,
  roofedStairs.map((c) => `${c.tag} at ${M(c.y).toFixed(1)} ft`).join(',') || 'none');
/* And the headroom above a flight has to clear a standing player all the
   way up it -- which is the same fault seen from the other side. */
const headroom = await page.evaluate(() => {
  const g = window.__game;
  const C = g.level.collision;
  const out = [];
  for (const r of C.ramps) {
    if (r.tag !== 'stair') continue;
    for (let t = 0.05; t <= 0.95; t += 0.1) {
      const x = r.x0 + (r.x1 - r.x0) * t;
      const z = (r.z0 + r.z1) / 2;
      const y = r.yLow + (r.yHigh - r.yLow) * t;
      const c = C.ceilingAt(x, z, y + 0.05);
      if (c - y < 1.95) out.push(`${(y / 0.3048).toFixed(1)} ft up: ${((c - y) / 0.3048).toFixed(1)} ft of head`);
    }
  }
  return out;
});
check('and there is standing headroom the whole way up both', headroom.length === 0,
  headroom.slice(0, 3).join(' | ') || 'clear');

/* The restroom got itself built on top of the west upper flight once.
   Nothing that is a room may stand in a stair's footprint. */
const inFlight = plan.rooms.filter((r) => r.floor === 1 && !/stairhall$/.test(r.id) && flights.some((f) =>
  r.x1 > f.x0 + 0.05 && r.x0 < f.x1 - 0.05 && r.z1 > f.z0 + 0.05 && r.z0 < f.z1 - 0.05));
check('no room is built inside a stair footprint', inFlight.length === 0,
  inFlight.map((r) => r.id).join(',') || 'none');

/* ============================================================
   THE ROUTES

   Every leg below is walked with real key events. Nothing teleports
   except the deliberate `put` that starts a route.
   ============================================================ */
await openAll();

console.log('\n-- route A: grounds -> front porch -> central room --');
await put(0, ft(-3), ft(-60), N);
let p = await advance(inRoom('academy.porch.front'));
check('A1 the front steps are climbable', p.y > ft(-0.4), `y ${M(p.y).toFixed(2)} ft`);
check('A2 and land you on the front porch', p.room === 'academy.porch.front', where(p));
p = await advance(inRoom('academy.central'));
check('A3 the front doors lead into the central room', p.room === 'academy.central', where(p));

console.log('\n-- route B: central -> Indians of the Southeast --');
await put(0, 0, -ft(12.5), W);
p = await advance(inRoom('academy.indians'));
check('B the west doorway reaches Indians', p.room === 'academy.indians', where(p));

console.log('\n-- route C: central -> the Gift Shop --');
await put(0, 0, -ft(12.5), E);
p = await advance(inRoom('academy.giftshop'));
check('C the east doorway reaches the Gift Shop', p.room === 'academy.giftshop', where(p));

console.log('\n-- route D: central -> west rear hall -> rear porch --');
await put(0, 0, ft(12.5), W);
p = await advance(inRoom('academy.west.rearhall'));
check('D1 the north-west doorway reaches the west rear hall',
  p.room === 'academy.west.rearhall', where(p));
await face(N);
await step(pastZ(ft(19.1)));
await face(E);
p = await advance(inRoom('academy.porch.rear'));
check('D2 and the west rear hall has its own door onto the rear porch',
  p.room === 'academy.porch.rear', where(p));

console.log('\n-- route E: central -> east rear hall -> rear porch --');
await put(0, 0, ft(12.5), E);
p = await advance(inRoom('academy.east.rearhall'));
check('E1 the north-east doorway reaches the east rear hall',
  p.room === 'academy.east.rearhall', where(p));
await face(N);
await step(pastZ(ft(19.1)));
await face(W);
p = await advance(inRoom('academy.porch.rear'));
check('E2 and the east rear hall has its own door onto the rear porch',
  p.room === 'academy.porch.rear', where(p));

console.log('\n-- route F: central -> rear porch -> garden --');
await put(0, 0, ft(12), N);
p = await advance(inRoom('academy.porch.rear'));
check('F1 the rear double doors reach the rear porch',
  p.room === 'academy.porch.rear', where(p));
/* The garden floor is at -1'6" and the gravel walk up the middle of it
   stands three inches above that, so "down in the garden" is anything
   below about a foot. */
p = await advance((q) => q.room === 'academy.garden' && q.y <= ft(-1.2));
check('F2 and the steps go down into the garden',
  p.room === 'academy.garden' && p.y <= ft(-1.2), `${where(p)} y ${M(p.y).toFixed(2)} ft`);

console.log('\n-- route G: the long first-floor loop --');
/* Indians -> west rear hall -> rear porch -> east rear hall -> Americana
   -> central, walked in one continuous run: turning at each corner but
   never repositioned. The dog-legs west and east are the building's own
   -- the openings between the exhibit rooms and the middle band are out
   at the wing center lines, not on the doorway line, so you cross the
   room to reach them. That is the historic plan and it stays. */
const legs = [
  [W, inRoom('academy.indians'), 0],              // out of the central room
  [W, pastX(ft(-32), -1), 1],                     // west across Indians to the arch
  [N, inRoom('academy.west.rearhall'), 0],        // north through the arch
  [N, pastZ(ft(19.1)), 1],                        // up to the porch door
  [E, inRoom('academy.porch.rear'), 0],           // out onto the covered porch
  [E, inRoom('academy.east.rearhall'), 0],        // across it and in the other side
  [E, pastX(ft(32), 1), 1],                       // east to the matching arch
  [S, inRoom('academy.giftshop'), 0],             // south through it
  [S, pastZ(-ft(11.7), -1), 1],                   // down to the doorway line
  [W, inRoom('academy.central'), 0],              // and back in where we started
];
const loop = [];
await put(0, 0, -ft(12.5), W);
for (const [yaw, done, slow] of legs) {
  await face(yaw);
  loop.push(await (slow ? step(done) : advance(done)));
}
console.log(`      ${loop.map(where).join('\n      ')}`);
const ring = [0, 2, 4, 5, 7, 9].map((i) => loop[i].room);
check('G Indians -> west hall -> porch -> east hall -> Americana -> central closes',
  ring[0] === 'academy.indians' && ring[1] === 'academy.west.rearhall'
  && ring[2] === 'academy.porch.rear' && ring[3] === 'academy.east.rearhall'
  && ring[4] === 'academy.giftshop' && ring[5] === 'academy.central',
  ring.join(' -> '));

console.log('\n-- routes H and I: both staircases --');
/* A switchback is walked in five moves: in at the inner end through the
   rear hall door, up the first flight, across the half-landing, back up
   the second, and off the head of the flight onto the floor above. */
async function climb(side) {
  const west = side === 'west';
  const out = west ? W : E, back = west ? E : W;
  await put(ft(west ? -38 : 38), 0, ft(10.9), out);
  const got = await advance(inRoom(`academy.${side}.stairhall`));
  const half = await advance(pastY(ft(7.6)));
  await step(west ? pastX(ft(-53), -1) : pastX(ft(53), 1));
  await face(N);
  await step(pastZ(ft(14.4)));
  await face(back);
  await advance(pastY(ft(16.9)));
  const top = await advance(west ? pastX(ft(-38), 1) : pastX(ft(38), -1));
  return { got, half, top };
}
for (const side of ['west', 'east']) {
  const label = side === 'west' ? 'H' : 'I';
  const r = await climb(side);
  check(`${label}1 the ${side} rear hall reaches the ${side} stair hall`,
    r.got.room === `academy.${side}.stairhall`, where(r.got));
  check(`${label}2 the flight climbs rather than teleports`,
    r.half.y > ft(4) && r.half.y < ft(13) && r.half.floor !== 2,
    `half way up at ${M(r.half.y).toFixed(2)} ft`);
  check(`${label}3 and the ${side} stair reaches the second floor`,
    r.top.y > ft(16.8) && r.top.floor === 2 && r.top.room === `academy.upper.${side}.landing`,
    `${where(r.top)} y ${M(r.top.y).toFixed(2)} ft`);
}

console.log('\n-- and back down --');
/* The same switchback in reverse, from the head of the west flight. */
await put(ft(-39), ft(17.34), ft(15), W);
await advance(belowY(ft(9.2)));
await step(pastX(ft(-53), -1));
await face(S);
await step(belowZ(ft(12)));
await face(E);
p = await advance((q) => q.floor === 1 && q.y < ft(0.3));
check('the west stair comes back down to the first floor',
  p.floor === 1 && p.y < ft(0.3), `${where(p)} y ${M(p.y).toFixed(2)} ft`);

console.log('\n-- route J: west upper -> meeting room -> east upper --');
/* The upper central room is ONE OPEN ROOM. The visitor map prints two
   names across it -- the War Room west, Modern Mammals east -- and
   annotates both halves as the common meeting room; there is no wall
   between them, and the one built here on the strength of that printed
   line is gone. The dog-leg below is still walked, because it proves the
   room is crossable on the diagonal as well as straight through. */
await put(ft(-30), ft(17.34), ft(12.5), E);
p = await advance(inRoom('academy.upper.center.war'));
check('J1 the west landing reaches the War Room',
  p.room === 'academy.upper.center.war', where(p));
await face(S);
await step(belowZ(ft(4)));
await face(E);
p = await advance(inRoom('academy.upper.center.mammals'));
check('J2 the meeting room is one open space across the center line',
  p.room === 'academy.upper.center.mammals', where(p));
await face(N);
await step(pastZ(ft(11.6)));
await face(E);
p = await advance(inRoom('academy.upper.east.landing'));
check('J3 and reaches the east landing',
  p.room === 'academy.upper.east.landing', where(p));

console.log('\n-- route K: the garden, looking up --');
await put(0, ft(-1.5), ft(46), N, 1.2);
const sky = await page.evaluate(() => {
  /* Straight up from the middle of the garden there must be nothing at
     all between the player and the sky. Asked of the collider, which is
     built from the same geometry the renderer draws. */
  const g = window.__game;
  const pl = g.player;
  const hit = g.level.collision.raycast(pl.x, pl.y + 1.6, pl.z, 0, 1, 0, 60);
  return hit ? { tag: hit.solid.tag, t: hit.t } : null;
});
check('K nothing stands between the garden and the sky', sky === null,
  sky ? `${sky.tag} at ${sky.t.toFixed(1)} m` : 'open');

const heads = await page.evaluate(() => {
  const g = window.__game;
  const out = [];
  for (const z of [36, 44, 52, 60]) {
    out.push(g.level.collision.ceilingAt(0, z * 0.3048, -0.45));
  }
  return out;
});
check('  and there is no ceiling anywhere over it', heads.every((h) => h === Infinity),
  heads.map((h) => (h === Infinity ? 'open' : h.toFixed(1))).join(', '));

/* It is a court, not a light well: you can walk its whole length. */
await put(0, ft(-1.5), ft(35), N);
p = await advance(pastZ(ft(58)));
check('  and it can be walked from the porch steps to the far wall',
  p.room === 'academy.garden' && p.z > ft(57), where(p));

/* ---- the side entrances, which are historic ---- */
/* Dropped in from a foot up rather than placed at grade: the west
   ground now carries the coach platform, whose concrete stands eight
   inches over the asphalt, and a body placed at grade there is a body
   placed inside a slab. Falling onto whatever is under you is what a
   player does anyway. */
console.log('\n-- the side entrances --');
await put(ft(-68), ft(-2), ft(43), E);
p = await advance(inRoom('academy.west.offices'));
check('the west "Entrance to Railroad" door works',
  p.room === 'academy.west.offices', where(p));

await put(ft(68), ft(-2), ft(43), W);
p = await advance(inRoom('academy.east.vestibule'));
check('and so does the east side door into the vestibule',
  p.room === 'academy.east.vestibule', where(p));

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
