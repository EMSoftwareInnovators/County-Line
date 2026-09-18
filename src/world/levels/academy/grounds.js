/* ============================================================
   grounds.js -- the garden, and enough ground round the building to walk
   it and to see it from.

   THE GARDEN IS THE POINT. It is the open-air court between the two rear
   wings, it is entirely exterior, it is open to the sky, and the second
   floor does not cross it at any point. Everything else here exists so
   that the building can be approached and walked around.

   Stage 2 landscaping is deliberately thin: turf, a gravel walk, a few
   beds and some shrubs. The brief is explicit that final garden art is
   not this stage's work, and a courtyard full of period planting would
   only make it harder to judge whether the ARCHITECTURE is right.

   Room left for Stage 3: the ground south of the façade runs to 70 feet
   and the ground east and west to 40, which is more than the reconstruction
   needs and roughly what a coach terminal's forecourt and stands will.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { trimBox } from './parts.js';

/* The site, which is a good deal bigger than the building. */
export const SITE = {
  x0: D.X_W_OUT - D.SIDE_GROUND,
  x1: D.X_E_OUT + D.SIDE_GROUND,
  z0: D.Z_FACADE - D.FRONT_LAWN,
  z1: D.Z_N_OUT + D.REAR_GROUND,
};

/* A path or a bed laid ON turf has to stand clear of it. An inch is not
   enough: two near-coplanar horizontal surfaces seen at a grazing angle
   are the classic depth-buffer fight, and the front walk shimmered the
   whole way to the street. Three inches is both quieter and truer -- a
   walk does sit above the grass. */
function bed(b, x0, z0, x1, z1, y) {
  const M = b.M;
  trimBox(b, x0, y + inch(1), z0, x1, y + inch(8), z1, M.dirt);
  b.col.addFloor({ x0, x1, z0, z1, y: y + inch(8), tag: 'bed', material: 'grass' });
  /* a handful of shrubs, deliberately few */
  const n = Math.max(2, Math.round((x1 - x0) / ftin(5, 0)));
  for (let i = 0; i < n; i++) {
    const cx = x0 + (x1 - x0) * ((i + 0.5) / n);
    const cz = (z0 + z1) / 2;
    const r = ftin(1, 6);
    trimBox(b, cx - r, y + inch(7), cz - r, cx + r, y + ftin(2, 8), cz + r, M.shrub);
    b.col.addSolid({
      x0: cx - r, x1: cx + r, z0: cz - r, z1: cz + r,
      y0: y, y1: y + ftin(2, 8), tag: 'shrub', walkable: false, noOcclude: true,
    });
  }
}

export function buildGrounds(b) {
  const M = b.M;

  /* ============================================================
     THE GARDEN
     ============================================================ */
  b.room({
    id: 'academy.garden', name: 'Garden',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_PORCH_N, z1: D.Z_N_OUT,
    y0: D.GARDEN_LEVEL, y1: D.GARDEN_LEVEL + ft(60), floor: 0, outdoor: true,
  });
  b.detail(4.0);
  b.floor({
    /* Stopping at the face of the wall that closes the north end, not
       running on under it: a slab and a wall that share two faces and a
       volume fight over both. */
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_PORCH_N, z1: D.Z_N_OUT - inch(4),
    y: D.GARDEN_LEVEL, material: M.gardenGrass, thickness: ftin(1, 6),
    buried: true, tag: 'garden',
  });
  /* A gravel walk up the middle, from the porch steps to the far end,
     because a courtyard you cross on grass in the wet is a courtyard
     nobody crossed. */
  b.floor({
    x0: -ftin(3, 0), x1: ftin(3, 0), z0: D.Z_PORCH_N, z1: D.Z_N_OUT - inch(4),
    y: D.GARDEN_LEVEL + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'garden-walk',
  });
  bed(b, D.X_BAY_W + ftin(2, 0), D.Z_PORCH_N + ft(6), -ftin(5, 0), D.Z_PORCH_N + ftin(9, 6),
    D.GARDEN_LEVEL);
  bed(b, ftin(5, 0), D.Z_PORCH_N + ft(6), D.X_BAY_E - ftin(2, 0), D.Z_PORCH_N + ftin(9, 6),
    D.GARDEN_LEVEL);
  bed(b, D.X_BAY_W + ftin(2, 0), D.Z_N_IN - ftin(9, 0), -ftin(5, 0), D.Z_N_IN - ftin(5, 6),
    D.GARDEN_LEVEL);
  bed(b, ftin(5, 0), D.Z_N_IN - ftin(9, 0), D.X_BAY_E - ftin(2, 0), D.Z_N_IN - ftin(5, 6),
    D.GARDEN_LEVEL);

  /* The garden is a step and a half above the ground outside; a low wall
     closes its north end, which is also what stops the player wandering
     straight out of the court without noticing they have left it. */
  trimBox(b, D.X_BAY_W, D.GRADE, D.Z_N_OUT - inch(4), D.X_BAY_E, D.GARDEN_LEVEL + ftin(2, 0),
    D.Z_N_OUT + ftin(1, 0), M.stuccoWorn);
  b.col.addSolid({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_N_OUT - inch(4), z1: D.Z_N_OUT + ftin(1, 0),
    y0: D.GRADE, y1: D.GARDEN_LEVEL + ftin(2, 0), tag: 'garden-wall', walkable: false,
  });

  /* ============================================================
     THE GROUNDS
     ============================================================ */
  const g = (id, name, x0, x1, z0, z1, m) => {
    b.room({
      id, name, x0, x1, z0, z1,
      y0: D.GRADE, y1: D.GRADE + ft(60), floor: 0, outdoor: true,
    });
    b.detail(4.0);
    b.floor({
      x0, x1, z0, z1, y: D.GRADE, material: m,
      thickness: ft(2), buried: true, tag: 'ground',
    });
  };

  g('academy.grounds.front', 'Front Lawn',
    SITE.x0, SITE.x1, SITE.z0, D.Z_FACADE, M.lawn);
  g('academy.grounds.west', 'West Grounds',
    SITE.x0, D.X_W_OUT, D.Z_FACADE, SITE.z1, M.lawn);
  g('academy.grounds.east', 'East Grounds',
    D.X_E_OUT, SITE.x1, D.Z_FACADE, SITE.z1, M.lawn);
  g('academy.grounds.rear', 'Rear Grounds',
    D.X_W_OUT, D.X_E_OUT, D.Z_N_OUT, SITE.z1, M.lawn);

  /* ---- THE FRONT APPROACH ----
     The historic photograph shows a narrow formal walk up the middle of a
     planted forecourt, with a low wall along the street. Stage 2 laid a
     twelve-foot slab of concrete instead, which reads as a parking lot.

     This is deliberately restrained. The 1998 forecourt is Stage 3's
     problem and a coach stand will go over most of it; what is here is
     enough that the building has a setting instead of standing on a lawn. */
  b.chunk('academy.grounds.front');
  b.detail(4.0);
  /* Up to the cross walk and no further: laid the whole way to the
     façade it ran THROUGH the cross walk, two slabs at one height
     fighting over the square where they meet, and out under the portico
     where nothing covers its end. The cross walk carries it across and
     the steps take over from there. */
  b.floor({
    x0: -ftin(3, 6), x1: ftin(3, 6), z0: SITE.z0 + ft(6), z1: D.Z_FACADE - ftin(9, 0),
    y: D.GRADE + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'walk',
  });
  /* and a cross walk along the front of the building */
  b.floor({
    x0: D.X_W_OUT - ft(8), x1: D.X_E_OUT + ft(8),
    z0: D.Z_FACADE - ftin(9, 0), z1: D.Z_FACADE - ftin(5, 6),
    y: D.GRADE + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'walk',
  });
  /* Planting either side of the walk, kept well clear of it. */
  for (const s of [-1, 1]) {
    bed(b, s * ftin(7, 0), D.Z_FACADE - ft(30), s * ftin(22, 0), D.Z_FACADE - ftin(25, 0), D.GRADE);
    bed(b, s * ftin(7, 0), D.Z_FACADE - ft(52), s * ftin(22, 0), D.Z_FACADE - ftin(47, 0), D.GRADE);
  }
  /* The low wall along the street, with the walk through it. */
  for (const [x0, x1] of [[SITE.x0 + ft(20), -ftin(5, 0)], [ftin(5, 0), SITE.x1 - ft(20)]]) {
    trimBox(b, Math.min(x0, x1), D.GRADE, SITE.z0 + ft(5),
      Math.max(x0, x1), D.GRADE + ftin(2, 8), SITE.z0 + ftin(6, 4), M.ashlarWorn);
    b.col.addSolid({
      x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: SITE.z0 + ft(5), z1: SITE.z0 + ftin(6, 4),
      y0: D.GRADE, y1: D.GRADE + ftin(2, 8), tag: 'front-wall', walkable: false, noOcclude: true,
    });
  }

  /* Side paths to the two side doors, so the historic entrances are
     actually reachable from the grounds. */
  b.chunk('academy.grounds.west');
  b.floor({
    x0: D.X_W_OUT - ftin(8, 0), x1: D.X_W_OUT, z0: ft(40), z1: ft(46),
    y: D.GRADE + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'walk',
  });
  b.chunk('academy.grounds.east');
  b.floor({
    x0: D.X_E_OUT, x1: D.X_E_OUT + ftin(8, 0), z0: ft(40), z1: ft(46),
    y: D.GRADE + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'walk',
  });
  b.floor({
    x0: D.X_E_OUT, x1: D.X_E_OUT + ftin(8, 0), z0: ft(16.5), z1: ft(22.5),
    y: D.GRADE + inch(3), material: M.walk, thickness: ftin(0, 8),
    buried: true, tag: 'walk',
  });

  /* Three-foot stoops at each side door, since the floor stands three
     feet above the ground.

     `dir` is the side the steps are on: +1 east of the wall, -1 west of
     it. Two things here are easy to get backwards and both were, once.

     The flight has to descend AWAY from the block -- the tread next to
     the masonry is the top one. And the ramp behind it has to reach full
     height a foot short of the block, not at it: the player is 22 inches
     across, so their center stops nearly a foot out from the face, and a
     ramp that only levels off at the face itself leaves them eight
     inches below a solid they then cannot step up onto. So the top tread
     gets a flat floor of its own and the ramp covers only the three feet
     behind it.
  */
  const RISERS = 4;
  const TREAD = ftin(1, 0);
  const stoop = (x, z, dir) => {
    const reach = ftin(5, 0);
    const bx0 = dir > 0 ? x : x - reach;
    const bx1 = dir > 0 ? x + reach : x;
    const bz0 = z - ftin(3, 0), bz1 = z + ftin(3, 0);
    const sz0 = z - ftin(2, 6), sz1 = z + ftin(2, 6);
    const rise = -D.GRADE / RISERS;

    /* the block itself: masonry, not a shell, so nobody stands inside it */
    b.mb.box(bx0, D.GRADE, bz0, bx1, 0, bz1,
      { all: { tex: M.granite.tex, density: M.granite.density } });
    b.col.addSolid({
      x0: bx0, x1: bx1, z0: bz0, z1: bz1,
      y0: D.GRADE, y1: 0, tag: 'stoop', walkable: true,
    });

    /* the treads, top one first and flush with the block */
    for (let i = 0; i < RISERS; i++) {
      const y = -i * rise;
      const a = dir > 0 ? bx1 + i * TREAD : bx0 - (i + 1) * TREAD;
      b.mb.box(a, y - TREAD, sz0, a + TREAD, y, sz1,
        { all: { tex: M.granite.tex, density: M.granite.density } });
    }

    /* the top tread is flat, at the block's own level */
    const tx0 = dir > 0 ? bx1 : bx0 - TREAD;
    b.col.addFloor({
      x0: tx0, x1: tx0 + TREAD, z0: sz0, z1: sz1,
      y: 0, tag: 'stoop-top', material: 'stone',
    });
    /* and the three feet behind it carry the climb */
    const rx0 = dir > 0 ? bx1 + TREAD : bx0 - RISERS * TREAD;
    const rx1 = dir > 0 ? bx1 + RISERS * TREAD : bx0 - TREAD;
    b.col.addRamp({
      x0: rx0, x1: rx1, z0: sz0, z1: sz1,
      axis: 'x',
      yLow: dir > 0 ? 0 : D.GRADE,
      yHigh: dir > 0 ? D.GRADE : 0,
      tag: 'stoop-steps', material: 'stone',
    });
  };
  b.chunk('academy.grounds.west');
  stoop(D.X_W_OUT, ft(43), -1);
  b.chunk('academy.grounds.east');
  stoop(D.X_E_OUT, ft(43), 1);
  stoop(D.X_E_OUT, ftin(19, 6), 1);

  /* ============================================================
     EXTERIOR DETAILS

     From the oblique photograph of the side: a downspout at each corner
     of each mass, and small grated foundation vents low in the wall.
     Simplified versions of both, and nothing else -- one photograph is
     not a license to decorate the whole building.
     ============================================================ */
  const spout = (x, z, chunk) => {
    b.chunk(chunk);
    b.detail(4.0);
    trimBox(b, x - inch(2.5), D.GRADE, z - inch(2.5), x + inch(2.5), D.ROOF - ftin(1, 6),
      z + inch(2.5), M.ironwork);
    /* the shoe at the bottom, turning it away from the wall */
    trimBox(b, x - inch(3), D.GRADE, z - inch(3), x + inch(3), D.GRADE + ftin(1, 4),
      z + inch(3), M.ironwork);
  };
  const o = inch(5);
  spout(D.X_W_OUT - o, D.Z_FACADE + ft(2), 'academy.grounds.west');
  spout(D.X_W_OUT - o, D.Z_N_OUT - ft(2), 'academy.grounds.west');
  spout(D.X_E_OUT + o, D.Z_FACADE + ft(2), 'academy.grounds.east');
  spout(D.X_E_OUT + o, D.Z_N_OUT - ft(2), 'academy.grounds.east');

  const vent = (x, z, chunk, alongX) => {
    b.chunk(chunk);
    b.detail(4.0);
    const w = ftin(1, 6), hh = inch(9);
    trimBox(b, x - (alongX ? w / 2 : inch(2)), D.GRADE + ftin(1, 0), z - (alongX ? inch(2) : w / 2),
      x + (alongX ? w / 2 : inch(2)), D.GRADE + ftin(1, 0) + hh, z + (alongX ? inch(2) : w / 2),
      M.trimDark);
  };
  for (const zz of [ft(6), ft(24), ft(42), ft(56)]) {
    vent(D.X_W_OUT - inch(1), zz, 'academy.grounds.west', false);
    vent(D.X_E_OUT + inch(1), zz, 'academy.grounds.east', false);
  }

  /* ============================================================
     THE SITE BOUNDARY

     Not a fence in the fiction -- just the edge of what Stage 2 built.
     A low wall, so that walking off the site is a thing you can see
     coming rather than a thing that happens.
     ============================================================ */
  b.chunk('academy.grounds.front');
  b.detail(4.0);
  const H = ftin(3, 6);
  const edges = [
    [SITE.x0, SITE.z0, SITE.x1, SITE.z0],
    [SITE.x0, SITE.z1, SITE.x1, SITE.z1],
    [SITE.x0, SITE.z0, SITE.x0, SITE.z1],
    [SITE.x1, SITE.z0, SITE.x1, SITE.z1],
  ];
  for (const [x0, z0, x1, z1] of edges) {
    const t = ftin(1, 0);
    const bx0 = Math.min(x0, x1) - (x0 === x1 ? t / 2 : 0);
    const bx1 = Math.max(x0, x1) + (x0 === x1 ? t / 2 : 0);
    const bz0 = Math.min(z0, z1) - (z0 === z1 ? t / 2 : 0);
    const bz1 = Math.max(z0, z1) + (z0 === z1 ? t / 2 : 0);
    trimBox(b, bx0, D.GRADE - ft(1), bz0, bx1, D.GRADE + H, bz1, M.stuccoWorn);
    b.col.addSolid({
      x0: bx0, x1: bx1, z0: bz0, z1: bz1,
      y0: D.GRADE - ft(1), y1: D.GRADE + H + ft(6),
      tag: 'site-edge', walkable: false, noOcclude: true,
    });
  }
}
