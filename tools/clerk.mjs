/* ============================================================
   clerk.mjs -- doing the job with the keyboard.

   tools/shift.mjs plays the whole night by calling the stations'
   handlers. That proves the WORK is coherent. It does not prove you
   can stand in front of a thing and press a key, which is the other
   half of a game, and which fails in ways a handler test cannot see:
   a prompt box three inches inside a counter, a station the reticle
   never reaches because a column is in front of it, a hold that needs
   longer than the key is down.

   So this one stands in the room. It finds a spot the collider says a
   body fits in, points the camera at the station, checks that the
   INTERACTION RAY actually picks that station and not the wall behind
   it, and presses the real use key through a real browser. Every step
   of the opening procedure, a whole transaction at the window, and a
   coach boarded and sent -- with the keyboard.
   ============================================================ */
import { launch, openGame, checker, startNight } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await startNight(page);
await page.waitForTimeout(800);

/* ============================================================
   STANDING IN FRONT OF SOMETHING

   The same question tools/terminal.mjs asks of every station -- is
   there room to stand -- but asked for real: the body is moved there,
   the camera is aimed at the middle of the station's box, and the
   game's own interaction ray decides what is being looked at.
   ============================================================ */
const face = (id) => page.evaluate((sid) => {
  const g = window.__game;
  const st = g.level.stations.get(sid);
  if (!st || !st.box) return { ok: false, why: 'no such station' };
  const b = st.box;
  const c = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
  const rx = (b.x1 - b.x0) / 2, rz = (b.z1 - b.z0) / 2;
  const p = g.player;
  const R = p.r, H = 1.4;
  const y = b.y0 > 3 ? 5.283 : (b.y0 < -0.3 ? -0.914 : 0);
  /* Walk a ring around it and stop at the first spot where a body
     fits AND the game's own ray picks this station -- which is what
     "you can use it" means, and is not the same as "you can stand
     near it". */
  let stood = null;
  for (let a = 0; a < 24; a++) {
    const th = (a / 24) * Math.PI * 2;
    for (const reach of [0.7, 1.0, 1.35]) {
      const x = c.x + Math.cos(th) * (rx + reach);
      const z = c.z + Math.sin(th) * (rz + reach);
      if (!g.level.collision.fits(x, y, z, R, H)) continue;
      /* AND IN THE RIGHT ROOM. A body "fits" three feet above the
         garden as happily as it fits on a floor, so a ring around a
         station on an outside wall finds a spot on the far side of
         that wall, and the harness teleports the player into the
         grounds and watches them fall. The station says which room it
         is in; stand in it. */
      const inRoom = g.level.roomAt(x, y + 0.1, z);
      if (st.room && (!inRoom || inRoom.id !== st.room)) continue;
      p.x = x; p.y = y; p.z = z;
      p.vx = 0; p.vz = 0; p.vy = 0; p.frozen = false;
      const dx = c.x - x, dz = c.z - z, dy = c.y - (y + p.eye);
      p.yaw = Math.atan2(dx, dz);
      p.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      const eye = { x, y: y + p.eye, z };
      const cp = Math.cos(p.pitch);
      const dir = [Math.sin(p.yaw) * cp, Math.sin(p.pitch), Math.cos(p.yaw) * cp];
      const t = g.level.interact.cast(eye, dir, g.ctx());
      stood = { x, z };
      if (t && t.id === `station:${sid}`) return { ok: true, x, z };
    }
  }
  return { ok: !!stood, x: stood ? stood.x : 0, z: stood ? stood.z : 0, why: 'ray goes elsewhere' };
}, id);

const looking = () => page.evaluate(() => {
  const it = window.__game.level.interact;
  return {
    id: it.target ? it.target.id : null,
    text: it.prompt ? it.prompt.text : null,
    sub: it.prompt ? it.prompt.sub : null,
    hold: it.prompt ? it.prompt.hold : 0,
    can: !!(it.prompt && it.prompt.action),
  };
});

/** Stand at a station and confirm the ray picks it. */
const at = async (id) => {
  const f = await face(id);
  if (!f.ok) return { id: null, text: f.why, can: false };
  await page.waitForTimeout(140);
  return looking();
};

/** Press the use key for as long as the prompt says to hold it. */
const use = async (holdFor) => {
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(holdFor ? holdFor * 1000 + 350 : 90);
  await page.keyboard.up('KeyE');
  await page.waitForTimeout(160);
};

/** Wind the shift clock on without the player doing anything. */
const wind = (minutes) => page.evaluate(async (m) => {
  const g = window.__game;
  const ctx = g.ctx();
  const steps = Math.round(m / (300 / (40 * 60)) / 0.05);
  for (let i = 0; i < steps; i++) {
    g.level.update(0.05); g.power.update(0.05); g.fleet.update(0.05);
    g.shift.update(0.05, ctx); g.shift.checkZones();
  }
  return g.shift.clock24;
}, minutes);

/* ============================================================
   THE OPENING, ONE STATION AT A TIME
   ============================================================ */
console.log('\n-- opening up, with the keyboard --');

let p = await at('register');
check('the cash drawer is where a body can stand and be seen',
  p.id === 'station:register' && /Count the float/.test(p.text || ''), `${p.id} — ${p.text}`);
await use(p.hold);
check('and counting the float in takes',
  (await page.evaluate(() => window.__game.shift.done.has('float'))) === true);

p = await at('switch.lobby');
check('the switch bank is reachable and reads its own label',
  p.id === 'station:switch.lobby' && /lobby|LOBBY/i.test(`${p.text} ${p.sub}`),
  `${p.text} — ${p.sub}`);

/* Every zone the terminal needs, thrown one at a time from the bank.

   ONLY THE ONES THAT ARE OFF. The night man leaves the lobby, the front
   and the way to this office on when he goes -- see Shift.start -- so
   flipping every switch on the bank would put two of them OUT and leave
   the terminal darker than it started. A clerk does not throw a switch
   that is already up, and neither does this. */
const zones = ['west-front', 'east-front', 'clerk', 'west-rear', 'east-rear', 'platform'];
const off = await page.evaluate((all) => all.filter((z) => {
  const c = window.__game.power.system.circuit(z);
  return c && !c.switched;
}), zones);
let thrown = 0;
for (const z of off) {
  const q = await at(`switch.${z}`);
  if (q.can) { await use(q.hold); thrown++; }
}
check('every zone that was off can be thrown from in front of it',
  thrown === off.length, `${thrown} of ${off.length} (${zones.length - off.length} were already on)`);
check('and the terminal is lit once they are',
  (await page.evaluate(() => window.__game.shift.done.has('lights'))) === true);

p = await at('gate-board');
check('the board in the waiting room takes tonight’s departures',
  p.can && /departures/i.test(p.text || ''), p.text);
await use(p.hold);

p = await at('lobby-mat');
check('and the front doors unlock from the mat inside them',
  p.can && /Unlock/.test(p.text || ''), p.text);
await use(p.hold);

p = await at('time-clock');
check('the time clock is on the break-room wall and punches in',
  p.can && /Punch in/.test(p.text || ''), p.text);
await use(p.hold);
check('and the player is left standing in the room it is in, on the floor',
  (await page.evaluate(() => {
    const g = window.__game, pl = g.player;
    const r = g.level.roomAt(pl.x, pl.y, pl.z);
    return !!r && r.id === 'academy.east.staff' && pl.grounded;
  })) === true);

const opened = await page.evaluate(() => ({
  phase: window.__game.shift.phase,
  done: [...window.__game.shift.done],
}));
check('five jobs, and the terminal is open',
  opened.phase === 'running' && opened.done.length === 5, opened.done.join(', '));

/* ============================================================
   A WHOLE TRANSACTION, PRESSED
   ============================================================ */
console.log('\n-- serving somebody, with the keyboard --');

/* Wait for the first person to reach the window. */
let waited = 0;
while (waited < 60 && !(await page.evaluate(() => !!window.__game.shift.crowd.atWindow))) {
  await wind(3);
  waited += 3;
}
const who = await page.evaluate(() => {
  const a = window.__game.shift.crowd.atWindow;
  return a ? { who: a.req.who, want: a.req.want, sale: !!window.__game.shift.sale } : null;
});
check('somebody comes in and reaches the window', !!who,
  who ? `${who.who} — ${who.want}` : 'nobody came');

/* Five moves at four places behind one counter. */
const moves = [];
for (let i = 0; i < 8; i++) {
  const step = await page.evaluate(() => (window.__game.shift.sale
    ? window.__game.shift.sale.step : 'none'));
  if (step === 'none') { moves.push('served (no ticket wanted)'); await at('ticket-counter'); const q = await looking(); if (q.can) await use(q.hold); break; }
  const where = step === 'quoted' || step === 'paid' ? 'register'
    : step === 'changed' ? 'ticket-printer' : 'ticket-counter';
  const q = await at(where);
  if (!q.can) { moves.push(`STUCK at ${step}: ${where} offers "${q.text}"`); break; }
  moves.push(`${step} -> ${where}: ${q.text}`);
  await use(q.hold);
  /* THE WINDOW OPENS A BOX, and the box is the interface -- one press
     raises it on whoever is stood there, a second says the line the
     highlight is on. That is the real keyboard flow and this harness
     exists to walk it, so it presses twice rather than reaching past
     the box into the sale. */
  const box = await page.evaluate(() => {
    const t = window.__game.ui.talk;
    return t.open ? t.spec.options[t.sel].text : null;
  });
  if (box) {
    moves.push(`       box: "${box}"`);
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(160);
  }
  if (step === 'printed') break;
}
for (const m of moves) console.log(`      ${m}`);
const sold = await page.evaluate(() => ({
  tickets: window.__game.shift.book.tickets.size,
  drawer: window.__game.shift.drawer.total,
}));
check('the whole transaction goes through with the use key',
  sold.tickets >= 1 && sold.drawer !== 15000,
  `${sold.tickets} ticket(s), drawer ${(sold.drawer / 100).toFixed(2)}`);

/* ============================================================
   AND OUT TO A COACH
   ============================================================ */
console.log('\n-- the platform, with the keyboard --');

/* Run the night on until something is boarding. */
let boarding = null;
for (let i = 0; i < 40 && !boarding; i++) {
  await wind(4);
  boarding = await page.evaluate(() => {
    const m = [...window.__game.shift.manifests.values()].find((x) => x.state === 'boarding');
    return m ? { id: m.id, bay: m.bay, time: m.time } : null;
  });
}
check('a coach is called and stands at its bay', !!boarding,
  boarding ? `${boarding.time} at bay ${boarding.bay}` : 'nothing boarded');

if (boarding) {
  /* The bags go out to staging from the tag desk first: the bay loads
     what is standing beside it, not what is behind the counter. */
  for (let i = 0; i < 4; i++) {
    const q = await at('baggage-tags');
    if (!q.can) break;
    await use(q.hold);
  }
  const seen = [];
  for (let i = 0; i < 16; i++) {
    const q = await at(`bay-${boarding.bay}`);
    if (!q.can) {
      /* Nobody has walked out yet. Give them a minute of the night. */
      await wind(2);
      const r2 = await at(`bay-${boarding.bay}`);
      if (!r2.can) { seen.push(`bay offers "${r2.text}"`); break; }
      seen.push(r2.text);
      await use(r2.hold);
      continue;
    }
    seen.push(q.text);
    await use(q.hold);
  }
  for (const s of seen.slice(0, 6)) console.log(`      ${s}`);
  const away = await page.evaluate((id) => {
    const m = window.__game.shift.manifests.get(id);
    return { state: m.state, signed: m.signed, boarded: m.boarded.length, loaded: m.loaded.length };
  }, boarding.id);
  check('bags load, tickets lift and the manifest signs at the bay',
    away.signed && (away.boarded > 0 || away.loaded > 0),
    `${away.boarded} aboard, ${away.loaded} bags, ${away.state}`);
}

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.slice(0, 3).join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
