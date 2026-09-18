/* ============================================================
   platform.js -- the coach yard on the west grounds.

   WHERE IT IS, AND WHY THERE. The Old Academy's west side door is
   captioned "Entrance to Railroad" on the 1994 measured plan: it faced
   the railroad cut, and it is the one door on the building with a stoop,
   a path and a direct line from the rear hall. The boarding route
   already ran out of it before the bus company existed. So the yard is
   west, and passengers reach it the way the building has always let them.

   WHAT IS NOT TOUCHED: the front lawn, the forecourt, its formal walk
   and its beds; the garden between the two rear wings; the rear porch.
   No coach goes near any of them, nothing is paved over, and the only
   change to the site is that the WEST ground is wider than the east one
   -- see WEST_YARD in dimensions.js.

   THE LAYOUT, west from the building:

       building wall    -56'5"
       loading platform  to  -70'      concrete, 8" up, canopied
       four berths       to -112'      nose-in, coaches facing east
       drive aisle       to -160'      asphalt, one way in from the north

   Nose-in rather than curbside because a forty-foot coach needs
   forty-two feet to stand in and the site is a hundred and forty feet
   deep: four berths side by side across sixty feet of platform fit,
   and four berths nose-to-tail down its length do not.
   ============================================================ */
import { ft, ftin, inch } from '../../../../engine/units.js';
import * as D from '../dimensions.js';
import { SITE } from '../grounds.js';
import { flood, lantern } from '../fittings.js';
import { block, luggage, cart, sign, standOn, trash } from './props.js';
import { COACH } from './coach.js';

/* ---- the yard, in one place ---- */
export const YARD = {
  /** The concrete loading platform. */
  platX0: ft(-70), platX1: D.X_W_OUT,
  platZ0: ft(18), platZ1: ft(82),
  /** How high the platform stands over the asphalt. */
  rise: inch(8),
  /** Where a coach's nose comes to rest. */
  noseX: ft(-70.5),
  /** The berth center lines, south to north. */
  bayZ: [ft(26), ft(41), ft(56), ft(71)],
  /** The apron the coaches stand on and turn in. */
  yardX0: ft(-158), yardX1: ft(-70),
  yardZ0: ft(6), yardZ1: ft(96),
};

/** Bay 1 is the southernmost, which is the one nearest the side door. */
export const BAYS = YARD.bayZ.map((z, i) => ({
  id: i + 1,
  z,
  /** Where the coach's origin (rear axle) sits when it is at the bay. */
  x: YARD.noseX - COACH.nose,
  /** Nose east: local +Z points toward +X, which is yaw -PI/2. */
  yaw: -Math.PI / 2,
  /** Where a passenger stands to board. */
  boardX: YARD.platX0 + ftin(2, 0),
  boardZ: z,
}));

export function buildPlatform(b) {
  const M = b.M;
  const G = D.GRADE;

  /* ============================================================
     THE APRON

     Asphalt over the whole yard, with the concrete platform standing on
     it. Laid in the west grounds chunk, which is the chunk the platform
     circuit dims.
     ============================================================ */
  b.chunk('academy.grounds.west');
  /* Out here every height is measured from the site grade explicitly, so
     the prop datum goes back to zero. */
  standOn(0);
  b.detail(4.0);
  b.floor({
    x0: YARD.yardX0, x1: YARD.yardX1, z0: YARD.yardZ0, z1: YARD.yardZ1,
    y: G + inch(1), material: M.asphalt, thickness: ftin(1, 0),
    buried: true, tag: 'apron',
  });

  /* the platform itself: a concrete slab with a nosing */
  b.detail(2.4);
  b.floor({
    x0: YARD.platX0, x1: YARD.platX1, z0: YARD.platZ0, z1: YARD.platZ1,
    y: G + YARD.rise, material: M.apron, thickness: YARD.rise + inch(4),
    buried: true, tag: 'platform',
  });
  /* A curb along the west edge, painted, so nobody steps off it by
     accident and so the edge reads at thirty feet. */
  block(b, {
    x0: YARD.platX0 - inch(4), x1: YARD.platX0 + inch(2),
    z0: YARD.platZ0, z1: YARD.platZ1,
    y0: G + inch(1), y1: G + YARD.rise + inch(1),
    material: M.paintYellow, tag: 'curb', walkable: false,
  });
  /* and a ramp down at each end, so the platform is not a trap */
  for (const [z0, z1, dir] of [
    [YARD.platZ0 - ftin(4, 0), YARD.platZ0, 1],
    [YARD.platZ1, YARD.platZ1 + ftin(4, 0), -1],
  ]) {
    b.mb.box(YARD.platX0, G + inch(1), z0, YARD.platX1, G + YARD.rise, z1,
      { all: { tex: M.apron.tex, density: M.apron.density } });
    b.col.addRamp({
      x0: YARD.platX0, x1: YARD.platX1, z0, z1, axis: 'z',
      yLow: dir > 0 ? G + inch(1) : G + YARD.rise,
      yHigh: dir > 0 ? G + YARD.rise : G + inch(1),
      tag: 'platform-ramp',
    });
  }

  /* ============================================================
     THE CANOPY

     A shelter over the platform on steel posts: a roof, a fascia, and
     the bay numbers hanging off it. Modest, which is what the brief
     asks: this is a company shelter bolted to a yard, not a concourse.
     ============================================================ */
  const CH = G + ftin(11, 6);
  /* THE CANOPY DOES NOT TOUCH THE BUILDING, and it does not try to
     cover the whole platform either. It is eight and a half feet wide
     over the coach side, free-standing on two rows of posts, with six
     feet of open concrete between its inner edge and the 1856 wall.

     Both facts are the same fact: nothing of the company's is fixed to
     that elevation. A steel roof flashed into it was never going to be
     allowed, and the lantern over the side door hangs at eight foot six
     -- exactly where the flashing would have gone. What a canopy is
     actually for is keeping the rain off a passenger standing at a
     coach door, and that is the eight feet it covers. */
  const CX1 = YARD.platX0 + ftin(8, 0);
  b.detail(3.0);
  block(b, {
    x0: YARD.platX0 - inch(6), x1: CX1,
    z0: YARD.platZ0 - ftin(1, 0), z1: YARD.platZ1 + ftin(1, 0),
    y0: CH, y1: CH + ftin(0, 10),
    material: M.busStripe, tag: 'canopy', solid: false,
  });
  block(b, {
    x0: YARD.platX0 - inch(8), x1: YARD.platX0 - inch(2),
    z0: YARD.platZ0 - ftin(1, 0), z1: YARD.platZ1 + ftin(1, 0),
    y0: CH - ftin(1, 2), y1: CH,
    material: M.busStripe, tag: 'fascia', solid: false,
  });
  b.headroom({
    x0: YARD.platX0, x1: CX1, z0: YARD.platZ0, z1: YARD.platZ1,
    y: CH, tag: 'canopy',
  });
  for (const z of [YARD.platZ0, ft(34), ft(50), ft(66), YARD.platZ1]) {
    block(b, {
      x0: YARD.platX0 - inch(1), x1: YARD.platX0 + ftin(0, 5),
      z0: z - inch(3), z1: z + inch(3),
      y0: G + YARD.rise, y1: CH,
      material: M.chrome, tag: 'canopy-post',
    });
  }
  /* the inner row, six feet clear of the building */
  for (const z of [YARD.platZ0, ft(34), ft(50), ft(66), YARD.platZ1]) {
    block(b, {
      x0: CX1 - ftin(0, 6), x1: CX1,
      z0: z - inch(3), z1: z + inch(3),
      y0: G + YARD.rise, y1: CH,
      material: M.chrome, tag: 'canopy-post',
    });
  }

  /* ============================================================
     THE BERTHS
     ============================================================ */
  for (const bay of BAYS) {
    /* the painted box a coach stands in */
    const halfW = COACH.width / 2 + ftin(1, 6);
    for (const s of [-1, 1]) {
      block(b, {
        x0: YARD.noseX - COACH.length - ftin(2, 0), x1: YARD.noseX,
        z0: bay.z + s * halfW - inch(2), z1: bay.z + s * halfW + inch(2),
        y0: G + inch(1), y1: G + inch(1.5),
        material: M.paintYellow, tag: 'bay-line', solid: false,
      });
    }
    /* the stop bar at the head of the berth */
    block(b, {
      x0: YARD.noseX - inch(6), x1: YARD.noseX - inch(2),
      z0: bay.z - halfW, z1: bay.z + halfW,
      y0: G + inch(1), y1: G + inch(1.5),
      material: M.paintYellow, tag: 'bay-stop', solid: false,
    });

    /* the number, hung off the canopy fascia and painted on the curb */
    const plate = M.plate(String(bay.id), { size: 26, w: 64, h: 64, density: 64 });
    block(b, {
      x0: YARD.platX0 - inch(10), x1: YARD.platX0 - inch(9),
      z0: bay.z - ftin(1, 2), z1: bay.z + ftin(1, 2),
      y0: CH - ftin(2, 6), y1: CH - ftin(0, 2),
      material: plate, tag: 'bay-number', solid: false,
    });

    b.station({
      id: `bay-${bay.id}`, name: `Bay ${bay.id}`, room: 'academy.grounds.west',
      box: {
        x0: YARD.platX0 - ftin(1, 0), x1: YARD.platX0 + ftin(4, 0),
        z0: bay.z - ftin(4, 0), z1: bay.z + ftin(4, 0),
        y0: G + YARD.rise, y1: G + ftin(7, 0),
      },
      idle: 'No coach at this bay.',
      priority: 2,
    });
  }

  /* ============================================================
     THE FITTINGS AND THE CLUTTER

     Floods on the canopy fascia rather than on the building, because a
     yard light bolted to an 1802 elevation is the one thing the
     preservation people would have stopped.
     ============================================================ */
  /* Between the bay numbers, not behind them: the flood's conduit runs
     up the same face the number plates hang on. */
  for (const z of [ft(21), ft(45), ft(69)]) {
    flood(b, {
      x: YARD.platX0 - inch(8), z, y: CH - ftin(1, 4), face: 'west',
      mount: 11.5, target: 0.5,
    });
  }
  lantern(b, {
    x: D.X_W_OUT, z: ft(43), y: G + ftin(8, 6), face: 'west',
    mount: 8.5, target: 0.54,
  });

  /* ============================================================
     ROUTE STAGING

     Four painted squares against the building wall, one per route, and
     this is where they belong: bags are grouped by where they are
     going, the grouping happens where the coaches are, and the two
     rooms inside that could have held it are a thirteen-foot cross
     hall and a baggage room with four doors. Painted, so a bag stands
     on the concrete and not on a prop.
     ============================================================ */
  /* Everything from here to the end of the section is standing ON the
     platform, eight inches over the asphalt, so the prop datum goes to
     the platform surface and the heights below are measured from it. */
  const P = G + YARD.rise;
  standOn(P);

  const ROUTES = ['ATL', 'SAV', 'MCN', 'CHS'];
  for (let i = 0; i < 4; i++) {
    const z = ft(22) + i * ftin(4, 6);
    block(b, {
      x0: D.X_W_OUT - ftin(4, 6), x1: D.X_W_OUT - ftin(0, 6), z0: z, z1: z + ftin(3, 6),
      y0: 0, y1: inch(0.4),
      material: M.paintYellow, tag: 'staging', solid: false,
    });
    sign(b, {
      x: D.X_W_OUT - inch(2), z: z + ftin(1, 9), y: ftin(3, 10), face: 'west',
      w: ftin(1, 8), h: ftin(0, 8), material: M.plate(ROUTES[i], { size: 15 }),
    });
    b.station({
      id: `staging.${ROUTES[i].toLowerCase()}`,
      name: `Staging — ${ROUTES[i]}`, room: 'academy.grounds.west',
      box: {
        x0: D.X_W_OUT - ftin(5, 0), x1: D.X_W_OUT, z0: z, z1: z + ftin(3, 6),
        y0: P, y1: P + ftin(3, 6),
      },
      priority: 2,
    });
  }

  /* Trolleys and bins, kept off the line from the side door across the
     platform: the door is at z = 43 and anything within four feet of
     that line is something a man with a mail sack walks into. */
  cart(b, { x: YARD.platX0 + ftin(4, 6), z: ft(52), axis: 'z' });
  cart(b, { x: YARD.platX0 + ftin(4, 6), z: ft(66), axis: 'z' });
  luggage(b, { x: D.X_W_OUT - ftin(2, 6), z: ft(23.5), tone: 2 });
  trash(b, { x: D.X_W_OUT - ftin(2, 0), z: ft(58) });
  trash(b, { x: D.X_W_OUT - ftin(2, 0), z: ft(78) });

  /* a bench under the canopy, and the terminal's name where a coach
     coming in off the street can see it */
  block(b, {
    x0: D.X_W_OUT - ftin(1, 8), x1: D.X_W_OUT - inch(3),
    z0: ft(48), z1: ft(54),
    y0: ftin(1, 3), y1: ftin(1, 5),
    material: M.benchVinyl, tag: 'bench',
  });
  standOn(0);
  sign(b, {
    x: YARD.platX0 - inch(10), z: ft(50), y: CH + ftin(2, 6), face: 'west',
    w: ftin(14, 0), h: ftin(2, 0),
    material: M.plate('RICHMOND CENTRAL', { size: 20, w: 256, h: 64 }),
  });

  /* the service path from the side door across the platform, and the
     employee gate at the north end of the yard */
  block(b, {
    x0: YARD.yardX0 + ftin(2, 0), x1: YARD.yardX0 + ftin(2, 6),
    z0: YARD.yardZ0, z1: YARD.yardZ1,
    y0: G + inch(1), y1: G + ftin(6, 0),
    material: M.chrome, tag: 'yard-fence',
  });
  sign(b, {
    x: YARD.yardX0 + ftin(2, 3), z: ft(50), y: G + ftin(5, 0), face: 'east',
    w: ftin(4, 0), h: ftin(1, 0),
    material: M.plate('COACHES ONLY', { size: 12 }),
  });

  void SITE; void ftin;
}
