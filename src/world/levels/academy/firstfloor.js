/* ============================================================
   firstfloor.js -- the ground story.

   Room identity and partition topology come from the Augusta-Richmond
   County Museum visitor map. Dimensions come from the 1994 measured plan.
   THE DOOR SCHEDULE COMES FROM THE STAGE 2 BRIEF, which is authoritative
   where the visitor map is silent -- the visitor map is a simplified
   thing drawn for people finding the restroom, and it omits openings that
   are certainly there.

   The circulation that has to work, and does:

     central -> front porch          double doors, south
     central -> rear porch           double doors, north
     central -> Indians              south-west
     central -> inner Americana      south-east
     central -> west rear hall       north-west
     central -> east rear hall       north-east
     west rear hall -> rear porch    (in shell.js, the garden wall)
     east rear hall -> rear porch    (likewise)

   which closes both required loops -- the long one out through Indians
   and back through Americana, and the short one straight across the rear
   porch.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { chairRail, trimBox } from './parts.js';

/* Interior openings. `at` is an absolute coordinate along the wall. */
const door = (at, id, opt = {}) => ({
  at, kind: 'door',
  width: opt.width || D.DOOR_W,
  y0: 0, y1: opt.height || D.DOOR_H,
  door: { id, name: opt.name || 'door', hinge: opt.hinge || 'x0', swing: opt.swing || 1 },
});
/** A cased opening with no leaf in it -- the museum plan shows several. */
const arch = (at, opt = {}) => ({
  at, kind: 'arch', width: opt.width || ftin(5, 0), y0: 0, y1: opt.height || ftin(8, 6),
});

/**
 * One interior wall, with its doors.
 * @param w { axis, line, from, to, thickness, material, y0, y1, chunk, openings }
 */
export function partition(b, w) {
  const alongX = w.axis === 'x';
  const y0 = w.y0 === undefined ? 0 : w.y0;
  const y1 = w.y1 === undefined ? D.FLOOR1_CEIL : w.y1;
  if (w.chunk) b.chunk(w.chunk);
  const holes = (w.openings || []).map((o) => ({
    at: o.at - w.from, width: o.width, y0: o.y0, y1: o.y1, kind: o.kind,
  }));
  b.wall({
    x0: alongX ? w.from : w.line,
    z0: alongX ? w.line : w.from,
    x1: alongX ? w.to : w.line,
    z1: alongX ? w.line : w.to,
    y0, y1,
    thickness: w.thickness,
    material: w.material,
    innerMaterial: w.innerMaterial || w.material,
    flip: !!w.flip,
    openings: holes,
    tag: 'partition',
  });
  for (const o of (w.openings || [])) {
    if (!o.door) continue;
    b.door({
      y: y0,
      x: alongX ? o.at : w.line,
      z: alongX ? w.line : o.at,
      yaw: alongX ? 0 : Math.PI / 2,
      width: o.width,
      height: o.y1 - o.y0,
      depth: w.thickness,
      material: b.M.doorLeaf,
      frameMaterial: b.M.trimDark,
      ...o.door,
    });
  }
}

/** A floor slab plus the headroom above it, over a whole band. */
function slab(b, chunk, x0, x1, z0, z1, m) {
  b.chunk(chunk);
  b.detail(2.4);
  b.floor({ x0, x1, z0, z1, y: 0, material: m, thickness: ftin(1, 0), tag: 'floor1' });
}

export function buildFirstFloor(b) {
  const M = b.M;
  const P = { material: M.plaster, thickness: D.CROSS };
  const light = { material: M.plaster, thickness: D.PART };

  /* ============================================================
     FLOOR SLABS

     Laid band by band, edge to edge at the cross-wall center lines. A slab
     that stops at the plaster leaves a gap under every doorway, and the
     collider then drops the player for the two frames it takes to cross
     one. Stage 1 learned that the hard way; this is the fix applied from
     the start.
     ============================================================ */
  const MID_S_CL = D.Z_FB_N + D.CROSS / 2;
  const MID_N_CL = D.Z_MID_N + D.CROSS / 2;
  slab(b, 'floor1.west.front', D.X_W_OUT, D.X_BAY_W, D.Z_FACADE, MID_S_CL, M.heartPine);
  slab(b, 'floor1.west.mid', D.X_W_OUT, D.X_BAY_W, MID_S_CL, MID_N_CL, M.heartPine);
  slab(b, 'floor1.west.north', D.X_W_OUT, D.X_BAY_W, MID_N_CL, D.Z_N_OUT, M.heartPine);
  slab(b, 'floor1.east.front', D.X_BAY_E, D.X_E_OUT, D.Z_FACADE, MID_S_CL, M.heartPine);
  slab(b, 'floor1.east.mid', D.X_BAY_E, D.X_E_OUT, MID_S_CL, MID_N_CL, M.heartPine);
  slab(b, 'floor1.east.north', D.X_BAY_E, D.X_E_OUT, MID_N_CL, D.Z_N_OUT, M.heartPine);
  slab(b, 'floor1.central', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S_OUT, D.Z_CENTRAL_N_OUT, M.heartPine);

  /* ============================================================
     ROOMS
     ============================================================ */
  const X_DOCENT_E = D.X_W_IN + ft(18);
  const X_SHOP_W = D.X_E_IN - ft(18);

  const rooms = [
    /* ---- the center ---- */
    ['academy.central', 'Central Room', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N, M.plasterOchre],

    /* ---- west wing, south to north ---- */
    ['academy.west.docent', 'Docent Library', D.X_W_IN, X_DOCENT_E, D.Z_S_IN, D.Z_DOCENT_N, M.plaster],
    ['academy.west.store', 'West Store Room', X_DOCENT_E + D.PART, D.X_WING_W_IN, D.Z_S_IN, D.Z_DOCENT_N, M.plaster],
    ['academy.indians', 'Indians of the Southeast', D.X_W_IN, D.X_WING_W_IN, D.Z_INDIANS_S, D.Z_FB_N, M.plasterOchre],
    ['academy.west.stairhall', 'West Stair Hall', D.X_W_IN, D.X_W_HALL_W, D.Z_MID_S, D.Z_MID_N, M.plaster],
    ['academy.west.rearhall', 'West Rear Hall', D.X_W_HALL_W, D.X_WING_W_IN, D.Z_MID_S, D.Z_MID_N, M.plaster],
    ['academy.west.offices', 'Offices', D.X_W_IN, D.X_WING_W_IN, D.Z_NB_S, D.Z_N_IN, M.plasterGreen],

    /* ---- east wing, south to north ---- */
    ['academy.americana.main', 'Americana', D.X_WING_E_IN, X_SHOP_W, D.Z_S_IN, D.Z_DOCENT_N, M.plaster],
    ['academy.giftshop', 'Gift Shop', X_SHOP_W + D.PART, D.X_E_IN, D.Z_S_IN, D.Z_DOCENT_N, M.plaster],
    ['academy.americana.inner', 'Inner Americana', D.X_WING_E_IN, D.X_E_IN, D.Z_INDIANS_S, D.Z_FB_N, M.plasterOchre],
    ['academy.east.rearhall', 'East Rear Hall / USS Augusta', D.X_WING_E_IN, D.X_E_HALL_E, D.Z_MID_S, D.Z_MID_N, M.plaster],
    ['academy.east.stairhall', 'East Stair Hall', D.X_E_HALL_E, D.X_E_IN, D.Z_MID_S, D.Z_MID_N, M.plaster],
    ['academy.east.animal', 'Animal Room', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_NB_S, D.Z_ANIMAL_N, M.plasterGreen],
    ['academy.east.staff', 'Staff', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_STAFF_S, D.Z_N_IN, M.plasterGreen],
    ['academy.east.service', 'East Service Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_NB_S, D.Z_STRIP_S_N, M.plaster],
    ['academy.east.vestibule', 'East Vestibule', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_M_S, D.Z_STRIP_M_N, M.plaster],
    ['academy.east.council', 'Council Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_N_S, D.Z_N_IN, M.plasterGreen],
  ];

  for (const [id, name, x0, x1, z0, z1, m] of rooms) {
    b.room({ id, name, x0, x1, z0, z1, y0: 0, y1: D.FLOOR1_CEIL, floor: 1, material: 'wood' });
    b.detail(2.2);
    chairRail(b, { x0, x1, z0, z1, y: 0 }, M.trimDark);
    void m;
  }

  /* ============================================================
     THE CENTRAL ROOM'S SIX DIRECTIONS

     Its east and west walls are continuous with the garden-facing walls
     of the rear wings above them -- one masonry line each, running the
     whole depth of the building. Two doorways in each: one down at the
     exhibit rooms, one up at the rear halls.
     ============================================================ */
  for (const s of [-1, 1]) {
    const west = s < 0;
    partition(b, {
      chunk: 'academy.central',
      axis: 'z', line: west ? D.X_BAY_W - D.EXT / 2 : D.X_BAY_E + D.EXT / 2,
      from: D.Z_CENTRAL_S_OUT, to: D.Z_CENTRAL_N_OUT,
      thickness: D.EXT, material: M.plasterOchre,
      innerMaterial: M.plasterOchre,
      openings: [
        door(ft(-6), west ? 'central-indians' : 'central-americana',
          { name: west ? 'door to Indians of the Southeast' : 'door to Americana',
            width: ftin(4, 0), height: ftin(8, 6), hinge: west ? 'x0' : 'x1', swing: west ? 1 : -1 }),
        door(ft(12.5), west ? 'central-westhall' : 'central-easthall',
          { name: 'hall door', width: ftin(3, 8), height: ftin(8, 0),
            hinge: west ? 'x1' : 'x0', swing: west ? -1 : 1 }),
      ],
    });
  }

  /* ============================================================
     WEST WING
     ============================================================ */

  /* Docent band: the library and the store room beside it. */
  partition(b, {
    chunk: 'academy.west.docent',
    axis: 'z', line: X_DOCENT_E + D.PART / 2,
    from: D.Z_S_IN, to: D.Z_DOCENT_N,
    ...light,
    openings: [door(ft(-24.5), 'docent-store', { name: 'store room door' })],
  });

  /* Docent band to Indians: two openings, one from each room. */
  partition(b, {
    chunk: 'academy.indians',
    axis: 'x', line: D.Z_DOCENT_N + D.CROSS / 2,
    from: D.X_W_IN, to: D.X_WING_W_IN, ...P,
    openings: [
      door(ft(-45), 'docent-indians', { name: 'library door' }),
      door(ft(-30), 'store-indians', { name: 'store room door' }),
    ],
  });

  /* Indians to the middle band: into the stair hall and into the rear
     hall. This pair is what makes the long circulation loop close. */
  partition(b, {
    chunk: 'academy.west.rearhall',
    axis: 'x', line: D.Z_FB_N + D.CROSS / 2,
    from: D.X_W_IN, to: D.X_WING_W_IN, ...P,
    openings: [
      door(ft(-49), 'indians-weststair', { name: 'stair hall door' }),
      arch(ft(-32), { width: ftin(5, 6) }),
    ],
  });

  /* Stair hall to rear hall. */
  partition(b, {
    chunk: 'academy.west.rearhall',
    axis: 'z', line: D.X_W_HALL_W - D.PART / 2,
    from: D.Z_MID_S, to: D.Z_MID_N,
    ...light,
    openings: [door(ft(12), 'weststair-westhall', { name: 'stair hall door', hinge: 'x1', swing: -1 })],
  });

  /* Middle band to the Offices: the west inner circulation the visitor
     map shows running up the wing. */
  partition(b, {
    chunk: 'academy.west.offices',
    axis: 'x', line: D.Z_MID_N + D.CROSS / 2,
    from: D.X_W_IN, to: D.X_WING_W_IN, ...P,
    openings: [
      door(ft(-49), 'weststair-offices', { name: 'office door' }),
      arch(ft(-32), { width: ftin(5, 0) }),
    ],
  });

  /* The restroom, tucked into the stair hall beside the flight. */
  /* North of the upper flight, against the outer wall, which is the only
     corner of the stair hall the staircase does not occupy. */
  const RX0 = D.X_W_IN, RX1 = D.X_W_IN + ftin(7, 6);
  const RZ0 = D.Z_MID_N - ftin(3, 10), RZ1 = D.Z_MID_N;
  b.chunk('academy.west.stairhall');
  partition(b, {
    axis: 'x', line: RZ0 - D.PART / 2, from: RX0, to: RX1 + D.PART,
    ...light, y1: D.FLOOR1_CEIL,
    openings: [door(RX0 + ftin(3, 4), 'restroom', { name: 'restroom door', width: ftin(2, 8) })],
  });
  partition(b, {
    axis: 'z', line: RX1 + D.PART / 2, from: RZ0 - D.PART, to: RZ1,
    ...light, y1: D.FLOOR1_CEIL, openings: [],
  });
  b.room({
    id: 'academy.west.restroom', name: 'Restroom',
    x0: RX0, x1: RX1, z0: RZ0, z1: RZ1, y0: 0, y1: D.FLOOR1_CEIL, floor: 1,
  });

  /* ============================================================
     EAST WING -- the south half mirrors the west
     ============================================================ */
  partition(b, {
    chunk: 'academy.giftshop',
    axis: 'z', line: X_SHOP_W + D.PART / 2,
    from: D.Z_S_IN, to: D.Z_DOCENT_N,
    ...light,
    openings: [door(ft(-24.5), 'americana-shop', { name: 'gift shop door', hinge: 'x1', swing: -1 })],
  });
  partition(b, {
    chunk: 'academy.americana.inner',
    axis: 'x', line: D.Z_DOCENT_N + D.CROSS / 2,
    from: D.X_WING_E_IN, to: D.X_E_IN, ...P,
    openings: [
      door(ft(30), 'americana-inner', { name: 'exhibit door' }),
      door(ft(45), 'shop-inner', { name: 'gift shop door' }),
    ],
  });
  partition(b, {
    chunk: 'academy.east.rearhall',
    axis: 'x', line: D.Z_FB_N + D.CROSS / 2,
    from: D.X_WING_E_IN, to: D.X_E_IN, ...P,
    openings: [
      arch(ft(32), { width: ftin(5, 6) }),
      door(ft(49), 'americana-eaststair', { name: 'stair hall door' }),
    ],
  });
  partition(b, {
    chunk: 'academy.east.rearhall',
    axis: 'z', line: D.X_E_HALL_E + D.PART / 2,
    from: D.Z_MID_S, to: D.Z_MID_N,
    ...light,
    openings: [door(ft(12), 'easthall-eaststair', { name: 'stair hall door' })],
  });

  /* ---- the east wing's north band: a column of rooms and a strip ---- */
  partition(b, {
    chunk: 'academy.east.animal',
    axis: 'x', line: D.Z_MID_N + D.CROSS / 2,
    from: D.X_WING_E_IN, to: D.X_E_IN, ...P,
    openings: [
      arch(ft(32), { width: ftin(5, 0) }),
      door(ft(49), 'eaststair-service', { name: 'service door' }),
    ],
  });
  /* the longitudinal partition between the column and the strip */
  partition(b, {
    chunk: 'academy.east.service',
    axis: 'z', line: D.X_EAST_COL_E + D.PART / 2,
    from: D.Z_NB_S, to: D.Z_N_IN,
    ...light,
    openings: [
      door(ft(30), 'animal-service', { name: 'service door' }),
      door(ft(43), 'animal-vestibule', { name: 'vestibule door', hinge: 'x1', swing: -1 }),
      door(ft(52), 'staff-council', { name: 'council door' }),
    ],
  });
  /* the column's own cross partition, Animal Room to Staff */
  partition(b, {
    chunk: 'academy.east.staff',
    axis: 'x', line: D.Z_ANIMAL_N + D.PART / 2,
    from: D.X_WING_E_IN, to: D.X_EAST_COL_E,
    ...light,
    openings: [door(ft(32), 'animal-staff', { name: 'staff door' })],
  });
  /* and the strip's two cross partitions */
  partition(b, {
    chunk: 'academy.east.vestibule',
    axis: 'x', line: D.Z_STRIP_S_N + D.PART / 2,
    from: D.X_EAST_STRIP_W, to: D.X_E_IN,
    ...light,
    openings: [door(ft(48.5), 'service-vestibule', { name: 'vestibule door' })],
  });
  partition(b, {
    chunk: 'academy.east.council',
    axis: 'x', line: D.Z_STRIP_N_S + D.PART / 2,
    from: D.X_EAST_STRIP_W, to: D.X_E_IN,
    ...light,
    openings: [door(ft(48.5), 'vestibule-council', { name: 'council door' })],
  });

  /* ============================================================
     A beadboard ceiling line, expressed as the shadow gap at the wall
     head. The ceiling itself is the soffit of the second-floor slab.
     ============================================================ */
  for (const [id, , x0, x1, z0, z1] of rooms) {
    b.chunk(id);
    trimBox(b, x0, D.FLOOR1_CEIL - inch(7), z0, x1, D.FLOOR1_CEIL, z0 + inch(2), M.trimDark);
    trimBox(b, x0, D.FLOOR1_CEIL - inch(7), z1 - inch(2), x1, D.FLOOR1_CEIL, z1, M.trimDark);
    trimBox(b, x0, D.FLOOR1_CEIL - inch(7), z0, x0 + inch(2), D.FLOOR1_CEIL, z1, M.trimDark);
    trimBox(b, x1 - inch(2), D.FLOOR1_CEIL - inch(7), z0, x1, D.FLOOR1_CEIL, z1, M.trimDark);
  }
}
