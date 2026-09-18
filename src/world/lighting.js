/* ============================================================
   lighting.js -- baked vertex light.

   County Line lights the way Final Rental did and the way the hardware it
   is imitating did: a shade value per vertex, worked out once when the
   level mesh is built, multiplied into the texel at draw time. There is no
   per-pixel lighting, no shadow map and no light buffer, because the
   rasterizer has one scalar per vertex to spend and spending it well is
   the entire art direction.

   What is new is that the lights are DATA. Final Rental had a `LIGHTS`
   array and a `lightAt()` that knew about the store's front window and its
   back room by name, with the storage bulb special-cased inside the
   function. A building with two floors, a courtyard and a night sky cannot
   be written that way, so a level declares its lights and gets a sampler
   built for them.

   A light is:
       { x, y, z, r, i, kind }
     r     meters to full darkness
     i     intensity at the center
     kind  'point'  falls off in all directions (a bare lamp)
           'fill'   the same, but ignores which way the surface faces --
                    for bounce, and for anything meant to lift a whole room
           'down'   a SHADED fitting: it lights what is below it and
                    nothing above. This is the one that makes a tall room
                    read as tall. A bare point light at eleven feet in a
                    sixteen-foot room lights the ceiling above it as
                    brightly as the floor below, and the volume flattens;
                    a pendant with an enameled shade over it does not,
                    and neither does this.
   ============================================================ */

/**
 * Build the function the mesh builder bakes with.
 *
 * @param opts.lights   array of lights (read live, so a level may declare
 *                      them as it goes -- but always before the geometry
 *                      those lights are meant to touch)
 * @param opts.ambient  floor level, everywhere. Never zero indoors: a
 *                      surface no light reaches still has to be legible.
 * @param opts.sky      extra light on up-facing surfaces, for exteriors
 * @param opts.skyDir   where the sky light comes from, default straight up
 * @param opts.max      clamp. Above 1 the texture is blown out, which is
 *                      occasionally what a fluorescent tube wants.
 * @param opts.only     'fixed' bakes ONLY the lights a breaker cannot
 *                      reach -- the moon, a streetlamp, the glow through
 *                      a window -- and skips every switchable fitting.
 *                      This is the second shade term every vertex
 *                      carries: the building with the lights out.
 */
export function makeLightSampler(opts) {
  const lights = opts.lights;
  const ambient = opts.ambient === undefined ? 0.26 : opts.ambient;
  const sky = opts.sky || 0;
  const sd = opts.skyDir || [0, 1, 0];
  const max = opts.max === undefined ? 1.5 : opts.max;
  const fixedOnly = opts.only === 'fixed';

  return function lightAt(x, y, z, nx, ny, nz) {
    let s = ambient;
    const haveN = nx !== undefined;

    if (sky && haveN) {
      const d = nx * sd[0] + ny * sd[1] + nz * sd[2];
      if (d > 0) s += sky * d;
    }

    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (L.off) continue;
      /* A fitting on a circuit is not part of the dark bake. Anything
         with no circuit is weather, or the sky, or a streetlight, and
         stays on whatever the panel says. */
      if (fixedOnly && L.circuit) continue;
      const dx = L.x - x, dy = L.y - y, dz = L.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const r = L.r || 6;
      if (d2 > r * r) continue;
      const d = Math.sqrt(d2) || 1e-4;
      let a = 1 - d / r;
      a *= a;
      /* A shaded fitting throws down. `dy` is the light minus the
         surface, so a surface below the fitting has dy > 0, and dy/d is
         how far below it is. Weighted toward the square, because a shade
         has a lip on it. */
      if (L.kind === 'down') {
        const below = dy / d;
        if (below <= 0) continue;
        a *= below * below * 0.75 + below * 0.25;
      }
      let ndl = 1;
      if (haveN && L.kind !== 'fill') {
        /* Half-lambert rather than straight N dot L. A surface facing away
           from the only fitting in the room should be dim, not black:
           black geometry in a low-resolution frame reads as a hole. */
        ndl = Math.max(0, (dx * nx + dy * ny + dz * nz) / d) * 0.78 + 0.22;
      }
      s += (L.i === undefined ? 1 : L.i) * a * ndl;
    }
    return s > max ? max : s;
  };
}

/** A fitting, with a sensible default reach. */
export const pointLight = (x, y, z, r = 6, i = 1) => ({ x, y, z, r, i, kind: 'point' });
/** Bounce, or a room lifted as a whole. Ignores surface direction. */
export const fillLight = (x, y, z, r = 8, i = 0.4) => ({ x, y, z, r, i, kind: 'fill' });
/** The same two, on a breaker. `circuit` is an id from the panel. */
export const wiredLight = (circuit, x, y, z, r = 6, i = 1) =>
  ({ x, y, z, r, i, kind: 'point', circuit });
export const wiredFill = (circuit, x, y, z, r = 8, i = 0.4) =>
  ({ x, y, z, r, i, kind: 'fill', circuit });
/** A shaded fitting on a breaker: the ordinary case in this building. */
export const wiredDown = (circuit, x, y, z, r = 6, i = 1) =>
  ({ x, y, z, r, i, kind: 'down', circuit });
