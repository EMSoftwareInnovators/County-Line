/* ============================================================
   postfx.js -- the picture tube.

   Takes the rasterizer's framebuffer and puts it through a CRT: 15-bit
   ordered dithering (which the PlayStation did in hardware), composite
   chroma bleed, phosphor persistence, scanlines, grain and a vignette.

   Adapted from Final Rental's postfx.js. The scanline loop is the same
   one -- it was tight and it is the second hot path in the frame. What is
   gone is the VHS deck: the rolling head-switching band, the garbage
   lines along the bottom of the frame and the dropout flecks. Those were
   Final Rental's own conceit, a game watched back off a tape. County Line
   is not that game, and a foundation should not carry another game's
   signature effect.

   What stayed, beyond the tube itself, are three distortion knobs --
   `roll`, `tear`, `invert` -- which are generic picture faults rather
   than tape faults, cost nothing while they are zero, and are what a
   later stage will reach for when something is meant to be wrong with
   what the player is looking at. They default to off.
   ============================================================ */

// 4x4 Bayer, biased to +/- half a quantization step
const BAYER = new Int32Array([
  0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
].map((v) => v - 8));

/** What the options screen exposes, and what each level costs. */
export const PRESETS = {
  off: { dither: false, bleed: 0, scan: 1, ghost: 0, grain: 0, vignette: 0 },
  light: { dither: true, bleed: 0, scan: 0.93, ghost: 0.10, grain: 5, vignette: 0.24 },
  full: { dither: true, bleed: 1, scan: 0.82, ghost: 0.20, grain: 10, vignette: 0.42 },
};

export class PostFX {
  constructor(canvas, w, h) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.vignetteAmount = 0.42;
    this.resize(w, h);
    this.t = 0;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.out = new Uint32Array(this.img.data.buffer);
    this.prev = new Uint32Array(w * h);
    this.ctx.imageSmoothingEnabled = false;
    this._vig = null;
  }

  /** Vignette strength, 0..1. Rebuilds the lookup table. */
  setVignette(a) {
    if (a === this.vignetteAmount) return;
    this.vignetteAmount = a;
    this._vig = null;
  }

  /**
   * @param src Uint32Array framebuffer (0xAABBGGRR)
   * @param p   { dt, dither, bleed, scan, ghost, grain, warp, fade, flash,
   *              tintR, tintG, tintB, dark, roll, tear, invert }
   *
   * roll   -- vertical frame slip in pixels, wrapping
   * tear   -- 0..1, chance per scanline of a sideways rip
   * invert -- 0..1 mix toward a photographic negative
   */
  render(src, p) {
    const w = this.w, h = this.h, out = this.out, prev = this.prev;
    this.t += p.dt || 0.016;
    const t = this.t;

    const dither = p.dither !== false;
    const bleed = p.bleed === undefined ? 1 : p.bleed;
    const scan = p.scan === undefined ? 0.82 : p.scan;
    const ghost = p.ghost === undefined ? 0.20 : p.ghost;
    const grain = p.grain === undefined ? 10 : p.grain;
    const warp = p.warp || 0;
    const fade = p.fade === undefined ? 0 : p.fade;       // 0 normal, 1 black
    const flash = p.flash || 0;                            // 0..1 white
    const dark = p.dark === undefined ? 1 : p.dark;        // global gain
    const tr = p.tintR === undefined ? 1 : p.tintR;
    const tg = p.tintG === undefined ? 1 : p.tintG;
    const tb = p.tintB === undefined ? 1 : p.tintB;
    const roll = (p.roll || 0) | 0;
    const tear = p.tear || 0;
    const invert = p.invert || 0;
    const invK = (invert * 256) | 0, invKeep = 256 - invK;

    const gain = dark * (1 - fade);
    const gR = gain * tr * 256 | 0, gG = gain * tg * 256 | 0, gB = gain * tb * 256 | 0;
    const flashAdd = (flash * 255) | 0;
    const ghostK = (ghost * 256) | 0, keepK = 256 - ghostK;

    if (!this._vig || this._vig.length !== w * h) this._buildVignette();
    const vig = this._vig;

    for (let y = 0; y < h; y++) {
      let shift = 0;
      if (warp) shift += Math.sin(y * 0.21 + t * 4.7) * warp;
      if (tear && Math.random() < tear * 0.20) shift += (Math.random() - 0.5) * w * 0.7;
      const sh = shift | 0;

      let sy = y;
      if (roll) { sy = (y + roll) % h; if (sy < 0) sy += h; }
      const row = sy * w;
      const outRow = y * w;
      const scanK = ((y & 1) ? scan : 1) * 256 | 0;

      for (let x = 0; x < w; x++) {
        const i = outRow + x;
        // chroma bleed: red lags, blue leads, roughly like composite video
        let xr = x + sh - bleed, xg = x + sh, xb = x + sh + bleed;
        xr = xr < 0 ? 0 : xr >= w ? w - 1 : xr;
        xg = xg < 0 ? 0 : xg >= w ? w - 1 : xg;
        xb = xb < 0 ? 0 : xb >= w ? w - 1 : xb;
        const cr = src[row + xr], cg = src[row + xg], cb = src[row + xb];

        let r = cr & 255, g = (cg >> 8) & 255, b = (cb >> 16) & 255;

        if (ghostK) {
          const pv = prev[i];
          r = (r * keepK + (pv & 255) * ghostK) >> 8;
          g = (g * keepK + ((pv >> 8) & 255) * ghostK) >> 8;
          b = (b * keepK + ((pv >> 16) & 255) * ghostK) >> 8;
        }

        const v = vig[i];
        let R = (((r * gR) >> 8) * scanK >> 8) * v >> 8;
        let G = (((g * gG) >> 8) * scanK >> 8) * v >> 8;
        let B = (((b * gB) >> 8) * scanK >> 8) * v >> 8;

        if (grain) {
          const n = ((Math.random() * grain) | 0) - (grain >> 1);
          R += n; G += n; B += n;
        }
        if (invK) {
          R = (R * invKeep + (255 - R) * invK) >> 8;
          G = (G * invKeep + (255 - G) * invK) >> 8;
          B = (B * invKeep + (255 - B) * invK) >> 8;
        }
        if (flashAdd) { R += flashAdd; G += flashAdd; B += flashAdd; }

        // 15-bit quantization with an ordered dither -- the PS1 signature
        if (dither) {
          const d = BAYER[((y & 3) << 2) | (x & 3)];
          R += d; G += d; B += d;
          R = (R < 0 ? 0 : R > 255 ? 255 : R) & 0xF8;
          G = (G < 0 ? 0 : G > 255 ? 255 : G) & 0xF8;
          B = (B < 0 ? 0 : B > 255 ? 255 : B) & 0xF8;
        } else {
          R = R < 0 ? 0 : R > 255 ? 255 : R;
          G = G < 0 ? 0 : G > 255 ? 255 : G;
          B = B < 0 ? 0 : B > 255 ? 255 : B;
        }
        out[i] = 0xFF000000 | (B << 16) | (G << 8) | R;
      }
    }

    prev.set(out);
    this.ctx.putImageData(this.img, 0, 0);
  }

  _buildVignette() {
    const w = this.w, h = this.h, amt = this.vignetteAmount;
    const v = new Uint8Array(w * h);
    const cx = w / 2, cy = h / 2, maxd = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxd;
        const k = 1 - amt * Math.pow(d, 2.2);
        v[y * w + x] = Math.max(0, Math.min(255, k * 255)) | 0;
      }
    }
    this._vig = v;
  }
}
