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
   hand. The central block carries its own, lower and set back behind the
   colonnade, which is what makes the middle of the front read as recessed.
   ============================================================ */
import { ftin } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { crenellate } from './parts.js';

function deck(b, x0, x1, z0, z1) {
  b.mb.box(x0, D.ROOF - ftin(1, 0), z0, x1, D.ROOF, z1,
    { all: { tex: b.M.roofSlate.tex, density: b.M.roofSlate.density } });
  /* Solid, so that nothing can end up standing on the inside of a roof,
     and so the interaction ray cannot see through it. */
  b.col.addSolid({
    x0, x1, z0, z1, y0: D.ROOF - ftin(1, 0), y1: D.ROOF,
    tag: 'roof', walkable: false,
  });
}

export function buildRoof(b) {
  const M = b.M;
  const P = {
    base: D.ROOF - ftin(1, 6),
    capTop: D.PARAPET_TOP - D.MERLON_RISE,
    merlonTop: D.PARAPET_TOP,
    thickness: D.EXT,
    material: M.stucco,
    capMaterial: M.stuccoWorn,
    merlon: D.MERLON,
    crenel: D.CRENEL,
  };

  b.chunk('academy.roof');
  b.detail(3.0);

  /* ---- the decks ---- */
  deck(b, D.X_W_OUT, D.X_BAY_W, D.Z_FACADE, D.Z_N_OUT);          // west wing
  deck(b, D.X_BAY_E, D.X_E_OUT, D.Z_FACADE, D.Z_N_OUT);          // east wing
  deck(b, D.X_BAY_W, D.X_BAY_E, D.Z_FACADE, D.Z_CENTRAL_N_OUT);  // center + gallery

  /* ---- parapets, clockwise from the south-west corner ---- */
  const WEST_CL = D.X_W_OUT + D.EXT / 2;
  const EAST_CL = D.X_E_OUT - D.EXT / 2;
  const FACADE_CL = D.Z_FACADE + D.EXT / 2;
  const NORTH_CL = D.Z_N_OUT - D.EXT / 2;
  const GARDEN_W_CL = D.X_BAY_W - D.EXT / 2;
  const GARDEN_E_CL = D.X_BAY_E + D.EXT / 2;

  // the two side elevations, full depth
  crenellate(b, { ...P, x0: WEST_CL, z0: D.Z_FACADE, x1: WEST_CL, z1: D.Z_N_OUT });
  crenellate(b, { ...P, x0: EAST_CL, z0: D.Z_FACADE, x1: EAST_CL, z1: D.Z_N_OUT });

  // the front of each projecting block
  crenellate(b, { ...P, x0: D.X_W_OUT, z0: FACADE_CL, x1: D.X_BAY_W, z1: FACADE_CL });
  crenellate(b, { ...P, x0: D.X_BAY_E, z0: FACADE_CL, x1: D.X_E_OUT, z1: FACADE_CL });

  // the north end of each wing
  crenellate(b, { ...P, x0: D.X_W_OUT, z0: NORTH_CL, x1: D.X_BAY_W, z1: NORTH_CL });
  crenellate(b, { ...P, x0: D.X_BAY_E, z0: NORTH_CL, x1: D.X_E_OUT, z1: NORTH_CL });

  // and the garden faces, which is what you look up at from the courtyard
  crenellate(b, { ...P, x0: GARDEN_W_CL, z0: D.Z_CENTRAL_N_OUT, x1: GARDEN_W_CL, z1: D.Z_N_OUT });
  crenellate(b, { ...P, x0: GARDEN_E_CL, z0: D.Z_CENTRAL_N_OUT, x1: GARDEN_E_CL, z1: D.Z_N_OUT });

  /* The center's own parapet, set back over the gallery and a little
     lower, so the two front blocks read as towers either side of it. */
  const C = {
    ...P,
    base: D.ROOF - ftin(1, 6),
    capTop: D.PARAPET_TOP - D.MERLON_RISE - ftin(1, 6),
    merlonTop: D.PARAPET_TOP - ftin(1, 6),
  };
  crenellate(b, { ...C, x0: D.X_BAY_W, z0: FACADE_CL, x1: D.X_BAY_E, z1: FACADE_CL });
  crenellate(b, {
    ...C, x0: D.X_BAY_W, z0: D.Z_CENTRAL_N + D.EXT / 2,
    x1: D.X_BAY_E, z1: D.Z_CENTRAL_N + D.EXT / 2,
  });
}
