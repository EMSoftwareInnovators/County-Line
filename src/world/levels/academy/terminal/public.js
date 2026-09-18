/* ============================================================
   public.js -- the front of house: lobby, both waiting rooms, the
   newsstand, customer service, and the restroom.

   WHAT HAD TO BE WORKED AROUND, room by room, because the building was
   here first:

   THE LOBBY has six openings in it -- four side doorways on the room's
   quarter lines, and double doors north and south on the center line --
   plus four columns at eleven feet out and ten and a half back, and a
   chimney breast projecting nine inches into the middle of each long
   wall. That leaves no wall long enough for a ticket counter: the
   stretch between a breast and the nearest doorway is six and a half
   feet. So the counter is an ISLAND, and where it stands is decided by
   the room's three routes rather than by the furniture:

     the CENTER AXIS, front doors to rear doors, six and a half feet
     wide, which is the whole reason the room exists;

     and TWO CROSS ROUTES at twelve and a half feet either side of
     center, one through each pair of side doorways -- south to the two
     waiting rooms, north to the platform and the baggage room.

   The counter sits in the west half between the two cross routes, far
   enough north that the line in front of it does not reach the southern
   one. Seating therefore all goes in the east half: a line of people
   holding suitcases and a row of benches cannot share fourteen feet.
   A bus company would have worked it out the same way, and complained.

   THE WAITING ROOMS are the two front blocks, which are thirty-one and
   thirty-seven feet and have windows on three sides. Seating runs down
   the middle in facing pairs rather than against the walls, because the
   walls have sash windows with sills at two foot nine and a bench in
   front of one is a bench nobody can sit on.
   ============================================================ */
import { ft, ftin, inch } from '../../../../engine/units.js';
import * as D from '../dimensions.js';
import { room } from '../rooms.js';
import {
  bench, board, counter, crt, papers, phone, rack, sign, stanchions,
  standOn, trash, vending, floorMat, block,
} from './props.js';

/* The lobby's fixed obstructions, named so the furniture can keep out of
   their way rather than rediscovering them. */
const COL_X = ftin(11, 0), COL_Z = ftin(10, 6);
const BREAST_HALF = ftin(3, 6);

/* ============================================================
   THE MAIN TERMINAL LOBBY
   ============================================================ */
function lobby(b) {
  const M = b.M;
  const r = room('academy.central');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* ---- the ticket counter ----
     An island in the west half, running east-west, clear of both cross
     routes and of the center axis. Customers stand south of it; the
     clerk works the open aisle to the north, which is also how they
     reach the clerk's office without crossing the line. */
  const CX0 = ft(-19), CX1 = ft(-5);
  const CZ0 = ft(3.5), CZ1 = ft(5.75);
  counter(b, { x0: CX0, x1: CX1, z0: CZ0, z1: CZ1, face: 'south' });

  /* the register, the ticket stock and the printer, on the clerk's side */
  const TOP = ftin(3, 6);
  block(b, {
    x0: ft(-18), x1: ft(-16), z0: CZ1 - inch(10), z1: CZ1 - inch(2),
    y0: TOP, y1: TOP + ftin(0, 9), material: M.officeSteel, tag: 'register',
  });
  papers(b, { x: ft(-14), y: TOP, z: CZ1 - inch(7), w: ftin(0, 10), d: ftin(1, 0), h: inch(3) });
  papers(b, { x: ft(-12.5), y: TOP, z: CZ1 - inch(7), w: ftin(0, 10), d: ftin(1, 0), h: inch(2) });
  block(b, {
    x0: ft(-8), x1: ft(-6.4), z0: CZ1 - inch(12), z1: CZ1 - inch(2),
    y0: TOP, y1: TOP + ftin(0, 7), material: M.officeSteel, tag: 'printer',
  });
  crt(b, { x: ft(-10.5), y: TOP, z: CZ1 - inch(4), face: 'south', w: ftin(1, 1), h: ftin(1, 0) });

  /* ---- the two stations the job actually happens at ---- */
  b.station({
    id: 'ticket-counter', name: 'Ticket counter', room: r.id,
    box: {
      x0: CX0, x1: CX1, z0: CZ0 - ftin(2, 0), z1: CZ1,
      y0: ftin(2, 0), y1: ftin(4, 6),
    },
    idle: 'Nobody waiting.',
    priority: 3,
  });
  b.station({
    id: 'register', name: 'Cash drawer', room: r.id,
    box: {
      x0: ft(-18.4), x1: ft(-15.6), z0: CZ1 - inch(12), z1: CZ1,
      y0: TOP, y1: TOP + ftin(1, 0),
    },
    priority: 4,
  });

  /* ---- what is plugged in at the counter ----
     The level says which way feeds it and how many amps it pulls. It
     does not say what happens when the way goes, because that is the
     same answer for everything in the building and it is written once,
     in game/terminal/electrical.js. */
  b.device({ id: 'register', circuit: 'lobby', draw: 0.5, label: 'Cash register' });
  b.device({ id: 'ticket-printer', circuit: 'lobby', draw: 2.2, label: 'Ticket printer' });
  b.device({ id: 'counter-crt', circuit: 'lobby', draw: 1.2, label: 'Counter terminal' });
  b.device({ id: 'lobby-clock', circuit: 'lobby', draw: 0.1, label: 'Lobby clock' });

  /* stanchions south of the counter, so a waiting line has a shape.
     They stop three feet short of the west wall: the run is a guide, not
     a fence, and the gap is how somebody crossing the room gets past it
     without walking around the whole thing. */
  stanchions(b, { axis: 'x', from: ft(-17), to: ft(-5), z: ft(0.25), posts: 4 });

  /* ---- departures and arrivals, on the north wall east of the doors ---- */
  board(b, {
    x: ft(11), z: D.Z_CENTRAL_N - inch(1), y: ftin(8, 6), face: 'south',
    w: ftin(11, 0), h: ftin(4, 0),
  });
  sign(b, {
    x: ft(11), z: D.Z_CENTRAL_N - inch(1), y: ftin(11, 3), face: 'south',
    w: ftin(7, 0), h: ftin(1, 2), material: M.plate('DEPARTURES', { size: 17 }),
  });

  /* the route clock, high and central, which is what a terminal has
     instead of a decoration */
  block(b, {
    x0: ft(3.6), x1: ft(5.4), z0: D.Z_CENTRAL_N - inch(3), z1: D.Z_CENTRAL_N - inch(1),
    y0: ftin(12, 0), y1: ftin(13, 10), material: M.plate('11 42', { bg: '#d8d3c0', fg: '#1a1a1c', size: 22 }),
    tag: 'clock', solid: false,
  });

  /* ---- the wall schedules, by the front doors ---- */
  for (const [x, text] of [[ft(-8), 'ATLANTA - MACON'], [ft(8), 'SAVANNAH - CHARLESTON']]) {
    sign(b, {
      x, z: D.Z_CENTRAL_S + inch(1), y: ftin(6, 0), face: 'north',
      w: ftin(4, 0), h: ftin(3, 0),
      material: M.plate(text, { bg: '#e2ddc8', fg: '#23242a', size: 11, w: 128, h: 128 }),
    });
  }

  /* ---- two payphones on the east wall, clear of the breast and the
         doorway either side of it ---- */
  for (const z of [ft(-8), ft(-6.4)]) {
    block(b, {
      x0: D.X_BAY_E - inch(10), x1: D.X_BAY_E - inch(1), z0: z - inch(6), z1: z + inch(6),
      y0: ftin(3, 4), y1: ftin(4, 10), material: M.officeSteel, tag: 'payphone',
    });
  }
  sign(b, {
    x: D.X_BAY_E - inch(2), z: ft(-7.2), y: ftin(5, 6), face: 'west',
    w: ftin(2, 0), h: ftin(0, 8), material: M.plate('TELEPHONE', { size: 12 }),
  });
  b.station({
    id: 'payphone', name: 'Pay telephone', room: r.id,
    box: {
      x0: D.X_BAY_E - ftin(2, 0), x1: D.X_BAY_E, z0: ft(-9), z1: ft(-5.6),
      y0: ftin(3, 0), y1: ftin(5, 0),
    },
    idle: 'Out of order. It has been for a while.',
  });

  /* ---- seating: the east half, in facing pairs, clear of the columns,
         of the center axis and of both cross routes. None of it is in
         the west half, because that is where the line stands. ---- */
  for (const z of [ft(-4), ft(4)]) {
    bench(b, { x: ft(11), z, axis: 'x', seats: 4, back: 'near' });
    bench(b, { x: ft(11), z: z - ftin(3, 6), axis: 'x', seats: 4, back: 'far' });
  }

  /* ---- brochure rack, bins, and a mat at each set of double doors ---- */
  /* Clear of the front doors' jambs: the doors are six foot six wide
     and a rack two feet from the jamb is a rack in the way of half the
     people coming through them. */
  rack(b, { x: ft(-7), z: D.Z_CENTRAL_S + ftin(1, 4) });
  trash(b, { x: ft(4), z: D.Z_CENTRAL_S + ftin(1, 6) });
  /* bins in the two north corners, where they are out of all three
     routes and out of the working aisle */
  trash(b, { x: ft(-20), z: ft(15) });
  trash(b, { x: ft(20), z: ft(15) });
  floorMat(b, {
    x0: -D.DBL_W / 2 - inch(4), x1: D.DBL_W / 2 + inch(4),
    z0: D.Z_CENTRAL_S + inch(2), z1: D.Z_CENTRAL_S + ftin(3, 6),
  });
  floorMat(b, {
    x0: -D.DBL_W / 2 - inch(4), x1: D.DBL_W / 2 + inch(4),
    z0: D.Z_CENTRAL_N - ftin(3, 6), z1: D.Z_CENTRAL_N - inch(2),
  });

  /* ---- signage over the four side doorways ----
     The one thing in the lobby that tells a passenger where to go, and
     the reason the room reads as a terminal rather than as a hall. */
  const overDoor = (x, z, face, text) => sign(b, {
    x, z, y: ftin(9, 6), face, w: ftin(4, 6), h: ftin(1, 0),
    material: M.plate(text, { size: 14 }),
  });
  overDoor(D.X_BAY_W + inch(1), -D.CENTRAL_DOOR_Z, 'east', 'WAITING ROOM');
  overDoor(D.X_BAY_W + inch(1), D.CENTRAL_DOOR_Z, 'east', 'GATES  →');
  overDoor(D.X_BAY_E - inch(1), -D.CENTRAL_DOOR_Z, 'west', 'NEWSSTAND');
  overDoor(D.X_BAY_E - inch(1), D.CENTRAL_DOOR_Z, 'west', 'BAGGAGE');

  void COL_X; void COL_Z; void BREAST_HALF;
}

/* ============================================================
   THE DEPARTURE WAITING ROOM -- Indians of the Southeast
   ============================================================ */
function departureWaiting(b) {
  const M = b.M;
  const r = room('academy.indians');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* Four facing pairs down the middle of the room, running east-west, so
     nothing sits in front of a window sill at two foot nine. */
  for (let i = 0; i < 3; i++) {
    const z = r.z0 + ftin(6, 0) + i * ftin(7, 0);
    bench(b, { x: r.cx - ftin(4, 0), z, axis: 'x', seats: 5, back: 'near' });
    bench(b, { x: r.cx - ftin(4, 0), z: z + ftin(3, 6), axis: 'x', seats: 5, back: 'far' });
  }

  /* the gate board, on the wall by the doorway back to the lobby */
  board(b, {
    x: r.x1 - inch(1), z: D.CENTRAL_DOOR_Z - ftin(7, 0), y: ftin(8, 0), face: 'west',
    w: ftin(6, 0), h: ftin(3, 0),
  });
  sign(b, {
    x: r.x1 - inch(1), z: D.CENTRAL_DOOR_Z - ftin(7, 0), y: ftin(10, 2), face: 'west',
    w: ftin(5, 0), h: ftin(1, 0), material: M.plate('NOW BOARDING', { size: 15 }),
  });
  b.station({
    id: 'gate-board', name: 'Boarding board', room: r.id,
    box: {
      x0: r.x1 - ftin(1, 0), x1: r.x1, z0: D.CENTRAL_DOOR_Z - ftin(10, 0),
      z1: D.CENTRAL_DOOR_Z - ftin(4, 0), y0: ftin(6, 0), y1: ftin(11, 0),
    },
  });

  /* one machine, a bin, and a clock */
  const v = vending(b, { x: r.x0 + ftin(2, 2), z: r.z1 - ftin(4, 0), face: 'east' });
  b.device({
    id: 'vending-waiting', circuit: 'west-front', draw: 4.4,
    label: 'Vending machine (waiting room)', duty: [7, 21],
  });
  b.station({
    id: 'vending-waiting', name: 'Vending machine', room: r.id,
    box: { x0: v.x0, x1: v.x1 + ftin(1, 6), z0: v.z0, z1: v.z1, y0: ftin(2, 0), y1: ftin(5, 0) },
  });
  trash(b, { x: r.x0 + ftin(2, 0), z: r.z0 + ftin(2, 6) });
  trash(b, { x: r.x1 - ftin(2, 0), z: r.z1 - ftin(2, 6) });
  block(b, {
    x0: r.cx - ftin(0, 11), x1: r.cx + ftin(0, 11), z0: r.z1 - inch(3), z1: r.z1 - inch(1),
    y0: ftin(10, 0), y1: ftin(11, 10),
    material: M.plate('11 42', { bg: '#d8d3c0', fg: '#1a1a1c', size: 22 }),
    tag: 'clock', solid: false,
  });
}

/* ============================================================
   ARRIVALS / OVERFLOW, AND CUSTOMER SERVICE -- the Americana room

   The brief puts customer service in the small inner Americana section.
   In the plan as built, that inner column IS the newsstand -- it is the
   only room with both a portico door and a door to the lobby, which is
   what a newsstand needs and a refund desk does not. So transfers and
   refunds take the north end of the arrivals room, which is where a
   passenger who has just got off a coach and missed a connection
   actually ends up.
   ============================================================ */
function arrivals(b) {
  const M = b.M;
  const r = room('academy.americana.main');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* looser seating than the departure room: two runs and some singles */
  bench(b, { x: r.cx, z: r.z0 + ftin(7, 0), axis: 'x', seats: 4, back: 'near' });
  bench(b, { x: r.cx, z: r.z0 + ftin(13, 0), axis: 'x', seats: 4, back: 'near' });
  bench(b, { x: r.x0 + ftin(4, 0), z: r.z0 + ftin(20, 0), axis: 'z', seats: 3, back: 'near' });

  /* ---- the customer service desk, north end ---- */
  const CZ = r.z1 - ftin(5, 0);
  counter(b, {
    x0: r.x0 + ftin(2, 0), x1: r.x0 + ftin(10, 0), z0: CZ, z1: CZ + ftin(2, 2),
    face: 'south',
  });
  papers(b, { x: r.x0 + ftin(4, 0), y: ftin(3, 6), z: CZ + ftin(1, 6), w: ftin(1, 0), d: ftin(1, 2), h: inch(4) });
  papers(b, { x: r.x0 + ftin(8, 0), y: ftin(3, 6), z: CZ + ftin(1, 6), w: ftin(1, 0), d: ftin(1, 2), h: inch(2) });
  sign(b, {
    x: r.x0 + ftin(6, 0), z: r.z1 - inch(1), y: ftin(8, 0), face: 'south',
    w: ftin(6, 0), h: ftin(1, 0),
    material: M.plate('TRANSFERS  ·  REFUNDS', { size: 13 }),
  });
  b.station({
    id: 'service-desk', name: 'Customer service', room: r.id,
    box: {
      x0: r.x0 + ftin(2, 0), x1: r.x0 + ftin(10, 0),
      z0: CZ - ftin(2, 0), z1: CZ + ftin(2, 2), y0: ftin(2, 0), y1: ftin(4, 6),
    },
    idle: 'Closed. The window card says to ask at the ticket counter.',
    priority: 3,
  });
  /* the filing the refunds come out of */
  block(b, {
    x0: r.x1 - ftin(2, 2), x1: r.x1 - inch(2), z0: r.z1 - ftin(4, 6), z1: r.z1 - inch(4),
    y0: 0, y1: ftin(4, 4), material: M.officeSteel, tag: 'files',
  });

  sign(b, {
    x: r.x0 + inch(1), z: r.z0 + ftin(6, 0), y: ftin(9, 0), face: 'east',
    w: ftin(4, 6), h: ftin(1, 0), material: M.plate('ARRIVALS', { size: 15 }),
  });
  trash(b, { x: r.x1 - ftin(2, 0), z: r.z0 + ftin(3, 0) });
  rack(b, { x: r.x0 + ftin(2, 6), z: r.z0 + ftin(3, 0) });
}

/* ============================================================
   THE NEWSSTAND AND SNACK COUNTER -- the Gift Shop

   The room with the portico door AND the door to the lobby, which is
   why the company put the newsstand in it: everybody arriving on foot
   walks past it and everybody crossing the lobby can see it.

   It is also thirteen feet wide, thirty-eight feet long, and has FIVE
   openings -- two in each long wall and one at the north end -- so the
   obvious counter, straight across the middle facing the lobby, would
   have stood in the middle of the route from the platform corridor to
   the front doors. So it runs down the WEST wall instead, in the one
   ten-foot stretch of that wall with no doorway in it, facing east
   across the room. A passenger coming in off the portico meets it side
   on, which is how every newsstand in every terminal of the period
   was arranged anyway.
   ============================================================ */
function newsstand(b) {
  const M = b.M;
  const r = room('academy.giftshop');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.4);

  /* ---- the counter, west wall, between the two doorways in it ---- */
  const CX = r.x0 + ftin(1, 0);
  const CZ0 = ft(-22), CZ1 = ft(-15);
  counter(b, { x0: CX, x1: CX + ftin(2, 2), z0: CZ0, z1: CZ1, face: 'east' });

  /* register, coffee urns, and a stack of the Augusta Chronicle */
  const TOP = ftin(3, 4);
  block(b, {
    x0: CX + inch(4), x1: CX + ftin(1, 4), z0: ft(-18.6), z1: ft(-17.4),
    y0: TOP + inch(2), y1: TOP + ftin(0, 10), material: M.officeSteel, tag: 'register',
  });
  for (const dz of [ftin(-3, 6), ftin(-2, 6)]) {
    block(b, {
      x0: CX + inch(5), x1: CX + ftin(1, 3), z0: ft(-18.6) + dz, z1: ft(-18.6) + dz + ftin(0, 10),
      y0: TOP + inch(2), y1: TOP + ftin(1, 8), material: M.chrome, tag: 'urn',
    });
  }
  papers(b, {
    x: CX + ftin(1, 6), y: TOP + inch(2), z: ft(-16),
    w: ftin(1, 8), d: ftin(1, 4), h: inch(4),
  });
  b.station({
    id: 'newsstand', name: 'Newsstand counter', room: r.id,
    box: {
      x0: CX, x1: CX + ftin(4, 4), z0: CZ0, z1: CZ1,
      y0: ftin(2, 0), y1: ftin(4, 6),
    },
    idle: 'The shutter comes down at eleven.',
    priority: 3,
  });

  /* ---- shelving of packaged food behind the counter's north end, on
         the north wall, stopping well short of the opening at x = 32
         that the whole east side of the building walks through ---- */
  block(b, {
    x0: r.x0 + ftin(1, 6), x1: ft(30), z0: r.z1 - ftin(1, 8), z1: r.z1 - inch(3),
    y0: 0, y1: ftin(6, 0), material: M.officeSteel, tag: 'shelving',
  });
  for (let i = 1; i < 4; i++) {
    const y = ftin(1, 6) * i;
    block(b, {
      x0: r.x0 + ftin(1, 4), x1: ft(30) - inch(2), z0: r.z1 - ftin(1, 10), z1: r.z1 - ftin(1, 8),
      y0: y, y1: y + inch(1), material: M.chrome, tag: 'shelf', solid: false,
    });
  }
  sign(b, {
    x: ft(27), z: r.z1 - inch(4), y: ftin(8, 0), face: 'south',
    w: ftin(6, 6), h: ftin(1, 2), material: M.plate('NEWS  ·  TOBACCO  ·  COFFEE', { size: 12 }),
  });

  /* ---- magazines along the east wall, in the same stretch as the
         counter so the two of them make an aisle ---- */
  for (let i = 0; i < 3; i++) {
    rack(b, { x: r.x1 - ftin(1, 6), z: ft(-22) + i * ftin(3, 6) });
  }

  const v = vending(b, { x: r.x1 - ftin(2, 2), z: r.z0 + ftin(2, 0), face: 'west' });
  b.device({
    id: 'vending-lobby', circuit: 'east-front', draw: 4.4,
    label: 'Vending machine (newsstand)', duty: [7, 23],
  });
  b.station({
    id: 'vending-lobby', name: 'Vending machine', room: r.id,
    box: { x0: v.x0 - ftin(1, 6), x1: v.x1, z0: v.z0, z1: v.z1, y0: ftin(2, 0), y1: ftin(5, 0) },
  });
  trash(b, { x: r.x0 + ftin(2, 0), z: r.z0 + ftin(2, 6) });
  floorMat(b, {
    x0: r.x0 + ftin(1, 0), x1: r.x0 + ftin(5, 0),
    z0: r.z0 + ftin(0, 4), z1: r.z0 + ftin(3, 8),
  });
}

/* ============================================================
   THE PUBLIC RESTROOM

   Enough fixtures that the room works and reads. Nothing here is a set
   piece and nothing in it is going to happen.
   ============================================================ */
function restroom(b) {
  const M = b.M;
  const r = room('academy.west.restroom');
  b.chunk(r.id);
  standOn(r.y);
  b.detail(2.6);

  /* The room is twelve foot seven by four foot six, which is a corridor
     with plumbing in it -- and the door is in the short east wall, so
     the fixtures cannot face each other: two of anything across four
     and a half feet leaves sixteen inches to walk down. So the pans
     take the WEST half of the south wall and the basins take the EAST
     half of the north wall, and the walk between them zig-zags. */
  for (let i = 0; i < 2; i++) {
    const x = r.x0 + ftin(8, 0) + i * ftin(3, 0);
    block(b, {
      x0: x - ftin(0, 8), x1: x + ftin(0, 8), z0: r.z1 - ftin(1, 2), z1: r.z1 - inch(2),
      y0: ftin(2, 2), y1: ftin(2, 9), material: M.fixtureEnamel, tag: 'basin',
    });
    block(b, {
      x0: x - inch(1), x1: x + inch(1), z0: r.z1 - inch(4), z1: r.z1 - inch(2),
      y0: ftin(2, 9), y1: ftin(3, 2), material: M.chrome, tag: 'tap', solid: false,
    });
    block(b, {
      x0: x - ftin(0, 9), x1: x + ftin(0, 9), z0: r.z1 - inch(3), z1: r.z1 - inch(1),
      y0: ftin(3, 8), y1: ftin(5, 8), material: M.crtGlass, tag: 'mirror', solid: false,
    });
  }
  for (let i = 0; i < 2; i++) {
    const x = r.x0 + ftin(2, 6) + i * ftin(3, 0);
    block(b, {
      x0: x - ftin(0, 9), x1: x + ftin(0, 9), z0: r.z0 + inch(3), z1: r.z0 + ftin(2, 0),
      y0: 0, y1: ftin(1, 4), material: M.fixtureEnamel, tag: 'wc',
    });
  }
  trash(b, { x: r.x0 + ftin(1, 2), z: r.z0 + ftin(1, 2) });
  sign(b, {
    x: r.cx, z: r.z0 + inch(2), y: ftin(7, 0), face: 'north',
    w: ftin(2, 6), h: ftin(0, 8), material: M.plate('RESTROOM', { size: 12 }),
  });
  b.station({
    id: 'restroom-check', name: 'Restroom', room: r.id,
    /* The basin run, not the whole room. A station box the size of a
       room is a station box you are standing inside, and an
       interactable you are standing inside beats the door you are
       trying to open. */
    box: {
      x0: r.x0 + ftin(6, 0), x1: r.x0 + ftin(11, 6),
      z0: r.z1 - ftin(2, 0), z1: r.z1,
      y0: ftin(3, 0), y1: ftin(5, 0),
    },
    idle: 'Looks all right.',
    priority: 1,
  });
}

export function buildPublic(b) {
  lobby(b);
  departureWaiting(b);
  arrivals(b);
  newsstand(b);
  restroom(b);
  void phone; void ft;
}
