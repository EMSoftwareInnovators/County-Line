/* ============================================================
   training-shots.mjs -- views of the training room, for looking at.
   Not a pass/fail test: the lesson is judged by tools/training.mjs,
   and this is what it looks like while you are being taught.
   ============================================================ */
import fs from 'node:fs';
import { launch, openGame } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const OUT = process.env.SHOT_DIR || 'docs/training';
const ft = (f) => f * 0.3048;

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
fs.mkdirSync(OUT, { recursive: true });

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);

/** Put the lesson on a given step, with the trainee where he belongs. */
const toStep = (n) => page.evaluate((k) => {
  const g = window.__game, t = g.training, ctx = g.ctx();
  const before = ['lights', 'card', 'done', 'weigh', 'tag', 'board'];
  t.at = k;
  for (let i = 0; i < before.length; i++) t.flags.add(before[i]);
  t.flags.clear();
  /* give it the flags the earlier steps would have set */
  const need = { 2: ['lights'], 3: ['lights', 'card'], 8: ['lights', 'card', 'done'],
    11: ['lights', 'card', 'done', 'weigh', 'tag', 'board'] };
  for (const f of (need[k] || [])) t.flags.add(f);
  t.update(0.05, ctx);
  for (let i = 0; i < 60; i++) t.update(0.05, ctx);
}, n);

const look = (x, z, yaw, pitch) => page.evaluate((a) => {
  const p = window.__game.player;
  p.frozen = true;
  p.x = a.x; p.z = a.z; p.y = 0; p.yaw = a.yaw; p.pitch = a.pitch;
  p.vx = 0; p.vy = 0; p.vz = 0; p.bob = 0;
}, { x, z, yaw, pitch });

const settle = () => page.evaluate(() => new Promise((d) => {
  let n = 0; const t = () => (++n >= 8 ? d() : requestAnimationFrame(t)); requestAnimationFrame(t);
}));

const SHOTS = [
  ['01-the-room', 0, ft(29), ft(5), -0.97, 0.03],
  ['02-the-counter', 3, ft(13), ft(9), 0, 0.02],
  ['03-serving', 3, ft(13), ft(11), 0, 0.0],
  ['04-the-scale', 8, ft(24), ft(15), 0.9, 0.06],
  ['05-punching-out', 11, ft(23), ft(7), 0, 0.02],
];
for (const [name, step, x, z, yaw, pitch] of SHOTS) {
  await toStep(step);
  await look(x, z, yaw, pitch);
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png` });
}
console.log(`wrote ${SHOTS.length} views to ${OUT}`);
for (const l of page.logs) console.log(l);
await browser.close();
