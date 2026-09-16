/* ============================================================
   browser.mjs -- find a browser to drive.

   The harnesses run against whatever is installed rather than against a
   hard-coded path, because the two places this repository gets tested --
   a developer's Mac and a CI container -- keep their browsers in
   different places, and a test that cannot find a browser should say so
   rather than fail as though the game were broken.

   COUNTY_LINE_CHROMIUM / COUNTY_LINE_FIREFOX override everything.
   ============================================================ */
import { chromium, firefox } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = [
  process.env.PLAYWRIGHT_BROWSERS_PATH,
  '/opt/pw-browsers',
  path.join(process.env.HOME || '', 'Library/Caches/ms-playwright'),
  path.join(process.env.HOME || '', '.cache/ms-playwright'),
].filter(Boolean);

const MAC_CHROME = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const MAC_FIREFOX = ['/Applications/Firefox.app/Contents/MacOS/firefox'];

function findIn(root, dirPrefix, rel) {
  let entries;
  try { entries = fs.readdirSync(root); } catch { return null; }
  const dirs = entries.filter((d) => d.startsWith(dirPrefix)).sort().reverse();
  for (const d of dirs) {
    for (const r of rel) {
      const p = path.join(root, d, r);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

export function findChromium() {
  if (process.env.COUNTY_LINE_CHROMIUM) return process.env.COUNTY_LINE_CHROMIUM;
  for (const root of ROOTS) {
    const p = findIn(root, 'chromium-', [
      'chrome-linux/chrome',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      'chrome-win/chrome.exe',
    ]);
    if (p) return p;
  }
  for (const p of MAC_CHROME) if (fs.existsSync(p)) return p;
  return null;
}

export function findFirefox() {
  if (process.env.COUNTY_LINE_FIREFOX) return process.env.COUNTY_LINE_FIREFOX;
  for (const root of ROOTS) {
    const p = findIn(root, 'firefox-', [
      'firefox/firefox',
      'firefox/Nightly.app/Contents/MacOS/firefox',
      'firefox/firefox.exe',
    ]);
    if (p) return p;
  }
  for (const p of MAC_FIREFOX) if (fs.existsSync(p)) return p;
  return null;
}

/**
 * @param which 'chromium' | 'firefox'
 * @returns a launched browser, or null when that engine is not installed
 */
export async function launch(which) {
  if (which === 'firefox') {
    const exe = findFirefox();
    if (!exe) return null;
    return firefox.launch({ executablePath: exe });
  }
  const exe = findChromium();
  if (!exe) return null;
  return chromium.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--use-gl=swiftshader', '--disable-dev-shm-usage'],
  });
}

/** Boot the game and hand back a page with the console captured. */
export async function openGame(browser, port, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const logs = [];
  page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.state !== 'BOOT', null, { timeout: 30000 });
  if (opts.mute !== false) {
    await page.evaluate(() => { window.__game.audio.setMuted(true); });
  }
  page.logs = logs;
  return page;
}

/** A tiny check runner shared by every harness. */
export function checker() {
  let fails = 0;
  const check = (label, ok, extra = '') => {
    if (!ok) fails++;
    console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  };
  check.fails = () => fails;
  return check;
}
