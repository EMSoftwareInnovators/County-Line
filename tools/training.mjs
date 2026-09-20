/* ============================================================
   training.mjs -- does the lesson teach, and does it hand over.

   The training room is a level, a step machine and a real sale wired
   together, and the failure it is most likely to have is the one a
   tutorial must never have: a step that cannot be completed, leaving
   the player in a small room with an instruction and no way to obey
   it. So this walks the whole thing the way a player does -- at the
   stations, through the dialogue box -- and checks that every step
   advances and that the last one loads Richmond Central.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const check = checker();

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);

const opened = await page.evaluate(() => ({
  level: window.__game.level.id,
  training: !!(window.__game.training && window.__game.training.running),
  shift: window.__game.campaign.shift ? window.__game.campaign.shift.id : null,
}));
check('a new game starts in the training room', opened.level === 'training', opened.level);
check('and the lesson is running', opened.training);
check('which is the campaign\'s first shift', opened.shift === 'training', String(opened.shift));

/* ---- walk it ----
   The player is put at each step's station and the station is used, the
   same as pressing E in front of it. The dialogue box is driven for the
   steps that are a conversation. */
const run = await page.evaluate(() => new Promise((done) => {
  const g = window.__game;
  const t = g.training;
  const ctx = g.ctx();
  const seen = [], stuck = {};
  const standAt = (id) => {
    const st = g.level.stations.get(id);
    if (!st || !st.box) return;
    const b = st.box;
    g.player.x = (b.x0 + b.x1) / 2;
    g.player.z = (b.z0 + b.z1) / 2 - 1.0;
    g.player.y = 0;
  };
  const press = (id) => {
    const st = g.level.stations.get(id);
    const p = st && st.handler && st.handler(ctx, st);
    if (p && p.action && !p.disabled) { p.action(ctx); return true; }
    return false;
  };
  /* which station each step is done at */
  const WHERE = {
    walk: 'ticket-counter', lights: 'room-lights', card: 'fare-card',
    serve: 'ticket-counter', take: 'register', change: 'register',
    print: 'ticket-printer', hand: 'ticket-counter', weigh: 'baggage-scale',
    tag: 'baggage-tags', board: 'gate-board', out: 'time-clock',
  };
  let last = null, spins = 0, total = 0;
  const tick = () => {
    for (let k = 0; k < 20; k++) {
      total++;
      const step = t.step;
      if (!step || !t.running) return done({ seen, finished: true, level: g.level.id, total });
      if (step.id !== last) { seen.push(step.id); last = step.id; spins = 0; }
      spins++;
      if (spins > 400) return done({ seen, finished: false, stuckAt: step.id, total });
      standAt(WHERE[step.id] || 'ticket-counter');
      g.level.update(0.05);
      if (step.id === 'serve' || step.id === 'hand') {
        /* the window is a conversation: open the box, say the top line */
        press('ticket-counter');
        if (g.ui.talk.open) { g.ui.talk.confirm(); }
        else t.serve();
      } else {
        press(WHERE[step.id]);
      }
      t.update(0.05, ctx);
      if (total > 20000) return done({ seen, finished: false, stuckAt: step.id, total });
    }
    setTimeout(tick, 0);
  };
  tick();
}));

console.log(`      steps: ${run.seen.join(' -> ')}`);
check('every step can be completed', run.finished,
  run.finished ? `${run.seen.length} steps` : `stuck on "${run.stuckAt}"`);
check('the lesson covers the whole job', run.seen.length >= 12, `${run.seen.length} steps`);

await page.waitForTimeout(600);
const after = await page.evaluate(() => ({
  level: window.__game.level.id,
  shift: window.__game.campaign.shift ? window.__game.campaign.shift.id : null,
  sold: window.__game.training ? null : 'gone',
}));
check('punching out loads Richmond Central', after.level === 'academy', after.level);
check('and the night shift is the one that started', after.shift === 'test-shift',
  String(after.shift));

for (const l of page.logs) console.log(l);
await browser.close();
process.exit(check.fails() ? 1 : 0);
