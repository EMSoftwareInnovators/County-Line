/* ============================================================
   rooms.js -- the rooms of the Old Academy, once, as data.

   These tables were local to firstfloor.js and secondfloor.js, which was
   right while the building was the only thing being built. Stage 3 adds
   three more readers -- the light fittings, the circuit schedule, and the
   bus terminal's furniture -- and four copies of "where is the Gift Shop"
   is four places for the Gift Shop to move without the other three
   noticing.

   THE SAME RULE AS dimensions.js: a room's rectangle is named here and
   nowhere else. The floor modules build from this, the fixtures light
   from it, the terminal furnishes from it, and `roomAt` is the only thing
   that knows the player is standing in one.

   `ceil` IS ALWAYS THE CLEAR HEIGHT ABOVE THAT ROOM'S OWN FLOOR, never an
   absolute Y. On the first floor those are the same number and it took a
   pendant hanging eighteen feet below a second-floor ceiling to find out
   they are not the same thing. `ceilY` in the derived record is the
   absolute one, for anything that needs to hang something from it.

   On the first floor `ceil` is one of the three ceiling classes. `use` is
   what the bus company does with the space, which is a caption on the
   architecture and not a change to it.
   ============================================================ */
import { ft, ftin } from '../../../engine/units.js';
import * as D from './dimensions.js';

/* The two lines that divide the front blocks. The library takes the
   street end of the west one; the newsstand takes the inner column of the
   east one, because that column has both the portico door and the door to
   the lobby. */
export const X_DOCENT_E = D.X_W_IN + ft(18);
export const X_SHOP_W = D.X_E_IN - ft(18);

const P_ = D.CEIL_PRINCIPAL, S_ = D.CEIL_SECONDARY, V_ = D.CEIL_SERVICE;

/** [id, name, x0, x1, z0, z1, ceil, use] */
export const FLOOR1 = [
  ['academy.central', 'Central Room', D.X_BAY_W, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N, P_,
    'Main Terminal Lobby'],

  /* ---- west wing, south to north ---- */
  ['academy.west.docent', 'Docent Library', D.X_W_IN, X_DOCENT_E, D.Z_S_IN, D.Z_DOCENT_N, S_,
    'Night Clerk / Dispatch'],
  ['academy.west.store', 'West Store Room', X_DOCENT_E + D.PART, D.X_WING_W_IN, D.Z_S_IN, D.Z_DOCENT_N, V_,
    'Supplies'],
  ['academy.indians', 'Indians of the Southeast', D.X_W_IN, D.X_WING_W_IN, D.Z_INDIANS_S, D.Z_FB_N, S_,
    'Departure Waiting Room'],
  /* THE STAIR HALLS GET NO CEILING. They are the same footprint as the
     well, and the well is a hole in the floor above -- a plaster ceiling
     over one is a ceiling across a staircase, which stops the player's
     head at about the ninth riser and then drops them back down it. `P_`
     here means "reaches the structural floor", and over the well there is
     no structural floor to reach. */
  ['academy.west.stairhall', 'West Stair Hall', D.X_W_IN, D.X_W_HALL_W - D.PART, D.Z_MID_S, D.Z_STAIR_N, P_,
    'West Stair'],
  ['academy.west.rearhall', 'West Rear Hall', D.X_W_HALL_W, D.X_WING_W_IN, D.Z_MID_S, D.Z_MID_N, S_,
    'Platform Corridor'],
  ['academy.west.offices', 'Offices', D.X_W_IN, D.X_WING_W_IN, D.Z_NB_S, D.Z_N_IN, S_,
    'Manager / Accounting'],

  /* ---- east wing, south to north ----
     THE GIFT SHOP IS ONE ROOM, and it is the room the front porch opens
     into AND the room the central room opens into -- which is why the
     newsstand is in it. */
  ['academy.giftshop', 'Gift Shop', D.X_WING_E_IN, X_SHOP_W, D.Z_S_IN, D.Z_FB_N, S_,
    'Newsstand & Snack Counter'],
  ['academy.americana.main', 'Americana', X_SHOP_W + D.PART, D.X_E_IN, D.Z_S_IN, D.Z_FB_N, S_,
    'Arrivals / Overflow & Customer Service'],
  ['academy.east.rearhall', 'East Rear Hall / USS Augusta', D.X_WING_E_IN, D.X_E_HALL_E, D.Z_MID_S, D.Z_MID_N, S_,
    'Baggage Sorting / Operations'],
  ['academy.east.stairhall', 'East Stair Hall', D.X_E_HALL_E + D.PART, D.X_E_IN, D.Z_MID_S, D.Z_STAIR_N, P_,
    'East Stair'],
  ['academy.east.animal', 'Animal Room', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_NB_S, D.Z_ANIMAL_N, S_,
    'Checked Baggage & Parcels'],
  ['academy.east.staff', 'Staff', D.X_WING_E_IN, D.X_EAST_COL_E, D.Z_STAFF_S, D.Z_N_IN, S_,
    'Driver / Employee Break Room'],
  ['academy.east.service', 'East Service Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_NB_S, D.Z_STRIP_S_N, S_,
    'Operations Store'],
  ['academy.east.vestibule', 'East Vestibule', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_M_S, D.Z_STRIP_M_N, V_,
    'Service Vestibule'],
  ['academy.east.council', 'Council Room', D.X_EAST_STRIP_W, D.X_E_IN, D.Z_STRIP_N_S, D.Z_N_IN, S_,
    'Records'],
];

/* The east wing's north band upstairs, split by one cross wall: the
   smaller room south, the Archives filling the rest. */
export const MIN_Z = D.Z_NB_S + ftin(13, 6);

/** The upper story's clear height, above its own floor. */
export const UPPER_CLEAR = D.FLOOR2_CEIL - D.FLOOR2;

/** [id, name, x0, x1, z0, z1, ceil, use] -- the whole story is one height. */
export const FLOOR2 = [
  ['academy.upper.west.rotating', 'Rotating Exhibits', D.X_W_IN, D.X_WING_W_IN, D.Z_S_IN, D.Z_FB_N, UPPER_CLEAR,
    'Overflow Storage'],
  ['academy.upper.west.landing', 'West Upper Landing', D.X_W_IN, D.X_WING_W_IN, D.Z_MID_S, D.Z_MID_N, UPPER_CLEAR,
    'Landing'],
  ['academy.upper.west.history', 'Augusta-Richmond County History', D.X_W_IN, D.X_WING_W_IN, D.Z_NB_S, D.Z_N_IN, UPPER_CLEAR,
    'Company Records'],

  ['academy.upper.center.war', 'The War Room', D.X_BAY_W, 0, D.Z_CENTRAL_S, D.Z_CENTRAL_N, UPPER_CLEAR,
    'Training & Meetings'],
  ['academy.upper.center.mammals', 'Modern Mammals', 0, D.X_BAY_E, D.Z_CENTRAL_S, D.Z_CENTRAL_N, UPPER_CLEAR,
    'Training & Meetings'],

  ['academy.upper.east.natural', 'Natural History', D.X_WING_E_IN, D.X_E_IN, D.Z_S_IN, D.Z_FB_N, UPPER_CLEAR,
    'Dead Storage'],
  ['academy.upper.east.landing', 'East Upper Landing', D.X_WING_E_IN, D.X_E_IN, D.Z_MID_S, D.Z_MID_N, UPPER_CLEAR,
    'Landing'],
  ['academy.upper.east.minerals', 'Rocks & Minerals', D.X_WING_E_IN, D.X_E_IN, D.Z_NB_S, MIN_Z, UPPER_CLEAR,
    'Maintenance & Electrical Supplies'],
  ['academy.upper.east.archives', 'Archives', D.X_WING_E_IN, D.X_E_IN, MIN_Z + D.PART, D.Z_N_IN, UPPER_CLEAR,
    'Restricted Records'],
];

/* The two rooms across the north end of the stair bands. They are built
   by stairHallZone() rather than by the room loop -- their walls come
   from the stair zone's own rectangles -- so they are listed apart from
   FLOOR1 and joined into ROOMS below. Everything that furnishes or
   lights a room still finds them. */
export const SERVICE = [
  ['academy.west.restroom', 'Restroom',
    Math.min(D.X_W_IN, D.X_W_HALL_W - D.PART), Math.max(D.X_W_IN, D.X_W_HALL_W - D.PART),
    D.Z_SERVICE_S + D.PART, D.Z_SERVICE_N, D.CEIL_SERVICE, 'Public Restroom'],
  ['academy.east.entry', 'East Entrance',
    Math.min(D.X_E_IN, D.X_E_HALL_E + D.PART), Math.max(D.X_E_IN, D.X_E_HALL_E + D.PART),
    D.Z_SERVICE_S + D.PART, D.Z_SERVICE_N, D.CEIL_SECONDARY, 'Platform Entrance'],
];

/** One record per room, both floors, in a shape with names on it. */
export const ROOMS = [...FLOOR1, ...SERVICE, ...FLOOR2].map(
  ([id, name, x0, x1, z0, z1, ceil, use], i) => ({
    id, name, x0, x1, z0, z1, ceil, use,
    floor: i < FLOOR1.length + SERVICE.length ? 1 : 2,
    y: i < FLOOR1.length + SERVICE.length ? 0 : D.FLOOR2,
    cx: (x0 + x1) / 2, cz: (z0 + z1) / 2,
    w: x1 - x0, d: z1 - z0,
    ceilY: (i < FLOOR1.length + SERVICE.length ? 0 : D.FLOOR2) + ceil,
  })
);

const byId = new Map(ROOMS.map((r) => [r.id, r]));

/** @throws if the id is not a room -- a typo here is a light in a wall. */
export function room(id) {
  const r = byId.get(id);
  if (!r) throw new Error(`no room "${id}"`);
  return r;
}

export const hasRoom = (id) => byId.has(id);
