/* ============================================================
   staff.js -- behind the counter: the clerk's office and its panel wall,
   the manager's offices, both baggage rooms, the break room, and the
   stores.

   ------------------------------------------------------------
   THE PANEL WALL, AND WHY IT IS WHERE IT IS

   The Docent Library is the innermost room of the west front block. You
   reach it from the departure waiting room, or through the supply room
   from the portico -- the portico's west door opens into the supply
   room, not into the library, which is a fact about the 1994 measured
   plan and not a choice made here.

   That makes the library the natural place to have brought a supply
   into: an inner room, off the public route, with a door at each end.
   Which is where the panels are, which is why the night clerk's desk is
   in it, which is why the player will be in this room a dozen times a
   shift.

   The panels themselves go on the SOUTH wall. The west wall is the
   street elevation and has a ten-foot sash window in it at exactly the
   station a panel would want; the north wall has the door to the
   waiting room; the east wall has the door to the supply room. The south
   wall is the facade, and the facade's west block has windows at
   x = -49'6" and -39'3", which leaves six and a half clear feet between
   them. Three cabinets fit in six and a half feet. Nothing else about
   this room is negotiable either.
   ------------------------------------------------------------ */
import { ft, ftin, inch } from '../../../../engine/units.js';
import * as D from '../dimensions.js';
import { room } from '../rooms.js';
import { CIRCUITS } from '../fixtures.js';
import { conduitRun, surfaceBox } from '../fittings.js';
import {
  block, cart, crt, desk, lockers, luggage, papers, phone, scale,
  shelving, sign, standOn, trash, vending, floorMat, bench, wallRuns, inRuns,
} from './props.js';

/* ============================================================
   NIGHT CLERK / DISPATCH / ELECTRICAL
   ============================================================ */
function clerkOffice(b) {
  const M = b.M;
  const r = room('academy.west.docent');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* ---- the desk, facing the panel wall ---- */
  /* The desk is pushed to the west end of the room: the doorway into
     the waiting room is at x = -45, and a six-foot desk whose end is
     three feet from a jamb is a desk you edge past sideways. */
  const DX0 = ft(-53.5), DX1 = ft(-47.5);
  const DZ0 = ft(-23.5), DZ1 = ft(-21);
  desk(b, { x0: DX0, x1: DX1, z0: DZ0, z1: DZ1, chair: [ft(-50.5), ft(-20)] });
  const TOP = ftin(2, 6);
  phone(b, { x: ft(-52.5), y: TOP, z: ft(-22.2) });
  papers(b, { x: ft(-50.5), y: TOP, z: ft(-22.2), w: ftin(1, 0), d: ftin(1, 4), h: inch(2) });
  papers(b, { x: ft(-48.7), y: TOP, z: ft(-22.2), w: ftin(0, 10), d: ftin(1, 2), h: inch(4) });
  crt(b, { x: ft(-48.4), y: TOP, z: ft(-23), face: 'east', w: ftin(1, 2), h: ftin(1, 1) });

  b.station({
    id: 'clerk-desk', name: 'Clerk desk', room: r.id,
    box: { x0: DX0, x1: DX1, z0: DZ0 - ftin(2, 0), z1: DZ1, y0: ftin(1, 6), y1: ftin(3, 6) },
    idle: 'A clipboard, a route binder and somebody else’s coffee ring.',
    priority: 2,
  });
  b.station({
    id: 'shift-log', name: 'Shift log', room: r.id,
    box: {
      x0: ft(-51.1), x1: ft(-49.9), z0: ft(-22.9), z1: ft(-21.5),
      y0: TOP, y1: TOP + ftin(0, 8),
    },
    priority: 5,
  });
  b.station({
    id: 'clerk-phone', name: 'Telephone', room: r.id,
    box: {
      x0: ft(-53.3), x1: ft(-51.7), z0: ft(-22.9), z1: ft(-21.5),
      y0: TOP, y1: TOP + ftin(0, 10),
    },
    priority: 5,
  });

  /* ---- the PA amplifier and its microphone, on a shelf beside the desk ---- */
  block(b, {
    x0: ft(-54.5), x1: ft(-52.6), z0: ft(-24.5), z1: ft(-22.5),
    y0: ftin(2, 6), y1: ftin(3, 4), material: M.officeSteel, tag: 'pa-amp',
  });
  block(b, {
    x0: ft(-53.9), x1: ft(-53.3), z0: ft(-23.9), z1: ft(-23.3),
    y0: ftin(3, 4), y1: ftin(4, 2), material: M.chrome, tag: 'pa-mic', solid: false,
  });
  sign(b, {
    x: ft(-53.5), z: ft(-25.4), y: ftin(4, 6), face: 'north',
    w: ftin(1, 10), h: ftin(0, 6), material: M.plate('P.A.', { size: 13 }),
  });
  b.device({ id: 'pa-amp', circuit: 'clerk', draw: 1.6, label: 'P.A. amplifier' });
  b.device({ id: 'clerk-crt', circuit: 'clerk', draw: 1.2, label: 'Dispatch terminal' });
  b.device({ id: 'clerk-lamp', circuit: 'clerk', draw: 0.5, label: 'Desk lamp' });
  b.station({
    id: 'pa-desk', name: 'Public address', room: r.id,
    box: {
      x0: ft(-54.6), x1: ft(-52.5), z0: ft(-24.6), z1: ft(-22.4),
      y0: ftin(2, 4), y1: ftin(4, 4),
    },
    priority: 4,
  });

  /* ---- the panel wall ----
     Three cabinets between the two facade windows, with the original
     1920s one in the middle because that is where the service came in
     and the two additions went either side of it. */
  const WALL = D.Z_S_IN;
  const PANEL_Y = ftin(5, 0);
  const cabX = { A: ft(-44.4), B: ft(-47.0), C: ft(-41.8) };
  for (const p of ['A', 'B', 'C']) {
    const x = cabX[p];
    const w = ftin(1, 8), h = ftin(2, 4), d = inch(5);
    block(b, {
      x0: x - w / 2, x1: x + w / 2, z0: WALL + inch(1), z1: WALL + inch(1) + d,
      y0: PANEL_Y - h / 2, y1: PANEL_Y + h / 2,
      material: M.officeSteel, tag: 'panel', solid: false,
    });
    /* the open door hanging off it, with the schedule card inside */
    block(b, {
      x0: x + w / 2, x1: x + w / 2 + inch(1), z0: WALL + inch(1), z1: WALL + inch(1) + d + ftin(1, 2),
      y0: PANEL_Y - h / 2, y1: PANEL_Y + h / 2,
      material: M.officeSteel, tag: 'panel-door', solid: false,
    });
    block(b, {
      x0: x - w / 2 + inch(2), x1: x + w / 2 - inch(2),
      /* Three quarters of an inch proud of the cabinet: the card is
         screwed to the outside of the door, not flush into the steel.
         A quarter inch is not enough -- see board() in props.js. */
      z0: WALL + inch(1) + d - inch(1), z1: WALL + inch(1) + d + inch(0.75),
      y0: PANEL_Y - h / 2 + inch(3), y1: PANEL_Y + h / 2 - inch(3),
      material: M.plate(`PANEL ${p}`, { bg: '#c9c2a8', fg: '#23242a', size: 13, h: 64 }),
      tag: 'schedule', solid: false,
    });
    sign(b, {
      x, z: WALL + inch(1), y: PANEL_Y + h / 2 + ftin(0, 6), face: 'north',
      w: ftin(1, 4), h: ftin(0, 5),
      material: M.plate(p, { size: 15, w: 32, h: 32 }),
    });
    /* conduit up from the cabinet and away along the wall */
    conduitRun(b, {
      axis: 'z', x, z: WALL + inch(3), y: PANEL_Y + h / 2,
      from: WALL + inch(2), to: WALL + inch(4),
    });
    /* The junction box goes ABOVE the chair rail. An electrician does
       not screw a box to a moulding, and a box level with the rail is
       also a box sharing the rail's own face plane. */
    surfaceBox(b, { x, z: WALL + inch(1), y: PANEL_Y - h / 2 - ftin(0, 3), face: 'north' });
    b.station({
      id: `panel-${p.toLowerCase()}`, name: `Breaker panel ${p}`, room: r.id,
      box: {
        x0: x - w / 2 - inch(2), x1: x + w / 2 + ftin(1, 0),
        z0: WALL, z1: WALL + ftin(2, 0),
        y0: PANEL_Y - h / 2 - inch(4), y1: PANEL_Y + h / 2 + inch(4),
      },
      data: { panel: p },
      priority: 4,
    });
  }
  /* the horizontal run that ties the three cabinets together, and the
     one that leaves for the rest of the building */
  conduitRun(b, {
    axis: 'x', z: WALL + inch(4), y: ftin(6, 8),
    from: ft(-48.2), to: ft(-40.6),
  });
  conduitRun(b, {
    axis: 'z', x: ft(-40.8), y: ftin(6, 8),
    from: WALL + inch(4), to: r.z1 - inch(4),
  });

  /* ---- the switch bank, on the north wall west of the door ----
     Twelve labelled toggles in two columns of six. Each one is its own
     station, because flipping a light switch is a physical act and a
     menu of twelve rows is not. */
  const SW_Z = r.z1 - inch(2);
  const SW_X = ft(-51.5);
  const SW_TOP = ftin(4, 10);
  const CW = ftin(1, 3), RH = ftin(0, 7);
  block(b, {
    x0: SW_X - CW, x1: SW_X + CW, z0: SW_Z - inch(2), z1: SW_Z,
    y0: SW_TOP - RH * 6 - inch(3), y1: SW_TOP + inch(3),
    material: M.panelGray, tag: 'switch-bank', solid: false,
  });
  CIRCUITS.forEach((c, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = SW_X + (col === 0 ? -CW / 2 : CW / 2);
    const y = SW_TOP - row * RH;
    block(b, {
      x0: x - inch(2), x1: x + inch(2), z0: SW_Z - inch(3), z1: SW_Z - inch(2),
      y0: y - inch(2), y1: y + inch(2),
      material: M.chrome, tag: 'switch', solid: false,
    });
    b.station({
      id: `switch.${c.id}`, name: c.label, room: r.id,
      box: {
        x0: x - CW / 2 + inch(1), x1: x + CW / 2 - inch(1),
        z0: SW_Z - ftin(1, 0), z1: SW_Z,
        y0: y - RH / 2, y1: y + RH / 2,
      },
      data: { circuit: c.id },
      priority: 6,
    });
  });
  sign(b, {
    x: SW_X, z: SW_Z, y: SW_TOP + ftin(0, 10), face: 'south',
    w: ftin(2, 6), h: ftin(0, 6), material: M.plate('BUILDING LIGHTS', { size: 11 }),
  });

  /* ---- spares, keys, and the route binders ----
     The cabinet is in the south-east corner rather than beside the
     store-room door: the east wall is ten feet of wall with a doorway
     in the middle of it, and a six-foot steel cabinet three feet from a
     doorway is a cabinet somebody walks into in the dark. */
  const SPZ0 = r.z0 + inch(4), SPZ1 = r.z0 + ftin(3, 0);
  block(b, {
    x0: r.x1 - ftin(2, 0), x1: r.x1 - inch(3), z0: SPZ0, z1: SPZ1,
    y0: 0, y1: ftin(6, 0), material: M.officeSteel, tag: 'spares',
  });
  sign(b, {
    x: r.x1 - ftin(1, 2), z: (SPZ0 + SPZ1) / 2, y: ftin(6, 6), face: 'west',
    w: ftin(2, 0), h: ftin(0, 6),
    material: M.plate('FUSES / SPARES', { size: 10 }),
  });
  b.station({
    id: 'spares', name: 'Fuse and spares cabinet', room: r.id,
    box: {
      x0: r.x1 - ftin(3, 0), x1: r.x1, z0: SPZ0, z1: SPZ1,
      y0: ftin(2, 0), y1: ftin(5, 0),
    },
    idle: 'Tubes, lamps, a box of thirty-amp cartridges nothing here takes.',
  });

  /* The key board, on the north wall EAST of the door to the waiting
     room. Not beside the door: at four foot two it is exactly at the
     height of somebody's line of sight walking through, which means an
     interactable that gets picked instead of the door. */
  block(b, {
    x0: ft(-42.5), x1: ft(-40.5), z0: r.z1 - inch(2), z1: r.z1 - inch(1),
    y0: ftin(4, 2), y1: ftin(5, 4), material: M.plate('KEYS', { bg: '#4e3a28', fg: '#ddd7c4', size: 13 }),
    tag: 'keys', solid: false,
  });
  b.station({
    id: 'key-board', name: 'Key board', room: r.id,
    box: {
      x0: ft(-42.8), x1: ft(-40.2), z0: r.z1 - ftin(1, 0), z1: r.z1,
      y0: ftin(3, 10), y1: ftin(5, 8),
    },
    priority: 4,
  });

  /* a shelf of route binders over the desk */
  block(b, {
    x0: DX0, x1: DX1, z0: r.z0 + inch(2), z1: r.z0 + ftin(1, 0),
    y0: ftin(5, 6), y1: ftin(5, 8), material: M.deskOak, tag: 'shelf', solid: false,
  });
  for (let i = 0; i < 5; i++) {
    papers(b, {
      x: DX0 + ftin(1, 0) + i * ftin(1, 1), y: ftin(5, 8), z: r.z0 + ftin(0, 7),
      w: ftin(0, 9), d: ftin(0, 10), h: ftin(0, 11),
      material: i % 2 ? M.deskOak : M.paper,
    });
  }
  trash(b, { x: ft(-54), z: ft(-20.5) });
}

/* ============================================================
   MANAGER / ACCOUNTING -- the west Offices

   Thirty-one by thirty-eight feet of daytime work that is shut at night.
   Four desks, a wall of files, and nothing the player needs. It exists
   so that the door out of the waiting room goes somewhere.
   ============================================================ */
function offices(b) {
  const M = b.M;
  const r = room('academy.west.offices');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.6);

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = r.x0 + ftin(7, 0) + i * ftin(14, 0);
      const z = r.z0 + ftin(8, 0) + j * ftin(16, 0);
      desk(b, {
        x0: x - ftin(2, 6), x1: x + ftin(2, 6), z0: z - ftin(1, 3), z1: z + ftin(1, 3),
        chair: [x, z + ftin(2, 6)],
      });
      papers(b, { x, y: ftin(2, 6), z, w: ftin(1, 2), d: ftin(1, 6), h: inch(3) });
    }
  }
  lockers(b, {
    x0: r.x1 - ftin(1, 6), x1: r.x1 - inch(3), z0: r.z0 + ftin(2, 0), z1: r.z0 + ftin(14, 0),
    axis: 'z', face: 'west', doors: 6, height: ftin(4, 6),
  });
  block(b, {
    x0: r.x0 + inch(3), x1: r.x0 + ftin(1, 6), z0: r.z1 - ftin(12, 0), z1: r.z1 - ftin(2, 0),
    y0: 0, y1: ftin(6, 0), material: M.officeSteel, tag: 'files',
  });
  sign(b, {
    x: r.cx, z: r.z0 + inch(2), y: ftin(8, 0), face: 'north',
    w: ftin(4, 0), h: ftin(0, 10),
    material: M.plate('ADMINISTRATION', { size: 12 }),
  });
  trash(b, { x: r.x0 + ftin(3, 0), z: r.z0 + ftin(3, 0) });
}

/* ============================================================
   CHECKED BAGGAGE AND PARCELS -- the Animal Room

   The scale, the tag desk, and the racks a bag waits on. This is the
   other room the player works in.

   IT IS ALSO A CORRIDOR, which is what decided the layout. Four ways
   out: the opening south to operations, the door north to the staff
   room, and two doors east into the service rooms. The south opening
   and the north door are both on x = 32, so there is a cart lane
   straight through the middle of the room that nothing may stand in --
   and the two east doors need their own four feet of floor in front of
   them. What is left is a block on the west side and a block on the
   east between the two doors, and that is where the room is.
   ============================================================ */
function baggageRoom(b) {
  const M = b.M;
  const r = room('academy.east.animal');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* ---- the scale and the tag desk, west block, near the opening the
         bags come in through ---- */
  const SX = r.x0 + ftin(3, 6), SZ = r.z0 + ftin(4, 0);
  scale(b, { x: SX, z: SZ, dial: 'east' });
  b.device({ id: 'baggage-scale', circuit: 'east-rear', draw: 0.7, label: 'Baggage scale' });
  b.station({
    id: 'baggage-scale', name: 'Baggage scale', room: r.id,
    box: {
      x0: SX - ftin(2, 0), x1: SX + ftin(2, 6), z0: SZ - ftin(2, 0), z1: SZ + ftin(2, 0),
      y0: 0, y1: ftin(4, 0),
    },
    priority: 3,
  });

  const TX = SX, TZ = r.z0 + ftin(9, 0);
  counterish(b, TX, TZ);
  b.station({
    id: 'baggage-tags', name: 'Tag desk', room: r.id,
    box: {
      x0: TX - ftin(2, 0), x1: TX + ftin(2, 0), z0: TZ - ftin(2, 0), z1: TZ + ftin(2, 0),
      y0: ftin(2, 0), y1: ftin(4, 0),
    },
    priority: 3,
  });

  /* ---- two route racks in the east block, between the two doors,
         with an aisle a man carrying a suitcase fits down ---- */
  const groups = ['ATLANTA', 'SAVANNAH'];
  for (let i = 0; i < 2; i++) {
    const z = r.z0 + ftin(9, 0) + i * ftin(3, 10);
    shelving(b, {
      x0: ft(34), x1: ft(41), z0: z, z1: z + ftin(1, 8),
      height: ftin(3, 6), shelves: 2,
    });
    sign(b, {
      x: ft(37.5), z: z + ftin(1, 9), y: ftin(4, 4), face: 'north',
      w: ftin(4, 0), h: ftin(0, 7),
      material: M.plate(groups[i], { size: 12 }),
    });
    luggage(b, { x: ft(35) + i * ftin(2, 0), z: z + ftin(0, 10), y: ftin(1, 9), tone: i });
  }

  /* ---- the hold-and-lost-property rack, west block against the north
         wall, clear of the cart lane ---- */
  shelving(b, {
    x0: r.x0 + inch(4), x1: ft(30), z0: r.z1 - ftin(2, 8), z1: r.z1 - ftin(1, 0),
    height: ftin(3, 6), shelves: 2,
  });
  sign(b, {
    x: ft(27), z: r.z1 - inch(3), y: ftin(4, 6), face: 'south',
    w: ftin(4, 0), h: ftin(0, 7),
    material: M.plate('HOLD / L+F', { size: 12 }),
  });
  luggage(b, { x: ft(25.5), z: r.z1 - ftin(2, 0), y: ftin(1, 9), tone: 2 });
  b.station({
    id: 'lost-found', name: 'Lost and found', room: r.id,
    box: {
      x0: r.x0, x1: ft(30), z0: r.z1 - ftin(4, 0), z1: r.z1,
      y0: ftin(1, 0), y1: ftin(4, 6),
    },
    idle: 'A shelf, a ledger, and a box of umbrellas.',
    priority: 3,
  });

  /* ---- parcels, on the one wall in the room with no door in it ---- */
  shelving(b, {
    x0: r.x0 + inch(4), x1: r.x0 + ftin(1, 8), z0: ft(31), z1: ft(37),
    height: ftin(6, 6), shelves: 4,
  });
  sign(b, {
    x: r.x0 + inch(6), z: ft(34), y: ftin(7, 0), face: 'east',
    w: ftin(3, 0), h: ftin(0, 8), material: M.plate('PARCELS', { size: 12 }),
  });

  const v = vending(b, { x: r.x1 - ftin(2, 2), z: r.z0 + ftin(2, 6), face: 'west' });
  b.device({
    id: 'vending-baggage', circuit: 'east-rear', draw: 4.6,
    label: 'Vending machine (baggage room)', duty: [9, 17],
  });
  b.station({
    id: 'vending-baggage', name: 'Vending machine', room: r.id,
    box: { x0: v.x0 - ftin(1, 6), x1: v.x1, z0: v.z0, z1: v.z1, y0: ftin(2, 0), y1: ftin(5, 0) },
  });
  trash(b, { x: r.x0 + ftin(1, 6), z: r.z0 + ftin(1, 6) });
}

/** A plain work top on a steel base, with the tag stock on it. */
function counterish(b, x, z) {
  const M = b.M;
  block(b, {
    x0: x - ftin(1, 9), x1: x + ftin(1, 9), z0: z - ftin(1, 0), z1: z + ftin(1, 0),
    y0: 0, y1: ftin(3, 0), material: M.officeSteel, tag: 'workbench',
  });
  block(b, {
    x0: x - ftin(1, 10), x1: x + ftin(1, 10), z0: z - ftin(1, 1), z1: z + ftin(1, 1),
    y0: ftin(3, 0), y1: ftin(3, 2), material: M.formica, tag: 'top', solid: false,
  });
  papers(b, { x: x - ftin(1, 0), y: ftin(3, 2), z, w: ftin(0, 8), d: ftin(0, 10), h: inch(3) });
  papers(b, { x: x + ftin(0, 4), y: ftin(3, 2), z, w: ftin(1, 0), d: ftin(1, 2), h: inch(2) });
  block(b, {
    x0: x + ftin(1, 2), x1: x + ftin(1, 8), z0: z - inch(4), z1: z + inch(4),
    y0: ftin(3, 2), y1: ftin(3, 8), material: M.chrome, tag: 'stamp', solid: false,
  });
}

/* ============================================================
   DISPATCH FLOOR / OPERATIONS -- the east Rear Hall

   Seventeen feet by thirteen with FIVE ways out of it: the lobby door
   and the rear-porch door in the west wall, the stair-hall opening and
   the employee-entry door in the east wall, and the two openings north
   and south on x = 32. Once every one of those has four feet of floor
   in front of it there is a six-foot block left in the middle of the
   east half and a two-foot strip west of the cart lane, and that is
   the whole room.

   So the room holds the conveyor, the manifest board and one cart, and
   the route staging that a bigger room would have had went out to the
   platform where the bags are actually sorted. A dispatch floor that
   is mostly floor is not a failure of the fit-out: it is what happens
   when a bus company puts its operations in a room the Academy built
   as a cross hall.
   ============================================================ */
function operations(b) {
  const M = b.M;
  const r = room('academy.east.rearhall');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* ---- the conveyor: a run of rollers on a steel frame, north-south
         in the middle of the east half, clear of all five doors ---- */
  const CX = ft(35.2), CW = ftin(2, 0);
  const CZ0 = ft(13.2), CZ1 = ft(17.8);
  block(b, {
    x0: CX, x1: CX + CW, z0: CZ0, z1: CZ1,
    y0: ftin(1, 4), y1: ftin(2, 2), material: M.rubberMat, tag: 'conveyor',
  });
  for (const z of [CZ0 + ftin(0, 10), CZ1 - ftin(0, 10)]) {
    block(b, {
      x0: CX + inch(2), x1: CX + CW - inch(2), z0: z - inch(2), z1: z + inch(2),
      y0: 0, y1: ftin(1, 4), material: M.officeSteel, tag: 'conveyor-leg', solid: false,
    });
  }
  block(b, {
    x0: CX, x1: CX + CW, z0: CZ0 - ftin(0, 10), z1: CZ0,
    y0: ftin(1, 4), y1: ftin(3, 0), material: M.officeSteel, tag: 'conveyor-motor',
  });
  /* TWELVE AND A HALF AMPS, and only while the motor is turning. A
     one-and-a-half horsepower belt drive on a hundred and twenty volts
     is about that, and it is most of what the east wing's way carries.
     Add the coffee maker in the break room and the pair of them are
     nine tenths of an amp over it -- which is the entire trip, and
     nothing about it is written down anywhere as an event. */
  b.device({
    id: 'conveyor', circuit: 'east-rear', draw: 12.5,
    label: 'Baggage conveyor', switched: true,
  });
  b.station({
    id: 'conveyor', name: 'Baggage conveyor', room: r.id,
    box: {
      x0: CX - ftin(1, 6), x1: CX + CW + ftin(1, 0),
      z0: CZ0 - ftin(1, 0), z1: CZ0 + ftin(3, 0),
      y0: ftin(1, 0), y1: ftin(3, 6),
    },
    priority: 3,
  });

  /* ---- one cart, parked in the pocket east of the conveyor ----
     NOT in the two-foot strip west of the cart lane, which looks empty
     on the plan and is in fact the only floor the lobby door and the
     rear-porch door share. A cart there is a cart in a doorway twice
     over. */
  cart(b, { x: ft(39.7), z: ft(15), axis: 'z', w: ftin(1, 8) });
  luggage(b, { x: ft(39.7), z: ft(13.8), y: ftin(1, 2), tone: 1 });

  /* ---- the manifest board, south wall east of the opening ---- */
  block(b, {
    x0: ft(35.5), x1: ft(39.5), z0: r.z0 + inch(3), z1: r.z0 + inch(4.5),
    y0: ftin(3, 0), y1: ftin(5, 6), material: M.paper, tag: 'manifest-board', solid: false,
  });
  b.station({
    id: 'manifest-board', name: 'Manifest board', room: r.id,
    box: {
      x0: ft(35), x1: ft(40), z0: r.z0, z1: r.z0 + ftin(1, 6),
      y0: ftin(2, 6), y1: ftin(6, 0),
    },
    priority: 3,
  });
  sign(b, {
    x: ft(28), z: r.z0 + inch(2), y: ftin(8, 0), face: 'north',
    w: ftin(5, 0), h: ftin(0, 10), material: M.plate('OPERATIONS', { size: 12 }),
  });
}

/* ============================================================
   DRIVER / EMPLOYEE BREAK ROOM -- the Staff room
   ============================================================ */
function breakRoom(b) {
  const M = b.M;
  const r = room('academy.east.staff');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* a table with four chairs, which is the whole point of the room */
  block(b, {
    x0: r.cx - ftin(2, 6), x1: r.cx + ftin(2, 6), z0: r.cz - ftin(1, 6), z1: r.cz + ftin(1, 6),
    y0: ftin(2, 2), y1: ftin(2, 4), material: M.formica, tag: 'table',
  });
  for (const [dx, dz] of [[-ftin(2, 0), 0], [ftin(2, 0), 0], [0, -ftin(2, 2)], [0, ftin(2, 2)]]) {
    const cx = r.cx + dx, cz = r.cz + dz;
    block(b, {
      x0: cx - ftin(0, 9), x1: cx + ftin(0, 9), z0: cz - ftin(0, 9), z1: cz + ftin(0, 9),
      y0: ftin(1, 3), y1: ftin(1, 5), material: M.benchVinyl, tag: 'chair',
    });
  }
  /* the coffee maker on a counter, and a sink beside it */
  block(b, {
    x0: r.x0 + ftin(1, 0), x1: r.x0 + ftin(6, 0), z0: r.z0 + inch(4), z1: r.z0 + ftin(2, 2),
    y0: 0, y1: ftin(3, 0), material: M.counterFront, tag: 'counter',
  });
  block(b, {
    x0: r.x0 + ftin(0, 10), x1: r.x0 + ftin(6, 2), z0: r.z0 + inch(2), z1: r.z0 + ftin(2, 4),
    y0: ftin(3, 0), y1: ftin(3, 2), material: M.formica, tag: 'top', solid: false,
  });
  block(b, {
    x0: r.x0 + ftin(1, 6), x1: r.x0 + ftin(2, 6), z0: r.z0 + ftin(0, 8), z1: r.z0 + ftin(1, 8),
    y0: ftin(3, 2), y1: ftin(4, 4), material: M.officeSteel, tag: 'coffee',
  });
  /* Brewing, not warming: a switched device, because somebody puts a
     pot on and that is the point. Seven and a half amps on the same
     way as the conveyor. */
  b.device({
    id: 'coffee', circuit: 'east-rear', draw: 7.5,
    label: 'Coffee maker', switched: true,
  });
  b.device({ id: 'time-clock', circuit: 'east-rear', draw: 0.2, label: 'Time clock' });
  b.station({
    id: 'coffee', name: 'Coffee maker', room: r.id,
    box: {
      x0: r.x0 + ftin(1, 0), x1: r.x0 + ftin(3, 0), z0: r.z0 + ftin(0, 4), z1: r.z0 + ftin(2, 4),
      y0: ftin(2, 6), y1: ftin(4, 6),
    },
    priority: 3,
  });

  /* the lockers stop short of the doorway into the records room */
  lockers(b, {
    x0: r.x1 - ftin(1, 6), x1: r.x1 - inch(3), z0: r.z0 + ftin(2, 0), z1: r.z0 + ftin(8, 0),
    axis: 'z', face: 'west', doors: 4,
  });
  /* the driver notice board, which is where the paperwork gets left */
  block(b, {
    x0: r.cx - ftin(2, 0), x1: r.cx + ftin(2, 0), z0: r.z1 - inch(3), z1: r.z1 - inch(1),
    y0: ftin(3, 6), y1: ftin(6, 0), material: M.paper, tag: 'notices', solid: false,
  });
  b.station({
    id: 'driver-board', name: 'Driver notice board', room: r.id,
    box: {
      x0: r.cx - ftin(2, 6), x1: r.cx + ftin(2, 6), z0: r.z1 - ftin(1, 6), z1: r.z1,
      y0: ftin(3, 0), y1: ftin(6, 6),
    },
    priority: 3,
  });
  b.station({
    id: 'time-clock', name: 'Time clock', room: r.id,
    box: {
      x0: r.x0 + ftin(7, 0), x1: r.x0 + ftin(8, 6), z0: r.z1 - ftin(1, 0), z1: r.z1,
      y0: ftin(4, 0), y1: ftin(5, 6),
    },
    priority: 4,
  });
  block(b, {
    x0: r.x0 + ftin(7, 2), x1: r.x0 + ftin(8, 4), z0: r.z1 - inch(4), z1: r.z1 - inch(1),
    y0: ftin(4, 2), y1: ftin(5, 4), material: M.officeSteel, tag: 'time-clock', solid: false,
  });
  phone(b, { x: r.x0 + ftin(5, 0), y: ftin(3, 2), z: r.z0 + ftin(1, 4) });
  trash(b, { x: r.x1 - ftin(2, 6), z: r.z1 - ftin(2, 0) });
  bench(b, { x: r.cx, z: r.z1 - ftin(3, 6), axis: 'x', seats: 3, back: 'far' });
}

/* ============================================================
   THE SMALL SERVICE ROOMS

   Stores, a vestibule and a records room, furnished in one pass because
   a store room is shelving and boxes wherever it is.
   ============================================================ */
function stores(b) {
  const M = b.M;
  for (const [id, kind] of [
    ['academy.west.store', 'supplies'],
    ['academy.east.service', 'ops'],
    ['academy.east.vestibule', 'bare'],
    ['academy.east.council', 'records'],
  ]) {
    const r = room(id);
    b.chunk(r.id);
    standOn(r.y);
    b.detail(2.8);
    if (kind === 'bare') {
      floorMat(b, {
        x0: r.cx - ftin(2, 0), x1: r.cx + ftin(2, 0),
        z0: r.z0 + ftin(0, 6), z1: r.z0 + ftin(3, 6),
      });
      continue;
    }
    /* SHELVING GOES ON WHATEVER WALL IS LEFT.

       A run down each long wall is the obvious answer and it is wrong
       in at least one of these rooms: the supply room is twelve feet by
       ten with a doorway in the middle of BOTH long walls and a third
       in the north wall, so both long runs come back empty once the
       doorways have taken their four feet. The only wall it has is the
       south one. So the long walls are tried first, and if nothing
       survives, the end walls are -- which is how a store room in a
       building full of doors ends up with its shelving where it does. */
    const long = [
      { x0: r.x0 + inch(4), x1: r.x0 + ftin(1, 8), z0: r.z0 + ftin(1, 0), z1: r.z1 - ftin(1, 0) },
      { x0: r.x1 - ftin(1, 8), x1: r.x1 - inch(4), z0: r.z0 + ftin(1, 0), z1: r.z1 - ftin(1, 0) },
    ];
    const ends = [
      { x0: r.x0 + ftin(1, 0), x1: r.x1 - ftin(1, 0), z0: r.z0 + inch(4), z1: r.z0 + ftin(1, 8) },
      { x0: r.x0 + ftin(1, 0), x1: r.x1 - ftin(1, 0), z0: r.z1 - ftin(1, 8), z1: r.z1 - inch(4) },
    ];
    let runs = long.flatMap((w) => wallRuns(b, w));
    if (!runs.length) runs = ends.flatMap((w) => wallRuns(b, w));
    for (const run of runs) {
      shelving(b, { ...run, height: ftin(6, 6), shelves: 4 });
    }

    /* Boxes and binders on the runs that exist, and nowhere else. */
    for (let i = 0; i < 5; i++) {
      const alongZ = r.z1 - r.z0 > r.x1 - r.x0;
      const a = (alongZ ? r.z0 : r.x0) + ftin(2, 0) + i * ftin(2, 6);
      for (const [x, z, y] of [
        [r.x0 + ftin(1, 0), a, ftin(1, 8)],
        [r.x1 - ftin(1, 0), a, ftin(3, 3)],
        [a, r.z0 + ftin(1, 0), ftin(1, 8)],
        [a, r.z1 - ftin(1, 0), ftin(3, 3)],
      ]) {
        if (!inRuns(runs, x, z)) continue;
        papers(b, {
          x, y, z, w: ftin(1, 2), d: ftin(1, 6), h: ftin(0, 10),
          material: i % 2 ? M.deskOak : M.paper,
        });
      }
    }

    if (kind === 'records') {
      b.station({
        id: 'records', name: 'Records shelving', room: r.id,
        box: shelfStation(runs),
        idle: 'Company records, by year. Mostly waybills.',
      });
    }
    if (kind === 'supplies') {
      b.station({
        id: 'supplies', name: 'Supply shelving', room: r.id,
        box: shelfStation(runs),
        idle: 'Ticket stock, tag books, register tape, a carton of forms.',
      });
    }
  }
}

/**
 * Where you stand to use a run of store-room shelving.
 *
 * The obvious box -- the whole wall, floor to head height -- is a box
 * the player stands INSIDE, and an interactable you are inside beats
 * the doorway you are walking through, which is how a store room ends
 * up with a door nobody can open. So the box is the LONGEST PIECE of
 * the shelving and two feet of floor in front of it, which is also
 * where the shelf somebody wants actually is.
 */
function shelfStation(runs) {
  const span = (c) => Math.max(c.x1 - c.x0, c.z1 - c.z0);
  const best = runs.reduce((a, c) => (span(c) > span(a) ? c : a));
  const alongX = (best.x1 - best.x0) >= (best.z1 - best.z0);
  const reach = ftin(2, 0);
  return {
    x0: best.x0 - (alongX ? 0 : reach), x1: best.x1 + (alongX ? 0 : reach),
    z0: best.z0 - (alongX ? reach : 0), z1: best.z1 + (alongX ? reach : 0),
    y0: ftin(1, 0), y1: ftin(5, 0),
  };
}

/* ============================================================
   THE TWO CIRCULATION ROUTES TO THE PLATFORM
   ============================================================ */
function corridors(b) {
  const M = b.M;
  const west = room('academy.west.rearhall');
  b.chunk(west.id);
  standOn(west.y);
  b.detail(2.6);
  sign(b, {
    x: west.cx, z: west.z0 + inch(2), y: ftin(8, 0), face: 'north',
    w: ftin(5, 6), h: ftin(1, 0),
    material: M.plate('GATES 1 - 4  →', { size: 14 }),
  });
  sign(b, {
    x: west.x0 + inch(2), z: west.cz, y: ftin(7, 0), face: 'east',
    w: ftin(4, 0), h: ftin(0, 10),
    material: M.plate('PLATFORM', { size: 13 }),
  });
  /* The hall is a crossroads -- six ways out of it -- so the bench goes
     in the one pocket of floor that is not on a line between two of
     them: west of the arch, facing the platform sign. */
  bench(b, { x: ft(-35), z: west.cz, axis: 'z', seats: 3, back: 'far' });
  /* The bin goes on the WEST side of the hall. The east wall has the
     lobby door and the porch door in it, thirty inches apart on the
     plan and both used every departure, so the whole strip in front of
     it is traffic -- and the four-foot pocket either side of the
     restroom door and the stair arch is traffic too. The middle of the
     west half is the one place in a six-way crossroads that is not on
     a line between two of the ways. */
  trash(b, { x: ft(-37.3), z: west.cz });

  const entry = room('academy.east.entry');
  b.chunk(entry.id);
  standOn(entry.y);
  b.detail(2.8);
  floorMat(b, {
    x0: entry.x1 - ftin(4, 6), x1: entry.x1 - ftin(0, 6),
    z0: entry.cz - ftin(1, 8), z1: entry.cz + ftin(1, 8),
  });
  sign(b, {
    x: entry.cx, z: entry.z0 + inch(2), y: ftin(7, 6), face: 'north',
    w: ftin(4, 6), h: ftin(0, 10),
    material: M.plate('EMPLOYEES ONLY', { size: 11 }),
  });
  /* Nothing on the floor in here. The room is four and a half feet deep
     with an outside door at one end, an inside door at the other and
     both of them on the same line: a bin in it is a bin somebody kicks
     over carrying a mail sack. The mat is the whole fit-out. */
}

export function buildStaff(b) {
  clerkOffice(b);
  offices(b);
  baggageRoom(b);
  operations(b);
  breakRoom(b);
  stores(b);
  corridors(b);
  void ft; void D;
}
