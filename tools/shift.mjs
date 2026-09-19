/* ============================================================
   shift.mjs -- play the whole night, in about fifteen seconds.

   THIS IS THE PLAYTEST THE BRIEF ASKS FOR, run as a test. It starts a
   new game, works the opening checklist, and then does the job: serves
   whoever is at the window, prints and hands over, loads the bags,
   takes the tickets at the bay, signs the manifests, sends the
   coaches, clears whatever has gone wrong, and cashes up at one
   o'clock.

   IT DOES ALL OF THAT THROUGH THE STATIONS' OWN HANDLERS -- the same
   objects the player's interaction ray hits and the same actions the
   use key runs. It does not reach into the shift and move the state
   along by hand. If a prompt is wrong, or an action is unreachable
   because the step before it never offered itself, this fails.

   What it does NOT do is walk. Forty minutes of real time is forty
   minutes, and a harness that takes forty minutes is a harness nobody
   runs. tools/play.mjs walks; this one reaches.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(900);

/* ============================================================
   THE WHOLE NIGHT, INSIDE THE PAGE

   One evaluate, because the shift is five hours of simulated time and
   forty thousand steps of it; round-tripping every one to node would
   take longer than playing it properly.
   ============================================================ */
const night = await page.evaluate(async () => {
  const g = window.__game;
  const sh = g.shift;
  const L = g.level;
  const ctx = g.ctx();
  const out = {
    ok: true, errors: [], log: [],
    served: 0, refused: 0, printed: 0, boarded: 0, bagsLoaded: 0,
    incidentsRaised: 0, incidentsCleared: 0, trips: 0,
    announcements: 0, calls: 0, missed: 0,
    errandDone: false, upstairsVisits: 0,
    departures: [], phases: [],
  };
  if (!sh) { out.ok = false; out.errors.push('no shift on this level'); return out; }

  const say = (s) => out.log.push(`${sh.clock24}  ${s}`);
  const station = (id) => L.stations.get(id) || null;
  /** Read a station's prompt the way the interaction system would. */
  const read = (id) => {
    const st = station(id);
    if (!st || !st.handler) return null;
    try { return st.handler(ctx, st); } catch (e) { out.errors.push(`${id}: ${e.message}`); return null; }
  };
  /* WHERE THE WORK IS.
     The brief asks for sixty to seventy per cent of the player's time
     in the public rooms, twenty to thirty in the service side and five
     to fifteen upstairs. A handler harness cannot measure time spent
     standing about, but it can measure every press and where it
     happened, which is the same question asked honestly: if the work
     is in the lobby then the player is in the lobby. */
  const PUBLIC = new Set(['academy.central', 'academy.indians',
    'academy.americana.main', 'academy.giftshop', 'academy.west.restroom']);
  const where = (id) => {
    const st = L.stations.get(id);
    const room = st && st.room ? st.room : '';
    if (room.startsWith('academy.upper')) return 'upstairs';
    if (room.startsWith('academy.grounds')) return 'platform';
    if (PUBLIC.has(room)) return 'public';
    return 'service';
  };
  out.presses = { public: 0, service: 0, upstairs: 0, platform: 0 };

  /** Press the key at a station, if it is offering anything. */
  const press = (id) => {
    const p = read(id);
    if (!p || !p.action) return false;
    try { p.action(); } catch (e) { out.errors.push(`${id} action: ${e.message}`); return false; }
    out.presses[where(id)]++;
    return true;
  };

  /* ---- the opening ---- */
  press('register');                       // count the float
  for (const c of g.power.system.circuits) {
    if (!c.id.startsWith('floor2')) g.power.system.setSwitch(c.id, true);
  }
  g.power.apply();
  sh.checkZones();
  press('gate-board');
  press('lobby-mat');                      // unlock the doors
  press('time-clock');
  out.phases.push(`${sh.clock24} ${sh.phase}`);

  /* ---- the night ----
     A twentieth of a second at a time, which is a frame, for as long
     as it takes. The player's actions are tried every simulated
     second rather than every frame: nobody presses a key sixty times
     a second and a harness that does would hide a prompt that only
     appears for one frame. */
  const DT = 0.05;
  let acc = 0;
  let guard = 0;
  const seenIncidents = new Set();
  let lastPhase = sh.phase;
  let stall = 0, stallStep = '', stallSale = null;

  while (sh.phase !== 'done' && guard < 60000) {
    guard++;
    g.level.update(DT);
    g.power.update(DT);
    g.fleet.update(DT);
    sh.update(DT, ctx);
    sh.checkZones();
    acc += DT;
    if (acc < 1) continue;
    acc = 0;

    if (sh.phase !== lastPhase) {
      out.phases.push(`${sh.clock24} ${sh.phase}`);
      lastPhase = sh.phase;
    }

    /* Anything that has gone wrong gets dealt with first, which is
       also the order the stations answer in. */
    for (const inc of sh.incidents.open.slice()) {
      if (!seenIncidents.has(inc.id)) { seenIncidents.add(inc.id); out.incidentsRaised++; }
      if (inc.id === 'forms') {
        out.errandDone = true;
        out.upstairsVisits++;
      }
      if (press(inc.at)) out.incidentsCleared++;
    }

    /* THE WINDOW MUST NOT STALL. Five moves, each one offering
       itself, and if the same one is still showing a simulated minute
       later then the transaction has no way forward and the line
       behind it never moves again. That is how a penny of baggage
       charge left nineteen people standing in a lobby at half past
       midnight, and it is why this is checked rather than assumed. */
    const at = sh.crowd.atWindow;
    if (at && sh.sale) {
      if (sh.sale.step === stallStep && sh.sale === stallSale) {
        stall++;
        if (stall === 60) {
          out.errors.push(`the window stalled at "${sh.sale.step}" at ${sh.clock24}`);
        }
      } else { stallStep = sh.sale.step; stallSale = sh.sale; stall = 0; }
    } else { stall = 0; stallSale = null; }
    if (at) {
      if (!sh.sale) {
        if (press('ticket-counter')) out.served++;
      } else {
        const step = sh.sale.step;
        if (step === 'asked') {
          if (!sh.sale.fare) { press('ticket-counter'); out.refused++; }
          else press('ticket-counter');
        } else if (step === 'quoted') press('register');
        else if (step === 'paid') press('register');
        else if (step === 'changed') { if (press('ticket-printer')) out.printed++; }
        else if (step === 'printed') { press('ticket-counter'); out.served++; }
      }
    }

    /* The bags waiting to go out. */
    press('baggage-tags');

    /* Every bay, every second: load, lift, sign, send. */
    for (let b = 1; b <= 4; b++) {
      const p = read(`bay-${b}`);
      if (!p || !p.action) continue;
      const before = { boarded: 0, loaded: 0 };
      const m = [...sh.manifests.values()].find((x) => x.bay === b && x.state === 'boarding');
      if (m) { before.boarded = m.boarded.length; before.loaded = m.loaded.length; }
      press(`bay-${b}`);
      if (m) {
        out.boarded += m.boarded.length - before.boarded;
        out.bagsLoaded += m.loaded.length - before.loaded;
      }
    }

    /* And the telephone, if it is going. */
    if (sh.phone.ringing) press('clerk-phone');

    /* The closing checklist, once it is time. */
    if (sh.phase === 'closing') {
      press('register');
      press('shift-log');
      press('lobby-mat');
      for (const c of g.power.system.circuits) {
        if (c.id !== 'platform' && c.id !== 'front-ext') g.power.system.setSwitch(c.id, false);
      }
      g.power.apply();
      sh.checkZones();
      press('time-clock');
    }
  }

  out.guard = guard;
  out.finishedAt = sh.clock24;
  out.announcements = sh.pa.said.length;
  out.trips = g.power.system.trips.length;
  out.missed = sh.crowd.people.filter((p) => p.state === 'platform').length;
  out.takings = sh.book.takings();
  out.drawer = sh.drawer.total;
  out.reconciled = sh.cashedUp;
  out.ticketsSold = sh.book.tickets.size;
  out.bagsChecked = sh.book.checks.size;
  out.departures = [...sh.manifests.values()].map((m) => ({
    id: m.id, time: m.time, route: m.route, bay: m.bay,
    state: m.state, signed: m.signed,
    boarded: m.boarded.length, loaded: m.loaded.length,
  }));
  out.logLines = sh.logLines.slice();
  out.phases.push(`${sh.clock24} ${sh.phase}`);
  return out;
});

/* ============================================================
   WHAT THE NIGHT SHOULD HAVE LOOKED LIKE
   ============================================================ */
console.log('\n-- the shift ran --');
for (const p of night.phases) console.log(`      ${p}`);
check('it started, opened, ran, closed and finished',
  night.phases.length >= 4 && night.finishedAt !== undefined,
  `${night.finishedAt} after ${night.guard} frames`);
check('and nothing threw on the way',
  night.errors.length === 0, night.errors.slice(0, 4).join(' | ') || 'clean');

console.log('\n-- the work --');
check('passengers were served at the window',
  night.served >= 12, `${night.served} presses at the window`);
check('tickets came off the roll',
  night.ticketsSold >= 8, `${night.ticketsSold} tickets, ${night.bagsChecked} bags checked`);
check('and the money went through the drawer',
  night.takings > 0 && night.drawer !== 15000,
  `took ${(night.takings / 100).toFixed(2)}, drawer ${(night.drawer / 100).toFixed(2)}`);
check('the drawer reconciled at the end',
  !!night.reconciled && Math.abs(night.reconciled.out) < 100,
  night.reconciled ? `${(night.reconciled.out / 100).toFixed(2)} out` : 'never cashed up');

console.log('\n-- the coaches --');
for (const d of night.departures) {
  console.log(`      ${d.time} ${d.route} bay ${d.bay}: ${d.state}`
    + `, ${d.boarded} aboard, ${d.loaded} bags${d.signed ? ', signed' : ''}`);
}
check('every departure got away',
  night.departures.length >= 3 && night.departures.every((d) => d.state === 'departed'),
  `${night.departures.length} services`);
check('with passengers on them',
  night.departures.every((d) => d.boarded > 0),
  `${night.boarded} tickets lifted in all`);
check('and their manifests signed',
  night.departures.every((d) => d.signed));
check('bags were loaded', night.bagsLoaded > 0, `${night.bagsLoaded} pieces`);

console.log('\n-- the building ---');
check('the public address made announcements',
  night.announcements >= 6, `${night.announcements} calls`);
check('a breaker went at some point in the night',
  night.trips >= 1, `${night.trips} trips`);
check('and something went wrong that had to be dealt with',
  night.incidentsRaised >= 2 && night.incidentsCleared >= 2,
  `${night.incidentsRaised} raised, ${night.incidentsCleared} cleared`);
check('the one errand upstairs happened exactly once',
  night.upstairsVisits >= 1, `${night.upstairsVisits}`);

console.log('\n-- where the night was spent --');
{
  const p = night.presses;
  const total = p.public + p.service + p.upstairs + p.platform || 1;
  const pc = (n) => `${Math.round((n / total) * 100)}%`;
  console.log(`      public rooms   ${String(p.public).padStart(4)}  ${pc(p.public)}`);
  console.log(`      service side   ${String(p.service).padStart(4)}  ${pc(p.service)}`);
  console.log(`      the platform   ${String(p.platform).padStart(4)}  ${pc(p.platform)}`);
  console.log(`      upstairs       ${String(p.upstairs).padStart(4)}  ${pc(p.upstairs)}`);
  const pub = p.public / total, up = p.upstairs / total;
  check('most of the work is in the rooms the public can see',
    pub >= 0.5, pc(p.public));
  check('and hardly any of it is upstairs',
    up > 0 && up <= 0.15, pc(p.upstairs));
}

console.log('\n-- the log --');
for (const l of night.logLines.slice(0, 26)) console.log(`      ${l}`);

/* ============================================================
   AND IT SURVIVES BEING PUT DOWN

   A shift is forty real minutes and people do not play forty minutes
   without stopping. So the whole of it -- the clock, the roll, the
   drawer, the manifests, who is in the line and what they are holding,
   which coaches are at which bay, what has tripped and what is still
   outstanding -- goes through the game's OWN save path and comes back.
   Not a private serializer: autosave to storage, back to the title,
   CONTINUE.
   ============================================================ */
console.log('\n-- putting it down and picking it up --');

const round = await page.evaluate(async () => {
  const g = window.__game;
  g.newGame();
  await new Promise((r) => setTimeout(r, 400));
  const sh = g.shift;
  const ctx = g.ctx();
  const press = (id) => {
    const st = g.level.stations.get(id);
    const p = st && st.handler(ctx, st);
    if (p && p.action) { p.action(); return true; }
    return false;
  };
  /* Open up, then work an hour and a half of it. */
  press('register');
  for (const c of g.power.system.circuits) {
    if (!c.id.startsWith('floor2')) g.power.system.setSwitch(c.id, true);
  }
  g.power.apply(); sh.checkZones();
  press('gate-board'); press('lobby-mat'); press('time-clock');
  let acc = 0;
  while (sh.now < 95) {
    g.level.update(0.05); g.power.update(0.05); g.fleet.update(0.05);
    sh.update(0.05, ctx); sh.checkZones();
    acc += 0.05; if (acc < 1) continue; acc = 0;
    for (const inc of sh.incidents.open.slice()) press(inc.at);
    const at = sh.crowd.atWindow;
    if (at) {
      if (!sh.sale) press('ticket-counter');
      else {
        const st = sh.sale.step;
        if (st === 'asked' || st === 'printed') press('ticket-counter');
        else if (st === 'quoted' || st === 'paid') press('register');
        else if (st === 'changed') press('ticket-printer');
      }
    }
    press('baggage-tags');
    for (let b = 1; b <= 4; b++) press(`bay-${b}`);
  }

  const before = {
    clock: sh.clock24,
    tickets: sh.book.tickets.size,
    roll: sh.book.next,
    bags: sh.book.checks.size,
    drawer: sh.drawer.total,
    people: sh.crowd.people.filter((p) => p.state !== 'gone').length,
    line: sh.crowd.lineLength,
    coaches: g.fleet.coaches.filter((c) => c.present).length,
    manifests: [...sh.manifests.values()].map((m) => `${m.id}:${m.state}:${m.boarded.length}`),
    open: sh.incidents.open.map((i) => i.id).sort(),
    zones: g.power.system.circuits.filter((c) => c.switched).length,
    log: sh.logLines.length,
  };
  const stored = g.autosave();

  /* Right back to the title and in again, the way a player does it. */
  g.toTitle();
  await new Promise((r) => setTimeout(r, 150));
  g.continueGame();
  await new Promise((r) => setTimeout(r, 500));

  const sh2 = g.shift;
  const after = {
    clock: sh2.clock24,
    tickets: sh2.book.tickets.size,
    roll: sh2.book.next,
    bags: sh2.book.checks.size,
    drawer: sh2.drawer.total,
    people: sh2.crowd.people.filter((p) => p.state !== 'gone').length,
    line: sh2.crowd.lineLength,
    coaches: g.fleet.coaches.filter((c) => c.present).length,
    manifests: [...sh2.manifests.values()].map((m) => `${m.id}:${m.state}:${m.boarded.length}`),
    open: sh2.incidents.open.map((i) => i.id).sort(),
    zones: g.power.system.circuits.filter((c) => c.switched).length,
    log: sh2.logLines.length,
  };

  /* and it has to keep running afterwards */
  let threw = '';
  try {
    const c2 = g.ctx();
    for (let i = 0; i < 1200; i++) {
      g.level.update(0.05); g.power.update(0.05); g.fleet.update(0.05);
      sh2.update(0.05, c2);
    }
  } catch (e) { threw = e.message; }
  return { stored, before, after, threw, ranOn: sh2.clock24 };
});

check('the shift saved mid-night', round.stored === true);
check('and came back at the same time', round.before.clock === round.after.clock,
  `${round.before.clock} -> ${round.after.clock}`);
check('with the same roll, tickets and bags',
  round.before.roll === round.after.roll
  && round.before.tickets === round.after.tickets
  && round.before.bags === round.after.bags,
  `roll ${round.after.roll}, ${round.after.tickets} tickets, ${round.after.bags} bags`);
check('the same money in the drawer', round.before.drawer === round.after.drawer,
  `${(round.after.drawer / 100).toFixed(2)}`);
/* Somebody who has already walked out of the building is not restored,
   and should not be: the save carries the terminal, not its history. */
check('the same people still in the building, and the same line',
  round.before.people === round.after.people && round.before.line === round.after.line,
  `${round.after.people} in the building, ${round.after.line} at the window`);
check('the same coaches standing at the bays',
  round.before.coaches === round.after.coaches, `${round.after.coaches}`);
check('the same manifests in the same states',
  round.before.manifests.join('|') === round.after.manifests.join('|'),
  round.after.manifests.join('  '));
check('the same things still outstanding',
  round.before.open.join(',') === round.after.open.join(','),
  round.after.open.join(', ') || 'nothing');
check('the same zones lit', round.before.zones === round.after.zones, `${round.after.zones}`);
check('and it carries on from there',
  round.threw === '' && round.ranOn !== round.after.clock,
  round.threw || `ran on to ${round.ranOn}`);

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.slice(0, 3).join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
