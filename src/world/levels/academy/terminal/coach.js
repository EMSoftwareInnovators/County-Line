/* ============================================================
   coach.js -- one intercity coach, late 1980s, in about 240 triangles.

   Not a modern coach. The shape being aimed at is the one that stood in
   every American bus terminal from about 1985 to about 2005: a
   forty-foot two-axle highway coach with a flat raked windshield in two
   panes, baggage bays down both sides between the wheels, a single
   passenger door ahead of the front axle, a roll-sign box over the
   windshield, and a body sitting high on the frame with a straight
   beltline and a painted skirt.

   IT IS BUILT ONCE AND INSTANCED. The mesh is in the coach's own local
   space with the origin at the middle of the rear axle on the ground,
   nose toward local +Z, so a bus is a matrix and a state -- see
   game/terminal/bus.js. Four of them at a platform cost four draw calls
   and no extra geometry.

   The destination roll is a separate mesh per bus, because two coaches at
   the same platform going to different places with the same sign on the
   front is the one detail nobody misses.
   ============================================================ */
import { MeshBuilder } from '../../../../engine/mesh.js';
import { ft, ftin, inch } from '../../../../engine/units.js';

/* ---- the numbers the rest of the game needs ---- */
export const COACH = {
  length: ftin(40, 0),
  width: ftin(8, 6),
  height: ftin(11, 2),
  /** From the origin (rear axle) forward to the nose. */
  nose: ftin(31, 0),
  /** And back to the tail. */
  tail: ftin(9, 0),
  /** Where the passenger door is, measured forward from the origin. */
  doorAt: ftin(24, 0),
  doorWidth: ftin(2, 6),
  /** Baggage bay doors, forward from the origin. */
  bays: [ftin(4, 0), ftin(12, 0), ftin(18, 0)],
};

/**
 * Build the coach.
 *
 * @param M       the material set
 * @param lightAt a sampler, or null for flat lighting. A coach outdoors
 *                at night is lit by the platform canopy and its own
 *                marker lamps, and it moves, so its shade is baked FLAT
 *                at a level the yard actually is rather than sampled
 *                where it happens to be standing when the level loads.
 */
export function buildCoachMesh(M, shade = 0.62) {
  const mb = new MeshBuilder();
  mb.light = () => shade;
  mb.maxEdge = 3.2;

  const HW = COACH.width / 2;
  const box = (z0, z1, y0, y1, w0, w1, m, faces) => {
    mb.box(w0, y0, z0, w1, y1, z1, {
      all: { tex: m.tex, density: m.density }, ...faces,
    });
  };

  /* ---- the frame skirt and the wheel arches ----
     The skirt is what makes a coach read as a coach rather than as a
     box on wheels: the body is high and the skirt below it is a
     different, darker plane. */
  box(-COACH.tail, COACH.nose, ftin(1, 2), ftin(3, 6), -HW + inch(2), HW - inch(2), M.busStripe);

  /* ---- the body: beltline to roof ---- */
  box(-COACH.tail, COACH.nose, ftin(3, 6), ftin(9, 8), -HW, HW, M.busBody);
  /* the roof, slightly narrower so the body has a shoulder on it */
  box(-COACH.tail + inch(3), COACH.nose - inch(6), ftin(9, 8), COACH.height,
    -HW + inch(4), HW - inch(4), M.busBody, { ny: null });

  /* ---- the company stripe along the beltline ---- */
  box(-COACH.tail, COACH.nose, ftin(5, 8), ftin(6, 2), -HW - inch(0.6), HW + inch(0.6),
    M.busStripe);

  /* ---- side glass: one long band, in panes ---- */
  for (let i = 0; i < 7; i++) {
    const z0 = ftin(0, 6) + i * ftin(3, 8);
    const z1 = z0 + ftin(3, 2);
    if (z1 > COACH.doorAt - ftin(1, 6)) break;
    for (const s of [-1, 1]) {
      box(z0, z1, ftin(6, 4), ftin(8, 10), s * HW - inch(1), s * HW + inch(1), M.busGlass);
    }
  }
  /* and the two panes behind the door, forward of it */
  for (const s of [-1, 1]) {
    box(COACH.doorAt + ftin(1, 4), COACH.nose - ftin(2, 0), ftin(6, 4), ftin(8, 10),
      s * HW - inch(1), s * HW + inch(1), M.busGlass);
  }

  /* ---- the windshield: two raked panes ---- */
  box(COACH.nose - ftin(1, 6), COACH.nose - inch(2), ftin(6, 0), ftin(9, 6),
    -HW + inch(3), HW - inch(3), M.busGlass);
  /* the roll-sign box over it */
  box(COACH.nose - ftin(1, 8), COACH.nose - inch(1), ftin(9, 6), COACH.height - inch(2),
    -HW + inch(6), HW - inch(6), M.busStripe);

  /* ---- the passenger door: a recess with glass in it ---- */
  box(COACH.doorAt - COACH.doorWidth / 2, COACH.doorAt + COACH.doorWidth / 2,
    ftin(1, 2), ftin(8, 4), -HW - inch(1), -HW + inch(1), M.busGlass);
  /* the step well under it, as a dark recess */
  box(COACH.doorAt - COACH.doorWidth / 2 + inch(2), COACH.doorAt + COACH.doorWidth / 2 - inch(2),
    ftin(0, 8), ftin(1, 4), -HW - inch(2), -HW + ftin(1, 0), M.tire);

  /* ---- baggage bay doors, both sides ---- */
  for (const a of COACH.bays) {
    for (const s of [-1, 1]) {
      box(a - ftin(2, 6), a + ftin(2, 6), ftin(1, 8), ftin(3, 4),
        s * (HW - inch(1)), s * (HW + inch(1)), M.busStripe);
      box(a - ftin(2, 4), a + ftin(2, 4), ftin(2, 0), ftin(3, 0),
        s * (HW + inch(0.5)), s * (HW + inch(1.5)), M.chrome);
    }
  }

  /* ---- wheels: two at the origin, two under the nose ---- */
  const wheel = (z, s) => {
    const R = ftin(1, 9);
    box(z - R, z + R, 0, R * 2, s * (HW - ftin(1, 2)), s * (HW - inch(2)), M.tire);
    box(z - R * 0.5, z + R * 0.5, R * 0.5, R * 1.5,
      s * (HW - inch(3)), s * (HW - inch(1)), M.chrome);
  };
  for (const s of [-1, 1]) {
    wheel(0, s);
    wheel(ftin(3, 8), s);       // the tandem drive axle
    wheel(ftin(26, 0), s);      // steering
  }

  /* ---- lamps ---- */
  for (const s of [-1, 1]) {
    // headlights, in the nose
    box(COACH.nose - inch(3), COACH.nose, ftin(2, 2), ftin(2, 10),
      s * (HW - ftin(2, 6)), s * (HW - ftin(1, 4)), M.busLamp);
    // tail lights
    box(-COACH.tail, -COACH.tail + inch(3), ftin(2, 4), ftin(3, 4),
      s * (HW - ftin(2, 2)), s * (HW - ftin(1, 0)), M.busTail);
    // marker lamps along the roof line
    box(COACH.nose - ftin(1, 9), COACH.nose - ftin(1, 5), COACH.height - inch(3), COACH.height,
      s * (HW - ftin(2, 0)), s * (HW - ftin(1, 6)), M.busLamp);
  }
  /* the rear: an engine grille and a plate */
  box(-COACH.tail, -COACH.tail + inch(2), ftin(3, 8), ftin(6, 6), -HW + inch(6), HW - inch(6),
    M.tire);

  return mb.build();
}

/**
 * The destination roll over the windshield, as its own little mesh so
 * each coach can carry its own.
 */
export function buildRollMesh(M, text) {
  const mb = new MeshBuilder();
  mb.light = () => 1.25;
  mb.maxEdge = 3;
  const m = M.plate(text, { bg: '#0e0f11', fg: '#e8dfae', size: 13, w: 128, h: 32 });
  const HW = COACH.width / 2;
  mb.box(-HW + ftin(0, 9), ftin(9, 9), COACH.nose - inch(2),
    HW - ftin(0, 9), COACH.height - inch(5), COACH.nose - inch(1),
    { all: { tex: m.tex, density: m.density } });
  return mb.build();
}

/** The footprint a parked coach blocks, in its own local space. */
export function coachFootprint() {
  return {
    z0: -COACH.tail, z1: COACH.nose,
    x0: -COACH.width / 2, x1: COACH.width / 2,
    y0: 0, y1: COACH.height,
  };
}

void ft;
