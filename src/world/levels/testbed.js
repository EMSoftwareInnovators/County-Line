/* ============================================================
   testbed.js -- THE TECHNICAL TEST LEVEL. DISPOSABLE.

   This is not a place in County Line and it is not meant to become one.
   It is a rig: a set of spaces chosen because each one puts a different
   part of the engine under load, built out of developer materials so
   that nothing about it invites anybody to polish it.

       HALL        14.7 x 13.6 m, 9 m to the ceiling. The double-height
                   volume: long sightlines, a tall wall, and a gallery
                   running round the back of it at first-floor level.
       STAIR       20 risers at 7 1/2 in on an 11 in tread, hall to
                   gallery. The single most important thing on this map.
       GALLERY     first floor, open to the hall over a railed edge.
       OFFICE      a small upper room off the gallery, behind a door.
       CORRIDOR    2.65 m wide, 13.6 m long. Narrow, for wall-scraping.
       WORKROOM    13.9 x 13.6 m at ordinary ceiling height, with the
                   windows and the props.
       YARD        outside, through the front door, down a step.

   Written as declarations against the level builder, which is the whole
   point: it is about 250 lines for three rooms, two floors and a
   staircase, and the next room costs another fifteen. Final Rental's
   store was one 400-line function that could not be extended without
   being read end to end.

   Everything in here is measured in meters. Where a dimension came from
   a real-world figure it is written with ft()/ftin()/inch() so the number
   in the source is the number on the drawing.
   ============================================================ */
import { ft, ftin, inch, SCALE } from '../../engine/units.js';
import { pointLight, fillLight } from '../lighting.js';
import { F_EMIT } from '../../engine/raster.js';

/* ---- the plan, as center-lines ---- */
const SOUTH = 0, NORTH = 14;             // exterior wall center-lines, z
const WEST = 0, EAST = 32;               // exterior wall center-lines, x
const P1 = 15, P2 = 17.8;                // partitions: hall|corridor|workroom
const EXT = ft(1.25);                    // exterior wall thickness, 15 in
const INT = inch(6);                     // partition thickness

const HALL_H = ft(29.5);                 // 8.99 m -- the very high ceiling
const ROOM_H = ftin(11, 10);             // 3.61 m -- corridor and workroom
const UPPER = SCALE.stairRise * 20;      // 3.81 m -- first floor level
const OFFICE_H = UPPER + ftin(8, 6);     // 6.40 m

const GALLERY_Z = 10.6;                  // where the gallery edge runs
const OFFICE_X = 9.0;                    // partition between gallery and office

const YARD_Z = -12;                      // how far south the yard goes
const GRADE = -0.15;                     // outside ground, a step below the floor

/* Inside faces, for rooms and for anything that has to stop at the
   plaster. */
const hi = { x0: WEST + EXT / 2, x1: P1 - INT / 2, z0: SOUTH + EXT / 2, z1: NORTH - EXT / 2 };
const ci = { x0: P1 + INT / 2, x1: P2 - INT / 2, z0: SOUTH + EXT / 2, z1: NORTH - EXT / 2 };
const wi = { x0: P2 + INT / 2, x1: EAST - EXT / 2, z0: SOUTH + EXT / 2, z1: NORTH - EXT / 2 };

/* FLOORS RUN TO THE WALL CENTER-LINES, not to the inside faces.

   This looks like a detail and is not. A floor that stops at the plaster
   leaves a gap the thickness of the wall under every doorway, and the
   collider -- which asks "what is under my feet", not "which room am I
   in" -- finds nothing there and starts the player falling for the two
   frames it takes to cross a threshold. Overlapping the slabs into the
   walls costs nothing: the part under a wall is never seen. */
const hf = { x0: WEST, x1: P1, z0: SOUTH, z1: NORTH };
const cf = { x0: P1, x1: P2, z0: SOUTH, z1: NORTH };
const wf = { x0: P2, x1: EAST, z0: SOUTH, z1: NORTH };

export const testbed = {
  id: 'testbed',
  name: 'Technical Testbed',

  build(b, M) {
    b.view(10, 55, 130).sky(0xFF17120C);

    /* ============================================================
       LIGHTS FIRST. The mesh builder bakes vertex light as it creates
       vertices, so every fitting a surface should see has to be declared
       before that surface is built.
       ============================================================ */
    /* The hall: a high row of fittings, and a second row of fill at head
       height. A nine-meter ceiling is nine meters away from the floor, and
       an inverse-square falloff from up there leaves the floor at almost
       nothing -- which is atmospheric in a finished game and useless in a
       rig you are trying to measure a staircase in. */
    for (const x of [2.5, 7.5, 12.5]) {
      for (const z of [3.0, 7.5, 12.0]) b.light(pointLight(x, HALL_H - 0.6, z, 16, 0.85));
      for (const z of [2.5, 7.0, 11.5]) b.light(fillLight(x, 2.6, z, 9, 0.2));
    }
    // corridor
    for (const z of [2.0, 5.5, 9.0, 12.5]) b.light(pointLight(16.4, ROOM_H - 0.3, z, 7.5, 0.95));
    // workroom
    for (const x of [21, 25, 29]) {
      for (const z of [3.5, 7.0, 10.5]) b.light(pointLight(x, ROOM_H - 0.3, z, 9, 0.85));
    }
    // gallery and office
    b.light(pointLight(2.5, UPPER + 2.4, 12.2, 8, 0.85));
    b.light(pointLight(6.5, UPPER + 2.4, 12.2, 8, 0.85));
    b.light(pointLight(11.9, OFFICE_H - 0.35, 12.2, 7, 0.95));
    // the lamp over the front door, inside and out
    b.light(pointLight(4.0, 2.6, 1.2, 5, 0.7));
    b.light(pointLight(4.0, 2.4, -1.0, 7, 0.8));

    b.lighting({ ambient: 0.30, sky: 0, max: 1.5 });

    /* ============================================================
       THE HALL -- the very-high-ceiling room
       ============================================================ */
    b.room({ id: 'hall', name: 'Hall', x0: hi.x0, x1: hi.x1, z0: hi.z0, z1: hi.z1, y0: 0, y1: HALL_H });
    b.detail(1.4);
    b.floor({ ...hf, y: 0, material: M.floor, tag: 'hall-floor' });
    b.ceiling({ ...hf, y: HALL_H, material: M.ceiling });

    /* South wall: the front of the building. One door out to the yard,
       two windows at head height and two more up in the tall part, which
       is what makes the volume read as double-height from inside. */
    /* Every opening in one run, at its own position along the wall: two
       windows at head height, two more four meters up where only the
       double-height part of the room can see them, and the front door.
       They cannot share a position -- a wall with two holes in the same
       place is two walls -- so the high ones sit between the low ones. */
    const WIN = ft(4);
    b.wall({
      x0: WEST, z0: SOUTH, x1: P1, z1: SOUTH, y0: 0, y1: HALL_H,
      thickness: EXT, material: M.brick, innerMaterial: M.wall, flip: true,
      openings: [
        { at: 4.0, width: ft(3.5), y0: 0, y1: ftin(7, 0), kind: 'door' },
        { at: 7.0, width: WIN, y0: 0.95, y1: 2.45, kind: 'window' },
        { at: 9.5, width: WIN, y0: 5.0, y1: 7.2, kind: 'window' },
        { at: 11.2, width: WIN, y0: 5.0, y1: 7.2, kind: 'window' },
        { at: 13.0, width: WIN, y0: 0.95, y1: 2.45, kind: 'window' },
      ],
    });

    // west and north: plain exterior walls
    b.wall({ x0: WEST, z0: SOUTH, x1: WEST, z1: NORTH, y0: 0, y1: HALL_H, thickness: EXT, material: M.brick, innerMaterial: M.wall, flip: true });
    b.wall({ x0: WEST, z0: NORTH, x1: P1, z1: NORTH, y0: 0, y1: HALL_H, thickness: EXT, material: M.brick, innerMaterial: M.wall });

    // the partition to the corridor: a set of double doors at ground level
    b.wallWith({
      x0: P1, z0: SOUTH, x1: P1, z1: NORTH, y0: 0, y1: HALL_H,
      thickness: INT, material: M.wall,
      openings: [
        {
          at: 7.0, width: ft(6), y0: 0, y1: SCALE.doorHeight, kind: 'door', facing: 1,
          door: {
            id: 'hall-corridor', name: 'double doors', leaves: 2, swing: -1,
            openText: 'Open the double doors', closeText: 'Close the double doors',
          },
        },
      ],
    });

    // glazing and sills for the hall windows
    for (const [x, y0, y1] of [[7.0, 0.95, 2.45], [13.0, 0.95, 2.45], [9.5, 5.0, 7.2], [11.2, 5.0, 7.2]]) {
      b.window({
        x0: x - ft(2), x1: x + ft(2), z0: SOUTH - EXT / 2, z1: SOUTH + EXT / 2,
        y0, y1, material: M.glass, sillMaterial: M.trim,
      });
    }

    /* ---- the exterior door ---- */
    b.door({
      id: 'front-door', name: 'front door',
      x: 4.0, z: SOUTH, yaw: Math.PI, y: 0,
      width: ft(3.5), height: ftin(7, 0),
      depth: EXT, hinge: 'x0', swing: 1,
      material: M.door, frameMaterial: M.trim,
    });

    /* ---- the staircase ---- */
    const flight = b.stairs({
      x: 5.0, z: GALLERY_Z - SCALE.stairRun * 20, y: 0, yaw: 0,
      steps: 20, width: ftin(4, 7),
      treadMaterial: M.tread, riserMaterial: M.riser, sideMaterial: M.trim,
      stringers: true, guard: 1.0,
    });
    b.mark('stairBottom', { x: 5.0, y: 0, z: flight.top.z - flight.length - 0.8 });
    b.mark('stairTop', { x: flight.top.x, y: flight.top.y, z: flight.top.z + 0.8 });

    /* ---- a couple of things to walk into ---- */
    b.prop({ x0: 1.2, y0: 0, z0: 2.2, x1: 2.4, y1: 0.55, z1: 3.4, material: M.propA, tag: 'crate' });
    b.prop({ x0: 1.2, y0: 0.55, z0: 2.4, x1: 2.1, y1: 1.05, z1: 3.2, material: M.propA, tag: 'crate' });
    // a curb-height plinth, to prove the step-up rule
    b.prop({ x0: 9.0, y0: 0, z0: 2.0, x1: 12.0, y1: inch(6), z1: 5.0, material: M.paving, tag: 'plinth' });

    b.mb.plate(7.4, 2.4, hi.z1 - 0.05, 2.2, 0.55, Math.PI, M.sign('HALL').tex, [0, 0, 128, 32], F_EMIT);

    /* ============================================================
       THE GALLERY and THE OFFICE -- first floor
       ============================================================ */
    b.room({ id: 'gallery', name: 'Gallery', x0: hi.x0, x1: OFFICE_X, z0: GALLERY_Z, z1: hi.z1, y0: UPPER, y1: HALL_H, floor: 1 });
    b.detail(1.1);
    b.floor({
      x0: WEST, x1: P1, z0: GALLERY_Z, z1: NORTH, y: UPPER,
      material: M.boards, soffit: M.ceiling, thickness: 0.22, tag: 'gallery-floor',
    });
    // the underside of that slab is the hall's headroom under the gallery
    b.headroom({ x0: WEST, x1: P1, z0: GALLERY_Z, z1: NORTH, y: UPPER - 0.22 });

    /* The open edge: a railing you can see through, and a barrier that
       stops you walking off it. Two separate things on purpose -- the
       balusters are 35 mm apart and a collider made of them would be a
       comb for the player to catch on. */
    for (const [x0, x1] of [[hi.x0, 4.25], [5.75, OFFICE_X]]) {
      b.railing({ x0, z0: GALLERY_Z, x1, z1: GALLERY_Z, y: UPPER, height: ftin(3, 2), material: M.trim });
      b.barrier({ x0, x1, z0: GALLERY_Z - 0.1, z1: GALLERY_Z + 0.1, y0: UPPER, y1: UPPER + 1.1 });
    }

    b.room({ id: 'office', name: 'Upper Room', x0: OFFICE_X, x1: hi.x1, z0: GALLERY_Z, z1: hi.z1, y0: UPPER, y1: OFFICE_H, floor: 1 });
    b.detail(1.0);
    b.ceiling({ x0: OFFICE_X, x1: hi.x1, z0: GALLERY_Z, z1: hi.z1, y: OFFICE_H, material: M.ceiling });
    // the office's south wall, closing it off from the drop into the hall
    b.wall({
      x0: OFFICE_X, z0: GALLERY_Z, x1: hi.x1, z1: GALLERY_Z, y0: UPPER, y1: OFFICE_H,
      thickness: INT, material: M.wallWarm,
    });
    // and its west wall, with the door off the gallery
    b.wallWith({
      x0: OFFICE_X, z0: GALLERY_Z, x1: OFFICE_X, z1: hi.z1, y0: UPPER, y1: OFFICE_H,
      thickness: INT, material: M.wallWarm,
      openings: [{
        at: 1.6, width: SCALE.doorWidth, y0: UPPER, y1: UPPER + SCALE.doorHeight,
        kind: 'door', facing: 1,
        door: {
          id: 'office-door', name: 'office door', hinge: 'x1', swing: 1,
          locked: false, material: null,
        },
      }],
    });
    b.prop({ x0: 12.6, y0: UPPER, z0: 12.6, x1: 14.4, y1: UPPER + 0.75, z1: 13.4, material: M.propB, tag: 'desk' });
    b.mb.plate(11.9, UPPER + 1.9, GALLERY_Z + 0.09, 1.6, 0.4, 0, M.sign('UPPER ROOM').tex, [0, 0, 128, 32], F_EMIT);

    /* ============================================================
       THE CORRIDOR -- the narrow one
       ============================================================ */
    b.room({ id: 'corridor', name: 'Corridor', x0: ci.x0, x1: ci.x1, z0: ci.z0, z1: ci.z1, y0: 0, y1: ROOM_H });
    b.detail(0.9);
    b.floor({ ...cf, y: 0, material: M.floor, tag: 'corridor-floor' });
    b.ceiling({ ...cf, y: ROOM_H, material: M.ceiling });
    b.wall({ x0: P1, z0: SOUTH, x1: P2, z1: SOUTH, y0: 0, y1: ROOM_H, thickness: EXT, material: M.brick, innerMaterial: M.wall, flip: true });
    b.wall({ x0: P1, z0: NORTH, x1: P2, z1: NORTH, y0: 0, y1: ROOM_H, thickness: EXT, material: M.brick, innerMaterial: M.wall });
    // the partition to the workroom, with a single door in it
    b.wallWith({
      x0: P2, z0: SOUTH, x1: P2, z1: NORTH, y0: 0, y1: ROOM_H,
      thickness: INT, material: M.wall,
      openings: [{
        at: 7.0, width: SCALE.doorWidth, y0: 0, y1: SCALE.doorHeight,
        kind: 'door', facing: 1,
        door: { id: 'workroom-door', name: 'door', hinge: 'x0', swing: 1 },
      }],
    });
    b.mb.plate(16.4, 2.5, ci.z0 + 0.09, 1.8, 0.45, 0, M.sign('CORRIDOR').tex, [0, 0, 128, 32], F_EMIT);

    /* ============================================================
       THE WORKROOM -- the moderately large one
       ============================================================ */
    b.room({ id: 'workroom', name: 'Workroom', x0: wi.x0, x1: wi.x1, z0: wi.z0, z1: wi.z1, y0: 0, y1: ROOM_H });
    b.detail(1.3);
    b.floor({ ...wf, y: 0, material: M.boards, tag: 'workroom-floor' });
    b.ceiling({ ...wf, y: ROOM_H, material: M.ceiling });
    b.wall({
      x0: P2, z0: SOUTH, x1: EAST, z1: SOUTH, y0: 0, y1: ROOM_H,
      thickness: EXT, material: M.brick, innerMaterial: M.wallCool, flip: true,
      openings: [20.5, 24.5, 28.5].map((x) => ({ at: x - P2, width: ft(4), y0: 0.95, y1: 2.45, kind: 'window' })),
    });
    b.wall({ x0: P2, z0: NORTH, x1: EAST, z1: NORTH, y0: 0, y1: ROOM_H, thickness: EXT, material: M.brick, innerMaterial: M.wallCool });
    b.wall({
      x0: EAST, z0: SOUTH, x1: EAST, z1: NORTH, y0: 0, y1: ROOM_H,
      thickness: EXT, material: M.brick, innerMaterial: M.wallCool,
      openings: [4.5, 9.5].map((z) => ({ at: z, width: ft(4), y0: 0.95, y1: 2.45, kind: 'window' })),
    });
    for (const x of [20.5, 24.5, 28.5]) {
      b.window({ x0: x - ft(2), x1: x + ft(2), z0: SOUTH - EXT / 2, z1: SOUTH + EXT / 2, y0: 0.95, y1: 2.45, material: M.glass, sillMaterial: M.trim });
    }
    for (const z of [4.5, 9.5]) {
      b.window({ x0: EAST - EXT / 2, x1: EAST + EXT / 2, z0: z - ft(2), z1: z + ft(2), y0: 0.95, y1: 2.45, material: M.glass, sillMaterial: M.trim });
    }

    // a counter to lean on and a crate to look at
    b.prop({ x0: 24.0, y0: 0, z0: 3.0, x1: 29.5, y1: ftin(3, 0), z1: 3.8, material: M.propB, tag: 'counter' });
    const crate = b.prop({ x0: 20.4, y0: 0, z0: 9.4, x1: 21.6, y1: 0.85, z1: 10.6, material: M.propA, tag: 'test-crate' });
    b.mb.plate(24.9, 2.5, wi.z0 + 0.09, 2.2, 0.55, 0, M.sign('WORKROOM').tex, [0, 0, 128, 32], F_EMIT);

    /* The one generic interactable. It exists to prove that describe() /
       action() / hold work, and for no other reason. */
    b.interactable({
      id: 'test-crate',
      /* Deliberately taller than the crate. A player standing in front of
         something waist-high and looking straight ahead is looking OVER
         it, and a prompt that only appears when you remember to look down
         is a prompt players report as broken. */
      box: { x0: crate.x0 - 0.25, x1: crate.x1 + 0.25, y0: crate.y0, y1: crate.y1 + 0.95, z0: crate.z0 - 0.25, z1: crate.z1 + 0.25 },
      describe: (ctx) => (ctx.level.marks.crateOpen
        ? { text: 'The crate is open', sub: 'nothing in it', action: null, hold: 0 }
        : { text: 'Open the crate', sub: 'hold', action: () => ctx.openTestCrate(), hold: 0.7 }),
    });

    /* ============================================================
       THE LIGHT SWITCH -- inside the hall, by the front door
       ============================================================ */
    b.prop({
      x0: 5.35, y0: 1.15, z0: SOUTH + EXT / 2 - 0.02,
      x1: 5.55, y1: 1.35, z1: SOUTH + EXT / 2 + 0.03,
      material: M.trim, solid: false, tag: 'switch',
    });
    b.interactable({
      id: 'hall-switch',
      priority: 2,
      box: { x0: 5.15, x1: 5.75, y0: 0.95, y1: 1.85, z0: SOUTH + EXT / 2 - 0.3, z1: SOUTH + EXT / 2 + 0.3 },
      describe: (ctx) => ({
        text: ctx.roomLit('hall') ? 'Turn the hall lights off' : 'Turn the hall lights on',
        sub: '',
        action: () => ctx.toggleRoomLights('hall'),
        hold: 0,
      }),
    });

    /* ============================================================
       OUTSIDE

       Built last, and after the lighting model is swapped for a night
       one: almost no ambient, a sky term on up-facing surfaces, and a
       lamp over the door.
       ============================================================ */
    b.lighting({ ambient: 0.07, sky: 0.22, skyDir: [0, 1, 0], max: 1.3 });
    b.room({ id: 'yard', name: 'Yard', x0: WEST, x1: EAST, z0: YARD_Z, z1: SOUTH, y0: GRADE, y1: GRADE + 6, outdoor: true });
    b.detail(2.4);
    /* Right up to the building line, so that stepping out of the front
       door is a 150 mm step DOWN onto the path and never a hole. */
    b.floor({ x0: WEST, x1: EAST, z0: YARD_Z, z1: SOUTH, y: GRADE, material: M.grass, thickness: 0.4, tag: 'yard' });
    // a path from the door, at the same grade
    b.floor({ x0: 3.0, x1: 5.2, z0: YARD_Z + 2, z1: SOUTH, y: GRADE + 0.005, material: M.paving, thickness: 0.2, tag: 'path' });
    // the outside face of the building, so the yard has a building in it
    b.detail(1.8);
    b.wall({ x0: WEST, z0: SOUTH, x1: EAST, z1: SOUTH, y0: GRADE, y1: 0, thickness: EXT, material: M.brick, tag: 'plinth', walkable: false });
    // boundary
    const BW = 0.35;
    b.wall({ x0: WEST, z0: YARD_Z, x1: EAST, z1: YARD_Z, y0: GRADE, y1: GRADE + 1.6, thickness: BW, material: M.brick });
    b.wall({ x0: WEST, z0: YARD_Z, x1: WEST, z1: SOUTH, y0: GRADE, y1: GRADE + 1.6, thickness: BW, material: M.brick });
    b.wall({ x0: EAST, z0: YARD_Z, x1: EAST, z1: SOUTH, y0: GRADE, y1: GRADE + 1.6, thickness: BW, material: M.brick });
    b.prop({ x0: 8.0, y0: GRADE, z0: -4.0, x1: 10.0, y1: GRADE + 0.45, z1: -3.4, material: M.propA, tag: 'bench' });
    b.prop({ x0: 19.0, y0: GRADE, z0: -6.0, x1: 20.2, y1: GRADE + 1.2, z1: -4.8, material: M.paving, tag: 'pillar' });
    // the lamp over the door, drawn full-bright
    b.mb.box(3.75, 2.35, SOUTH - EXT / 2 - 0.22, 4.25, 2.5, SOUTH - EXT / 2 - 0.02,
      { all: { tex: M.lamp.tex, density: M.lamp.density, flags: F_EMIT } });

    /* ============================================================
       WHERE THINGS GO
       ============================================================ */
    b.spawn({ x: 6.5, y: 0, z: 3.2, yaw: 0, pitch: -0.05 });

    b.ambience({ kind: 'fluorescent', x: 7.5, y: HALL_H - 0.5, z: 7.5, maxDist: 16, gain: 0.5, room: 'hall' });
    b.ambience({ kind: 'fluorescent', x: 16.4, y: ROOM_H - 0.3, z: 7.0, maxDist: 8, gain: 0.45, room: 'corridor' });
    b.ambience({ kind: 'air', x: 4.0, y: 1.0, z: -2.0, maxDist: 22, gain: 0.3, cutoff: 500, room: 'yard' });

    /* A navigation graph across both floors. Nothing in Stage 1 needs a
       route from the yard to the office, but proving one exists is the
       point of building the graph now rather than later. */
    const n = [];
    const node = (x, y, z) => { n.push(b.navNode({ x, y, z })); return n.length - 1; };
    const yard = node(4.0, GRADE, -3.0);
    const doorIn = node(4.0, 0, 1.4);
    const hallW = node(3.0, 0, 6.0);
    const hallC = node(7.5, 0, 7.0);
    const hallN = node(8.5, 0, 11.5);
    const stairBot = node(5.0, 0, 4.4);
    const stairTop = node(5.0, UPPER, 11.4);
    const gallery = node(3.0, UPPER, 12.2);
    const office = node(11.9, UPPER, 12.2);
    const corrS = node(16.4, 0, 4.0);
    const corrC = node(16.4, 0, 7.0);
    const corrN = node(16.4, 0, 11.0);
    const workC = node(24.0, 0, 7.0);
    const workE = node(29.0, 0, 10.0);
    const link = (a, c) => b.navEdge(n[a], n[c]);
    link(yard, doorIn); link(doorIn, hallC); link(doorIn, hallW);
    link(hallW, hallN); link(hallC, hallN); link(hallC, stairBot);
    link(stairBot, stairTop); link(stairTop, gallery); link(gallery, office);
    link(hallC, corrC); link(corrS, corrC); link(corrC, corrN);
    link(corrC, workC); link(workC, workE);

    /* A short loop in the clear part of the hall: away from the crates,
       clear of the plinth, and well short of the stair's bottom step. An
       NPC walking a route that crosses a staircase is a different test
       and it is not this stage's. */
    b.mark('patrol', [
      { x: 3.4, y: 0, z: 2.0 },
      { x: 8.0, y: 0, z: 2.0 },
      { x: 8.0, y: 0, z: 4.4 },
    ]);
  },
};
