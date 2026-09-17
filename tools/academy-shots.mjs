/* ============================================================
   academy-shots.mjs -- views of the Old Academy, for looking at.

   Not a pass/fail test. Architecture is judged by eye, and these are the
   sixteen positions the Stage 2 brief asks to be able to judge it from.
   ============================================================ */
import fs from 'node:fs';
import { launch, openGame } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const OUT = process.env.SHOT_DIR || 'docs/academy';
const ft = (f) => f * 0.3048;

const SHOTS = [
  ['01-facade', { x: 0, y: ft(-3), z: ft(-95), yaw: 0, pitch: 0.10 }],
  ['02-facade-3q', { x: ft(-78), y: ft(-3), z: ft(-78), yaw: 0.72, pitch: 0.08 }],
  ['03-front-porch', { x: 0, y: 0, z: ft(-28), yaw: 0, pitch: 0.02 }],
  ['04-central-north', { x: 0, y: 0, z: ft(-13), yaw: 0, pitch: 0.03 }],
  ['05-central-west', { x: ft(8), y: 0, z: ft(-6), yaw: -1.5708, pitch: 0.0 }],
  ['06-central-east', { x: ft(-8), y: 0, z: ft(-6), yaw: 1.5708, pitch: 0.0 }],
  ['07-rear-porch', { x: 0, y: 0, z: ft(20), yaw: 0, pitch: 0.05 }],
  ['08-garden-south', { x: 0, y: ft(-1.5), z: ft(52), yaw: 3.1416, pitch: 0.12 }],
  ['09-garden-west', { x: ft(14), y: ft(-1.5), z: ft(45), yaw: -1.4, pitch: 0.22 }],
  ['10-garden-east', { x: ft(-14), y: ft(-1.5), z: ft(45), yaw: 1.4, pitch: 0.22 }],
  ['11-garden-up', { x: 0, y: ft(-1.5), z: ft(46), yaw: 0, pitch: 0.95 }],
  ['12-west-stair', { x: ft(-43), y: 0, z: ft(15.5), yaw: -1.5708, pitch: 0.12 }],
  ['13-east-stair', { x: ft(43), y: 0, z: ft(15.5), yaw: 1.5708, pitch: 0.12 }],
  ['14-upper-west', { x: ft(-39), y: ft(16), z: ft(34), yaw: 0, pitch: 0.0 }],
  ['15-upper-center', { x: 0, y: ft(16), z: ft(-12), yaw: 0, pitch: 0.0 }],
  ['16-upper-east', { x: ft(39), y: ft(16), z: ft(34), yaw: 0, pitch: 0.0 }],
  ['17-indians', { x: ft(-30), y: 0, z: ft(0), yaw: -2.2, pitch: 0.0 }],
  ['18-americana', { x: ft(30), y: 0, z: ft(0), yaw: 2.2, pitch: 0.0 }],
  ['19-west-rear-hall', { x: ft(-32), y: 0, z: ft(11), yaw: 0, pitch: 0.0 }],
  ['20-west-side', { x: ft(-90), y: ft(-3), z: ft(30), yaw: 1.35, pitch: 0.06 }],
  ['21-rear-3q', { x: ft(-70), y: ft(-3), z: ft(110), yaw: 2.5, pitch: 0.05 }],
  ['22-overview', { x: 0, y: ft(120), z: ft(-40), yaw: 0, pitch: -0.95 }],
  ['23-gallery', { x: 0, y: ft(16), z: ft(-25), yaw: 3.1416, pitch: 0.0 }],
  ['24-offices', { x: ft(-39), y: 0, z: ft(34), yaw: 0, pitch: 0.0 }],
];

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
fs.mkdirSync(OUT, { recursive: true });

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);
await page.evaluate(() => { window.__game.ui.setHudVisible(false); });

for (const [name, at] of SHOTS) {
  await page.evaluate((a) => {
    const p = window.__game.player;
    p.frozen = true;
    p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = a.pitch;
    p.vx = 0; p.vz = 0; p.vy = 0; p.bob = 0;
  }, at);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`wrote ${OUT}/${name}.png`);
}
await browser.close();
