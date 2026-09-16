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
