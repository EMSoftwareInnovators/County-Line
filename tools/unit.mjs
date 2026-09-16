/* ============================================================
   unit.mjs -- the parts that do not need a browser.

   Collision, navigation, the save format, settings, the campaign state
   machine, the binding tables and the door component are all plain
   JavaScript with no DOM in them, which is deliberate: it means the
   fiddly, regression-prone logic can be tested in a few milliseconds
   without launching anything.

   The handful of globals the storage layer expects are shimmed below.
   ============================================================ */

/* ---- the smallest localStorage that behaves like one ---- */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => Array.from(store.keys())[i],
  get length() { return store.size; },
};
globalThis.addEventListener = () => {};
globalThis.document = { addEventListener: () => {}, documentElement: {} };
/* Node 22 defines `navigator` as a getter-only global, so it is replaced
   rather than assigned. The input layer only reads three fields off it. */
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'MacIntel', userAgent: 'node', getGamepads: () => [] },
  configurable: true, writable: true,
});
globalThis.window = globalThis;
globalThis.devicePixelRatio = 1;

const { CollisionWorld, rampHeight, rayBox } = await import('../src/engine/collision.js');
const { NavGraph } = await import('../src/game/nav.js');
const { SCALE, ft, ftin, inch, toFtIn, eyeAt, standAt } = await import('../src/engine/units.js');
const storage = await import('../src/engine/storage.js');
const { Settings, defaultSettings } = await import('../src/game/settings.js');
const { SaveGame, Profile } = await import('../src/game/save.js');
const { Campaign, CampaignDef, TEST_CAMPAIGN, PHASE } = await import('../src/game/campaign.js');
const input = await import('../src/engine/input.js');
const { Door } = await import('../src/game/door.js');
const { InteractionSystem, Interactable } = await import('../src/game/interaction.js');
const { MeshBuilder } = await import('../src/engine/mesh.js');

let fails = 0;
let group = '';
const section = (s) => { group = s; console.log(`\n-- ${s} --`); };
const check = (label, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

/* ============================================================ */
section('units');
check('a foot is 0.3048 m', near(ft(1), 0.3048));
check('ftin(6, 8) is a door height', near(ftin(6, 8), 2.0320, 1e-4), String(ftin(6, 8)));
check('an inch is 25.4 mm', near(inch(1), 0.0254));
check('meters come back as feet and inches', toFtIn(2.032) === "6' 8\"", toFtIn(2.032));
check('the eye is below the crown', SCALE.playerEye < SCALE.playerHeight);
check('a crouched player is shorter than a standing one',
  standAt(1) < standAt(0) && eyeAt(1) < eyeAt(0));
check('the step height is below a stair riser -- so stairs are ramps, not steps',
  SCALE.stepHeight < SCALE.stairRise, `${SCALE.stepHeight} < ${SCALE.stairRise}`);
check('the player fits through a door',
  SCALE.playerRadius * 2 < SCALE.doorWidth && SCALE.playerHeight < SCALE.doorHeight);

/* ============================================================ */
section('collision');
{
  const c = new CollisionWorld();
  c.addFloor({ x0: -10, x1: 10, z0: -10, z1: 10, y: 0, material: 'stone' });
  c.addSolid({ x0: 2, x1: 3, y0: 0, y1: 3, z0: -5, z1: 5, tag: 'wall' });
  c.refresh();

  const body = { x: 0, y: 0, z: 0, r: 0.28, height: 1.78, step: 0.18, grounded: true, vy: 0 };
  c.move(body, 5, 0, 0.016);
  check('a wall stops a body', body.x < 1.8, `x ${body.x.toFixed(3)}`);
  check('and the body is not inside it', body.x < 2 - body.r + 1e-3, `x ${body.x.toFixed(3)}`);

  // sliding along a wall rather than sticking to it
  body.x = 1.5; body.z = 0;
  const before = body.z;
  c.move(body, 1.0, 1.0, 0.016);
  check('a body slides along a wall instead of stopping dead', body.z > before + 0.5,
    `z ${before} -> ${body.z.toFixed(3)}`);

  // an inside corner must not trap
  const c2 = new CollisionWorld();
  c2.addFloor({ x0: -10, x1: 10, z0: -10, z1: 10, y: 0 });
  c2.addSolid({ x0: 1, x1: 5, y0: 0, y1: 3, z0: -5, z1: 5 });
  c2.addSolid({ x0: -5, x1: 5, y0: 0, y1: 3, z0: 1, z1: 5 });
  c2.refresh();
  const b2 = { x: 0.5, y: 0, z: 0.5, r: 0.28, height: 1.78, step: 0.18, grounded: true, vy: 0 };
  for (let i = 0; i < 60; i++) c2.move(b2, 0.03, 0.03, 0.016);
  check('an inside corner does not swallow a body',
    b2.x < 1 && b2.z < 1 && isFinite(b2.x), `${b2.x.toFixed(3)}, ${b2.z.toFixed(3)}`);

  // a thin wall at speed
  const c3 = new CollisionWorld();
  c3.addFloor({ x0: -20, x1: 20, z0: -20, z1: 20, y: 0 });
  c3.addSolid({ x0: -5, x1: 5, y0: 0, y1: 3, z0: 4.95, z1: 5.05 });
  c3.refresh();
  const b3 = { x: 0, y: 0, z: 0, r: 0.28, height: 1.78, step: 0.18, grounded: true, vy: 0 };
  c3.move(b3, 0, 20, 0.1);
  check('a body cannot tunnel through a 100 mm wall at 200 m/s', b3.z < 5, `z ${b3.z.toFixed(3)}`);

  // stepping up and not up
  const c4 = new CollisionWorld();
  c4.addFloor({ x0: -10, x1: 10, z0: -10, z1: 10, y: 0 });
  c4.addSolid({ x0: 1, x1: 4, y0: 0, y1: 0.15, z0: -4, z1: 4, tag: 'curb' });
  c4.addSolid({ x0: 6, x1: 9, y0: 0, y1: 0.60, z0: -4, z1: 4, tag: 'ledge' });
  c4.refresh();
  const b4 = { x: 0, y: 0, z: 0, r: 0.28, height: 1.78, step: 0.18, grounded: true, vy: 0 };
  for (let i = 0; i < 80; i++) c4.move(b4, 0.04, 0, 0.016);
  check('a 150 mm curb is stepped onto', near(b4.y, 0.15, 1e-6) && b4.x > 2, `y ${b4.y} x ${b4.x.toFixed(2)}`);
  for (let i = 0; i < 160; i++) c4.move(b4, 0.04, 0, 0.016);
  check('a 600 mm ledge is not', b4.y < 0.2 && b4.x < 6, `y ${b4.y} x ${b4.x.toFixed(2)}`);

  /* Ramps -- the staircase case, laid out as a real flight is: a floor
     at the bottom, a ramp, and a landing at the top that the ramp meets
     exactly. Walking off the end of a ramp into thin air is a fall, and
     testing it without a landing tests the fall, not the stair. */
  const c5 = new CollisionWorld();
  c5.addFloor({ x0: -10, x1: 10, z0: -10, z1: 0.001, y: 0, tag: 'bottom' });
  c5.addRamp({ x0: -1, x1: 1, z0: 0, z1: 5, axis: 'z', yLow: 0, yHigh: 3, tag: 'stair' });
  c5.addFloor({ x0: -10, x1: 10, z0: 4.999, z1: 10, y: 3, tag: 'landing' });
  c5.refresh();
  check('a ramp interpolates', near(rampHeight(c5.ramps[0], 0, 2.5), 1.5), String(rampHeight(c5.ramps[0], 0, 2.5)));
  const b5 = { x: 0, y: 0, z: -0.5, r: 0.28, height: 1.78, step: 0.18, grounded: true, vy: 0 };
  let airborne = 0;
  for (let i = 0; i < 300; i++) {
    c5.move(b5, 0, 0.02, 0.016);
    if (!b5.grounded) airborne++;
  }
  check('walking up a flight reaches the landing', near(b5.y, 3, 1e-6) && b5.z > 5,
    `y ${b5.y.toFixed(3)} z ${b5.z.toFixed(2)}`);
  check('and never leaves the ground', airborne === 0, `${airborne} frames airborne`);
  for (let i = 0; i < 300; i++) {
    c5.move(b5, 0, -0.02, 0.016);
    if (!b5.grounded) airborne++;
  }
  check('walking back down returns to the bottom', near(b5.y, 0, 1e-6), `y ${b5.y}`);
  check('and never leaves the ground either', airborne === 0, `${airborne} frames airborne`);

  // stopping halfway up leaves the body halfway up
  b5.y = 0; b5.z = -0.5;
  for (let i = 0; i < 120; i++) c5.move(b5, 0, 0.02, 0.016);
  const halted = b5.y;
  for (let i = 0; i < 60; i++) c5.move(b5, 0, 0, 0.016);
  check('stopping on a flight does not slide back down', near(b5.y, halted, 1e-6),
    `y ${halted.toFixed(3)} -> ${b5.y.toFixed(3)}`);

  // gravity
  const c6 = new CollisionWorld();
  c6.addFloor({ x0: -10, x1: 10, z0: -10, z1: 10, y: 0 });
  c6.refresh();
  const b6 = { x: 0, y: 5, z: 0, r: 0.28, height: 1.78, step: 0.18, grounded: false, vy: 0 };
  let ticks = 0;
  while (!b6.grounded && ticks < 600) { c6.move(b6, 0, 0, 0.016); ticks++; }
  check('a body in the air falls to the floor', b6.grounded && near(b6.y, 0, 1e-6), `${ticks} ticks, y ${b6.y}`);

  // headroom
  const c7 = new CollisionWorld();
  c7.addFloor({ x0: -10, x1: 10, z0: -10, z1: 10, y: 0 });
  c7.addCeiling({ x0: -10, x1: 10, z0: -10, z1: 10, y: 2.4 });
  c7.refresh();
  check('a ceiling is found overhead', near(c7.ceilingAt(0, 0, 0), 2.4), String(c7.ceilingAt(0, 0, 0)));
  check('and nothing is found where there is no ceiling', c7.ceilingAt(50, 0, 0) === Infinity);

  check('a ray hits a box in front of it',
    near(rayBox(0, 1, 0, 0, 0, 1, { x0: -1, x1: 1, y0: 0, y1: 2, z0: 4, z1: 5 }), 4));
  check('and misses one behind it',
    rayBox(0, 1, 0, 0, 0, -1, { x0: -1, x1: 1, y0: 0, y1: 2, z0: 4, z1: 5 }) < 0);
}

/* ============================================================ */
section('navigation');
{
  const g = new NavGraph(
    [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 4, z: 10 }],
    [[0, 1], [1, 2], [2, 3]]
  );
  const blocked = () => false;
  const p = g.path({ x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: 10 }, blocked);
  check('a route is found across the graph', p && p.length >= 4, p && String(p.length));
  check('and it climbs', p && p.some((n) => n.y === 4));
  const direct = g.path({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, () => true);
  check('a clear line skips the graph entirely', direct.length === 1, String(direct.length));
  const disjoint = new NavGraph([{ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 9 }], []);
  check('an unreachable destination is reported, not faked',
    disjoint.path({ x: 0, y: 0, z: 0 }, { x: 9, y: 0, z: 9 }, blocked) === null);
}

/* ============================================================ */
section('storage');
{
  storage._reset();
  store.clear();
  check('the namespace is countyline', storage.NAMESPACE === 'countyline');
  check('every declared key lives inside it',
    Object.values(storage.KEYS).every((k) => k.startsWith('countyline.')),
    Object.values(storage.KEYS).join(','));

  let threw = false;
  try { new storage.Record({ key: 'finalrental.save', version: 1 }); } catch { threw = true; }
  check('a record outside the namespace is refused outright', threw);

  const rec = new storage.Record({
    key: 'countyline.save', version: 2,
    defaults: () => ({ n: 0 }),
    migrate: (d, from) => (from === 1 ? { n: d.old } : null),
    validate: (d) => typeof d.n === 'number',
  });
  check('a missing record comes back as defaults', rec.load().fresh === true);
  rec.save({ n: 7 });
  check('a saved record comes back', rec.load().data.n === 7);

  localStorage.setItem('countyline.save', JSON.stringify({ v: 1, t: 1, d: { old: 3 } }));
  const m = rec.load();
  check('an older record is migrated', m.migrated === true && m.data.n === 3, JSON.stringify(m.data));

  localStorage.setItem('countyline.save', '{{{');
  const bad = rec.load();
  check('a broken record is refused', bad.fresh === true && !!bad.rejected, String(bad.rejected));
  check('and kept aside', localStorage.getItem('countyline.save.corrupt') === '{{{');

  localStorage.setItem('countyline.save', JSON.stringify({ v: 9, t: 1, d: {} }));
  check('a record from the future is refused', !!rec.load().rejected);

  const merged = storage.mergeTyped(
    { a: 1, b: 'x', c: { d: true }, e: [1] },
    { a: 2, b: 5, c: { d: false, gone: 1 }, f: 'unknown' }
  );
  check('merging keeps declared keys of the declared type', merged.a === 2 && merged.b === 'x');
  check('and drops keys the defaults never declared', merged.f === undefined && merged.c.gone === undefined);
  check('and recurses one level', merged.c.d === false);
}

/* ============================================================ */
section('settings');
{
  store.clear();
  storage._reset();
  const s = new Settings();
  s.load();
  check('defaults load', s.get('volMaster') === defaultSettings().volMaster);
  s.set('volMaster', 0.25);
  s.set('invertY', true);
  check('saving works', s.save() === true);
  const s2 = new Settings();
  s2.load();
  check('and comes back', s2.get('volMaster') === 0.25 && s2.get('invertY') === true);

  // a garbled value falls back rather than reaching the audio graph
  const raw = JSON.parse(localStorage.getItem('countyline.settings'));
  raw.d.volMaster = 'loud';
  raw.d.retro = 'nonsense';
  localStorage.setItem('countyline.settings', JSON.stringify(raw));
  const s3 = new Settings();
  s3.load();
  check('a wrongly-typed value falls back to the default', s3.get('volMaster') === 0.8, String(s3.get('volMaster')));
  check('an unknown enum falls back too', s3.get('retro') === 'full', s3.get('retro'));

  const fake = {
    input: { keyBinds: {}, padBinds: {} }, audio: { setLevel() {}, levels: {} },
    raster: {}, post: { setVignette() {} },
  };
  s3.apply(fake);
  check('applying sets a real sensitivity', fake.input.sensitivity > 0, String(fake.input.sensitivity));
  check('and a pad sensitivity', fake.input.padSensitivity > 0);
}

/* ============================================================ */
section('bindings');
{
  const kb = input.defaultKeyBinds();
  check('WASD is the default', kb.forward[0] === 'KeyW' && kb.left[0] === 'KeyA');
  check('every action has a default binding',
    Object.keys(input.ACTIONS).every((a) => (kb[a] || []).length > 0),
    Object.keys(input.ACTIONS).filter((a) => !(kb[a] || []).length).join(','));
  check('no Final Rental action survived',
    !('notes' in input.ACTIONS) && !('drop' in input.ACTIONS) && !('bolt' in input.ACTIONS),
    Object.keys(input.ACTIONS).join(','));

  const pb = input.defaultPadBinds();
  check('the bottom face button interacts', (pb[0] || []).includes('interact'));
  check('and the right one goes back, not pause', (pb[1] || []).includes('uiBack') && !(pb[1] || []).includes('pause'));

  const dirty = input.sanitizeKeyBinds({ forward: ['KeyI'], bogus: ['KeyQ'], back: 'not an array' });
  check('a stored binding for an action that no longer exists is dropped', dirty.bogus === undefined);
  check('a good one is kept', dirty.forward[0] === 'KeyI');
  check('and a malformed one falls back', dirty.back.join() === 'KeyS');

  const known = input.knownLayout('Xbox Wireless Controller', 'MacIntel');
  check('the macOS Xbox layout is recognized', !!known && known.id === 'xbox-macos');
  check('and is not applied off a Mac', input.knownLayout('Xbox Wireless Controller', 'Win32') === null);
  check('an Xbox pad asks for Xbox art', input.schemeFor('Xbox Wireless Controller') === 'xbox');
  check('a DualSense asks for PlayStation art', input.schemeFor('DualSense Wireless Controller') === 'playstation');
  check('and a bare "Wireless Controller" is taken as Sony',
    input.schemeFor('Wireless Controller') === 'playstation');
}

/* ============================================================ */
section('doors');
{
  const d = new Door({ id: 'd', x: 5, z: 0, yaw: 0, width: 0.9, height: 2.03 });
  check('a door starts shut', !d.open && d.amount === 0);
  check('and blocks while it is shut', !d.clear);
  d.makeSolid();
  const out = [];
  d.contributeSolids(out);
  check('a shut door contributes a collider', out.length === 1);
  check('and the collider spans the opening',
    near(out[0].x1 - out[0].x0, 0.9, 1e-6), String(out[0].x1 - out[0].x0));

  check('using it opens it', d.use() === 'opened' && d.open);
  for (let i = 0; i < 200; i++) d.update(0.016);
  check('it finishes opening', near(d.amount, 1, 1e-6), String(d.amount));
  check('and is then out of the way', d.clear);
  out.length = 0;
  d.contributeSolids(out);
  check('an open door contributes nothing to block with', out.length === 0);
  check('using it again shuts it', d.use() === 'closed');

  const locked = new Door({ id: 'l', x: 0, z: 0, yaw: 0, locked: true, key: 'brass' });
  check('a locked door will not open', locked.use({}) === 'locked' && !locked.open);
  check('and says so', locked.lockedText.length > 0);
  check('the right key unlocks it',
    locked.use({ hasKey: (k) => k === 'brass' }) === 'unlocked' && locked.open);

  const dbl = new Door({ id: 'dd', x: 0, z: 0, yaw: 0, width: 1.83, leaves: 2 });
  const mb = new MeshBuilder();
  mb.light = () => 1;
  const fake = { tex: { px: new Uint32Array(64), w: 8, h: 8, wMask: 7, hMask: 7, shift: 3 }, density: 64 };
  dbl.buildLeafMesh(fake, null);
  dbl.buildLeafMesh(fake, null);
  check('a double door has two leaves', dbl.matrices().length === 2);
  check('and they hang at opposite jambs',
    Math.abs(dbl.matrices()[0][3] - dbl.matrices()[1][3]) > 1.5,
    `${dbl.matrices()[0][3]} vs ${dbl.matrices()[1][3]}`);

  const yawed = new Door({ id: 'y', x: 0, z: 0, yaw: Math.PI / 2, width: 0.9, height: 2 });
  const s = yawed.makeSolid();
  check('a door in a wall running along Z is thin in X',
    (s.x1 - s.x0) < (s.z1 - s.z0), `${(s.x1 - s.x0).toFixed(2)} vs ${(s.z1 - s.z0).toFixed(2)}`);
}

/* ============================================================ */
section('interaction');
{
  const sys = new InteractionSystem(null);
  let used = 0;
  sys.add(new Interactable({
    id: 'thing',
    box: { x0: -1, x1: 1, y0: 0, y1: 2, z0: 2, z1: 3 },
    describe: () => ({ text: 'Use it', action: () => { used++; }, hold: 0 }),
  }));
  const eye = { x: 0, y: 1, z: 0 };
  let r = sys.update(eye, [0, 0, 1], {}, 0.016, false);
  check('looking at something finds it', r.target && r.target.id === 'thing');
  check('and asks it what to say', r.prompt.text === 'Use it');
  sys.activate({}, true);
  check('a tap runs its action', used === 1, String(used));

  r = sys.update(eye, [0, 0, -1], {}, 0.016, false);
  check('looking away finds nothing', r.target === null);
  sys.activate({}, true);
  check('and there is nothing to run', used === 1);

  // out of reach
  sys.clear();
  sys.add(new Interactable({
    id: 'far',
    box: { x0: -1, x1: 1, y0: 0, y1: 2, z0: 20, z1: 21 },
    describe: () => ({ text: 'Far', action: () => { used++; }, hold: 0 }),
  }));
  r = sys.update(eye, [0, 0, 1], {}, 0.016, false);
  check('something out of reach is not offered', r.target === null);

  // holding
  sys.clear();
  let held = 0;
  sys.add(new Interactable({
    id: 'hold',
    box: { x0: -1, x1: 1, y0: 0, y1: 2, z0: 1, z1: 2 },
    describe: () => ({ text: 'Hold it', action: () => { held++; }, hold: 0.5 }),
  }));
  sys.update(eye, [0, 0, 1], {}, 0.2, true);
  check('a held action does not fire early', !sys.activate({}, true) && held === 0);
  check('and reports its progress', sys.holdFraction() > 0.3 && sys.holdFraction() < 0.5,
    String(sys.holdFraction()));
  sys.update(eye, [0, 0, 1], {}, 0.4, true);
  check('and fires once the hold completes', sys.activate({}, false) && held === 1, String(held));

  // priority
  sys.clear();
  sys.add(new Interactable({
    id: 'wall', priority: 0,
    box: { x0: -2, x1: 2, y0: 0, y1: 3, z0: 1, z1: 3 },
    describe: () => ({ text: 'wall' }),
  }));
  sys.add(new Interactable({
    id: 'switch', priority: 2,
    box: { x0: -0.2, x1: 0.2, y0: 0.9, y1: 1.2, z0: 1, z1: 1.1 },
    describe: () => ({ text: 'switch' }),
  }));
  r = sys.update(eye, [0, 0, 1], {}, 0.016, false);
  check('a switch set into a wall wins over the wall', r.target.id === 'switch', r.target.id);
}

/* ============================================================ */
section('campaign');
{
  const c = new Campaign(TEST_CAMPAIGN);
  check('a campaign starts idle', c.phase === PHASE.IDLE);
  check('the test campaign has one shift on the testbed',
    TEST_CAMPAIGN.length === 1 && TEST_CAMPAIGN.shift(0).level === 'testbed');
  check('and no story in it',
    !JSON.stringify(TEST_CAMPAIGN).match(/bus|academy|ghost|passenger|ticket/i));

  c.start(0, {});
  check('starting makes it active', c.phase === PHASE.ACTIVE);
  check('and it has objectives to track', c.remainingObjectives().length === 2,
    String(c.remainingObjectives().length));
  c.setFlag('seen-thing');
  check('flags stick', c.hasFlag('seen-thing'));
  const all = c.completeObjective('walk-upstairs');
  check('completing one is recorded', c.objectiveDone('walk-upstairs') && !all);
  check('an optional objective does not hold the shift open',
    c.completeObjective('go-outside') === true);

  c.update(10);
  check('the clock advances', c.elapsed >= 10, String(c.elapsed));
  check('and reads as a wall clock', /^\d{1,2}:\d\d (AM|PM)$/.test(c.clockString()), c.clockString());

  const res = c.end('objectives', {});
  check('ending produces a result', res && res.reason === 'objectives');
  check('and the campaign is complete', c.phase === PHASE.COMPLETE);

  const json = c.toJSON();
  const c2 = new Campaign(TEST_CAMPAIGN);
  check('it round-trips through JSON', c2.fromJSON(json) && c2.hasFlag('seen-thing') && c2.phase === PHASE.COMPLETE);
  check('and refuses nonsense without throwing', c2.fromJSON(null) === false);
  const c3 = new Campaign(TEST_CAMPAIGN);
  c3.fromJSON({ index: 999, phase: 'NOPE', elapsed: 'lots', flags: 'no' });
  check('a garbled state is clamped rather than trusted',
    c3.index === 0 && c3.phase === PHASE.IDLE && c3.elapsed === 0 && typeof c3.flags === 'object');

  const timed = new Campaign(new CampaignDef({
    id: 't', name: 't',
    shifts: [{ id: 's', name: 's', level: 'testbed', durationSeconds: 5, clock: { startHour: 9, endHour: 12 } }],
  }));
  timed.start(0, {});
  timed.update(6);
  check('a timed shift ends itself', timed.phase === PHASE.COMPLETE && timed.result.reason === 'time');
}

/* ============================================================ */
section('save');
{
  store.clear();
  storage._reset();
  const s = new SaveGame();
  check('nothing is saved to begin with', SaveGame.exists() === false);
  const camp = new Campaign(TEST_CAMPAIGN);
  camp.start(0, {});
  camp.setFlag('a', 1);
  const player = { x: 1.5, y: 2.5, z: 3.5, yaw: 0.5, pitch: -0.25 };
  const level = { id: 'testbed', doors: [{ id: 'front-door', open: true, locked: false }] };
  check('writing works', s.autosave(camp, player, level, 42) === true);
  check('and there is now a save', SaveGame.exists() === true);

  const s2 = new SaveGame();
  const r = s2.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) });
  check('reading works', r.ok === true, String(r.reason));
  const camp2 = new Campaign(TEST_CAMPAIGN);
  const player2 = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const level2 = { id: 'testbed', doors: [{ id: 'front-door', open: false, locked: true, target: 0, amount: 0 }] };
  s2.restore(camp2, player2, level2);
  check('the player is put back', player2.x === 1.5 && player2.z === 3.5);
  check('the flags are put back', camp2.flag('a') === 1);
  check('the doors are put back', level2.doors[0].locked === false && level2.doors[0].target === 1);

  // an unknown campaign is refused
  const blob = JSON.parse(localStorage.getItem('countyline.save'));
  blob.d.campaign = 'the-real-one';
  localStorage.setItem('countyline.save', JSON.stringify(blob));
  const s3 = new SaveGame();
  check('a save from another campaign is refused',
    s3.load({ campaigns: new Set(['test']), levels: new Set(['testbed']) }).ok === false);

  const p = new Profile();
  p.load();
  p.markSeen('thing');
  const p2 = new Profile();
  p2.load();
  check('the profile persists separately from the save', p2.hasSeen('thing'));
  s3.clear();
  const p3 = new Profile();
  p3.load();
  check('and survives the save being wiped', p3.hasSeen('thing'));
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
