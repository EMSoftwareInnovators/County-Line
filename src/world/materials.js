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

  /* ============================================================
     THE OLD ACADEMY SET

     Still restrained, still original, still not final art. These exist so
     that the reconstruction can be JUDGED -- so that plaster reads as
     plaster, a masonry wall reads as mass, and a beadboard ceiling reads
     as boards running one way. A building rendered entirely in developer
     gray cannot be assessed for architectural character, which is the
     whole point of this stage.

     Every one of them is painted at boot from code, like everything else
     in this game. Nothing here is traced from a photograph.
     ============================================================ */

  /* -------- stucco over brick, scored to imitate ashlar --------
     The real building is brick, stuccoed and scored in the 1856-57
     Tudor-Gothic remodelling. The scoring is what keeps a big blank wall
     from reading as a flat color at this resolution. */
  M.stucco = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#9d9385', w, h);
    speckle(g, w, h, 1500, ['#a79c8d', '#93897b', '#aaa094', '#8b8174']);
    noise(g, w, h, 10);
    // ashlar joints: two courses per tile, offset
    g.strokeStyle = '#847a6d'; g.lineWidth = 1;
    for (const y of [0, 32]) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    for (const [y, x] of [[0, 0], [0, 32], [32, 16], [32, 48]]) {
      g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke();
    }
    grime(g, w, h, 0.16, 16);
  }), { material: 'stone' });

  /** The same wall, weathered where the rain runs off. Used low down and
      on the garden faces, so the elevations are not one flat tone. */
  M.stuccoWorn = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#8e8477', w, h);
    speckle(g, w, h, 1500, ['#978d80', '#847a6d', '#9e9487']);
    noise(g, w, h, 12);
    g.strokeStyle = '#776d61'; g.lineWidth = 1;
    for (const y of [0, 32]) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    for (const [y, x] of [[0, 0], [0, 32], [32, 16], [32, 48]]) {
      g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 32); g.stroke();
    }
    grime(g, w, h, 0.3, 26);
  }), { material: 'stone' });

  /* -------- interior plaster, distempered, a century of it -------- */
  M.plaster = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#b3a992', w, h);
    speckle(g, w, h, 900, ['#bab08f', '#aca287', '#c0b69c']);
    noise(g, w, h, 8);
    grime(g, w, h, 0.1, 10);
  }), { material: 'stone' });

  /** A cooler, greener distemper, so adjoining rooms are told apart. */
  M.plasterGreen = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#9aa593', w, h);
    speckle(g, w, h, 900, ['#a3ae9b', '#909b89', '#aab5a2']);
    noise(g, w, h, 8);
    grime(g, w, h, 0.1, 10);
  }), { material: 'stone' });

  /** And a warmer one. Three distempers is enough to read a plan by. */
  M.plasterOchre = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#b8a279', w, h);
    speckle(g, w, h, 900, ['#c0aa81', '#b09a71', '#c6b089']);
    noise(g, w, h, 8);
    grime(g, w, h, 0.12, 10);
  }), { material: 'stone' });

  /* -------- beadboard: narrow boards with a bead between each --------
     The real ceilings are beaded board. Which way the boards run is
     architectural information, so the texture is directional and the
     level lays it with the run of the room. */
  M.beadboard = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#b6ad9b', w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(x, 0, 1, h);        // the seam
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(x + 1, 0, 1, h);
      g.fillStyle = 'rgba(0,0,0,.09)'; g.fillRect(x + 3, 0, 1, h);    // the bead
      g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x + 4, 0, 1, h);
    }
    noise(g, w, h, 7);
    grime(g, w, h, 0.1, 8);
  }), { material: 'wood' });

  /* -------- heart pine floorboards -------- */
  M.heartPine = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#7c5f3e', w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#7f6240', '#775a3a', '#856844', '#725637',
        '#806341', '#7a5d3c', '#886b47', '#745839'][i];
      g.fillRect(0, i * 8, w, 8);
    }
    for (let i = 0; i < 260; i++) {                 // grain
      g.strokeStyle = `rgba(60,40,22,${0.05 + Math.random() * 0.1})`;
      g.lineWidth = 1;
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 2); g.stroke();
    }
    g.strokeStyle = '#4b381f'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = i * 8;
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    }
    noise(g, w, h, 9);
    grime(g, w, h, 0.16, 14);
  }), { material: 'wood' });

  /* -------- painted joinery: skirting, chair rail, casing, doors -------- */
  M.trimDark = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#4a3a2b', w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke();
    }
    noise(g, w, h, 6);
  }), { density: 48, material: 'wood' });

  M.doorLeaf = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#5d472f', w, h);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.07})`;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 5, h); g.stroke();
    }
    // two raised panels, which is what a period four-panel door reads as
    g.strokeStyle = '#3d2d1c'; g.lineWidth = 3;
    g.strokeRect(9, 5, w - 18, 22);
    g.strokeRect(9, 36, w - 18, 22);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
    g.strokeRect(11, 7, w - 22, 18);
    g.strokeRect(11, 38, w - 22, 18);
    noise(g, w, h, 7);
  }), { material: 'wood' });

  /* -------- the porches -------- */
  /** Painted porch decking, laid in boards. */
  M.porchDeck = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#6f6a5c', w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = ['#726d5f', '#6a6558', '#767163', '#666155',
        '#736e60', '#6d6859', '#797464', '#686357'][i];
      g.fillRect(0, i * 8, w, 8);
    }
    g.strokeStyle = '#4e4a40'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      const y = i * 8;
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    }
    noise(g, w, h, 10);
    grime(g, w, h, 0.2, 18);
  }), { material: 'wood' });

  /** Granite: steps, plinth course, sills. */
  M.granite = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#7b7873', w, h);
    speckle(g, w, h, 2200, ['#868379', '#6f6c68', '#918d84', '#63605c']);
    noise(g, w, h, 14);
  }), { material: 'stone' });

  /** Painted cast iron, for the colonnade and the gallery railing. */
  M.castIron = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#3e4440', w, h);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    speckle(g, w, h, 60, ['#6b4a34', '#55483a']);   // a little rust
    noise(g, w, h, 6);
  }), { density: 48, material: 'metal' });

  /* -------- the grounds -------- */
  M.lawn = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#40502f', w, h);
    speckle(g, w, h, 2000, ['#485935', '#374628', '#516441', '#2f3c23']);
    noise(g, w, h, 16);
  }), { material: 'grass' });

  M.gardenGrass = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#455433', w, h);
    speckle(g, w, h, 2400, ['#4e5e3a', '#3b492c', '#586b45']);
    noise(g, w, h, 14);
    grime(g, w, h, 0.12, 10);
  }), { material: 'grass' });

  M.dirt = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#6a5a45', w, h);
    speckle(g, w, h, 1800, ['#73634c', '#60523f', '#7d6c53', '#564936']);
    noise(g, w, h, 14);
    grime(g, w, h, 0.18, 14);
  }), { material: 'grass' });

  M.shrub = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#31421f', w, h);
    speckle(g, w, h, 700, ['#3b4f26', '#2a3819', '#45592e']);
    noise(g, w, h, 18);
  }), { density: 40, material: 'grass' });

  M.walk = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#8a8378', w, h);
    speckle(g, w, h, 1400, ['#938c80', '#817a70', '#9c968a']);
    grid(g, w, h, 2, 2, '#756f66', 1);
    noise(g, w, h, 10);
    grime(g, w, h, 0.14, 12);
  }), { material: 'stone' });

  /* -------- glazing, and the roof -------- */
  M.windowGlass = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#1b2530', w, h);
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(150,175,200,0.42)');
    gr.addColorStop(0.55, 'rgba(45,62,78,0.22)');
    gr.addColorStop(1, 'rgba(120,145,170,0.36)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // glazing bars: a six-over-six sash, as near as 64 pixels will carry
    g.fillStyle = '#39332a';
    g.fillRect(20, 0, 2, h); g.fillRect(42, 0, 2, h);
    for (const y of [16, 32, 48]) g.fillRect(0, y, w, 2);
    noise(g, w, h, 5);
  }), { material: 'stone' });

  M.roofSlate = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#4b4e52', w, h);
    speckle(g, w, h, 900, ['#53565b', '#43464a', '#5b5e63']);
    noise(g, w, h, 8);
  }), { material: 'stone' });

  /** A labelled plate, for calling out what a piece of test geometry is for. */
  M.sign = (text) => mat(makeTex(128, 32, (g, w, h) => {
    fill(g, '#1d1d20', w, h);
    g.strokeStyle = '#8d8d3a'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    label(g, text, w / 2, h / 2 + 1, '#d8d2a8', 'bold 13px "Courier New", monospace');
  }), { density: 96, material: 'metal' });

  return M;
}
