/* ============================================================
   shots.mjs -- screenshots of the test level, for looking at.

   Not a pass/fail test. It puts the camera at a set of known positions
   and writes the frames out, so that "the high-ceiling room renders
   correctly" can be answered by looking at it rather than asserted.
   ============================================================ */
import fs from 'node:fs';
import { launch, openGame } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const OUT = process.env.SHOT_DIR || 'docs/shots';

const SHOTS = [
  ['01-title', null],
  ['02-hall', { x: 7.0, y: 0, z: 2.0, yaw: 0.05, pitch: 0.28 }],
  ['03-hall-ceiling', { x: 7.0, y: 0, z: 7.0, yaw: 0.2, pitch: 0.75 }],
  ['04-stairs-up', { x: 5.0, y: 0, z: 3.4, yaw: 0, pitch: 0.18 }],
  ['05-stairs-down', { x: 5.0, y: 3.81, z: 11.2, yaw: Math.PI, pitch: -0.35 }],
  ['06-gallery', { x: 2.2, y: 3.81, z: 12.6, yaw: 1.9, pitch: -0.15 }],
  ['07-upper-room', { x: 11.0, y: 3.81, z: 12.2, yaw: 1.4, pitch: 0 }],
  ['08-double-doors', { x: 12.5, y: 0, z: 7.0, yaw: Math.PI / 2, pitch: 0 }],
  ['09-corridor', { x: 16.4, y: 0, z: 1.5, yaw: 0, pitch: 0 }],
  ['10-workroom', { x: 20.0, y: 0, z: 6.0, yaw: 1.2, pitch: 0 }],
  ['11-front-door', { x: 4.0, y: 0, z: 3.0, yaw: Math.PI, pitch: -0.05 }],
  ['12-yard', { x: 4.0, y: -0.15, z: -7.0, yaw: 0, pitch: 0.06 }],
  ['13-facade', { x: 16.0, y: -0.15, z: -9.0, yaw: -0.5, pitch: 0.1 }],
  ['14-debug', { x: 5.0, y: 0, z: 6.5, yaw: 0, pitch: 0.1 }, { debug: 2 }],
  ['15-collision', { x: 5.0, y: 0, z: 3.0, yaw: 0, pitch: 0.15 }, { collision: true }],
  ['16-pause', { x: 7.0, y: 0, z: 5.0, yaw: 0, pitch: 0 }, { pause: true }],
];

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
fs.mkdirSync(OUT, { recursive: true });

for (const [name, at, opt = {}] of SHOTS) {
  if (at) {
    const playing = await page.evaluate(() => window.__game.state === 'PLAY');
    if (!playing) {
      await page.evaluate(() => window.__game.newGame());
      await page.waitForTimeout(500);
    }
    if (opt.pause) { await page.evaluate(() => window.__game.pause()); }
    else if (await page.evaluate(() => window.__game.state === 'PAUSE')) {
      await page.evaluate(() => window.__game.resume());
    }
    await page.evaluate((a) => {
      const p = window.__game.player;
      p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = a.pitch;
      p.vx = 0; p.vz = 0; p.vy = 0; p.bob = 0;
    }, at);
    await page.evaluate((o) => {
      window.__game.debug.level = o.debug || 0;
      window.__game.debug.showCollision = !!o.collision;
    }, opt);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`wrote ${OUT}/${name}.png`);
}
await browser.close();
