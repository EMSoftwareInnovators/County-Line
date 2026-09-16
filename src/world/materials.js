/* ============================================================
   materials.js -- COUNTY LINE's developer material set.

   These are not art. They are the greybox: flat, neutral, gridded
   surfaces whose only job is to make scale, orientation and alignment
   obvious while the engine is being validated. Every one of them is
   deliberately plain, because time spent making the test level pretty is
   time spent on a level that gets deleted.

   A material is a texture plus the two numbers the level builder needs to
   place it: `density`, in texels per meter, so one material tiles at the
   same scale on every surface whatever its size; and `material`, a name
   the audio layer reads to pick a footstep.

   Real County Line materials arrive with the building, in a later stage.
   ============================================================ */
import { makeTex, fill, noise, speckle, grid, bond, grime, label } from '../engine/texture.js';

/** texels per meter for the standard greybox grid: one line every 0.5 m. */
const D = 64;

const mat = (tex, opts = {}) => ({
  tex,
  density: opts.density === undefined ? D : opts.density,
  material: opts.material || 'stone',
});

export function buildMaterials() {
  const M = {};

  /* ---- the reference grid ----
     Mid gray, one bright line every half meter and a heavier line every
     two. Standing in a room built from this, the player can count the
     meters to the far wall, which is exactly what a technical test map is
     for. */
  const gridTex = (base, line, heavy) => makeTex(64, 64, (g, w, h) => {
    fill(g, base, w, h);
    noise(g, w, h, 8);
    grid(g, w, h, 1, 1, line, 1);
    g.strokeStyle = heavy; g.lineWidth = 2;
    g.strokeRect(0, 0, w, h);
  });

  M.floor = mat(gridTex('#4a4a4e', '#5a5a60', '#6e6e76'), { material: 'stone' });
  M.wall = mat(gridTex('#5c5c62', '#6a6a72', '#7a7a84'), { material: 'stone' });
  M.ceiling = mat(gridTex('#6e6e74', '#7a7a82', '#868692'), { material: 'stone' });

  /* A second wall tone, so adjoining rooms are told apart at a glance. */
  M.wallWarm = mat(gridTex('#655d52', '#736b5e', '#847a6b'), { material: 'stone' });
  M.wallCool = mat(gridTex('#4e5860', '#5a6570', '#68737f'), { material: 'stone' });

  /* ---- boards, for a floor that shows which way it runs ---- */
  M.boards = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#6b5a44', w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ['#6f5e47', '#65553f', '#735f48', '#61523d'][i];
      g.fillRect(0, i * 16, w, 16);
    }
    speckle(g, w, h, 500, ['#59492f', '#7a6852', '#4e4130']);
    g.strokeStyle = '#3b3023'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = i * 16;
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    }
    noise(g, w, h, 12);
    grime(g, w, h, 0.16, 14);
  }), { material: 'wood' });

  /* ---- stair treads: high contrast, because the point of the test map
     is that you can see exactly where each step is ---- */
  M.tread = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#57575e', w, h);
    noise(g, w, h, 10);
    g.fillStyle = '#8d8d3a';
    g.fillRect(0, 0, w, 4);
    grid(g, w, h, 2, 2, '#67676e', 1);
  }), { material: 'wood' });

  M.riser = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#46464c', w, h);
    noise(g, w, h, 8);
    g.strokeStyle = '#53535a'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }), { material: 'wood' });

  /* ---- exterior ---- */
  M.brick = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#7a4f42', w, h);
    speckle(g, w, h, 700, ['#6d463a', '#85584a', '#5f3d33']);
    bond(g, w, h, 8, 4, '#b8ada0', 1);
    noise(g, w, h, 10);
    grime(g, w, h, 0.2, 18);
  }), { material: 'stone' });

  M.paving = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#54544f', w, h);
    speckle(g, w, h, 900, ['#5d5d57', '#4b4b46', '#66665f']);
    grid(g, w, h, 2, 2, '#43433e', 1);
    noise(g, w, h, 12);
  }), { material: 'stone' });

  M.grass = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#3c4a30', w, h);
    speckle(g, w, h, 1600, ['#455536', '#33422a', '#4d5f3b', '#2c3824']);
    noise(g, w, h, 14);
  }), { material: 'grass' });

  /* ---- glazing. F_BLEND at draw time; the texture is the reflection. ---- */
  M.glass = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#2a3540', w, h);
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(160,190,215,0.55)');
    gr.addColorStop(0.5, 'rgba(60,80,100,0.25)');
    gr.addColorStop(1, 'rgba(130,160,190,0.45)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6);
  }), { material: 'stone' });

  /* ---- joinery: door leaves, frames, sills, railings ---- */
  M.door = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#6d5638', w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`;
      g.lineWidth = 1;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 6, h); g.stroke();
    }
    g.strokeStyle = '#4e3d28'; g.lineWidth = 3;
    g.strokeRect(6, 6, w - 12, h - 12);
    noise(g, w, h, 9);
  }), { material: 'wood' });

  M.trim = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#8a8378', w, h);
    noise(g, w, h, 8);
    g.strokeStyle = '#6f6960'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }), { material: 'wood' });

  M.metal = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#5b5f63', w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    noise(g, w, h, 7);
  }), { material: 'metal' });

  /* ---- a light fitting, drawn with F_EMIT so it ignores the shading ---- */
  M.lamp = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#efeade', w, h);
    g.fillStyle = 'rgba(200,200,180,.5)';
    for (let i = 0; i < h; i += 6) g.fillRect(0, i, w, 1);
  }), { density: 32, material: 'metal' });

  /* ---- developer props: flat, obviously fake, obviously temporary ---- */
  M.propA = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#8a6a2e', w, h);
    grid(g, w, h, 2, 2, '#a07e3c', 1);
    noise(g, w, h, 10);
  }), { density: 32, material: 'wood' });

  M.propB = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#2f5a6a', w, h);
    grid(g, w, h, 2, 2, '#3d7288', 1);
    noise(g, w, h, 10);
  }), { density: 32, material: 'metal' });

  /** A labelled plate, for calling out what a piece of test geometry is for. */
  M.sign = (text) => mat(makeTex(128, 32, (g, w, h) => {
    fill(g, '#1d1d20', w, h);
    g.strokeStyle = '#8d8d3a'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    label(g, text, w / 2, h / 2 + 1, '#d8d2a8', 'bold 13px "Courier New", monospace');
  }), { density: 96, material: 'metal' });

  return M;
}
