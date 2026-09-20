/* ============================================================
   academy-shots.mjs -- views of the Old Academy, for looking at.

   Not a pass/fail test. Architecture is judged by eye, and these are the
   positions the brief asks to be able to judge it from -- the five
   Stage 2.1 names first, each one chosen to line up with a supplied
   photograph as nearly as the real camera positions allow.

   Each view is captured TWICE: once as the game renders it, and once in
   architecture-review mode with the CRT off. See the note at the loop.
   ============================================================ */
import fs from 'node:fs';
import { launch, openGame, startNight } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const OUT = process.env.SHOT_DIR || 'docs/academy';
const ft = (f) => f * 0.3048;

const SHOTS = [
  /* ---- the five the Stage 2.1 brief asks for, first ---- */
  ['01-facade', { x: 0, y: ft(-3), z: ft(-92), yaw: 0, pitch: 0.13 }],
  ['02-facade-3q', { x: ft(-70), y: ft(-3), z: ft(-70), yaw: 0.70, pitch: 0.10 }],
  ['03-portico', { x: 0, y: ft(-3), z: ft(-52), yaw: 0, pitch: 0.22 }],
  ['04-central-room', { x: ft(16), y: 0, z: ft(12), yaw: -2.4, pitch: 0.02 }],
  ['05-central-mantel', { x: ft(-8), y: 0, z: ft(4), yaw: -1.5708, pitch: 0.02 }],
  ['06-west-stair', { x: ft(-42.5), y: 0, z: ft(10.9), yaw: -1.5708, pitch: 0.24 }],
  ['07-west-stair-hall', { x: ft(-30), y: 0, z: ft(19.5), yaw: -1.5708, pitch: 0.02 }],
  ['08-garden-west', { x: ft(14), y: ft(-1.5), z: ft(45), yaw: -1.4, pitch: 0.26 }],

  /* ---- and the rest of the building ---- */
  ['09-front-terrace', { x: 0, y: ft(17.33), z: ft(-24), yaw: Math.PI, pitch: 0.06 }],
  ['10-central-north', { x: 0, y: 0, z: ft(-13), yaw: 0, pitch: 0.06 }],
  ['11-rear-porch', { x: 0, y: 0, z: ft(20), yaw: 0, pitch: 0.05 }],
  ['12-garden-south', { x: 0, y: ft(-1.5), z: ft(52), yaw: 3.1416, pitch: 0.14 }],
  ['13-garden-east', { x: ft(-14), y: ft(-1.5), z: ft(45), yaw: 1.4, pitch: 0.26 }],
  ['14-garden-up', { x: 0, y: ft(-1.5), z: ft(46), yaw: 0, pitch: 0.95 }],
  ['15-east-stair', { x: ft(42.5), y: 0, z: ft(10.9), yaw: 1.5708, pitch: 0.24 }],
  ['16-upper-landing', { x: ft(-45), y: ft(17.33), z: ft(15), yaw: 1.5708, pitch: 0.02 }],
  ['17-upper-center', { x: ft(-16), y: ft(17.33), z: ft(-12), yaw: 0.45, pitch: 0.02 }],
  ['18-upper-east', { x: ft(39), y: ft(17.33), z: ft(30), yaw: 0, pitch: 0.0 }],
  ['19-indians', { x: ft(-30), y: 0, z: ft(0), yaw: -2.2, pitch: 0.02 }],
  ['20-giftshop', { x: ft(30), y: 0, z: ft(-2), yaw: 2.3, pitch: 0.02 }],
  ['21-west-rear-hall', { x: ft(-32), y: 0, z: ft(11), yaw: 0, pitch: 0.0 }],
  ['22-west-side', { x: ft(-84), y: ft(-3), z: ft(30), yaw: 1.35, pitch: 0.10 }],
  ['23-rear-3q', { x: ft(-66), y: ft(-3), z: ft(104), yaw: 2.5, pitch: 0.06 }],
  ['24-overview', { x: 0, y: ft(150), z: ft(-52), yaw: 0, pitch: -0.92 }],
];

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(`${OUT}/review`, { recursive: true });

await startNight(page);
await page.waitForTimeout(700);
await page.evaluate(() => {
  window.__game.ui.setHudVisible(false);
  /* Doors open. These are views of the architecture, and a closed leaf is
     a picture of a door rather than of the room behind it. */
  for (const d of window.__game.level.doors) { d.locked = false; d.target = 1; d.amount = 1; }
  window.__game.level.update(0.016);
});

/* EVERY VIEW TWICE.

   The retro pass is the game as it is played. The review pass is the same
   frame with the CRT switched off and the fog pushed out of the way --
   same geometry, same materials, same baked light, only the presentation
   changes. It exists so a screenshot can be held against a photograph
   without arguing with dither, bleed, scanlines, grain and a vignette,
   and it is the only honest way to judge whether the architecture is
   right rather than whether the filter is flattering. */
for (const review of [false, true]) {
  await page.evaluate((r) => { window.__game.debug.reviewMode = r; }, review);
  const dir = review ? `${OUT}/review` : OUT;
  for (const [name, at] of SHOTS) {
    await page.evaluate((a) => {
      const p = window.__game.player;
      p.frozen = true;
      p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = a.pitch;
      p.vx = 0; p.vz = 0; p.vy = 0; p.bob = 0;
    }, at);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${dir}/${name}.png` });
  }
  console.log(`wrote ${SHOTS.length} ${review ? 'architecture-review' : 'retro'} views to ${dir}`);
}
await browser.close();
