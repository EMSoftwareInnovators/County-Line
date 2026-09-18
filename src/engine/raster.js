/* ============================================================
   raster.js -- software triangle rasterizer that reproduces the
   PlayStation 1 / Nintendo 64 look on purpose, not by filter:

     * integer vertex snapping        -> the famous polygon wobble
     * AFFINE texture mapping         -> textures swim on big polys
     * per-vertex shade + black fog   -> vertex lighting, no lightmaps
     * nearest-neighbor texels        -> no bilinear smear
     * 1/z depth buffer               -> keeps it sane at 60fps

   Everything writes into one Uint32Array in 0xAABBGGRR order so it
   can be handed straight to ImageData.

   ------------------------------------------------------------
   STAGE 3: AFFINE MAPPING IS NOW A SETTING, NOT A LAW.

   Final Rental's biggest surface was a four-meter store wall. The Old
   Academy's is a ninety-four-foot elevation with a sixteen-foot ceiling,
   and affine mapping across a surface that size does not read as retro
   charm -- it reads as the building being made of liquid. Standing close
   to a wall, the texture visibly swims and bends as you walk, because a
   perspective projection is a division and interpolating u and v linearly
   in screen space is not.

   `perspStep` decides how honest the mapping is:

       0   fully affine, as before -- the authentic swim
       n   perspective-correct every n pixels, affine between
       1   perspective-correct per pixel

   Segmented correction is what 1990s software renderers actually did, and
   at n = 8 the residual error on a wall you can touch is under a texel.
   The cost is one divide per segment instead of one per pixel.

   Two span loops rather than one branch inside the pixel loop: this is the
   hot path, and `if (persp)` per pixel costs more than the divide it
   guards.
   ------------------------------------------------------------

   Carried over from Final Rental. The scanline inner loops are
   unchanged -- they were correct and they are the hot path. What changed
   for County Line is the culling: Final Rental's view distance was the
   fog distance, because nothing in a video store is further away than
   the fog. County Line has long sightlines down a two-floor hall and out
   through the windows, so the far plane is its own number and the fog is
   free to sit well inside it.
   ============================================================ */

export const F_DOUBLE = 1;   // don't backface-cull
export const F_EMIT = 2;     // full bright, ignores light + fog
export const F_BLEND = 4;    // 50% blend, no depth write (glass)
export const F_ADD = 8;      // additive, no depth write (glow)

const NEAR = 0.08;

export class Raster {
  constructor(w, h) {
    this.resize(w, h);
    this.fogNear = 8.0;
    this.fogFar = 42.0;
    /* How far the camera can see, independently of where the fog ends.
       Geometry beyond this is culled whole. Tuned per level. */
    this.far = 90.0;
    this.snap = 1;            // 1 = full pixel snap (max wobble), 0 = smooth
    /** 0 = affine; n > 0 = perspective-correct every n pixels. */
    this.perspStep = 8;
    /** Scales the mip ratio. 1 is neutral; below 1 keeps sharper, noisier
        texels for longer; -1 turns mip selection off entirely. */
    this.mipBias = 1;
    this.view = null;
    this.focal = 1;
    this.tris = 0;            // per-frame stats
    this.spans = 0;
    // vertex scratch, grown on demand
    this._n = 0;
    this._grow(4096);
    // clip scratch (max 4 verts after one plane)
    this._cx = new Float32Array(8); this._cy = new Float32Array(8);
    this._cz = new Float32Array(8); this._cu = new Float32Array(8);
    this._cv = new Float32Array(8); this._cs = new Float32Array(8);
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.color = new Uint32Array(w * h);
    this.depth = new Float32Array(w * h);
    this.cx = w * 0.5; this.cy = h * 0.5;
  }

  _grow(n) {
    if (n <= this._n) return;
    this._n = n;
    this.tvx = new Float32Array(n); this.tvy = new Float32Array(n); this.tvz = new Float32Array(n);
    this.tsx = new Float32Array(n); this.tsy = new Float32Array(n); this.tiz = new Float32Array(n);
    this.tsh = new Float32Array(n);
  }

  clear(bg) {
    this.color.fill(bg >>> 0);
    this.depth.fill(0);
    this.tris = 0; this.spans = 0;
  }

  /** Fog band, in meters. Interiors want it far; a corridor wants it close. */
  setFog(near, far) { this.fogNear = near; this.fogFar = far; }

  /** @param view inverse camera matrix (3x4)  @param fovY vertical fov in radians */
  setCamera(view, fovY) {
    this.view = view;
    this.focal = (this.h * 0.5) / Math.tan(fovY * 0.5);
    // side-plane slopes for sphere culling, in view space
    const fx = this.focal / (this.w * 0.5), fy = this.focal / (this.h * 0.5);
    this._planeX = 1 / Math.sqrt(1 + fx * fx);
    this._planeY = 1 / Math.sqrt(1 + fy * fy);
    this._slopeX = 1 / fx;
    this._slopeY = 1 / fy;
  }

  /** Rough bounding-sphere frustum test in view space. */
  sphereVisible(x, y, z, r) {
    const m = this.view;
    const vz = m[8] * x + m[9] * y + m[10] * z + m[11];
    if (vz < -r) return false;
    if (vz - r > this.far) return false;
    const vx = m[0] * x + m[1] * y + m[2] * z + m[3];
    const vy = m[4] * x + m[5] * y + m[6] * z + m[7];
    // distance to left/right planes: (vz*slope - |vx|) normalized
    if ((vz * this._slopeX - Math.abs(vx)) * this._planeX < -r) return false;
    if ((vz * this._slopeY - Math.abs(vy)) * this._planeY < -r) return false;
    return true;
  }

  /**
   * Frustum test for an axis-aligned world box. Rooms are boxes, so this
   * is what decides whether a whole room's static mesh is submitted.
   * Conservative: it tests the box's bounding sphere against the same
   * planes as sphereVisible, which never culls something it should keep.
   */
  boxVisible(b) {
    const cx = (b.x0 + b.x1) * 0.5, cy = (b.y0 + b.y1) * 0.5, cz = (b.z0 + b.z1) * 0.5;
    const r = Math.hypot(b.x1 - cx, b.y1 - cy, b.z1 - cz);
    return this.sphereVisible(cx, cy, cz, r);
  }

  /**
   * @param mesh   see mesh.js
   * @param m      model->world 3x4
   * @param opt    { shade, textures, flags, fogScale }
   */
  drawMesh(mesh, m, opt) {
    const view = this.view;
    const n = mesh.count;
    this._grow(n);
    const vx = mesh.vx, vu = mesh.vu, vs = mesh.vs;
    /* `lit` blends between the two baked shade terms: 1 is the building
       with its fittings on, 0 is the same building with only the ambient
       and whatever is burning outside. A breaker is a number per chunk. */
    const lit = (opt && opt.lit !== undefined) ? opt.lit : 1;
    const vs2 = (lit < 0.999 && mesh.vs2) ? mesh.vs2 : null;
    const ik = 1 - lit;
    const tvx = this.tvx, tvy = this.tvy, tvz = this.tvz;
    const tsx = this.tsx, tsy = this.tsy, tiz = this.tiz, tsh = this.tsh;

    // model -> view, collapsed into one 3x4
    const a0 = view[0], a1 = view[1], a2 = view[2], a3 = view[3];
    const a4 = view[4], a5 = view[5], a6 = view[6], a7 = view[7];
    const a8 = view[8], a9 = view[9], a10 = view[10], a11 = view[11];
    const m0 = a0 * m[0] + a1 * m[4] + a2 * m[8];
    const m1 = a0 * m[1] + a1 * m[5] + a2 * m[9];
    const m2 = a0 * m[2] + a1 * m[6] + a2 * m[10];
    const m3 = a0 * m[3] + a1 * m[7] + a2 * m[11] + a3;
    const m4 = a4 * m[0] + a5 * m[4] + a6 * m[8];
    const m5 = a4 * m[1] + a5 * m[5] + a6 * m[9];
    const m6 = a4 * m[2] + a5 * m[6] + a6 * m[10];
    const m7 = a4 * m[3] + a5 * m[7] + a6 * m[11] + a7;
    const m8 = a8 * m[0] + a9 * m[4] + a10 * m[8];
    const m9 = a8 * m[1] + a9 * m[5] + a10 * m[9];
    const m10 = a8 * m[2] + a9 * m[6] + a10 * m[10];
    const m11 = a8 * m[3] + a9 * m[7] + a10 * m[11] + a11;

    const focal = this.focal, ccx = this.cx, ccy = this.cy;
    const shade = (opt && opt.shade !== undefined) ? opt.shade : 1;
    const fogN = this.fogNear, fogRange = 1 / Math.max(0.001, this.fogFar - this.fogNear);
    const snap = this.snap;

    for (let i = 0, p = 0, q = 0; i < n; i++, p += 3, q += 2) {
      const x = vx[p], y = vx[p + 1], z = vx[p + 2];
      const zz = m8 * x + m9 * y + m10 * z + m11;
      tvx[i] = m0 * x + m1 * y + m2 * z + m3;
      tvy[i] = m4 * x + m5 * y + m6 * z + m7;
      tvz[i] = zz;
      if (zz > NEAR) {
        const iz = 1 / zz;
        let sx = ccx + tvx[i] * focal * iz;
        let sy = ccy - tvy[i] * focal * iz;
        if (snap) { sx = Math.round(sx); sy = Math.round(sy); }
        tsx[i] = sx; tsy[i] = sy; tiz[i] = iz;
      }
      // shade = baked vertex light * distance fog, folded into one scalar
      let f = 1 - (zz - fogN) * fogRange;
      if (f > 1) f = 1; else if (f < 0) f = 0;
      const base = vs2 ? vs[i] * lit + vs2[i] * ik : vs[i];
      let s = base * shade * f * 256;
      tsh[i] = s > 256 ? 256 : s < 0 ? 0 : s;
    }

    const idx = mesh.idx, tex = mesh.tex, flg = mesh.flg;
    const texes = (opt && opt.textures) || mesh.textures;
    const extra = (opt && opt.flags) || 0;
    const nt = idx.length;
    for (let t = 0, j = 0; j < nt; t++, j += 3) {
      const i0 = idx[j], i1 = idx[j + 1], i2 = idx[j + 2];
      const z0 = tvz[i0], z1 = tvz[i1], z2 = tvz[i2];
      if (z0 <= NEAR && z1 <= NEAR && z2 <= NEAR) continue;
      const flags = flg[t] | extra;
      const T = texes[tex[t]];
      if (!T) continue;
      if (z0 > NEAR && z1 > NEAR && z2 > NEAR) {
        this._tri(
          tsx[i0], tsy[i0], tiz[i0], vu[i0 * 2], vu[i0 * 2 + 1], tsh[i0],
          tsx[i1], tsy[i1], tiz[i1], vu[i1 * 2], vu[i1 * 2 + 1], tsh[i1],
          tsx[i2], tsy[i2], tiz[i2], vu[i2 * 2], vu[i2 * 2 + 1], tsh[i2],
          T, flags);
      } else {
        this._clipTri(i0, i1, i2, vu, T, flags);
      }
    }
  }

  /** Sutherland-Hodgman against the near plane, then fan-triangulate. */
  _clipTri(i0, i1, i2, vu, T, flags) {
    const tvx = this.tvx, tvy = this.tvy, tvz = this.tvz, tsh = this.tsh;
    const ix = [i0, i1, i2];
    const cx = this._cx, cy = this._cy, cz = this._cz, cu = this._cu, cv = this._cv, cs = this._cs;
    let nOut = 0;
    for (let e = 0; e < 3; e++) {
      const a = ix[e], b = ix[(e + 1) % 3];
      const za = tvz[a], zb = tvz[b];
      const ina = za > NEAR, inb = zb > NEAR;
      if (ina) {
        cx[nOut] = tvx[a]; cy[nOut] = tvy[a]; cz[nOut] = za;
        cu[nOut] = vu[a * 2]; cv[nOut] = vu[a * 2 + 1]; cs[nOut] = tsh[a]; nOut++;
      }
      if (ina !== inb) {
        const t = (NEAR - za) / (zb - za);
        cx[nOut] = tvx[a] + (tvx[b] - tvx[a]) * t;
        cy[nOut] = tvy[a] + (tvy[b] - tvy[a]) * t;
        cz[nOut] = NEAR;
        cu[nOut] = vu[a * 2] + (vu[b * 2] - vu[a * 2]) * t;
        cv[nOut] = vu[a * 2 + 1] + (vu[b * 2 + 1] - vu[a * 2 + 1]) * t;
        cs[nOut] = tsh[a] + (tsh[b] - tsh[a]) * t;
        nOut++;
      }
    }
    if (nOut < 3) return;
    const focal = this.focal, ccx = this.cx, ccy = this.cy, snap = this.snap;
    const sx = this._psx || (this._psx = new Float32Array(8));
    const sy = this._psy || (this._psy = new Float32Array(8));
    const iz = this._piz || (this._piz = new Float32Array(8));
    for (let k = 0; k < nOut; k++) {
      const z = cz[k], q = 1 / z;
      let x = ccx + cx[k] * focal * q, y = ccy - cy[k] * focal * q;
      if (snap) { x = Math.round(x); y = Math.round(y); }
      sx[k] = x; sy[k] = y; iz[k] = q;
    }
    for (let k = 1; k < nOut - 1; k++) {
      this._tri(
        sx[0], sy[0], iz[0], cu[0], cv[0], cs[0],
        sx[k], sy[k], iz[k], cu[k], cv[k], cs[k],
        sx[k + 1], sy[k + 1], iz[k + 1], cu[k + 1], cv[k + 1], cs[k + 1],
        T, flags);
    }
  }

  _tri(x0, y0, z0, u0, v0, s0, x1, y1, z1, u1, v1, s1, x2, y2, z2, u2, v2, s2, T, flags) {
    // signed area -> backface cull (screen space, y-down so CW is front)
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0) return;

    /* ------------------------------------------------------------
       MIP SELECTION, ONCE PER TRIANGLE.

       Perspective correction fixes where a texel goes. It does nothing
       about how many of them are trying to fit in one pixel, and on a
       floor seen at a grazing angle that is four or five -- so which
       texel wins changes with sub-pixel camera motion and the whole
       surface crawls. Half of what read as "texture warping" was this.

       The ratio below is texels squared per pixel squared, straight out
       of the two areas the triangle already has. Every level it drops
       quarters it. `mipBias` lets the player choose to live with more of
       the crawl. Selection is per triangle, not per pixel: one compare
       in setup, nothing in the span loop, and it is what software
       renderers of the period actually did.
       ------------------------------------------------------------ */
    const chain = T.mip;
    if (chain && chain.length && this.mipBias >= 0) {
      const uvA = Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0));
      const sA = Math.abs(area);
      if (sA > 1e-6) {
        let r = (uvA / sA) * this.mipBias;
        let l = 0;
        while (l < chain.length && r > 4) { r *= 0.25; l++; }
        if (l > 0) {
          T = chain[l - 1];
          const k = 1 / (1 << l);
          u0 *= k; v0 *= k; u1 *= k; v1 *= k; u2 *= k; v2 *= k;
        }
      }
    }
    // camera looks down +Z, so front faces come out counter-clockwise (area > 0)
    if (area < 0 && !(flags & F_DOUBLE)) return;
    if (area < 0) { // double-sided back face: swap to keep winding consistent
      let t;
      t = x1; x1 = x2; x2 = t; t = y1; y1 = y2; y2 = t; t = z1; z1 = z2; z2 = t;
      t = u1; u1 = u2; u2 = t; t = v1; v1 = v2; v2 = t; t = s1; s1 = s2; s2 = t;
    }
    if (flags & F_EMIT) { s0 = s1 = s2 = 256; }
    this.tris++;

    // sort by y: a = top, b = mid, c = bottom
    let ax = x0, ay = y0, az = z0, au = u0, av = v0, as = s0;
    let bx = x1, by = y1, bz = z1, bu = u1, bv = v1, bs = s1;
    let cx = x2, cy = y2, cz = z2, cu = u2, cv = v2, cs = s2;
    let t;
    if (ay > by) { t = ax; ax = bx; bx = t; t = ay; ay = by; by = t; t = az; az = bz; bz = t; t = au; au = bu; bu = t; t = av; av = bv; bv = t; t = as; as = bs; bs = t; }
    if (by > cy) { t = bx; bx = cx; cx = t; t = by; by = cy; cy = t; t = bz; bz = cz; cz = t; t = bu; bu = cu; cu = t; t = bv; bv = cv; cv = t; t = bs; bs = cs; cs = t; }
    if (ay > by) { t = ax; ax = bx; bx = t; t = ay; ay = by; by = t; t = az; az = bz; bz = t; t = au; au = bu; bu = t; t = av; av = bv; bv = t; t = as; as = bs; bs = t; }
    if (ay === cy) return;
    if (cy < 0 || ay > this.h) return;

    const solid = !(flags & (F_BLEND | F_ADD));
    /* PERSPECTIVE CORRECTION, IN ONE LINE OF SETUP.

       u/z and v/z ARE linear in screen space, and 1/z is already being
       interpolated for the depth buffer. So premultiplying the texture
       coordinates by 1/z here lets every gradient below stay exactly as
       it was, and the span loop divides them back out at sampling time.
       Nothing else in the triangle setup has to know. */
    const persp = this.perspStep;
    if (persp) {
      au *= az; av *= az;
      bu *= bz; bv *= bz;
      cu *= cz; cv *= cz;
    }
    const half = persp ? this._halfP : this._half;

    const hAC = cy - ay;
    const dxAC = (cx - ax) / hAC, dzAC = (cz - az) / hAC;
    const duAC = (cu - au) / hAC, dvAC = (cv - av) / hAC, dsAC = (cs - as) / hAC;

    // upper half: A->B and A->C
    if (by > ay) {
      const hAB = by - ay;
      half.call(this, ay, by, ax, az, au, av, as, dxAC, dzAC, duAC, dvAC, dsAC,
        ax, az, au, av, as, (bx - ax) / hAB, (bz - az) / hAB, (bu - au) / hAB, (bv - av) / hAB, (bs - as) / hAB,
        T, flags, solid);
    }
    // lower half: B->C, with A->C continued from B's y
    if (cy > by) {
      const hBC = cy - by;
      const k = by - ay;
      half.call(this, by, cy, ax + dxAC * k, az + dzAC * k, au + duAC * k, av + dvAC * k, as + dsAC * k,
        dxAC, dzAC, duAC, dvAC, dsAC,
        bx, bz, bu, bv, bs, (cx - bx) / hBC, (cz - bz) / hBC, (cu - bu) / hBC, (cv - bv) / hBC, (cs - bs) / hBC,
        T, flags, solid);
    }
  }

  _half(y0, y1, lx, lz, lu, lv, ls, dlx, dlz, dlu, dlv, dls,
    rx, rz, ru, rv, rs, drx, drz, dru, drv, drs, T, flags, solid) {
    const H = this.h, W = this.w;
    // Scanlines are integers; step both edges up to the first covered one.
    // (Without this, un-snapped vertices produce fractional row indices and
    // every write silently vanishes into a typed array.)
    let y = Math.ceil(y0);
    let pre = y - y0;
    if (y < 0) { pre = -y0; y = 0; }
    if (pre > 0) {
      lx += dlx * pre; lz += dlz * pre; lu += dlu * pre; lv += dlv * pre; ls += dls * pre;
      rx += drx * pre; rz += drz * pre; ru += dru * pre; rv += drv * pre; rs += drs * pre;
    }
    const yEnd = Math.min(Math.ceil(y1), H);
    const color = this.color, depth = this.depth;
    const tw = T.wMask, th = T.hMask, tsh = T.shift, tp = T.px;
    const add = (flags & F_ADD) !== 0;

    for (; y < yEnd; y++) {
      let x0f = lx, x1f = rx, z0f = lz, z1f = rz, u0f = lu, u1f = ru, v0f = lv, v1f = rv, s0f = ls, s1f = rs;
      if (x0f > x1f) {
        let t;
        t = x0f; x0f = x1f; x1f = t; t = z0f; z0f = z1f; z1f = t;
        t = u0f; u0f = u1f; u1f = t; t = v0f; v0f = v1f; v1f = t; t = s0f; s0f = s1f; s1f = t;
      }
      const span = x1f - x0f;
      let xs = Math.ceil(x0f);
      let xe = Math.min(Math.ceil(x1f), W);
      if (span > 0 && xe > 0 && xs < W) {
        const inv = 1 / span;
        const dz = (z1f - z0f) * inv, du = (u1f - u0f) * inv, dv = (v1f - v0f) * inv, ds = (s1f - s0f) * inv;
        let stepX = xs - x0f;
        if (xs < 0) { stepX = -x0f; xs = 0; }
        let z = z0f + dz * stepX, u = u0f + du * stepX, v = v0f + dv * stepX, s = s0f + ds * stepX;
        let idx = y * W + xs;
        this.spans++;
        if (solid) {
          for (let x = xs; x < xe; x++, idx++) {
            if (z > depth[idx]) {
              const texel = tp[(((v | 0) & th) << tsh) + ((u | 0) & tw)];
              if (texel & 0xFF000000) {
                const q = s | 0;
                color[idx] = 0xFF000000 |
                  ((((texel & 0x00FF00FF) * q) >>> 8) & 0x00FF00FF) |
                  ((((texel & 0x0000FF00) * q) >>> 8) & 0x0000FF00);
                depth[idx] = z;
              }
            }
            z += dz; u += du; v += dv; s += ds;
          }
        } else {
          for (let x = xs; x < xe; x++, idx++) {
            if (z > depth[idx]) {
              const texel = tp[(((v | 0) & th) << tsh) + ((u | 0) & tw)];
              if (texel & 0xFF000000) {
                const q = s | 0;
                const src = ((((texel & 0x00FF00FF) * q) >>> 8) & 0x00FF00FF) |
                  ((((texel & 0x0000FF00) * q) >>> 8) & 0x0000FF00);
                const dst = color[idx];
                if (add) {
                  let r = (src & 255) + (dst & 255); if (r > 255) r = 255;
                  let g = ((src >> 8) & 255) + ((dst >> 8) & 255); if (g > 255) g = 255;
                  let b = ((src >> 16) & 255) + ((dst >> 16) & 255); if (b > 255) b = 255;
                  color[idx] = 0xFF000000 | (b << 16) | (g << 8) | r;
                } else {
                  color[idx] = 0xFF000000 | ((((src & 0xFEFEFE) >> 1) + ((dst & 0xFEFEFE) >> 1)) & 0xFFFFFF);
                }
              }
            }
            z += dz; u += du; v += dv; s += ds;
          }
        }
      }
      lx += dlx; lz += dlz; lu += dlu; lv += dlv; ls += dls;
      rx += drx; rz += drz; ru += dru; rv += drv; rs += drs;
    }
  }

  /**
   * The same scanline pair, with the texture coordinates divided back out
   * of 1/z. `u` and `v` arriving here are u/z and v/z; the depth value
   * already being carried for the z-buffer IS 1/z, so one reciprocal per
   * segment recovers both.
   *
   * The span is walked in runs of `perspStep` pixels. Exact texture
   * coordinates are computed at each end of a run and interpolated
   * linearly between -- which is affine mapping again, but over eight
   * pixels instead of over a ninety-four-foot wall, where the error is
   * a fraction of a texel instead of half the texture.
   */
  _halfP(y0, y1, lx, lz, lu, lv, ls, dlx, dlz, dlu, dlv, dls,
    rx, rz, ru, rv, rs, drx, drz, dru, drv, drs, T, flags, solid) {
    const H = this.h, W = this.w;
    let y = Math.ceil(y0);
    let pre = y - y0;
    if (y < 0) { pre = -y0; y = 0; }
    if (pre > 0) {
      lx += dlx * pre; lz += dlz * pre; lu += dlu * pre; lv += dlv * pre; ls += dls * pre;
      rx += drx * pre; rz += drz * pre; ru += dru * pre; rv += drv * pre; rs += drs * pre;
    }
    const yEnd = Math.min(Math.ceil(y1), H);
    const color = this.color, depth = this.depth;
    const tw = T.wMask, th = T.hMask, tsh = T.shift, tp = T.px;
    const add = (flags & F_ADD) !== 0;
    const STEP = this.perspStep;

    for (; y < yEnd; y++) {
      let x0f = lx, x1f = rx, z0f = lz, z1f = rz, u0f = lu, u1f = ru, v0f = lv, v1f = rv, s0f = ls, s1f = rs;
      if (x0f > x1f) {
        let t;
        t = x0f; x0f = x1f; x1f = t; t = z0f; z0f = z1f; z1f = t;
        t = u0f; u0f = u1f; u1f = t; t = v0f; v0f = v1f; v1f = t; t = s0f; s0f = s1f; s1f = t;
      }
      const span = x1f - x0f;
      let xs = Math.ceil(x0f);
      let xe = Math.min(Math.ceil(x1f), W);
      if (span > 0 && xe > 0 && xs < W) {
        const inv = 1 / span;
        const dz = (z1f - z0f) * inv, du = (u1f - u0f) * inv, dv = (v1f - v0f) * inv, ds = (s1f - s0f) * inv;
        let stepX = xs - x0f;
        if (xs < 0) { stepX = -x0f; xs = 0; }
        let z = z0f + dz * stepX, uz = u0f + du * stepX, vz = v0f + dv * stepX, s = s0f + ds * stepX;
        let idx = y * W + xs;
        this.spans++;
        let x = xs;
        /* w is 1/(1/z). Guarded because a vertex clipped exactly onto the
           near plane can leave z at zero on the first pixel of a span. */
        let w = z > 1e-9 ? 1 / z : 0;
        let u = uz * w, v = vz * w;
        while (x < xe) {
          let n = xe - x;
          if (n > STEP) n = STEP;
          const ze = z + dz * n;
          const we = ze > 1e-9 ? 1 / ze : 0;
          const ue = (uz + du * n) * we, ve = (vz + dv * n) * we;
          const su = (ue - u) / n, sv = (ve - v) / n;
          for (let k = 0; k < n; k++, idx++) {
            if (z > depth[idx]) {
              const texel = tp[(((v | 0) & th) << tsh) + ((u | 0) & tw)];
              if (texel & 0xFF000000) {
                const q = s | 0;
                const src = ((((texel & 0x00FF00FF) * q) >>> 8) & 0x00FF00FF) |
                  ((((texel & 0x0000FF00) * q) >>> 8) & 0x0000FF00);
                if (solid) {
                  color[idx] = 0xFF000000 | src;
                  depth[idx] = z;
                } else {
                  const dst = color[idx];
                  if (add) {
                    let r2 = (src & 255) + (dst & 255); if (r2 > 255) r2 = 255;
                    let g2 = ((src >> 8) & 255) + ((dst >> 8) & 255); if (g2 > 255) g2 = 255;
                    let b2 = ((src >> 16) & 255) + ((dst >> 16) & 255); if (b2 > 255) b2 = 255;
                    color[idx] = 0xFF000000 | (b2 << 16) | (g2 << 8) | r2;
                  } else {
                    color[idx] = 0xFF000000 | ((((src & 0xFEFEFE) >> 1) + ((dst & 0xFEFEFE) >> 1)) & 0xFFFFFF);
                  }
                }
              }
            }
            z += dz; u += su; v += sv; s += ds;
          }
          uz += du * n; vz += dv * n;
          u = ue; v = ve;
          x += n;
        }
      }
      lx += dlx; lz += dlz; lu += dlu; lv += dlv; ls += dls;
      rx += drx; rz += drz; ru += dru; rv += drv; rs += drs;
    }
  }

  /** World point -> screen pixel, or null if behind/offscreen. Used for UI anchors. */
  project(x, y, z, out) {
    const m = this.view;
    const vz = m[8] * x + m[9] * y + m[10] * z + m[11];
    if (vz <= NEAR) return null;
    const vx = m[0] * x + m[1] * y + m[2] * z + m[3];
    const vy = m[4] * x + m[5] * y + m[6] * z + m[7];
    const q = this.focal / vz;
    out.x = this.cx + vx * q; out.y = this.cy - vy * q; out.z = vz;
    return out;
  }
}
