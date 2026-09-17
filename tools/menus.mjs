/* ============================================================
   menus.mjs -- the front end: title, pause, settings, controls, and
   rebinding. Driven with real key events, because a menu that only
   responds to a method call is not a menu.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

const st = () => page.evaluate(() => ({
  state: window.__game.state,
  panel: !document.getElementById('panel').classList.contains('hidden'),
  head: (document.querySelector('#panel-body h2') || {}).textContent || '',
  sel: window.__game.menu.sel,
  title: !document.getElementById('title').classList.contains('hidden'),
}));
const press = async (k, ms = 200) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
/** Put the highlight on the row with this label. Selecting by label
    rather than by counting keypresses: the pages have headings in them,
    a heading is not selectable, and "two down from the top" stops being
    true the moment a row moves. */
const pick = (label) => page.evaluate((l) => {
  const g = window.__game;
  const i = g.menu.rows().findIndex((r) => r.label === l);
  if (i < 0) throw new Error(`no row "${l}" on ${g.menu.screen.title}`);
  g.menu.sel = i; g.menu.render();
}, label);
/** Walk into a sub-page the way a player does. */
const open = async (label, ms = 300) => { await pick(label); await press('Enter', ms); };
const rowsNow = () => page.evaluate(() => window.__game.menu.rows().map((r) => r.label));
const pageTitle = () => page.evaluate(() => window.__game.menu.screen.title);
const back = async () => {
  await page.evaluate(() => {
    const m = window.__game.menu;
    m.sel = m.rows().length - 1; m.render();
  });
  await press('Enter', 250);
};

/* ---- the title ---- */
let s = await st();
check('the game opens on the title', s.state === 'TITLE' && s.title, s.state);

const items = await page.evaluate(() => window.__game.titleItems().map((i) => i.id));
check('the title has NEW TEST GAME, SETTINGS and CONTROLS',
  items.includes('new') && items.includes('settings') && items.includes('controls'), items.join(','));
check('and no CONTINUE before anything has been saved', !items.includes('continue'), items.join(','));

/* ---- settings from the title ---- */
const settingsIndex = items.indexOf('settings');
for (let i = 0; i < settingsIndex; i++) await press('ArrowDown', 120);
await press('Enter', 350);
s = await st();
check('SETTINGS opens', s.state === 'MENU' && /SETTINGS/.test(s.head), `${s.state} / ${s.head}`);

/* ---- SETTINGS IS A MENU OF PAGES ----
   It used to be one list of nineteen rows, and a panel that clipped
   instead of scrolling cut it off at the twelfth -- so as far as a player
   was concerned the game had no video options at all. Every page below is
   short enough to fit whatever the panel is, and everything is two
   keypresses from here. */
const topRows = await rowsNow();
for (const label of ['Audio...', 'Looking...', 'Picture...', 'Controls...', 'Reset all settings']) {
  check(`SETTINGS offers ${label}`, topRows.includes(label), topRows.join(', '));
}

/* ---- a slider, on the audio page ---- */
await open('Audio...');
check('AUDIO opens', (await pageTitle()) === 'AUDIO', await pageTitle());
const vol0 = await page.evaluate(() => window.__game.settings.values.volMaster);
await pick('Master');
await press('ArrowLeft', 150);
await press('ArrowLeft', 150);
const vol1 = await page.evaluate(() => window.__game.settings.values.volMaster);
check('a volume slider moves', vol1 < vol0, `${vol0} -> ${vol1}`);
check('and reaches the audio engine',
  await page.evaluate(() => Math.abs(window.__game.audio.levels.master - window.__game.settings.values.volMaster) < 1e-6));
await back();
check('Back returns from AUDIO to SETTINGS', (await pageTitle()) === 'SETTINGS', await pageTitle());

/* ---- looking: invert Y, sensitivity, field of view ----
   These are together on one short page with a line of prose over them,
   because "the camera goes the wrong way when I move my finger" is a
   thing a player has to be able to find and fix, not hunt for among
   nineteen rows. */
await open('Looking...');
check('LOOKING opens', (await pageTitle()) === 'LOOKING', await pageTitle());
const lookRows = await rowsNow();
for (const label of ['Mouse sensitivity', 'Invert look (Y)', 'Field of view']) {
  check(`  it has ${label}`, lookRows.includes(label), lookRows.join(', '));
}

await pick('Invert look (Y)');
const inv0 = await page.evaluate(() => window.__game.input.invertY);
await press('Enter', 200);
const inv1 = await page.evaluate(() => window.__game.input.invertY);
check('invert Y toggles and reaches the input layer', inv0 !== inv1, `${inv0} -> ${inv1}`);
check('and is remembered in settings',
  await page.evaluate(() => window.__game.settings.values.invertY === window.__game.input.invertY));
await press('Enter', 200);           // put it back

await pick('Mouse sensitivity');
const sens0 = await page.evaluate(() => window.__game.input.sensitivity);
await press('ArrowRight', 150);
await press('ArrowRight', 150);
const sens1 = await page.evaluate(() => window.__game.input.sensitivity);
check('mouse sensitivity changes the input layer', sens1 > sens0, `${sens0} -> ${sens1}`);
await back();

/* ---- the picture page ---- */
await open('Picture...');
check('PICTURE opens', (await pageTitle()) === 'PICTURE', await pageTitle());
const picRows = await rowsNow();
for (const label of ['Resolution', 'Retro filter', 'Vertex snapping']) {
  check(`  it has ${label}`, picRows.includes(label), picRows.join(', '));
}

await pick('Resolution');
const w0 = await page.evaluate(() => window.__game.raster.w);
await press('ArrowRight', 250);
const w1 = await page.evaluate(() => window.__game.raster.w);
check('changing resolution resizes the framebuffer', w1 !== w0, `${w0} -> ${w1}`);

await back();
check('Back returns from PICTURE to SETTINGS', (await pageTitle()) === 'SETTINGS', await pageTitle());

/* ---- reset all settings ----
   A menu row is one keypress from being toggled by accident while
   hunting for another one, and "invert look" toggled by accident is a
   game that feels broken with no obvious cause. This is the way back.
   IT KEEPS THE BINDINGS: CONTROLS has its own two resets, and somebody
   who has rebound the keyboard did not ask for that to go because they
   wanted the volume back. */
await page.evaluate(() => {
  const g = window.__game;
  g.settings.set('invertY', true);
  g.input.bindKey('interact', 'KeyG');
  /* The way a rebind actually arrives: CONTROLS persists it. */
  g.persistSettings();
});
await open('Reset all settings', 300);
check('resetting asks first', /RESET ALL SETTINGS/.test((await st()).head), (await st()).head);
await page.evaluate(() => {
  const m = window.__game.menu;
  m.sel = m.rows().findIndex((r) => /^Yes/.test(r.label)); m.render();
});
await press('Enter', 300);
check('resetting puts invert look back to its default',
  (await page.evaluate(() => window.__game.settings.values.invertY)) === false,
  String(await page.evaluate(() => window.__game.settings.values.invertY)));
check('and leaves the key bindings alone',
  await page.evaluate(() => window.__game.input.keysFor('interact').includes('KeyG')),
  (await page.evaluate(() => window.__game.input.keysFor('interact'))).join(','));
await page.evaluate(() => { window.__game.input.resetKeyBinds(); });
check('and lands back on SETTINGS', (await pageTitle()) === 'SETTINGS', await pageTitle());

check('and the canvas with it',
  await page.evaluate(() => document.getElementById('screen').width === window.__game.raster.w));
await press('ArrowLeft', 250);

/* ---- persistence ---- */
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('countyline.settings');
  return raw ? JSON.parse(raw) : null;
});
check('settings are written to countyline.settings', !!stored && stored.v === 1, JSON.stringify(stored && stored.v));
check('and nothing was written under finalrental.*',
  await page.evaluate(() => Object.keys(localStorage).every((k) => !k.startsWith('finalrental'))),
  await page.evaluate(() => Object.keys(localStorage).join(',')));
check('every County Line key is inside its namespace',
  await page.evaluate(() => Object.keys(localStorage).every((k) => k.startsWith('countyline.'))),
  await page.evaluate(() => Object.keys(localStorage).join(',')));

/* ---- controls and rebinding ---- */
await open('Controls...', 350);
s = await st();
check('CONTROLS opens', /CONTROLS/.test(s.head), s.head);

const bindRow = await page.evaluate(() => window.__game.menu.rows().findIndex((r) => r.label === 'Use / pick up'));
await page.evaluate((i) => { window.__game.menu.sel = i; window.__game.menu.render(); }, bindRow);
await press('Enter', 250);
check('selecting an action starts a capture',
  await page.evaluate(() => window.__game.rebinding === 'interact'),
  await page.evaluate(() => String(window.__game.rebinding)));
await press('KeyF', 300);
const bound = await page.evaluate(() => window.__game.input.keysFor('interact'));
check('the next key is bound to it', bound.includes('KeyF'), bound.join(','));
check('and the capture ends', await page.evaluate(() => window.__game.rebinding === null));
check('the rebind reaches storage',
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('countyline.settings')).d;
    return (d.keyBinds.interact || []).includes('KeyF');
  }));

/* the prompt glyph follows the binding */
check('and prompts now name the new key',
  await page.evaluate(() => window.__cl.glyphs.glyphText('interact') === 'F'),
  await page.evaluate(() => window.__cl.glyphs.glyphText('interact')));

/* a key cannot do two jobs */
await page.evaluate(() => {
  const g = window.__game;
  const i = g.menu.rows().findIndex((r) => r.label === 'Walk forward');
  g.menu.sel = i; g.menu.render();
});
await press('Enter', 250);
await press('KeyF', 300);
check('binding a key to a second action takes it off the first',
  await page.evaluate(() => !window.__game.input.keysFor('interact').includes('KeyF')
    && window.__game.input.keysFor('forward').includes('KeyF')));

/* escape cancels rather than binding */
await page.evaluate(() => {
  const g = window.__game;
  const i = g.menu.rows().findIndex((r) => r.label === 'Walk back');
  g.menu.sel = i; g.menu.render();
});
const backBefore = await page.evaluate(() => window.__game.input.keysFor('back'));
await press('Enter', 250);
await press('Escape', 300);
const backAfter = await page.evaluate(() => window.__game.input.keysFor('back'));
check('ESC cancels a rebind instead of binding ESC',
  backAfter.join() === backBefore.join() && !backAfter.includes('Escape'), backAfter.join(','));

/* A rebind that would strand the player is refused, with a reason.

   Note the deliberate use of E rather than Enter below: two of uiConfirm's
   three keys have just been spent, so E is the only key that can still work
   a menu at all -- which is exactly the state the guard exists for. */
await page.evaluate(() => {
  const g = window.__game;
  g.input.resetKeyBinds();
  g.input.bindKey('forward', 'Enter');
  g.input.bindKey('back', 'Space');
  const i = g.menu.rows().findIndex((r) => r.label === 'Step left');
  g.menu.sel = i; g.menu.render();
  document.getElementById('toasts').innerHTML = '';
});
await press('KeyE', 250);            // E confirms: start the capture
check('a capture starts even with only one confirm key left',
  await page.evaluate(() => window.__game.rebinding === 'left'),
  await page.evaluate(() => String(window.__game.rebinding)));
await press('KeyE', 350);            // and try to spend that last key
const strandedLeft = await page.evaluate(() => window.__game.input.keysFor('left'));
const confirmLeft = await page.evaluate(() => window.__game.input.keysFor('uiConfirm'));
check('binding the last menu-select key away is refused',
  !strandedLeft.includes('KeyE') && confirmLeft.includes('KeyE'),
  `left ${strandedLeft.join(',')} / uiConfirm ${confirmLeft.join(',')}`);
check('and the capture ends rather than hanging',
  await page.evaluate(() => window.__game.rebinding === null));
check('and the player is told why',
  await page.evaluate(() => /only key left/i.test(document.getElementById('toasts').textContent)),
  await page.evaluate(() => document.getElementById('toasts').textContent.trim()));
check('so the menu still responds afterwards',
  await page.evaluate(() => window.__game.input.keysFor('uiConfirm').length > 0));
await page.evaluate(() => { window.__game.input.resetKeyBinds(); });

/* reset */
await page.evaluate(() => {
  const g = window.__game;
  const i = g.menu.rows().findIndex((r) => r.label === 'Reset keyboard to defaults');
  g.menu.sel = i; g.menu.render();
});
await press('Enter', 300);
check('resetting restores WASD',
  await page.evaluate(() => window.__game.input.keysFor('forward').join() === 'KeyW'),
  await page.evaluate(() => window.__game.input.keysFor('forward').join()));

/* ---- backing out ---- */
await page.evaluate(() => { window.__game.menu.sel = window.__game.menu.rows().length - 1; window.__game.menu.render(); });
await press('Enter', 300);
s = await st();
check('Back returns to SETTINGS', /SETTINGS/.test(s.head), s.head);
await press('Escape', 300);
s = await st();
check('and ESC from SETTINGS returns to the title', s.state === 'TITLE' && s.title, `${s.state}`);

/* ---- pause ---- */
await press('Enter', 500);            // NEW TEST GAME
check('a shift starts', (await st()).state === 'PLAY');
await press('Escape', 350);
s = await st();
check('ESC pauses', s.state === 'PAUSE' && /PAUSED/.test(s.head), `${s.state} / ${s.head}`);

const pauseRows = await rowsNow();
check('PAUSED offers Picture directly', pauseRows.includes('Picture'), pauseRows.join(', '));
await open('Settings', 350);
s = await st();
check('settings open from the pause menu', /SETTINGS/.test(s.head), s.head);

/* AND THE VIDEO OPTIONS ARE REACHABLE FROM IN HERE, which is the whole
   complaint: pausing and looking for them is how a player actually
   arrives, and PICTURE off the pause menu has to work exactly as it does
   off the title. */
await open('Picture...', 300);
check('PICTURE opens from the pause menu too', (await pageTitle()) === 'PICTURE', await pageTitle());
await pick('Resolution');
const pw0 = await page.evaluate(() => window.__game.raster.w);
await press('ArrowRight', 250);
check('and resolution still changes from there',
  (await page.evaluate(() => window.__game.raster.w)) !== pw0,
  `${pw0} -> ${await page.evaluate(() => window.__game.raster.w)}`);
await press('ArrowLeft', 250);
await back();
await press('Escape', 350);
s = await st();
check('and backing out returns to PAUSED, not the title',
  s.state === 'PAUSE' && /PAUSED/.test(s.head), `${s.state} / ${s.head}`);

/* in and out repeatedly */
for (let i = 0; i < 3; i++) {
  await open('Settings', 250);
  await press('Escape', 200);
}
s = await st();
check('and survives doing it repeatedly', s.state === 'PAUSE' && /PAUSED/.test(s.head), `${s.state} / ${s.head}`);

/* ---- Picture straight off the pause menu ---- */
await open('Picture', 300);
check('Picture on the pause menu opens the same page',
  (await pageTitle()) === 'PICTURE', await pageTitle());
await press('Escape', 300);
s = await st();
check('and ESC from it returns to PAUSED', /PAUSED/.test(s.head), s.head);

await page.evaluate(() => { window.__game.menu.sel = 0; window.__game.menu.render(); });
await press('Enter', 350);
check('Resume goes back to play', (await st()).state === 'PLAY');

/* ---- quit confirmation ---- */
await press('Escape', 300);
await page.evaluate(() => {
  const g = window.__game;
  g.menu.sel = g.menu.rows().findIndex((r) => r.label === 'Quit to title');
  g.menu.render();
});
await press('Enter', 300);
s = await st();
check('quitting asks first', /QUIT TO TITLE/.test(s.head), s.head);
await press('Enter', 300);           // "No, go back"
s = await st();
check('and saying no goes back to the pause menu', /PAUSED/.test(s.head), s.head);

/* ---- and every row of every page is reachable ----
   The bug was not that the rows were missing; it was that they were below
   the fold of a panel that clipped instead of scrolling. So: for each
   settings page, walk the highlight through every row and check the
   highlighted element is inside the scrolling list's visible box. */
for (const [name, fn] of [['SETTINGS', 'settingsScreen'], ['AUDIO', 'audioScreen'],
  ['LOOKING', 'lookScreen'], ['PICTURE', 'pictureScreen'], ['CONTROLS', 'controlsScreen']]) {
  await page.setViewportSize({ width: 800, height: 420 });     // a deliberately short window
  await page.evaluate(async (f) => {
    const m = await import('/src/ui/menus.js');
    window.__game.openTitleMenu(m[f](window.__game));
  }, fn);
  await page.waitForTimeout(200);
  const n = await page.evaluate(() => window.__game.menu.rows().length);
  let hidden = 0;
  for (let i = 0; i < n; i++) {
    await press('ArrowDown', 30);
    hidden += await page.evaluate(() => {
      const sel = document.querySelector('#panel li.opt.sel');
      if (!sel) return 0;
      const list = sel.parentElement;
      const top = sel.offsetTop, bot = top + sel.offsetHeight;
      return (top >= list.scrollTop - 2 && bot <= list.scrollTop + list.clientHeight + 2) ? 0 : 1;
    });
  }
  check(`every row of ${name} stays on screen in a short window`, hidden === 0,
    `${hidden} of ${n} off screen`);
}
await page.setViewportSize({ width: 800, height: 600 });

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
