/* ============================================================
   roof.js -- the roofline, which is most of the building's face.

   Goodrich's 1856-57 remodelling is why anyone calls this building a
   castle, and the crenellated parapet is why. Get the parapet wrong and
   the reconstruction is a large stuccoed box; get it right and the
   silhouette is recognisable from across the street at dusk, which is
   the only test that matters here.

   The parapet runs the entire perimeter -- both side elevations, both
   north ends, the front of both projecting blocks, and BOTH GARDEN-FACING
   WALLS, so that the view up out of the garden is battlements on either
   hand.

   STAGE 2.1: THE CENTRAL BLOCK STANDS ABOVE THE WINGS, not below them.
   The historic photograph of the front shows it rising clear of the two
   projecting blocks, with its lettered band and its own crenellations
   over that. Stage 2 had it lower and set back, which is exactly the
   wrong way round and is half of why the facade read as squat.

   The corbel table under every parapet is the other half. The photographs
   show a continuous row of small brackets picked out in terracotta,
   running round the building and along the portico, and without it a
   crenellated wall is just a wall with teeth.
   ============================================================ */
import { ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { corbelTable, crenellate } from './parts.js';

function deck(b, x0, x1, z0, z1, y) {
  const top = y === undefined ? D.ROOF : y;
  b.mb.box(x0, top - ftin(1, 0), z0, x1, top, z1,
    { all: { tex: b.M.roofSlate.tex, density: b.M.roofSlate.density } });
  /* Solid, so that nothing can end up standing on the inside of a roof,
     and so the interaction ray cannot see through it. */
  b.col.addSolid({
    x0, x1, z0, z1, y0: top - ftin(1, 0), y1: top,
    tag: 'roof', walkable: false,
  });
}

export function buildRoof(b) {
  const M = b.M;
  /* THE PARAPET SITS ON THE WALL, IT DOES NOT OVERLAP IT.

     `base` used to be eighteen inches below the roof, so the parapet and
     the wall under it shared the same thickness over an eighteen-inch
     band round the entire building -- four coplanar faces per elevation,
     fighting for every pixel. The parapet now starts where the wall stops
     and is four inches thicker, so its faces stand clear on both sides,
     which is also how a coping is built. */
  const P = {
    base: D.ROOF,
    capTop: D.PARAPET_CAP,
    merlonTop: D.PARAPET_TOP,
    thickness: D.EXT + inch(4),
    material: M.ashlar,
    capMaterial: M.ashlarWorn,
    merlon: D.MERLON,
    crenel: D.CRENEL,
  };
  /** The corbel table sits directly under whatever parapet it belongs to. */
  const corbels = (axis, a0, a1, line, y, outward) => corbelTable(b, {
    axis,
    x0: axis === 'x' ? a0 : 0, x1: axis === 'x' ? a1 : 0,
    z0: axis === 'z' ? a0 : 0, z1: axis === 'z' ? a1 : 0,
    line, thickness: D.EXT, outward,
    pitch: D.CORBEL_PITCH, w: D.CORBEL_W, h: D.CORBEL_H, proj: D.CORBEL_PROJ,
    y: y - D.CORBEL_H, material: M.terracotta,
  });

  b.chunk('academy.roof');
  b.detail(4.2);

  /* ---- the decks ----
     THE DECK SPANS THE INTERIOR, NOT THE FOOTPRINT. Taken out to the
     outer face it overlapped the top of every wall, and since both stop
     at the same height their top faces were coplanar over a strip all the
     way round the building -- a hundred and eight fighting pairs, and the
     whole roofline shimmering when seen from anywhere above it. Inside
     the wall lines there is nothing to overlap. */
  deck(b, D.X_W_IN, D.X_WING_W_IN, D.Z_S_IN, D.Z_N_IN);
  deck(b, D.X_WING_E_IN, D.X_E_IN, D.Z_S_IN, D.Z_N_IN);
  deck(b, D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N, D.ROOF_CENTER);

  /* ---- parapets, clockwise from the south-west corner ---- */
  const WEST_CL = D.X_W_OUT + D.EXT / 2;
  const EAST_CL = D.X_E_OUT - D.EXT / 2;
  const FACADE_CL = D.Z_FACADE + D.EXT / 2;
  const NORTH_CL = D.Z_N_OUT - D.EXT / 2;
  const GARDEN_W_CL = D.X_BAY_W - D.EXT / 2;
  const GARDEN_E_CL = D.X_BAY_E + D.EXT / 2;

  /* WHO OWNS A CORNER. The same rule as the walls below: the runs along
     X own the corners and the runs along Z are trimmed to the inner face
     of what they abut. Taken corner to corner both ways, every corner of
     the building had two parapets overlapping in a block twelve inches
     deep with all four of their long faces coplanar. */
  const PT = P.thickness;
  const Z_PARA_S = FACADE_CL + PT / 2;
  const Z_PARA_N = NORTH_CL - PT / 2;

  // the two side elevations, full depth
  crenellate(b, { ...P, x0: WEST_CL, z0: Z_PARA_S, x1: WEST_CL, z1: Z_PARA_N });
  crenellate(b, { ...P, x0: EAST_CL, z0: Z_PARA_S, x1: EAST_CL, z1: Z_PARA_N });

  // the front of each projecting block
  crenellate(b, { ...P, x0: D.X_W_OUT, z0: FACADE_CL, x1: D.X_BAY_W, z1: FACADE_CL });
  crenellate(b, { ...P, x0: D.X_BAY_E, z0: FACADE_CL, x1: D.X_E_OUT, z1: FACADE_CL });

  // the north end of each wing
  crenellate(b, { ...P, x0: D.X_W_OUT, z0: NORTH_CL, x1: D.X_BAY_W, z1: NORTH_CL });
  crenellate(b, { ...P, x0: D.X_BAY_E, z0: NORTH_CL, x1: D.X_E_OUT, z1: NORTH_CL });

  // and the garden faces, which is what you look up at from the courtyard
  crenellate(b, { ...P, x0: GARDEN_W_CL, z0: D.Z_CENTRAL_N_OUT, x1: GARDEN_W_CL, z1: Z_PARA_N });
  crenellate(b, { ...P, x0: GARDEN_E_CL, z0: D.Z_CENTRAL_N_OUT, x1: GARDEN_E_CL, z1: Z_PARA_N });

  /* ---- the corbel table, under every run of parapet above ---- */
  corbels('z', Z_PARA_S, Z_PARA_N, WEST_CL, P.base, -1);
  corbels('z', Z_PARA_S, Z_PARA_N, EAST_CL, P.base, 1);
  corbels('x', D.X_W_OUT, D.X_BAY_W, FACADE_CL, P.base, -1);
  corbels('x', D.X_BAY_E, D.X_E_OUT, FACADE_CL, P.base, -1);
  corbels('x', D.X_W_OUT, D.X_BAY_W, NORTH_CL, P.base, 1);
  corbels('x', D.X_BAY_E, D.X_E_OUT, NORTH_CL, P.base, 1);
  corbels('z', D.Z_CENTRAL_N_OUT, Z_PARA_N, GARDEN_W_CL, P.base, 1);
  corbels('z', D.Z_CENTRAL_N_OUT, Z_PARA_N, GARDEN_E_CL, P.base, -1);

  /* ---- the central block ----
     Standing clear of the two front blocks, with its own band and its own
     crenellations over that. Its south face is the wall behind the
     terrace; its north face looks down on the rear porch. */
  const C = {
    ...P,
    base: D.ROOF_CENTER,
    capTop: D.PARAPET_CAP_CENTER,
    merlonTop: D.PARAPET_TOP_CENTER,
  };
  const CS = D.Z_CENTRAL_S - D.EXT / 2;
  const CN = D.Z_CENTRAL_N + D.EXT / 2;
  crenellate(b, { ...C, x0: D.X_BAY_W, z0: CS, x1: D.X_BAY_E, z1: CS });
  crenellate(b, { ...C, x0: D.X_BAY_W, z0: CN, x1: D.X_BAY_E, z1: CN });
  for (const sx of [D.X_BAY_W - D.EXT / 2, D.X_BAY_E + D.EXT / 2]) {
    crenellate(b, { ...C, x0: sx, z0: CS + PT / 2, x1: sx, z1: CN - PT / 2 });
  }
  corbels('x', D.X_BAY_W, D.X_BAY_E, CS, C.base, -1);
  corbels('x', D.X_BAY_W, D.X_BAY_E, CN, C.base, 1);

  /* The band the historic photograph carries THE LIBRARY on. Blank here:
     the lettering belongs to a period this reconstruction is not set in,
     and a guessed inscription is worse than none. */
  /* Proud of the SOUTH FACE of that wall, not buried in the middle of
     it: `CS` is the wall's center line, so a band three inches deep
     ending there was three inches of masonry inside nineteen and a half
     inches of masonry, visible from nowhere. */
  const BAND_Z = D.Z_CENTRAL_S_OUT;
  b.mb.box(D.X_BAY_W - D.EXT / 2 - ftin(0, 3), C.base - ftin(3, 0), BAND_Z - ftin(0, 3),
    D.X_BAY_E + D.EXT / 2 + ftin(0, 3), C.base - ftin(0, 6), BAND_Z,
    { all: { tex: M.ashlarWorn.tex, density: M.ashlarWorn.density }, pz: null });
}
