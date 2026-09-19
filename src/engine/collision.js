/* ============================================================
   collision.js -- the one system that could not be carried over.

   Final Rental's collider was two-dimensional: `collide(x, z, r, solids)`
   pushed a circle out of a list of XZ rectangles and returned a new x and
   z. That is exactly right for a single-floor video store where the
   floor is at y = 0 everywhere and the only vertical question is how tall
   the shelves look. It cannot express a building with two floors, a
   staircase between them, a landing you can fall off, or a ceiling low
   enough to duck under -- which is all of County Line.

   So this is new, and it is deliberately not a physics engine. There are
   no rigid bodies, no impulses and no solver. There is a capsule-ish
   upright cylinder, a list of boxes it cannot walk through, and a list of
   surfaces it can stand on:

     SOLID    an axis-aligned box that blocks horizontal movement, but
              only over the part of its height the body actually occupies.
              A box whose top is within a step of the body's feet does not
              block at all -- it is stepped onto. That one rule is what
              makes thresholds, curbs and low platforms work without any
              special-casing.

     FLOOR    a flat rectangle at a height. Every solid also offers its own
              top as a floor unless it opts out, so crates and counters are
              stood on for free.

     RAMP     a rectangle that slopes along X or Z. A staircase's collision
              is one ramp; the visible treads and risers are geometry sitting
              on top of it and are not solid. That is how the player walks up
              and down smoothly, can stop halfway, can turn on the flight,
              and never gets a camera jolt per step -- and it is emphatically
              not a trigger that snaps anybody anywhere. Move up the ramp and
              you rise; stop and you stay where you stopped.

     CEILING  a rectangle overhead. Only consulted to refuse a step-up that
              would put the body's head through something, which is what
              stops the player climbing onto a stair's own underside.

   Nothing here knows what a door, a bus or a passenger is. Doors register
   a solid while they are shut and withdraw it while they are open; that is
   the whole of the engine's involvement.
   ============================================================ */

/** Horizontal resolution passes. Three is enough for an inside corner. */
const PASSES = 4;
/** Largest horizontal step taken in one sweep, as a fraction of radius. */
const SUBSTEP = 0.5;
/** Ledges shallower than this are walked down rather than fallen off. */
const SNAP_DOWN = 0.35;

export class CollisionWorld {
  constructor() {
    /** Static geometry, built once with the level. */
    this.solids = [];
    this.floors = [];
    this.ramps = [];
    this.ceilings = [];
    /** Refreshed every frame by whatever owns a moving collider. */
    this.dynamic = [];
    /* Statics and dynamics as one flat array. The queries below run
       several times per frame per body, and a generator that yields from
       two lists is measurably slower than reading one -- which matters,
       because the whole point of this engine is that it runs on a laptop. */
    this.all = [];
    this._staticDirty = true;
  }

  /** Call after the dynamic list changes -- once a frame, not per query. */
  refresh() {
    this.all.length = 0;
    for (let i = 0; i < this.solids.length; i++) this.all.push(this.solids[i]);
    for (let i = 0; i < this.dynamic.length; i++) this.all.push(this.dynamic[i]);
    this._staticDirty = false;
  }

  /* ---------------- authoring ---------------- */

  /**
   * @param b { x0,x1,y0,y1,z0,z1, tag?, walkable?, id? }
   *          `walkable: false` keeps the top out of the floor set -- for a
   *          wall cap or a sloped sill nobody should be able to stand on.
   */
  addSolid(b) { this.solids.push(b); this._staticDirty = true; return b; }

  /** @param f { x0,x1,z0,z1, y, tag? } */
  addFloor(f) { this.floors.push(f); return f; }

  /**
   * @param r { x0,x1,z0,z1, axis:'x'|'z', yLow, yHigh, tag? }
   *          yLow is the height at the x0 (or z0) edge.
   */
  addRamp(r) { this.ramps.push(r); return r; }

  /** @param c { x0,x1,z0,z1, y, tag? } */
  addCeiling(c) { this.ceilings.push(c); return c; }

  /** Everything solid this frame: the level, plus whatever is moving. */
  allSolids() { return this.all; }

  /* ---------------- queries ---------------- */

  /**
   * The height of the highest thing at (x, z) that a body whose feet are
   * at `fromY` could be standing on.
   *
   * "Could be standing on" means its top is no higher than a step above
   * the feet: that is what keeps the player on the ground floor when the
   * first floor slab is directly overhead, and what lets them step onto a
   * curb without jumping.
   *
   * @returns { y, surface } or null when there is nothing underfoot.
   */
  groundAt(x, z, fromY, step = 0.18) {
    const ceil = fromY + step;
    let bestY = -Infinity, best = null;

    for (let i = 0; i < this.floors.length; i++) {
      const f = this.floors[i];
      if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) continue;
      if (f.y > ceil || f.y < bestY) continue;
      bestY = f.y; best = f;
    }
    for (let i = 0; i < this.ramps.length; i++) {
      const r = this.ramps[i];
      if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) continue;
      const y = rampHeight(r, x, z);
      if (y > ceil || y < bestY) continue;
      bestY = y; best = r;
    }
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.walkable === false) continue;
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      if (s.y1 > ceil || s.y1 < bestY) continue;
      bestY = s.y1; best = s;
    }
    return best ? { y: bestY, surface: best } : null;
  }

  /** The lowest ceiling strictly above `fromY` at (x, z), or Infinity. */
  ceilingAt(x, z, fromY) {
    let best = Infinity;
    for (let i = 0; i < this.ceilings.length; i++) {
      const c = this.ceilings[i];
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
      if (c.y > fromY && c.y < best) best = c.y;
    }
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
      if (s.y0 > fromY && s.y0 < best) best = s.y0;
    }
    return best;
  }

  /**
   * Is there room for a body of this radius and height, standing here?
   * Used before a step-up is allowed, and by anything that wants to place
   * an actor without dropping it inside a wall.
   */
  fits(x, y, z, r, height, list) {
    const all = list || this.all;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.y1 <= y + 0.001 || s.y0 >= y + height - 0.001) continue;
      const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1);
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz < r * r - 1e-6) return false;
    }
    return true;
  }

  /**
   * Everything that could matter inside a box. A crude broadphase, but the
   * difference between a path query costing a quarter of a million box
   * tests and costing a few thousand.
   */
  near(x0, z0, x1, z1, pad) {
    const ax0 = Math.min(x0, x1) - pad, ax1 = Math.max(x0, x1) + pad;
    const az0 = Math.min(z0, z1) - pad, az1 = Math.max(z0, z1) + pad;
    const out = [];
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.x1 < ax0 || s.x0 > ax1 || s.z1 < az0 || s.z0 > az1) continue;
      out.push(s);
    }
    return out;
  }

  /**
   * Straight-line walkability, for navigation and line-of-sight tests.
   * Samples rather than sweeps: the step is a quarter of a meter, which is
   * finer than anything a person is asked to squeeze through.
   */
  /**
   * @param opt.throughDoors  treat a shut door as the opening it is.
   *   For the NAVIGATION GRAPH, which is built once, at eight o'clock,
   *   with every door in the building shut. A door is a thing that
   *   opens; a route that refuses to go through one is not a route that
   *   is blocked, it is a building with no interior.
   */
  clearPath(x0, z0, x1, z1, y, r, height, opt) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25);
    let list = this.near(x0, z0, x1, z1, r + 0.5);
    if (opt && opt.throughDoors) list = list.filter((s) => !s.door);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (!this.fits(x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t, r, height, list)) return false;
    }
    return true;
  }

  /**
   * Move a body and tell the caller what happened to it.
   *
   * @param body { x, y, z, r, height, step, grounded, vy }  mutated in place
   * @param dx,dz  the horizontal move it wants, in meters
   * @param dt     seconds, for gravity
   * @returns { blockedX, blockedZ, landed, ground }
   */
  move(body, dx, dz, dt) {
    const r = body.r, step = body.step === undefined ? 0.18 : body.step;

    /* Sweep in pieces no longer than half a radius. Without this a body
       moving fast enough into a thin wall can end up on the far side of it
       before anything has had a chance to push it back. */
    const dist = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(dist / (r * SUBSTEP)));
    let blockedX = false, blockedZ = false;

    for (let i = 0; i < n; i++) {
      const wantX = body.x + dx / n;
      const wantZ = body.z + dz / n;
      const got = this._resolve(wantX, body.y, wantZ, r, body.height, step);
      if (Math.abs(got.x - wantX) > 1e-6) blockedX = true;
      if (Math.abs(got.z - wantZ) > 1e-6) blockedZ = true;
      body.x = got.x; body.z = got.z;
    }

    /* ---- vertical ---- */
    const g = this.groundAt(body.x, body.z, body.y, step);
    let landed = false;
    if (g && g.y >= body.y - 1e-4) {
      // stepping up, or standing on what we are already standing on
      const head = this.ceilingAt(body.x, body.z, g.y);
      if (head - g.y >= body.height - 0.02 || g.y <= body.y + 1e-4) {
        if (!body.grounded) landed = true;
        body.y = g.y;
        body.vy = 0;
        body.grounded = true;
      }
    } else if (g && body.y - g.y <= SNAP_DOWN && body.vy <= 0) {
      // a shallow ledge, or the next tread down: walked off, not fallen off
      body.y = g.y; body.vy = 0;
      if (!body.grounded) landed = true;
      body.grounded = true;
    } else {
      body.vy = (body.vy || 0) - 9.81 * dt;
      body.y += body.vy * dt;
      body.grounded = false;
      const under = this.groundAt(body.x, body.z, body.y, step);
      if (under && body.y <= under.y) {
        body.y = under.y; body.vy = 0; body.grounded = true; landed = true;
      }
    }
    return { blockedX, blockedZ, landed, ground: g ? g.surface : null };
  }

  /**
   * Push a circle out of everything it overlaps.
   *
   * Deepest overlap first, several passes. Resolving in arbitrary order is
   * what makes an inside corner sticky: the wall you are pressed against
   * pushes you into the one beside it, which pushes you back, and the body
   * shivers between them. Taking the worst overlap each pass converges.
   */
  _resolve(x, y, z, r, height, step) {
    const top = y + height, bottom = y + step;
    for (let pass = 0; pass < PASSES; pass++) {
      let worst = null, worstD = 0, wx = 0, wz = 0;
      const all = this.all;
      for (let i = 0; i < all.length; i++) {
        const s = all[i];
        /* Only the part of the box that is actually in the way. A box that
           ends below the feet-plus-a-step line is something to walk onto,
           not something to walk into. */
        if (s.y1 <= bottom || s.y0 >= top) continue;
        const cx = clamp(x, s.x0, s.x1), cz = clamp(z, s.z0, s.z1);
        const dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        const pen = r - d;
        if (pen <= worstD) continue;
        worstD = pen; worst = s;
        if (d > 1e-4) { wx = dx / d; wz = dz / d; }
        else {
          /* Dead center: there is no direction to push along, so pick the
             face it is nearest to leaving by. */
          const px = Math.min(x - s.x0, s.x1 - x), pz = Math.min(z - s.z0, s.z1 - z);
          if (px < pz) { wx = (x - s.x0 < s.x1 - x) ? -1 : 1; wz = 0; }
          else { wx = 0; wz = (z - s.z0 < s.z1 - z) ? -1 : 1; }
        }
      }
      if (!worst) break;
      x += wx * worstD; z += wz * worstD;
    }
    return { x, z };
  }

  /** Ray against every solid. Used by the interaction cast for occlusion. */
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let bestT = maxT, hit = null;
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const s = all[i];
      if (s.noOcclude) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, s);
      if (t >= 0 && t < bestT) { bestT = t; hit = s; }
    }
    return hit ? { t: bestT, solid: hit } : null;
  }
}

/* ---------------- helpers ---------------- */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Height of a ramp at a point inside its footprint. */
export function rampHeight(r, x, z) {
  const t = r.axis === 'x'
    ? (x - r.x0) / Math.max(1e-6, r.x1 - r.x0)
    : (z - r.z0) / Math.max(1e-6, r.z1 - r.z0);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return r.yLow + (r.yHigh - r.yLow) * k;
}

/** Slab test. Returns entry distance, or -1. */
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const axes = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (let i = 0; i < 3; i++) {
    const o = axes[i][0], d = axes[i][1], lo = axes[i][2], hi = axes[i][3];
    if (Math.abs(d) < 1e-8) { if (o < lo || o > hi) return -1; continue; }
    const inv = 1 / d;
    let t1 = (lo - o) * inv, t2 = (hi - o) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Upright cylinder, for people and other round things. */
export function rayCylinder(ox, oy, oz, dx, dy, dz, c) {
  const px = ox - c.x, pz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return -1;
  const b = 2 * (px * dx + pz * dz);
  const cc = px * px + pz * pz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return -1;
  const y = oy + dy * t;
  if (y < c.y0 || y > c.y1) return -1;
  return t;
}
