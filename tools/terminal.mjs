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

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
