/* ============================================================
   porches.js -- the front porch, the gallery over it, and the rear porch.

   BOTH PORCHES ARE OUTDOORS. That is the whole point of them and the
   thing most easily lost: the front porch is a recessed loggia between
   the two projecting front blocks, and the rear porch is a covered strip
   along the south edge of the garden. Neither is a lobby, a hall or a
   concourse. You can see the sky from the front steps, and from the rear
   porch you can look straight up between the two wings.

   The front is where Goodrich's cast-iron colonnade goes -- two tiers of
   it, because the upper gallery is as much of the front elevation as the
   lower one. It is the reason the center of the façade reads as light and
   open between two heavy crenellated masses.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { colonnade, ironRail, steps, trimBox } from './parts.js';
import { partition } from './firstfloor.js';

export function buildPorches(b) {
  const M = b.M;

  /* ============================================================
     THE FRONT PORCH
     ============================================================ */
  b.room({
    id: 'academy.porch.front', name: 'Front Porch',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y0: 0, y1: D.PORCH_CEIL, floor: 1, outdoor: true,
  });
  b.detail(1.6);
  b.floor({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE - inch(8), z1: D.Z_CENTRAL_S_OUT,
    y: 0, material: M.porchDeck, thickness: ftin(2, 6), tag: 'porch',
  });

  /* The flanking walls of the recess. Each has a door into the room
     behind it -- the measured plan shows an opening at both ends of the
     porch, and a front porch you cannot get off except through the middle
     would be a strange thing to build. */
  for (const s of [-1, 1]) {
    const west = s < 0;
    partition(b, {
      chunk: 'academy.porch.front',
      axis: 'z', line: west ? D.X_BAY_W - D.EXT / 2 : D.X_BAY_E + D.EXT / 2,
      from: D.Z_FACADE, to: D.Z_CENTRAL_S_OUT,
      thickness: D.EXT, material: M.stucco, innerMaterial: M.plaster, flip: west,
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

  /* The colonnade, lower tier. Six columns across 44'3" gives a bay of
     just under nine feet, which is the spacing the elevation wants: any
     fewer and it reads as a garage, any more and it reads as a cloister. */
  b.chunk('academy.porch.front');
  b.detail(1.4);
  colonnade(b, {
    x0: D.X_BAY_W + ftin(2, 6), x1: D.X_BAY_E - ftin(2, 6),
    z: D.Z_FACADE + ftin(1, 2), y: 0, top: D.PORCH_CEIL,
    count: 6, material: M.castIron, plinthMaterial: M.granite,
  });

  /* The front steps, and the plinth they come off. Centered on the doors. */
  /* Six risers from the ground to the porch deck. They climb NORTHWARD,
     which means the flight starts seven feet south of the porch edge --
     laying them the other way round builds a flight that rises away from
     the door. */
  const FRONT_RUN = ftin(1, 2);
  steps(b, {
    axis: 'z', dir: 1,
    x0: -ftin(9, 0), x1: ftin(9, 0),
    z0: D.Z_FACADE - inch(8) - FRONT_RUN * 6, z1: 0,
    bottom: D.GRADE, top: 0, count: 6, run: FRONT_RUN,
    material: M.granite, tag: 'front-steps',
  });
  /* cheek walls either side of the flight, so the drop off the porch edge
     is a thing you can see as well as a thing you bump into */
  for (const s of [-1, 1]) {
    const x = s * ftin(9, 3);
    trimBox(b, x - inch(5), D.GRADE, D.Z_FACADE - ftin(7, 6), x + inch(5), ftin(1, 8),
      D.Z_FACADE - inch(8), M.granite);
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
     THE GALLERY -- the upper tier of the same colonnade
     ============================================================ */
  b.room({
    id: 'academy.gallery', name: 'Front Gallery',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y0: D.FLOOR2, y1: D.ROOF, floor: 2, outdoor: true,
  });
  b.detail(1.6);
  b.floor({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE - inch(8), z1: D.Z_CENTRAL_S_OUT,
    y: D.FLOOR2, material: M.porchDeck, soffit: M.beadboard,
    thickness: D.FLOOR2 - D.PORCH_CEIL, tag: 'gallery',
  });
  b.headroom({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y: D.PORCH_CEIL, tag: 'porch-soffit',
  });
  colonnade(b, {
    x0: D.X_BAY_W + ftin(2, 6), x1: D.X_BAY_E - ftin(2, 6),
    z: D.Z_FACADE + ftin(1, 2), y: D.FLOOR2, top: D.ROOF - ftin(1, 6),
    count: 6, material: M.castIron, plinthMaterial: M.castIron,
  });
  ironRail(b, {
    x0: D.X_BAY_W + inch(4), x1: D.X_BAY_E - inch(4),
    z0: D.Z_FACADE + ftin(1, 2), z1: D.Z_FACADE + ftin(1, 2),
    y: D.FLOOR2, material: M.castIron,
  });
  b.headroom({
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_FACADE, z1: D.Z_CENTRAL_S_OUT,
    y: D.ROOF - ftin(1, 6), tag: 'gallery-soffit',
  });

  /* ============================================================
     THE REAR PORCH
     ============================================================ */
  b.room({
    id: 'academy.porch.rear', name: 'Rear Porch',
    x0: D.X_BAY_W, x1: D.X_BAY_E, z0: D.Z_CENTRAL_N_OUT, z1: D.Z_PORCH_N,
    y0: 0, y1: D.REAR_PORCH_CEIL, floor: 1, outdoor: true,
  });
  b.detail(1.8);
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
