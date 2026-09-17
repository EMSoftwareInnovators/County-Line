/* ============================================================
   stairs.js -- the two historic staircases.

   BOTH OF THEM EXIST AND NEITHER MOVES. The west stair is in the west
   wing's middle band, against the outer wall; the east stair is in the
   east wing's middle band, against its outer wall. That is where both
   floor plans put them, and it is why the building has no grand central
   stair and never had one -- the center is a room, not a hall.

   Each is a switchback of two straight flights with a half-landing at the
   outer end. YOU STEP ON AT THE DOORWAY: the foot of the first flight is
   at the stair hall's inner wall, directly through the door from the rear
   hall, so walking in is walking onto the bottom step. You climb outward,
   turn on the landing against the exterior wall, and climb back inward,
   arriving on the floor above over the door you came in by.

   The zone this sits in -- the well, the landing, the restroom beside it
   and the two doorways -- is set out as rectangles in dimensions.js,
   under THE STAIR HALL ZONE, and everything here is built from those. It
   was not, in Stage 2, and the restroom ended up inside the upper flight.

   Twenty-six risers of exactly eight inches reach the second floor at
   17'4". The story height and the stair were solved together: the whole
   switchback has to fit the 13'5" the middle band leaves, which is what
   fixes the run at 9¼ inches. Collision is Stage 1's ramp-backed system,
   so the climb is smooth, stopping halfway leaves you halfway, and there
   is no seam at any nose to catch on.
   ============================================================ */
import { ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { trimBox } from './parts.js';

const RUN_STEPS = D.STAIR_RISERS / 2;            // 13 per flight
const RUN_LEN = RUN_STEPS * D.STAIR_RUN;         // 10'0¼"
const HALF = RUN_STEPS * D.STAIR_RISE;           // 8'8"

/**
 * Where each stairwell punches through the second floor. Exported so the
 * second-floor slab can be laid around the hole rather than over it.
 *
 * `foot` is the bottom of flight A, at the inner wall; `turn` is the
 * inner edge of the half-landing, at the outer end.
 */
export function stairWells() {
  const z0 = D.Z_STAIR_S, z1 = D.Z_STAIR_N;
  return {
    west: {
      x0: D.X_W_IN, x1: D.X_STAIR_FOOT_W, z0, z1,
      zA: D.Z_FLIGHT_A, zB: D.Z_FLIGHT_B,
      foot: D.X_STAIR_FOOT_W, turn: D.X_STAIR_TURN_W,
    },
    east: {
      x0: D.X_STAIR_FOOT_E, x1: D.X_E_IN, z0, z1,
      zA: D.Z_FLIGHT_A, zB: D.Z_FLIGHT_B,
      foot: D.X_STAIR_FOOT_E, turn: D.X_STAIR_TURN_E,
    },
  };
}

function flight(b, spec) {
  return b.stairs({
    x: spec.x, z: spec.z, y: spec.y, yaw: spec.yaw,
    steps: RUN_STEPS,
    width: D.STAIR_WIDTH,
    rise: D.STAIR_RISE,
    run: D.STAIR_RUN,
    nose: inch(1),
    treadMaterial: b.M.heartPine,
    riserMaterial: b.M.trimDark,
    sideMaterial: b.M.trimDark,
    /* The wall side needs no guard; the open side gets one, and the rail
       on top of it is added separately so it reads as joinery. */
    stringers: spec.stringers,
    guard: D.RAIL_H,
    tag: 'stair',
  });
}

/**
 * @param side 'west' | 'east'
 */
function staircase(b, side) {
  const M = b.M;
  const west = side === 'west';
  const well = stairWells()[side];
  const outward = west ? -Math.PI / 2 : Math.PI / 2;   // away from the center
  const inward = west ? Math.PI / 2 : -Math.PI / 2;

  b.chunk(west ? 'academy.west.stairhall' : 'academy.east.stairhall');
  b.detail(1.2);

  /* Flight one: on the south run, from the doorway, climbing outward. */
  flight(b, {
    x: well.foot, z: well.zA, y: 0, yaw: outward,
    stringers: west ? 'left' : 'right',
  });

  /* The half-landing, against the outer wall. */
  b.floor({
    x0: west ? D.X_W_IN : well.turn,
    x1: west ? well.turn : D.X_E_IN,
    z0: well.z0, z1: well.z1,
    y: HALF, material: M.heartPine, thickness: inch(10),
    soffit: M.beadboard, tag: 'stair-landing',
  });

  /* Flight two: on the north run, from the landing, climbing back in. */
  flight(b, {
    x: well.turn, z: well.zB, y: HALF, yaw: inward,
    stringers: west ? 'right' : 'left',
  });

  /* A handrail up the open side of each flight. */
  const s = west ? 1 : -1;
  b.railing({
    x0: well.foot, z0: well.zA + s * (D.STAIR_WIDTH / 2),
    x1: well.turn, z1: well.zA + s * (D.STAIR_WIDTH / 2),
    y: inch(2), rise: HALF, height: D.RAIL_H, material: M.trimDark,
  });
  b.railing({
    x0: well.turn, z0: well.zB - s * (D.STAIR_WIDTH / 2),
    x1: well.foot, z1: well.zB - s * (D.STAIR_WIDTH / 2),
    y: HALF + inch(2), rise: HALF, height: D.RAIL_H, material: M.trimDark,
  });

  /* The well is a hole in the floor above. Everything round its edge that
     is not a wall gets a guard.

     THE HEAD OF THE FLIGHT IS NOT GUARDED, because that is where you
     arrive. Only the half of the inboard edge that the first flight drops
     away under gets a rail -- guarding the whole edge puts a fence across
     the top of the staircase, which is a thing you do not notice until
     you try to walk up it. */
  const upper = D.FLOOR2;
  const edgeX = well.foot;
  const headZ0 = well.zB - D.STAIR_WIDTH / 2;
  /* Painted, not stained. The guard round a stairwell is joinery in the
     same room as the wainscot and the cornice, and a heavy dark balustrade
     was the loudest thing on the upper floor. */
  b.railing({
    x0: edgeX, z0: well.z0, x1: edgeX, z1: headZ0,
    y: upper, height: D.RAIL_H, material: M.paintWhite,
  });
  b.barrier({
    x0: edgeX - inch(3), x1: edgeX + inch(3), z0: well.z0, z1: headZ0,
    y0: upper, y1: upper + D.RAIL_H, tag: 'stairwell-guard',
  });

  /* The north side of the well is open to the room; the south side is the
     cross wall and needs nothing. */
  /* Stopping an inch short of the plaster at the wall end, and a foot
     and a half short at the other, where the second flight's own
     handrail arrives on this same line and carries on -- two rails in
     one line is a continuous handrail, and two rails overlapping in one
     line is a fight. Run right into the plaster at the far end, the
     rail's end post lands in the same plane as the wall face and as the
     wainscot board on it, and the three fight over the inch they share. */
  const armEnd = ftin(1, 6);
  b.railing({
    x0: west ? well.x0 + inch(1) : well.foot + armEnd, z0: well.z1,
    x1: west ? well.foot - armEnd : well.x1 - inch(1), z1: well.z1,
    y: upper, height: D.RAIL_H, material: M.paintWhite,
  });
  b.barrier({
    x0: well.x0, x1: well.x1, z0: well.z1 - inch(3), z1: well.z1 + inch(3),
    y0: upper, y1: upper + D.RAIL_H, tag: 'stairwell-guard',
  });

  /* A newel at the foot, which is what tells you at a glance that this is
     a stair and not a ramp with boards on it. */
  const nx = well.foot + (west ? inch(3) : -inch(3));
  const nz = well.zA + s * (D.STAIR_WIDTH / 2);
  trimBox(b, nx - inch(3), 0, nz - inch(3), nx + inch(3), ftin(3, 6), nz + inch(3), M.trimDark);
  /* The newel stands against the rear hall's wall, so the wainscot has
     to stop at it -- the same rule as a chimney breast. */
  b.level.obstructions.push({
    x: nx, z: nz, y: 0, yaw: 0, width: ftin(1, 0), height: ftin(3, 6),
  });
}

export function buildStairs(b) {
  staircase(b, 'west');
  staircase(b, 'east');
}
