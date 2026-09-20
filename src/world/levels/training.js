/* ============================================================
   training.js -- THE TRAINING ROOM. The level before the level.

   ------------------------------------------------------------
   WHY THIS IS A SEPARATE PLACE

   Richmond Central is twenty-seven rooms, fifty-two stations, twelve
   circuits and a five-hour shift, and there is no honest way to learn
   it while it is running. The first attempt at teaching it was a
   supervisor who walked the player round the real building before the
   doors opened, and the trouble with that is the trouble with any
   tutorial held inside the thing it is teaching: the room is full of
   everything else. A player being shown the ticket counter can see the
   baggage room, the departure board, four doorways and a staircase, and
   a coach is due in forty minutes whether they have understood the
   drawer or not.

   So the job is taught somewhere with nothing else in it. The company
   keeps a training room at the Augusta garage -- a mock ticket office
   with a counter, a scale, a board and a clock, used for exactly this.
   It is one room. Every single thing in it is something the player will
   do tonight, and there is nothing in it that is not.

   THEN THE REAL SHIFT STARTS. Punching out on the clock by the door
   ends the level and loads Richmond Central. See campaign.js.
   ------------------------------------------------------------

   WHAT IS TAUGHT HERE, in the order the room is walked:

     LOOKING AND WALKING        getting to the counter
     THE USE KEY                reading the fare card off the wall
     HOLDING THE USE KEY        the light switch, which is a held action
     THE DIALOGUE BOX           a trainee passenger at the window
     THE REGISTER               taking money and counting change
     THE PRINTER                a ticket off the roll
     HANDING IT OVER            finishing a sale
     THE SCALE AND THE TAGS     checking a bag
     THE BOARD                  putting a departure up
     THE CLOCK                  punching out, which ends it

   The geometry is deliberately plain. It is a company back room with a
   linoleum floor and painted block walls, and it is not meant to be
   looked at -- if a player is admiring the training room, the training
   room has failed.
   ============================================================ */
import { ft, ftin, inch, SCALE } from '../../engine/units.js';
import { pointLight, fillLight } from '../lighting.js';

/* ---- the plan, in feet, as wall center-lines ---- */
const W = 0, E = ft(34);
const S = 0, N = ft(23);
const EXT = inch(10);
const H = ftin(10, 6);               // a low, ordinary ceiling
const GRADE = -ftin(0, 7);           // the step down to the yard outside

/* inside faces */
const i0 = { x0: W + EXT / 2, x1: E - EXT / 2, z0: S + EXT / 2, z1: N - EXT / 2 };
const f0 = { x0: W, x1: E, z0: S, z1: N };

/* where the furniture goes */
const CX0 = ft(6), CX1 = ft(20);     // the mock counter, along the north wall
const CZ0 = ft(15), CZ1 = ft(17);
const TOP = ftin(3, 6);              // counter height

export const training = {
  id: 'training',
  name: 'Training Room',

  build(b, M) {
    b.view(ft(30), ft(120), ft(300)).sky(0xFF1A1714);

    /* ---- light before geometry, as everywhere ---- */
    for (const x of [ft(8), ft(17), ft(26)]) {
      b.light(pointLight(x, H - inch(8), ft(11), ft(26), 0.95));
      b.light(fillLight(x, ftin(2, 6), ft(11), ft(14), 0.30));
    }
    /* one over the counter, because that is where the work is */
    b.light(pointLight(ft(13), ftin(8, 0), ft(13), ft(18), 0.55));
    b.lighting({ ambient: 0.34, sky: 0, max: 1.5 });

    b.room({
      id: 'training.room', name: 'Training Room',
      x0: i0.x0, x1: i0.x1, z0: i0.z0, z1: i0.z1, y0: 0, y1: H, floor: 1,
    });
    b.detail(1.4);
    b.floor({ ...f0, y: 0, material: M.formica, tag: 'floor' });
    b.ceiling({ ...f0, y: H, material: M.plasterCeiling });

    /* ---- the shell. One door out, two windows, nothing else. ---- */
    b.wallWith({
      x0: W, z0: S, x1: E, z1: S, y0: 0, y1: H,
      thickness: EXT, material: M.stucco, innerMaterial: M.paintWhite, flip: true,
      openings: [
        {
          at: ft(29), width: SCALE.doorWidth, y0: 0, y1: SCALE.doorHeight,
          kind: 'door', facing: -1,
          door: {
            id: 'training-out', name: 'the yard door', hinge: 'x0', swing: 1,
            exterior: true,
            openText: 'Open the yard door', closeText: 'Close the yard door',
          },
        },
        { at: ft(9), width: ft(5), y0: ftin(3, 2), y1: ftin(7, 0), kind: 'window' },
        { at: ft(18), width: ft(5), y0: ftin(3, 2), y1: ftin(7, 0), kind: 'window' },
      ],
    });
    b.wall({ x0: W, z0: S, x1: W, z1: N, y0: 0, y1: H, thickness: EXT, material: M.stucco, innerMaterial: M.paintWhite, flip: true });
    b.wall({ x0: E, z0: S, x1: E, z1: N, y0: 0, y1: H, thickness: EXT, material: M.stucco, innerMaterial: M.paintWhite });
    b.wall({ x0: W, z0: N, x1: E, z1: N, y0: 0, y1: H, thickness: EXT, material: M.stucco, innerMaterial: M.paintWhite });

    /* ---- outside: just enough yard to read as a door to somewhere ---- */
    b.floor({ x0: W - ft(30), x1: E + ft(30), z0: S - ft(26), z1: S, y: GRADE, material: M.asphalt, tag: 'yard' });
    b.room({
      id: 'training.yard', name: 'The yard', outdoor: true,
      x0: W - ft(30), x1: E + ft(30), z0: S - ft(26), z1: S, y0: GRADE, y1: GRADE + ft(12), floor: 1,
    });

    const box = (x0, y0, z0, x1, y1, z1, m, tag) => b.prop({
      x0, y0, z0, x1, y1, z1, material: m, tag: tag || 'fitout',
    });
    /* A flat panel on a wall: a sign, a board, a card. Drawn as a very
       shallow prop that nothing can walk into, which is what a piece of
       card screwed to plaster is. */
    const panel = (x0, y0, z0, x1, y1, z1, m) => b.prop({
      x0, y0, z0, x1, y1, z1, material: m, tag: 'sign', solid: false,
    });

    /* ============================================================
       THE MOCK COUNTER
       ============================================================ */
    box(CX0, 0, CZ0, CX1, TOP, CZ1, M.counterFront, 'counter');
    box(CX0 - inch(2), TOP, CZ0 - inch(2), CX1 + inch(2), TOP + inch(2), CZ1 + inch(2), M.deskOak, 'counter');

    /* the register, and the printer beside it */
    box(ft(8), TOP + inch(2), CZ0 + inch(3), ftin(9, 6), TOP + ftin(0, 11), CZ1 - inch(3), M.officeSteel, 'register');
    box(ft(16), TOP + inch(2), CZ0 + inch(3), ftin(17, 4), TOP + ftin(0, 9), CZ1 - inch(3), M.officeSteel, 'printer');

    b.station({
      id: 'ticket-counter', name: 'The window', room: 'training.room',
      box: { x0: CX0, x1: CX1, z0: CZ0 - ftin(2, 6), z1: CZ0 - inch(2), y0: ftin(3, 8), y1: ftin(5, 10) },
      priority: 2,
    });
    b.station({
      id: 'register', name: 'The register', room: 'training.room',
      box: { x0: ftin(7, 6), x1: ft(10), z0: CZ0, z1: CZ1, y0: TOP, y1: TOP + ft(1) },
      priority: 3,
    });
    b.station({
      id: 'ticket-printer', name: 'The ticket printer', room: 'training.room',
      box: { x0: ftin(15, 6), x1: ftin(17, 10), z0: CZ0, z1: CZ1, y0: TOP, y1: TOP + ft(1) },
      priority: 3,
    });

    /* ---- the fare card, on the wall behind the counter ---- */
    panel(ftin(11, 6), ftin(4, 5), N - EXT / 2 - inch(1), ftin(14, 6), ftin(6, 7), N - EXT / 2,
      M.plate('FARE CARD', { bg: '#e6e0cc', fg: '#20242c', size: 15, w: 128, h: 64 }));
    b.station({
      id: 'fare-card', name: 'The fare card', room: 'training.room',
      box: { x0: ftin(11, 6), x1: ftin(14, 6), z0: N - EXT / 2 - ftin(0, 8), z1: N - EXT / 2, y0: ftin(4, 4), y1: ftin(6, 8) },
      priority: 2,
    });

    /* ============================================================
       THE SCALE AND THE TAG DESK
       ============================================================ */
    box(ft(26), 0, ft(16), ft(30), ftin(0, 8), ft(20), M.metal, 'scale');
    b.station({
      id: 'baggage-scale', name: 'The baggage scale', room: 'training.room',
      box: { x0: ft(26), x1: ft(30), z0: ft(16), z1: ft(20), y0: 0, y1: ftin(3, 6) },
      priority: 2,
    });
    box(ft(26), 0, ft(11), ft(30), TOP, ft(13), M.deskOak, 'tagdesk');
    b.station({
      id: 'baggage-tags', name: 'The tag desk', room: 'training.room',
      box: { x0: ft(26), x1: ft(30), z0: ft(11), z1: ft(13), y0: TOP - inch(4), y1: TOP + ft(1) },
      priority: 2,
    });

    /* ============================================================
       THE BOARD, THE SWITCH AND THE CLOCK
       ============================================================ */
    panel(ftin(3, 6), ftin(4, 7), S + EXT / 2, ftin(8, 6), ftin(7, 5), S + EXT / 2 + inch(1),
      M.plate('DEPARTURES', { bg: '#10141c', fg: '#d8c79a', size: 16, w: 128, h: 64 }));
    b.station({
      id: 'gate-board', name: 'The departure board', room: 'training.room',
      box: { x0: ftin(3, 6), x1: ftin(8, 6), z0: S + EXT / 2, z1: S + EXT / 2 + ftin(0, 8), y0: ftin(4, 6), y1: ftin(7, 6) },
      priority: 2,
    });

    box(ft(31), ftin(3, 6), S + EXT / 2, ftin(31, 8), ftin(4, 4), S + EXT / 2 + inch(3), M.officeSteel, 'switch');
    b.station({
      id: 'room-lights', name: 'The light switch', room: 'training.room',
      box: { x0: ftin(30, 8), x1: ft(32), z0: S + EXT / 2, z1: S + EXT / 2 + ftin(0, 8), y0: ftin(3, 2), y1: ftin(4, 8) },
      priority: 3,
    });

    box(ft(23), ftin(4, 0), S + EXT / 2, ftin(24, 2), ftin(5, 2), S + EXT / 2 + inch(4), M.castIron, 'clock');
    b.station({
      id: 'time-clock', name: 'The time clock', room: 'training.room',
      box: { x0: ftin(22, 8), x1: ftin(24, 6), z0: S + EXT / 2, z1: S + EXT / 2 + ft(1), y0: ftin(3, 8), y1: ftin(5, 6) },
      priority: 3,
    });

    /* Where the trainee passenger stands, and where the player starts. */
    b.mark('training', {
      window: { x: ft(13), z: CZ0 - ftin(2, 9), yaw: 0 },
      wait: { x: ft(13), z: ft(6), yaw: 0 },
      out: { x: ft(29), z: S - ft(8), yaw: Math.PI },
    });

    b.spawn({ x: ft(29), y: 0, z: ft(5), yaw: -0.97 });
  },
};
