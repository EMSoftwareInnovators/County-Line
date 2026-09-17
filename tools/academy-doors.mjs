/* ============================================================
   academy-doors.mjs -- every doorway in the Old Academy, exercised.

   Stage 2's doors were broken in a way no screenshot would have caught:
   the leaf and the hole it belongs in were derived from two different
   numbers, so a door whose wall began below its own threshold hung five
   feet underground with masonry standing in the opening, and the second
   story's terrace door sat down in the ground-floor doorway. Both looked
   fine from most angles. Neither worked.

   So this does not look at doors. For EVERY door in the building it
   checks, against the collider and the interaction system:

     * the leaf is hung in its own opening, at its own sill height;
     * nothing else stands in the opening;
     * shut, the doorway is impassable;
     * open, it is passable;
     * it can be seen and offered from BOTH sides;
     * using it opens it, using it again shuts it, and the collision
       follows the animation rather than the intent.

   and then walks the canonical connections for real, through the leaf,
   turning around and closing behind.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();
const M = (m) => m / 0.3048;

await page.evaluate(() => { window.__game.newGame(); });
await page.waitForTimeout(700);

/* ============================================================
   EVERY DOOR, AGAINST THE COLLIDER
   ============================================================ */
const rows = await page.evaluate(() => {
  const g = window.__game;
  const L = g.level;
  const C = L.collision;
  const R = 0.2794, H = 1.778;
  const out = [];

  const shutAll = () => { for (const d of L.doors) { d.target = 0; d.amount = 0; } L.update(0.016); };

  for (const d of L.doors) {
    const [rx, rz] = d.right;
    const nx = -rz, nz = rx;                 // through the wall
    const y = d.y + 0.05;
    const a = [d.x - nx * 1.15, d.z - nz * 1.15];
    const b = [d.x + nx * 1.15, d.z + nz * 1.15];

    shutAll();
    const shutBlocks = !C.clearPath(a[0], a[1], b[0], b[1], y, R, H);

    /* Anything in the opening that is not this door's own leaf. */
    const junk = [];
    const hw = d.width / 2 - 0.06;
    const ox0 = d.x - Math.abs(rx) * hw - 0.02, ox1 = d.x + Math.abs(rx) * hw + 0.02;
    const oz0 = d.z - Math.abs(rz) * hw - 0.02, oz1 = d.z + Math.abs(rz) * hw + 0.02;
    for (const s of C.all) {
      if (s.door === d || s.tag === 'door') continue;
      if (s.x1 <= ox0 || s.x0 >= ox1 || s.z1 <= oz0 || s.z0 >= oz1) continue;
      if (s.y1 <= d.y + 0.02 || s.y0 >= d.y + d.height - 0.02) continue;
      junk.push(s.tag);
    }

    /* The leaf's own solid must sit in the opening, not somewhere else. */
    const sol = d.solid || d.makeSolid();
    const aligned = Math.abs(sol.y0 - d.y) < 0.01
      && Math.abs((sol.x0 + sol.x1) / 2 - d.x) < 0.02
      && Math.abs((sol.z0 + sol.z1) / 2 - d.z) < 0.02;

    /* Both sides can see it and are offered it. */
    const look = (fx, fz) => {
      const eye = { x: d.x - fx * 1.15, y: d.y + 1.66, z: d.z - fz * 1.15 };
      const to = [d.x - eye.x, (d.y + d.height * 0.45) - eye.y, d.z - eye.z];
      const len = Math.hypot(to[0], to[1], to[2]);
      const hit = L.interact.cast(eye, [to[0] / len, to[1] / len, to[2] / len], g.ctx());
      if (!hit || hit.owner !== d) return null;
      const p = hit.describe(g.ctx());
      return p && p.text ? 'offered' : null;
    };
    const seeA = look(nx, nz), seeB = look(-nx, -nz);

    /* Half open is still shut. The collision has to follow the animation,
       not the intent -- a door that clears the moment you press the key
       lets you walk through a leaf that is still in the way. */
    d.target = 1; d.amount = 0.2; L.update(0);
    const halfBlocks = !C.clearPath(a[0], a[1], b[0], b[1], y, R, H);

    d.amount = 1; L.update(0);
    const openClears = C.clearPath(a[0], a[1], b[0], b[1], y, R, H);

    /* And at the jamb -- as close to it as the collider will actually let
       a body get, which is a couple of inches, not a couple of
       millimeters. */
    const j = Math.max(0, d.width / 2 - R - 0.06);
    const ja = [a[0] + rx * j, a[1] + rz * j], jb = [b[0] + rx * j, b[1] + rz * j];
    const jambClears = C.clearPath(ja[0], ja[1], jb[0], jb[1], y, R, H);

    /* Closing it puts the obstruction back. */
    d.target = 0; d.amount = 0; L.update(0);
    const closedAgain = !C.clearPath(a[0], a[1], b[0], b[1], y, R, H);

    out.push({
      id: d.id, leaves: d.leaves, y: d.y, height: d.height, width: d.width,
      shutBlocks, halfBlocks, openClears, jambClears, closedAgain, aligned,
      junk: junk.join(','), seeA: !!seeA, seeB: !!seeB,
    });
  }
  shutAll();
  return out;
});

console.log(`\n-- ${rows.length} doorways --`);
const failed = [];
for (const r of rows) {
  const why = [];
  if (!r.aligned) why.push('leaf is not in its own opening');
  if (r.junk) why.push(`obstruction in the opening: ${r.junk}`);
  if (!r.shutBlocks) why.push('shut, but passable');
  if (!r.halfBlocks) why.push('clears before the leaf has moved');
  if (!r.openClears) why.push('open, but impassable');
  if (!r.jambClears) why.push('open, but not at the jamb');
  if (!r.closedAgain) why.push('closing did not put the collision back');
  if (!r.seeA) why.push('not offered from side A');
  if (!r.seeB) why.push('not offered from side B');
  if (why.length) failed.push(`${r.id}: ${why.join('; ')}`);
}
check('every doorway hangs its leaf in its own opening and works from both sides',
  failed.length === 0, failed.join('\n      ') || `all ${rows.length} clean`);

/* ---- the two doubles, which have their own way of going wrong ---- */
const dbl = await page.evaluate(() => {
  const L = window.__game.level;
  const out = {};
  for (const id of ['central-front', 'central-rear']) {
    const d = L.doorById(id);
    d.target = 1; d.amount = 1; L.update(0);
    const m = d.matrices();
    const w = d.width / 2;
    /* Where each leaf's free end has swung to. */
    const tip = m.map((mm) => [mm[3] + mm[0] * w, mm[11] + mm[8] * w]);
    /* They must end up on the SAME side of the wall and must not cross. */
    const [rx, rz] = d.right;
    const nx = -rz, nz = rx;
    const side = tip.map((t) => (t[0] - d.x) * nx + (t[1] - d.z) * nz);
    const apart = Math.hypot(tip[0][0] - tip[1][0], tip[0][1] - tip[1][1]);
    out[id] = { leaves: d.leaves, side, apart, width: d.width };
    d.target = 0; d.amount = 0; L.update(0);
  }
  return out;
});
for (const [id, v] of Object.entries(dbl)) {
  check(`${id} is a real pair of leaves`, v.leaves === 2, String(v.leaves));
  check(`  both swing the same way`, Math.sign(v.side[0]) === Math.sign(v.side[1]),
    v.side.map((s) => s.toFixed(2)).join(' / '));
  check(`  and they do not scissor through each other`, v.apart > v.width * 0.7,
    `${M(v.apart).toFixed(1)} ft apart, opening is ${M(v.width).toFixed(1)} ft`);
}

/* ============================================================
   THE CANONICAL CONNECTIONS, WALKED
   ============================================================ */
const put = (x, y, z, yaw) => page.evaluate(([x, y, z, yaw]) => {
  const p = window.__game.player;
  p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = 0;
  p.vx = 0; p.vz = 0; p.vy = 0; p.frozen = false;
}, [x, y, z, yaw]);
const pos = () => page.evaluate(() => {
  const g = window.__game, p = g.player;
  const r = g.level.roomAt(p.x, p.y, p.z);
  return { x: p.x, y: p.y, z: p.z, room: r ? r.id : null };
});
const hold = async (key, ms) => {
  await page.keyboard.down(key); await page.waitForTimeout(ms);
  await page.keyboard.up(key); await page.waitForTimeout(150);
};
const ft = (f) => f * 0.3048;

/** Stand in front of a door, look at it, press E, and report. */
async function useDoor(id, from) {
  const at = await page.evaluate(([id, from]) => {
    const d = window.__game.level.doorById(id);
    const [rx, rz] = d.right;
    const nx = -rz, nz = rx;
    return { x: d.x - from * nx * 1.1, y: d.y, z: d.z - from * nz * 1.1,
      yaw: Math.atan2(from * nx, from * nz) };
  }, [id, from]);
  await put(at.x, at.y, at.z, at.yaw);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  return page.evaluate((id) => {
    const d = window.__game.level.doorById(id);
    return { open: d.open, clear: d.clear };
  }, id);
}

console.log('\n-- the canonical connections, opened and walked --');
const CANON = [
  ['central-front', 'the front doors'],
  ['central-rear', 'the rear doors'],
  ['central-indians', 'central to Indians'],
  ['central-americana', 'central to Americana'],
  ['central-westhall', 'central to the west rear hall'],
  ['central-easthall', 'central to the east rear hall'],
  ['west-hall-porch', 'the west hall onto the rear porch'],
  ['east-hall-porch', 'the east hall onto the rear porch'],
];
for (const [id, label] of CANON) {
  const opened = await useDoor(id, 1);
  check(`${label}: opens from one side`, opened.open && opened.clear,
    `open ${opened.open}, clear ${opened.clear}`);

  /* Walk through it, turn around, and shut it behind. */
  const before = await pos();
  await hold('KeyW', 1400);
  const after = await pos();
  check(`  and you can walk through`, after.room !== before.room,
    `${before.room} -> ${after.room}`);

  await page.evaluate((id) => {
    const p = window.__game.player;
    const d = window.__game.level.doorById(id);
    p.yaw = Math.atan2(d.x - p.x, d.z - p.z);
  }, id);
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(900);
  const shut = await page.evaluate((id) => {
    const d = window.__game.level.doorById(id);
    return { open: d.open, clear: d.clear };
  }, id);
  check(`  and shut it again from the other side`, !shut.open && !shut.clear,
    `open ${shut.open}, clear ${shut.clear}`);
}

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
