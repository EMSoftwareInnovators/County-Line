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
import { block, luggage, cart, sign, standOn, trash } from './props.js';
import { COACH } from './coach.js';

/* ---- the yard, in one place ---- */
export const YARD = {
  /** The concrete walkway along the building. */
  platX0: ft(-70), platX1: D.X_W_OUT,
  platZ0: ft(14), platZ1: ft(86),
  /**
   * How much the concrete stands over the asphalt: a topping, not a
   * platform.
   *
   * IT WAS EIGHT INCHES ONCE, and it was wrong. A raised loading
   * platform belongs to a railroad, where the train door is three feet
   * up; a coach's step is six inches off the ground and its door is
   * twenty-four feet back from its nose, so a passenger boarding a
   * nose-in coach is standing BESIDE it, not in front of it -- out on
   * the asphalt, in the painted lane. A step between them is a step
   * everybody trips down in the dark with a suitcase. So the whole yard
   * is one level and the concrete is two inches of topping that tells
   * you where the coaches are not.
   */
  rise: inch(2),
  /** Where a coach's nose comes to rest. */
  noseX: ft(-70.5),
  /**
   * The berth center lines, south to north. Seventeen feet apart, which
   * leaves eight and a half between the sides of two coaches: enough to
   * walk down with a bag, which is what boarding one of these actually
   * is.
   */
  bayZ: [ft(24), ft(41), ft(58), ft(75)],
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
  /** Nose east, toward the building: local +Z to +X is yaw +PI/2. */
  yaw: Math.PI / 2,
  /** Where the line for this bay forms, on the concrete. */
  boardX: YARD.platX0 + ftin(3, 0),
  boardZ: z + ftin(4, 0),
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

  /* The concrete along the building: two inches of topping over the
     same asphalt, so it reads as a different surface and is not a step.
     Nothing in this yard needs a ramp, because nothing in it is up. */
  b.detail(2.4);
  b.floor({
    x0: YARD.platX0, x1: YARD.platX1, z0: YARD.platZ0, z1: YARD.platZ1,
    y: G + YARD.rise, material: M.apron, thickness: YARD.rise + inch(4),
    buried: true, tag: 'walkway',
  });
  /* A painted line along its west edge, because the edge has to read at
     thirty feet in the dark and there is nothing to see otherwise. */
  block(b, {
    x0: YARD.platX0 - inch(2), x1: YARD.platX0 + inch(4),
    z0: YARD.platZ0, z1: YARD.platZ1,
    y0: G + YARD.rise, y1: G + YARD.rise + inch(0.4),
    material: M.paintYellow, tag: 'edge-line', solid: false,
  });

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
    const halfW = COACH.width / 2 + ftin(1, 0);
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
     THE YARD'S LIGHTING IS NOT IN THIS FILE

     Bulkheads under the canopy, floods on its fascia and two poles in
     the drive aisle are all declared in fixtures.js, with everything
     else in the building that burns. Vertex light is BAKED AS GEOMETRY
     IS CREATED and this module runs at the very end of the build, so a
     fitting drawn here lights precisely nothing. There were three
     floods in this file once and the whole yard came back from the
     screenshot harness at ninety-seven per cent black.
     ============================================================ */

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

  /* ============================================================
     WHAT THE YARD TELLS THE GAME

     The level says where a coach stands, where a passenger stands to
     board it, and which way it comes in and leaves. It does not say
     what a coach is or when one is due -- see game/terminal/fleet.js.
     One way in from the north, down the aisle, nose into the berth,
     back out and away south. Which is how a forty-foot coach uses a
     hundred and forty feet of yard, and the reason the aisle is as
     wide as it is.
     ============================================================ */
  b.mark('yard', {
    grade: G,
    platform: G + YARD.rise,
    aisleX: ft(-130),
    entry: { x: ft(-130), z: YARD.yardZ1 - ftin(8, 0) },
    exit: { x: ft(-130), z: YARD.yardZ0 + ftin(8, 0) },
    bays: BAYS.map((bay) => ({
      id: bay.id, x: bay.x, z: bay.z, yaw: bay.yaw,
      boardX: bay.boardX, boardZ: bay.boardZ,
    })),
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

  /* The yard's own air: a hundred and forty feet of open asphalt with
     a canopy over one edge of it, which sounds like nothing at all and
     is the reason stepping out of the side door reads as stepping
     outside. */
  b.ambience({
    kind: 'air', x: YARD.platX0 + ftin(6, 0), y: G + ftin(5, 0), z: ft(50),
    maxDist: ft(90), gain: 0.2, cutoff: 300, room: 'academy.grounds.west',
  });

  void SITE; void ftin;
}
