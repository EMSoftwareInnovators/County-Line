/* ============================================================
   upstairs.js -- the second floor, barely used.

   THIS MODULE IS DELIBERATELY THIN, and that is the design. The bus
   company took over a building with a whole second story in it and never
   needed the space: what is up here is a training room that gets used
   four times a year, two rooms of company records, a maintenance store,
   and two rooms of furniture nobody has thrown away. Nine rooms, one
   bulb each, and about forty props between them.

   The brief asks for 5-15% of the player's time up here and exactly one
   ordinary errand. Under-furnishing is how you get that: a floor with
   nothing on it is a floor nobody explores, and a floor nobody explores
   stays unfamiliar. Which is the point, for later.
   ============================================================ */
import { ft, ftin, inch } from '../../../../engine/units.js';
import { room } from '../rooms.js';
import {
  block, bench, desk, lockers, papers, shelving, sign, standOn, trash,
} from './props.js';

/** A stack of boxes against a wall, which is what dead storage is. */
function boxes(b, x, z, n, tone) {
  const M = b.M;
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = ftin(1, 8) - i * inch(2);
    const h = ftin(1, 2);
    block(b, {
      x0: x - w / 2, x1: x + w / 2, z0: z - w / 2, z1: z + w / 2,
      y0: y, y1: y + h,
      material: (tone + i) % 2 ? M.deskOak : M.paper, tag: 'boxes',
    });
    y += h;
  }
}

/** Furniture stacked out of the way: chairs on a table, a rolled rug. */
function stacked(b, x, z) {
  const M = b.M;
  block(b, {
    x0: x - ftin(2, 6), x1: x + ftin(2, 6), z0: z - ftin(1, 6), z1: z + ftin(1, 6),
    y0: ftin(2, 2), y1: ftin(2, 4), material: M.formica, tag: 'table',
  });
  for (const [dx, dz] of [[-ftin(1, 2), 0], [ftin(1, 2), 0]]) {
    block(b, {
      x0: x + dx - ftin(0, 9), x1: x + dx + ftin(0, 9),
      z0: z + dz - ftin(0, 9), z1: z + dz + ftin(0, 9),
      y0: ftin(2, 4), y1: ftin(2, 6), material: M.benchVinyl, tag: 'chair',
    });
    block(b, {
      x0: x + dx - ftin(0, 9), x1: x + dx + ftin(0, 9),
      z0: z + dz + inch(5), z1: z + dz + inch(7),
      y0: ftin(2, 6), y1: ftin(3, 9), material: M.benchVinyl, tag: 'chair-back',
      solid: false,
    });
  }
}

export function buildUpstairs(b) {
  const M = b.M;

  /* ---- Rotating Exhibits: overflow storage ---- */
  {
    const r = room('academy.upper.west.rotating');
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    stacked(b, r.x0 + ftin(6, 0), r.z0 + ftin(7, 0));
    stacked(b, r.x0 + ftin(6, 0), r.z0 + ftin(13, 0));
    boxes(b, r.x1 - ftin(3, 0), r.z0 + ftin(4, 0), 3, 0);
    boxes(b, r.x1 - ftin(3, 0), r.z0 + ftin(7, 0), 2, 1);
    for (let i = 0; i < 4; i++) {
      bench(b, {
        x: r.cx + ftin(4, 0), z: r.z0 + ftin(20, 0) + i * ftin(2, 4),
        axis: 'x', seats: 3,
      });
    }
    sign(b, {
      x: r.cx, z: r.z0 + inch(2), y: ftin(6, 6), face: 'north',
      w: ftin(3, 6), h: ftin(0, 8),
      material: M.plate('STORAGE', { size: 12 }),
    });
  }

  /* ---- Augusta-Richmond County History: company records ---- */
  {
    const r = room('academy.upper.west.history');
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    for (let i = 0; i < 4; i++) {
      const z = r.z0 + ftin(4, 0) + i * ftin(8, 0);
      shelving(b, {
        x0: r.x0 + ftin(2, 0), x1: r.x0 + ftin(14, 0), z0: z, z1: z + ftin(1, 8),
        height: ftin(6, 6), shelves: 5,
      });
      for (let j = 0; j < 3; j++) {
        papers(b, {
          x: r.x0 + ftin(4, 0) + j * ftin(4, 0), y: ftin(2, 7), z: z + ftin(0, 10),
          w: ftin(2, 0), d: ftin(1, 4), h: ftin(0, 10),
          material: j % 2 ? M.deskOak : M.paper,
        });
      }
    }
    lockers(b, {
      x0: r.x1 - ftin(1, 6), x1: r.x1 - inch(3), z0: r.z0 + ftin(3, 0), z1: r.z0 + ftin(15, 0),
      axis: 'z', face: 'west', doors: 8, height: ftin(4, 6),
    });
    sign(b, {
      x: r.cx, z: r.z0 + inch(2), y: ftin(6, 6), face: 'north',
      w: ftin(5, 0), h: ftin(0, 8),
      material: M.plate('COMPANY RECORDS', { size: 11 }),
    });
    /* THE UPSTAIRS ERRAND lives here: a carton of blank timetable forms
       on the second shelf, which the clerk is sent for once a shift and
       which is the entire reason the player ever comes up. Nothing
       happens on the way. That is the point. */
    papers(b, {
      x: r.x0 + ftin(8, 0), y: ftin(1, 4), z: r.z0 + ftin(4, 10),
      w: ftin(1, 6), d: ftin(1, 2), h: ftin(1, 0), material: M.paper,
    });
    b.station({
      id: 'forms-carton', name: 'Carton of timetable forms', room: r.id,
      box: {
        x0: r.x0 + ftin(6, 6), x1: r.x0 + ftin(9, 6),
        z0: r.z0 + ftin(4, 0), z1: r.z0 + ftin(5, 8),
        y0: r.y + ftin(0, 6), y1: r.y + ftin(3, 0),
      },
      idle: 'Blank timetable forms. Somebody wrote 1996 on the side.',
      priority: 4,
    });
  }

  /* ---- the upper central room: training and management meetings ---- */
  for (const id of ['academy.upper.center.war', 'academy.upper.center.mammals']) {
    const r = room(id);
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    const west = id.endsWith('war');
    /* One long table down the pair, half in each room -- set SOUTH of
       the center line, not on it. The room is one space with four
       doorways in its two end walls, and the way people cross it is
       from a doorway on one side to a doorway on the other: down the
       middle, and on the diagonal. A twenty-foot table with chairs both
       sides of it, centered, closes both. Pushed south it leaves eight
       feet of open floor between it and the northern doorway line,
       which is also how a room gets used for a meeting and then walked
       through afterwards. */
    const TZ = r.cz - ftin(4, 6);
    block(b, {
      x0: west ? r.x0 + ftin(6, 0) : r.x0, x1: west ? r.x1 : r.x1 - ftin(6, 0),
      z0: TZ - ftin(1, 6), z1: TZ + ftin(1, 6),
      y0: ftin(2, 2), y1: ftin(2, 4), material: M.formica, tag: 'table',
    });
    for (let i = 0; i < 4; i++) {
      const x = (west ? r.x0 + ftin(8, 0) : r.x0 + ftin(2, 0)) + i * ftin(3, 6);
      for (const dz of [-ftin(3, 0), ftin(3, 0)]) {
        block(b, {
          x0: x - ftin(0, 9), x1: x + ftin(0, 9),
          z0: TZ + dz - ftin(0, 9), z1: TZ + dz + ftin(0, 9),
          y0: ftin(1, 3), y1: ftin(1, 5), material: M.benchVinyl, tag: 'chair',
        });
      }
    }
    if (west) {
      block(b, {
        x0: r.x0 + inch(2), x1: r.x0 + inch(4), z0: TZ - ftin(3, 0), z1: TZ + ftin(3, 0),
        y0: ftin(3, 0), y1: ftin(6, 6), material: M.boardBlack, tag: 'chalkboard', solid: false,
      });
      /* Along the south wall rather than in the corner: both doorways
         out of this room are in its west wall, and the floor in front
         of them belongs to them. */
      trash(b, { x: r.x0 + ftin(8, 0), z: r.z0 + ftin(2, 0) });
    } else {
      /* The projector cart and a stack of boxes. Both are kept off the
         east wall: the two doorways in it are on the quarter lines and
         the floor in front of them is the only way out of this room. */
      block(b, {
        x0: r.cx + ftin(3, 0), x1: r.cx + ftin(5, 0),
        z0: r.z0 + ftin(0, 6), z1: r.z0 + ftin(2, 0),
        y0: ftin(2, 0), y1: ftin(2, 8), material: M.officeSteel, tag: 'projector',
      });
      boxes(b, r.x1 - ftin(4, 0), r.cz + ftin(5, 0), 2, 1);
    }
  }

  /* ---- Rocks & Minerals: maintenance and electrical supplies ----
     The other room a clerk is ever sent to, because this is where the
     fluorescent tubes live. */
  {
    const r = room('academy.upper.east.minerals');
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    /* East of the arch, not across it: the opening from the landing is
       on x = 32 and is how the clerk gets in here at all. */
    const SX = ft(35);
    shelving(b, {
      x0: SX, x1: SX + ftin(10, 0), z0: r.z0 + ftin(2, 0), z1: r.z0 + ftin(3, 8),
      height: ftin(6, 6), shelves: 4,
    });
    for (let i = 0; i < 4; i++) {
      papers(b, {
        x: SX + ftin(1, 6) + i * ftin(2, 4), y: ftin(3, 3), z: r.z0 + ftin(2, 10),
        w: ftin(1, 8), d: ftin(0, 8), h: ftin(0, 6), material: M.fixtureEnamel,
      });
    }
    boxes(b, r.x1 - ftin(4, 0), r.z0 + ftin(4, 0), 3, 0);
    block(b, {
      x0: r.x1 - ftin(8, 0), x1: r.x1 - ftin(3, 0), z0: r.z1 - ftin(2, 6), z1: r.z1 - ftin(1, 0),
      y0: 0, y1: ftin(2, 6), material: M.officeSteel, tag: 'workbench',
    });
    sign(b, {
      x: ft(40), z: r.z0 + inch(2), y: ftin(6, 6), face: 'north',
      w: ftin(5, 6), h: ftin(0, 8),
      material: M.plate('MAINTENANCE STORE', { size: 10 }),
    });
    b.station({
      id: 'tube-store', name: 'Fluorescent tubes', room: r.id,
      box: {
        x0: SX, x1: SX + ftin(10, 0),
        z0: r.z0 + ftin(1, 6), z1: r.z0 + ftin(4, 6),
        y0: r.y + ftin(2, 6), y1: r.y + ftin(4, 6),
      },
      idle: 'Four-foot tubes, a box of ballasts, and a broom.',
      priority: 4,
    });
  }

  /* ---- Archives: restricted, and locked, and empty of anything the
         player needs tonight ---- */
  {
    const r = room('academy.upper.east.archives');
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    /* The first run starts six feet in, because the door from the
       maintenance store is in the south wall at x = 32'9". */
    for (let i = 0; i < 3; i++) {
      const z = r.z0 + ftin(6, 0) + i * ftin(6, 0);
      shelving(b, {
        x0: r.x0 + ftin(3, 0), x1: r.x0 + ftin(13, 0), z0: z, z1: z + ftin(1, 8),
        height: ftin(6, 6), shelves: 5,
      });
    }
    desk(b, {
      x0: r.x1 - ftin(6, 0), x1: r.x1 - ftin(1, 0), z0: r.z1 - ftin(4, 0), z1: r.z1 - ftin(1, 6),
    });
    sign(b, {
      x: r.cx, z: r.z0 + inch(2), y: ftin(6, 6), face: 'north',
      w: ftin(5, 0), h: ftin(0, 8),
      material: M.plate('RESTRICTED', { size: 12 }),
    });
  }

  /* ---- Natural History: dead storage. Almost nothing. ---- */
  {
    const r = room('academy.upper.east.natural');
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(3.0);
    boxes(b, r.x0 + ftin(4, 0), r.z0 + ftin(5, 0), 3, 1);
    boxes(b, r.x0 + ftin(4, 0), r.z0 + ftin(8, 0), 2, 0);
    stacked(b, r.cx, r.z0 + ftin(20, 0));
    lockers(b, {
      x0: r.x1 - ftin(1, 6), x1: r.x1 - inch(3), z0: r.z0 + ftin(4, 0), z1: r.z0 + ftin(10, 0),
      axis: 'z', face: 'west', doors: 4,
    });
  }

  /* ---- the two landings: a chair, a bin, and a floor number ---- */
  for (const id of ['academy.upper.west.landing', 'academy.upper.east.landing']) {
    const r = room(id);
    b.chunk(r.id);
    /* Everything in here measures from this floor, not from the lobby. */
    standOn(r.y);
    b.detail(2.8);
    const west = id.includes('west');
    sign(b, {
      x: west ? r.x0 + inch(2) : r.x1 - inch(2), z: r.cz,
      y: ftin(6, 6), face: west ? 'east' : 'west',
      w: ftin(2, 0), h: ftin(0, 8),
      material: M.plate('2ND FLOOR', { size: 11 }),
    });
    trash(b, { x: west ? r.x0 + ftin(1, 8) : r.x1 - ftin(1, 8), z: r.z0 + ftin(1, 8) });
  }
}
