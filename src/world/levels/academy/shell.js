/* ============================================================
   shell.js -- the exterior envelope.

   Every wall that has weather on one side of it: the front façade of the
   two projecting front blocks, the two side elevations, the north ends of
   the wings, the two garden-facing wing walls, and the recessed central
   block's own south and north walls (which look onto the porches, and the
   porches are outdoors).

   WINDOWS ARE PLACED ONE AT A TIME, from the rooms behind them. Nothing
   here is scattered on a rhythm and then nudged: a wall is given the list
   of openings its rooms actually want, and the rhythm falls out of the
   plan. That is the difference between a building and a texture.

   Each elevation is built as TWO runs, one per story, because an opening
   list can only hold one opening at a given station along a wall -- a
   ground-floor window and the window directly above it are the same
   station. Two runs is also how the wall was actually built.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { sashWindow, stringCourse, trimBox, windowSurround } from './parts.js';

/* Every window in the building, as (station along the run) -> opening.
   Stations are absolute world coordinates; the run converts them. */
const WIN = (at, opt = {}) => ({ at, kind: 'window', ...opt });
const DOOR = (at, opt = {}) => ({ at, kind: 'door', ...opt });

/**
 * Build one story of one elevation segment.
 *
 * @param seg {
 *   axis: 'x' | 'z',   which way the wall runs
 *   line,              the wall's center line on the other axis
 *   from, to,          the run, low to high
 *   face,              which way the OUTER face looks
 *   outer, inner,      materials
 *   story,            1 or 2
 *   openings: [{ at, kind, width, sill, head, door }]
 * }
 */
function story(b, seg, level, openings) {
  const alongX = seg.axis === 'x';
  const y0 = level === 1 ? D.GRADE - ft(2) : D.FLOOR2;
  const y1 = level === 1 ? D.FLOOR2 : (seg.top || D.ROOF);
  const holes = openings.map((o) => ({
    at: o.at - seg.from,
    width: o.width,
    y0: o.sill,
    y1: o.head,
    kind: o.kind,
    door: o.door && {
      material: b.M.doorLeaf, frameMaterial: b.M.trimDark, ...o.door,
    },
  }));

  /* `wallWith`, not `wall` plus a door loop: the leaf is hung in the hole
     the same call cut, at the height that call cut it. This used to place
     every door at y = 0 regardless of its sill, which put the second
     story's terrace door down in the ground-floor doorway. `facing` is how
     the wall's outward side becomes the door's yaw. */
  const facing = (seg.face === 'south' || seg.face === 'west') ? -1 : 1;
  for (const h of holes) if (h.door) h.facing = facing;
  b.wallWith({
    x0: alongX ? seg.from : seg.line,
    z0: alongX ? seg.line : seg.from,
    x1: alongX ? seg.to : seg.line,
    z1: alongX ? seg.line : seg.to,
    y0, y1,
    thickness: D.EXT,
    material: seg.outer,
    innerMaterial: seg.inner,
    /* `flip` decides which long face gets the inner material. For a wall
       running along X the faces are +Z and -Z; for one along Z they are
       +X and -X. A south- or west-looking outer face means the inner face
       is the positive one. */
    flip: seg.face === 'south' || seg.face === 'west',
    openings: holes,
    tag: 'exterior',
    capMaterial: seg.outer,
  });

  /* The openings themselves: glazing, sills and drip molds go on after
     the hole exists, positioned from the same numbers that cut it. */
  for (const o of openings) {
    const half = o.width / 2;
    const x0 = alongX ? o.at - half : seg.line - D.EXT / 2;
    const x1 = alongX ? o.at + half : seg.line + D.EXT / 2;
    const z0 = alongX ? seg.line - D.EXT / 2 : o.at - half;
    const z1 = alongX ? seg.line + D.EXT / 2 : o.at + half;

    if (o.kind === 'window') {
      /* A real multi-pane sash, set well back in the thickness of the
         wall so the reveal is deep, with the terracotta surround the
         photographs show at every opening. Stage 2 put a flat pane of
         glass in the hole and a pale bar over it, which is neither of
         those things. */
      sashWindow(b, {
        axis: seg.axis, line: seg.line, at: o.at,
        width: o.width, sill: o.sill, head: o.head,
        thickness: D.EXT, face: seg.face, reveal: D.WIN_REVEAL,
      });
      windowSurround(b, {
        axis: seg.axis, line: seg.line, at: o.at,
        width: o.width, sill: o.sill, head: o.head,
        thickness: D.EXT, face: seg.face, material: b.M.terracotta,
      });
    }
    void x0; void x1; void z0; void z1;
  }
}

/** Both stories of one segment, plus the string course between them. */
function elevation(b, seg) {
  b.chunk(seg.chunk);
  b.detail(seg.detail || 1.8);
  story(b, seg, 1, seg.lower || []);
  story(b, seg, 2, seg.upper || []);

  /* The band course at first-floor ceiling level, carried right round the
     building. It is what stops a two-story elevation reading as one very
     tall one. */
  const alongX = seg.axis === 'x';
  const p = inch(3);
  trimBox(b,
    alongX ? seg.from : seg.line - D.EXT / 2 - p,
    D.FLOOR2 - ftin(1, 2),
    alongX ? seg.line - D.EXT / 2 - p : seg.from,
    alongX ? seg.to : seg.line + D.EXT / 2 + p,
    D.FLOOR2 - ftin(0, 6),
    alongX ? seg.line + D.EXT / 2 + p : seg.to,
    b.M.granite);

  /* And the water table at the base, which reads as the plinth the whole
     mass sits on. */
  trimBox(b,
    alongX ? seg.from : seg.line - D.EXT / 2 - inch(4),
    D.GRADE, alongX ? seg.line - D.EXT / 2 - inch(4) : seg.from,
    alongX ? seg.to : seg.line + D.EXT / 2 + inch(4),
    D.GRADE + ftin(2, 2),
    alongX ? seg.line + D.EXT / 2 + inch(4) : seg.to,
    b.M.granite);
}

/* ============================================================
   THE ELEVATIONS
   ============================================================ */

const w1 = (at) => WIN(at, { width: D.WIN_W, sill: D.WIN1_SILL, head: D.WIN1_HEAD });
const w2 = (at) => WIN(at, { width: D.WIN_W, sill: D.FLOOR2 + D.WIN2_SILL, head: D.FLOOR2 + D.WIN2_HEAD });

export function buildShell(b) {
  const M = b.M;
  const FACADE_CL = D.Z_FACADE + D.EXT / 2;
  const NORTH_CL = D.Z_N_OUT - D.EXT / 2;
  const WEST_CL = D.X_W_OUT + D.EXT / 2;
  const EAST_CL = D.X_E_OUT - D.EXT / 2;
  const GARDEN_W_CL = D.X_BAY_W - D.EXT / 2;
  const GARDEN_E_CL = D.X_BAY_E + D.EXT / 2;

  /* ---------------- the front façade ----------------
     Three tall openings to each projecting block, above and below, which
     is the arrangement the elevation photographs show and the reason the
     front reads as symmetrical from the street. */
  for (const s of [-1, 1]) {
    const from = s < 0 ? D.X_W_OUT : D.X_BAY_E;
    const to = s < 0 ? D.X_BAY_W : D.X_E_OUT;
    const bays = [ft(6.875), ft(17.125), ft(27.375)].map((d) => from + d);
    elevation(b, {
      chunk: s < 0 ? 'ext.front.west' : 'ext.front.east',
      axis: 'x', line: FACADE_CL, from, to, face: 'south',
      outer: M.stucco, inner: M.plaster,
      lower: bays.map(w1),
      upper: bays.map(w2),
    });
  }

  /* ---------------- west elevation ----------------
     Split into the three bands the wing is divided into, so each stretch
     of wall carries the plaster of the room behind it and so the culler
     has something smaller than a 94-foot wall to reject. */
  elevation(b, {
    chunk: 'ext.west.front', axis: 'z', line: WEST_CL,
    from: D.Z_FACADE, to: D.Z_FB_N, face: 'west',
    outer: M.stucco, inner: M.plasterOchre,
    lower: [ft(-24.5), ft(-13.4), ft(-5.17), ft(3.08)].map(w1),
    upper: [ft(-24.5), ft(-13.4), ft(-5.17), ft(3.08)].map(w2),
  });
  elevation(b, {
    chunk: 'ext.west.mid', axis: 'z', line: WEST_CL,
    from: D.Z_FB_N, to: D.Z_MID_N + D.CROSS / 2, face: 'west',
    outer: M.stucco, inner: M.plaster,
    lower: [w1(ft(15.58))],
    upper: [w2(ft(15.58))],
  });
  elevation(b, {
    chunk: 'ext.west.north', axis: 'z', line: WEST_CL,
    from: D.Z_MID_N + D.CROSS / 2, to: D.Z_N_OUT, face: 'west',
    outer: M.stucco, inner: M.plasterGreen,
    lower: [
      w1(ft(27.5)), w1(ft(34.5)),
      /* "Entrance to Railroad" on the visitor map: the west side door,
         which faced the railroad cut. Its stoop is on the measured plan. */
      DOOR(ft(43), {
        width: D.EXT_DOOR_W, sill: 0, head: D.EXT_DOOR_H,
        door: { id: 'west-side', name: 'west door', hinge: 'x0', swing: -1 },
      }),
      w1(ft(50.5)), w1(ft(57)),
    ],
    upper: [ft(27.5), ft(34.5), ft(43), ft(50.5), ft(57)].map(w2),
  });

  /* ---------------- east elevation ---------------- */
  elevation(b, {
    chunk: 'ext.east.front', axis: 'z', line: EAST_CL,
    from: D.Z_FACADE, to: D.Z_FB_N, face: 'east',
    outer: M.stucco, inner: M.plasterOchre,
    lower: [ft(-24.5), ft(-16), ft(-7.5), ft(1)].map(w1),
    upper: [ft(-24.5), ft(-16), ft(-7.5), ft(1)].map(w2),
  });
  elevation(b, {
    chunk: 'ext.east.mid', axis: 'z', line: EAST_CL,
    from: D.Z_FB_N, to: D.Z_MID_N + D.CROSS / 2, face: 'east',
    outer: M.stucco, inner: M.plaster,
    lower: [DOOR(ft(15.58), {
      width: D.EXT_DOOR_W, sill: 0, head: D.EXT_DOOR_H,
      door: { id: 'east-side-stair', name: 'east door', hinge: 'x0', swing: 1 },
    })],
    upper: [w2(ft(15.58))],
  });
  elevation(b, {
    chunk: 'ext.east.north', axis: 'z', line: EAST_CL,
    from: D.Z_MID_N + D.CROSS / 2, to: D.Z_N_OUT, face: 'east',
    outer: M.stucco, inner: M.plasterGreen,
    lower: [
      w1(ft(27.5)), w1(ft(34)),
      DOOR(ft(43), {
        width: D.EXT_DOOR_W, sill: 0, head: D.EXT_DOOR_H,
        door: { id: 'east-side-vestibule', name: 'east door', hinge: 'x0', swing: -1 },
      }),
      w1(ft(51.5)), w1(ft(57.5)),
    ],
    upper: [ft(27.5), ft(34), ft(43), ft(51.5), ft(57.5)].map(w2),
  });

  /* ---------------- north ends of the wings ----------------
     A chimney stack rises through the middle of each, which is what the
     measured plan's hatched projections at the north ends are. */
  for (const s of [-1, 1]) {
    const from = s < 0 ? D.X_W_OUT : D.X_BAY_E;
    const to = s < 0 ? D.X_BAY_W : D.X_E_OUT;
    const bays = s < 0 ? [ft(-49.5), ft(-29)] : [ft(29), ft(49.5)];
    elevation(b, {
      chunk: s < 0 ? 'ext.north.west' : 'ext.north.east',
      axis: 'x', line: NORTH_CL, from, to, face: 'north',
      outer: M.stuccoWorn, inner: M.plasterGreen,
      lower: bays.map(w1),
      upper: bays.map(w2),
    });
    chimney(b, s * ft(39.25), D.Z_N_OUT);
  }

  /* ---------------- the garden elevations ----------------
     The inner faces of the two rear wings. These are the walls the player
     sees from the garden, and the ones the upper windows look down from,
     so they carry the same rhythm as the outer sides. */
  for (const s of [-1, 1]) {
    const line = s < 0 ? GARDEN_W_CL : GARDEN_E_CL;
    const bays = [ft(28), ft(37), ft(44), ft(51), ft(58)];
    elevation(b, {
      chunk: s < 0 ? 'ext.garden.west' : 'ext.garden.east',
      axis: 'z', line,
      from: D.Z_CENTRAL_N_OUT, to: D.Z_N_OUT,
      face: s < 0 ? 'east' : 'west',
      outer: M.stuccoWorn,
      inner: s < 0 ? M.plaster : M.plaster,
      lower: [
        /* The rear hall's own door out onto the covered porch. Required by
           the circulation schedule: central room -> rear hall -> porch. */
        DOOR(ft(20), {
          width: D.EXT_DOOR_W, sill: 0, head: D.EXT_DOOR_H,
          door: {
            id: s < 0 ? 'west-hall-porch' : 'east-hall-porch',
            name: 'porch door', hinge: 'x0', swing: s < 0 ? 1 : -1,
          },
        }),
        ...bays.map(w1),
      ],
      upper: bays.map(w2),
    });
  }

  /* ---------------- the central block's own two faces ----------------
     Both look onto a porch, and a porch is outdoors, so both are exterior
     walls carrying the central room's two sets of double doors. */
  const centralFace = (which) => {
    const north = which === 'north';
    elevation(b, {
      chunk: north ? 'ext.central.north' : 'ext.central.south',
      axis: 'x',
      /* The central block stands clear of the wings, so its walls run up
         past their parapet to its own. */
      top: D.ROOF_CENTER,
      line: north ? D.Z_CENTRAL_N + D.EXT / 2 : D.Z_CENTRAL_S - D.EXT / 2,
      from: D.X_BAY_W, to: D.X_BAY_E,
      face: north ? 'north' : 'south',
      outer: M.stucco, inner: M.plasterOchre,
      lower: [
        w1(ft(-14)),
        DOOR(0, {
          width: D.DBL_W, sill: 0, head: D.DBL_H,
          door: {
            id: north ? 'central-rear' : 'central-front',
            name: north ? 'rear doors' : 'front doors',
            leaves: 2, swing: north ? -1 : 1,
          },
        }),
        w1(ft(14)),
      ],
      upper: [
        w2(ft(-14)),
        /* Three tall openings across the upper center, which is what the
           historic photograph shows standing above the terrace. The
           middle one is the door out onto it; at the rear it is a window,
           because there is no terrace over the rear porch. */
        north ? w2(0) : DOOR(0, {
          width: D.EXT_DOOR_W, sill: D.FLOOR2, head: D.FLOOR2 + D.EXT_DOOR_H,
          door: { id: 'gallery-door', name: 'terrace door', hinge: 'x0', swing: -1 },
        }),
        w2(ft(14)),
      ],
    });
  };
  centralFace('south');
  centralFace('north');
}

/* ============================================================
   CHIMNEYS
   ============================================================ */
function chimney(b, x, z) {
  const M = b.M;
  const w = ftin(4, 6), d = ftin(2, 6);
  const top = D.PARAPET_TOP + ftin(5, 0);
  b.mb.box(x - w / 2, D.GRADE, z - d / 2, x + w / 2, top - ftin(1, 0), z + d / 2,
    { all: { tex: M.stuccoWorn.tex, density: M.stuccoWorn.density } });
  // a corbelled cap
  b.mb.box(x - w / 2 - inch(5), top - ftin(1, 0), z - d / 2 - inch(5),
    x + w / 2 + inch(5), top, z + d / 2 + inch(5),
    { all: { tex: M.granite.tex, density: M.granite.density } });
  b.col.addSolid({
    x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2,
    y0: D.GRADE, y1: top, tag: 'chimney', walkable: false, noOcclude: true,
  });
}

export { stringCourse };
