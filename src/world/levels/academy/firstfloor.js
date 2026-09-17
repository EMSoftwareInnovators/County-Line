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
import { column, mantel, openingsAround, trimBox, wainscot } from './parts.js';

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
 *
 * This is a thin adapter over `b.wallWith()` and it must stay one: the
 * whole point of that call is that the hole and the thing hung in it are
 * ONE declaration, derived from one set of numbers. Stage 2 hand-rolled
 * the pair here -- wall from one set of coordinates, door from another --
 * and drift followed immediately, because the door loop took the leaf's
 * base height from the WALL's foot rather than from its own opening. A
 * wall that begins below its doorway (the front porch's flanking walls
 * start two feet under grade) then hung its leaf five feet underground
 * with the masonry meant for below the threshold standing in the doorway.
 *
 * So: build the opening list, hand it over, and let one place do the
 * arithmetic.
 *
 * @param w { axis, line, from, to, thickness, material, y0, y1, chunk, openings }
 */
export function partition(b, w) {
  const alongX = w.axis === 'x';
  const y0 = w.y0 === undefined ? 0 : w.y0;
  const y1 = w.y1 === undefined ? D.FLOOR1_CEIL : w.y1;
  if (w.chunk) b.chunk(w.chunk);
  const holes = (w.openings || []).map((o) => ({
    at: o.at - w.from, width: o.width, y0: o.y0, y1: o.y1, kind: o.kind,
    door: o.door && {
      /* Interior leaves are painted, and their casings are painted too --
         the dark-stained joinery Stage 2 used is not what any photograph
         of the inside of this building shows. */
      material: b.M.doorPainted, frameMaterial: b.M.paintWhite, ...o.door,
    },
  }));
  return b.wallWith({
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
}

/** A floor slab plus the headroom above it, over a whole band. */
function slab(b, chunk, x0, x1, z0, z1, m) {
  b.chunk(chunk);
  b.detail(2.4);
  b.floor({ x0, x1, z0, z1, y: 0, material: m, thickness: ftin(1, 0), tag: 'floor1' });
}

/* ============================================================
   THE STAIR HALL ZONE

   One function, both wings, built entirely from the rectangles in
   dimensions.js. Stage 2 had this as three separate patches with their
   own coordinates and it produced a restroom inside the upper flight, a
   door opening under a staircase and a second door opening into the side
   of one. Rebuilt rather than patched, which is what the brief asked for.

   What it makes, per wing:

     - the wall between the rear hall and the stair hall, with the two
       doorways in it;
     - the partition between the staircase and the restroom;
     - the restroom, as a real enclosed room with its own ceiling.

   The staircase itself is stairs.js, from the same constants.
   ============================================================ */
function stairHallZone(b, side) {
  const M = b.M;
  const west = side === 'west';
  const light = { material: M.plaster, thickness: D.PART };
  const hallLine = west ? D.X_W_HALL_W - D.PART / 2 : D.X_E_HALL_E + D.PART / 2;
  const inner = west ? D.X_W_IN : D.X_E_IN;
  const outerWall = west ? D.X_W_HALL_W : D.X_E_HALL_E;
  const stair = west ? 'academy.west.stairhall' : 'academy.east.stairhall';
  const rear = west ? 'academy.west.rearhall' : 'academy.east.rearhall';

  const x0 = Math.min(inner, outerWall), x1 = Math.max(inner, outerWall);

  /* The rear hall's west (or east) wall.

     THERE IS NO DOOR IN FRONT OF EITHER STAIRCASE. The real building
     does not have one and neither does this: what is at the foot of the
     flight is a cased opening the width of the stair, which is what a
     stair hall off a circulation hall actually looks like. The leaf that
     used to hang there also had its jamb on the flight's stringer.

     Beside it, the door into the room across the north end of the band:
     the restroom in the west wing, the east entrance in the east. */
  partition(b, {
    chunk: rear,
    axis: 'z', line: hallLine,
    from: D.Z_MID_S, to: D.Z_MID_N,
    ...light,
    openings: [
      arch(D.Z_FLIGHT_A, { width: D.STAIR_WIDTH, height: ftin(9, 0) }),
      door((D.Z_SERVICE_S + D.Z_SERVICE_N) / 2, west ? 'restroom' : 'east-entry-hall',
        west
          ? { name: 'restroom door', width: D.SERVICE_DOOR_W, height: D.SERVICE_DOOR_H }
          : { name: 'entrance door', width: D.DOOR_W, height: D.DOOR_H }),
    ],
  });

  /* The partition across the stair hall, between the well and the room
     north of it. It is a wall, not a leftover. */
  b.chunk(stair);
  partition(b, {
    axis: 'x', line: D.Z_STAIR_N + D.PART / 2,
    from: x0, to: x1,
    ...light, y1: west ? D.CEIL_SERVICE : D.CEIL_SECONDARY, openings: [],
  });

  /* ---- and the room itself ----
     THERE IS ONE RESTROOM IN THE BUILDING and it is in the west wing.
     The matching space in the east wing is not a second restroom: it is
     the entrance lobby the east side door opens into, which is why that
     door is here and not down beside the staircase where Stage 2.1 first
     put it -- there is no floor beside a staircase that fills its hall. */
  const id = west ? 'academy.west.restroom' : 'academy.east.entry';
  b.room({
    id, name: west ? 'Restroom' : 'East Entrance',
    x0, x1, z0: D.Z_SERVICE_S + D.PART, z1: D.Z_SERVICE_N,
    y0: 0, y1: west ? D.CEIL_SERVICE : D.CEIL_SECONDARY, floor: 1,
  });
  b.chunk(id);
  b.detail(2.2);
  b.ceiling({
    x0, x1, z0: D.Z_SERVICE_S + D.PART, z1: D.Z_SERVICE_N,
    y: west ? D.CEIL_SERVICE : D.CEIL_SECONDARY,
    material: west ? M.beadboard : M.plasterCeiling, thickness: inch(6),
    tag: 'service-ceiling',
  });
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

  /* THREE CEILING CLASSES AND NO MORE. The photographs show very tall
     first-floor rooms; the number they are tall is not documented
     anywhere, so it is estimated once (dimensions.js) and applied by
     class rather than varied room by room. `P` is the principal height
     the central room reaches, `S` the secondary rooms' plaster ceiling
     nine inches under the same structural floor, `V` the furred-down
     service ceiling over the closets. */
  const P_ = D.CEIL_PRINCIPAL, S_ = D.CEIL_SECONDARY, V_ = D.CEIL_SERVICE;

  const rooms = [
    /* ---- the center ---- */
    ['academy.central', 'Central Room', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N, P_],

    /* ---- west wing, south to north ---- */
    ['academy.west.docent', 'Docent Library', D.X_W_IN, X_DOCENT_E, D.Z_S_IN, D.Z_DOCENT_N, S_],
    ['academy.west.store', 'West Store Room', X_DOCENT_E + D.PART, D.X_WING_W_IN, D.Z_S_IN, D.Z_DOCENT_N, V_],
    ['academy.indians', 'Indians of the Southeast', D.X_W_IN, D.X_WING_W_IN, D.Z_INDIANS_S, D.Z_FB_N, S_],
    /* THE STAIR HALLS GET NO CEILING. They are the same footprint as the
       well, and the well is a hole in the floor above -- a plaster
       ceiling over one is a ceiling across a staircase, which stops the
       player's head at about the ninth riser and then drops them back
       down it. `P_` here means "reaches the structural floor", and over
       the well there is no structural floor to reach. */
    ['academy.west.stairhall', 'West Stair Hall', D.X_W_IN, D.X_W_HALL_W, D.Z_MID_S, D.Z_STAIR_N, P_],
    ['academy.west.rearhall', 'West Rear Hall', D.X_W_HALL_W, D.X_WING_W_IN, D.Z_MID_S, D.Z_MID_N, S_],
    ['academy.west.offices', 'Offices', D.X_W_IN, D.X_WING_W_IN, D.Z_NB_S, D.Z_N_IN, S_],

    /* ---- east wing, south to north ----
       THE GIFT SHOP IS ONE ROOM, and it is the room the front porch opens
       into AND the room the central room opens into. Stage 2 had those as
       two separate spaces in two bands with the porch door landing in one
       and the central room's door in the other, so the Gift Shop was
       somewhere you could not reach from the hall. The east front block is now two
       full-depth columns instead of two bands, which is the only way the
       two doors can share a room. The west keeps the visitor map's own
       arrangement, because Indians of the Southeast runs the full width
       of that wing, and a gift shop by the entrance has no mirror image. */
    ['academy.giftshop', 'Gift Shop', D.X_WING_E_IN, X_SHOP_W, D.Z_S_IN, D.Z_FB_N, S_],
    ['academy.americana.main', 'Americana', X_SHOP_W + D.PART, D.X_E_IN, D.Z_S_IN, D.Z_FB_N, S_],
    ['academy.east.rearhall', 'East Rear Hall / USS Augusta', D.X_WING_E_IN, D.X_E_HALL_E, D.Z_MID_S, D.Z_MID_N, S_],
    ['academy.east.stairhall', 'East Stair Hall', D.X_E_HALL_E, D.X_E_IN, D.Z_MID_S, D.Z_STAIR_N, P_],
    ['academy.east.animal', 'Animal Room', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_NB_S, D.Z_ANIMAL_N, S_],
    ['academy.east.staff', 'Staff', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_STAFF_S, D.Z_N_IN, S_],
    ['academy.east.service', 'East Service Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_NB_S, D.Z_STRIP_S_N, S_],
    ['academy.east.vestibule', 'East Vestibule', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_M_S, D.Z_STRIP_M_N, V_],
    ['academy.east.council', 'Council Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_N_S, D.Z_N_IN, S_],
  ];

  for (const [id, name, x0, x1, z0, z1, ceil] of rooms) {
    b.room({ id, name, x0, x1, z0, z1, y0: 0, y1: ceil, floor: 1, material: 'wood' });
    b.detail(2.2);
    /* A plaster ceiling where the room stops short of the structural
       floor above it. The principal rooms reach it and get none. */
    if (ceil < D.FLOOR1_CEIL - 1e-6) {
      b.ceiling({
        x0, x1, z0, z1, y: ceil,
        material: M.plasterCeiling, thickness: inch(6), tag: 'ceiling1',
      });
    }
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
      /* FOUR DOORWAYS, ONE SIZE, MIRRORED ABOUT THE ROOM'S CENTER. See
         the note in dimensions.js: this building is symmetrical and its
         openings were not.

         The south-east one leads to the GIFT SHOP -- the same room the
         front porch opens into on that side -- which is why its id says
         americana and its name does not. The id is what the Stage 2 door
         schedule enumerates and what the tests and the save format refer
         to, so it stays; the destination is what changed. */
      openings: [
        door(-D.CENTRAL_DOOR_Z, west ? 'central-indians' : 'central-americana',
          { name: west ? 'door to Indians of the Southeast' : 'door to the Gift Shop',
            width: D.CENTRAL_DOOR_W, height: D.CENTRAL_DOOR_H,
            hinge: west ? 'x0' : 'x1', swing: west ? 1 : -1 }),
        door(D.CENTRAL_DOOR_Z, west ? 'central-westhall' : 'central-easthall',
          { name: 'hall door', width: D.CENTRAL_DOOR_W, height: D.CENTRAL_DOOR_H,
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

  /* Indians to the middle band. ONE opening, the cased arch the visitor
     map shows on the wing's inner circulation line. Stage 2 also put a
     door at x = -49 straight into the stair hall -- which is underneath
     the first flight, so it opened onto the soffit of a staircase. It was
     invented, it was wrong, and it is gone. */
  partition(b, {
    chunk: 'academy.west.rearhall',
    axis: 'x', line: D.Z_FB_N + D.CROSS / 2,
    from: D.X_W_IN, to: D.X_WING_W_IN, ...P,
    openings: [arch(ft(-32), { width: ftin(5, 6) })],
  });

  /* ---- THE STAIR HALL ZONE ----
     Built from the rectangles set out in dimensions.js. Two doors in the
     rear hall's west wall and nothing else: one at the FOOT OF THE FLIGHT,
     so walking through it is stepping onto the bottom tread, and one into
     the restroom, which is its own enclosed room across the north end and
     touches the staircase nowhere. */
  stairHallZone(b, 'west');

  /* Middle band to the Offices: the inner circulation the visitor map
     shows running up the wing. */
  partition(b, {
    chunk: 'academy.west.offices',
    axis: 'x', line: D.Z_MID_N + D.CROSS / 2,
    from: D.X_W_IN, to: D.X_WING_W_IN, ...P,
    openings: [arch(ft(-32), { width: ftin(5, 0) })],
  });

  /* ============================================================
     EAST WING -- the south half mirrors the west
     ============================================================ */
  /* The one partition in the east front block: between the Gift Shop and
     Americana, running the whole depth, with a door at each end. */
  partition(b, {
    chunk: 'academy.giftshop',
    axis: 'z', line: X_SHOP_W + D.PART / 2,
    from: D.Z_S_IN, to: D.Z_FB_N,
    ...light,
    openings: [
      door(ft(-24.5), 'americana-south', { name: 'Americana door', hinge: 'x1', swing: -1 }),
      door(ft(-6), 'americana-north', { name: 'Americana door' }),
    ],
  });
  partition(b, {
    chunk: 'academy.east.rearhall',
    axis: 'x', line: D.Z_FB_N + D.CROSS / 2,
    from: D.X_WING_E_IN, to: D.X_E_IN, ...P,
    openings: [arch(ft(32), { width: ftin(5, 6) })],
  });
  stairHallZone(b, 'east');

  /* ---- the east wing's north band: a column of rooms and a strip ---- */
  partition(b, {
    chunk: 'academy.east.animal',
    axis: 'x', line: D.Z_MID_N + D.CROSS / 2,
    from: D.X_WING_E_IN, to: D.X_E_IN, ...P,
    openings: [arch(ft(32), { width: ftin(5, 0) })],
  });
  /* the longitudinal partition between the column and the strip */
  partition(b, {
    chunk: 'academy.east.service',
    axis: 'z', line: D.X_EAST_COL_E + D.PART / 2,
    from: D.Z_NB_S, to: D.Z_N_IN,
    ...light,
    openings: [
      door(ft(30), 'animal-service', { name: 'service door' }),
      /* The Animal Room and the vestibule only share 2'8" of wall -- the
         Animal/Staff cross wall lands right beside this opening -- so it
         is a service door at the width that actually fits, not a full one
         with a wall across its jamb. */
      door(ftin(40, 1), 'animal-vestibule',
        { name: 'vestibule door', width: ftin(2, 6), height: D.SERVICE_DOOR_H,
          hinge: 'x1', swing: -1 }),
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
  /* ---- wainscot ----
     LAST, because it has to know where the doorways are, and it asks the
     level rather than a second list of its own. Painted beadboard with a
     capping rail and a substantial baseboard, which is what every
     interior photograph of this building shows along the bottom of every
     wall -- stopping, as a board on a wall does, at every opening. */
  for (const [id, , x0, x1, z0, z1] of rooms) {
    b.chunk(id);
    b.detail(2.2);
    const r = { x0, x1, z0, z1, y: 0 };
    wainscot(b, r, {
      height: D.WAINSCOT_H, cap: D.WAINSCOT_CAP, base: D.BASE_H,
      gaps: openingsAround(b.level, r),
    });
  }

  for (const [id, , x0, x1, z0, z1, ceil] of rooms) {
    b.chunk(id);
    const y = ceil - inch(9);
    trimBox(b, x0, y, z0, x1, ceil, z0 + inch(3), M.paintWhite);
    trimBox(b, x0, y, z1 - inch(3), x1, ceil, z1, M.paintWhite);
    trimBox(b, x0, y, z0, x0 + inch(3), ceil, z1, M.paintWhite);
    trimBox(b, x1 - inch(3), y, z0, x1, ceil, z1, M.paintWhite);
  }

  /* ============================================================
     THE CENTRAL ROOM'S OWN CHARACTER

     From the large interior photograph: slender white painted structural
     columns floor to ceiling, a plain plaster ceiling over them, the tall
     sash windows of the shell, tall doors, beadboard wainscot, and a
     painted shelf mantel on one wall.

     What is NOT taken from that photograph is everything that is
     obviously of its own decade -- the carpet, the track lighting, the
     tables, the laptops. County Line is set in 1998 and the photographs
     are architectural references, not a set dressing list.
     ============================================================ */
  b.chunk('academy.central');
  b.detail(1.2);
  for (const c of D.CENTRAL_ROOM_COLUMNS) {
    column(b, {
      x: c.x, z: c.z, y: 0, top: D.CEIL_PRINCIPAL,
      dia: D.INT_COLUMN_DIA, base: D.INT_COLUMN_BASE_H, cap: D.INT_COLUMN_CAP_H,
      material: M.paintWhite,
    });
  }
  /* ONE mantel, on the central room's west wall between its two doorways,
     which is where the interior photograph shows a painted shelf mantel.
     It is not repeated anywhere else in the building: the other rooms may
     well have had them, and there is no reference that says which. */
  mantel(b, {
    axis: 'z', line: D.X_BAY_W, at: ft(3), outward: 1,
    width: ftin(5, 6), height: ftin(4, 8), y: 0, material: M.paintWhite,
  });
  /* Surface conduit, run at picture-rail height and dropped to a switch
     beside each doorway -- visible in every photograph of the interior
     and one of the things that says "an old building still in use". */
  b.detail(3.0);
  for (const zz of [D.Z_CENTRAL_S + inch(6), D.Z_CENTRAL_N - inch(6)]) {
    trimBox(b, D.X_BAY_W, D.PICTURE_RAIL, zz - inch(1),
      D.X_BAY_E, D.PICTURE_RAIL + inch(2), zz + inch(1), M.trimDark);
  }
}
