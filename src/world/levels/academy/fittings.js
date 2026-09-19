/* ============================================================
   fittings.js -- the light fittings the bus company screwed to a
   building that was finished before anyone had electricity.

   The Old Academy opened in 1802. Augusta did not have electric light
   until the 1880s and this building did not get it for a while after
   that, so every fitting in it is an addition, and the additions come
   from four different decades. That is the whole look:

     PENDANT     an enameled shade on a stem, hung low in a tall room.
                 Public spaces. The oldest-looking thing here.
     STRIP       a surface-mounted fluorescent channel with two tubes.
                 1950s onward, and what a bus company actually installs
                 in an office or a baggage room.
     UTILITY     a caged bulb on a porcelain base, screwed to the
                 ceiling. Stores, closets, and the whole upper floor.
     SCONCE      a small bracket with a glass shade, on a wall.
     LANTERN     the exterior version of the same, at a door.
     FLOOD       a wall-pack on a bracket, over a loading bay.

   Every one of them is drawn WITH ITS SUPPLY VISIBLE -- a stem, a
   conduit drop, a surface box -- because the alternative is a fitting
   that looks moulded into the plaster, and a fitting moulded into the
   plaster of an 1802 building is the one detail that would give the
   whole reconstruction away.

   ------------------------------------------------------------
   WHY NONE OF THIS IS EMISSIVE

   The obvious way to make a lamp glass bright is F_EMIT, which ignores
   the baked light entirely. Then a breaker cannot turn it off: the room
   goes dark and eleven glowing discs stay hanging in it. So a lamp glass
   is ordinary geometry carrying two STATED shade values, bright and
   dark, and it goes out with its circuit like everything else in the
   room. See glow() below.
   ------------------------------------------------------------ */
import { ftin, inch } from '../../../engine/units.js';
import { trimBox } from './parts.js';

/** Geometry at a coarse subdivision. A fitting is small and everywhere. */
function coarse(b, fn) {
  const was = b.mb.maxEdge;
  b.mb.maxEdge = 6;
  fn();
  b.mb.maxEdge = was;
}

/**
 * A lit lamp.
 *
 * The shade value is STATED, not sampled. A fitting's own glass is the
 * one surface the light sampler cannot help with, because the lamp is
 * inside it: the distance is zero, the direction is undefined, and a
 * shaded fitting's "is this surface below me" test divides by that zero
 * and comes out with nothing. So the glass is given its two shade terms
 * directly -- full bright with the circuit live, and as dark as the room
 * it hangs in when the breaker is out. See MeshBuilder.shadeFixed.
 */
function glow(b, x0, y0, z0, x1, y1, z1, m, strength = 1.45) {
  b.mb.shadeFixed = { lit: strength, dark: 0.1 };
  coarse(b, () => {
    b.mb.box(x0, y0, z0, x1, y1, z1, { all: { tex: m.tex, density: m.density } });
  });
  b.mb.shadeFixed = null;
}

/**
 * The BODY of a fitting -- the enameled shade, the fluorescent channel,
 * the porcelain base.
 *
 * These were sampled like any other geometry, and that is wrong for the
 * same reason the glass is: the lamp is INSIDE the thing. Every one of
 * these surfaces faces up or sideways, every fitting in this building
 * throws down, so the sampler gave a shade its ambient value and nothing
 * else -- and ambient times a dark metal texture is black. Eleven
 * pendants in the ticket hall rendered as black slabs hanging in the
 * air, which reads as a hole in the ceiling rather than a lamp, and put
 * a measurable dent in the frame on top of it.
 *
 * So a body states its shade as well. Lower than the glass, because it
 * is the outside of a shade and not the lamp, and high enough to read as
 * painted metal with a light under it. It still goes out with its
 * circuit, which is the whole reason none of this is F_EMIT.
 */
function body(b, x0, y0, z0, x1, y1, z1, m, lit = 0.62) {
  b.mb.shadeFixed = { lit, dark: 0.12 };
  trimBox(b, x0, y0, z0, x1, y1, z1, m);
  b.mb.shadeFixed = null;
}

/**
 * An enameled pendant on a stem.
 *
 * @param spec { x, z, ceil, drop, dia }
 */
export function pendant(b, spec) {
  const M = b.M;
  const dia = spec.dia || ftin(1, 4);
  const y = spec.ceil - (spec.drop === undefined ? ftin(4, 0) : spec.drop);
  const hs = inch(1);
  // the canopy at the ceiling, and the stem down from it
  body(b, spec.x - inch(3), spec.ceil - inch(2), spec.z - inch(3),
    spec.x + inch(3), spec.ceil, spec.z + inch(3), M.fixtureMetal, 0.42);
  body(b, spec.x - hs, y + inch(3), spec.z - hs,
    spec.x + hs, spec.ceil - inch(2), spec.z + hs, M.fixtureMetal, 0.42);
  // the shade: two steps, so it reads as a cone at this resolution
  body(b, spec.x - dia * 0.28, y + inch(2), spec.z - dia * 0.28,
    spec.x + dia * 0.28, y + inch(5), spec.z + dia * 0.28, M.fixtureEnamel, 0.58);
  body(b, spec.x - dia / 2, y - inch(1), spec.z - dia / 2,
    spec.x + dia / 2, y + inch(2), spec.z + dia / 2, M.fixtureEnamel, 0.72);
  // and the lamp under it
  glow(b, spec.x - dia * 0.34, y - inch(3), spec.z - dia * 0.34,
    spec.x + dia * 0.34, y - inch(1), spec.z + dia * 0.34, M.lampGlass);
}

/**
 * A surface-mounted twin fluorescent channel.
 *
 * @param spec { x, z, ceil, len, axis: 'x' | 'z' }
 */
export function strip(b, spec) {
  const M = b.M;
  const alongX = spec.axis !== 'z';
  const half = (spec.len || ftin(4, 0)) / 2;
  const y = spec.ceil - (spec.drop === undefined ? inch(3) : spec.drop);
  const w = inch(5);
  const box = (y0, y1, ww, fn) => {
    const x0 = alongX ? spec.x - half : spec.x - ww;
    const x1 = alongX ? spec.x + half : spec.x + ww;
    const z0 = alongX ? spec.z - ww : spec.z - half;
    const z1 = alongX ? spec.z + ww : spec.z + half;
    fn(x0, y0, z0, x1, y1, z1);
  };
  /* THE CHANNEL IS FOUR INCHES DEEP. It is not a column.
   *
   * This drew the channel as one box from the lamp all the way up to
   * the plaster, which is right for the surface-mounted case it was
   * written for -- a three-inch drop -- and absurd for a chain-hung
   * one. The two task lights over the ticket counter hang five and a
   * half feet below a fifteen-foot ceiling, so each of them rendered
   * as a five-and-a-half-foot slab of dark metal hanging in the middle
   * of the room, which is what those two black shapes over the counter
   * were.
   *
   * A fitting is a fitting and the chain is a chain. */
  const drop = spec.ceil - y;
  box(y, y + inch(4), w, (...a) => body(b, ...a, M.fixtureMetal, 0.60));
  if (drop > inch(6)) {
    /* hung on a pair of chains, one near each end, like every
       fluorescent a bus company ever put up in a tall room */
    for (const s of [-1, 1]) {
      const cx = alongX ? spec.x + s * (half - inch(4)) : spec.x;
      const cz = alongX ? spec.z : spec.z + s * (half - inch(4));
      body(b, cx - inch(0.5), y + inch(4), cz - inch(0.5),
        cx + inch(0.5), spec.ceil, cz + inch(0.5), M.conduit, 0.45);
    }
  }
  // the two tubes, just under it
  const t = inch(1.4);
  for (const s of [-1, 1]) {
    const ox = alongX ? 0 : s * inch(2);
    const oz = alongX ? s * inch(2) : 0;
    box(y - t * 2, y, t, (x0, y0, z0, x1, y1, z1) =>
      glow(b, x0 + ox, y0, z0 + oz, x1 + ox, y1, z1 + oz, M.lampGlass, 1.45));
  }
  // a short length of conduit back to the wall, so it reads as retrofit
  trimBox(b, spec.x - inch(1), spec.ceil - inch(2), spec.z - inch(1),
    spec.x + inch(1), spec.ceil, spec.z + inch(1), M.conduit);
}

/**
 * A caged bulb on a porcelain base. Stores, closets, and upstairs.
 *
 * `drop` hangs it on a length of cord instead of flush to the plaster,
 * which is both what a store room actually has and the only way a bulb
 * gets any light onto the floor of a thirteen-foot room.
 */
export function utility(b, spec) {
  const M = b.M;
  const drop = spec.drop || inch(4);
  const y = spec.ceil - drop;
  if (drop > inch(8)) {
    // the rose at the ceiling and the cord down from it
    body(b, spec.x - inch(2), spec.ceil - inch(1.5), spec.z - inch(2),
      spec.x + inch(2), spec.ceil, spec.z + inch(2), M.fixtureEnamel, 0.42);
    trimBox(b, spec.x - inch(0.4), y + inch(4), spec.z - inch(0.4),
      spec.x + inch(0.4), spec.ceil - inch(1.5), spec.z + inch(0.4), M.conduit);
  }
  body(b, spec.x - inch(2.5), y + inch(2), spec.z - inch(2.5),
    spec.x + inch(2.5), y + inch(4), spec.z + inch(2.5), M.fixtureEnamel, 0.55);
  glow(b, spec.x - inch(1.6), y - inch(1), spec.z - inch(1.6),
    spec.x + inch(1.6), y + inch(2), spec.z + inch(1.6), M.lampGlass, 1.25);
  // the cage, as four thin bars
  for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    body(b, spec.x + dx * inch(2.2) - inch(0.4), y - inch(2), spec.z + dz * inch(2.2) - inch(0.4),
      spec.x + dx * inch(2.2) + inch(0.4), y + inch(2), spec.z + dz * inch(2.2) + inch(0.4),
      M.conduit, 0.5);
  }
}

/**
 * A wall bracket with a glass shade.
 *
 * @param spec { x, z, y, face: 'north'|'south'|'east'|'west' }
 */
export function sconce(b, spec) {
  const M = b.M;
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const p = (d0, d1, hw, y0, y1, m, bias) => {
    const a = out * d0, c = out * d1;
    const x0 = alongX ? spec.x - hw : spec.x + Math.min(a, c);
    const x1 = alongX ? spec.x + hw : spec.x + Math.max(a, c);
    const z0 = alongX ? spec.z + Math.min(a, c) : spec.z - hw;
    const z1 = alongX ? spec.z + Math.max(a, c) : spec.z + hw;
    if (bias) glow(b, x0, y0, z0, x1, y1, z1, m, bias);
    else body(b, x0, y0, z0, x1, y1, z1, m, 0.5);
  };
  p(0, inch(2), inch(2.5), spec.y - inch(3), spec.y + inch(3), M.fixtureMetal);       // back plate
  p(inch(2), inch(6), inch(1), spec.y - inch(1), spec.y + inch(1), M.fixtureMetal);   // arm
  p(inch(5), inch(9), inch(2.4), spec.y - inch(2), spec.y + inch(3), M.lampGlass, 1.35);
}

/** The same thing outdoors, at a door. */
export function lantern(b, spec) {
  const M = b.M;
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const p = (d0, d1, hw, y0, y1, m, bias) => {
    const a = out * d0, c = out * d1;
    const x0 = alongX ? spec.x - hw : spec.x + Math.min(a, c);
    const x1 = alongX ? spec.x + hw : spec.x + Math.max(a, c);
    const z0 = alongX ? spec.z + Math.min(a, c) : spec.z - hw;
    const z1 = alongX ? spec.z + Math.max(a, c) : spec.z + hw;
    if (bias) glow(b, x0, y0, z0, x1, y1, z1, m, bias);
    else body(b, x0, y0, z0, x1, y1, z1, m, 0.5);
  };
  p(0, inch(2), inch(3), spec.y + inch(6), spec.y + inch(11), M.fixtureMetal);        // bracket
  p(inch(2), inch(7), inch(1), spec.y + inch(8), spec.y + inch(10), M.fixtureMetal);
  p(inch(3), inch(10), inch(3.5), spec.y - inch(6), spec.y + inch(8), M.lampGlass, 1.25);
  p(inch(2), inch(11), inch(4), spec.y + inch(8), spec.y + inch(10), M.fixtureMetal); // cap
}

/** A wall-pack flood on a bracket, over a bay or a service door. */
export function flood(b, spec) {
  const M = b.M;
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const alongX = spec.face === 'north' || spec.face === 'south';
  const p = (d0, d1, hw, y0, y1, m, bias) => {
    const a = out * d0, c = out * d1;
    const x0 = alongX ? spec.x - hw : spec.x + Math.min(a, c);
    const x1 = alongX ? spec.x + hw : spec.x + Math.max(a, c);
    const z0 = alongX ? spec.z + Math.min(a, c) : spec.z - hw;
    const z1 = alongX ? spec.z + Math.max(a, c) : spec.z + hw;
    if (bias) glow(b, x0, y0, z0, x1, y1, z1, m, bias);
    else body(b, x0, y0, z0, x1, y1, z1, m, 0.5);
  };
  p(0, inch(4), inch(4), spec.y, spec.y + inch(10), M.fixtureMetal);                  // box
  p(inch(3), inch(15), inch(8), spec.y - inch(9), spec.y + inch(2), M.fixtureMetal);  // hood
  p(inch(4), inch(14), inch(7), spec.y - inch(8), spec.y - inch(1), M.lampGlass, 1.25);
  // the conduit up the wall to it
  p(0, inch(2), inch(1), spec.y + inch(10), spec.y + ftin(3, 0), M.conduit);
}

/**
 * A yard light: a steel pole with a shoebox head on a short arm.
 *
 * The one fitting in this file that is not screwed to the building,
 * because a drive aisle a hundred and forty feet from the front door
 * has nothing to screw a light to. Two of them is what a company puts
 * in a yard it reverses coaches around in the dark, and the height is
 * what stops the head being in a driver's mirror.
 *
 * @param spec { x, z, ground, y: the head's height, arm: which way the
 *               head leans off the pole ('east'|'west') }
 */
export function pole(b, spec) {
  const M = b.M;
  const out = spec.arm === 'west' ? -1 : 1;
  const r = inch(3);
  /* the pole, and a concrete base you would trip over if you tried */
  trimBox(b, spec.x - r, spec.ground, spec.z - r, spec.x + r, spec.y, spec.z + r,
    M.fixtureMetal);
  trimBox(b, spec.x - inch(8), spec.ground, spec.z - inch(8),
    spec.x + inch(8), spec.ground + inch(10), spec.z + inch(8), M.apron);
  /* the arm out to the head */
  trimBox(b, spec.x + Math.min(0, out * ftin(2, 6)), spec.y - inch(3), spec.z - inch(2),
    spec.x + Math.max(0, out * ftin(2, 6)), spec.y + inch(1), spec.z + inch(2),
    M.fixtureMetal);
  /* and the head: a shallow aluminum box with a lens under it */
  const hx = spec.x + out * ftin(2, 2);
  body(b, hx - ftin(1, 2), spec.y - inch(5), spec.z - ftin(0, 10),
    hx + ftin(1, 2), spec.y, spec.z + ftin(0, 10), M.fixtureMetal, 0.5);
  glow(b, hx - ftin(1, 0), spec.y - inch(6), spec.z - ftin(0, 8),
    hx + ftin(1, 0), spec.y - inch(5), spec.z + ftin(0, 8), M.lampGlass, 1.35);
}

/**
 * A bulkhead under a canopy: an enamelled reflector and a lamp in it,
 * bolted up to the soffit rather than to anything historic.
 */
export function bulkhead(b, spec) {
  const M = b.M;
  const w = spec.w || ftin(1, 2);
  body(b, spec.x - w, spec.y - inch(2), spec.z - w,
    spec.x + w, spec.y, spec.z + w, M.fixtureEnamel, 0.6);
  glow(b, spec.x - w + inch(2), spec.y - inch(6), spec.z - w + inch(2),
    spec.x + w - inch(2), spec.y - inch(2), spec.z + w - inch(2), M.lampGlass, 1.3);
}

/**
 * Surface conduit, which is most of what makes the retrofit legible.
 * Runs along a wall at a height, in a straight line, with a box at each
 * end. `axis` is which way it runs.
 */
export function conduitRun(b, spec) {
  const M = b.M;
  const r = inch(0.9);
  const alongX = spec.axis !== 'z';
  const x0 = alongX ? Math.min(spec.from, spec.to) : spec.x - r;
  const x1 = alongX ? Math.max(spec.from, spec.to) : spec.x + r;
  const z0 = alongX ? spec.z - r : Math.min(spec.from, spec.to);
  const z1 = alongX ? spec.z + r : Math.max(spec.from, spec.to);
  trimBox(b, x0, spec.y - r, z0, x1, spec.y + r, z1, M.conduit);
}

/** A painted steel box screwed to the plaster: a switch, a junction. */
export function surfaceBox(b, spec) {
  const M = b.M;
  const d = spec.depth || inch(2);
  const w = spec.w || inch(4), h = spec.h || inch(5);
  const alongX = spec.face === 'north' || spec.face === 'south';
  const out = (spec.face === 'south' || spec.face === 'west') ? -1 : 1;
  const a = out * d;
  const x0 = alongX ? spec.x - w / 2 : spec.x + Math.min(0, a);
  const x1 = alongX ? spec.x + w / 2 : spec.x + Math.max(0, a);
  const z0 = alongX ? spec.z + Math.min(0, a) : spec.z - w / 2;
  const z1 = alongX ? spec.z + Math.max(0, a) : spec.z + w / 2;
  trimBox(b, x0, spec.y - h / 2, z0, x1, spec.y + h / 2, z1, spec.material || M.conduit);
}

export const FITTINGS = { pendant, strip, utility, sconce, lantern, flood, pole, bulkhead };
