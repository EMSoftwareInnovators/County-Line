/* ============================================================
   prefabs.js -- the pieces a building is made of.

   Each function here takes a description of one architectural element and
   emits geometry into a mesh builder plus colliders into a collision
   world. They are the vocabulary the level modules are written in:

       wallRun      a wall with holes in it for doors and windows
       stairFlight  treads, risers, stringers, and the ramp that is
                    actually walked on
       railing      a handrail and its balusters
       boxProp      the generic solid lump

   Nothing here knows which building it is building. THE ONE RULE is that
   walls and floors are axis-aligned: collision is AABB, and an AABB that
   has to be rotated is not an AABB. County Line's building is orthogonal
   in its main runs, and anything angled that turns up in Stage 2 is
   modelled as geometry with a stepped collision approximation rather than
   by giving the collider an oriented box it would then need a solver for.
   ============================================================ */
import { F_DOUBLE } from '../engine/raster.js';
import { SCALE } from '../engine/units.js';

/**
 * A straight wall with openings cut out of it.
 *
 * The wall runs from (x0, z0) to (x1, z1); one of the two must be equal,
 * so the wall lies along X or along Z. `thickness` straddles that line.
 *
 * @param openings [{ at, width, y0, y1, kind }]
 *        `at` is the distance from the wall's start to the CENTER of the
 *        opening. `kind` is informational -- 'door', 'window', 'arch'.
 *
 * Geometry comes out as: a pier between each pair of openings, a spandrel
 * under each opening whose sill is above the floor, and a lintel over each
 * opening whose head is below the wall top. Colliders match the geometry
 * exactly, which is what stops a doorway being blocked by an invisible
 * barrier -- the classic version of that bug is a wall collider that was
 * never told about the hole in it.
 */
export function wallRun(mb, col, spec) {
  const { x0, z0, x1, z1, y0, y1 } = spec;
  const alongX = Math.abs(x1 - x0) > 1e-6;
  const alongZ = Math.abs(z1 - z0) > 1e-6;
  if (alongX && alongZ) throw new Error('wallRun: walls must run along X or Z');
  const len = alongX ? x1 - x0 : z1 - z0;
  if (len <= 0) throw new Error('wallRun: start must come before end');
  const t = spec.thickness === undefined ? SCALE.wallThickness : spec.thickness;
  const m = spec.material;
  const face = { tex: m.tex, density: m.density };
  const inner = spec.innerMaterial ? { tex: spec.innerMaterial.tex, density: spec.innerMaterial.density } : face;
  const half = t / 2;

  /* A wall's box, given a span [a, b] along its run and [ya, yb] up it. */
  const piece = (a, b, ya, yb, solid = true) => {
    if (b - a < 1e-6 || yb - ya < 1e-6) return;
    const bx0 = alongX ? x0 + a : x0 - half;
    const bx1 = alongX ? x0 + b : x0 + half;
    const bz0 = alongX ? z0 - half : z0 + a;
    const bz1 = alongX ? z0 + half : z0 + b;
    mb.box(bx0, ya, bz0, bx1, yb, bz1, {
      all: face,
      /* The two long faces may be different materials -- an exterior wall
         is brick outside and plaster inside. */
      [alongX ? 'pz' : 'px']: spec.flip ? inner : face,
      [alongX ? 'nz' : 'nx']: spec.flip ? face : inner,
      py: spec.capMaterial ? { tex: spec.capMaterial.tex, density: spec.capMaterial.density } : face,
    });
    if (solid && col) {
      col.addSolid({
        x0: bx0, x1: bx1, y0: ya, y1: yb, z0: bz0, z1: bz1,
        tag: spec.tag || 'wall',
        /* Nobody stands on top of a wall. Leaving the top out of the floor
           set is what stops the player being pulled onto a partition when
           they walk under a mezzanine. */
        walkable: spec.walkable === true,
      });
    }
  };

  const holes = (spec.openings || []).slice().sort((a, b) => a.at - b.at);
  let cursor = 0;
  for (const h of holes) {
    const a = h.at - h.width / 2, b = h.at + h.width / 2;
    if (a < cursor - 1e-6) throw new Error(`wallRun: openings overlap at ${h.at}`);
    piece(cursor, a, y0, y1);                       // the pier before it
    const hy0 = h.y0 === undefined ? y0 : h.y0;
    const hy1 = h.y1 === undefined ? y0 + SCALE.doorHeight : h.y1;
    if (hy0 > y0 + 1e-6) piece(a, b, y0, hy0);      // sill / spandrel
    if (hy1 < y1 - 1e-6) piece(a, b, hy1, y1);      // lintel
    h._span = [a, b];
    h._y = [hy0, hy1];
    cursor = b;
  }
  piece(cursor, len, y0, y1);
  return holes;
}

/**
 * A straight flight of stairs.
 *
 * `x, z` is the center of the bottom step's leading edge. The flight runs
 * in the direction of `yaw` (0 climbs toward +Z).
 *
 * The visible treads and risers are GEOMETRY ONLY. What the player
 * actually walks on is a single ramp collider laid under them, which is
 * why the climb is smooth, why stopping halfway leaves you halfway, and
 * why turning around on the flight does not put the camera through a step.
 * The alternative -- a solid box per tread, climbed by the step-up rule --
 * works, but it makes the camera rise in jerks and it puts a seam at every
 * nose for a body to catch on.
 *
 * @returns { top: { x, y, z }, ramp, length }
 */
export function stairFlight(mb, col, spec) {
  const steps = spec.steps;
  const rise = spec.rise === undefined ? SCALE.stairRise : spec.rise;
  const run = spec.run === undefined ? SCALE.stairRun : spec.run;
  const w = spec.width === undefined ? SCALE.stairWidth : spec.width;
  const yaw = spec.yaw || 0;
  const y0 = spec.y || 0;
  const tread = spec.treadMaterial, riser = spec.riserMaterial;
  const nose = spec.nose === undefined ? 0.025 : spec.nose;

  // forward is +Z at yaw 0, right is +X
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  if (Math.abs(fx) > 1e-6 && Math.abs(fz) > 1e-6) {
    throw new Error('stairFlight: yaw must be a right angle');
  }
  const hw = w / 2;

  const box = (aFrom, aTo, ya, yb, material) => {
    // a runs along the flight; the width runs across it
    const p = (a, s) => [spec.x + fx * a + rx * s, spec.z + fz * a + rz * s];
    const c0 = p(aFrom, -hw), c1 = p(aTo, hw);
    const bx0 = Math.min(c0[0], c1[0]), bx1 = Math.max(c0[0], c1[0]);
    const bz0 = Math.min(c0[1], c1[1]), bz1 = Math.max(c0[1], c1[1]);
    mb.box(bx0, ya, bz0, bx1, yb, bz1, { all: { tex: material.tex, density: material.density } });
  };

  for (let i = 0; i < steps; i++) {
    const a0 = i * run, a1 = (i + 1) * run;
    const top = y0 + (i + 1) * rise;
    // riser: the vertical face of this step
    box(a0, a0 + 0.02, y0 + i * rise, top, riser);
    // tread: the horizontal face, overhanging the riser below by its nose
    box(a0 - nose, a1, top - 0.035, top, tread);
  }

  /* The ramp. It spans the same footprint as the flight and rises from
     the bottom of the first riser to the top of the last tread. */
  const pA = [spec.x - fx * 0.001 + rx * -hw, spec.z - fz * 0.001 + rz * -hw];
  const pB = [spec.x + fx * (steps * run) + rx * hw, spec.z + fz * (steps * run) + rz * hw];
  const axis = Math.abs(fz) > 0.5 ? 'z' : 'x';
  const lowFirst = axis === 'z' ? fz > 0 : fx > 0;
  const ramp = col ? col.addRamp({
    x0: Math.min(pA[0], pB[0]), x1: Math.max(pA[0], pB[0]),
    z0: Math.min(pA[1], pB[1]), z1: Math.max(pA[1], pB[1]),
    axis,
    yLow: lowFirst ? y0 : y0 + steps * rise,
    yHigh: lowFirst ? y0 + steps * rise : y0,
    tag: spec.tag || 'stair',
  }) : null;

  /* Stringers: the closed sides of the flight, and the guard above them.
     Solid, so nobody walks off the side of a staircase into the room
     below -- but STEPPED, following the flight up rather than standing as
     one tall slab from the bottom step. A single box would put a five
     meter invisible wall beside the first tread, which is both wrong to
     look at and wrong to walk into.

     `stringers` is true for both sides, 'left' or 'right' for one, or
     false for an open flight against two walls. */
  const sides = spec.stringers === false ? []
    : spec.stringers === 'left' ? [-1]
      : spec.stringers === 'right' ? [1] : [-1, 1];
  const guard = spec.guard === undefined ? 1.0 : spec.guard;
  const th = 0.06;
  for (const s of sides) {
    for (let i = 0; i < steps; i++) {
      const a0 = i * run, a1 = (i + 1) * run;
      const c0 = [spec.x + fx * a0 + rx * s * hw, spec.z + fz * a0 + rz * s * hw];
      const c1 = [spec.x + fx * a1 + rx * s * hw, spec.z + fz * a1 + rz * s * hw];
      const bx0 = Math.min(c0[0], c1[0]) - th, bx1 = Math.max(c0[0], c1[0]) + th;
      const bz0 = Math.min(c0[1], c1[1]) - th, bz1 = Math.max(c0[1], c1[1]) + th;
      const top = y0 + (i + 1) * rise;
      if (spec.sideMaterial) {
        const m = spec.sideMaterial;
        mb.box(bx0, top - 0.24, bz0, bx1, top + 0.06, bz1,
          { all: { tex: m.tex, density: m.density } });
      }
      if (col) {
        col.addSolid({
          x0: bx0, x1: bx1, z0: bz0, z1: bz1,
          y0, y1: top + guard,
          tag: 'stair-side', walkable: false,
          /* The side of a staircase must not hide what is beyond it from
             the interaction ray, or a doorway at the top of the flight
             cannot be looked at from the bottom of it. */
          noOcclude: true,
        });
      }
    }
  }

  return {
    ramp,
    length: steps * run,
    rise: steps * rise,
    top: { x: spec.x + fx * steps * run, y: y0 + steps * rise, z: spec.z + fz * steps * run },
  };
}

/** A handrail with balusters. Geometry only -- the stringer is the collider. */
export function railing(mb, spec) {
  const { x0, z0, x1, z1 } = spec;
  const y = spec.y === undefined ? 0 : spec.y;
  const h = spec.height === undefined ? 0.95 : spec.height;
  const rise = spec.rise || 0;         // for a raking rail up a flight
  const m = spec.material;
  const f = { tex: m.tex, density: m.density };
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(2, Math.round(len / 0.32));
  const post = 0.035;

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const yb = y + rise * t;
    mb.box(x - post, yb, z - post, x + post, yb + h, z + post, { all: f });
  }
  /* The rail itself, in segments so it can follow the rake. */
  const seg = 8, r = 0.04;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
    const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
    const ya = y + h + rise * t0, yb = y + h + rise * t1;
    mb.box(Math.min(ax, bx) - r, Math.min(ya, yb) - r, Math.min(az, bz) - r,
      Math.max(ax, bx) + r, Math.max(ya, yb) + r, Math.max(az, bz) + r, { all: f });
  }
}

/** A solid lump: crate, counter, plinth, curb. Geometry plus a collider. */
export function boxProp(mb, col, spec) {
  const m = spec.material;
  const f = { tex: m.tex, density: m.density };
  const faces = spec.faces ? { all: f, ...spec.faces } : { all: f };
  mb.box(spec.x0, spec.y0, spec.z0, spec.x1, spec.y1, spec.z1, faces);
  if (col && spec.solid !== false) {
    col.addSolid({
      x0: spec.x0, x1: spec.x1, y0: spec.y0, y1: spec.y1, z0: spec.z0, z1: spec.z1,
      tag: spec.tag || 'prop',
      walkable: spec.walkable !== false,
    });
  }
}

/** Glazing in an opening: one blended, double-sided pane. */
export function glazing(mb, spec) {
  const m = spec.material;
  const { x0, x1, y0, y1, z0, z1 } = spec;
  const alongX = (x1 - x0) > (z1 - z0);
  const cz = (z0 + z1) / 2, cx = (x0 + x1) / 2;
  const p = alongX
    ? [[x0, y0, cz], [x1, y0, cz], [x1, y1, cz], [x0, y1, cz]]
    : [[cx, y0, z1], [cx, y0, z0], [cx, y1, z0], [cx, y1, z1]];
  mb.surface(p, m.tex, {
    density: m.density,
    flags: (spec.flags === undefined ? 4 : spec.flags) | F_DOUBLE,   // F_BLEND
  });
}
