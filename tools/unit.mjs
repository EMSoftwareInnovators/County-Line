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
const { Settings, defaultSettings, TEXTURE_STABILITY } = await import('../src/game/settings.js');
const { mipChain } = await import('../src/engine/texture.js');
const { SaveGame, Profile } = await import('../src/game/save.js');
const { Campaign, CampaignDef, TEST_CAMPAIGN, PHASE } = await import('../src/game/campaign.js');
const input = await import('../src/engine/input.js');
const { Door } = await import('../src/game/door.js');
const { InteractionSystem, Interactable } = await import('../src/game/interaction.js');
const { MeshBuilder } = await import('../src/engine/mesh.js');
const routes = await import('../src/game/terminal/routes.js');
const cash = await import('../src/game/terminal/money.js');
const { TicketBook } = await import('../src/game/terminal/tickets.js');
const { Manifest, BOARD } = await import('../src/game/terminal/manifest.js');
const svc = await import('../src/game/terminal/service.js');

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

  /* ---- texture stability ---- */
  check('the default mapping is not fully affine',
    TEXTURE_STABILITY[defaultSettings().textureStability].step > 0,
    TEXTURE_STABILITY[defaultSettings().textureStability].id);
  check('and it reaches the rasterizer', fake.raster.perspStep > 0, String(fake.raster.perspStep));
  check('RETRO is the affine one',
    TEXTURE_STABILITY.find((t) => t.id === 'retro').step === 0);
  check('STABLE corrects every pixel',
    TEXTURE_STABILITY.find((t) => t.id === 'stable').step === 1);
  const s4 = new Settings();
  s4.values.textureStability = 99;
  localStorage.setItem('countyline.settings', JSON.stringify({ v: 1, d: { ...defaultSettings(), textureStability: 99 } }));
  s4.load();
  check('an out-of-range stability index is clamped rather than crashing the span loop',
    s4.get('textureStability') === TEXTURE_STABILITY.length - 1, String(s4.get('textureStability')));
}

section('mipmaps');
{
  /* A 4x4 texture, left half opaque red and right half opaque blue, in
     the rasterizer's own 0xAABBGGRR order. */
  const R = 0xFF0000FF >>> 0, B = 0xFFFF0000 >>> 0;
  const px = new Uint32Array(16);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) px[y * 4 + x] = x < 2 ? R : B;
  const tex = { px, w: 4, h: 4, wMask: 3, hMask: 3, shift: 2 };
  mipChain(tex, 3);
  check('a 4x4 texture makes one usable level', tex.mip.length === 1, String(tex.mip.length));
  const m = tex.mip[0];
  check('and it is 2x2 with the right mask and shift',
    m.w === 2 && m.h === 2 && m.wMask === 1 && m.shift === 1);
  check('a box filter over a solid half keeps the color exactly',
    (m.px[0] >>> 0) === R && (m.px[1] >>> 0) === B,
    `${(m.px[0] >>> 0).toString(16)}, ${(m.px[1] >>> 0).toString(16)}`);
  check('and alpha survives the averaging', ((m.px[0] >>> 24) & 255) === 255);
  /* A checker averages to the midpoint rather than picking a corner. */
  const px2 = new Uint32Array(4);
  px2[0] = 0xFF000000; px2[1] = 0xFF0000FF; px2[2] = 0xFF0000FF; px2[3] = 0xFF000000;
  const t2 = { px: px2, w: 2, h: 2, wMask: 1, hMask: 1, shift: 1 };
  mipChain(t2, 3);
  check('a 2x2 texture stops rather than making a 1x1', t2.mip.length === 0, String(t2.mip.length));
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

  /* A player must not be able to bind themselves out of their own menus.
     Stripping every key off uiConfirm leaves no way to select a row --
     including the "reset to defaults" row that would undo it. */
  {
    /* The binding table on its own, without a DOM: Input's constructor wires
       listeners, and none of that is what is under test here. */
    const I = Object.create(input.Input.prototype);
    I.keyBinds = input.defaultKeyBinds();
    I.keyBindsAreUser = false;
    check('uiConfirm ships with three keys', I.keyBinds.uiConfirm.length === 3,
      I.keyBinds.uiConfirm.join(','));
    check('taking the first is allowed', I.bindKey('forward', 'Enter').ok);
    check('taking the second is allowed', I.bindKey('back', 'Space').ok);
    const last = I.bindKey('left', 'KeyE');
    check('taking the LAST one is refused', last.ok === false, String(last.reason));
    check('and says which action it would have stranded', last.stranded === 'uiConfirm', String(last.stranded));
    check('so a menu can always still be worked', I.keyBinds.uiConfirm.length > 0,
      I.keyBinds.uiConfirm.join(','));
    check('and the refused rebind changed nothing', I.keysFor('left').join() === 'KeyA',
      I.keysFor('left').join(','));
    check('clearing a menu-critical action is refused too',
      I.clearKeys('uiConfirm').ok === false);
    check('but clearing an ordinary one is fine', I.clearKeys('crouch').ok === true);
  }

  /* A stored map that is already broken repairs itself on load -- the only
     route back for a player who got into that state under an older build. */
  {
    const broken = input.sanitizeKeyBinds({ uiConfirm: [], uiUp: [], forward: ['KeyI'] });
    check('a stored map with no confirm key is repaired', broken.uiConfirm.length > 0,
      broken.uiConfirm.join(','));
    check('and so is menu movement', broken.uiUp.length > 0, broken.uiUp.join(','));
    check('without disturbing the rest of it', broken.forward.join() === 'KeyI');
  }

  check('a key name is something a player could act on',
    input.keyName('Enter') === 'ENTER' && input.keyName('KeyF') === 'F',
    `${input.keyName('Enter')} / ${input.keyName('KeyF')}`);

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
  /* Stage 2 moved the technical shift onto the Old Academy, which is the
     level there now is. It still carries no story: the objectives are
     "get upstairs" and "step outside", which are tests of the
     architecture and nothing else. */
  check('the test campaign has one shift, on the Old Academy',
    TEST_CAMPAIGN.length === 1 && TEST_CAMPAIGN.shift(0).level === 'academy',
    `${TEST_CAMPAIGN.length} shift(s) on ${TEST_CAMPAIGN.shift(0).level}`);
  check('and no story in it',
    !JSON.stringify(TEST_CAMPAIGN).match(/bus|coach|ghost|passenger|ticket|baggage|scare/i));

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

  /* CONTINUE is for a shift that is not over. A finished campaign is still
     worth storing -- the result is a record -- but resuming it drops the
     player into a shift with nothing left to do. */
  {
    store.clear();
    storage._reset();
    const known = { campaigns: new Set(['test']), levels: new Set(['testbed']) };
    const live = new Campaign(TEST_CAMPAIGN);
    live.start(0, {});
    const sg = new SaveGame();
    sg.autosave(live, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, { id: 'testbed', doors: [] }, 1);
    check('an unfinished shift is offered as CONTINUE', sg.resumable(known) === true);
    live.end('objectives', {});
    sg.autosave(live, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }, { id: 'testbed', doors: [] }, 1);
    check('a finished one is not', sg.resumable(known) === false);
    check('even though it is still saved', SaveGame.exists() === true);
    store.clear();
    storage._reset();
    check('and nothing at all is not either', new SaveGame().resumable(known) === false);
  }

  store.clear();
  storage._reset();
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

/* ============================================================
   THE OLD ACADEMY'S DIMENSIONS

   dimensions.js is the single source of truth for the building, and it
   is arithmetic: every station is derived from the measured plan's
   printed figures. So it can be checked without a browser, a renderer or
   a collider, and it is checked here rather than only in the walking
   harness -- because the number that silently stops closing is the one
   that ruins the reconstruction, and it should fail in milliseconds.

   These are the invariants the Stage 2 brief asks for, in the form the
   references state them.
   ============================================================ */
{
  section("the Old Academy's dimensions");
  const D = await import('../src/world/levels/academy/dimensions.js');
  const F = (m) => m / 0.3048;
  const isFt = (label, m, feet, tol = 0.002) =>
    check(label, Math.abs(F(m) - feet) < tol, `${F(m).toFixed(4)} ft, wanted ${feet}`);

  /* ---- the footprint the measured plan prints ---- */
  isFt('the building is 112 ft 9 in across', D.WIDTH, 112.75);
  isFt('and 94 ft deep', D.DEPTH, 94);
  isFt('each rear wing is 34 ft 3 in wide', D.WING, 34.25);
  isFt('which leaves a 44 ft 3 in central bay', D.BAY, 44.25);

  /* ---- reconciliation A: a 19.5 in exterior wall is what makes a
         34 ft 3 in wing come out at the 31 ft interior printed three
         times on the plan. If either number moves, this stops closing. ---- */
  isFt('the exterior wall is 19.5 in', D.EXT, 1.625);
  isFt('so the clear interior of a wing is exactly 31 ft', D.WING_IN, 31);
  check('and that is the wing less two exterior walls',
    near(D.WING_IN, D.WING - 2 * D.EXT, 1e-9));

  /* ---- both wings close on 94 ft, band by band ---- */
  const bands = D.EXT + D.FRONT_BLOCK + D.CROSS + D.MID_BAND + D.CROSS + D.NORTH_BAND + D.EXT;
  isFt('19.5in + 37ft10 + 12in + 13ft + 12in + 37ft11 + 19.5in closes on 94 ft', bands, 94);
  check('the north band ends exactly at the inner face of the north wall',
    near(D.Z_NB_S + D.NORTH_BAND, D.Z_N_IN, 1e-9),
    `${F(D.Z_NB_S + D.NORTH_BAND).toFixed(4)} vs ${F(D.Z_N_IN).toFixed(4)}`);
  check('and the façade to the north end is the full depth',
    near(D.Z_N_OUT - D.Z_FACADE, D.DEPTH, 1e-9));

  /* ---- reconciliation B: the garden is as wide as the central room ---- */
  check('the garden is exactly as wide as the central room',
    near(D.X_BAY_E - D.X_BAY_W, D.BAY, 1e-9));
  check('and the central bay is the width less the two wings',
    near(D.BAY, D.WIDTH - 2 * D.WING, 1e-9));

  /* ---- the origin is the center of the first-floor central room ---- */
  check('the origin is on the building center line', near(D.X_BAY_W, -D.X_BAY_E, 1e-9));
  check('and on the central room center line', near(D.Z_CENTRAL_S, -D.Z_CENTRAL_N, 1e-9));
  isFt('the front façade stands 31 ft 4.5 in south of it', -D.Z_FACADE, 31.375);
  isFt('the front porch is 13 ft 6 in deep', D.FRONT_PORCH_DEPTH, 13.5);
  isFt('the rear porch 15 ft', D.REAR_PORCH_DEPTH, 15);

  /* ---- the vertical section, re-derived in Stage 2.1 ----
     None of these is a documented measurement. They are a photographic
     estimate of a very tall first floor, plus the arithmetic the
     staircase then forces on it. What is checked is that the arithmetic
     still closes, not that the estimate is right. */
  isFt('the central room is about 15 ft 9 in clear', D.CEIL_PRINCIPAL, 15.75);
  check('which is the ~4.8 m the photographs were read at',
    Math.abs(D.CEIL_PRINCIPAL - 4.8) < 0.01, `${D.CEIL_PRINCIPAL.toFixed(3)} m`);
  check('the secondary rooms sit in the 4.5-4.7 m band',
    D.CEIL_SECONDARY >= 4.5 && D.CEIL_SECONDARY <= 4.72,
    `${D.CEIL_SECONDARY.toFixed(3)} m`);
  check('and there are only three first-floor ceiling classes',
    new Set([D.CEIL_PRINCIPAL, D.CEIL_SECONDARY, D.CEIL_SERVICE]).size === 3);
  check('service ceilings are below the secondary ones, not above',
    D.CEIL_SERVICE < D.CEIL_SECONDARY && D.CEIL_SECONDARY <= D.CEIL_PRINCIPAL);

  isFt('the second floor is at 17 ft 4 in', D.FLOOR2, 17 + 4 / 12);
  check('which is 26 risers', D.STAIR_RISERS === 26, String(D.STAIR_RISERS));
  check('of exactly 8 in', Math.abs(D.STAIR_RISE * 39.3700787 - 8) < 1e-6,
    `${(D.STAIR_RISE * 39.3700787).toFixed(6)} in`);
  check('and the ceiling plus the floor structure is that height',
    near(D.CEIL_PRINCIPAL + D.FLOOR_STRUCTURE, D.FLOOR2, 1e-9));
  check('a step up is deliberately shorter than a riser, so stairs are stairs',
    SCALE.stepHeight < D.STAIR_RISE, `${F(SCALE.stepHeight).toFixed(3)} < ${F(D.STAIR_RISE).toFixed(3)} ft`);
  const twoRT = (2 * D.STAIR_RISE + D.STAIR_RUN) * 39.3700787;
  check('2R + T lands in the historic 24-26 inch band', twoRT > 24 && twoRT < 26.01,
    `${twoRT.toFixed(2)} in`);

  /* ---- the whole switchback has to fit the middle band ---- */
  const switchback = D.STAIR_LANDING + (D.STAIR_RISERS / 2) * D.STAIR_RUN;
  const available = D.WING_IN - D.REAR_HALL_W;
  check('the switchback fits between the outer wall and the rear hall',
    switchback <= available + 1e-9,
    `${F(switchback).toFixed(3)} ft in ${F(available).toFixed(3)} ft`);
  check('and the restroom takes what is left of the band, as a real room',
    near(D.Z_SERVICE_N - D.Z_SERVICE_S, D.MID_BAND - D.STAIR_WELL_D, 1e-9)
    && (D.Z_SERVICE_N - D.Z_SERVICE_S) > 1.4,
    `${F(D.Z_SERVICE_N - D.Z_SERVICE_S).toFixed(2)} ft deep`);
  check('the stair well and the restroom do not overlap',
    D.Z_SERVICE_S >= D.Z_STAIR_N - 1e-9);

  /* ---- the front, which is what Stage 2.1 was mostly about ---- */
  check('the portico is ONE story, not two',
    D.PORTICO_SOFFIT < D.FLOOR2 && D.TERRACE === D.FLOOR2,
    `soffit ${F(D.PORTICO_SOFFIT).toFixed(2)} ft, terrace ${F(D.TERRACE).toFixed(2)} ft`);
  check('the terrace parapet is masonry with a merlon rhythm',
    D.TERRACE_MERLON_TOP > D.TERRACE_PARAPET && D.TERRACE_PARAPET > D.TERRACE);
  check('the central block stands ABOVE the wings',
    D.ROOF_CENTER > D.ROOF && D.PARAPET_TOP_CENTER > D.PARAPET_TOP,
    `${F(D.PARAPET_TOP_CENTER).toFixed(1)} ft vs ${F(D.PARAPET_TOP).toFixed(1)} ft`);
  check('the first-floor windows are tall and narrow',
    (D.WIN1_HEAD - D.WIN1_SILL) / D.WIN_W > 2.4,
    `${((D.WIN1_HEAD - D.WIN1_SILL) / D.WIN_W).toFixed(2)} : 1`);
  check('and they stop short of the ceiling rather than running into it',
    D.WIN1_HEAD < D.CEIL_PRINCIPAL - 0.4,
    `head ${F(D.WIN1_HEAD).toFixed(2)} ft under a ${F(D.CEIL_PRINCIPAL).toFixed(2)} ft ceiling`);
  check("the Academy's doors are NOT the engine's generic 6ft8 leaf",
    D.DOOR_H > SCALE.doorHeight + 0.3 && SCALE.doorHeight < 2.1,
    `academy ${F(D.DOOR_H).toFixed(2)} ft, engine ${F(SCALE.doorHeight).toFixed(2)} ft`);

  /* ---- the central room's columns ---- */
  check('the central room has its columns', D.CENTRAL_ROOM_COLUMNS.length >= 4,
    `${D.CENTRAL_ROOM_COLUMNS.length} of them`);
  check('they stand inside the room, not in its walls',
    D.CENTRAL_ROOM_COLUMNS.every((c) => Math.abs(c.x) < D.BAY / 2 - 1
      && Math.abs(c.z) < D.CENTRAL_DEPTH / 2 - 1));
  check('they are symmetric about the building center line',
    D.CENTRAL_ROOM_COLUMNS.every((c) => D.CENTRAL_ROOM_COLUMNS
      .some((o) => Math.abs(o.x + c.x) < 1e-9 && Math.abs(o.z - c.z) < 1e-9)));
  check('and they are slender, not classical orders',
    D.INT_COLUMN_DIA < 0.35, `${(D.INT_COLUMN_DIA * 39.37).toFixed(1)} in through`);

  /* ---- the things the brief says must never happen ---- */
  check('the two rear wings do not meet: there is a bay between them',
    D.X_WING_W_IN < D.X_WING_E_IN - ft(40),
    `${F(D.X_WING_E_IN - D.X_WING_W_IN).toFixed(2)} ft apart`);
  /* North to south the depth divides up exactly: front porch, central
     block, rear porch, garden. What is left over IS the garden, and if
     any of the four changes the garden is what absorbs it. */
  const stack = D.FRONT_PORCH_DEPTH + D.EXT + D.CENTRAL_DEPTH + D.EXT + D.REAR_PORCH_DEPTH;
  check('the garden is what the depth has left after the porches and the center',
    near(D.Z_N_OUT - D.Z_PORCH_N, D.DEPTH - stack, 1e-9),
    `${F(D.Z_N_OUT - D.Z_PORCH_N).toFixed(3)} ft deep, ${F(D.BAY).toFixed(3)} ft wide`);
  check('the garden floor is above the exterior grade but below the porch',
    D.GRADE < D.GARDEN_LEVEL && D.GARDEN_LEVEL < 0,
    `${F(D.GRADE)} < ${F(D.GARDEN_LEVEL)} < 0 ft`);
  check('the parapet stands above the roof deck', D.PARAPET_TOP > D.ROOF);
  check('a merlon is wider than the crenel beside it', D.MERLON > D.CRENEL);
  check('and the corbel table has a readable rhythm under it',
    D.CORBEL_PITCH > D.CORBEL_W && D.CORBEL_PROJ > 0.1,
    `${(D.CORBEL_PITCH * 39.37).toFixed(0)} in pitch`);
}

/* ============================================================
   THE JOB: ROUTES, FARES, MONEY, TICKETS, MANIFESTS

   All four are plain data and arithmetic with no DOM anywhere near
   them, which is the point of keeping them out of the level: a fare
   that is wrong is wrong in a millisecond here rather than after a
   browser launch and a walk to the counter.
   ============================================================ */
section('routes and fares');
{
  check('four routes out of Augusta, each with the towns it passes through',
    routes.ROUTES.length === 4 && routes.ROUTES.every((r) => r.stops.length >= 4),
    routes.ROUTES.map((r) => `${r.code}:${r.stops.length}`).join(' '));
  check('every route ends at the city it is named for',
    routes.ROUTES.every((r) => {
      const last = r.stops[r.stops.length - 1];
      return last.name.toUpperCase() === r.name;
    }));
  check('and the mileages climb along the way',
    routes.ROUTES.every((r) => r.stops.every((s, i) => i === 0 || s.miles > r.stops[i - 1].miles)));

  const atl = routes.fareFor({ route: 'atl', to: 'Atlanta', cls: 'adult' });
  const way = routes.fareFor({ route: 'atl', to: 'Thomson', cls: 'adult' });
  check('a fare is base plus mileage', atl === routes.toQuarter(450 + 145 * 16),
    cash.money(atl));
  check('and a stop on the way costs less than the far end',
    way < atl && way > 0, `${cash.money(way)} to Thomson`);
  check('every fare on the card lands on a quarter',
    routes.allStops().every((s) => routes.fareFor({ route: s.route, to: s.name }) % 25 === 0));
  check('a child is half and a senior is not',
    routes.fareFor({ route: 'atl', to: 'Atlanta', cls: 'child' })
      === routes.toQuarter(atl * 0.5)
    && routes.fareFor({ route: 'atl', to: 'Atlanta', cls: 'senior' })
      === routes.toQuarter(atl * 0.85));
  check('a return is dearer than one way and cheaper than two',
    (() => {
      const rt = routes.fareFor({ route: 'atl', to: 'Atlanta', roundTrip: true });
      return rt > atl && rt < atl * 2;
    })(), cash.money(routes.fareFor({ route: 'atl', to: 'Atlanta', roundTrip: true })));
  check('a route that does not go there sells nothing',
    routes.fareFor({ route: 'atl', to: 'Savannah' }) === 0);

  check('two bags are free and the third is not',
    routes.baggageFee([20, 30]) === 0 && routes.baggageFee([20, 30, 15]) === routes.FARE.extraBag);
  check('and a heavy one is charged whatever else is on the desk',
    routes.baggageFee([70]) === routes.FARE.heavyFee);

  check('tonight is five coaches between eight and one',
    routes.NIGHT.length === 5
    && routes.NIGHT.every((n) => n.time >= 0 && n.time <= 5 * 60),
    routes.NIGHT.map((n) => `${routes.clockAt(n.time)} ${n.kind}`).join(' '));
  check('they do not all want the same bay at the same time',
    (() => {
      for (const a of routes.NIGHT) {
        for (const b of routes.NIGHT) {
          if (a === b || a.bay !== b.bay) continue;
          if (Math.abs(a.time - b.time) < 45) return false;
        }
      }
      return true;
    })());
  check('the clock reads back as a time of night',
    routes.clockAt(0) === '20:00' && routes.clockAt(195) === '23:15'
    && routes.boardTime(195) === '11:15 PM', routes.boardTime(0));
}

section('money');
{
  check('money is cents and prints like money',
    cash.money(2775) === '$27.75' && cash.money(0) === '$0.00' && cash.money(-125) === '-$1.25');
  const c = cash.makeChange(2775 - 2000 > 0 ? 5000 - 2775 : 0);
  check('change out of a fifty for a $27.75 fare is exact',
    c.ok && c.parts.reduce((a, p) => a + p.cents, 0) === 2225, cash.sayChange(c.parts));
  check('and it is counted out largest first',
    c.parts.every((p, i) => i === 0 || p.cents / p.n <= c.parts[i - 1].cents / c.parts[i - 1].n));
  check('a drawer with no fives says so rather than guessing',
    (() => {
      const r = cash.makeChange(1000, { b1: 3, c25: 4 });
      return !r.ok && r.short > 0;
    })());

  const d = new cash.Drawer();
  const opened = d.total;
  check('the opening float is a hundred and fifty dollars', opened === 15000, cash.money(opened));
  check('taking a twenty puts twenty in', (() => {
    d.take(cash.partsOf({ b20: 1 }), 'fare');
    return d.total === opened + 2000;
  })());
  check('and giving change takes it back out', (() => {
    const ch = d.change(2225);
    return ch.ok && d.give(ch.parts, 'change') && d.total === opened + 2000 - 2225;
  })());
  check('a drawer will not give what it does not have',
    d.give(cash.partsOf({ b50: 1 }), 'nope') === false);
  check('and it survives a save', (() => {
    const blob = JSON.parse(JSON.stringify(d.save()));
    const e = new cash.Drawer();
    e.restore(blob);
    return e.total === d.total;
  })());
  check('somebody buying a $27.75 ticket hands over at least that much',
    (() => {
      let ok = true;
      let rng = 0;
      const fake = () => { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; };
      for (let i = 0; i < 200; i++) {
        const o = cash.offerFor(2775, fake);
        if (o.paid < 2775) ok = false;
      }
      return ok;
    })());
}

section('tickets and claim checks');
{
  const book = new TicketBook();
  const first = book.issue({ route: 'sav', to: 'Statesboro', cls: 'adult', issued: 30 });
  const second = book.issue({ route: 'atl', to: 'Atlanta', cls: 'child', issued: 34 });
  check('a ticket comes off a numbered roll, and the roll moves on',
    first && second && second.serial === first.serial + 1,
    `${first.serial} then ${second.serial}`);
  check('the roll does not start at one',
    first.serial > 10000, String(first.serial));
  check('a ticket carries its fare, not a reference to one',
    first.fare === routes.fareFor({ route: 'sav', to: 'Statesboro' }), cash.money(first.fare));
  check('and prints something a person can read',
    /SAVANNAH \/ Statesboro/.test(first.text), first.text);
  check('a destination the route does not serve prints nothing',
    book.issue({ route: 'sav', to: 'Atlanta' }) === null);
  check('the clerk may charge something other than the card',
    book.issue({ route: 'atl', to: 'Atlanta', fare: 100 }).fare === 100);

  const bag = book.check({ route: 'sav', to: 'Statesboro', weight: 38, fee: 0, issued: 31 });
  check('a bag gets its own claim number off its own roll',
    bag.claim !== first.serial && bag.claim > 10000, bag.text);
  check('a voided ticket keeps its serial', (() => {
    const t = book.issue({ route: 'mcn', to: 'Macon' });
    return book.void(t.serial) && t.voided && book.ticket(t.serial) === t;
  })());
  check('takings add up over what was not voided',
    book.takings() > 0 && book.takings() < 100000, cash.money(book.takings()));
  check('the book survives a save', (() => {
    const blob = JSON.parse(JSON.stringify(book.save()));
    const b2 = new TicketBook();
    b2.restore(blob);
    return b2.next === book.next && b2.ticket(first.serial).fare === first.fare
      && b2.bag(bag.claim).weight === 38;
  })());
}

section('boarding');
{
  const book = new TicketBook();
  const m = new Manifest({ id: 'gcl-1509', route: 'sav', bay: 2, depart: 225, driver: 'Odom' });
  const mine = book.issue({ route: 'sav', to: 'Savannah' });
  const theirs = book.issue({ route: 'atl', to: 'Madison' });
  const refunded = book.issue({ route: 'sav', to: 'Millen' });
  book.void(refunded.serial);

  check('nothing boards a coach that is not boarding', m.check(mine) === BOARD.NOT_OPEN);
  m.coach = 'gcl-1509';
  m.open();
  check('the right ticket goes on', m.lift(mine) === BOARD.OK && m.boarded.length === 1);
  check('the same ticket does not go on twice', m.lift(mine) === BOARD.LIFTED);
  check('a ticket for another route does not', m.lift(theirs) === BOARD.WRONG_ROUTE);
  check('and neither does a refunded one', m.lift(refunded) === BOARD.VOIDED);
  check('a bag going the same way loads', (() => {
    const b = book.check({ route: 'sav', to: 'Savannah', weight: 41 });
    return m.load(b) && b.where === 'loaded' && b.departure === m.id;
  })());
  check('a bag going somewhere else does not', (() => {
    const b = book.check({ route: 'atl', to: 'Atlanta', weight: 22 });
    return m.load(b) === false;
  })());
  check('a manifest with a coach and people on it has nothing wrong with it',
    m.problems(book).length === 0, m.problems(book).join('; '));
  check('the driver signs while it is still boarding, not after',
    (() => {
      const later = new Manifest({ id: 'y', route: 'sav', bay: 2, depart: 300 });
      const cannot = later.sign() === false;       // nothing to sign yet
      later.coach = 'x'; later.open();
      return cannot && later.sign() === true && later.state === 'boarding';
    })());
  check('and closing it is a separate thing', m.close() && m.state === 'closed');
  check('and once the coach has gone nothing else gets on', (() => {
    m.depart_();
    const late = book.issue({ route: 'sav', to: 'Millen' });
    return m.check(late) === BOARD.GONE;
  })());
  check('the manifest survives a save', (() => {
    const blob = JSON.parse(JSON.stringify(m.save()));
    const m2 = Manifest.load(blob);
    return m2.boarded.length === m.boarded.length && m2.signed === m.signed
      && m2.state === m.state;
  })());
  check('the board line reads like a departure board',
    (() => {
      const n = new Manifest({ id: 'x', route: 'atl', bay: 1, depart: 55 });
      const l = n.boardLine();
      return l.time === '20:55' && l.name === 'ATLANTA' && l.bay === 1 && l.status === 'ON TIME';
    })());
}

section('selling a ticket');
{
  const book = new TicketBook();
  const drawer = new cash.Drawer();
  let done = null;
  const sale = new svc.Sale({
    who: 'the man with the holdall',
    route: 'sav', to: 'Savannah', cls: 'adult', roundTrip: false,
    bags: [34], paid: 5000,
    onDone: (r) => { done = r; },
  });

  check('a window with nobody at it offers nothing',
    sale.promptAt('window') === null && sale.promptAt('register') === null);
  check('serving them works out what they are asking for',
    sale.serve() && sale.fare === routes.fareFor({ route: 'sav', to: 'Savannah' })
    && sale.step === svc.STEP.ASKED, `${cash.money(sale.fare)}, ${sale.asking}`);
  check('and the window asks you to quote it',
    /Quote the fare/.test(sale.promptAt('window').text), sale.promptAt('window').text);
  check('the register has nothing to say until it is quoted',
    sale.promptAt('register') === null);
  check('quoting moves it on', sale.quote() && sale.quoted === sale.fare);
  check('now the register wants the money',
    /Take \$50\.00/.test(sale.promptAt('register').text), sale.promptAt('register').text);
  check('taking it works out the change',
    sale.take() && sale.changeDue === 5000 - sale.total, cash.money(sale.changeDue));
  check('and the register counts it out of this drawer',
    /Count out/.test(sale.promptAt('register', drawer).text),
    sale.promptAt('register', drawer).sub);
  check('the printer waits for the change to be counted',
    sale.promptAt('printer') === null);
  const ch = sale.change(drawer);
  check('counting it out succeeds when the drawer can make it', ch.ok === true);
  check('the printer now has a ticket to print',
    /Print the ticket/.test(sale.promptAt('printer').text));
  check('printing issues one ticket and one claim check per bag',
    !!sale.issue(book, 40) && book.tickets.size === 1 && book.checks.size === 1,
    sale.ticket.text);
  check('the claim check carries the baggage charge, not the ticket',
    sale.ticket.fare === sale.quoted);
  check('and handing it over finishes the sale',
    !!sale.finish() && done && done.ticket === sale.ticket && sale.step === svc.STEP.IDLE);
  check('the passenger paid what they paid and got what they were owed',
    done.took === 5000 && done.gave === 5000 - (sale.quoted + sale.bagFee));
  check('and the clerk charged the card price',
    done.overOrUnder === 0);

  check('a destination the route does not serve is refused at the window',
    (() => {
      const bad = new svc.Sale({ route: 'sav', to: 'Atlanta' });
      bad.serve();
      return bad.fare === 0 && /do not go there/.test(bad.promptAt('window').text);
    })());
  check('somebody who is short does not get a ticket',
    (() => {
      const s2 = new svc.Sale({ route: 'mcn', to: 'Macon', paid: 100 });
      s2.serve(); s2.quote();
      return s2.take() === false && /short/.test(s2.trouble);
    })());
  check('and a drawer that cannot make change says so instead of inventing it',
    (() => {
      const thin = new cash.Drawer({ b1: 1 });
      const s3 = new svc.Sale({ route: 'mcn', to: 'Macon', paid: 5000 });
      s3.serve(); s3.quote(); s3.take();
      const r = s3.change(thin);
      return !r.ok && /short of change/.test(s3.trouble)
        && /No change in the drawer/.test(s3.promptAt('register', thin).text);
    })());
  check('a clerk who quotes the wrong number is recorded, not corrected',
    (() => {
      const s4 = new svc.Sale({ route: 'mcn', to: 'Macon', paid: 5000 });
      s4.serve(); s4.quote(s4.fare - 500); s4.take();
      s4.change(new cash.Drawer()); s4.issue(book, 50);
      const out = s4.finish();
      return out.overOrUnder === -500;
    })());

  check('bags move by the cart-load and not one at a time', (() => {
    const b = new TicketBook();
    for (let i = 0; i < 6; i++) b.check({ route: 'sav', to: 'Savannah', weight: 30, where: 'desk' });
    for (let i = 0; i < 2; i++) b.check({ route: 'atl', to: 'Atlanta', weight: 30, where: 'desk' });
    const moved = svc.moveBags(b, 'sav', 'desk', 'staging');
    return moved === 6
      && svc.bagsFor(b, 'sav', 'staging').length === 6
      && svc.bagsFor(b, 'atl', 'desk').length === 2;
  })());
  check('and the desk says what it is charging for in words',
    /3 pieces, 1 over the allowance/.test(svc.bagLine([20, 30, 40])), svc.bagLine([20, 30, 60]));
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
