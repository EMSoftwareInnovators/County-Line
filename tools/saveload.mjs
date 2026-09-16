/* ============================================================
   saveload.mjs -- the save format: round trip, versioning, rejection of
   nonsense, and the one rule that cannot be broken -- County Line never
   reads or writes Final Rental's storage.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();
const press = async (k, ms = 250) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };

/* Plant a Final Rental save first. Nothing County Line does may disturb it. */
await page.evaluate(() => {
  localStorage.setItem('finalrental.padbinds', '{"0":["confirm"]}');
  localStorage.setItem('finalrental.save', '{"night":3}');
});

/* ---- play a bit, then save ---- */
await press('Enter', 600);
check('a shift is running', (await page.evaluate(() => window.__game.state)) === 'PLAY');

await page.evaluate(() => {
  const p = window.__game.player;
  p.x = 11.25; p.y = 0; p.z = 6.75; p.yaw = 1.25; p.pitch = -0.1;
  window.__game.campaign.setFlag('test-flag', 'kept');
  window.__game.level.doorById('office-door').locked = true;
  window.__game.level.doorById('workroom-door').target = 1;
  window.__game.level.doorById('workroom-door').amount = 1;
});
await page.waitForTimeout(200);
const saved = await page.evaluate(() => window.__game.autosave());
check('saving reports success', saved === true, String(saved));

const blob = await page.evaluate(() => JSON.parse(localStorage.getItem('countyline.save')));
check('the save is versioned', blob && blob.v === 1, JSON.stringify(blob && blob.v));
check('and carries a timestamp', blob && typeof blob.t === 'number');
check('and records the campaign, the player and the doors',
  blob.d.campaign === 'test' && blob.d.player.level === 'testbed'
  && typeof blob.d.world.doors['office-door'].locked === 'boolean',
  JSON.stringify(Object.keys(blob.d)));

check('Final Rental storage is untouched',
  await page.evaluate(() => localStorage.getItem('finalrental.padbinds') === '{"0":["confirm"]}'
    && localStorage.getItem('finalrental.save') === '{"night":3}'));

/* ---- quit to the title and continue ---- */
await page.evaluate(() => window.__game.quitToTitle());
await page.waitForTimeout(400);
check('CONTINUE appears once there is a save',
  await page.evaluate(() => window.__game.titleItems().some((i) => i.id === 'continue')));

await page.evaluate(() => window.__game.titleAction('continue'));
await page.waitForTimeout(600);
const restored = await page.evaluate(() => {
  const g = window.__game;
  return {
    state: g.state,
    x: g.player.x, y: g.player.y, z: g.player.z, yaw: g.player.yaw,
    flag: g.campaign.flag('test-flag'),
    officeLocked: g.level.doorById('office-door').locked,
    workroomOpen: g.level.doorById('workroom-door').open,
  };
});
check('continuing resumes play', restored.state === 'PLAY', restored.state);
check('and puts the player back where they were',
  Math.abs(restored.x - 11.25) < 0.01 && Math.abs(restored.z - 6.75) < 0.01
  && Math.abs(restored.yaw - 1.25) < 0.01,
  `${restored.x} ${restored.z} ${restored.yaw}`);
check('story flags survive', restored.flag === 'kept', String(restored.flag));
check('door states survive', restored.officeLocked === true && restored.workroomOpen === true,
  `${restored.officeLocked} / ${restored.workroomOpen}`);

/* ---- a corrupt save is refused, not crashed on ---- */
await page.evaluate(() => {
  localStorage.setItem('countyline.save', 'this is not JSON at all');
  localStorage.removeItem('countyline.save.corrupt');
});
const bad = await page.evaluate(() => {
  const S = new window.__cl.save.SaveGame();
  const r = S.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) });
  return { ok: r.ok, reason: r.reason, moved: localStorage.getItem('countyline.save.corrupt') };
});
check('a corrupt save is refused', bad.ok === false, String(bad.reason));
check('and is kept aside rather than deleted', typeof bad.moved === 'string', String(bad.moved));

/* ---- a save from the future is refused ---- */
await page.evaluate(() => {
  localStorage.setItem('countyline.save', JSON.stringify({ v: 99, t: 1, d: { campaign: 'test' } }));
});
const future = await page.evaluate(() => {
  const S = new window.__cl.save.SaveGame();
  const r = S.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) });
  return { ok: r.ok, reason: r.reason };
});
check('a save from a newer build is refused', future.ok === false && /newer/.test(future.reason), future.reason);

/* ---- a save naming an unknown level is refused ---- */
await page.evaluate(() => {
  localStorage.setItem('countyline.save', JSON.stringify({
    v: 1, t: 1, d: { campaign: 'test', state: null, player: { level: 'old-academy' } },
  }));
});
const unknown = await page.evaluate(() => {
  const S = new window.__cl.save.SaveGame();
  const r = S.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) });
  return { ok: r.ok, reason: r.reason };
});
check('a save naming a level this build does not have is refused',
  unknown.ok === false && /old-academy/.test(unknown.reason), unknown.reason);

/* ---- starting a new game clears the save but keeps the settings ---- */
await page.evaluate(() => {
  window.__game.settings.values.volMaster = 0.42;
  window.__game.settings.save();
});
await page.evaluate(() => window.__game.newGame());
await page.waitForTimeout(400);
check('a new game does not carry the old flags',
  await page.evaluate(() => window.__game.campaign.flag('test-flag') === undefined));
check('and leaves settings alone',
  await page.evaluate(() => JSON.parse(localStorage.getItem('countyline.settings')).d.volMaster === 0.42));

check('Final Rental storage is still untouched at the end',
  await page.evaluate(() => localStorage.getItem('finalrental.save') === '{"night":3}'));

/* ---- a browser that refuses storage altogether ----
   Firefox in a private window, Safari with site data blocked, and any
   browser with third-party storage partitioned off all throw on the first
   localStorage access. A game that dies on the options screen because it
   could not remember a volume slider is worse than one that forgets it. */
const refused = await page.evaluate(() => {
  const st = window.__cl.storage;
  const real = Object.getOwnPropertyDescriptor(Window.prototype, 'localStorage')
    || Object.getOwnPropertyDescriptor(window, 'localStorage');
  const thrower = new Proxy({}, {
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    set() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => thrower });
  st._reset();
  const out = {};
  try {
    out.available = st.available();
    const S = new window.__cl.settings.Settings();
    out.loaded = S.load().volMaster;
    out.saved = S.save();
    S.set('volMaster', 0.5);
    out.reloaded = new window.__cl.settings.Settings().load().volMaster;
    const G = new window.__cl.save.SaveGame();
    out.saveLoad = G.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) }).ok;
    out.threw = false;
  } catch (e) {
    out.threw = e.name + ': ' + e.message;
  }
  if (real) Object.defineProperty(window, 'localStorage', real);
  st._reset();
  return out;
});
check('a browser that refuses storage does not crash the game', refused.threw === false,
  String(refused.threw));
check('and settings still load as defaults', refused.loaded === 0.8, String(refused.loaded));
check('and saving reports that it did not stick', refused.saved === false, String(refused.saved));
check('and there is no save to continue from', refused.saveLoad === false, String(refused.saveLoad));

/* and the game itself keeps running */
await page.waitForTimeout(600);
check('the game is still running afterwards',
  await page.evaluate(() => window.__game.state === 'PLAY' || window.__game.state === 'TITLE'),
  await page.evaluate(() => window.__game.state));

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
