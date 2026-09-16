/* ============================================================
   perf.mjs -- how long a frame takes.

   The target machine is an Apple Silicon MacBook Air, and the renderer is
   a software rasterizer, so frame cost is a design constraint rather than
   an afterthought. This measures the whole frame -- transform, raster,
   post-process, DOM -- from a handful of viewpoints chosen to be the
   expensive ones: the length of the building, the double-height hall, and
   the outside looking back at the facade.

   It runs under headless SwiftShader in CI, which is much slower than the
   machine this is for, so the threshold is generous and the number itself
   is what is worth reading.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const BUDGET = Number(process.env.FRAME_BUDGET || 33);   // ms

const VIEWS = [
  ['spawn', { x: 6.5, y: 0, z: 3.2, yaw: 0, pitch: 0 }],
  ['down the hall', { x: 7.0, y: 0, z: 1.0, yaw: 0, pitch: 0.1 }],
  ['the tall volume', { x: 7.0, y: 0, z: 7.0, yaw: 0.3, pitch: 0.5 }],
  ['from the gallery', { x: 2.5, y: 3.81, z: 13.0, yaw: 2.1, pitch: -0.2 }],
  ['through the building', { x: 2.0, y: 0, z: 7.0, yaw: 1.5708, pitch: 0 }],
  ['the facade', { x: 16.0, y: -0.15, z: -9.0, yaw: -0.4, pitch: 0.1 }],
];

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await page.keyboard.press('Enter');
await page.waitForTimeout(700);

const res = await page.evaluate(() => window.__game.raster.w + 'x' + window.__game.raster.h);
console.log(`internal resolution ${res}\n`);

let worst = 0;
for (const [label, at] of VIEWS) {
  const ms = await page.evaluate(async (a) => {
    const g = window.__game;
    const p = g.player;
    p.frozen = true;
    p.x = a.x; p.y = a.y; p.z = a.z; p.yaw = a.yaw; p.pitch = a.pitch;
    p.vx = 0; p.vz = 0; p.vy = 0;
    // let it settle, then time a run of frames
    await new Promise((r) => setTimeout(r, 300));
    const times = [];
    let last = performance.now();
    await new Promise((resolve) => {
      let n = 0;
      const tick = () => {
        const now = performance.now();
        times.push(now - last);
        last = now;
        if (++n < 70) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    p.frozen = false;
    // drop the first few, which include the settle, then take the median
    const s = times.slice(10).sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  }, at);
  const tris = await page.evaluate(() => window.__game.level.stats.tris);
  const chunks = await page.evaluate(() => `${window.__game.level.stats.chunksDrawn}/${window.__game.level.stats.chunks}`);
  worst = Math.max(worst, ms);
  console.log(`  ${label.padEnd(22)} ${ms.toFixed(1).padStart(6)} ms   ${String(tris).padStart(5)} tris   ${chunks} chunks`);
}

/* Culling actually culling. With six rooms in a small building most
   views keep all six -- the test is that facing away from the building
   from the far end of the yard keeps fewer. */
const culled = await page.evaluate(async () => {
  const g = window.__game;
  const p = g.player;
  p.frozen = true;
  p.x = 16; p.y = -0.15; p.z = -11; p.yaw = Math.PI; p.pitch = 0;
  await new Promise((r) => setTimeout(r, 400));
  const away = g.level.stats.chunksDrawn;
  p.yaw = 0;
  await new Promise((r) => setTimeout(r, 400));
  const towards = g.level.stats.chunksDrawn;
  p.frozen = false;
  return { away, towards, total: g.level.stats.chunks };
});
console.log('');
check('facing away from the building submits fewer rooms than facing it',
  culled.away < culled.towards, `${culled.away} vs ${culled.towards} of ${culled.total}`);
check(`the worst view stays inside ${BUDGET} ms a frame`, worst <= BUDGET, `${worst.toFixed(1)} ms`);
check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
