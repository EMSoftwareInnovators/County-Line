/* ============================================================
   production.mjs -- what a shipped web build hands out.

   `npm run build` produces dist/web, and that folder is what gets uploaded.
   It has to boot and play exactly as the repository does, and it has to give
   nobody a handle on the simulation: no window.__game to fast-forward a
   shift with, no module namespace to reach into a level through.

   Adapted from the equivalent check on Final Rental's later branch, which is
   where the idea that a production build is a distinct thing came from. The
   development server keeps the hooks, which is why every other harness here
   still works.
   ============================================================ */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { launch, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const DIR = 'dist/web';
const PORT = String(Number(process.env.PORT || 8199) + 11);

if (!existsSync(`${DIR}/index.html`)) {
  console.log(`SKIP  ${DIR} is not built -- run "npm run build" first`);
  process.exit(0);
}
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }

const server = spawn(process.execPath, ['../../serve.cjs'], {
  cwd: DIR, stdio: 'ignore', env: { ...process.env, PORT },
});
await new Promise((r) => setTimeout(r, 700));

const check = checker();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const logs = [];
page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message)));
page.on('console', (m) => { if (m.type() === 'error') logs.push('[error] ' + m.text()); });

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load' });
await page.waitForTimeout(3000);

const shipped = await page.evaluate(() => ({
  game: typeof window.__game !== 'undefined',
  modules: typeof window.__cl !== 'undefined',
  marked: !!document.querySelector('script[type="module"][data-prod="1"]'),
  title: document.title,
  titleScreen: !document.getElementById('title').classList.contains('hidden'),
  styled: getComputedStyle(document.getElementById('cabinet')).position === 'relative',
}));
check('the built page is marked as production', shipped.marked);
check('it exposes no window.__game', shipped.game === false);
check('and no module namespace', shipped.modules === false);
check('but it still boots to the title', shipped.titleScreen && shipped.title === 'COUNTY LINE',
  `${shipped.title} / title ${shipped.titleScreen}`);
check('and the stylesheet came with it', shipped.styled);

/* It has to PLAY, not merely load -- checked the way a player would, off the
   canvas, because there is nothing else to ask. */
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
const painted = await page.evaluate(() => {
  const c = document.getElementById('screen');
  const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let lit = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 12 || d[i + 1] > 12 || d[i + 2] > 12) lit++;
  return { lit, total: d.length / 4 };
});
check('a shift starts and the level renders', painted.lit > painted.total * 0.2,
  `${painted.lit} of ${painted.total} pixels lit`);

/* and it still saves, under its own namespace */
await page.waitForTimeout(400);
const saved = await page.evaluate(() => ({
  keys: Object.keys(localStorage),
  ours: Object.keys(localStorage).every((k) => k.startsWith('countyline.')),
}));
check('a shipped build still saves', saved.keys.length > 0, saved.keys.join(','));
check('and only inside its own namespace', saved.ours, saved.keys.join(','));

check('no page errors', logs.filter((l) => l.startsWith('[pageerror]')).length === 0, logs.join(' | '));

await browser.close();
server.kill();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
