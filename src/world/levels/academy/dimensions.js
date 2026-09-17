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

   ------------------------------------------------------------
   STAGE 2.1: THIS WHOLE SECTION WAS RE-DERIVED
   ------------------------------------------------------------
   Stage 2 put the first-floor ceiling at 14'6" and the second floor at
   16'0". Photographs of the interior show that was too low by a wide
   margin: the rooms are very tall, the sash windows run from a low sill
   to near the ceiling, the doors are tall, and there is a great deal of
   plain wall above both.

   NONE OF THESE NUMBERS IS A DOCUMENTED HISTORICAL MEASUREMENT. No
   supplied reference gives a story height. They are a photographic
   estimate, chosen once and applied through a small number of classes
   rather than varied room by room, and they are the first thing to
   replace if a measured section ever turns up.

   The estimate starts from the main central first-floor room at
   approximately 4.8 m clear -- call it 15'9" -- and the rest follows from
   that and from the staircase.
   ============================================================ */

/** The principal first-floor rooms: the central room. Photographic
    estimate, ~4.8 m. */
export const CEIL_PRINCIPAL = ftin(15, 9);     // 4.801 m

/** The major exhibit and office rooms in the wings. Nine inches of
    plaster below the same structural floor, which is how a secondary room
    in a building like this is usually finished. ~4.57 m. */
export const CEIL_SECONDARY = ftin(15, 0);     // 4.572 m

/** Closets, the restroom, the store rooms. A fifteen-foot ceiling over a
    four-foot-deep restroom is a joke, and a furred-down service ceiling
    is what is actually there. */
export const CEIL_SERVICE = ftin(11, 0);

/** The structural depth between the principal ceiling and the floor
    above: joists, the boarding on them and the finish floor. */
export const FLOOR_STRUCTURE = ftin(1, 7);

/** Second floor finish level. 15'9" + 1'7" = 17'4", which is 26 risers of
    exactly 8 inches -- see the staircase below, which is what fixes it. */
export const FLOOR2 = CEIL_PRINCIPAL + FLOOR_STRUCTURE;   // 17'4" = 5.283 m

/** Second-floor ceilings. Upper stories in a building of this date sit
    lower than the principal floor, and the photographs of the front show
    the upper windows shorter than the lower. */
export const CEIL_UPPER = ftin(13, 6);
export const FLOOR2_CEIL = FLOOR2 + CEIL_UPPER;           // 30'10"

/** Kept under its old name because a great deal refers to it: the
    structural soffit over the first floor, which the principal rooms
    reach and the secondary rooms stop short of. */
export const FLOOR1_CEIL = CEIL_PRINCIPAL;

/* ------------------------------------------------------------
   THE STAIRCASE

   The story height and the staircase are one problem, and the staircase
   is the harder constraint: the whole switchback -- a half-landing plus
   one flight's run -- has to live inside the 13'5" the middle band leaves
   between the outer wall and the rear hall, and the plan's horizontal
   geometry is not up for revision.

   26 risers of exactly 8 inches reach 17'4". Thirteen to a flight at a
   9¼" run is 10'0¼", and with a 3'4" half-landing the switchback is
   13'4¼" in 13'5". 2R+T works out at 25¼", which is an ordinary figure
   for an institutional stair of this date -- steeper than a modern code
   stair and not steeper than the building.
   ------------------------------------------------------------ */
export const STAIR_RISERS = 26;
export const STAIR_RISE = FLOOR2 / STAIR_RISERS;   // exactly 8"
export const STAIR_RUN = inch(9.25);
export const STAIR_WIDTH = ftin(3, 8);
export const STAIR_LANDING = ftin(3, 4);
/** Handrail height above the nosing line, and the guard round a well. */
export const RAIL_H = ftin(2, 10);

/* ------------------------------------------------------------
   THE ROOF LINE

   The historic photograph shows the CENTRAL BLOCK STANDING ABOVE THE TWO
   FRONT BLOCKS, with its own lettered band and its own crenellated
   parapet over that. Stage 2 ran one parapet height round the whole
   building, which is the single thing that made the front read as squat.
   ------------------------------------------------------------ */
export const ROOF = ftin(32, 4);               // wing deck / parapet base
export const PARAPET_CAP = ftin(34, 6);        // top of the plain parapet
export const PARAPET_TOP = ftin(36, 6);        // top of the merlons

/** The central block, which stands clear of the wings. */
export const ROOF_CENTER = ftin(37, 6);
export const PARAPET_CAP_CENTER = ftin(39, 6);
export const PARAPET_TOP_CENTER = ftin(41, 6);

/** Merlon rhythm. Counted off the historic front elevation: roughly eight
    merlons across a 34'3" block, which puts the pitch near 4'3". */
export const MERLON = ftin(2, 6);
export const CRENEL = ftin(1, 9);
export const MERLON_RISE = PARAPET_TOP - PARAPET_CAP;

/** The corbel table under the parapet: the row of small brackets that
    runs round the building and along the portico, picked out in a
    contrasting color on the real elevation. */
export const CORBEL_PITCH = ftin(2, 2);
export const CORBEL_W = inch(9);
export const CORBEL_H = inch(11);
export const CORBEL_PROJ = inch(7);

/* ------------------------------------------------------------
   THE PORTICO AND ITS TERRACE

   ONE story of columns, a terrace over it at second-floor level with a
   crenellated parapet, and the central block's own upper wall standing
   behind that with its tall windows. It is not a two-story open loggia,
   which is what Stage 2 built.
   ------------------------------------------------------------ */
/** The terrace deck: the same level as the second floor, because that is
    the floor its door opens off. */
export const TERRACE = FLOOR2;
/** Underside of the portico entablature. The columns run to here. */
export const PORTICO_SOFFIT = TERRACE - ftin(1, 6);
/** The entablature band the terrace sits on. */
export const PORTICO_BAND = ftin(1, 6);
/** The terrace's crenellated parapet. */
export const TERRACE_PARAPET = TERRACE + ftin(2, 2);
export const TERRACE_MERLON_TOP = TERRACE + ftin(3, 4);

export const COLUMN_COUNT = 6;
export const COLUMN_DIA = ftin(1, 2);
export const COLUMN_BASE_H = ftin(1, 2);
export const COLUMN_CAP_H = ftin(1, 0);

/** The rear porch is a lean-to and has no terrace over it. */
export const REAR_PORCH_CEIL = ftin(13, 6);
/** Kept for the few places that still ask for "the porch ceiling". */
export const PORCH_CEIL = PORTICO_SOFFIT;

/* ============================================================
   OPENINGS

   Tall and narrow, deeply recessed, multi-pane sash. The interior
   photographs are the evidence for how tall: the windows run from a low
   sill almost to the ceiling and are the dominant vertical element of
   every room.
   ============================================================ */
export const WIN_W = ftin(3, 10);
export const WIN1_SILL = ftin(2, 9);
export const WIN1_HEAD = ftin(13, 0);          // 10'3" of window
export const WIN2_SILL = ftin(2, 6);
export const WIN2_HEAD = ftin(11, 0);          // 8'6" of window
/** How far the opening is recessed from the outer face of the masonry. */
export const WIN_REVEAL = inch(11);
/** Panes per sash, across and up. Three by four is about the finest grid
    that still reads as a window rather than as static at 320x240. */
export const PANES_X = 3;
export const PANES_Y1 = 4;
export const PANES_Y2 = 3;

/* ---- doors ----
   THE ACADEMY'S DOORS ARE NOT THE ENGINE'S DOORS. SCALE.doorHeight is
   6'8", which is a modern domestic leaf and is what a later terminal
   fit-out will want; nothing in this building is that size. These are
   separate on purpose, and both exist. */
export const DOOR_H = ftin(8, 6);              // interior single leaf
export const DOOR_W = ftin(3, 8);
export const SERVICE_DOOR_H = ftin(7, 6);      // closets and the restroom
export const SERVICE_DOOR_W = ftin(2, 10);
export const EXT_DOOR_W = ftin(3, 10);
export const EXT_DOOR_H = ftin(9, 0);
/** The central double doors, which have the arched head the interior
    photograph shows. */
export const DBL_W = ftin(6, 6);
export const DBL_H = ftin(11, 6);
export const DBL_ARCH = ftin(1, 8);            // rise of the arched head

/* ============================================================
   INTERIOR TRIM

   From the interior photographs: painted vertical beadboard wainscot with
   a capping rail, a substantial baseboard under it, and a great deal of
   plain plaster above.
   ============================================================ */
export const BASE_H = ftin(1, 0);              // baseboard
export const WAINSCOT_H = ftin(3, 4);          // top of the cap rail
export const WAINSCOT_CAP = inch(3);           // depth of the cap itself
export const PICTURE_RAIL = ftin(11, 6);       // where the plaster stops

/* ============================================================
   THE CENTRAL ROOM'S COLUMNS

   The interior photograph of the large central first-floor room shows
   slender white painted structural columns running floor to ceiling, with
   a stepped base and a simple molded capital. They are certainly there
   and they are certainly slender.

   WHAT IS NOT ESTABLISHED IS HOW MANY, OR EXACTLY WHERE. One oblique
   photograph shows four of them, in what reads as two receding lines, but
   it does not show the room's corners and it cannot be counted from.

   So the positions live HERE, in one table, in room-local coordinates --
   which is the whole point: when a better photograph or a measured plan
   turns up, this array changes and nothing else does. Two rows of three,
   dividing the 44'3" width into a wide center bay with an aisle each
   side, is the most restrained arrangement consistent with the view.
   ============================================================ */
export const COLUMN_ROW_X = ftin(11, 0);
export const COLUMN_ROW_Z = ftin(10, 6);
/** FOUR, not six. The photograph shows two pairs; Stage 2.1's first pass
    read it as two rows of three and put a pair on the room's cross axis
    that is not there. */
export const CENTRAL_ROOM_COLUMNS = [
  { x: -COLUMN_ROW_X, z: -COLUMN_ROW_Z },
  { x: -COLUMN_ROW_X, z: +COLUMN_ROW_Z },
  { x: +COLUMN_ROW_X, z: -COLUMN_ROW_Z },
  { x: +COLUMN_ROW_X, z: +COLUMN_ROW_Z },
];
/** Slender: the photograph's columns are structural posts, not classical
    orders. Roughly a foot through, with a stepped base and a molded cap. */
export const INT_COLUMN_DIA = inch(11);
export const INT_COLUMN_BASE_H = ftin(1, 4);
export const INT_COLUMN_CAP_H = ftin(1, 2);

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
   THE CENTRAL ROOM'S FOUR SIDE DOORWAYS

   THIS BUILDING IS SYMMETRICAL AND ITS DOORS SHOULD BE TOO. The central
   room opens four ways through its two long walls -- south-west and
   south-east into the exhibit rooms, north-west and north-east into the
   rear halls -- and Stage 2 gave the first pair a different size from the
   second and put them at different distances from the room's center.

   All four are now one size at one station, mirrored about Z = 0. The
   station is fixed by the rear halls: a hall door cannot sit further
   south than the cross wall at Z = 9'1" allows, so 12'6" is as near the
   middle as the plan will let it come, and the exhibit doors take -12'6"
   to match.
   ============================================================ */
export const CENTRAL_DOOR_Z = ftin(12, 6);
export const CENTRAL_DOOR_W = DOOR_W;
export const CENTRAL_DOOR_H = DOOR_H;

/* ============================================================
   THE STAIR HALL ZONE -- REBUILT IN STAGE 2.1

   Stage 2 dropped a staircase into the middle band and then wedged a
   restroom into whatever was left, which produced a four-foot closet
   overlapping the upper flight and two doors opening into the side of a
   stair. This is that zone set out as rectangles first, from which the
   geometry is built -- nothing here is nudged afterwards.

   The west wing's middle band, looking down on it (the east wing is the
   mirror image, X negated):

     X_W_IN                            X_W_HALL_W       X_WING_W_IN
     -54'9"                              -41'4"            -23'9"
        |                                    |                 |
        +------------------------------------+-----------------+  Z_MID_N
        |                                    |                 |   22'1"
        |          R E S T R O O M           |                 |
        |          13'5" x 5'2"              |                 |
        |                                    |   W E S T       |
        +------------------------------------+   R E A R       |  Z_STAIR_N
        |  landing |  flight B  ->  (up)     |   H A L L       |   16'11"
        |  3'4"    |  13 x 9¼" to 17'4"      |                 |
        |  wide    |- - - - - - - - - - - - -| ) restroom door |
        |  8'8"    |  flight A  <-  (up)     |   17'7" x 13'0" |
        |  high    |  13 x 9¼" from 0        | ) stair door    |
        +------------------------------------+-----------------+  Z_MID_S
                   ^                         ^                      9'1"
                   X_STAIR_TURN              X_W_HALL_W
                   -51'4½"

   You come in from the rear hall at the FOOT of flight A, climb west,
   turn on the half-landing against the outer wall, and climb back east,
   arriving over the doorway you came in by. The restroom is its own
   enclosed room across the north end of the band, entered from the rear
   hall, and it touches the staircase nowhere.
   ============================================================ */

/** Between the two flights of a switchback: enough to get a hand round
    the newel and no more. */
export const STAIR_GAP = inch(6);
export const STAIR_WELL_D = 2 * STAIR_WIDTH + STAIR_GAP;      // 7'10"

export const Z_STAIR_S = Z_MID_S;
export const Z_STAIR_N = Z_MID_S + STAIR_WELL_D;              // 16'11"
/** Center lines of the two flights. A is the one you step on. */
export const Z_FLIGHT_A = Z_STAIR_S + STAIR_WIDTH / 2;
export const Z_FLIGHT_B = Z_STAIR_N - STAIR_WIDTH / 2;

/** The service band across the north end of the stair hall. */
export const Z_SERVICE_S = Z_STAIR_N;
export const Z_SERVICE_N = Z_MID_N;

/** Where each switchback turns: the inner edge of its half-landing. */
export const X_STAIR_TURN_W = X_W_IN + STAIR_LANDING;
export const X_STAIR_TURN_E = X_E_IN - STAIR_LANDING;
/** And where you step on, which is the stair hall's inner wall. */
export const X_STAIR_FOOT_W = X_STAIR_TURN_W + (STAIR_RISERS / 2) * STAIR_RUN;
export const X_STAIR_FOOT_E = X_STAIR_TURN_E - (STAIR_RISERS / 2) * STAIR_RUN;

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
