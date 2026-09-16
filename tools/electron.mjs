/* ============================================================
   electron.mjs -- the desktop build, launched for real.

   Adapted from Final Rental's tools/electron.mjs, which checks exactly
   the right things. The one that can quietly break is the ORIGIN: a
   downloaded folder is file://, browsers refuse ES modules from file://,
   and the failure mode is a black window with one line in a console the
   player does not have. The app serves itself over its own scheme
   instead, and this verifies the parts nobody would notice were wrong
   until after it shipped.

   Headless:
     xvfb-run -a node tools/electron.mjs

   Or against a packaged build, which is the run that matters -- packaged,
   the game lives inside app.asar and __dirname points into it:
     npx electron-builder --linux --dir
     xvfb-run -a node tools/electron.mjs dist/linux-unpacked/county-line
   ============================================================ */
import { _electron as electron } from 'playwright-core';
import { existsSync } from 'node:fs';

const BUILT = process.argv[2];
if (BUILT && !existsSync(BUILT)) {
  console.error(`no such executable: ${BUILT}`);
  process.exit(1);
}
console.log(BUILT ? `  -- packaged: ${BUILT} --` : '  -- from the repository --');

let fails = 0;
const check = (label, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};

/* The reachability probes below deliberately ask for things that are not
   there, and Chromium logs each as a console error. Collected, not blamed
   on the app. */
const errors = [];
let probing = false;

const app = await electron.launch(BUILT
  ? { executablePath: BUILT, args: ['--no-sandbox'] }
  : { args: ['.', '--no-sandbox'], env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: '1' } });
const page = await app.firstWindow();
page.on('pageerror', (e) => { if (!probing) errors.push(e.message); });
page.on('console', (m) => { if (m.type() === 'error' && !probing) errors.push('[console] ' + m.text()); });
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2500);

/* ---------- it came up, from the right place ---------- */
check('the app opens a window', !!page);
check('and the game is served over its own scheme, not file://',
  page.url().startsWith('game://app/'), page.url());

/* ---------- the modules ran ---------- */
const booted = await page.evaluate(() => ({
  game: typeof window.__game === 'object' && !!window.__game,
  modules: window.__cl ? Object.keys(window.__cl).length : 0,
  canvas: (() => { const c = document.querySelector('#screen'); return c ? [c.width, c.height] : null; })(),
  styled: getComputedStyle(document.querySelector('#cabinet')).position === 'relative',
  title: document.title,
  level: window.__game && window.__game.level ? window.__game.level.id : null,
}));
check('the game booted', booted.game);
check('and every module it imports came through', booted.modules >= 10,
  `${booted.modules} modules on the dev hook`);
check('the stylesheet arrived too', booted.styled);
check('the window is called COUNTY LINE', booted.title === 'COUNTY LINE', booted.title);
check('and the test level built', booted.level === 'testbed', String(booted.level));

/* ---------- it plays ---------- */
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const running = await page.evaluate(() => {
  const g = window.__game;
  g.audio.setMuted(true);
  return { state: g.state, tris: g.level.stats.tris };
});
check('a shift starts', running.state === 'PLAY', running.state);
check('and the renderer is drawing the level', running.tris > 500, `${running.tris} triangles`);

/* ---------- the mouse ---------- */
await page.mouse.click(400, 300);
await page.waitForTimeout(900);
const locked = await page.evaluate(() => !!document.pointerLockElement);
check('clicking the screen captures the mouse', locked, String(locked));

/* ---------- the origin has storage ---------- */
const store = await page.evaluate(() => {
  try {
    localStorage.setItem('countyline.__probe', 'kept');
    const back = localStorage.getItem('countyline.__probe');
    localStorage.removeItem('countyline.__probe');
    return back;
  } catch (e) { return `threw: ${e.name}`; }
});
check('and the origin has storage, so settings survive a restart', store === 'kept', String(store));

/* ---------- only the game is behind that door ---------- */
probing = true;
const reach = await page.evaluate(async () => {
  const out = {};
  for (const [name, url] of [
    ['the page', 'game://app/index.html'],
    ['a module', 'game://app/src/main.js'],
    ['the manifest next to it', 'game://app/package.json'],
    ['dot-dot', 'game://app/../package.json'],
    ['encoded dot-dot', 'game://app/%2e%2e/package.json'],
    ['deep dot-dot', 'game://app/src/%2e%2e/%2e%2e/%2e%2e/etc/passwd'],
    ['the electron shell itself', 'game://app/electron/main.js'],
    ['a game file that is not there', 'game://app/src/nope.js'],
  ]) {
    try { out[name] = (await fetch(url)).status; } catch { out[name] = 'threw'; }
  }
  return out;
});
probing = false;
check('the page and the game are served',
  reach['the page'] === 200 && reach['a module'] === 200,
  `page ${reach['the page']}, module ${reach['a module']}`);
check('and nothing else in the folder is, however it is spelled',
  ['the manifest next to it', 'dot-dot', 'encoded dot-dot', 'deep dot-dot',
    'the electron shell itself'].every((k) => reach[k] === 403),
  JSON.stringify(reach));
check('a missing game file is a 404, not a crash', reach['a game file that is not there'] === 404);

const headers = await page.evaluate(async () => {
  const r = await fetch('game://app/index.html');
  return r.headers.get('content-security-policy');
});
check('the page is served under a policy that allows it nothing remote',
  !!headers && /default-src 'none'/.test(headers) && !/unsafe-eval/.test(headers),
  headers || '(no policy)');

/* ---------- the window is a game's window ---------- */
const win = await app.evaluate(async ({ BrowserWindow, Menu }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const before = w.isFullScreen();
  w.setFullScreen(true);
  const full = w.isFullScreen();
  w.setFullScreen(before);
  return { full, menu: Menu.getApplicationMenu() === null, count: BrowserWindow.getAllWindows().length };
});
check('it can go fullscreen', win.full);
check('there is no menu bar to reload the game from', win.menu);
check('and exactly one window', win.count === 1, String(win.count));

check('nothing went wrong on the way', errors.length === 0, errors.join(' | '));

await app.close();
console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
