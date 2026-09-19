/* ============================================================
   tour.mjs -- does the walkthrough actually work.

   Three things can go wrong with a guided tour and none of them show
   up in a unit test: the guide cannot REACH a stop, the tour cannot
   ADVANCE past a stop, and the tour never ENDS. All three leave the
   player standing in a room waiting for somebody who is stuck behind a
   filing cabinet, so this drives the whole thing end to end with the
   player teleported along behind, doing the five opening jobs at the
   real stations when the tour asks for them.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const check = checker();

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT, { walkthrough: true });

await page.evaluate(() => {
  window.__game.settings.values.walkthrough = true;
  window.__game.newGame();
});
await page.waitForTimeout(600);

const started = await page.evaluate(() => {
  const g = window.__game;
  return !!(g.tutorial && g.tutorial.running);
});
check('the supervisor turns up for a new shift', started);

/* Every stop names a place. If one of them resolves to nothing, the
   supervisor walks to the middle of the world instead. */
const unresolved = await page.evaluate(() => window.__game.tutorial
  .report(window.__game.level).filter((s) => !s.ok).map((s) => s.id));
check('every stop resolves to a real place in the level', unresolved.length === 0,
  unresolved.join(', '));

/* ---- run it ----
   The player follows by teleport, which is what a player does slowly.
   The jobs get done at the real stations through their real handlers. */
const log = await page.evaluate(() => new Promise((done) => {
  const g = window.__game;
  const ctx = g.ctx();
  const stops = g.tutorial.report(g.level);
  const seen = [];
  let last = -1, stuck = 0, t = 0;
  const press = (id) => {
    const st = g.level.stations.get(id);
    const p = st && st.handler && st.handler(ctx, st);
    if (p && p.action && !p.disabled) { p.action(ctx); return true; }
    return false;
  };
  const step = () => {
    for (let k = 0; k < 8; k++) {
      const dt = 0.05; t += dt;
      g.level.update(dt); g.power.update(dt);
      g.shift.update(dt, ctx); g.shift.checkZones();
      g.tutorial.update(dt, ctx);
      const tu = g.tutorial;
      if (tu.at !== last) { seen.push(tu.at); last = tu.at; stuck = 0; }
      /* follow */
      if (tu.npc && !tu.npc.hidden) {
        g.player.x = tu.npc.x; g.player.z = tu.npc.z; g.player.y = tu.npc.y;
      }
      /* do whatever it is waiting for */
      if (tu.state === 'task') {
        const job = stops[tu.at] && stops[tu.at].task;
        if (job === 'lights') {
          for (const c of g.power.system.circuits) {
            if (!c.id.startsWith('floor2')) g.power.system.setSwitch(c.id, true);
          }
          g.power.apply(); g.shift.checkZones();
        } else if (job === 'float') press('register');
        else if (job === 'board') press('gate-board');
        else if (job === 'doors') press('lobby-mat');
        else if (job === 'clock-in') press('time-clock');
      }
      stuck += dt;
      if (!tu.running) {
        return done({ seen, t, ended: true, phase: g.shift.phase, missed: tu.missed });
      }
      if (stuck > 300) {
        return done({
          seen, t, ended: false, at: tu.at, state: tu.state,
          npc: tu.npc ? [+tu.npc.x.toFixed(1), +tu.npc.z.toFixed(1)] : null,
          room: tu.npc ? (g.level.roomAt(tu.npc.x, tu.npc.y + 0.1, tu.npc.z) || {}).id : null,
          spot: tu.spot ? [+tu.spot.x.toFixed(1), +tu.spot.z.toFixed(1)] : null,
          spotRoom: tu.spot ? (g.level.roomAt(tu.spot.x, tu.spot.y + 0.1, tu.spot.z) || {}).id : null,
          hops: tu.npc && tu.npc.path ? tu.npc.path.length : 0,
          idx: tu.npc ? tu.npc.pathIndex : -1,
        });
      }
      if (t > 1800) return done({ seen, t, ended: false, at: tu.at, state: tu.state, over: true });
    }
    setTimeout(step, 0);
  };
  step();
}));

check('the tour reaches the end and the supervisor leaves', log.ended,
  log.ended ? `${log.t.toFixed(0)}s of terminal walking`
    : `stuck at stop ${log.at} (${log.state}) npc ${JSON.stringify(log.npc)} in ${log.room};`
      + ` wanted ${JSON.stringify(log.spot)} in ${log.spotRoom}; waypoint ${log.idx}/${log.hops}`);
check('it visited every stop', log.seen.length >= 15, `${log.seen.length} stops`);
check('the supervisor got to every one of them on foot',
  !log.missed || log.missed.length === 0,
  (log.missed || []).map((m) => `${m.id} short by ${m.by.toFixed(1)}m`
    + ` (in ${m.room}, wanted ${m.wantRoom}, ${m.hops} hops)`).join('\n        '));
check('all five opening jobs got done on the way', log.phase === 'running',
  `shift phase: ${log.phase}`);

for (const l of page.logs) console.log(l);
await browser.close();
process.exit(check.fails() ? 1 : 0);
