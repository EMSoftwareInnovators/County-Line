/* ============================================================
   units.js -- COUNTY LINE's measurement convention, in one place.

   ONE WORLD UNIT IS ONE METER.

   Inherited from Final Rental, which already worked in meters, so the
   renderer's fog ranges, the audio falloff curves and the movement speeds
   all carry over unchanged. It is also the convention that makes the next
   stage cheap: County Line's building will be reconstructed from real
   architectural measurements, and a meter is the unit every survey,
   drawing and laser measure already speaks.

   Stage 2's dimensions will arrive in FEET AND INCHES. Nothing in the
   engine stores feet. Convert at the point the number is written down --
   `ft(24)`, `ftin(9, 6)`, `inch(7.5)` -- so the source reads as the
   drawing does and the engine only ever sees meters.

       WALL = ft(24)           // a 24-foot wall
       CEIL = ftin(14, 6)      // a 14 ft 6 in ceiling
       RISE = inch(7.5)        // a 7 1/2 inch riser

   Axes, so that a floor plan can be read straight onto them:

       +X  east   (right, on a plan drawn with north up)
       +Y  up
       +Z  north  (up the page)

   Yaw 0 faces +Z and increases toward +X, which is the convention the
   rasterizer, the camera and every actor already use.
   ============================================================ */

/** Feet to meters. */
export const ft = (f) => f * 0.3048;
/** Inches to meters. */
export const inch = (i) => i * 0.0254;
/** Feet and inches to meters: ftin(9, 6) is 9 ft 6 in. */
export const ftin = (f, i = 0) => ft(f) + inch(i);
/** Meters back to feet, for debug read-outs. */
export const toFt = (m) => m / 0.3048;
/** Meters as a "12' 4"" string, for debug read-outs. */
export function toFtIn(m) {
  const total = Math.round(toFt(m) * 12);
  return `${Math.floor(total / 12)}' ${total % 12}"`;
}

/* ============================================================
   THE PLAYER, AND THE SPACES THEY HAVE TO FIT THROUGH

   These are the numbers the rest of the engine is tuned against. A change
   here is a change to how the whole game feels and how every room has to
   be sized, so they live together, documented, rather than scattered
   through the player controller.
   ============================================================ */
export const SCALE = {
  /** Meters per world unit. Stated so nothing has to infer it. */
  metersPerUnit: 1,

  /** Crown of the head. 5 ft 10 in -- an ordinary adult. */
  playerHeight: ftin(5, 10),          // 1.778
  /** Camera height above the floor when standing. */
  playerEye: ftin(5, 5.4),            // 1.660  (matches Final Rental's EYE)
  /** Camera height when crouched. Crouch is not bound by default in
      Stage 1, but the controller and the collider both understand it. */
  playerCrouchEye: ftin(3, 4),        // 1.016
  /** Collider height when crouched -- what has to clear a counter. */
  playerCrouchHeight: ftin(3, 8),     // 1.118

  /** Horizontal collision radius. Deliberately slim: the player has to
      pass a 32-inch door leaf without scraping either jamb. */
  playerRadius: inch(11),             // 0.2794

  /** Meters per second, on the flat. */
  walkSpeed: 1.72,
  /** Held-run speed. Not a sprint -- a hurry. */
  runSpeed: 3.05,
  /** Crouched. */
  crouchSpeed: 0.95,

  /** The tallest lip the player walks over without noticing: thresholds,
      curbs, a single step up onto a platform. Deliberately just under a
      stair riser, so a staircase is climbed by its ramp and never by the
      step-up rule. */
  stepHeight: inch(7),                // 0.1778
  /** Below this, a drop is walked off; above it, the player falls. */
  fallSpeed: 9.81,

  /* ---- what the architecture has to provide ---- */
  /** A standard interior door leaf: 6 ft 8 in tall, 3 ft wide. */
  doorHeight: ftin(6, 8),             // 2.032
  doorWidth: ft(3),                   // 0.9144
  /** Framed opening clearance above the leaf. */
  doorHeadroom: inch(2),

  /** Stair geometry. 7 1/2 in rise on an 11 in tread is a 34 degree
      flight -- steep enough to read as a period stair, shallow enough to
      walk without the camera pogoing. */
  stairRise: inch(7.5),               // 0.1905
  stairRun: inch(11),                 // 0.2794
  /** Minimum clear width of a public flight. */
  stairWidth: ftin(3, 8),

  /** Ordinary interior ceiling, for reference. County Line's building has
      much higher ones; this is what "normal" measures against. */
  roomHeight: ft(9),
  /** Wall thickness the test level builds with. */
  wallThickness: inch(6),
};

/** Eye height for a given stance, 0 = standing, 1 = fully crouched. */
export const eyeAt = (crouch) =>
  SCALE.playerEye + (SCALE.playerCrouchEye - SCALE.playerEye) * crouch;

/** Collider height for a given stance. */
export const standAt = (crouch) =>
  SCALE.playerHeight + (SCALE.playerCrouchHeight - SCALE.playerHeight) * crouch;
