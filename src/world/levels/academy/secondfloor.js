/* ============================================================
   secondfloor.js -- the upper story.

   The shape that matters here is the shape that is MISSING. The second
   floor exists over the two rear wings and over the central block, and
   over nothing else. There is no floor over the rear porch and no floor
   over the garden, and the two upper wings do not touch each other at any
   point north of the central block. Standing in the garden and looking
   up, you see sky between them, with a range of upper windows down each
   side. That is the single most characteristic thing about this building
   and the easiest thing to accidentally destroy.

   Room identity is from the museum's second-floor visitor map:
   Augusta-Richmond County History and Rotating Exhibits west, Archives,
   Rocks & Minerals and Natural History east, and the War Room / Modern
   Mammals pair across the center, which the same map annotates as the
   common meeting room.

   ------------------------------------------------------------
   STAGE 2.1, SECOND PASS
   ------------------------------------------------------------
   This story was finished to a different standard from the one below it
   and it showed. Three things were wrong with it:

     * it was trimmed with a DARK chair rail and a dark cornice while the
       floor below had painted beadboard wainscot and a painted cornice,
       so the two stories did not look like the same building;
     * that chair rail ran straight across the stairwell and across every
       doorway, because it was drawn as a band round a rectangle rather
       than as a board on a wall;
     * the east wing's north band left a strip of floor belonging to no
       room at all -- Rocks & Minerals was a corner and Archives was laid
       over the rest of the band, and between them was a piece of second
       floor that `roomAt` returned nothing for.

   All three are fixed here, and the four doorways out of the upper
   central room are now the same size at the same station as the four
   below them, mirrored about Z = 0.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { openingsAround, trimBox, wainscot } from './parts.js';
import { partition } from './firstfloor.js';
import { stairWells } from './stairs.js';

/** A second-floor slab: walkable on top, beadboard underneath, and the
    headroom it gives the story below. */
function slab(b, chunk, x0, x1, z0, z1) {
  if (x1 - x0 < 1e-6 || z1 - z0 < 1e-6) return;
  b.chunk(chunk);
  /* See the note on the first floor's slabs: big horizontal planes are
     where affine texture mapping shows, so they are subdivided finer. */
  b.detail(1.5);
  b.floor({
    x0, x1, z0, z1, y: D.FLOOR2,
    /* BEADED BOARD UNDERNEATH. The ceilings in this building are beaded
       board and that is what the room below sees. Stage 2.1 swapped them
       for flat plaster because the bead pitch was aliasing into diagonal
       static at 320x240 -- the answer to that was a wider board, which
       the texture now has, not a different ceiling. */
    material: b.M.heartPine, soffit: b.M.beadboard,
    thickness: D.FLOOR_STRUCTURE, tag: 'floor2',
  });
  b.headroom({ x0, x1, z0, z1, y: D.FLOOR1_CEIL, tag: 'floor2-soffit' });
}

/** A ceiling over the top story. */
function ceil(b, chunk, x0, x1, z0, z1) {
  b.chunk(chunk);
  b.detail(1.5);
  b.ceiling({
    x0, x1, z0, z1, y: D.FLOOR2_CEIL,
    material: b.M.beadboard, thickness: ftin(1, 0), tag: 'ceiling2',
  });
}

export function buildSecondFloor(b) {
  const M = b.M;
  const P = { material: M.plaster, thickness: D.CROSS };
  const light = { material: M.plaster, thickness: D.PART };
  const MID_S_CL = D.Z_FB_N + D.CROSS / 2;
  const MID_N_CL = D.Z_MID_N + D.CROSS / 2;
  const wells = stairWells();

  /* ============================================================
     SLABS

     The wings get theirs in three bands, as downstairs. The middle band
     is laid AROUND the stairwell rather than over it: four pieces, which
     is what a hole in a floor costs.
     ============================================================ */
  for (const side of ['west', 'east']) {
    const west = side === 'west';
    const wx0 = west ? D.X_W_OUT : D.X_BAY_E;
    const wx1 = west ? D.X_BAY_W : D.X_E_OUT;
    const well = wells[side];

    slab(b, `floor2.${side}.front`, wx0, wx1, D.Z_FACADE, MID_S_CL);
    slab(b, `floor2.${side}.north`, wx0, wx1, MID_N_CL, D.Z_N_OUT);

    // the middle band, in four pieces round the well
    const c = `floor2.${side}.mid`;
    slab(b, c, wx0, wx1, MID_S_CL, well.z0);              // south of the well
    slab(b, c, wx0, wx1, well.z1, MID_N_CL);              // north of it
    if (west) {
      slab(b, c, well.x1, wx1, well.z0, well.z1);         // inboard of it
    } else {
      slab(b, c, wx0, well.x0, well.z0, well.z1);
    }
  }
  slab(b, 'floor2.central', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S_OUT, D.Z_CENTRAL_N_OUT);

  /* ============================================================
     ROOMS
     ============================================================ */
  /* The east wing's north band, split by ONE cross wall: the smaller room
     south, the Archives filling the rest. Two rectangles covering the
     whole band, rather than a corner room with an orphan strip beside
     it. */
  const MIN_Z = D.Z_NB_S + ftin(13, 6);

  const rooms = [
    ['academy.upper.west.rotating', 'Rotating Exhibits', D.X_W_IN, D.X_WING_W_IN, D.Z_S_IN, D.Z_FB_N],
    ['academy.upper.west.landing', 'West Upper Landing', D.X_W_IN, D.X_WING_W_IN, D.Z_MID_S, D.Z_MID_N],
    ['academy.upper.west.history', 'Augusta-Richmond County History', D.X_W_IN, D.X_WING_W_IN, D.Z_NB_S, D.Z_N_IN],

    ['academy.upper.center.war', 'The War Room', D.X_BAY_W, 0, D.Z_CENTRAL_S, D.Z_CENTRAL_N],
    ['academy.upper.center.mammals', 'Modern Mammals', 0, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N],

    ['academy.upper.east.natural', 'Natural History', D.X_WING_E_IN, D.X_E_IN, D.Z_S_IN, D.Z_FB_N],
    ['academy.upper.east.landing', 'East Upper Landing', D.X_WING_E_IN, D.X_E_IN, D.Z_MID_S, D.Z_MID_N],
    ['academy.upper.east.minerals', 'Rocks & Minerals', D.X_WING_E_IN, D.X_E_IN, D.Z_NB_S, MIN_Z],
    ['academy.upper.east.archives', 'Archives', D.X_WING_E_IN, D.X_E_IN, MIN_Z + D.PART, D.Z_N_IN],
  ];

  for (const [id, name, x0, x1, z0, z1] of rooms) {
    b.room({ id, name, x0, x1, z0, z1, y0: D.FLOOR2, y1: D.FLOOR2_CEIL, floor: 2, material: 'wood' });
    b.detail(2.2);
    /* A PAINTED cornice, the same as downstairs. The dark one this used
       to have made the upper story read as a different building. */
    trimBox(b, x0, D.FLOOR2_CEIL - inch(9), z0, x1, D.FLOOR2_CEIL, z0 + inch(3), M.paintWhite);
    trimBox(b, x0, D.FLOOR2_CEIL - inch(9), z1 - inch(3), x1, D.FLOOR2_CEIL, z1, M.paintWhite);
    trimBox(b, x0, D.FLOOR2_CEIL - inch(9), z0, x0 + inch(3), D.FLOOR2_CEIL, z1, M.paintWhite);
    trimBox(b, x1 - inch(3), D.FLOOR2_CEIL - inch(9), z0, x1, D.FLOOR2_CEIL, z1, M.paintWhite);
  }

  /* ---- ceilings ---- */
  ceil(b, 'floor2.west.front', D.X_W_OUT, D.X_BAY_W, D.Z_FACADE, MID_S_CL);
  ceil(b, 'floor2.west.mid', D.X_W_OUT, D.X_BAY_W, MID_S_CL, MID_N_CL);
  ceil(b, 'floor2.west.north', D.X_W_OUT, D.X_BAY_W, MID_N_CL, D.Z_N_OUT);
  ceil(b, 'floor2.east.front', D.X_BAY_E, D.X_E_OUT, D.Z_FACADE, MID_S_CL);
  ceil(b, 'floor2.east.mid', D.X_BAY_E, D.X_E_OUT, MID_S_CL, MID_N_CL);
  ceil(b, 'floor2.east.north', D.X_BAY_E, D.X_E_OUT, MID_N_CL, D.Z_N_OUT);
  ceil(b, 'floor2.central', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S_OUT, D.Z_CENTRAL_N_OUT);

  /* ============================================================
     PARTITIONS

     The upper central room reaches the wings at its four corners, which
     is how the museum map draws it and how route J works: west landing,
     across the meeting room, east landing.
     ============================================================ */
  const upDoor = (at, id, opt = {}) => ({
    at, kind: 'door',
    width: opt.width || D.DOOR_W,
    y0: D.FLOOR2, y1: D.FLOOR2 + (opt.height || D.DOOR_H),
    door: { id, name: opt.name || 'door', hinge: opt.hinge || 'x0', swing: opt.swing || 1 },
  });
  const upArch = (at, opt = {}) => ({
    at, kind: 'arch',
    width: opt.width || ftin(5, 0),
    y0: D.FLOOR2, y1: D.FLOOR2 + (opt.height || ftin(8, 6)),
  });
  const up = { y0: D.FLOOR2, y1: D.FLOOR2_CEIL };

  /* the two long walls of the upper central room, continuous with the
     garden walls of the wings below and above */
  for (const s of [-1, 1]) {
    const west = s < 0;
    partition(b, {
      chunk: west ? 'academy.upper.center.war' : 'academy.upper.center.mammals',
      axis: 'z', line: west ? D.X_BAY_W - D.EXT / 2 : D.X_BAY_E + D.EXT / 2,
      from: D.Z_CENTRAL_S_OUT, to: D.Z_CENTRAL_N_OUT,
      thickness: D.EXT, material: M.plasterOchre, ...up,
      /* Same size, same station, mirrored about Z = 0 -- and the same
         size and station as the four on the floor below, so the two
         stories line up when you walk between them. */
      openings: [
        upDoor(-D.CENTRAL_DOOR_Z, west ? 'upper-war-rotating' : 'upper-mammals-natural',
          { name: 'exhibit door', width: D.CENTRAL_DOOR_W, height: D.CENTRAL_DOOR_H,
            hinge: west ? 'x0' : 'x1', swing: west ? 1 : -1 }),
        upDoor(D.CENTRAL_DOOR_Z, west ? 'upper-war-landing' : 'upper-mammals-landing',
          { name: 'landing door', width: D.CENTRAL_DOOR_W, height: D.CENTRAL_DOOR_H,
            hinge: west ? 'x1' : 'x0', swing: west ? -1 : 1 }),
      ],
    });
  }

  /* The War Room and Modern Mammals are one meeting room with a spine
     wall down it, pierced by a wide opening -- which is exactly how the
     visitor map draws it, annotated across both halves as the common
     meeting room.

     IT STOPS SHORT OF THE SOUTH WALL. The terrace door is on the center
     line, and a spine running the full depth walks straight into it: you
     could open the door and find masonry behind it. The map's division is
     a partition inside one room, not a structural wall, and it cannot run
     into the wall that carries the door out onto the terrace. Seven feet
     of clear passage across the south end is the least invasive way to
     make both true. */
  partition(b, {
    chunk: 'academy.upper.center.war',
    axis: 'z', line: 0, from: D.Z_CENTRAL_S + ftin(7, 0), to: D.Z_CENTRAL_N,
    ...light, ...up,
    openings: [upArch(ftin(3, 6), { width: ftin(8, 0), height: ftin(10, 6) })],
  });

  /* wing cross-walls, matching the ones below them */
  for (const side of ['west', 'east']) {
    const west = side === 'west';
    const x0 = west ? D.X_W_IN : D.X_WING_E_IN;
    const x1 = west ? D.X_WING_W_IN : D.X_E_IN;
    const inner = west ? ft(-32) : ft(32);
    const outer = west ? ft(-49) : ft(49);
    partition(b, {
      chunk: `academy.upper.${side}.landing`,
      axis: 'x', line: D.Z_FB_N + D.CROSS / 2, from: x0, to: x1, ...P, ...up,
      openings: [upArch(inner, { width: ftin(5, 6) })],
    });
    partition(b, {
      chunk: `academy.upper.${side}.landing`,
      axis: 'x', line: D.Z_MID_N + D.CROSS / 2, from: x0, to: x1, ...P, ...up,
      openings: [upArch(inner, { width: ftin(5, 0) })],
    });
    void outer;
  }

  /* Rocks & Minerals and the Archives: the east wing's north band divided
     by one cross wall, the smaller room south. Two rectangles covering
     the whole band -- Stage 2 had a corner room and left the floor beside
     it belonging to nothing. */
  partition(b, {
    chunk: 'academy.upper.east.archives',
    axis: 'x', line: MIN_Z + D.PART / 2, from: D.X_WING_E_IN, to: D.X_E_IN,
    ...light, ...up,
    openings: [upDoor(D.X_WING_E_IN + ftin(9, 0), 'upper-minerals-archives',
      { name: 'archives door', width: D.DOOR_W, height: D.DOOR_H })],
  });

  /* ============================================================
     WAINSCOT

     LAST, for the same reason as downstairs: it has to know where the
     doorways and the archways are, and it asks the level rather than a
     second list of its own. Same boards, same cap, same baseboard as the
     first floor, because it is the same building.
     ============================================================ */
  for (const [id, , x0, x1, z0, z1] of rooms) {
    b.chunk(id);
    b.detail(2.2);
    const r = { x0, x1, z0, z1, y: D.FLOOR2 };
    wainscot(b, r, {
      height: D.WAINSCOT_H, cap: D.WAINSCOT_CAP, base: D.BASE_H,
      gaps: openingsAround(b.level, r),
    });
  }

  /* ============================================================
     EDGE PROTECTION

     Every place the upper floor stops and there is no wall: the two
     stairwells (handled in stairs.js) and the front gallery (in
     porches.js). Nothing else on this story is open, which is worth
     stating because a two-story building with an open middle is exactly
     where a player expects to be able to fall.
     ============================================================ */
}
