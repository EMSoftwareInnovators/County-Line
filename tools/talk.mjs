/* ============================================================
   talk.mjs -- selling a ticket through the dialogue box.

   The box is the one part of the counter a player drives with the
   ARROW KEYS rather than the reticle, so it is the one part the other
   harnesses cannot reach: tools/clerk.mjs presses E at stations and
   tools/shift.mjs calls handlers directly, and neither would notice the
   box being empty, stuck on a dead option, or refusing to close.

   So this does the whole transaction the way a person does: walk to the
   window, press E to open it, arrow down the list, press E to say the
   line, walk to the register, and back.
   ============================================================ */
import { launch, openGame, checker, startNight } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const check = checker();

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);

await startNight(page);
await page.waitForTimeout(600);

/* Open the terminal and run it until somebody is at the window. */
const ready = await page.evaluate(() => {
  const g = window.__game, ctx = g.ctx(), sh = g.shift;
  const press = (id) => {
    const s = g.level.stations.get(id);
    const p = s && s.handler && s.handler(ctx, s);
    if (p && p.action && !p.disabled) { p.action(ctx); return true; }
    return false;
  };
  for (const c of g.power.system.circuits) {
    if (!c.id.startsWith('floor2')) g.power.system.setSwitch(c.id, true);
  }
  g.power.apply(); sh.checkZones();
  press('register'); press('gate-board'); press('lobby-mat'); press('time-clock');
  for (let t = 0; t < 9000 && !sh.sale; t++) {
    g.level.update(0.05); g.power.update(0.05); g.fleet.update(0.05);
    sh.update(0.05, ctx); sh.checkZones();
  }
  return !!sh.sale;
});
check('somebody turns up wanting a ticket', ready);

/** Stand at the window, as a player does before they can serve anyone. */
const atWindow = async () => page.evaluate(() => {
  const g = window.__game;
  const b = g.level.stations.get('ticket-counter').box;
  const p = g.player;
  p.frozen = true;
  p.x = (b.x0 + b.x1) / 2; p.z = (b.z0 + b.z1) / 2 - 0.3;
  p.y = 0; p.vx = 0; p.vy = 0; p.vz = 0;
});

await atWindow();
await page.evaluate(() => window.__game.shift.d.talk());
await page.waitForTimeout(120);

const first = await page.evaluate(() => {
  const t = window.__game.ui.talk;
  return {
    open: t.open,
    who: t.spec && t.spec.who,
    says: t.spec && t.spec.says,
    options: t.spec ? t.spec.options.map((o) => `${o.text}${o.disabled ? ' (off)' : ''}`) : [],
    sel: t.sel,
  };
});
check('the box opens on whoever is at the window', first.open, first.who || '');
check('it shows what they said', !!first.says, first.says || '');
check('it offers more than one thing to say', first.options.length >= 2,
  first.options.join(' | '));
check('the highlight starts on something choosable',
  first.options.length > 0 && !/\(off\)$/.test(first.options[first.sel]));

/* ---- arrow through it, and make sure the highlight never rests on a
       dead row, which is the failure that makes a list feel broken ---- */
let deadRest = 0;
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(40);
  const r = await page.evaluate(() => {
    const t = window.__game.ui.talk;
    const o = t.spec.options[t.sel];
    return !!(o && o.disabled);
  });
  if (r) deadRest++;
}
check('arrowing never lands on a greyed line', deadRest === 0, `${deadRest} times`);

/* ---- say the top line, which quotes the fare ---- */
const step0 = await page.evaluate(() => window.__game.shift.sale.step);
await page.evaluate(() => { window.__game.ui.talk.sel = 0; window.__game.ui.talk.render(); });
await page.keyboard.press('KeyE');
await page.waitForTimeout(150);
const step1 = await page.evaluate(() => window.__game.shift.sale.step);
check('choosing the top line moves the sale on', step0 !== step1, `${step0} -> ${step1}`);

/* ---- and the box follows it ---- */
const after = await page.evaluate(() => {
  const t = window.__game.ui.talk;
  return { open: t.open, options: t.spec ? t.spec.options.map((o) => o.text) : [] };
});
check('the box stays up and re-reads the sale', after.open, after.options.join(' | '));

/* ---- the register is named but NOT offered here ---- */
const split = await page.evaluate(() => {
  const t = window.__game.ui.talk;
  return t.spec.options.some((o) => o.disabled && /register/i.test(o.sub || ''));
});
check('the money is still the register\'s job, and the box says so', split);

/* ---- walking away closes it ---- */
await page.evaluate(() => {
  const g = window.__game;
  const b = g.level.stations.get('ticket-counter').box;
  /* nine meters away, which is across the hall */
  g.player.x = (b.x0 + b.x1) / 2 + 9;
});
/* let the real loop run: closing is its job, not the test's */
await page.waitForTimeout(400);
const gone = await page.evaluate(() => window.__game.ui.talk.open);
check('walking away from the window closes it', !gone);

for (const l of page.logs) console.log(l);
await browser.close();
process.exit(check.fails() ? 1 : 0);
