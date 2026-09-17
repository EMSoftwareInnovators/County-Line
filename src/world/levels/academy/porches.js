/* ============================================================
   porches.js -- the front portico, the terrace over it, and the rear
   porch.

   BOTH ARE OUTDOORS. That is the whole point of them and the thing most
   easily lost: the portico is a recessed one-story colonnade between the
   two projecting front blocks, and the rear porch is a covered strip
   along the south edge of the garden. Neither is a lobby, a hall or a
   concourse. You can see the sky from the front steps, and from the rear
   porch you can look straight up between the two wings.

   THE FRONT IS NOT A TWO-STORY OPEN PORCH. Stage 2 built it as one, with
   a colonnade on both levels, and that is the single thing that made the
   facade read as a generic castellated block. The photographs show one
   story of columns, a crenellated masonry terrace on top of them, and the
   central block's own upper wall standing solid behind that with three
   tall windows in it.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { column, corbelTable, crenellate, ironRail, steps, trimBox } from './parts.js';
import { partition } from './firstfloor.js';

export function buildPorches(b) {
  const M = b.M;

  /* ============================================================
     THE FRONT PORTICO AND THE TERRACE OVER IT

     Stage 2 built this as a two-story open loggia, with a colonnade on
     both levels and the center of the facade standing open from the
     ground to the roof. The photographs show that is wrong, and it is
     the single thing that made the front read as a generic castellated
     block rather than as this building. What is actually there, bottom
     to top:

         FRONT STEPS
         ONE-STORY COLUMNED PORTICO      slender painted columns
         CRENELLATED TERRACE             masonry, not a railing
         THE CENTRAL BLOCK'S UPPER WALL  solid, with three tall windows
         ITS OWN CRENELLATED PARAPET     standing above the side blocks

     The upper central wall has to stay visibly present behind the
     terrace; it is most of what the facade is.
     ============================================================ */
  b.room({
    id: 'academy.porch.front', name: 'Front Portico',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y0: 0, y1: D.PORTICO_SOFFIT, floor: 1, outdoor: true,
  });
  b.detail(1.5);
  b.floor({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE - inch(8), z1: D.Z_CENTRAL_S_OUT,
    y: 0, material: M.porchDeck, thickness: ftin(2, 6), tag: 'porch',
  });

  /* The flanking walls of the recess: the inner faces of the two front
     blocks. Each has a door into the room behind it -- the measured plan
     shows an opening at both ends of the portico. */
  for (const s of [-1, 1]) {
    const west = s < 0;
    partition(b, {
      chunk: 'academy.porch.front',
      axis: 'z', line: west ? D.X_BAY_W - D.EXT / 2 : D.X_BAY_E + D.EXT / 2,
      /* Behind the facade, not flush with it -- the runs along X own the
         corners. See the note in shell.js. */
      from: D.Z_S_IN, to: D.Z_CENTRAL_S_OUT,
      thickness: D.EXT, material: M.ashlar, innerMaterial: M.plaster, flip: west,
      y0: D.GRADE - ft(2), y1: D.ROOF,
      openings: [{
        at: ft(-24.5), kind: 'door', width: D.EXT_DOOR_W, y0: 0, y1: D.EXT_DOOR_H,
        door: {
          id: west ? 'porch-docent' : 'porch-giftshop',
          name: west ? 'library door' : 'gift shop door',
          hinge: 'x0', swing: west ? -1 : 1,
        },
      }],
    });
  }

  /* ---- the columns ----
     Six of them across the bay, slender, round, with a visible base and a
     simple molded capital. They are painted a dark blue-gray in the
     photographs, which is also what the entablature and the handrails
     are, and against the pale ashlar that contrast is most of what the
     front elevation reads as. */
  b.chunk('academy.porch.front');
  b.detail(1.4);
  const COL_Z = D.Z_FACADE + ftin(1, 6);
  const colX = (i) => {
    const x0 = D.X_BAY_W + ftin(3, 0), x1 = D.X_BAY_E - ftin(3, 0);
    return x0 + (x1 - x0) * (i / (D.COLUMN_COUNT - 1));
  };
  for (let i = 0; i < D.COLUMN_COUNT; i++) {
    column(b, {
      x: colX(i), z: COL_Z, y: 0, top: D.PORTICO_SOFFIT,
      dia: D.COLUMN_DIA, base: D.COLUMN_BASE_H, cap: D.COLUMN_CAP_H,
      material: M.ironwork,
    });
  }

  /* ---- the entablature the terrace sits on ----
     A plain deep band, with the corbel table under it that runs round the
     rest of the building too. */
  trimBox(b, D.X_BAY_W, D.PORTICO_SOFFIT, D.Z_FACADE - inch(10),
    D.X_BAY_E, D.TERRACE, D.Z_CENTRAL_S_OUT, M.ironwork);
  corbelTable(b, {
    axis: 'x', x0: D.X_BAY_W, x1: D.X_BAY_E, z0: 0,
    line: D.Z_FACADE - inch(10), thickness: 0, outward: -1,
    pitch: D.CORBEL_PITCH, w: D.CORBEL_W, h: D.CORBEL_H, proj: D.CORBEL_PROJ,
    y: D.PORTICO_SOFFIT - D.CORBEL_H, material: M.terracotta,
  });
  b.headroom({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y: D.PORTICO_SOFFIT, tag: 'portico-soffit',
  });

  /* ---- the terrace ---- */
  b.room({
    id: 'academy.gallery', name: 'Front Terrace',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y0: D.TERRACE, y1: D.ROOF_CENTER, floor: 2, outdoor: true,
  });
  b.detail(1.8);
  b.floor({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE - inch(10), z1: D.Z_CENTRAL_S_OUT,
    y: D.TERRACE, material: M.porchDeck,
    thickness: inch(6), tag: 'terrace',
  });

  /* Its parapet is MASONRY AND CRENELLATED, not a railing. The brief is
     explicit and so are the photographs: the terrace edge carries the
     same merlon rhythm as the roofline, which is what ties the middle of
     the facade to the two blocks either side of it. */
  const par = {
    base: D.TERRACE, capTop: D.TERRACE_PARAPET, merlonTop: D.TERRACE_MERLON_TOP,
    thickness: ftin(1, 2), material: M.ashlar, capMaterial: M.ashlar,
    merlon: D.MERLON, crenel: D.CRENEL, solid: true,
  };
  crenellate(b, { ...par, x0: D.X_BAY_W, z0: D.Z_FACADE - inch(4), x1: D.X_BAY_E, z1: D.Z_FACADE - inch(4) });
  /* The returns are set in past the recess walls: centered on the wall's
     own inner face, a return's near side lands exactly in that plane. */
  for (const sx of [D.X_BAY_W + inch(11), D.X_BAY_E - inch(11)]) {
    crenellate(b, { ...par, x0: sx, z0: D.Z_FACADE - inch(4), x1: sx, z1: D.Z_CENTRAL_S_OUT });
  }

  /* ---- the front steps ----
     Six risers from the walk up to the portico floor, climbing north. */
  const FRONT_RUN = ftin(1, 2);
  steps(b, {
    axis: 'z', dir: 1,
    x0: -ftin(9, 0), x1: ftin(9, 0),
    z0: D.Z_FACADE - inch(8) - FRONT_RUN * 6, z1: 0,
    bottom: D.GRADE, top: 0, count: 6, run: FRONT_RUN,
    material: M.granite, tag: 'front-steps',
  });
  /* cheek walls either side, and the thin metal handrails the
     photographs show standing on them */
  for (const s of [-1, 1]) {
    const x = s * ftin(9, 3);
    trimBox(b, x - inch(5), D.GRADE, D.Z_FACADE - ftin(7, 6), x + inch(5), ftin(1, 8),
      D.Z_FACADE - inch(8), M.granite);
    ironRail(b, {
      x0: x, x1: x, z0: D.Z_FACADE - ftin(7, 0), z1: D.Z_FACADE - inch(10),
      y: ftin(1, 8), material: M.ironwork, height: ftin(2, 4),
    });
  }
  b.barrier({
    x0: D.X_BAY_W, x1: -ftin(9, 3), z0: D.Z_FACADE - inch(10), z1: D.Z_FACADE - inch(2),
    y0: 0, y1: ftin(2, 6), tag: 'porch-edge',
  });
  b.barrier({
    x0: ftin(9, 3), x1: D.X_BAY_E, z0: D.Z_FACADE - inch(10), z1: D.Z_FACADE - inch(2),
    y0: 0, y1: ftin(2, 6), tag: 'porch-edge',
  });

  /* ============================================================
     THE REAR PORCH
     ============================================================ */
  b.room({
    id: 'academy.porch.rear', name: 'Rear Porch',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_CENTRAL_N_OUT, z1: D.Z_PORCH_N,
    y0: 0, y1: D.REAR_PORCH_CEIL, floor: 1, outdoor: true,
  });
  b.detail(1.5);
  b.floor({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_CENTRAL_N_OUT, z1: D.Z_PORCH_N + inch(8),
    y: 0, material: M.porchDeck, thickness: ftin(2, 0), tag: 'porch',
  });

  /* Its roof: a lean-to on square posts at the garden edge. There is no
     second floor over it and there must not be -- the garden has to stay
     open to the sky right up to the back of the central block. */
  const postTop = D.REAR_PORCH_CEIL;
  for (let i = 0; i <= 5; i++) {
    const x = D.X_BAY_W + ftin(2, 0) + (D.BAY - ftin(4, 0)) * (i / 5);
    trimBox(b, x - inch(4), 0, D.Z_PORCH_N - ftin(1, 0) - inch(4),
      x + inch(4), postTop, D.Z_PORCH_N - ftin(1, 0) + inch(4), M.trimDark);
    b.col.addSolid({
      x0: x - inch(5), x1: x + inch(5),
      z0: D.Z_PORCH_N - ftin(1, 0) - inch(5), z1: D.Z_PORCH_N - ftin(1, 0) + inch(5),
      y0: 0, y1: postTop, tag: 'post', walkable: false, noOcclude: true,
    });
  }
  trimBox(b, D.X_BAY_W, postTop, D.Z_CENTRAL_N_OUT, D.X_BAY_E, postTop + ftin(1, 4),
    D.Z_PORCH_N + ftin(1, 6), M.roofSlate);
  b.headroom({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_CENTRAL_N_OUT, z1: D.Z_PORCH_N,
    y: postTop, tag: 'porch-soffit',
  });

  /* Steps down into the garden, on the center line. The measured plan
     shows a flight here and the visitor map draws it too. */
  /* Three risers down into the garden. They climb SOUTHWARD, from the
     garden up to the porch. */
  const GARDEN_RUN = ftin(1, 2);
  steps(b, {
    axis: 'z', dir: -1,
    x0: -ftin(6, 0), x1: ftin(6, 0),
    z0: D.Z_PORCH_N + inch(8) + GARDEN_RUN * 3, z1: 0,
    bottom: D.GARDEN_LEVEL, top: 0, count: 3, run: GARDEN_RUN,
    material: M.granite, tag: 'garden-steps',
  });
  /* the rest of the porch edge is a low curb, not a hole */
  for (const [x0, x1] of [[D.X_BAY_W, -ftin(6, 3)], [ftin(6, 3), D.X_BAY_E]]) {
    trimBox(b, x0, 0, D.Z_PORCH_N + inch(2), x1, ftin(1, 4), D.Z_PORCH_N + inch(10), M.granite);
    b.col.addSolid({
      x0, x1, z0: D.Z_PORCH_N + inch(2), z1: D.Z_PORCH_N + inch(10),
      y0: 0, y1: ftin(1, 4), tag: 'porch-curb', walkable: false, noOcclude: true,
    });
  }
}
