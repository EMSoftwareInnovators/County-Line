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

/**
 * A box with no collision. The workhorse for everything below.
 *
 * `faces` overrides individual sides -- `{ ny: null }` for something
 * bedded in the ground, whose underside is not a surface.
 */
export function trimBox(b, x0, y0, z0, x1, y1, z1, m, faces) {
  coarse(b, () => {
    b.mb.box(x0, y0, z0, x1, y1, z1,
      { all: { tex: m.tex, density: m.density }, ...faces });
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

  const box = (a0, a1, y0, y1, mat, faces) => {
    const bx0 = alongX ? spec.x0 + a0 : spec.x0 - half;
    const bx1 = alongX ? spec.x0 + a1 : spec.x0 + half;
    const bz0 = alongX ? spec.z0 - half : spec.z0 + a0;
    const bz1 = alongX ? spec.z0 + half : spec.z0 + a1;
    b.mb.box(bx0, y0, bz0, bx1, y1, bz1,
      { all: { tex: mat.tex, density: mat.density }, ...faces });
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
    /* A MERLON STANDS ON THE CAP, IT IS NOT SUNK INTO IT. This used to
       start two inches below `capTop`, so every merlon in the building
       shared both of its long faces with the wall it sat on over a
       two-inch band -- a hundred and thirty-two fighting pairs along the
       roofline on their own. It now begins exactly where the cap stops,
       and its underside is left undrawn because the cap is already
       there: two coplanar faces back to back at the same depth fight
       just as hard as two overlapping ones, and nobody can see either. */
    box(a, a + spec.merlon, spec.capTop, spec.merlonTop, cap, { ny: null });
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


/* ============================================================
   STAGE 2.1 -- THE PIECES THE PHOTOGRAPHS ASKED FOR
   ============================================================ */

/**
 * An n-sided prism, tapering if the two radii differ. This is how every
 * round thing in the building is made: a column shaft, the discs of its
 * base, the rings of its capital.
 *
 * Eight sides. At 320x240 a column is a handful of pixels across and the
 * ninth side is not a thing anybody will ever see; what reads is the
 * silhouette and the light falling round it, and eight sides carry both.
 */
export function prism(b, spec) {
  const n = spec.sides || 8;
  const m = spec.material;
  const f = { tex: m.tex, density: m.density };
  const { x, z, y0, y1 } = spec;
  const r0 = spec.r0, r1 = spec.r1 === undefined ? spec.r0 : spec.r1;
  const mb = b.mb;
  const was = mb.maxEdge; mb.maxEdge = 6;
  const P = (i, r, y) => {
    const a = (i / n) * Math.PI * 2;
    return [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
  };
  /* Wound so the outside is the front. Going the other way round makes a
     column that is only visible from inside itself, which is a thing you
     discover by standing in a portico with no columns in it. */
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    mb.quad(P(j, r0, y0), P(i, r0, y0), P(i, r1, y1), P(j, r1, y1),
      f.tex, [0, 0, 16, 16], 0, [1, 1, false]);
  }
  if (spec.cap) {
    /* A flat disc closing the top, for the step of a base. Fanned from
       the center, which is n triangles drawn as n degenerate quads. */
    const c = [x, y1, z];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      mb.quad(c, P(j, r1, y1), P(i, r1, y1), c, f.tex, [0, 0, 16, 16], 0, [1, 1, false]);
    }
  }
  mb.maxEdge = was;
}

/**
 * A column: shaft, stepped base, molded capital.
 *
 * Two of these in the building and they are not the same thing. The
 * PORTICO columns outside are the tall painted ones in the front
 * photographs; the INTERIOR columns are the slender white posts standing
 * in the middle of the big first-floor room. Both are built here because
 * they are the same drawing at different sizes, and neither is a
 * classical order -- they are thin structural columns with just enough
 * profile to read as period joinery rather than as pipes.
 *
 * @param spec { x, z, y, top, dia, material, base, cap, collide }
 */
export function column(b, spec) {
  const m = spec.material;
  const r = spec.dia / 2;
  const baseH = spec.base === undefined ? spec.dia : spec.base;
  const capH = spec.cap === undefined ? spec.dia * 0.85 : spec.cap;
  const y = spec.y, top = spec.top;

  /* base: a square plinth, then two discs stepping in to the shaft */
  const pl = r * 1.55;
  trimBox(b, spec.x - pl, y, spec.z - pl, spec.x + pl, y + baseH * 0.38, spec.z + pl, m);
  prism(b, { x: spec.x, z: spec.z, y0: y + baseH * 0.38, y1: y + baseH * 0.72, r0: r * 1.38, r1: r * 1.30, material: m, cap: true });
  prism(b, { x: spec.x, z: spec.z, y0: y + baseH * 0.72, y1: y + baseH, r0: r * 1.22, r1: r * 1.04, material: m, cap: true });

  /* shaft: a whisper of entasis, because a dead-straight cylinder reads
     as scaffolding */
  prism(b, { x: spec.x, z: spec.z, y0: y + baseH, y1: top - capH, r0: r, r1: r * 0.93, material: m });

  /* capital: a necking ring, a flared echinus, a square abacus */
  prism(b, { x: spec.x, z: spec.z, y0: top - capH, y1: top - capH * 0.72, r0: r * 0.98, r1: r * 1.02, material: m, cap: true });
  prism(b, { x: spec.x, z: spec.z, y0: top - capH * 0.72, y1: top - capH * 0.26, r0: r * 1.02, r1: r * 1.34, material: m, cap: true });
  const ab = r * 1.46;
  trimBox(b, spec.x - ab, top - capH * 0.26, spec.z - ab, spec.x + ab, top, spec.z + ab, m);

  if (spec.collide !== false && b.col) {
    b.col.addSolid({
      x0: spec.x - r, x1: spec.x + r, z0: spec.z - r, z1: spec.z + r,
      y0: y, y1: top, tag: 'column', walkable: false, noOcclude: true,
    });
  }
}

/**
 * A multi-pane sash window in a thick wall.
 *
 * The opening is already cut through the masonry, so the REVEAL comes
 * free -- the end faces of the piers either side are the reveal, and
 * setting the glass back from the outer face is what makes it deep. What
 * is built here is the joinery: two stiles, the meeting rail between the
 * two sashes, an exterior sill, and the glazing itself, whose muntins are
 * in its texture at an architectural pitch.
 *
 * @param spec {
 *   axis: 'x' | 'z'   which way the wall runs
 *   line              the wall's center line
 *   at                the station along the wall
 *   width, sill, head
 *   thickness         of the wall
 *   face              'south' | 'north' | 'west' | 'east'
 *   reveal            how far back from the outer face the sash sits
 * }
 */
export function sashWindow(b, spec) {
  const M = b.M;
  const alongX = spec.axis === 'x';
  const half = spec.width / 2;
  const t = spec.thickness;
  const outward = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  /* the plane the sash sits in, measured from the wall center line */
  const back = outward * (t / 2 - spec.reveal);
  const sashT = inch(2.5);

  const cx = alongX ? spec.at : spec.line + back;
  const cz = alongX ? spec.line + back : spec.at;
  const nx = alongX ? 0 : 1, nz = alongX ? 1 : 0;   // across the wall

  const box = (a0, a1, y0, y1, d0, d1, m) => {
    const x0 = alongX ? cx + a0 : cx + d0;
    const x1 = alongX ? cx + a1 : cx + d1;
    const z0 = alongX ? cz + d0 : cz + a0;
    const z1 = alongX ? cz + d1 : cz + a1;
    trimBox(b, Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), m);
  };

  /* the glazing: one plane, set back, double sided so it reads from both
     the room and the street */
  const g = M.windowGlass;
  const was = b.mb.maxEdge; b.mb.maxEdge = 6;
  const p = (a, y) => [alongX ? cx + a : cx, y, alongX ? cz : cz + a];
  b.mb.quad(p(-half, spec.sill), p(half, spec.sill), p(half, spec.head), p(-half, spec.head),
    g.tex, [0, 0, (spec.width) * g.density, (spec.head - spec.sill) * g.density],
    F_DOUBLE, [1, 1, false]);
  b.mb.maxEdge = was;

  /* stiles either side, meeting rail across the middle */
  const mid = spec.sill + (spec.head - spec.sill) * 0.52;
  box(-half, -half + sashT, spec.sill, spec.head, -sashT / 2, sashT / 2, M.sashFrame);
  box(half - sashT, half, spec.sill, spec.head, -sashT / 2, sashT / 2, M.sashFrame);
  /* BETWEEN the stiles, not across them: run the full width it lies in
     the same two planes as both of them over its own depth, which is
     eighty-six windows' worth of flicker for nothing. */
  box(-half + sashT, half - sashT, mid - inch(2), mid + inch(2),
    -sashT / 2, sashT / 2, M.sashFrame);

  /* the sill, projecting past the reveal and past the opening */
  const so = inch(4);
  const sx0 = alongX ? spec.at - half - so : spec.line - t / 2 - inch(3);
  const sx1 = alongX ? spec.at + half + so : spec.line + t / 2 + inch(3);
  const sz0 = alongX ? spec.line - t / 2 - inch(3) : spec.at - half - so;
  const sz1 = alongX ? spec.line + t / 2 + inch(3) : spec.at + half + so;
  /* The sill's top stands an inch ABOVE the spandrel it caps. Flush, the
     two horizontal faces are coplanar and the whole sill shimmers. A
     stone sill oversails anyway -- that is what makes it a sill. */
  trimBox(b, sx0, spec.sill - inch(5), sz0, sx1, spec.sill + inch(1), sz1, M.granite);
  void nx; void nz;
}

/**
 * The terracotta surround the photographs shows at every opening: a
 * projecting architrave with alternating deeper blocks up the jambs,
 * which is what gives the elevation its one strong color.
 */
export function windowSurround(b, spec) {
  const m = spec.material;
  const alongX = spec.axis === 'x';
  const half = spec.width / 2 + inch(6);
  const t = spec.thickness;
  const outward = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const d0 = outward * t / 2;
  const d1 = d0 + outward * inch(3);
  /* The back of every block is inside the masonry it is stuck to, and
     there are eighty-six windows with nine blocks each. */
  const back = {};
  if (alongX) back[outward > 0 ? 'nz' : 'pz'] = null;
  else back[outward > 0 ? 'nx' : 'px'] = null;
  const put = (a0, a1, y0, y1, extra) => {
    const e = extra || 0;
    const x0 = alongX ? spec.at + a0 : spec.line + Math.min(d0, d1 + outward * e);
    const x1 = alongX ? spec.at + a1 : spec.line + Math.max(d0, d1 + outward * e);
    const z0 = alongX ? spec.line + Math.min(d0, d1 + outward * e) : spec.at + a0;
    const z1 = alongX ? spec.line + Math.max(d0, d1 + outward * e) : spec.at + a1;
    trimBox(b, Math.min(x0, x1), y0, Math.min(z0, z1),
      Math.max(x0, x1), y1, Math.max(z0, z1), m, back);
  };
  /* head */
  put(-half, half, spec.head, spec.head + inch(9));
  /* jambs, quoined: every other block stands a little further proud.

     The block height is deliberately generous. A ten-foot window quoined
     at eighteen inches is fourteen boxes a side, and at eighty-six
     windows that is most of a frame's budget spent on something two
     pixels wide; at two foot four it is eight, and nothing about the
     elevation reads differently. */
  const jw = inch(6);
  const n = Math.max(3, Math.round((spec.head - spec.sill) / ftin(2, 4)));
  const step = (spec.head - spec.sill) / n;
  for (let i = 0; i < n; i++) {
    const y0 = spec.sill + i * step, y1 = y0 + step * 0.94;
    const e = (i % 2) ? inch(2) : 0;
    put(-half, -half + jw, y0, y1, e);
    put(half - jw, half, y0, y1, e);
  }
}

/**
 * The corbel table: the row of small brackets under the parapet that runs
 * round the building and along the portico, picked out in the same
 * terracotta as the window surrounds. It is one of the two things that
 * make the elevation recognisable at a glance -- the other being the
 * crenellations above it.
 */
export function corbelTable(b, spec) {
  const m = spec.material;
  /* Every dimension here arrives in the spec. parts.js is a vocabulary,
     not a second place where the building is measured. */
  const alongX = spec.axis === 'x';
  const len = alongX ? spec.x1 - spec.x0 : spec.z1 - spec.z0;
  if (len <= 0) return;
  const pitch = spec.pitch, cw = spec.w, ch = spec.h, proj = spec.proj;
  const n = Math.max(1, Math.floor(len / pitch));
  const pad = (len - (n - 1) * pitch) / 2;
  const t = spec.thickness;
  const outward = spec.outward === undefined ? 1 : spec.outward;
  const d0 = outward > 0 ? t / 2 : -t / 2 - proj;
  const d1 = outward > 0 ? t / 2 + proj : -t / 2;
  /* TWO HUNDRED AND THIRTY BRACKETS RUN ROUND THIS BUILDING, and four of
     every bracket's six faces are against something: the wall behind it,
     the parapet sitting on it, and -- at nine inches wide with a
     seven-inch projection -- there is nothing to see of its underside
     from the ground either. Leaving the buried ones undrawn takes a
     third of the roof chunk out, which is the largest single mesh in the
     game and fully visible from the street. */
  const buried = { py: null, ny: null };
  if (alongX) buried[outward > 0 ? 'nz' : 'pz'] = null;
  else buried[outward > 0 ? 'nx' : 'px'] = null;
  for (let i = 0; i < n; i++) {
    const a = pad + i * pitch - cw / 2;
    const x0 = alongX ? spec.x0 + a : spec.line + d0;
    const x1 = alongX ? spec.x0 + a + cw : spec.line + d1;
    const z0 = alongX ? spec.line + d0 : spec.z0 + a;
    const z1 = alongX ? spec.line + d1 : spec.z0 + a + cw;
    trimBox(b, x0, spec.y, z0, x1, spec.y + ch, z1, m, buried);
  }
}


/**
 * Painted beadboard wainscot with a capping rail and a baseboard under
 * it, run round the inside of a rectangular room.
 *
 * The beads are in the texture, not in geometry -- a room of this size
 * would be two thousand boxes otherwise, for something a pixel wide. What
 * IS physical is the cap, because the cap is what the wainscot reads as
 * from across the room: a shadow line at chair height all the way round.
 */
export function wainscot(b, r, spec) {
  const M = b.M;
  const y = r.y === undefined ? 0 : r.y;
  const h = spec.height;
  const capH = spec.cap;
  const board = spec.material || M.beadboard;
  const paint = spec.capMaterial || M.paintWhite;
  const t = inch(1);
  const c = inch(2);
  const gaps = spec.gaps || [];
  /* The cap and the baseboard project past the boards, so they are the
     ones that decide how far a corner has to be kept clear. */

  /* Four sides. `a` runs along the side; `side` names which one, so the
     caller's gap list can say where the doorways are. */
  /* The two runs along Z stop short of the two along X by the depth the
     latter occupy. FOUR RUNS ROUND A RECTANGLE OVERLAP AT ITS CORNERS,
     and two boxes sharing a volume with coincident faces fight for every
     pixel of it -- which showed up as a flickering square in the corner
     of every room in the building. */
  const e = t + c;

  /* ------------------------------------------------------------
     A BOARD NEEDS A WALL BEHIND IT, AND IT IS NAILED TO ITS FACE.

     Everything else here works the wainscot out from the shape of the
     room, and a room's rectangle is not the same thing as four walls. It
     is not even reliably in the same place as them: the upper central
     room is two named halves of one open space, so its shared edge had
     two runs of boards standing back to back in mid-air; a stair hall's
     east boundary is the center line of the wall beside it, so its boards
     were buried four inches inside the plaster; the Council Room's south
     boundary is the far face of its own partition.

     So each run is sampled against the collision world -- which by the
     time trim.js calls this holds every wall in the building -- and the
     board is laid only where a wall is standing within six inches of the
     room's boundary, ON THE FACE THAT WALL PRESENTS TO THE ROOM. Both
     halves matter: the first stops a chair rail crossing thin air, the
     second stops it disappearing into masonry.

     It also subsumes half the gap list, because at a doorway, at chair
     height, there is nothing to nail to.
     ------------------------------------------------------------ */
  const probeY = y + h * 0.5;
  const REACH = inch(6);
  const STEP = inch(2);
  const walls = b.col.solids.filter((w) => (
    w.noOcclude !== true && w.tag !== 'door'
    && w.y0 <= probeY - 0.02 && w.y1 >= probeY + 0.02
  ));
  /** The face the wall behind `a` presents to the room, or null. */
  const faceAt = (s, a) => {
    let best = null;
    for (const w of walls) {
      if (s.along === 'x') {
        if (a < w.x0 - 1e-6 || a > w.x1 + 1e-6) continue;
        if (w.z1 < s.bound - REACH || w.z0 > s.bound + REACH) continue;
        const f = s.dir > 0 ? w.z1 : w.z0;
        if (best === null || (s.dir > 0 ? f > best : f < best)) best = f;
      } else {
        if (a < w.z0 - 1e-6 || a > w.z1 + 1e-6) continue;
        if (w.x1 < s.bound - REACH || w.x0 > s.bound + REACH) continue;
        const f = s.dir > 0 ? w.x1 : w.x0;
        if (best === null || (s.dir > 0 ? f > best : f < best)) best = f;
      }
    }
    return best;
  };
  /** Stretches of a run with one wall face behind them, low to high. */
  const supported = (s) => {
    const out = [];
    let open = null, face = null;
    const n = Math.max(1, Math.ceil((s.a1 - s.a0) / STEP));
    const close = (a) => { if (open !== null) out.push([open, a, face]); open = null; face = null; };
    for (let i = 0; i <= n; i++) {
      const a = s.a0 + (s.a1 - s.a0) * (i / n);
      const f = faceAt(s, a);
      if (f === null) { close(a); continue; }
      if (open !== null && Math.abs(f - face) > 0.002) close(a);
      if (open === null) { open = a; face = f; }
    }
    close(s.a1);
    return out;
  };

  /* `dir` is which way the room lies from the wall: +1 means the room is
     on the high side of it, so the wall's high face is the one to nail
     to. `bound` is where to look for that wall. */
  const xSides = [
    { side: 'south', a0: r.x0, a1: r.x1, along: 'x', bound: r.z0, dir: 1 },
    { side: 'north', a0: r.x0, a1: r.x1, along: 'x', bound: r.z1, dir: -1 },
  ];

  const run = (s, from, to, face) => {
    if (to - from < inch(3)) return;
    const lo = s.dir > 0 ? face : face - t;
    const hi = lo + t;
    /* THE CAP PROJECTS INTO THE ROOM, NOT INTO THE WALL. It used to be
       padded both ways, so two inches of every capping rail and every
       baseboard in the building stood inside the plaster -- which is
       both wrong and, where the floor slab stops at the same plaster, a
       box with an exposed underside nobody will ever see. */
    const box = (y0, y1, m, pad) => {
      const p = pad || 0;
      const a = s.dir > 0 ? lo : lo - p;
      const c2 = s.dir > 0 ? hi + p : hi;
      if (s.along === 'x') {
        trimBox(b, from, y0, a, to, y1, c2, m);
      } else {
        trimBox(b, a, y0, from, c2, y1, to, m);
      }
    };
    box(y, y + h - capH, board);
    box(y + h - capH, y + h, paint, c);          // the cap
    box(y, y + spec.base, paint, c);             // the baseboard
  };

  const lay = (s) => {
    /* WAINSCOT STOPS AT A DOORWAY. It is a board on a wall, not a band
       painted round the room, and running it across an opening hides the
       bottom three feet of every door in the building -- which is exactly
       what the first pass did. */
    const cuts = gaps.filter((g) => g.side === s.side)
      .map((g) => [g.a0, g.a1])
      .sort((p1, p2) => p1[0] - p2[0]);
    const spans = supported(s);
    for (const [w0, w1, face] of spans) {
      let cursor = w0;
      for (const [g0, g1] of cuts) {
        if (g1 <= w0 || g0 >= w1) continue;
        run(s, cursor, Math.min(g0, w1), face);
        cursor = Math.max(cursor, g1);
      }
      run(s, cursor, w1, face);
    }
    return spans;
  };

  /* THE RUNS ALONG X OWN THE CORNERS. Four runs round a rectangle
     overlap where they meet, and two boxes sharing a volume with
     coincident faces fight for every pixel of it -- a flickering square
     in the corner of every room in the building. So the two along X go
     first and the two along Z are cut back to clear whatever face they
     actually landed on, which is not always the room's own edge. */
  let zLo = r.z0 + e, zHi = r.z1 - e;
  for (const s of xSides) {
    for (const [, , face] of lay(s)) {
      if (s.dir > 0) zLo = Math.max(zLo, face + e);
      else zHi = Math.min(zHi, face - e);
    }
  }
  for (const s of [
    { side: 'west', a0: zLo, a1: zHi, along: 'z', bound: r.x0, dir: 1 },
    { side: 'east', a0: zLo, a1: zHi, along: 'z', bound: r.x1, dir: -1 },
  ]) lay(s);
}

/**
 * Where a room's walls are interrupted, worked out from the doors the
 * level has actually built rather than from a second list that can drift
 * away from the first.
 */
export function openingsAround(level, r, pad) {
  const p = pad === undefined ? inch(7) : pad;
  const out = [];
  const near = (a, b2) => Math.abs(a - b2) < ftin(1, 6);
  /* The band the trim actually occupies. AN OPENING ON ANOTHER FLOOR IS
     NOT AN OPENING IN THIS ROOM: the two stories share their wall lines,
     so without this every doorway downstairs punched a gap in the
     wainscot directly above it, and vice versa. */
  const ry = r.y === undefined ? 0 : r.y;
  const lo = ry, hi = ry + ftin(4, 0);
  /* DOORS, CASED OPENINGS AND OBSTRUCTIONS ALIKE. Looking only at the
     door list is how a chair rail ends up running across an eight-foot
     archway, which it did until Stage 2.1 -- the arch is a hole in the
     wall whether or not anything hangs in it -- and looking only at
     holes is how it ends up running through nine inches of chimney
     breast, which it did until this pass. All three are "the wall is
     not available here", and the trim treats them alike. */
  for (const d of [...level.doors, ...level.openings, ...level.obstructions]) {
    if (d.y >= hi || d.y + d.height <= lo) continue;
    const hw = d.width / 2 + p;
    const alongX = Math.abs(Math.cos(d.yaw)) > 0.5;   // the door's leaf runs along X
    if (alongX) {
      if (d.x < r.x0 - p || d.x > r.x1 + p) continue;
      if (near(d.z, r.z0)) out.push({ side: 'south', a0: d.x - hw, a1: d.x + hw });
      else if (near(d.z, r.z1)) out.push({ side: 'north', a0: d.x - hw, a1: d.x + hw });
    } else {
      if (d.z < r.z0 - p || d.z > r.z1 + p) continue;
      if (near(d.x, r.x0)) out.push({ side: 'west', a0: d.z - hw, a1: d.z + hw });
      else if (near(d.x, r.x1)) out.push({ side: 'east', a0: d.z - hw, a1: d.z + hw });
    }
  }
  return out;
}

/**
 * A chimney breast with a mantel on it: the masonry standing a little
 * into the room, and the painted shelf mantel against that.
 *
 * `outward` is which way the breast projects: +1 toward +X, -1 toward -X.
 * The wall it belongs to is a party wall, so one of these goes on each
 * side of it and the two share a stack.
 */
export function chimneyBreast(b, spec) {
  const M = b.M;
  const o = spec.outward;
  const half = D_BREAST.w / 2;
  const x0 = Math.min(spec.line, spec.line + o * D_BREAST.proj);
  const x1 = Math.max(spec.line, spec.line + o * D_BREAST.proj);
  /* the breast itself, in the room's own wall finish */
  trimBox(b, x0, 0, spec.at - half, x1, D_BREAST.ceil, spec.at + half,
    spec.breast || M.plaster);
  /* THE TRIM HAS TO KNOW THIS IS HERE. Told nothing, the wainscot runs
     its boards along the wall line and straight through the masonry. */
  b.level.obstructions.push({
    x: spec.line, z: spec.at, y: 0, yaw: Math.PI / 2,
    width: D_BREAST.w, height: D_BREAST.ceil,
  });
  mantel(b, {
    axis: 'z', line: spec.line + o * D_BREAST.proj, at: spec.at,
    outward: o, width: D_BREAST.mantelW, height: D_BREAST.mantelH,
    y: 0, material: spec.material || M.paintWhite,
  });
}
/** Set once by the level, so parts.js holds no plan dimension. */
const D_BREAST = { w: 0, proj: 0, ceil: 0, mantelW: 0, mantelH: 0 };
export function setBreast(spec) { Object.assign(D_BREAST, spec); }

/**
 * A plain painted shelf mantel: two pilasters, a frieze and a shelf, with
 * the fireplace opening under it.
 */
export function mantel(b, spec) {
  const M = b.M;
  const m = spec.material || M.paintWhite;
  const w = spec.width, h = spec.height, y = spec.y || 0;
  const proj = inch(7);
  const alongX = spec.axis === 'x';
  const line = spec.line;
  const at = spec.at;
  const outward = spec.outward === undefined ? 1 : spec.outward;
  const put = (a0, a1, y0, y1, p0, p1, mm) => {
    const x0 = alongX ? at + a0 : line + outward * p0;
    const x1 = alongX ? at + a1 : line + outward * p1;
    const z0 = alongX ? line + outward * p0 : at + a0;
    const z1 = alongX ? line + outward * p1 : at + a1;
    trimBox(b, Math.min(x0, x1), y0, Math.min(z0, z1), Math.max(x0, x1), y1, Math.max(z0, z1), mm || m);
  };
  const pw = inch(8);
  put(-w / 2, -w / 2 + pw, y, y + h - inch(9), 0, proj * 0.7);      // pilasters
  put(w / 2 - pw, w / 2, y, y + h - inch(9), 0, proj * 0.7);
  put(-w / 2, w / 2, y + h - inch(9), y + h - inch(3), 0, proj * 0.7);  // frieze
  put(-w / 2 - inch(3), w / 2 + inch(3), y + h - inch(3), y + h, 0, proj); // shelf
  /* the opening, as a dark recess rather than a hole in the wall */
  put(-w / 2 + pw, w / 2 - pw, y, y + h - inch(11), 0, inch(1.5), M.trimDark);
}

export { F_DOUBLE };
