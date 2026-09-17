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
    chunks: g.level.chunks.map((c) => ({ id: c.id, b: c.bounds })),
    floors: g.level.collision.floors.map((f) => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y: f.y, tag: f.tag })),
    ramps: g.level.collision.ramps.map((r) => ({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, yLow: r.yLow, yHigh: r.yHigh, tag: r.tag })),
  };
});

console.log('\n-- the footprint --');
check('overall width is 112 ft 9 in', Math.abs(M(plan.width) - 112.75) < 0.05, `${M(plan.width).toFixed(3)} ft`);
check('overall depth is 94 ft', Math.abs(M(plan.depth) - 94) < 0.05, `${M(plan.depth).toFixed(3)} ft`);
check('each wing is 34 ft 3 in', Math.abs(M(plan.wing) - 34.25) < 0.05, `${M(plan.wing).toFixed(3)} ft`);
check('the central bay is about 44 ft 6 in', Math.abs(M(plan.bay) - 44.5) < 0.4, `${M(plan.bay).toFixed(3)} ft`);
check('the second floor is at 16 ft', Math.abs(M(plan.floor2) - 16) < 0.05, `${M(plan.floor2).toFixed(3)} ft`);
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
  'academy.central', 'academy.indians', 'academy.americana.inner', 'academy.west.offices',
  'academy.west.restroom', 'academy.west.stairhall', 'academy.east.stairhall',
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
await put(0, 0, ft(-6), W);
p = await advance(inRoom('academy.indians'));
check('B the west doorway reaches Indians', p.room === 'academy.indians', where(p));

console.log('\n-- route C: central -> inner Americana --');
await put(0, 0, ft(-6), E);
p = await advance(inRoom('academy.americana.inner'));
check('C the east doorway reaches Americana', p.room === 'academy.americana.inner', where(p));

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
p = await advance((q) => q.room === 'academy.garden' && q.y <= ft(-1.4));
check('F2 and the steps go down into the garden',
  p.room === 'academy.garden' && p.y <= ft(-1.4), `${where(p)} y ${M(p.y).toFixed(2)} ft`);

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
  [S, inRoom('academy.americana.inner'), 0],      // south through it
  [S, pastZ(ft(-5.2), -1), 1],                    // down to the doorway line
  [W, inRoom('academy.central'), 0],              // and back in where we started
];
const loop = [];
await put(0, 0, ft(-6), W);
for (const [yaw, done, slow] of legs) {
  await face(yaw);
  loop.push(await (slow ? step(done) : advance(done)));
}
console.log(`      ${loop.map(where).join('\n      ')}`);
const ring = [0, 2, 4, 5, 7, 9].map((i) => loop[i].room);
check('G Indians -> west hall -> porch -> east hall -> Americana -> central closes',
  ring[0] === 'academy.indians' && ring[1] === 'academy.west.rearhall'
  && ring[2] === 'academy.porch.rear' && ring[3] === 'academy.east.rearhall'
  && ring[4] === 'academy.americana.inner' && ring[5] === 'academy.central',
  ring.join(' -> '));

console.log('\n-- routes H and I: both staircases --');
/* A switchback is walked in five moves: in at the inner end through the
   rear hall door, up the first flight, across the half-landing, back up
   the second, and off the head of the flight onto the floor above. */
async function climb(side) {
  const west = side === 'west';
  const out = west ? W : E, back = west ? E : W;
  await put(ft(west ? -38 : 38), 0, ft(12), out);
  const got = await advance(inRoom(`academy.${side}.stairhall`));
  const half = await advance(pastY(ft(7.6)));
  await step(west ? pastX(ft(-53), -1) : pastX(ft(53), 1));
  await face(N);
  await step(pastZ(ft(15.9)));
  await face(back);
  await advance(pastY(ft(15.6)));
  const top = await advance(west ? pastX(ft(-38), 1) : pastX(ft(38), -1));
  return { got, half, top };
}
for (const side of ['west', 'east']) {
  const label = side === 'west' ? 'H' : 'I';
  const r = await climb(side);
  check(`${label}1 the ${side} rear hall reaches the ${side} stair hall`,
    r.got.room === `academy.${side}.stairhall`, where(r.got));
  check(`${label}2 the flight climbs rather than teleports`,
    r.half.y > ft(4) && r.half.y < ft(12) && r.half.floor !== 2,
    `half way up at ${M(r.half.y).toFixed(2)} ft`);
  check(`${label}3 and the ${side} stair reaches the second floor`,
    r.top.y > ft(15.5) && r.top.floor === 2 && r.top.room === `academy.upper.${side}.landing`,
    `${where(r.top)} y ${M(r.top.y).toFixed(2)} ft`);
}

console.log('\n-- and back down --');
/* The same switchback in reverse, from the head of the west flight. */
await put(ft(-39), ft(16), ft(16), W);
await advance(belowY(ft(8.4)));
await step(pastX(ft(-53), -1));
await face(S);
await step(belowZ(ft(12)));
await face(E);
p = await advance((q) => q.floor === 1 && q.y < ft(0.3));
check('the west stair comes back down to the first floor',
  p.floor === 1 && p.y < ft(0.3), `${where(p)} y ${M(p.y).toFixed(2)} ft`);

console.log('\n-- route J: west upper -> meeting room -> east upper --');
/* The upper central room is one meeting room with a spine wall down it,
   and the opening in that spine is on the room's center line at Z = 0 --
   not up at the landing doors. So the route goes in at the landing door,
   down the room, across, and back up to the other door. That dog-leg is
   the building's, not a compromise. */
await put(ft(-30), ft(16), ft(12.5), E);
p = await advance(inRoom('academy.upper.center.war'));
check('J1 the west landing reaches the War Room',
  p.room === 'academy.upper.center.war', where(p));
await face(S);
await step(belowZ(0));
await face(E);
p = await advance(inRoom('academy.upper.center.mammals'));
check('J2 the meeting room carries across its spine wall',
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
console.log('\n-- the side entrances --');
await put(ft(-68), ft(-3), ft(43), E);
p = await advance(inRoom('academy.west.offices'));
check('the west "Entrance to Railroad" door works',
  p.room === 'academy.west.offices', where(p));

await put(ft(68), ft(-3), ft(43), W);
p = await advance(inRoom('academy.east.vestibule'));
check('and so does the east side door into the vestibule',
  p.room === 'academy.east.vestibule', where(p));

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
