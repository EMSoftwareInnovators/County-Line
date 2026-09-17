/* ============================================================
   dimensions.js -- the Old Academy of Richmond County, in numbers.

   THE SINGLE SOURCE OF TRUTH for the building. Nothing else in the
   academy modules may contain a plan dimension; if a number is needed
   somewhere, it is named here first.

   ------------------------------------------------------------
   SOURCES
   ------------------------------------------------------------
   1. A measured first-floor plan, "The Augusta Museum / Augusta HEC /
      AlexanderDESIGN Inc. 8/1/94 / Richmond County/Augusta Plan 1.0.1",
      at 1/16" = 1'-0". This is the dimensional authority.
   2. Augusta-Richmond County Museum visitor maps of the first and second
      floors. Room identity and partition topology only -- they are
      schematic and not to scale.
   3. The explicit door/connectivity schedule in the Stage 2 brief, which
      overrides the visitor maps wherever they disagree.

   ------------------------------------------------------------
   HOW THE PRINTED NUMBERS WERE RECONCILED
   ------------------------------------------------------------
   The measured plan prints both dimension strings and computed areas. The
   two do not always agree, because the strings are rounded to the inch
   and the areas are not. WHERE THEY CONFLICT THE AREA IS BELIEVED: it
   came out of the drafting software, the string came out of a rounding.

        printed                     area implies
        31' x 37'6"   1166.306      31'0" x 37'7½"
        31' x 37'6"   1173.163      31'0" x 37'10"
        44'6" x 32'   1445.249      44'6" x 32'6"
        30'6" x 26'6"  818.276      30'6" x 26'10"

   Two reconciliations follow, and they are the only places this
   reconstruction knowingly departs from a printed figure:

   A. THE EXTERIOR WALL IS 19½ INCHES. Not printed anywhere, but it is
      the thickness that makes a 34'3" wing come out at exactly the 31'
      interior the plan prints three times. That is not a coincidence, and
      it is the keystone that makes everything else close.

   B. THE GARDEN IS 44'3" WIDE, NOT THE PRINTED 44'7". 112'9" less two
      34'3" wings leaves 44'3". The brief's priority order puts the
      overall footprint and the wing proportions above an individual
      annotation, so the four inches are taken out of the garden.

      This produces a result worth stating plainly: THE GARDEN IS EXACTLY
      AS WIDE AS THE CENTRAL ROOM. The rear wings are the northward
      continuation of the front block's flanking masses, and the plan
      prints 44'7" and 44'6" for what is one dimension measured twice.
      Both are `BAY` below.

   With those two, both wings close on 94'0" to the inch:

        19½" + 37'10" + 12" + 13'0" + 12" + 37'11" + 19½"  =  94'0"

   ------------------------------------------------------------
   COORDINATES
   ------------------------------------------------------------
   Stage 1's convention, unchanged: 1 world unit = 1 meter,
   +X east, +Y up, +Z north, yaw 0 faces north.

   THE ORIGIN (0, 0, 0) IS THE CENTER OF THE FIRST-FLOOR CENTRAL ROOM,
   at finished floor level -- the room the visitor map calls REVOLUTIONARY
   WAR. X = 0 is therefore the building's center line, and the front
   (Telfair Street) façade lies at Z = -31'4½".
   ============================================================ */
import { ft, ftin, inch } from '../../../engine/units.js';

/* ============================================================
   THE FABRIC
   ============================================================ */

/** Exterior masonry. See reconciliation A above. */
export const EXT = ftin(1, 7.5);        // 0.4953 m
/** Major interior cross-wall: load-bearing, one story to the next. */
export const CROSS = ft(1);             // 0.3048 m
/** Light interior partition. */
export const PART = inch(8);            // 0.2032 m

/* ============================================================
   THE FOOTPRINT
   ============================================================ */

export const WIDTH = ftin(112, 9);      // 34.366 m, east-west overall
export const DEPTH = ft(94);            // 28.651 m, north-south overall
export const WING = ftin(34, 3);        // 10.439 m, each rear wing
/** The central bay: the garden, the rear porch, the central room and the
    front porch are all exactly this wide. See reconciliation B. */
export const BAY = WIDTH - 2 * WING;    // 13.487 m  (44'3")

/* ---- east-west stations, west to east ---- */
export const X_W_OUT = -WIDTH / 2;            // west face of the west wing
export const X_W_IN = X_W_OUT + EXT;          // its inner plaster
export const X_BAY_W = -BAY / 2;              // garden / central-room west face
export const X_WING_W_IN = X_BAY_W - EXT;     // west wing's garden-facing plaster
export const X_BAY_E = +BAY / 2;
export const X_WING_E_IN = X_BAY_E + EXT;
export const X_E_IN = +WIDTH / 2 - EXT;
export const X_E_OUT = +WIDTH / 2;

/** Clear interior width of either wing. 31'0" exactly. */
export const WING_IN = X_WING_W_IN - X_W_IN;

/* ============================================================
   NORTH-SOUTH STATIONS
   ------------------------------------------------------------
   Built outward from the central room, which owns the origin.
   ============================================================ */

export const CENTRAL_DEPTH = ftin(32, 6);     // 9.906 m  (from the 1445 ft² area)
export const FRONT_PORCH_DEPTH = ftin(13, 6); // 4.115 m
export const REAR_PORCH_DEPTH = ft(15);       // 4.572 m

export const Z_CENTRAL_S = -CENTRAL_DEPTH / 2;          // -16'3"
export const Z_CENTRAL_N = +CENTRAL_DEPTH / 2;          // +16'3"
export const Z_CENTRAL_S_OUT = Z_CENTRAL_S - EXT;
export const Z_CENTRAL_N_OUT = Z_CENTRAL_N + EXT;

/** The front façade: the south face of the projecting west and east
    front blocks. The central block is recessed behind the front porch. */
export const Z_FACADE = Z_CENTRAL_S_OUT - FRONT_PORCH_DEPTH;
export const Z_S_IN = Z_FACADE + EXT;                   // front block inner plaster
export const Z_N_OUT = Z_FACADE + DEPTH;                // north end of the wings
export const Z_N_IN = Z_N_OUT - EXT;

/** North edge of the covered rear porch; the garden begins here. */
export const Z_PORCH_N = Z_CENTRAL_N_OUT + REAR_PORCH_DEPTH;

/* ---- the three bands every wing is divided into, south to north ---- */
export const FRONT_BLOCK = ftin(37, 10);   // 11.532 m
export const MID_BAND = ft(13);            //  3.962 m
export const NORTH_BAND = ftin(37, 11);    // 11.557 m

export const Z_FB_N = Z_S_IN + FRONT_BLOCK;        // north face of the front block
export const Z_MID_S = Z_FB_N + CROSS;
export const Z_MID_N = Z_MID_S + MID_BAND;
export const Z_NB_S = Z_MID_N + CROSS;
/* Z_NB_S + NORTH_BAND === Z_N_IN, to the inch. */

/* ---- west front block: Docent band, then Indians of the Southeast ---- */
export const DOCENT_DEPTH = ftin(10, 4);
export const INDIANS_DEPTH = ftin(26, 6);
export const Z_DOCENT_N = Z_S_IN + DOCENT_DEPTH;
export const Z_INDIANS_S = Z_DOCENT_N + CROSS;

/* ---- east north band: a 17'10" west column and a 12'6" east strip ---- */
export const EAST_COL = ftin(17, 10);
export const EAST_STRIP = ftin(12, 6);
export const X_EAST_COL_E = X_WING_E_IN + EAST_COL;
export const X_EAST_STRIP_W = X_EAST_COL_E + PART;

/* west column, north to south: Staff, then the Animal Room */
export const STAFF_DEPTH = ftin(18, 11);
export const ANIMAL_DEPTH = ftin(18, 4);
export const Z_STAFF_S = Z_N_IN - STAFF_DEPTH;
export const Z_ANIMAL_N = Z_STAFF_S - PART;

/* east strip, north to south: 13'0", 8'7", 15'0" */
export const STRIP_N = ft(13);
export const STRIP_M = ftin(8, 7);
export const STRIP_S = ft(15);
export const Z_STRIP_N_S = Z_N_IN - STRIP_N;
export const Z_STRIP_M_N = Z_STRIP_N_S - PART;
export const Z_STRIP_M_S = Z_STRIP_M_N - STRIP_M;
export const Z_STRIP_S_N = Z_STRIP_M_S - PART;

/* ---- the middle band, split east-west ----
   The measured plan's 226.911 ft² room is 17'7" x 13'. It is not a room:
   it is the circulation hall that carries the central room through to the
   rear porch. The remaining 12'9" against the outer wall holds the
   staircase and, tucked beside it, the restroom. */
export const REAR_HALL_W = ftin(17, 7);
export const X_W_HALL_W = X_WING_W_IN - REAR_HALL_W;   // west rear hall's west wall
export const X_E_HALL_E = X_WING_E_IN + REAR_HALL_W;   // east rear hall's east wall

/* ============================================================
   HEIGHTS

   No story height is printed on any of the supplied references, so these
   are chosen rather than measured, and they are chosen ONCE and applied
   consistently rather than varied room by room.

   14'6" on the first floor sits in the middle of the brief's 14-16 ft
   band and is unremarkable for an 1850s institutional building of this
   size. 18 inches of floor structure over it puts the second floor at
   exactly 16'0" -- which is 24 risers of 8 inches, an integer flight, and
   that is why the number was chosen. The staircase governs the story
   height, not the other way round.
   ============================================================ */

export const FLOOR1_CEIL = ftin(14, 6);        // 4.420 m
export const FLOOR_STRUCTURE = ftin(1, 6);     // 0.457 m
export const FLOOR2 = FLOOR1_CEIL + FLOOR_STRUCTURE;   // 16'0" = 4.877 m
export const FLOOR2_CEIL = FLOOR2 + ft(13);    // 29'0"

export const STAIR_RISERS = 24;
export const STAIR_RISE = FLOOR2 / STAIR_RISERS;   // exactly 8"
export const STAIR_RUN = inch(10);
export const STAIR_WIDTH = ftin(3, 8);
/** Half-landing depth, at the turn of each switchback. 3'4" rather than a
    more generous figure because the whole switchback -- landing plus a
    ten-foot run -- has to live inside the 13'5" the middle band leaves
    between the outer wall and the rear hall. It does, with an inch over. */
export const STAIR_LANDING = ftin(3, 4);

/* ---- roof ---- */
export const ROOF = ftin(30, 6);               // deck / parapet base
export const PARAPET_TOP = ft(34);             // top of the merlons
export const MERLON = ftin(2, 6);              // merlon width
export const CRENEL = ft(2);                   // gap width
export const MERLON_RISE = ftin(1, 9);         // how far a merlon stands proud

/* ---- porch roofs ---- */
export const PORCH_CEIL = ftin(13, 0);         // underside of the front gallery
export const REAR_PORCH_CEIL = ftin(13, 6);

/* ============================================================
   OPENINGS
   ============================================================ */

/** Tall and narrow, with a drip mold over each: the Tudor-Gothic rhythm
    that is most of what makes the elevations recognisable. */
export const WIN_W = ft(4);
export const WIN1_SILL = ftin(2, 9);
export const WIN1_HEAD = ftin(11, 6);
export const WIN2_SILL = ftin(2, 6);
export const WIN2_HEAD = ftin(10, 6);

export const DOOR_H = ftin(7, 6);              // interior single leaf
export const DOOR_W = ftin(3, 4);
export const DBL_W = ft(6);                    // the central double doors
export const DBL_H = ftin(9, 0);
export const EXT_DOOR_W = ftin(3, 8);
export const EXT_DOOR_H = ft(8);

/* ============================================================
   GROUNDS
   ============================================================ */

/** The site sits above the street; the front porch is reached by steps. */
export const GRADE = -ftin(3, 0);              // exterior ground, relative to floor 1
export const FRONT_LAWN = ft(70);              // depth of ground south of the façade
export const SIDE_GROUND = ft(40);             // ground beyond each side wall
export const REAR_GROUND = ft(50);             // ground north of the wings

/** The garden floor is a step below the porch, not down at street grade. */
export const GARDEN_LEVEL = -ftin(1, 6);

/* ============================================================
   A convenience bundle, for the debug overlay and the tests.
   ============================================================ */
export const PLAN = {
  WIDTH, DEPTH, WING, BAY, EXT, CROSS, PART,
  X_W_OUT, X_W_IN, X_BAY_W, X_WING_W_IN, X_BAY_E, X_WING_E_IN, X_E_IN, X_E_OUT,
  Z_FACADE, Z_S_IN, Z_CENTRAL_S, Z_CENTRAL_N, Z_PORCH_N, Z_N_IN, Z_N_OUT,
  Z_FB_N, Z_MID_S, Z_MID_N, Z_NB_S,
  FLOOR2, FLOOR1_CEIL, FLOOR2_CEIL, ROOF, PARAPET_TOP,
  GRADE, GARDEN_LEVEL,
};
