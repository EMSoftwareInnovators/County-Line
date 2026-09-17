/* ============================================================
   parts.js -- the pieces the Old Academy is assembled from.

   Stage 1's prefabs.js knows about walls, stairs, railings and glazing in
   general. These are the handful of things THIS building needs that a
   generic prefab library has no business knowing about: a crenellated
   parapet, a drip mold, a string course, a chair rail, a cast-iron
   colonnade.

   Everything here is geometry only unless it says otherwise. TRIM IS
   NEVER SOLID. A baseboard you can catch on is a baseboard that makes a
   room feel broken, and the structural collision is already provided by
   the wall the trim is stuck to.
   ============================================================ */
import { F_DOUBLE } from '../../../engine/raster.js';
import { ftin, inch } from '../../../engine/units.js';

/** Emit decorative geometry at a coarse subdivision. Trim is small, flat
    and everywhere; subdividing it at wall detail is how a building ends
    up spending half its triangles on skirting. */
function coarse(b, fn) {
  const was = b.mb.maxEdge;
  b.mb.maxEdge = 6;
  fn();
  b.mb.maxEdge = was;
}

/** A box with no collision. The workhorse for everything below. */
export function trimBox(b, x0, y0, z0, x1, y1, z1, m) {
  coarse(b, () => {
    b.mb.box(x0, y0, z0, x1, y1, z1, { all: { tex: m.tex, density: m.density } });
  });
}

/* ============================================================
   THE PARAPET

   The single most recognisable thing about this building. Goodrich's
   1856-57 remodelling put a crenellated parapet round the whole of it,
   and without that silhouette the reconstruction is just a big box.

   A run is a base parapet wall with merlons standing proud of it at a
   regular rhythm. The rhythm is set by MERLON and CRENEL and is walked
   from the start of the run, with the remainder split evenly at both ends
   so a wall never finishes on half a merlon.
   ============================================================ */

/**
 * @param spec {
 *   x0, z0, x1, z1,   the run, along X or along Z
 *   base,             top of the wall below (parapet springs from here)
 *   capTop,           top of the plain parapet
 *   merlonTop,        top of the merlons
 *   thickness,
 *   material, capMaterial,
 *   merlon, crenel,   widths
 *   solid,            true to give the parapet collision (roof edges)
 * }
 */
export function crenellate(b, spec) {
  const alongX = Math.abs(spec.x1 - spec.x0) > 1e-6;
  const len = alongX ? spec.x1 - spec.x0 : spec.z1 - spec.z0;
  if (len <= 0) return;
  const t = spec.thickness;
  const half = t / 2;
  const m = spec.material;
  const cap = spec.capMaterial || m;

  const box = (a0, a1, y0, y1, mat) => {
    const bx0 = alongX ? spec.x0 + a0 : spec.x0 - half;
    const bx1 = alongX ? spec.x0 + a1 : spec.x0 + half;
    const bz0 = alongX ? spec.z0 - half : spec.z0 + a0;
    const bz1 = alongX ? spec.z0 + half : spec.z0 + a1;
    b.mb.box(bx0, y0, bz0, bx1, y1, bz1, { all: { tex: mat.tex, density: mat.density } });
    return { bx0, bx1, bz0, bz1 };
  };

  // the plain parapet wall the merlons sit on
  const wall = box(0, len, spec.base, spec.capTop, m);
  if (spec.solid !== false && b.col) {
    b.col.addSolid({
      x0: wall.bx0, x1: wall.bx1, z0: wall.bz0, z1: wall.bz1,
      y0: spec.base, y1: spec.merlonTop,
      tag: 'parapet', walkable: false, noOcclude: true,
    });
  }

  /* Walk the rhythm. The leftover is split between the two ends, which is
     what keeps the corners reading as solid piers rather than as a merlon
     sliced in half by the next elevation. */
  const pitch = spec.merlon + spec.crenel;
  const n = Math.max(1, Math.floor((len + spec.crenel) / pitch));
  const used = n * pitch - spec.crenel;
  let a = (len - used) / 2;
  for (let i = 0; i < n; i++) {
    box(a, a + spec.merlon, spec.capTop - inch(2), spec.merlonTop, cap);
    a += pitch;
  }
}

/* ============================================================
   MOULDINGS
   ============================================================ */

/** A projecting horizontal band: string course, cornice, water table. */
export function stringCourse(b, spec) {
  const p = spec.project === undefined ? inch(3) : spec.project;
  trimBox(b, spec.x0 - p, spec.y, spec.z0 - p, spec.x1 + p, spec.y + spec.height, spec.z1 + p,
    spec.material);
}

/**
 * A drip mold (label mold) over an opening: the shallow hood that keeps
 * rain off the head of a Tudor-Gothic window. Two short returns and a
 * lintel band, which is as much as this resolution will carry and enough
 * to make the elevation read correctly.
 *
 * @param face  'south' | 'north' | 'west' | 'east' -- which way the wall looks
 */
export function dripMold(b, spec) {
  const m = spec.material;
  /* Shallow on purpose. A label mold that stands four inches proud with a
     six-inch band catches the sky term on its top face and reads as a
     bright slab stuck to the wall rather than as a hood cut in it -- the
     first pass did exactly that. Two and a half inches of projection is
     what the elevation photographs show, and it is enough for the shadow
     line to do the work. */
  const p = inch(2.5);               // projection from the wall face
  const d = inch(4.5);               // depth of the band
  const w = spec.width + inch(11);   // overhang past the reveal
  const y = spec.head;
  const ear = inch(7);               // how far the returns drop

  if (spec.face === 'south' || spec.face === 'north') {
    const zf = spec.face === 'south' ? spec.z - p : spec.z + p;
    const z0 = Math.min(spec.z, zf), z1 = Math.max(spec.z, zf);
    trimBox(b, spec.x - w / 2, y, z0, spec.x + w / 2, y + d, z1, m);
    for (const s of [-1, 1]) {
      const ex = spec.x + s * (spec.width / 2 + inch(5));
      trimBox(b, ex - inch(2.5), y - ear, z0, ex + inch(2.5), y, z1, m);
    }
  } else {
    const xf = spec.face === 'west' ? spec.x - p : spec.x + p;
    const x0 = Math.min(spec.x, xf), x1 = Math.max(spec.x, xf);
    trimBox(b, x0, y, spec.z - w / 2, x1, y + d, spec.z + w / 2, m);
    for (const s of [-1, 1]) {
      const ez = spec.z + s * (spec.width / 2 + inch(5));
      trimBox(b, x0, y - ear, ez - inch(2.5), x1, y, ez + inch(2.5), m);
    }
  }
}

/* ============================================================
   INTERIOR JOINERY

   Baseboard and chair rail round the inside of a room. The real interiors
   have both, substantially scaled, and together they do more than any
   texture to say "this is an 1850s institutional room" at 320x240.
   ============================================================ */

const BASE_H = ftin(1, 2);
const RAIL_Y = ftin(2, 10);
const RAIL_H = inch(5);

/**
 * @param r { x0, x1, z0, z1, y }  the room's clear rectangle and its floor
 * @param opt { rail: false to omit the chair rail, skip: ['north', ...] }
 */
export function chairRail(b, r, m, opt = {}) {
  const p = inch(1.5);
  const skip = new Set(opt.skip || []);
  const run = (y, h) => {
    if (!skip.has('south')) trimBox(b, r.x0, r.y + y, r.z0, r.x1, r.y + y + h, r.z0 + p, m);
    if (!skip.has('north')) trimBox(b, r.x0, r.y + y, r.z1 - p, r.x1, r.y + y + h, r.z1, m);
    if (!skip.has('west')) trimBox(b, r.x0, r.y + y, r.z0, r.x0 + p, r.y + y + h, r.z1, m);
    if (!skip.has('east')) trimBox(b, r.x1 - p, r.y + y, r.z0, r.x1, r.y + y + h, r.z1, m);
  };
  run(0, BASE_H);
  if (opt.rail !== false) run(RAIL_Y, RAIL_H);
}

/** Cased architrave round a door opening, on one face of a wall. */
export function doorCasing(b, spec) {
  const m = spec.material;
  const t = inch(5);                 // width of the architrave
  const p = inch(1.5);               // projection
  const alongX = spec.face === 'south' || spec.face === 'north';
  const y1 = spec.y + spec.height + t;
  if (alongX) {
    const z0 = spec.face === 'south' ? spec.z - p : spec.z;
    const z1 = spec.face === 'south' ? spec.z : spec.z + p;
    trimBox(b, spec.x - spec.width / 2 - t, spec.y, z0, spec.x - spec.width / 2, y1, z1, m);
    trimBox(b, spec.x + spec.width / 2, spec.y, z0, spec.x + spec.width / 2 + t, y1, z1, m);
    trimBox(b, spec.x - spec.width / 2 - t, spec.y + spec.height, z0,
      spec.x + spec.width / 2 + t, y1, z1, m);
  } else {
    const x0 = spec.face === 'west' ? spec.x - p : spec.x;
    const x1 = spec.face === 'west' ? spec.x : spec.x + p;
    trimBox(b, x0, spec.y, spec.z - spec.width / 2 - t, x1, y1, spec.z - spec.width / 2, m);
    trimBox(b, x0, spec.y, spec.z + spec.width / 2, x1, y1, spec.z + spec.width / 2 + t, m);
    trimBox(b, x0, spec.y + spec.height, spec.z - spec.width / 2 - t, x1, y1,
      spec.z + spec.width / 2 + t, m);
  }
}

/* ============================================================
   THE COLONNADE

   Goodrich's cast-iron colonnade across the recessed center of the front.
   Slender columns on a plinth, a molded cap, and a light rail between
   them at gallery level. Slender is the point: a heavy masonry order in
   this position would read as a courthouse, not as this building.
   ============================================================ */

export function colonnade(b, spec) {
  const m = spec.material;
  const n = spec.count;
  const r = inch(3.5);
  for (let i = 0; i < n; i++) {
    const x = spec.x0 + (spec.x1 - spec.x0) * (i / (n - 1));
    // plinth
    trimBox(b, x - r * 1.9, spec.y, spec.z - r * 1.9, x + r * 1.9, spec.y + inch(10),
      spec.z + r * 1.9, spec.plinthMaterial || m);
    // shaft
    trimBox(b, x - r, spec.y + inch(10), spec.z - r, x + r, spec.top - inch(8), spec.z + r, m);
    // cap
    trimBox(b, x - r * 1.7, spec.top - inch(8), spec.z - r * 1.7, x + r * 1.7, spec.top,
      spec.z + r * 1.7, m);
    /* A column is a thing you can walk into. Slim collision, so the porch
       does not become an obstacle course. */
    if (b.col && spec.solid !== false) {
      b.col.addSolid({
        x0: x - r * 1.3, x1: x + r * 1.3, z0: spec.z - r * 1.3, z1: spec.z + r * 1.3,
        y0: spec.y, y1: spec.top, tag: 'column', walkable: false, noOcclude: true,
      });
    }
  }
  // the entablature the columns carry
  trimBox(b, spec.x0 - r * 2, spec.top, spec.z - inch(7), spec.x1 + r * 2,
    spec.top + inch(11), spec.z + inch(7), m);
}

/** A light railing between colonnade columns, for the upper gallery. */
export function ironRail(b, spec) {
  const m = spec.material;
  const h = spec.height === undefined ? ftin(3, 2) : spec.height;
  const alongX = Math.abs(spec.x1 - spec.x0) > 1e-6;
  const len = alongX ? spec.x1 - spec.x0 : spec.z1 - spec.z0;
  const n = Math.max(2, Math.round(len / ftin(0, 7)));
  const r = inch(0.9);
  coarse(b, () => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = alongX ? spec.x0 + (spec.x1 - spec.x0) * t : spec.x0;
      const z = alongX ? spec.z0 : spec.z0 + (spec.z1 - spec.z0) * t;
      b.mb.box(x - r, spec.y, z - r, x + r, spec.y + h, z + r,
        { all: { tex: m.tex, density: m.density } });
    }
    const rr = inch(2);
    b.mb.box(Math.min(spec.x0, spec.x1) - rr, spec.y + h, Math.min(spec.z0, spec.z1) - rr,
      Math.max(spec.x0, spec.x1) + rr, spec.y + h + inch(3), Math.max(spec.z0, spec.z1) + rr,
      { all: { tex: m.tex, density: m.density } });
    b.mb.box(Math.min(spec.x0, spec.x1) - rr, spec.y + h * 0.45, Math.min(spec.z0, spec.z1) - rr,
      Math.max(spec.x0, spec.x1) + rr, spec.y + h * 0.45 + inch(2), Math.max(spec.z0, spec.z1) + rr,
      { all: { tex: m.tex, density: m.density } });
  });
  if (b.col && spec.solid !== false) {
    const pad = inch(3);
    b.col.addSolid({
      x0: Math.min(spec.x0, spec.x1) - pad, x1: Math.max(spec.x0, spec.x1) + pad,
      z0: Math.min(spec.z0, spec.z1) - pad, z1: Math.max(spec.z0, spec.z1) + pad,
      y0: spec.y, y1: spec.y + h,
      tag: 'railing', walkable: false, noOcclude: true,
    });
  }
}

/** A flight of exterior steps, geometry plus a walkable ramp. */
export function steps(b, spec) {
  const m = spec.material;
  const n = spec.count;
  const rise = (spec.top - spec.bottom) / n;
  const run = spec.run;
  const alongZ = spec.axis === 'z';
  for (let i = 0; i < n; i++) {
    const y = spec.bottom + (i + 1) * rise;
    const a0 = i * run, a1 = (i + 1) * run + (i === n - 1 ? 0 : 0);
    const x0 = alongZ ? spec.x0 : spec.x0 + a0 * spec.dir;
    const x1 = alongZ ? spec.x1 : spec.x0 + a1 * spec.dir;
    const z0 = alongZ ? spec.z0 + a0 * spec.dir : spec.z0;
    const z1 = alongZ ? spec.z0 + a1 * spec.dir : spec.z1;
    b.mb.box(Math.min(x0, x1), y - rise * 1.4, Math.min(z0, z1),
      Math.max(x0, x1), y, Math.max(z0, z1), { all: { tex: m.tex, density: m.density } });
  }
  const span = n * run;
  const rx0 = alongZ ? spec.x0 : Math.min(spec.x0, spec.x0 + span * spec.dir);
  const rx1 = alongZ ? spec.x1 : Math.max(spec.x0, spec.x0 + span * spec.dir);
  const rz0 = alongZ ? Math.min(spec.z0, spec.z0 + span * spec.dir) : spec.z0;
  const rz1 = alongZ ? Math.max(spec.z0, spec.z0 + span * spec.dir) : spec.z1;
  const up = spec.dir > 0;
  b.col.addRamp({
    x0: rx0, x1: rx1, z0: rz0, z1: rz1,
    axis: alongZ ? 'z' : 'x',
    yLow: up ? spec.bottom : spec.top,
    yHigh: up ? spec.top : spec.bottom,
    tag: spec.tag || 'steps',
    material: 'stone',
  });
}

export { F_DOUBLE };
