/* ============================================================
   terminal.mjs -- is Richmond Central still a building you can walk?

   The fit-out is furniture standing on the floor of a 1856 building
   that was measured, drawn and route-tested before any of it existed.
   Furniture is exactly the kind of thing that blocks a doorway without
   anybody noticing, because it looks right from the other side of the
   room. The architecture harness (academy.mjs) walks eleven named
   routes; this one asks the narrower question the furniture can break:

     CAN A BODY GET THROUGH EVERY OPENING IN THE BUILDING, and stand
     three feet clear on both sides of it?

   It is checked with the game's own collider and the player's own
   radius, at the level of the floor the opening sits in, so a pass here
   means a pass for the player.

   It then asks the same of every station the job happens at: a counter
   you cannot reach is a counter that is not in the game.

   The second half is the electrical retrofit: thirteen ways, three
   cabinets, a switch bank, and the one trip the east wing's load
   arithmetic produces when the conveyor runs on top of the coffee
   maker. Nothing in it is supernatural and nothing in it is scripted.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const F = (m) => +(m / 0.3048).toFixed(1);

const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);

/* ============================================================
   EVERY OPENING, BOTH SIDES

   Doors are taken off their hinges for this: whether a leaf swings is
   academy.mjs's business. What is asked here is whether the hole in the
   wall has floor on both sides of it that a body fits on.
   ============================================================ */
console.log('\n-- every doorway and opening has clearance on both sides --');
const blocked = await page.evaluate(() => {
  const L = window.__game.level;
  const col = L.collision;
  const R = window.__game.player.r;
  const H = 1.4;                     // chest height: what furniture blocks
  const OUT = [0.6, 0.95, 1.3];      // meters out from the wall face
  const bad = [];

  /* The same question is asked twice: of the whole building, and of the
     building with the fit-out taken out again. A doorway that is blocked
     both times is the architecture's problem and academy.mjs's business;
     one that is blocked only with the furniture in is this file's. */
  const bare = col.all.filter((s) => !(s.tag || '').startsWith('fitout.'));

  /* A doorway's own y is its threshold, which is the floor it opens on. */
  const holes = [];
  for (const d of L.doors) {
    holes.push({ id: d.id, x: d.x, z: d.z, yaw: d.yaw, w: d.width, y: d.y });
  }
  for (const o of L.openings) {
    holes.push({ id: `opening@${Math.round(o.x * 100) / 100},${Math.round(o.z * 100) / 100}`,
      x: o.x, z: o.z, yaw: o.yaw, w: o.width, y: o.y });
  }

  for (const h of holes) {
    /* The normal to the wall the hole is in. yaw 0 faces north. */
    const nx = Math.sin(h.yaw), nz = Math.cos(h.yaw);
    for (const side of [-1, 1]) {
      for (const out of OUT) {
        const x = h.x + nx * out * side;
        const z = h.z + nz * out * side;
        if (!col.fits(x, h.y + 0.05, z, R, H)) {
          const architecture = !col.fits(x, h.y + 0.05, z, R, H, bare);
          bad.push({ id: h.id, side, out, x, z, y: h.y, architecture });
          break;
        }
      }
    }
  }
  return bad;
});
const furniture = blocked.filter((g) => !g.architecture);
for (const g of blocked) {
  console.log(`      ${g.architecture ? 'wall ' : 'PROP '} ${g.id}  `
    + `${g.side > 0 ? 'far' : 'near'} side blocked ${F(g.out)} ft out, `
    + `at ${F(g.x)},${F(g.z)} ft`);
}
check('no furniture is standing in a doorway', furniture.length === 0,
  furniture.length ? `${furniture.length} of ${blocked.length} blocked by props`
    : `${blocked.length} tight approaches, none of them the fit-out's`);

/* ============================================================
   EVERY STATION IS REACHABLE

   A station is a box in the air over a counter or a machine. What is
   asked is whether there is standing room within arm's reach of it --
   anywhere in a ring around the box, not a particular side, because
   which side you serve a counter from is the level's business.
   ============================================================ */
console.log('\n-- every station has somewhere to stand --');
const unreachable = await page.evaluate(() => {
  const L = window.__game.level;
  const col = L.collision;
  const R = window.__game.player.r;
  const H = 1.4;
  const out = [];
  for (const [id, st] of L.stations) {
    const bx = st.box || (st.interactable && st.interactable.box);
    if (!bx) continue;
    /* The floor the station stands on: the bottom of its box, which is
       where a counter top or a machine base is. */
    const y = bx.y0 - 0.2;
    let ok = false;
    for (let a = 0; a < 16 && !ok; a++) {
      const th = (a / 16) * Math.PI * 2;
      const cx = (bx.x0 + bx.x1) / 2, cz = (bx.z0 + bx.z1) / 2;
      const rx = (bx.x1 - bx.x0) / 2, rz = (bx.z1 - bx.z0) / 2;
      for (const reach of [0.5, 0.8]) {
        const x = cx + Math.cos(th) * (rx + reach);
        const z = cz + Math.sin(th) * (rz + reach);
        if (col.fits(x, y, z, R, H)) { ok = true; break; }
      }
    }
    if (!ok) out.push({ id, y });
  }
  return out;
});
for (const s of unreachable) console.log(`      ${s.id}  nowhere to stand`);
check('every station can be walked up to', unreachable.length === 0,
  `${(await page.evaluate(() => window.__game.level.stations.size))} stations`);

/* ============================================================
   THE PANEL

   Thirteen ways in three cabinets, a switch bank, and one trip that
   arithmetic causes. Everything here is checked against the live
   system in the running game, because the thing worth knowing is not
   whether the class works but whether the building is wired to it.
   ============================================================ */
console.log('\n-- the electrical retrofit --');

const wiring = await page.evaluate(() => {
  const g = window.__game;
  const L = g.level;
  const P = g.power;
  const rooms = L.rooms.map((r) => r.id);
  const unwired = rooms.filter((id) => !P.system.roomCircuit.has(id));
  return {
    circuits: P.system.circuits.length,
    panels: P.system.panels,
    devices: P.system.devices.length,
    unwired,
    /* Every device names a way that exists -- Electrical.add throws
       otherwise, so reaching here at all is the test. */
    perPanel: P.system.panels.map((p) => P.system.panelWays(p).length),
    labels: P.system.circuits.every((c) => !!c.label && !!c.panel && c.breakerNo > 0),
    ids: new Set(P.system.circuits.map((c) => c.id)).size,
  };
});
check('the building has one panel schedule, not one breaker per bulb',
  wiring.circuits >= 10 && wiring.circuits <= 16, `${wiring.circuits} ways`);
check('in three cabinets, all on one wall of the clerk\'s office',
  wiring.panels.length === 3, wiring.panels.join(' / ') + ' — ' + wiring.perPanel.join(', '));
check('every way has a stable id, a label and a breaker number',
  wiring.labels && wiring.ids === wiring.circuits);
check('every room in the building is on a circuit',
  wiring.unwired.length === 0, wiring.unwired.join(', ') || 'none unwired');
check('and there is real equipment plugged into them',
  wiring.devices >= 10, `${wiring.devices} devices`);

/* ---- the switch bank dims what it says it dims ---- */
const dimming = await page.evaluate(() => {
  const g = window.__game;
  const P = g.power;
  const before = { ...g.level.chunkLit };
  P.system.setSwitch('east-rear', false);
  P.apply();
  const after = { ...g.level.chunkLit };
  const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
  const room = 'academy.east.animal';
  const out = {
    changed: changed.length,
    room: [before[room], after[room]],
    /* an elevation is lit by several ways and comes down part of the
       way, not all of it */
    shell: [before['ext.east.north'], after['ext.east.north']],
    /* and a room on another circuit does not move at all */
    other: [before['academy.central'], after['academy.central']],
  };
  P.system.setSwitch('east-rear', true);
  P.apply();
  return out;
});
check('switching a zone off dims the rooms on it',
  dimming.room[0] === 1 && dimming.room[1] === 0, `${dimming.room[0]} -> ${dimming.room[1]}`);
check('an elevation lit by four ways comes down part of the way, not all',
  dimming.shell[1] < dimming.shell[0] && dimming.shell[1] > 0,
  `${dimming.shell[0].toFixed(2)} -> ${dimming.shell[1].toFixed(2)}`);
check('and nothing on another way moves',
  dimming.other[0] === dimming.other[1], `${dimming.other[1]}`);

/* ---- a breaker cuts the machines; a switch does not ---- */
const split = await page.evaluate(() => {
  const g = window.__game;
  const P = g.power;
  P.system.setSwitch('lobby', false);
  P.system.update(0.016);
  const switchedOff = P.working('ticket-printer');
  P.system.setBreaker('lobby', false);
  P.system.update(0.016);
  const breakerOff = P.working('ticket-printer');
  P.system.setBreaker('lobby', true);
  P.system.setSwitch('lobby', true);
  P.system.update(0.016);
  return { switchedOff, breakerOff, back: P.working('ticket-printer') };
});
check('a light switch leaves the ticket printer running',
  split.switchedOff === true);
check('the breaker takes it with it',
  split.breakerOff === false);
check('and putting the breaker back brings it back', split.back === true);

/* ---- the east wing trips, and only because of arithmetic ---- */
const trip = await page.evaluate(async () => {
  const g = window.__game;
  const P = g.power;
  const c = P.system.circuit('east-rear');
  const idle = P.system.loadOn('east-rear');
  /* Run the conveyor with a pot of coffee on. Twelve and a half amps
     and seven and a half on a twenty-amp way. */
  P.run('conveyor', true);
  P.run('coffee', true);
  /* Wind the clock forward in game steps rather than real seconds. */
  let loaded = 0;
  for (let i = 0; i < 40 && !c.tripped; i++) {
    P.update(0.5);
    loaded = Math.max(loaded, P.system.loadOn('east-rear'));
  }
  const tripped = c.tripped;
  const roomDark = g.level.chunkLit['academy.east.animal'];
  const machinesDead = !P.working('baggage-scale') && !P.working('conveyor');
  /* A tripped way cannot be switched back on, only reset. */
  P.system.setBreaker('east-rear', true);
  const stillTripped = c.tripped;
  const why = P.system.trips.length ? P.system.trips[P.system.trips.length - 1].why : null;
  P.run('conveyor', false);
  P.run('coffee', false);
  P.system.reset('east-rear');
  P.update(0.016);
  P.apply();
  return {
    idle, loaded, tripped, stillTripped, why, roomDark, machinesDead,
    recovered: c.breaker === 'on' && g.level.chunkLit['academy.east.animal'] === 1,
  };
});
check('the east wing is inside its rating with the machines stopped',
  trip.idle < 20, `${trip.idle.toFixed(1)} of 20 A`);
check('running the conveyor and the coffee maker together puts it over',
  trip.loaded > 20, `${trip.loaded.toFixed(1)} of 20 A`);
check('and holding it there opens the breaker', trip.tripped === true, `why: ${trip.why}`);
check('which takes the lights and the machines with it',
  trip.roomDark === 0 && trip.machinesDead);
check('a tripped way cannot be switched on, only reset', trip.stillTripped === true);
check('and resetting it puts the wing back', trip.recovered === true);

/* ---- the stations in the clerk's office are wired to it ---- */
const stations = await page.evaluate(() => {
  const g = window.__game;
  const L = g.level;
  const ctx = g.ctx();
  const sw = [...L.stations.keys()].filter((k) => k.startsWith('switch.'));
  const panels = [...L.stations.keys()].filter((k) => k.startsWith('panel-'));
  const bound = [...sw, ...panels].every((k) => typeof L.stations.get(k).handler === 'function');
  /* the switch station actually throws its own circuit */
  const st = L.stations.get('switch.garden');
  const before = g.power.system.circuit('garden').switched;
  st.handler(ctx, st).action();
  const after = g.power.system.circuit('garden').switched;
  st.handler(ctx, st).action();
  /* and a panel offers a reset only when something has tripped */
  const pa = L.stations.get('panel-b');
  const quiet = pa.handler(ctx, pa);
  g.power.system.trip('east-rear', 'test');
  const loud = pa.handler(ctx, pa);
  if (loud.action) loud.action();
  const cleared = !g.power.system.circuit('east-rear').tripped;
  g.power.apply();
  return {
    switches: sw.length, panels: panels.length, bound,
    flipped: before !== after,
    quiet: !quiet.action, offered: !!loud.action && /Reset breaker/.test(loud.text),
    cleared,
  };
});
check('there is a labelled switch for every way, and a station per panel',
  stations.switches === wiring.circuits && stations.panels === 3,
  `${stations.switches} switches, ${stations.panels} panels`);
check('all of them are wired to the system', stations.bound === true);
check('a switch on the bank throws its own circuit', stations.flipped === true);
check('a panel offers nothing when nothing has tripped', stations.quiet === true);
check('and offers the reset when something has', stations.offered === true);
check('which clears it', stations.cleared === true);

/* ---- it survives a save ---- */
const persisted = await page.evaluate(() => {
  const g = window.__game;
  const P = g.power;
  P.system.setSwitch('floor2-east', true);
  P.system.setBreaker('garden', false);
  P.run('conveyor', true);
  const blob = JSON.parse(JSON.stringify(P.save()));
  /* wreck it, then put it back */
  P.openForBusiness();
  P.system.setBreaker('garden', true);
  P.run('conveyor', false);
  P.restore(blob);
  const ok = P.system.circuit('floor2-east').switched === true
    && P.system.circuit('garden').breaker === 'off'
    && P.isRunning('conveyor') === true;
  P.system.setBreaker('garden', true);
  P.run('conveyor', false);
  P.openForBusiness();
  P.apply();
  return ok;
});
check('the state of the panel goes into the save and comes back', persisted === true);

/* ---- and the diagnostics are developer-only ---- */
const diag = await page.evaluate(() => {
  const g = window.__game;
  const was = g.debug.level;
  g.debug.level = 4;
  const html = g.debug.html(g);
  g.debug.level = was;
  return {
    rows: (html.match(/<tr>/g) || []).length,
    mentionsLoad: /\/20 A/.test(html) || /\/15 A/.test(html),
    gated: g.devTools === true || g.devTools === false,
  };
});
check('the panel read-out lists every way with its load',
  diag.rows >= wiring.circuits && diag.mentionsLoad, `${diag.rows} rows`);
check('and it is behind the developer flag, not on the HUD', diag.gated === true);

/* ============================================================
   THE YARD AND THE COACHES

   Four berths, one mesh, and a bus that has to get from the gate to
   berth two without driving through the building -- and that has to be
   solid while it stands there, because the alternative is a player who
   walks through forty feet of coach to reach a door.
   ============================================================ */
console.log('\n-- the coach yard --');

const yard = await page.evaluate(() => {
  const g = window.__game;
  const f = g.fleet;
  if (!f || !f.enabled) return null;
  const y = f.yard;
  const gaps = [];
  for (let i = 1; i < y.bays.length; i++) gaps.push(y.bays[i].z - y.bays[i - 1].z);
  return {
    bays: y.bays.length,
    /* One level: nothing in this yard is a step. */
    step: Math.abs(y.platform - y.grade),
    gaps: gaps.map((m) => +(m / 0.3048).toFixed(1)),
    ids: y.bays.map((b) => b.id),
    stations: [...g.level.stations.keys()].filter((k) => k.startsWith('bay-')).length,
  };
});
check('the yard has berths, and each one has a number and a station',
  yard && yard.bays >= 3 && yard.bays <= 4 && yard.stations === yard.bays,
  yard ? `${yard.bays} bays, ${yard.stations} stations, ids ${yard.ids.join(',')}` : 'no yard');
check('the berths are far enough apart to walk between two coaches',
  yard.gaps.every((d) => d >= 16), `${yard.gaps.join(', ')} ft centers`);
check('and the whole yard is one level, so nobody steps off anything',
  yard.step < 0.1, `${(yard.step / 0.3048 * 12).toFixed(1)} in`);

const drive = await page.evaluate(() => {
  const g = window.__game;
  const f = g.fleet;
  const F = (m) => +(m / 0.3048).toFixed(1);
  const R = g.player.r;
  const c = f.add({ id: 'harness-1', route: 'ATL', sign: 'ATLANTA', bay: 2 });
  const path = [];
  c.arrive();
  let t = 0;
  while (c.state !== 'at-bay' && t < 60) {
    g.level.update(0.05); f.update(0.05); t += 0.05;
    path.push([c.x, c.z]);
  }
  g.level.update(0.05);
  const bay = f.bay(2);
  const door = c.doorPoint();
  /* Did it drive through the building on the way in? The west wall of
     the Academy is at X_W_OUT; nothing in the path may be east of it. */
  const wall = g.level.marks.plan ? -56.37 * 0.3048 : -17.18;
  const out = {
    arrived: c.state === 'at-bay',
    seconds: +t.toFixed(1),
    nose: F(c.x + 31 * 0.3048),
    z: F(c.z),
    yaw: +(c.yaw / Math.PI).toFixed(2),
    throughTheBuilding: path.some(([x]) => x > wall),
    inside: !g.level.collision.fits(c.x, c.y + 0.1, c.z, R, 1.4),
    atDoor: g.level.collision.fits(door.x, c.y + 0.1, door.z, R, 1.4),
    inLine: g.level.collision.fits(bay.boardX, g.level.marks.yard.platform + 0.3, bay.boardZ, R, 1.4),
    solids: g.level.collision.all.filter((s) => s.tag === 'coach').length,
    atBay: !!f.atBay(2),
    otherBay: !!f.atBay(3),
  };
  /* and away again */
  c.depart();
  t = 0;
  while (c.state !== 'gone' && t < 90) { g.level.update(0.05); f.update(0.05); t += 0.05; }
  g.level.update(0.05);
  out.left = c.state === 'gone';
  out.swept = f.sweep();
  g.level.update(0.05);
  out.solidsAfter = g.level.collision.all.filter((s) => s.tag === 'coach').length;
  out.drawsAfter = g.level.dynamic.filter((d) => d.coach).length;
  return out;
});
check('a coach drives in from the gate and berths itself',
  drive.arrived, `${drive.seconds} s, nose at ${drive.nose} ft, z ${drive.z}, yaw ${drive.yaw}pi`);
check('without driving through the building', drive.throughTheBuilding === false);
check('a berthed coach is solid', drive.inside === true);
check('there is standing room at its door', drive.atDoor === true);
check('and on the concrete where its line forms', drive.inLine === true);
check('the yard knows what is at which berth',
  drive.atBay === true && drive.otherBay === false);
check('it leaves the way it came', drive.left === true);
check('and sweeping takes its collider and its draw calls with it',
  drive.solidsAfter === 0 && drive.drawsAfter === 0 && drive.swept === 1);

const fleetSave = await page.evaluate(() => {
  const g = window.__game;
  const f = g.fleet;
  const a = f.add({ id: 's1', route: 'SAV', sign: 'SAVANNAH', bay: 1 });
  const b = f.add({ id: 's2', route: 'MCN', sign: 'MACON', bay: 3 });
  a.arrive(); b.arrive();
  for (let t = 0; t < 40; t += 0.05) { g.level.update(0.05); f.update(0.05); }
  const blob = JSON.parse(JSON.stringify(f.save()));
  f.restore(blob);
  g.level.update(0.05);
  const out = {
    rows: blob.length,
    back: f.coaches.length,
    signs: f.coaches.map((c) => c.sign).sort().join(','),
    bays: f.coaches.map((c) => c.bay.id).sort().join(','),
    solids: g.level.collision.all.filter((s) => s.tag === 'coach').length,
    /* one mesh for all of them, however many are standing */
    meshes: new Set(g.level.dynamic.filter((d) => d.coach).map((d) => d.mesh)).size,
  };
  for (const c of f.coaches.slice()) { c.state = 'gone'; }
  f.sweep();
  g.level.update(0.05);
  return out;
});
check('two coaches at two berths go into the save and come back',
  fleetSave.rows === 2 && fleetSave.back === 2,
  `${fleetSave.signs} at bays ${fleetSave.bays}`);
check('and they are solid again when they do', fleetSave.solids === 2);
check('however many there are, there is one coach mesh and one roll each',
  fleetSave.meshes === 3, `${fleetSave.meshes} distinct meshes for 2 coaches`);

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
