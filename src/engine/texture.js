/* ============================================================
   texture.js -- runtime texture generation.

   County Line ships no image files. Every texel is painted into a 2D
   canvas at boot and read back into a power-of-two Uint32Array
   (0xAABBGGRR) that the rasterizer indexes with (v << shift) + u.

   This module is the machinery only. It knows how to make a texture and
   how to dirty one up; it does not know what any surface in the game
   looks like. Materials live in src/world/materials.js.

   Carried over from Final Rental's texture.js, minus the video store.
   ============================================================ */
import { makeRng } from './mathx.js';

/**
 * Paint a power-of-two texture.
 * @param w,h  must be powers of two -- the rasterizer masks rather than wraps
 * @param draw (ctx2d, w, h) => void
 */
export function makeTex(w, h, draw) {
  if ((w & (w - 1)) || (h & (h - 1))) {
    throw new Error(`texture ${w}x${h} is not power-of-two`);
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  draw(g, w, h);
  return texFromCanvas(c);
}

export function texFromCanvas(c) {
  const g = c.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, c.width, c.height);
  return {
    px: new Uint32Array(d.data.buffer.slice(0)),
    w: c.width, h: c.height,
    wMask: c.width - 1, hMask: c.height - 1,
    shift: Math.round(Math.log2(c.width)),
    canvas: c,
  };
}

/**
 * Build a chain of half-size copies of a texture, smallest last.
 *
 * WHY A SOFTWARE RENDERER WITH NO FILTERING STILL WANTS MIPMAPS.
 *
 * Nearest-neighbor sampling of a detailed texture at a grazing angle
 * walks the texture faster than one texel per pixel, so which texel a
 * pixel lands on changes with sub-pixel camera motion, and the whole
 * surface crawls. That is most of what looked like texture warping on the
 * Old Academy's floors, and no amount of perspective correction touches
 * it -- the mapping was right, the sampling was undersampled.
 *
 * Levels are box-filtered by hand rather than by drawing the canvas at
 * half scale, because canvas downscaling is an implementation detail and
 * this has to be identical on every machine that takes a screenshot.
 *
 * Selection is PER TRIANGLE, from texel area over screen area, so it
 * costs one comparison in the triangle setup and nothing per pixel. That
 * is coarser than hardware, which picks per pixel, and it is exactly what
 * software renderers of the period did.
 */
export function mipChain(tex, levels = 3) {
  const out = [];
  let src = tex;
  for (let i = 0; i < levels; i++) {
    const w = src.w >> 1, h = src.h >> 1;
    if (w < 2 || h < 2) break;
    const px = new Uint32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let j = 0; j < 2; j++) {
          for (let k = 0; k < 2; k++) {
            const c = src.px[((y * 2 + j) * src.w) + (x * 2 + k)] >>> 0;
            r += c & 255; g += (c >>> 8) & 255; b += (c >>> 16) & 255; a += (c >>> 24) & 255;
          }
        }
        px[y * w + x] = (((a >> 2) & 255) << 24) | (((b >> 2) & 255) << 16)
          | (((g >> 2) & 255) << 8) | ((r >> 2) & 255);
      }
    }
    src = { px, w, h, wMask: w - 1, hMask: h - 1, shift: Math.round(Math.log2(w)) };
    out.push(src);
  }
  tex.mip = out;
  return tex;
}

/** A flat color, for developer materials and for anything untextured. */
export function solidTex(css, size = 8) {
  return makeTex(size, size, (g, w, h) => { g.fillStyle = css; g.fillRect(0, 0, w, h); });
}

/* ============================================================
   PAINTING HELPERS

   Seeded, so the same build produces the same textures every run and a
   screenshot diff means something.
   ============================================================ */
export const texRng = makeRng(0x0C0417E);

export function fill(g, c, w, h) { g.fillStyle = c; g.fillRect(0, 0, w, h); }

/** Per-pixel brightness noise. `mono` keeps it gray; otherwise it tints. */
export function noise(g, w, h, amt, alpha = 1, mono = true) {
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    if (mono) {
      const n = (texRng() - 0.5) * amt;
      p[i] += n; p[i + 1] += n; p[i + 2] += n;
    } else {
      p[i] += (texRng() - 0.5) * amt;
      p[i + 1] += (texRng() - 0.5) * amt;
      p[i + 2] += (texRng() - 0.5) * amt;
    }
    if (alpha < 1) p[i + 3] *= alpha;
  }
  g.putImageData(d, 0, 0);
}

/** Scattered single pixels -- carpet fleck, aggregate, plaster grit. */
export function speckle(g, w, h, n, colors, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[texRng.int(colors.length)];
    g.fillRect(texRng.int(w), texRng.int(h), size, size);
  }
}

/** Soft dark blooms. Age, in one call. */
export function grime(g, w, h, strength = 0.22, n = 26) {
  for (let i = 0; i < n; i++) {
    const x = texRng.int(w), y = texRng.int(h), r = 3 + texRng.int(14);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${strength})`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/**
 * A regular grid of lines, wrapping at the texture edge.
 * Tile, plank, brick course, window mullion -- most architecture is this.
 */
export function grid(g, w, h, cols, rows, css, lw = 1) {
  g.strokeStyle = css; g.lineWidth = lw;
  for (let i = 0; i <= cols; i++) {
    const x = Math.round((i * w) / cols);
    g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = Math.round((j * h) / rows);
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
  }
}

/** Running-bond courses, offset every other row. */
export function bond(g, w, h, rows, perRow, mortar, lw = 1) {
  const rh = h / rows, bw = w / perRow;
  g.strokeStyle = mortar; g.lineWidth = lw;
  for (let r = 0; r < rows; r++) {
    const y = Math.round(r * rh);
    g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    const off = (r & 1) ? bw / 2 : 0;
    for (let b = 0; b < perRow; b++) {
      const x = Math.round(off + b * bw) % w;
      g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + rh); g.stroke();
    }
  }
}

/** Text baked into a texture, for signs and developer labels. */
export function label(g, text, x, y, css, font) {
  g.fillStyle = css;
  g.font = font || 'bold 12px "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}
