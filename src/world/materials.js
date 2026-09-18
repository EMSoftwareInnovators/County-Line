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
import { makeTex, mipChain, fill, noise, speckle, grid, bond, grime, label } from '../engine/texture.js';

/** texels per meter for the standard greybox grid: one line every 0.5 m. */
const D = 64;

/**
 * Every material gets a mip chain. It is three box-filtered halvings, it
 * costs a fraction of a millisecond at boot and about a third more
 * texture memory, and it is the difference between a floor you can look
 * along and a floor that crawls. See mipChain() in texture.js.
 *
 * `noMip` is for anything read as information rather than as surface --
 * lettering on a sign, a destination roll -- where a blurred level is
 * worse than an aliased one.
 */
const mat = (tex, opts = {}) => ({
  tex: opts.noMip ? tex : mipChain(tex),
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

  /* ============================================================
     THE EXTERIOR, REWORKED IN STAGE 2.1

     The first pass made the walls brown and busy. The photographs show
     something else entirely: a PALE, WARM GRAY ashlar, laid in clearly
     readable horizontal courses, with darker recessed joints and very
     little else going on. The building is weathered, not derelict -- in
     1998 it is in public use -- so the grime is restrained and there is
     no soot, no stain and no ruin.

     The other rule here is resolution. At 320x240 a wall is a few dozen
     pixels across, and any texture with energy above about a quarter of
     its own tile turns into static under the dither. So: large features,
     low contrast between them, and almost no noise.
     ============================================================ */

  /** Ashlar courses, five feet to a tile: four courses of fifteen inches
      with staggered perpends. */
  const ashlar = (base, joint, dark, weather) => makeTex(64, 64, (g, w, h) => {
    fill(g, base, w, h);
    /* Four courses. Each gets a faint tone of its own so the wall reads as
       laid rather than as painted. */
    const tones = [base, dark, base, dark];
    for (let i = 0; i < 4; i++) {
      g.fillStyle = tones[i]; g.fillRect(0, i * 16, w, 16);
    }
    /* Bed joints: recessed, so a shadow rather than a line. */
    g.fillStyle = joint;
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16, w, 1);
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 16 + 1, w, 1);
    /* Perpends, staggered course to course. */
    g.fillStyle = joint;
    for (let i = 0; i < 4; i++) {
      const off = (i % 2) * 16;
      for (let x = off; x < w; x += 32) g.fillRect(x, i * 16, 1, 16);
    }
    noise(g, w, h, 4);
    grime(g, w, h, weather, 10);
  });

  M.ashlar = mat(ashlar('#b9b6ad', '#8f8c84', '#b3b0a7', 0.07), { density: 42, material: 'stone' });
  /** The same wall lower down and on the garden faces, where the rain
      runs. A shade deeper, and that is all. */
  M.ashlarWorn = mat(ashlar('#adaaa1', '#847f77', '#a7a49b', 0.13), { density: 42, material: 'stone' });

  /* Kept under the old names so nothing has to be renamed twice; the
     building's walls are ashlar now and these are what it asks for. */
  M.stucco = M.ashlar;
  M.stuccoWorn = M.ashlarWorn;

  /** The terracotta the window surrounds and the corbel table are picked
      out in -- the one strong color on the whole elevation. */
  M.terracotta = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#9c6653', w, h);
    speckle(g, w, h, 120, ['#a56e5a', '#905e4c', '#aa7561']);
    noise(g, w, h, 5);
    grime(g, w, h, 0.1, 6);
  }), { density: 48, material: 'stone' });

  /** Painted ironwork and joinery: the portico columns, the entablature
      over them, the railings. A dark blue-gray, not black. */
  M.ironwork = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#575f66', w, h);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    noise(g, w, h, 4);
  }), { density: 48, material: 'metal' });

  /** White painted joinery: the interior columns, the wainscot cap, the
      window and door casings, the mantel. */
  M.paintWhite = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#e9e5db', w, h);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    noise(g, w, h, 3);
  }), { density: 48, material: 'wood' });

  /* -------- interior plaster, distempered, a century of it -------- */
  M.plaster = mat(makeTex(64, 64, (g, w, h) => {
    /* Near-white, not tan: every interior photograph shows plain white or
       cream distemper, with the color in the room coming from the joinery
       and the floor rather than from the walls. */
    fill(g, '#d5d0c4', w, h);
    speckle(g, w, h, 400, ['#dad5c9', '#cec9bd', '#e0dbcf']);
    noise(g, w, h, 4);
    /* Barely any. A plaster texture tiles every meter or so, and a dark
       radial blob repeated across a wall reads as a damp stain rather
       than as age -- which is exactly how the interiors looked. */
    grime(g, w, h, 0.035, 5);
  }), { material: 'stone' });

  /** A cooler, greener distemper, so adjoining rooms are told apart. */
  /* Two more distempers, enough to tell one room from the next -- but
     BARELY tinted. Stage 2 had these at full strength, which made the
     rooms read as painted in three flat colors; the photographs show
     white walls everywhere and the color in a room coming from the floor
     and the joinery. */
  M.plasterGreen = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#cbd0c4', w, h);
    speckle(g, w, h, 400, ['#d0d5c9', '#c4c9bd', '#d6dbcf']);
    noise(g, w, h, 4);
    grime(g, w, h, 0.035, 5);
  }), { material: 'stone' });

  M.plasterOchre = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#dbd4c2', w, h);
    speckle(g, w, h, 400, ['#e0d9c7', '#d4cdbb', '#e5dece']);
    noise(g, w, h, 4);
    grime(g, w, h, 0.035, 5);
  }), { material: 'stone' });

  /** Plain plastered ceiling. Not used in the Academy -- its ceilings are
      beaded board -- but kept for a later interior that has one, and it
      is what a flat ceiling should look like: a step below the wall
      plaster, because vertex lighting gives a flat white ceiling nothing
      to separate it from a flat white wall and the room turns to fog. */
  M.plasterCeiling = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#c5c1b6', w, h);
    speckle(g, w, h, 300, ['#cac6bb', '#c0bcb1']);
    noise(g, w, h, 3);
    grime(g, w, h, 0.08, 14);
  }), { material: 'stone' });

  /* -------- beadboard: narrow boards with a bead between each --------
     THE CEILINGS IN THIS BUILDING ARE BEADED BOARD, and so is the
     wainscot -- the same boards, painted. Which way they run is
     architectural information, so the texture is directional and the
     level lays it with the run of the room.

     A step down in value from the wall plaster, so that a beaded ceiling
     over a white wall still reads as a ceiling under vertex lighting. */
  M.beadboard = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#c6bfae', w, h);
    /* Sixteen pixels to a board, not eight. At eight the bead pitch lands
       near the pixel grid at ordinary viewing distance and the whole
       wainscot shimmers with chroma fringing; at sixteen it reads as
       boards. Board width beats board count. */
    /* Low contrast on purpose. The seam and the bead only have to survive
       being drawn a few pixels wide through an affine mapping; push them
       any harder and a beaded ceiling reads as diagonal streaks across
       the whole room rather than as boards. */
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = 'rgba(0,0,0,.085)'; g.fillRect(x, 0, 1, h);       // the seam
      g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x + 1, 0, 1, h);
      g.fillStyle = 'rgba(0,0,0,.04)'; g.fillRect(x + 7, 0, 1, h);    // the bead
      g.fillStyle = 'rgba(255,255,255,.03)'; g.fillRect(x + 8, 0, 1, h);
    }
    noise(g, w, h, 4);
    grime(g, w, h, 0.05, 5);
  }), { material: 'wood' });

  /* -------- heart pine floorboards -------- */
  M.heartPine = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#7c5f3e', w, h);
    /* WIDE PLANK, four boards to the meter. Eight was a twelve-centimeter
       board with a hard one-texel black seam between each -- the highest
       contrast feature on the largest surface in the building, repeating
       at the one frequency a grazing view cannot resolve. A ten-inch
       plank is also what an 1802 building has. */
    for (let i = 0; i < 4; i++) {
      g.fillStyle = ['#7f6240', '#775a3a', '#856844', '#725637'][i];
      g.fillRect(0, i * 16, w, 16);
    }
    /* GRAIN AT TWO LINES PER TEXEL IS NOT GRAIN, IT IS NOISE. Drawn at
       130 lines in sixty-four rows, the floor carried more detail than
       the framebuffer can hold, and at a grazing angle -- which is how a
       floor is always seen -- it beat against the sampling grid into
       moving chevrons. That was most of what read as the floor swimming,
       and it is not something perspective correction or mipmaps can fix,
       because the texture itself is the aliasing. Forty soft lines read
       as heart pine and survive being looked along. */
    for (let i = 0; i < 40; i++) {                  // grain
      g.strokeStyle = `rgba(60,40,22,${0.04 + Math.random() * 0.06})`;
      g.lineWidth = 1;
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (Math.random() - 0.5) * 2); g.stroke();
    }
    g.strokeStyle = 'rgba(75,56,31,0.55)'; g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = i * 16;
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
    }
    noise(g, w, h, 5);
    grime(g, w, h, 0.16, 10);
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

  /** A four-panel leaf. `paint` swaps the stain for the white the
      interior photographs show on every door inside the building; the
      exterior leaves stay timber. */
  const leaf = (base, panel, high) => makeTex(64, 64, (g, w, h) => {
    fill(g, base, w, h);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.04})`;
      const x = Math.random() * w;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (Math.random() - 0.5) * 4, h); g.stroke();
    }
    g.strokeStyle = panel; g.lineWidth = 3;
    g.strokeRect(9, 5, w - 18, 22);
    g.strokeRect(9, 36, w - 18, 22);
    g.strokeStyle = high; g.lineWidth = 1;
    g.strokeRect(11, 7, w - 22, 18);
    g.strokeRect(11, 38, w - 22, 18);
    noise(g, w, h, 4);
  });
  M.doorPainted = mat(leaf('#d9d4c8', '#bdb8ac', 'rgba(255,255,255,.5)'),
    { material: 'wood' });

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
  /* -------- sash glazing --------
     The muntins are IN THE TEXTURE, at a density that puts a pane about
     fourteen inches across. Modelling a twelve-over-twelve sash as
     geometry would be four hundred boxes across the building for
     something two pixels wide at the resolution this runs at; the
     physical part of a window is its frame, its meeting rail and its deep
     reveal, and those are built in parts.js.

     The tile is two panes square with the bars on its own edges, so it
     tiles on a muntin and there is no seam. */
  const PANE = 0.356;                       // about fourteen inches
  M.windowGlass = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#2a3540', w, h);
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, 'rgba(165,188,210,0.40)');
    gr.addColorStop(0.5, 'rgba(60,78,94,0.20)');
    gr.addColorStop(1, 'rgba(130,155,178,0.34)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9c4b8';                // painted bars, not dark
    for (const x of [0, 31, 62]) g.fillRect(x, 0, 2, h);
    for (const y of [0, 31, 62]) g.fillRect(0, y, w, 2);
    g.fillStyle = 'rgba(0,0,0,.22)';
    for (const x of [2, 33]) g.fillRect(x, 0, 1, h);
    for (const y of [2, 33]) g.fillRect(0, y, w, 1);
    noise(g, w, h, 3);
  }), { density: 64 / (2 * PANE), material: 'stone' });

  /** The sash itself: stiles, rails and the meeting rail, painted the
      same off-white as the bars. */
  M.sashFrame = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#cdc8bc', w, h);
    for (let i = 0; i < 14; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.04})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    noise(g, w, h, 3);
  }), { density: 64, material: 'wood' });

  M.roofSlate = mat(makeTex(64, 64, (g, w, h) => {
    fill(g, '#4b4e52', w, h);
    speckle(g, w, h, 900, ['#53565b', '#43464a', '#5b5e63']);
    noise(g, w, h, 8);
  }), { material: 'stone' });

  /* ============================================================
     THE ELECTRICAL RETROFIT

     Everything below was screwed to an 1802 building by somebody in a
     hurry, in one of four decades, and looks it.
     ============================================================ */

  /** Painted steel: fixture bodies, surface boxes, breaker cabinets. */
  M.fixtureMetal = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#54565a', w, h);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
      g.fillRect(0, Math.random() * h, w, 1);
    }
    grime(g, w, h, 0.1, 6);
    noise(g, w, h, 4);
  }), { density: 64, material: 'metal' });

  /** White vitreous enamel, gone yellow: pendant shades, porcelain bases. */
  M.fixtureEnamel = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#ded6c2', w, h);
    speckle(g, w, h, 40, ['#e6dfcc', '#cfc6b1']);
    grime(g, w, h, 0.14, 7);
    noise(g, w, h, 3);
  }), { density: 64, material: 'stone' });

  /** A lit lamp. Deliberately nearly flat: the brightness is the shade
      bias the fitting draws it with, not the texture. See fittings.js. */
  M.lampGlass = mat(makeTex(16, 16, (g, w, h) => {
    fill(g, '#fff6dd', w, h);
    speckle(g, w, h, 12, ['#fffaea', '#f4e8cb']);
  }), { density: 48, material: 'glass' });

  /** Half-inch EMT and its straps, run on the surface of the plaster. */
  M.conduit = mat(makeTex(16, 16, (g, w, h) => {
    fill(g, '#6d6f72', w, h);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, i * 4, w, 1);
    }
    noise(g, w, h, 4);
  }), { density: 96, material: 'metal' });

  /** The gray of a panel schedule card, and of a typed label strip. */
  M.panelGray = mat(makeTex(32, 32, (g, w, h) => {
    fill(g, '#9a9a96', w, h);
    grime(g, w, h, 0.1, 5);
    noise(g, w, h, 5);
  }), { density: 64, material: 'metal' });

  /** A labelled plate, for calling out what a piece of test geometry is for. */
  M.sign = (text) => mat(makeTex(128, 32, (g, w, h) => {
    fill(g, '#1d1d20', w, h);
    g.strokeStyle = '#8d8d3a'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
    label(g, text, w / 2, h / 2 + 1, '#d8d2a8', 'bold 13px "Courier New", monospace');
  }), { density: 96, material: 'metal' });

  return M;
}
