/* ============================================================
   terminal-shots.mjs -- views of Richmond Central, for looking at.

   Not a pass/fail test. The fit-out, the lighting and the yard are all
   judged by eye, and these are the views worth judging them from: what
   a passenger sees, what the clerk sees, and what the yard looks like
   with coaches standing in it.

   Three of them are the same room twice -- lit and with its breaker
   off -- because the whole point of the retrofit is the difference.
   ============================================================ */
import fs from 'node:fs';
import { launch, openGame } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const OUT = process.env.SHOT_DIR || 'docs/terminal';
const ft = (f) => f * 0.3048;

/**
 * Each view: a name, a camera, and optionally what the building is
 * doing while it is taken.
 */
const SHOTS = [
  ['01-lobby-counter', { x: ft(-9), y: 0, z: ft(-6), yaw: -0.55, pitch: 0.05 }],
  ['02-lobby-board', { x: ft(2), y: 0, z: ft(2), yaw: 0.35, pitch: 0.22 }],
  ['03-lobby-from-doors', { x: 0, y: 0, z: ft(-14), yaw: 0, pitch: 0.06 }],
  ['04-waiting-room', { x: ft(-30), y: 0, z: ft(-14), yaw: -0.6, pitch: 0.02 }],
  ['05-newsstand', { x: ft(31), y: 0, z: ft(-10), yaw: -2.1, pitch: 0.02 }],
  ['06-clerk-desk', { x: ft(-49.5), y: 0, z: ft(-18.5), yaw: 3.1416, pitch: -0.04 }],
  ['07-breaker-panels', { x: ft(-44.4), y: 0, z: ft(-23.5), yaw: Math.PI, pitch: 0.06 }],
  ['08-switch-bank', { x: ft(-51.5), y: 0, z: ft(-22.5), yaw: 0, pitch: 0.16 }],
  ['09-baggage-room', { x: ft(27), y: 0, z: ft(26), yaw: 0.5, pitch: 0.02 }],
  ['10-dispatch-floor', { x: ft(26), y: 0, z: ft(12), yaw: 1.2, pitch: 0.02 }],
  ['11-platform-walk', { x: ft(-60), y: ft(-2.8), z: ft(24), yaw: 0, pitch: 0.02 }],
  ['12-platform-bays', { x: ft(-62), y: ft(-3), z: ft(30), yaw: -0.5, pitch: 0.06 }],
  ['13-coach-side', { x: ft(-80), y: ft(-2.8), z: ft(50), yaw: 2.0, pitch: 0.03 }],
  ['14-yard-from-aisle', { x: ft(-126), y: ft(-2.8), z: ft(52), yaw: 1.3, pitch: 0.04 }],
  ['15-facade-at-night', { x: 0, y: ft(-3), z: ft(-92), yaw: 0, pitch: 0.13 }],
  ['16-upstairs-dark', { x: ft(-36), y: ft(17.33), z: ft(15), yaw: 1.5708, pitch: 0.02 }],
  ['17-upstairs-lit', { x: ft(-36), y: ft(17.33), z: ft(15), yaw: 1.5708, pitch: 0.02 },
    (g) => { g.power.system.setSwitch('floor2-west', true); g.power.apply(); }],
  ['18-east-wing-tripped', { x: ft(27), y: 0, z: ft(26), yaw: 0.5, pitch: 0.02 },
    (g) => { g.power.system.trip('east-rear', 'harness'); g.power.apply(); }],
  ['19-lobby-tripped', { x: ft(-9), y: 0, z: ft(-6), yaw: -0.55, pitch: 0.05 },
    (g) => { g.power.system.trip('lobby', 'harness'); g.power.apply(); }],
];

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
fs.mkdirSync(OUT, { recursive: true });

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);

/* Four coaches in the yard, berthed, with their rolls set: a terminal
   with nothing at the platform is a photograph of an empty lot. */
await page.evaluate(() => {
  const g = window.__game;
  g.ui.setHudVisible(false);
  /* DOORS SHUT, unlike the architecture views. Those are pictures of
     rooms and a closed leaf hides one; these are pictures of a fit-out,
     and an eight-and-a-half-foot leaf swung into the middle of the
     clerk's office hides the panel wall it was taken for. The two that
     open are the ones a shift actually leaves open. */
  for (const d of g.level.doors) { d.locked = false; d.target = 0; d.amount = 0; }
  for (const id of ['west-side', 'east-hall-porch']) {
    const d = g.level.doorById(id);
    if (d) { d.target = 1; d.amount = 1; }
  }
  const fleet = g.fleet;
  const board = [
    ['ATLANTA', 'ATL', 1],
    ['SAVANNAH', 'SAV', 2],
    ['MACON', 'MCN', 3],
    ['CHARLESTON', 'CHS', 4],
  ];
  for (const [sign, route, bay] of board) {
    const c = fleet.add({ id: `shot-${route}`, route, sign, bay });
    if (!c) continue;
    c.arrive();
  }
  /* Wind them in rather than teleporting them: the state machine puts
     them where they belong and nothing else knows the geometry. */
  for (let t = 0; t < 40; t += 0.05) { g.level.update(0.05); g.fleet.update(0.05); }
  g.level.update(0.016);
});

for (const [name, at, before] of SHOTS) {
  if (before) await page.evaluate(`(${before.toString()})(window.__game)`);
  await page.evaluate((a) => {
    const p = window.__game.player;
    p.frozen = true;
    p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = a.pitch;
    p.vx = 0; p.vz = 0; p.vy = 0; p.bob = 0;
  }, at);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log(`wrote ${SHOTS.length} views to ${OUT}`);
for (const l of page.logs) console.log(l);
await browser.close();
