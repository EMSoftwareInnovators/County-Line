/* ============================================================
   stairs.js -- the two historic staircases.

   BOTH OF THEM EXIST AND NEITHER MOVES. The west stair is in the west
   wing's middle band, against the outer wall; the east stair is in the
   east wing's middle band, against its outer wall. That is where both
   floor plans put them, and it is why the building has no grand central
   stair and never had one -- the center is a room, not a hall.

   Each is a switchback of two straight flights with a half-landing at the
   outer end, drawn on the second-floor plan as two parallel runs. You
   enter at the inner end, climb outward, turn, and climb back inward,
   arriving on the upper landing facing the way you came in.

   Twenty-four risers of exactly eight inches reach the second floor at
   16'0". The story height was chosen to make that come out whole; see
   dimensions.js. Collision is Stage 1's ramp-backed system, so the climb
   is smooth, stopping halfway leaves you halfway, and there is no seam at
   any nose to catch on.
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';
import * as D from './dimensions.js';
import { trimBox } from './parts.js';

const RUN_STEPS = D.STAIR_RISERS / 2;            // 12 per flight
const RUN_LEN = RUN_STEPS * D.STAIR_RUN;         // 10'0"
const HALF = D.STAIR_RISERS / 2 * D.STAIR_RISE;  // 8'0"

/** Center-lines of the two flights within a stair zone, across the run. */
const FLIGHT_GAP = ftin(0, 6);

/**
 * Where each stairwell punches through the second floor. Exported so the
 * second-floor slab can be laid around the hole rather than over it.
 */
export function stairWells() {
  const zA = D.Z_MID_S + ft(1) + D.STAIR_WIDTH / 2;
  const zB = zA + D.STAIR_WIDTH + FLIGHT_GAP;
  const z0 = zA - D.STAIR_WIDTH / 2;
  const z1 = zB + D.STAIR_WIDTH / 2;
  return {
    west: { x0: D.X_W_IN, x1: D.X_W_IN + D.STAIR_LANDING + RUN_LEN, z0, z1, zA, zB },
    east: { x0: D.X_E_IN - D.STAIR_LANDING - RUN_LEN, x1: D.X_E_IN, z0, z1, zA, zB },
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
    guard: ftin(2, 10),
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
  const s = west ? 1 : -1;          // +1 climbs west-to-east on the return

  b.chunk(west ? 'academy.west.stairhall' : 'academy.east.stairhall');
  b.detail(1.2);

  /* The inner end, where you step on. West stair: the east end. */
  const inner = west ? D.X_W_IN + D.STAIR_LANDING + RUN_LEN : D.X_E_IN - D.STAIR_LANDING - RUN_LEN;
  const turn = west ? D.X_W_IN + D.STAIR_LANDING : D.X_E_IN - D.STAIR_LANDING;

  /* Flight one: inward end, climbing outward, on the south run. */
  flight(b, {
    x: inner, z: well.zA, y: 0,
    yaw: west ? -Math.PI / 2 : Math.PI / 2,
    stringers: west ? 'left' : 'right',
  });

  /* The half-landing, against the outer wall. */
  b.floor({
    x0: west ? D.X_W_IN : turn, x1: west ? turn : D.X_E_IN,
    z0: well.z0, z1: well.z1,
    y: HALF, material: M.heartPine, thickness: ftin(0, 10),
    soffit: M.beadboard, tag: 'stair-landing',
  });

  /* Flight two: from the landing, climbing back inward, on the north run. */
  flight(b, {
    x: turn, z: well.zB, y: HALF,
    yaw: west ? Math.PI / 2 : -Math.PI / 2,
    stringers: west ? 'right' : 'left',
  });

  /* A handrail up the open side of each flight, and round the landing. */
  const railY = (y) => y + ftin(0, 2);
  b.railing({
    x0: inner, z0: well.zA + s * (D.STAIR_WIDTH / 2), x1: turn, z1: well.zA + s * (D.STAIR_WIDTH / 2),
    y: railY(0), rise: HALF, height: ftin(2, 10), material: M.trimDark,
  });
  b.railing({
    x0: turn, z0: well.zB - s * (D.STAIR_WIDTH / 2), x1: inner, z1: well.zB - s * (D.STAIR_WIDTH / 2),
    y: railY(HALF), rise: HALF, height: ftin(2, 10), material: M.trimDark,
  });

  /* The well is a hole in the floor above. Everything round its edge that
     is not a wall gets a guard: at the head of the flight, and along the
     inner edge where the landing looks down. */
  const upper = D.FLOOR2;
  const guardH = ftin(2, 10);
  const edgeX = west ? well.x1 : well.x0;

  /* THE HEAD OF THE FLIGHT IS NOT GUARDED, because that is where you
     arrive. Only the half of the inboard edge that the first flight drops
     away under gets a rail -- guarding the whole edge puts a fence across
     the top of the staircase, which is a thing you do not notice until
     you try to walk up it. */
  const headZ0 = well.zB - D.STAIR_WIDTH / 2;
  b.railing({
    x0: edgeX, z0: well.z0, x1: edgeX, z1: headZ0,
    y: upper, height: guardH, material: M.trimDark,
  });
  b.barrier({
    x0: edgeX - inch(3), x1: edgeX + inch(3), z0: well.z0, z1: headZ0,
    y0: upper, y1: upper + guardH, tag: 'stairwell-guard',
  });

  /* The two long sides of the well, which are a straight drop. */
  for (const z of [well.z0, well.z1]) {
    b.railing({
      x0: well.x0, z0: z, x1: well.x1, z1: z,
      y: upper, height: guardH, material: M.trimDark,
    });
    b.barrier({
      x0: well.x0, x1: well.x1, z0: z - inch(3), z1: z + inch(3),
      y0: upper, y1: upper + guardH, tag: 'stairwell-guard',
    });
  }

  /* A newel at the foot, which is what tells you at a glance that this is
     a stair and not a ramp with boards on it. */
  const nx = inner + (west ? inch(3) : -inch(3));
  const nz = well.zA + s * (D.STAIR_WIDTH / 2);
  trimBox(b, nx - inch(3), 0, nz - inch(3), nx + inch(3), ftin(3, 4), nz + inch(3), M.trimDark);
}

export function buildStairs(b) {
  staircase(b, 'west');
  staircase(b, 'east');
}
