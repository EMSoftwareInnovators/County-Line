/* ============================================================
   lum.mjs -- how dark is it in here, actually.

   THE MEAN IS A LIAR. The first lighting pass was tuned against the
   mean pixel of nine views, the numbers came out in the fifties, and
   the building was still unplayable -- because a frame with a bright
   doorway in it and everything else near black has a perfectly
   respectable mean. What a player experiences is the DARK TAIL: how
   much of what they are looking at carries no information.

   So this reports four numbers per view, against three thresholds:

     blind  under 7%    the part of the frame carrying no detail
     p10    at least 28 the darkest tenth still reads as a surface
     mean   at least 62 the room is lit, not merely not black

   THE FIRST TWO COME FROM THE OUTPUT FORMAT. The tube quantizes to 15
   bits, so the channel steps in eights: 0, 8, 16, 24. A pixel under 24
   has at most three levels beneath it and a texture drawn there has
   nowhere to put its detail. p10 says the same thing about the darkest
   tenth of the frame.

   THE THIRD COMES FROM BEING WRONG TWICE. A building can clear both of
   the others and still be reported by the person playing it as too dark
   to play, because "no part of this is a hole" is not the same claim as
   "this room is lit". The mean is worthless ALONE -- that was the first
   mistake, and the note above stands -- but as a floor underneath the
   other two it is the one that catches a room that is uniformly dim
   rather than patchy. All three, or the room fails.

   THE SECOND HALF of the run is the opposite check, and it is the same
   test read backwards. A room that is workable with its breaker on and
   still workable with it off means the retrofit is decorative. So every
   room is measured twice, and the second time it must FAIL the test
   above: below the detail floor, not somewhere a clerk could count
   change. That is a sharper question than "is it a bit darker", and it
   needs no threshold of its own -- it reuses the one the format
   already fixed.

   Stands in every room at eye height, in each of the places a player
   could actually stand in it, looks at the four walls from each, and
   reports the worst direction from the best spot -- because a player
   picks where to stand and does not pick which way they are facing
   when they get there.
   ============================================================ */
import { launch, openGame, startNight } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const ONLY = process.argv[3] || '';

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);

await startNight(page);
await page.waitForTimeout(700);

/* Three passes, and the FIRST ONE IS THE ONE THAT MATTERED.

   AS THE SHIFT STARTS is what a player actually walks into: Shift.start
   leaves the lobby circuit on and every other one off, because the night
   man went home and putting the zones up is the first job. So the first
   several minutes of every game are spent in an unlit building, and the
   bar there is not "can you work here" -- it is "can you cross the room
   and find the switch bank". Two rounds of lighting work measured only
   the lit building and reported it fixed, twice, while the person
   playing it was in the dark one. A harness that measures a state the
   player never sees is worse than no harness.

   Then the building open and working, and then with the panel off. */
/* TWO DIFFERENT CLAIMS ABOUT THE UNLIT BUILDING, and only one of them
   is that it should be bright.

   THE OPENING ROUTE must be properly lit, because the first job of the
   shift is at the far end of it: the clerk starts at the front door and
   the switch bank is in the old docent library, and being sent to find
   a light switch in the dark is the bug this pass exists to catch.

   EVERYWHERE ELSE is allowed to be dark -- that is the whole point of a
   building with its zones off, and the brief asks for it -- but nothing
   may be a VOID. A player who wanders into the east wing before putting
   the zones up should find it gloomy and unwelcoming, not black. */
const ROUTE = [
  'academy.central', 'academy.indians', 'academy.west.docent',
  'academy.west.store', 'academy.west.offices',
];
const ROUTE_BAR = { blind: 12, p10: 20, mean: 55 };
const VOID_BAR = { blind: 52, p10: 1, mean: 24 };

/* Open the terminal up exactly as a shift does: every zone on except
   the second floor's, which a clerk switches on only to go up. The
   building is measured in the state it is played in. */
await page.evaluate(() => {
  const g = window.__game;
  g.ui.setHudVisible(false);
  for (const d of g.level.doors) { d.locked = false; d.target = 0; d.amount = 0; }
  g.level.update(0.016);

  /* A REPEATABLE FRAME. Two stages of the tube make the same view
     measure differently twice: `grain` adds +/-5 of noise per pixel,
     which straddles the luma-24 threshold and moved the reported blind
     fraction by two points between runs, and `ghost` blends 20% of the
     PREVIOUS frame in, so a view measured just after the camera was
     teleported still carries the last room. Both are presentation, not
     light. Scanlines, vignette and the dither stay on, because those
     are the ones that were eating the picture. */
  const inner = g.settings.postParams.bind(g.settings);
  g.settings.postParams = () => ({ ...inner(), grain: 0, ghost: 0 });
});

const rooms = await page.evaluate(() => window.__game.level.rooms
  .filter((r) => !r.outdoor && r.floor > 0)
  .map((r) => ({
    id: r.id, name: r.name, floor: r.floor,
    x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: r.y0,
  })));

/** Luma of the presented frame, and how much of it is below the floor. */
async function sample(x, y, z, yaw) {
  await page.evaluate((a) => {
    const p = window.__game.player;
    p.frozen = true;
    p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = 0;
    p.vx = 0; p.vy = 0; p.vz = 0; p.bob = 0;
  }, { x, y, z, yaw });
  /* WAIT FOR FRAMES, NOT FOR MILLISECONDS. A fixed 90ms settles the
     view on an idle machine and does not when twelve other harnesses
     are sharing the box, and a half-settled frame still carries the
     room the camera was in before -- which showed up as one room out of
     twenty-seven failing, a different one each time, only inside the
     full suite. Six presented frames is the same amount of settling
     whatever else the machine is doing. */
  await page.evaluate(() => new Promise((done) => {
    let n = 0;
    const tick = () => (++n >= 6 ? done() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }));
  return page.evaluate(() => {
    const c = document.getElementById('screen');
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const hist = new Uint32Array(256);
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      hist[l]++; sum += l; n++;
    }
    let blind = 0;
    for (let v = 0; v < 24; v++) blind += hist[v];
    let acc = 0, p10 = 0, p50 = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (!p10 && acc >= n * 0.10) p10 = v;
      if (!p50 && acc >= n * 0.50) { p50 = v; break; }
    }
    return { mean: sum / n, p10, p50, blind: (blind / n) * 100 };
  });
}

const EYE = 1.62;          // the camera, above the room's own floor
const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

/* WHERE A PLAYER CAN ACTUALLY STAND, and what they can actually see
   from there. The first cut of this stood in the middle of the room's
   rectangle and reported what it found, which put the probe inside the
   west staircase with its face six inches from the underside of the
   stair run -- a frame that is 90% dark wood, and a room that was
   reported as the worst in the building while being perfectly fine to
   walk through. A measurement that cannot be taken from a place a
   player can stand is not a measurement of anything. */
async function standable(r) {
  return page.evaluate((a) => {
    const g = window.__game;
    const R = 0.2794, H = 1.778;
    const out = [], fallback = [];
    /* the center, then the four quarter points: a room is judged from
       more than one place in it, and an alcove is not a room. */
    for (const [fx, fz] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      const x = a.x0 + (a.x1 - a.x0) * fx, z = a.z0 + (a.z1 - a.z0) * fz;
      if (!g.level.collision.fits(x, a.y + 0.05, z, R, H)) continue;
      /* AND UPRIGHT IN THE ROOM PROPER. `fits` is happy under a
         staircase -- a body is 5'10" and the soffit of the third
         landing is higher than that -- and standing under the east
         stair puts the camera a foot from the underside of a tread,
         which is stained wood and which filled 9% of the frame with
         the darkest thing in the building. That is a photograph of the
         bottom of a stair, not a measurement of a room. */
      const ceil = g.level.collision.ceilingAt(x, z, a.y + 0.05);
      if (ceil < a.y + 2.4) continue;
      /* and it has to be a view, not a close-up: somewhere in this spot
         there must be at least a couple of meters of room to look at. */
      let open = 0;
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const h = g.level.collision.raycast(
          x, a.y + 1.62, z, Math.sin(yaw), 0, Math.cos(yaw), 12);
        if (!h || h.t > 2.0) open++;
      }
      if (open >= 2) out.push([x, z]);
      else fallback.push([x, z]);
    }
    /* A restroom is nine feet by four. There is nowhere in it with two
       clear directions and it is still a room the player stands in, so
       a room that fails the view test is measured from wherever it can
       be stood in rather than not measured at all. */
    return out.length ? out : fallback;
  }, r);
}

/* ---- pass one: the building as the night man left it ---- */
console.log('AS THE SHIFT STARTS -- lobby on, every other zone off.');
console.log('The bar here is crossing the room, not working in it.\n');
console.log('room                                     mean   p10   p50  blind%');
console.log('-------------------------------------------------------------------');
let unlit = 0;
const startRows = [];
for (const r of rooms) {
  if (ONLY && !r.id.includes(ONLY)) continue;
  const spots = await standable(r);
  if (!spots.length) continue;
  let worst = null;
  for (const [x, z] of spots) {
    let here = null;
    for (const yaw of YAWS) {
      const v = await sample(x, r.y + EYE, z, yaw);
      if (!here || v.blind > here.blind) here = v;
    }
    if (!worst || here.blind < worst.blind) worst = here;
  }
  const onRoute = ROUTE.includes(r.id);
  const bar = onRoute ? ROUTE_BAR : VOID_BAR;
  const ok = worst.blind < bar.blind && worst.p10 >= bar.p10 && worst.mean >= bar.mean;
  if (!ok) unlit++;
  startRows.push({ id: r.id, ...worst, ok });
  console.log(
    `${ok ? ' ok ' : 'DARK'} ${onRoute ? '*' : ' '}${r.id.padEnd(33)}`
    + ` ${worst.mean.toFixed(0).padStart(5)}`
    + ` ${String(worst.p10).padStart(5)} ${String(worst.p50).padStart(5)}`
    + ` ${worst.blind.toFixed(1).padStart(6)}`,
  );
}
console.log('-------------------------------------------------------------------');
console.log(`* = on the opening route, and held to the working standard.`);
console.log(`${startRows.length - unlit}/${startRows.length} rooms pass; ${unlit} do not\n`);

/* ---- pass two: open for business ---- */
await page.evaluate(() => {
  const g = window.__game;
  for (const c of g.power.system.circuits) g.power.system.setSwitch(c.id, true);
  g.power.apply();
  g.level.update(0.016);
});
console.log('OPEN FOR BUSINESS -- every zone on.\n');
console.log('room                                     mean   p10   p50  blind%');
console.log('-------------------------------------------------------------------');
let bad = 0;
const rows = [];
for (const r of rooms) {
  if (ONLY && !r.id.includes(ONLY)) continue;
  const spots = await standable(r);
  if (process.env.LUM_DEBUG) console.log(`   ${r.id}: ${spots.length} spot(s)`);
  if (!spots.length) { console.log(`skip ${r.id}  nowhere to stand`); continue; }
  /* The worst view from the best spot: a player picks where to stand
     and does not pick which way to be facing when they get there. */
  let worst = null;
  for (const [x, z] of spots) {
    let here = null;
    for (const yaw of YAWS) {
      const s = await sample(x, r.y + EYE, z, yaw);
      if (!here || s.blind > here.blind) here = s;
    }
    if (!worst || here.blind < worst.blind) worst = here;
  }
  const ok = worst.blind < 7 && worst.p10 >= 28 && worst.mean >= 62;
  if (!ok) bad++;
  rows.push({ id: r.id, ...worst, ok });
  console.log(
    `${ok ? ' ok ' : 'DARK'} ${r.id.padEnd(34)} ${worst.mean.toFixed(0).padStart(5)}`
    + ` ${String(worst.p10).padStart(5)} ${String(worst.p50).padStart(5)}`
    + ` ${worst.blind.toFixed(1).padStart(6)}`,
  );
}
console.log('-------------------------------------------------------------------');
console.log(`${rows.length - bad}/${rows.length} rooms workable; ${bad} too dark`);

/* ---- and the same building with the panel off ---- */
await page.evaluate(() => {
  const g = window.__game;
  for (const c of g.power.system.circuits) g.power.system.setSwitch(c.id, false);
  g.power.apply(); g.level.update(0.016);
});
console.log('\nwith every circuit off:');
console.log('room                                 lit mean   out mean   out p10');
console.log('-------------------------------------------------------------------');
let weak = 0;
for (const r of rows) {
  const room = rooms.find((q) => q.id === r.id);
  const spots = await standable(room);
  if (!spots.length) continue;
  /* The BEST spot and the brightest direction in it: if even that is
     under the floor, nowhere in the room is workable. */
  const [x, z] = spots[0];
  let out = null;
  for (const yaw of YAWS) {
    const v = await sample(x, room.y + EYE, z, yaw);
    if (!out || v.mean > out.mean) out = v;
  }
  const dark = !(out.blind < 7 && out.p10 >= 28 && out.mean >= 62);
  if (!dark) weak++;
  console.log(
    `${dark ? ' ok ' : 'WEAK'} ${r.id.padEnd(34)} ${r.mean.toFixed(0).padStart(4)}`
    + ` ${out.mean.toFixed(0).padStart(10)} ${String(out.p10).padStart(9)}`,
  );
}
console.log('-------------------------------------------------------------------');
console.log(`${rows.length - weak}/${rows.length} rooms go dark when the breaker does`);
for (const l of page.logs) console.log(l);
await browser.close();
process.exit(bad + weak + unlit ? 1 : 0);
