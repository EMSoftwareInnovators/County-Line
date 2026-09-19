/* ============================================================
   props.js -- the furniture and equipment Richmond Central brought with
   it, as a vocabulary.

   THE RULE FOR THIS WHOLE DIRECTORY: nothing in it touches the building.
   The bus company adapted to the Old Academy; the Old Academy did not
   adapt to the bus company. Every counter is a thing standing on a
   floor, every sign is a thing screwed to a plaster wall, and if the
   company left tomorrow the only evidence would be the screw holes. No
   module under terminal/ moves a wall, cuts a door, or changes a
   ceiling, and none of them may.

   Practically that means: props and barriers only. Nothing here calls
   `wall`, `wallWith`, `door`, `window`, `floor` or `ceiling`.
   ============================================================ */
import { ft, ftin, inch } from '../../../../engine/units.js';
import { trimBox as rawTrimBox } from '../parts.js';

/* ============================================================
   WHICH FLOOR THE FURNITURE IS STANDING ON

   Every helper below measures Y from the floor of the room it is
   furnishing: a bench is fourteen inches tall, a counter is three foot
   four, a sign is nine and a half feet up. None of them take a floor
   level, because a caller who has to remember to add one will forget --
   and the way that failure shows up is a stack of boxes meant for the
   second floor standing in the middle of the ticket hall, which is
   exactly what it did.

   So the floor is set once per room, next to `b.chunk`, and every piece
   of geometry in this file is lifted by it. On the first floor it is
   zero, which is why the first floor never noticed.

       standOn(r.y);          // and everything below stands on r.y

   It is deliberately module state rather than a parameter: "the floor
   these props are standing on" is a property of the room being
   furnished, not of each chair in it. buildTerminal puts it back to
   zero between modules so a forgotten call cannot travel.
   ============================================================ */
let BASE = 0;

/** Set the floor level the next props stand on. Returns the old one. */
export function standOn(y) {
  const was = BASE;
  BASE = y || 0;
  return was;
}

/** The floor level currently in force, for a caller that needs it raw. */
export function floorLevel() { return BASE; }

function trimBox(b, x0, y0, z0, x1, y1, z1, m) {
  rawTrimBox(b, x0, BASE + y0, z0, x1, BASE + y1, z1, m);
}

/* ============================================================
   FURNITURE AGAINST A WALL WITH A DOOR IN IT

   A twelve-foot run of shelving along a wall is the right answer in a
   store room and the wrong answer if there is a doorway two-thirds of
   the way down it. Rather than hand-fitting every run to every room,
   a run can be asked to break itself where the building needs the
   floor: `wallRuns` returns the pieces that are left.

   It only breaks for a hole in the wall the run is standing against.
   A doorway in the wall at right angles to the run is at the END of it
   and is somebody else's problem -- usually the run's own length.
   ============================================================ */

/**
 * @param spec  the whole run, as if the wall had no doors in it
 * @param opt   { clear: floor either side of a doorway, min: shortest
 *                piece worth building }
 * @returns     an array of specs, each a piece of the run
 */
export function wallRuns(b, spec, opt = {}) {
  const clear = opt.clear === undefined ? ftin(2, 0) : opt.clear;
  const min = opt.min === undefined ? ftin(2, 6) : opt.min;
  const alongX = (spec.x1 - spec.x0) >= (spec.z1 - spec.z0);
  const a0 = alongX ? spec.x0 : spec.z0;
  const a1 = alongX ? spec.x1 : spec.z1;
  const p0 = alongX ? spec.z0 : spec.x0;
  const p1 = alongX ? spec.z1 : spec.x1;

  const cuts = [];
  for (const h of [...b.level.doors, ...b.level.openings]) {
    if (Math.abs((h.y || 0) - BASE) > ftin(1, 0)) continue;
    /* A hole in a wall parallel to the run is one the run crosses; a
       hole in a wall at right angles to it is not. */
    if ((Math.abs(Math.sin(h.yaw)) > 0.5) === alongX) continue;
    const ha = alongX ? h.x : h.z;
    const hp = alongX ? h.z : h.x;
    if (hp < p0 - ft(3) || hp > p1 + ft(3)) continue;
    const w = h.width / 2 + clear;
    if (ha + w <= a0 || ha - w >= a1) continue;
    cuts.push([ha - w, ha + w]);
  }
  cuts.sort((u, v) => u[0] - v[0]);

  const pieces = [];
  let at = a0;
  for (const [c0, c1] of cuts) {
    if (c0 - at >= min) pieces.push([at, Math.min(c0, a1)]);
    at = Math.max(at, c1);
  }
  if (a1 - at >= min) pieces.push([at, a1]);
  return pieces.map(([s, e]) => (alongX
    ? { ...spec, x0: s, x1: e }
    : { ...spec, z0: s, z1: e }));
}

/** Is this point inside one of the pieces `wallRuns` handed back? */
export function inRuns(runs, x, z) {
  return runs.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
}

/* ============================================================
   THE SMALL PIECES
   ============================================================ */

/** A solid box of furniture. Geometry plus a collider. */
export function block(b, spec) {
  b.prop({
    x0: spec.x0, y0: BASE + spec.y0, z0: spec.z0,
    x1: spec.x1, y1: BASE + spec.y1, z1: spec.z1,
    material: spec.material,
    /* Every collider the fit-out puts on the floor is tagged so it can
       be told apart from the building. tools/terminal.mjs uses that to
       say whether a blocked doorway is the furniture's fault or the
       architecture's, which is the difference between moving a bench
       and having an argument about a wall. */
    tag: `fitout.${spec.tag || 'furniture'}`,
    /* Furniture is NOT walkable by default. A counter you can stand on
       is a counter you can see over the top of the building from. */
    walkable: spec.walkable === true,
    solid: spec.solid,
    faces: spec.faces,
  });
}

/** Four legs and a top. A table, a bench frame, a desk on a plinth. */
export function legs(b, x0, z0, x1, z1, y0, y1, m) {
  const t = inch(1.6);
  for (const [lx, lz] of [[x0, z0], [x1 - t, z0], [x0, z1 - t], [x1 - t, z1 - t]]) {
    trimBox(b, lx, y0, lz, lx + t, y1, lz + t, m);
  }
}

/**
 * A public counter: a plinth, a front panel, a worktop with a nosing,
 * and a raised transaction shelf on the customer side.
 *
 * @param spec { x0, x1, z0, z1, face: 'south'|'north'|'east'|'west' }
 */
export function counter(b, spec) {
  const M = b.M;
  const H = spec.height || ftin(3, 4);
  const SHELF = spec.shelfHeight || ftin(3, 10);
  const alongX = spec.face === 'south' || spec.face === 'north';
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;

  /* the body: solid, because a counter is something you walk around */
  block(b, {
    x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1,
    y0: 0, y1: H, material: M.counterFront, tag: 'counter',
  });
  /* the top, with a nosing over the customer side */
  const ox = alongX ? 0 : out * inch(2);
  const oz = alongX ? out * inch(2) : 0;
  trimBox(b, spec.x0 - inch(1) + Math.min(0, ox), H, spec.z0 - inch(1) + Math.min(0, oz),
    spec.x1 + inch(1) + Math.max(0, ox), H + inch(2), spec.z1 + inch(1) + Math.max(0, oz),
    M.formica);
  /* and the raised shelf the customer puts a bag on, on a pair of posts */
  const sx0 = alongX ? spec.x0 + ftin(1, 0) : spec.x0 + (out > 0 ? inch(2) : -inch(9));
  const sx1 = alongX ? spec.x1 - ftin(1, 0) : spec.x1 + (out > 0 ? inch(9) : -inch(2));
  const sz0 = alongX ? spec.z0 + (out > 0 ? inch(2) : -inch(9)) : spec.z0 + ftin(1, 0);
  const sz1 = alongX ? spec.z1 + (out > 0 ? inch(9) : -inch(2)) : spec.z1 - ftin(1, 0);
  trimBox(b, sx0, SHELF, sz0, sx1, SHELF + inch(1.5), sz1, M.formica);
}

/**
 * Where the places on a bench are, for somebody to sit in.
 *
 * The level knows where the seats are because the level put them
 * there. A passenger looking for somewhere to sit asks the level, not
 * the geometry, and that is what stops the npc code from containing a
 * copy of these numbers.
 */
export function benchSeats(spec) {
  const alongX = spec.axis !== 'z';
  const n = spec.seats || 4;
  const SEAT = ftin(1, 5);
  const half = (n * SEAT) / 2;
  /* Facing away from the back rail, or along the run if there is none. */
  const yaw = spec.back === 'far' ? (alongX ? 0 : -Math.PI / 2)
    : (alongX ? Math.PI : Math.PI / 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = -half + (i + 0.5) * SEAT;
    out.push({
      x: spec.x + (alongX ? a : 0),
      z: spec.z + (alongX ? 0 : a),
      yaw,
    });
  }
  return out;
}

/** A run of terminal seating: a steel frame with vinyl pans on it. */
export function bench(b, spec) {
  const M = b.M;
  const alongX = spec.axis !== 'z';
  const n = spec.seats || 4;
  const SEAT = ftin(1, 5);
  const W = ftin(1, 8);            // seat width across the run
  const len = n * SEAT;
  const half = len / 2;
  const put = (a0, a1, y0, y1, w0, w1, m) => {
    const x0 = alongX ? spec.x + a0 : spec.x + w0;
    const x1 = alongX ? spec.x + a1 : spec.x + w1;
    const z0 = alongX ? spec.z + w0 : spec.z + a0;
    const z1 = alongX ? spec.z + w1 : spec.z + a1;
    if (m) trimBox(b, x0, y0, z0, x1, y1, z1, m);
    else block(b, { x0, x1, z0, z1, y0, y1, material: M.benchVinyl, tag: 'bench' });
  };
  /* The frame: two end standards and a rail between them. The rail
     stops INSIDE the standards -- it is bolted to their inner faces,
     not flush with their outer ones. A rail flush with the standard is
     two drawn faces on one plane, which is a flickering bench. */
  for (const a of [-half, half - inch(2)]) {
    put(a, a + inch(2), 0, SEAT, -W / 2, W / 2, M.chrome);
  }
  put(-half + inch(2), half - inch(2), ftin(1, 1), ftin(1, 3),
    -W / 2 + inch(0.2), -W / 2 + inch(2), M.chrome);
  // the seat pans, one per place, with a gap between them
  for (let i = 0; i < n; i++) {
    const a = -half + i * SEAT;
    put(a + inch(1), a + SEAT - inch(1), SEAT - inch(2), SEAT, -W / 2, W / 2, null);
  }
  // and a low back, if this is a back-to-wall run
  if (spec.back) {
    const w = spec.back === 'far' ? W / 2 : -W / 2;
    put(-half, half, SEAT, SEAT + ftin(1, 2), w - inch(2), w, M.benchVinyl);
  }
}

/** Steel shelving: uprights and four shelves. Stores and baggage rooms. */
export function shelving(b, spec) {
  const M = b.M;
  const H = spec.height || ftin(6, 6);
  const shelves = spec.shelves || 4;
  block(b, {
    x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1,
    y0: 0, y1: H, material: M.officeSteel, tag: 'shelving',
    /* The back is against a wall and the underside is on the floor. */
    faces: spec.faces,
  });
  for (let i = 1; i < shelves; i++) {
    const y = (H / shelves) * i;
    trimBox(b, spec.x0 - inch(1), y, spec.z0 - inch(1),
      spec.x1 + inch(1), y + inch(1), spec.z1 + inch(1), M.chrome);
  }
}

/** A bank of lockers, or a run of filing cabinets. */
export function lockers(b, spec) {
  const M = b.M;
  const H = spec.height || ftin(6, 0);
  const alongX = spec.axis !== 'z';
  const n = spec.doors || 4;
  block(b, {
    x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1,
    y0: 0, y1: H, material: M.officeSteel, tag: 'lockers',
  });
  const len = alongX ? spec.x1 - spec.x0 : spec.z1 - spec.z0;
  const out = spec.face === 'south' || spec.face === 'west' ? -1 : 1;
  for (let i = 0; i < n; i++) {
    const a0 = (len / n) * i + inch(1), a1 = (len / n) * (i + 1) - inch(1);
    const d = out > 0 ? (alongX ? spec.z1 : spec.x1) : (alongX ? spec.z0 : spec.x0);
    const p = d + out * inch(0.7);
    const x0 = alongX ? spec.x0 + a0 : Math.min(d, p);
    const x1 = alongX ? spec.x0 + a1 : Math.max(d, p);
    const z0 = alongX ? Math.min(d, p) : spec.z0 + a0;
    const z1 = alongX ? Math.max(d, p) : spec.z0 + a1;
    trimBox(b, x0, inch(3), z0, x1, H - inch(3), z1, M.chrome);
  }
}

/** A desk with a return, a chair pushed under it, and a pedestal. */
export function desk(b, spec) {
  const M = b.M;
  const H = ftin(2, 5);
  block(b, {
    x0: spec.x0, x1: spec.x1, z0: spec.z0, z1: spec.z1,
    y0: 0, y1: H, material: M.deskOak, tag: 'desk',
  });
  trimBox(b, spec.x0 - inch(1), H, spec.z0 - inch(1),
    spec.x1 + inch(1), H + inch(1.5), spec.z1 + inch(1), M.deskOak);
  if (spec.chair) {
    const cx = spec.chair[0], cz = spec.chair[1];
    block(b, {
      x0: cx - ftin(0, 9), x1: cx + ftin(0, 9), z0: cz - ftin(0, 9), z1: cz + ftin(0, 9),
      y0: ftin(1, 3), y1: ftin(1, 5), material: M.benchVinyl, tag: 'chair',
    });
    trimBox(b, cx - inch(1.5), 0, cz - inch(1.5), cx + inch(1.5), ftin(1, 3), cz + inch(1.5), M.chrome);
    trimBox(b, cx - ftin(0, 9), ftin(1, 5), cz + inch(5), cx + ftin(0, 9), ftin(2, 8), cz + inch(7),
      M.benchVinyl);
  }
}

/** A sign screwed to a wall, or hung on two rods from a ceiling. */
export function sign(b, spec) {
  const M = b.M;
  const m = spec.material || M.signBlue;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const w = spec.w || ftin(3, 0), h = spec.h || ftin(0, 10);
  const d = inch(1.2);
  const x0 = alongX ? spec.x - w / 2 : spec.x + Math.min(0, out * d);
  const x1 = alongX ? spec.x + w / 2 : spec.x + Math.max(0, out * d);
  const z0 = alongX ? spec.z + Math.min(0, out * d) : spec.z - w / 2;
  const z1 = alongX ? spec.z + Math.max(0, out * d) : spec.z + w / 2;
  trimBox(b, x0, spec.y - h / 2, z0, x1, spec.y + h / 2, z1, m);
  if (spec.hangFrom) {
    for (const s of [-1, 1]) {
      const hx = alongX ? spec.x + s * (w / 2 - inch(3)) : (x0 + x1) / 2;
      const hz = alongX ? (z0 + z1) / 2 : spec.z + s * (w / 2 - inch(3));
      trimBox(b, hx - inch(0.5), spec.y + h / 2, hz - inch(0.5),
        hx + inch(0.5), spec.hangFrom, hz + inch(0.5), M.chrome);
    }
  }
}

/** A departure board: a black slotted panel in a painted frame. */
export function board(b, spec) {
  const M = b.M;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const w = spec.w || ftin(6, 0), h = spec.h || ftin(3, 6);
  const put = (d0, d1, ww, y0, y1, m) => {
    const x0 = alongX ? spec.x - ww / 2 : spec.x + Math.min(out * d0, out * d1);
    const x1 = alongX ? spec.x + ww / 2 : spec.x + Math.max(out * d0, out * d1);
    const z0 = alongX ? spec.z + Math.min(out * d0, out * d1) : spec.z - ww / 2;
    const z1 = alongX ? spec.z + Math.max(out * d0, out * d1) : spec.z + ww / 2;
    trimBox(b, x0, y0, z0, x1, y1, z1, m);
  };
  /* The frame is an inch deeper than the panel in it, so the panel sits
     back inside the surround rather than sharing its front plane. A
     departure board is a picture frame with slots in it. An inch and
     not a fraction: the invariant that catches shared planes works to
     half an inch, because a plane half an inch away from another one is
     a plane the depth buffer cannot separate either. */
  put(0, inch(4), w, spec.y - h / 2, spec.y + h / 2, M.signBlue);
  put(inch(2), inch(3), w - inch(6), spec.y - h / 2 + inch(3), spec.y + h / 2 - inch(3),
    M.boardBlack);
}

/** A vending machine. Solid, and a powered device the level wires up. */
export function vending(b, spec) {
  const M = b.M;
  const W = ftin(2, 6), D = ftin(2, 2), H = ftin(5, 10);
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const x0 = alongX ? spec.x - W / 2 : spec.x + Math.min(0, out * D);
  const x1 = alongX ? spec.x + W / 2 : spec.x + Math.max(0, out * D);
  const z0 = alongX ? spec.z + Math.min(0, out * D) : spec.z - W / 2;
  const z1 = alongX ? spec.z + Math.max(0, out * D) : spec.z + W / 2;
  const front = {};
  front[alongX ? (out > 0 ? 'pz' : 'nz') : (out > 0 ? 'px' : 'nx')] =
    { tex: M.vendingFront.tex, density: M.vendingFront.density };
  block(b, {
    x0, x1, z0, z1, y0: 0, y1: H, material: M.officeSteel, tag: 'vending',
    faces: front,
  });
  return { x0, x1, z0, z1, y1: H };
}

/** A wheeled baggage cart: a deck, four castors, and a push handle. */
export function cart(b, spec) {
  const M = b.M;
  const W = spec.w || ftin(2, 6), L = spec.len || ftin(5, 0);
  const alongX = spec.axis !== 'z';
  const hx = alongX ? L / 2 : W / 2;
  const hz = alongX ? W / 2 : L / 2;
  block(b, {
    x0: spec.x - hx, x1: spec.x + hx, z0: spec.z - hz, z1: spec.z + hz,
    y0: ftin(0, 9), y1: ftin(1, 2), material: M.officeSteel, tag: 'cart',
  });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const cx = spec.x + sx * (hx - inch(4)), cz = spec.z + sz * (hz - inch(4));
      trimBox(b, cx - inch(1.5), 0, cz - inch(1.5), cx + inch(1.5), ftin(0, 9), cz + inch(1.5),
        M.tire);
    }
  }
  const a = alongX ? spec.x + hx - inch(2) : spec.x;
  const c = alongX ? spec.z : spec.z + hz - inch(2);
  trimBox(b, alongX ? a : a - W / 2, ftin(1, 2), alongX ? c - W / 2 : c,
    alongX ? a + inch(2) : a + W / 2, ftin(3, 0), alongX ? c + W / 2 : c + inch(2), M.chrome);
}

/** A checked bag, sitting where it was put. Three tones, by id. */
export function luggage(b, spec) {
  const M = b.M;
  const tone = [M.bagBrown, M.bagNavy, M.bagTan][(spec.tone || 0) % 3];
  const W = spec.w || ftin(1, 10), D = spec.d || ftin(0, 9), H = spec.h || ftin(1, 3);
  const yaw = spec.yaw || 0;
  const alongX = Math.abs(Math.cos(yaw)) > 0.5;
  const hx = (alongX ? W : D) / 2, hz = (alongX ? D : W) / 2;
  const y = spec.y || 0;
  block(b, {
    x0: spec.x - hx, x1: spec.x + hx, z0: spec.z - hz, z1: spec.z + hz,
    y0: y, y1: y + H, material: tone, tag: 'bag',
  });
  trimBox(b, spec.x - hx * 0.3, y + H, spec.z - hz * 0.3,
    spec.x + hx * 0.3, y + H + inch(1.5), spec.z + hz * 0.3, M.chrome);
}

/** A platform scale: a low deck with a dial head on a post. */
export function scale(b, spec) {
  const M = b.M;
  const W = ftin(2, 2);
  block(b, {
    x0: spec.x - W / 2, x1: spec.x + W / 2, z0: spec.z - W / 2, z1: spec.z + W / 2,
    y0: 0, y1: ftin(0, 5), material: M.officeSteel, tag: 'scale', walkable: true,
  });
  trimBox(b, spec.x - W / 2 + inch(1), ftin(0, 5), spec.z - W / 2 + inch(1),
    spec.x + W / 2 - inch(1), ftin(0, 6), spec.z + W / 2 - inch(1), M.chrome);
  const px = spec.x + (spec.dial === 'east' ? W / 2 - inch(2) : -W / 2 + inch(2));
  trimBox(b, px - inch(1), ftin(0, 6), spec.z - inch(1), px + inch(1), ftin(3, 2), spec.z + inch(1),
    M.chrome);
  trimBox(b, px - inch(5), ftin(3, 2), spec.z - inch(2), px + inch(5), ftin(3, 10), spec.z + inch(2),
    M.officeSteel);
  trimBox(b, px - inch(4), ftin(3, 4), spec.z - inch(2.6), px + inch(4), ftin(3, 8), spec.z - inch(2),
    M.paper);
}

/** A desk telephone, the 1998 kind: a base and a handset across it. */
export function phone(b, spec) {
  const M = b.M;
  trimBox(b, spec.x - inch(4), spec.y, spec.z - inch(3),
    spec.x + inch(4), spec.y + inch(2), spec.z + inch(3), M.officeSteel);
  trimBox(b, spec.x - inch(4.5), spec.y + inch(2), spec.z - inch(1.5),
    spec.x + inch(4.5), spec.y + inch(4), spec.z + inch(1.5), M.officeSteel);
}

/** A CRT on a stand: a box with a dark face. */
export function crt(b, spec) {
  const M = b.M;
  const W = spec.w || ftin(1, 2), H = spec.h || ftin(1, 1);
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const D = ftin(1, 3);
  const x0 = alongX ? spec.x - W / 2 : spec.x + Math.min(0, out * D);
  const x1 = alongX ? spec.x + W / 2 : spec.x + Math.max(0, out * D);
  const z0 = alongX ? spec.z + Math.min(0, out * D) : spec.z - W / 2;
  const z1 = alongX ? spec.z + Math.max(0, out * D) : spec.z + W / 2;
  trimBox(b, x0, spec.y, z0, x1, spec.y + H, z1, M.officeSteel);
  const f = out > 0 ? (alongX ? z1 : x1) : (alongX ? z0 : x0);
  const g = f + out * inch(0.8);
  trimBox(b,
    alongX ? x0 + inch(1.5) : Math.min(f, g), spec.y + inch(1.5),
    alongX ? Math.min(f, g) : z0 + inch(1.5),
    alongX ? x1 - inch(1.5) : Math.max(f, g), spec.y + H - inch(1.5),
    alongX ? Math.max(f, g) : z1 - inch(1.5), M.crtGlass);
}

/** A stack of paper on a surface: manifests, timetables, forms. */
export function papers(b, spec) {
  const M = b.M;
  const w = spec.w || ftin(0, 9), d = spec.d || ftin(1, 0);
  trimBox(b, spec.x - w / 2, spec.y, spec.z - d / 2,
    spec.x + w / 2, spec.y + (spec.h || inch(2)), spec.z + d / 2, spec.material || M.paper);
}

/** A trash receptacle: a steel drum with a domed lid missing. */
export function trash(b, spec) {
  const M = b.M;
  const r = ftin(0, 8);
  block(b, {
    x0: spec.x - r, x1: spec.x + r, z0: spec.z - r, z1: spec.z + r,
    y0: 0, y1: ftin(2, 8), material: M.officeSteel, tag: 'trash',
  });
  trimBox(b, spec.x - r - inch(1), ftin(2, 8), spec.z - r - inch(1),
    spec.x + r + inch(1), ftin(2, 10), spec.z + r + inch(1), M.chrome);
}

/** A free-standing brochure or timetable rack. */
export function rack(b, spec) {
  const M = b.M;
  const W = ftin(1, 6);
  block(b, {
    x0: spec.x - W / 2, x1: spec.x + W / 2, z0: spec.z - inch(5), z1: spec.z + inch(5),
    y0: 0, y1: ftin(4, 6), material: M.officeSteel, tag: 'rack',
  });
  for (let i = 0; i < 4; i++) {
    const y = ftin(1, 6) + i * ftin(0, 9);
    trimBox(b, spec.x - W / 2 + inch(1), y, spec.z - inch(6),
      spec.x + W / 2 - inch(1), y + inch(1), spec.z + inch(2), M.chrome);
    papers(b, { x: spec.x, y: y + inch(1), z: spec.z - inch(3), w: W - inch(4), d: inch(5), h: inch(3) });
  }
}

/** A rope-and-post waiting line, as posts and a low rail. */
export function stanchions(b, spec) {
  const M = b.M;
  const n = spec.posts || 3;
  const alongX = spec.axis !== 'z';
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const x = alongX ? spec.from + (spec.to - spec.from) * t : spec.x;
    const z = alongX ? spec.z : spec.from + (spec.to - spec.from) * t;
    trimBox(b, x - inch(2), 0, z - inch(2), x + inch(2), inch(2), z + inch(2), M.chrome);
    trimBox(b, x - inch(1), inch(2), z - inch(1), x + inch(1), ftin(3, 0), z + inch(1), M.chrome);
    if (i < n - 1) {
      const t2 = (i + 1) / (n - 1);
      const x2 = alongX ? spec.from + (spec.to - spec.from) * t2 : spec.x;
      const z2 = alongX ? spec.z : spec.from + (spec.to - spec.from) * t2;
      trimBox(b, Math.min(x, x2) - inch(0.6), ftin(2, 6), Math.min(z, z2) - inch(0.6),
        Math.max(x, x2) + inch(0.6), ftin(2, 8), Math.max(z, z2) + inch(0.6), M.benchVinyl);
    }
  }
}

/** A run of surface conduit with a box on it, for the retrofit look. */
export { conduitRun, surfaceBox } from '../fittings.js';

/** An entrance mat. Flat, walkable, and it stops a doorway reading bare. */
export function mat_(b, spec) {
  const M = b.M;
  trimBox(b, spec.x0, inch(0.4), spec.z0, spec.x1, inch(0.8), spec.z1, M.rubberMat);
  void ft;
}
export { mat_ as floorMat };
