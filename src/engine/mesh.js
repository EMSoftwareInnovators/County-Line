/* ============================================================
   mesh.js -- mesh construction. Front faces wind counter-clockwise
   when seen from outside. Large surfaces are subdivided on purpose.

   WHAT SUBDIVISION IS FOR CHANGED IN STAGE 3. It used to be for two
   things at once: affine texture shear, and the resolution of the baked
   vertex light. The rasterizer now interpolates texture coordinates
   perspective-correctly (see raster.js), so the first reason is gone --
   and what is left is the one that actually sets the numbers. A shade
   value lives at a vertex. A wall with three rows of vertices up it can
   hold three steps of a light falling off toward a sixteen-foot ceiling,
   and no more. If a room is meant to go dark overhead, the wall has to
   be cut finely enough to say so.

   So: FLOORS ARE COARSER THAN THEY WERE AND WALLS ARE FINER. That is not
   a wash; it is the triangles being spent where the light is.

   Carried over from Final Rental with two changes that County Line's
   architecture needs:

   1. SUBDIVISION IS AUTOMATIC. Final Rental asked each caller to pass a
      grid size, which is workable when the biggest surface is a four
      meter store wall and unworkable when it is a twenty meter hall with a
      fourteen foot ceiling. Every quad is chopped to `maxEdge` meters
      unless the caller says otherwise.

   2. `surface()` places a quad from world coordinates and a texel
      density rather than from a uv rectangle, so a wall tiles correctly
      whatever size it is and the level source never does uv arithmetic.
   ============================================================ */
import { F_DOUBLE } from './raster.js';

export class MeshBuilder {
  constructor(textures) {
    this.textures = textures || [];
    this.px = []; this.uv = []; this.sh = [];
    /** The same vertices with every switchable fitting off. See below. */
    this.shDark = [];
    this.idx = []; this.tex = []; this.flg = [];
    /** Override to bake vertex lighting: (x,y,z,nx,ny,nz) -> 0..1+ */
    this.light = null;
    /**
     * THE SAME BUILDING WITH THE LIGHTS OUT.
     *
     * Vertex light is baked once, which is the whole reason it is cheap
     * and the whole reason a switch cannot normally do anything. County
     * Line has a breaker panel in it, so every vertex carries TWO shade
     * values -- one with the fittings on and one with only the ambient
     * and whatever is still burning outside -- and the draw call blends
     * between them per chunk. Turning a circuit off is then a number per
     * room, not a rebake.
     *
     * If this is left null the dark term is the lit one, so a mesh nobody
     * switches costs nothing but four bytes a vertex.
     */
    this.dark = null;
    /**
     * Bypass the samplers entirely for the next few boxes: `{ lit, dark }`
     * shade values used verbatim.
     *
     * THIS EXISTS FOR LAMPS. A light fitting's own glass is the one
     * surface in the building the sampler cannot help with, because the
     * lamp is inside it: the distance is zero, the direction is
     * undefined, and a shaded fitting's "is this below me" test divides
     * by that zero. So a lit lamp is stated rather than computed -- full
     * bright while its circuit is live, and as dark as the room when it
     * is not.
     */
    this.shadeFixed = null;
    this.shadeBias = 1;
    /**
     * Longest edge, in meters, a quad is allowed to have before it is cut
     * up. 1.25 m keeps baked vertex light on a grid fine enough to read a
     * fitting overhead and a falloff up a wall.
     *
     * Raise it for things nobody gets close to and nothing lights
     * unevenly (the far side of a courtyard); lower it for a wall the
     * light has to die on.
     */
    this.maxEdge = 1.25;
  }

  /** Grid a quad needs at the current `maxEdge`, from its actual size. */
  _autoGrid(p0, p1, p2, p3) {
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const w = Math.max(len(p0, p1), len(p3, p2));
    const h = Math.max(len(p0, p3), len(p1, p2));
    const e = Math.max(0.05, this.maxEdge);
    return [Math.max(1, Math.ceil(w / e)), Math.max(1, Math.ceil(h / e)), false];
  }

  slot(texture) {
    let i = this.textures.indexOf(texture);
    if (i < 0) { i = this.textures.length; this.textures.push(texture); }
    return i;
  }

  vert(x, y, z, u, v, nx, ny, nz) {
    const i = this.sh.length;
    this.px.push(x, y, z);
    this.uv.push(u, v);
    if (this.shadeFixed) {
      this.sh.push(this.shadeFixed.lit);
      this.shDark.push(this.shadeFixed.dark);
      return i;
    }
    const lit = this.light ? this.light(x, y, z, nx, ny, nz) * this.shadeBias : this.shadeBias;
    this.sh.push(lit);
    this.shDark.push(this.dark ? this.dark(x, y, z, nx, ny, nz) * this.shadeBias : lit);
    return i;
  }

  tri(a, b, c, slot, flags) {
    this.idx.push(a, b, c);
    this.tex.push(slot); this.flg.push(flags | 0);
  }

  /**
   * Counter-clockwise quad p0->p1->p2->p3 seen from the front.
   *
   * `uv` is a plain canvas rect in texel units: [left, top, right, bottom].
   * Because p0 lands at the viewer's bottom-RIGHT for a front-facing quad
   * (screen +X is world -X once you are looking at the face), the rect is
   * unpacked corner-swapped here so art comes out upright and unmirrored
   * on every wall, box side and sign in the game.
   */
  quad(p0, p1, p2, p3, tex, uv, flags, sub) {
    const slot = typeof tex === 'number' ? tex : this.slot(tex);
    if (!sub) sub = this._autoGrid(p0, p1, p2, p3);
    const u0 = uv[2], v0 = uv[3], u1 = uv[0], v1 = uv[1];
    const n = normalOf(p0, p1, p2);
    const S = Math.max(1, sub ? sub[0] : 1), T = Math.max(1, sub ? sub[1] : 1);
    // bilinear corner interpolation lets one call emit a subdivided grid
    const P = (s, t) => {
      const a0 = 1 - s, a1 = s, b0 = 1 - t, b1 = t;
      return [
        (p0[0] * a0 + p1[0] * a1) * b0 + (p3[0] * a0 + p2[0] * a1) * b1,
        (p0[1] * a0 + p1[1] * a1) * b0 + (p3[1] * a0 + p2[1] * a1) * b1,
        (p0[2] * a0 + p1[2] * a1) * b0 + (p3[2] * a0 + p2[2] * a1) * b1,
      ];
    };
    const grid = [];
    for (let t = 0; t <= T; t++) {
      const row = [];
      for (let s = 0; s <= S; s++) {
        const p = P(s / S, t / T);
        const uu = u0 + (u1 - u0) * (s / S) * (sub && sub[2] ? S : 1);
        const vv = v0 + (v1 - v0) * (t / T) * (sub && sub[2] ? T : 1);
        row.push(this.vert(p[0], p[1], p[2], uu, vv, n[0], n[1], n[2]));
      }
      grid.push(row);
    }
    for (let t = 0; t < T; t++) {
      for (let s = 0; s < S; s++) {
        const a = grid[t][s], b = grid[t][s + 1], c = grid[t + 1][s + 1], d = grid[t + 1][s];
        this.tri(a, b, c, slot, flags);
        this.tri(a, c, d, slot, flags);
      }
    }
  }

  /**
   * Skin a stack of cross-sections into a tapered, faceted solid -- the
   * shape PS1 characters were actually built from. Boxes read as Minecraft;
   * a torso that narrows at the waist and slopes at the shoulders does not.
   *
   * @param rings  [{ y, w, d, ox, oz }] bottom to top; w/d scale `section`
   * @param section [[x,z], ...] unit cross-section, traversed front-left ->
   *                front-right -> around. Side i spans point i to i+1.
   * @param sideTex [{tex, uv}] one entry per side (or a single entry for all)
   * @param caps   { top, bottom } face descriptors, or null to leave open
   */
  loft(rings, section, sideTex, caps) {
    const n = section.length;
    const at = (r, i) => [
      section[i][0] * r.w + (r.ox || 0),
      r.y,
      section[i][1] * r.d + (r.oz || 0),
    ];
    // v runs 0 at the bottom ring to 1 at the top, so a texture spans the
    // whole limb instead of repeating once per segment
    const y0 = rings[0].y, y1 = rings[rings.length - 1].y;
    const span = (y1 - y0) || 1;
    const vAt = (r) => (r.y - y0) / span;

    for (let s = 0; s < rings.length - 1; s++) {
      const A = rings[s], B = rings[s + 1];
      const va = vAt(A), vb = vAt(B);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const f = sideTex.length === 1 ? sideTex[0] : sideTex[i % sideTex.length];
        if (!f) continue;
        const r = f.uv;
        // slice the rect vertically to this segment's share
        const uv = [r[0], r[1] + (r[3] - r[1]) * (1 - vb), r[2], r[1] + (r[3] - r[1]) * (1 - va)];
        this.quad(at(A, i), at(A, j), at(B, j), at(B, i), f.tex, uv, f.flags | 0);
      }
    }
    if (caps && caps.top) this.fan(rings[rings.length - 1], section, caps.top, false);
    if (caps && caps.bottom) this.fan(rings[0], section, caps.bottom, true);
  }

  /** Triangle fan closing off one end of a loft. */
  fan(ring, section, face, flip) {
    const n = section.length;
    const pts = [];
    for (let i = 0; i < n; i++) {
      pts.push([
        section[i][0] * ring.w + (ring.ox || 0),
        ring.y,
        section[i][1] * ring.d + (ring.oz || 0),
      ]);
    }
    const order = flip ? pts.slice().reverse() : pts;
    const r = face.uv;
    const slot = typeof face.tex === 'number' ? face.tex : this.slot(face.tex);
    // project the section onto the uv rect so the cap is not stretched
    const idx = order.map((p, i) => {
      const src = flip ? section[n - 1 - i] : section[i];
      const u = r[2] + (r[0] - r[2]) * (src[0] * 0.5 + 0.5);
      const v = r[3] + (r[1] - r[3]) * (src[1] * 0.5 + 0.5);
      return this.vert(p[0], p[1], p[2], u, v, 0, flip ? -1 : 1, 0);
    });
    for (let i = 1; i < n - 1; i++) this.tri(idx[0], idx[i], idx[i + 1], slot, face.flags | 0);
  }

  /**
   * Axis-aligned box from (x0,y0,z0) to (x1,y1,z1).
   * `faces` maps side -> {tex, uv, flags, sub} ; `faces.all` is the fallback.
   * A side set to null is skipped (handy for open-backed shelving).
   */
  box(x0, y0, z0, x1, y1, z1, faces) {
    const all = faces.all;
    const side = (k) => (k in faces ? faces[k] : all);
    const put = (f, p0, p1, p2, p3) => {
      if (!f) return;
      /* A face may name a texel density instead of a uv rectangle, which
         is what keeps a skirting board and a wall cap tiling at the same
         scale as the wall they sit against. */
      if (f.density !== undefined && !f.uv) {
        this.surface([p0, p1, p2, p3], f.tex,
          { density: f.density, flags: f.flags | 0, sub: f.sub, offset: f.offset });
        return;
      }
      this.quad(p0, p1, p2, p3, f.tex, f.uv || [0, 0, 64, 64], f.flags | 0, f.sub);
    };
    // +Z (front, looking toward -Z)
    put(side('pz'), [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    // -Z (back)
    put(side('nz'), [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    // +X (right)
    put(side('px'), [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    // -X (left)
    put(side('nx'), [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    // +Y (top)
    put(side('py'), [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    // -Y (bottom)
    put(side('ny'), [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
  }

  /**
   * Flat billboard-ish plate standing on the XY plane at z, double sided.
   *
   * Subdivided by default. Affine mapping interpolates u,v linearly across
   * each of a quad's two triangles, so anything printed on a single large
   * quad shears along the diagonal and swims as you walk past it -- which
   * is exactly what the movie posters were doing. `sub` overrides the grid
   * for callers that want a coarser or finer one.
   */
  plate(cx, y0, cz, w, h, yaw, tex, uv, flags, sub) {
    const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2;
    const ax = cx - c * hw, az = cz + s * hw;
    const bx = cx + c * hw, bz = cz - s * hw;
    const grid = sub || [Math.max(2, Math.round(w * 5)), Math.max(2, Math.round(h * 5)), false];
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y0 + h, bz], [ax, y0 + h, az],
      tex, uv, (flags | 0) | F_DOUBLE, grid);
  }

  /**
   * A textured quad sized in meters rather than in texels.
   *
   * `density` is texels per meter: pass the texture's own resolution
   * divided by how many meters one tile should cover. A 64x64 brick sheet
   * meant to repeat every half meter is density 128. The uv rectangle is
   * worked out from the quad's real size, so the same wall material tiles
   * identically on a two meter partition and a twenty meter hall, and no
   * level file ever multiplies anything by 64.
   *
   * @param corners [p0,p1,p2,p3] counter-clockwise seen from the front
   * @param tex     texture object or slot index
   * @param opt     { density, flags, sub, offset:[u,v] }
   */
  surface(corners, tex, opt = {}) {
    const [p0, p1, p2, p3] = corners;
    const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const d = opt.density === undefined ? 64 : opt.density;
    const w = Math.max(len(p0, p1), len(p3, p2)) * d;
    const h = Math.max(len(p0, p3), len(p1, p2)) * d;
    const ou = opt.offset ? opt.offset[0] * d : 0;
    const ov = opt.offset ? opt.offset[1] * d : 0;
    this.quad(p0, p1, p2, p3, tex, [ou, ov, ou + w, ov + h], opt.flags | 0, opt.sub);
  }

  merge(other, dx = 0, dy = 0, dz = 0) {
    const base = this.sh.length;
    for (let i = 0; i < other.sh.length; i++) {
      this.px.push(other.px[i * 3] + dx, other.px[i * 3 + 1] + dy, other.px[i * 3 + 2] + dz);
      this.uv.push(other.uv[i * 2], other.uv[i * 2 + 1]);
      this.sh.push(other.sh[i]);
      this.shDark.push(other.shDark ? other.shDark[i] : other.sh[i]);
    }
    const map = other.textures.map((t) => this.slot(t));
    for (let t = 0; t < other.tex.length; t++) {
      this.idx.push(other.idx[t * 3] + base, other.idx[t * 3 + 1] + base, other.idx[t * 3 + 2] + base);
      this.tex.push(map[other.tex[t]]);
      this.flg.push(other.flg[t]);
    }
  }

  build() {
    const n = this.sh.length;
    let minx = 1e9, miny = 1e9, minz = 1e9, maxx = -1e9, maxy = -1e9, maxz = -1e9;
    for (let i = 0; i < n; i++) {
      const x = this.px[i * 3], y = this.px[i * 3 + 1], z = this.px[i * 3 + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, cz = (minz + maxz) / 2;
    const r = n ? Math.hypot(maxx - cx, maxy - cy, maxz - cz) : 0;
    return {
      count: n,
      vx: new Float32Array(this.px),
      vu: new Float32Array(this.uv),
      vs: new Float32Array(this.sh),
      vs2: new Float32Array(this.shDark),
      idx: n > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
      tex: new Uint8Array(this.tex),
      flg: new Uint8Array(this.flg),
      textures: this.textures,
      bounds: { x: cx, y: cy, z: cz, r },
      triCount: this.tex.length,
    };
  }
}

function normalOf(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}
