/* ============================================================
   actor.js -- the generic low-poly humanoid, and the rig that walks it.

   Final Rental's actor.js is a good piece of work and the TECHNIQUE is
   carried over wholesale: a body is not boxes, it is a stack of
   cross-sections skinned into a tapered faceted solid, which is how PS1
   character meshes were actually built and why they read as people at
   forty pixels tall.

   What is NOT carried over is everything that made it Final Rental's.
   That file built one torso variant per gender and build, wore an
   appearance atlas of hair colors, jackets, hats and facial hair, and
   did so because the whole game was a witness describing a suspect: a
   body's silhouette was evidence. County Line's people are passengers and
   staff. They need to walk, stand, sit and carry things. The trait
   system, the atlas and the decoy-appearance machinery all belong to the
   other game and none of it is here.

   What is here is a body, four limbs, a walk cycle and an idle -- enough
   to prove an NPC can be placed, animated, drawn and interacted with,
   which is all Stage 1 is claiming.
   ============================================================ */
import { MeshBuilder } from '../engine/mesh.js';
import { mat, mul, setPosYaw, setRotX, setRotY, setRotZ, setScale, setTranslate } from '../engine/mathx.js';
import { ftin } from '../engine/units.js';

/* Body metrics for a 5 ft 9 in adult, in meters. */
const HIP_Y = 0.90, LEG_LEN = 0.78, SHOE_H = 0.08;
const TORSO_H = 0.60, TORSO_W = 0.20, TORSO_D = 0.125;
const SHOULDER_Y = 1.42, ARM_LEN = 0.58, ARM_R = 0.055;
const HEAD_Y = 1.49, HEAD_H = 0.255, HEAD_W = 0.098, HEAD_D = 0.105;

export const ACTOR_HEIGHT = HEAD_Y + HEAD_H;   // 1.745
export const ACTOR_RADIUS = ftin(0, 9);        // 0.2286

/* Cross-sections, traversed front-left -> front-right -> round the right
   side to the back and home. Side i spans point i to point i+1. */
const SEC8 = [
  [-0.62, 1.00], [0.62, 1.00],     // flat front panel: the chest, the face
  [1.00, 0.30], [1.00, -0.42],
  [0.55, -1.00], [-0.55, -1.00],
  [-1.00, -0.42], [-1.00, 0.30],
];
const SEC5 = [[-0.72, 0.92], [0.72, 0.92], [1.00, -0.28], [0.00, -1.00], [-1.00, -0.28]];

const uv = (r) => [r[0], r[1], r[0] + r[2], r[1] + r[3]];

/**
 * Build the parts once, at boot. Every actor in the level shares them;
 * only the matrices differ.
 *
 * @param skin a texture whose regions the parts are cut from, plus the
 *             atlas rects. See makeActorSkin().
 */
export function buildActorMeshes(skin) {
  const flat = () => { const b = new MeshBuilder([skin.tex]); b.light = () => 1; return b; };
  const F = (rect, flags) => ({ tex: 0, uv: uv(rect), flags: flags | 0 });
  const A = skin.atlas;
  const M = {};

  /* ---- torso: shoulders wider than the waist, chest deeper than both ---- */
  {
    const b = flat();
    b.loft([
      { y: HIP_Y - 0.03, w: TORSO_W * 0.98, d: TORSO_D * 0.98 },
      { y: HIP_Y + 0.18, w: TORSO_W * 0.90, d: TORSO_D * 0.92 },
      { y: HIP_Y + 0.40, w: TORSO_W * 1.02, d: TORSO_D * 1.06 },
      { y: SHOULDER_Y, w: TORSO_W * 1.08, d: TORSO_D * 1.00 },
      { y: SHOULDER_Y + 0.05, w: TORSO_W * 0.86, d: TORSO_D * 0.82 },
    ], SEC8,
    [F(A.chest), F(A.body), F(A.body), F(A.back), F(A.back), F(A.back), F(A.body), F(A.body)],
    { top: F(A.body), bottom: F(A.body) });
    M.torso = b.build();
  }

  /* ---- hips ---- */
  {
    const b = flat();
    b.loft([
      { y: HIP_Y - 0.26, w: TORSO_W * 0.86, d: TORSO_D * 0.92 },
      { y: HIP_Y + 0.02, w: TORSO_W * 0.98, d: TORSO_D * 0.98 },
    ], SEC8, [F(A.legs)], { bottom: F(A.legs) });
    M.hips = b.build();
  }

  /* ---- head: eight sides with a flat panel for the face ---- */
  {
    const b = flat();
    b.loft([
      { y: HEAD_Y - 0.07, w: HEAD_W * 0.60, d: HEAD_D * 0.60 },   // neck
      { y: HEAD_Y, w: HEAD_W * 0.92, d: HEAD_D * 0.94 },
      { y: HEAD_Y + HEAD_H * 0.55, w: HEAD_W, d: HEAD_D },
      { y: HEAD_Y + HEAD_H, w: HEAD_W * 0.74, d: HEAD_D * 0.78 },
    ], SEC8,
    [F(A.face), F(A.hair), F(A.hair), F(A.hair), F(A.hair), F(A.hair), F(A.hair), F(A.hair)],
    { top: F(A.hair) });
    M.head = b.build();
  }

  /* ---- limbs. Built hanging from the origin so a rotation about it is a
     shoulder or a hip. ---- */
  const limb = (len, r0, r1, face) => {
    const b = flat();
    b.loft([
      { y: -len, w: r1, d: r1 },
      { y: -len * 0.55, w: (r0 + r1) * 0.5, d: (r0 + r1) * 0.5 },
      { y: 0, w: r0, d: r0 },
    ], SEC5, [F(face)], { top: F(face), bottom: F(face) });
    return b.build();
  };
  M.arm = limb(ARM_LEN, ARM_R, ARM_R * 0.72, A.arms);
  M.leg = limb(LEG_LEN - SHOE_H, 0.082, 0.056, A.legs);

  /* ---- shoe ---- */
  {
    const b = flat();
    b.box(-0.055, 0, -0.075, 0.055, SHOE_H, 0.115, { all: F(A.shoe) });
    M.shoe = b.build();
  }
  return M;
}

/**
 * WARDROBES. A 64x64 sheet apiece, six flat regions, no faces: these
 * are still not characters, and at this internal resolution a face
 * would be four pixels of mud. What they are is TELLABLE APART, which
 * a terminal with fifteen people in it needs and a test level with one
 * actor in it did not.
 *
 * Each entry is a coat, a shirt, pants and hair. The palette is
 * 1998 and Georgia in October: denim, work green, a raincoat, a
 * uniform, a good overcoat. Nothing is bright, because nothing in this
 * building is.
 */
export const WARDROBE = [
  { coat: '#4d6070', shirt: '#46586a', legs: '#3a4450', hair: '#3b3129', skin: '#9c7f6a', brow: 2, beard: 0, specs: 0 },
  { coat: '#5a4a3a', shirt: '#6d6152', legs: '#33302c', hair: '#221c17', skin: '#8a6a52', brow: 3, beard: 2, specs: 0 },
  { coat: '#3f4f3c', shirt: '#4a5a46', legs: '#2f3630', hair: '#4a3b2a', skin: '#b3917a', brow: 1, beard: 0, specs: 1 },
  { coat: '#6a6257', shirt: '#7b7469', legs: '#41403c', hair: '#6b6258', skin: '#c2a289', brow: 2, beard: 1, specs: 1 },
  { coat: '#2f3b4a', shirt: '#3a4757', legs: '#262d38', hair: '#1d1a17', skin: '#7b5c44', brow: 3, beard: 0, specs: 0 },
  { coat: '#6d4a44', shirt: '#7d5a52', legs: '#3c3330', hair: '#3a2b22', skin: '#a98567', brow: 2, beard: 3, specs: 0 },
  { coat: '#414a54', shirt: '#8d8676', legs: '#2b2f36', hair: '#5d5347', skin: '#6f5138', brow: 2, beard: 0, specs: 1 },
  { coat: '#7a6a4e', shirt: '#8c8163', legs: '#494234', hair: '#2b2118', skin: '#c9ab92', brow: 1, beard: 1, specs: 0 },
  { coat: '#34424a', shirt: '#5f7078', legs: '#272e33', hair: '#6e5a3f', skin: '#8e6f55', brow: 3, beard: 2, specs: 0 },
  { coat: '#5b4756', shirt: '#6d5a66', legs: '#37303a', hair: '#8a7b68', skin: '#b9977c', brow: 1, beard: 0, specs: 0 },
  { coat: '#4a5240', shirt: '#7d8168', legs: '#31352b', hair: '#3f3226', skin: '#a07c5e', brow: 2, beard: 1, specs: 1 },
  { coat: '#63504a', shirt: '#9a8d7c', legs: '#3a322e', hair: '#151312', skin: '#74573f', brow: 3, beard: 0, specs: 0 },
];

/* ============================================================
   BUILDS

   THE SAME BODY TWELVE TIMES IS STILL ONE PERSON. Six wardrobes on one
   mesh at one size read as a uniform, not a crowd -- and a coach
   terminal is a crowd or it is nothing. The mesh stays shared, because
   building a dozen of them would cost a dozen times the memory for
   something nobody can see at this resolution; what varies is the
   SCALE it is drawn at, non-uniformly, which is enough to tell two
   people apart across a lobby and costs one matrix multiply.

   `h` is overall height and `w` is how wide and deep through the body.
   The ranges are real: 5'2" to 6'2" is a spread you would see in a
   waiting room, and a stockier person is not a taller person.
   ============================================================ */
export const BUILDS = [
  { id: 'slight', h: 0.94, w: 0.88 },
  { id: 'short', h: 0.92, w: 1.05 },
  { id: 'average', h: 1.00, w: 1.00 },
  { id: 'lean', h: 1.05, w: 0.90 },
  { id: 'broad', h: 1.01, w: 1.16 },
  { id: 'tall', h: 1.08, w: 0.97 },
  { id: 'heavy', h: 0.97, w: 1.22 },
  { id: 'rangy', h: 1.11, w: 0.92 },
];

/** How tall and how wide somebody of this build actually is. */
export function bodyOf(n) {
  const b = BUILDS[((n | 0) % BUILDS.length + BUILDS.length) % BUILDS.length];
  return { ...b, height: ACTOR_HEIGHT * b.h, r: ACTOR_RADIUS * b.w };
}

/* ============================================================
   A FACE, AT SIXTEEN PIXELS

   The old comment here said a face would be four pixels of mud at this
   resolution and left the panel a flat patch of skin. It was half
   right: a face DRAWN LIKE A FACE is mud. What is not mud is three or
   four marks placed where the eye expects them -- two dark dots, a brow
   above them, a mouth below -- because a head at forty pixels tall is
   read by arrangement, not detail. It is the same reason the chest
   panel has a placket down it.

   So every mark here is one or two pixels and none of them is shaded.
   What varies is where they sit: eyes close or wide, brows heavy or
   thin, a beard, a moustache, glasses. Twelve wardrobes times the
   spacing variations is enough that two people in a line are two
   people.
   ============================================================ */
function paintFace(g, rect, w, n) {
  const [fx, fy, fw] = rect;
  const px = (x, y, css, ww = 1, hh = 1) => {
    g.fillStyle = css;
    g.fillRect(fx + x, fy + y, ww, hh);
  };
  const ink = '#1b1713';
  const hair = w.hair;
  /* the head is widest across the middle, so the features sit high:
     eyes a little above center is what reads as a face and not a mask */
  const wide = 1 + (n % 3);                 // 1..3 px either side of center
  const mid = fw / 2;
  const eyeY = 6;

  /* hairline across the top of the panel, which is what makes the
     difference between a head and an egg */
  const drop = 2 + (n % 2);
  px(1, 0, hair, fw - 2, drop);
  if (n % 4 === 0) px(1, drop, hair, 3, 1);          // a widow's peak
  if (n % 5 === 0) px(fw - 4, drop, hair, 3, 1);

  /* brows */
  const browY = eyeY - 2;
  const bw = w.brow;                                  // 1 thin .. 3 heavy
  px(mid - wide - 2, browY, hair, 3, bw > 2 ? 2 : 1);
  px(mid + wide, browY, hair, 3, bw > 2 ? 2 : 1);

  /* eyes */
  px(mid - wide - 1, eyeY, ink, 2, 2);
  px(mid + wide, eyeY, ink, 2, 2);

  /* glasses, over the top of them */
  if (w.specs) {
    px(mid - wide - 2, eyeY - 1, ink, 4, 1);
    px(mid + wide - 1, eyeY - 1, ink, 4, 1);
    px(mid - wide - 2, eyeY + 2, ink, 4, 1);
    px(mid + wide - 1, eyeY + 2, ink, 4, 1);
    px(mid - 1, eyeY, ink, 2, 1);
  }

  /* nose: one pixel of shadow, which at this size is plenty */
  px(mid - 1, eyeY + 3, dimOf(w.skin), 1, 2);

  /* mouth, and whatever is growing around it */
  const mouthY = eyeY + 6;
  if (w.beard === 3) {
    px(2, mouthY - 2, hair, fw - 4, 6);               // full beard
    px(mid - 2, mouthY + 1, ink, 4, 1);
  } else if (w.beard === 2) {
    px(mid - 3, mouthY - 1, hair, 6, 2);              // moustache
    px(mid - 2, mouthY + 2, ink, 4, 1);
  } else if (w.beard === 1) {
    px(mid - 2, mouthY + 2, hair, 4, 2);              // goatee
    px(mid - 2, mouthY, ink, 4, 1);
  } else {
    px(mid - 2, mouthY, ink, 4, 1);
  }
}

/** A shade down from a color, for the one pixel of nose. */
function dimOf(css) {
  const v = parseInt(css.slice(1), 16);
  const r = Math.round(((v >> 16) & 255) * 0.72);
  const g2 = Math.round(((v >> 8) & 255) * 0.72);
  const b = Math.round((v & 255) * 0.72);
  return `#${((r << 16) | (g2 << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * One wardrobe as a sheet. `n` indexes WARDROBE; the driver's uniform
 * is the last one and gets the company stripe on the chest.
 */
export function makeActorSkin(makeTex, n = 0) {
  const w = WARDROBE[((n | 0) % WARDROBE.length + WARDROBE.length) % WARDROBE.length];
  const atlas = {
    chest: [0, 0, 32, 32], back: [32, 0, 32, 32],
    body: [0, 32, 16, 32], arms: [16, 32, 16, 32],
    legs: [32, 32, 16, 32], shoe: [48, 32, 16, 16],
    face: [48, 0, 16, 16], hair: [48, 16, 16, 16],
  };
  const dark = (css, k) => {
    const v = parseInt(css.slice(1), 16);
    const r = Math.round(((v >> 16) & 255) * k);
    const g2 = Math.round(((v >> 8) & 255) * k);
    const b = Math.round((v & 255) * k);
    return `#${((r << 16) | (g2 << 8) | b).toString(16).padStart(6, '0')}`;
  };
  const tex = makeTex(64, 64, (g) => {
    const put = (r, css) => { g.fillStyle = css; g.fillRect(r[0], r[1], r[2], r[3]); };
    put(atlas.chest, w.coat);
    put(atlas.back, dark(w.coat, 0.86));
    put(atlas.body, w.shirt);
    put(atlas.arms, w.coat);
    put(atlas.legs, w.legs);
    put(atlas.shoe, '#23262a');
    put(atlas.face, w.skin);
    put(atlas.hair, w.hair);
    paintFace(g, atlas.face, w, n);
    /* A placket down the chest panel, so which way somebody is facing
       is unmistakable from across a very large room. */
    g.fillStyle = dark(w.shirt, 0.72);
    g.fillRect(atlas.chest[0] + 14, atlas.chest[1] + 4, 4, 24);
  });
  return { tex, atlas };
}

/* ============================================================
   THE RIG
   ============================================================ */

export function makeAnim() {
  return {
    phase: Math.random() * 6.28,
    legSwing: 0, armL: 0, armR: 0, armRz: 0,
    lean: 0, bob: 0, headYaw: 0, headPitch: 0,
    crouch: 0, reach: 0, sit: 0,
  };
}

/**
 * @param moveSpeed meters per second, for choosing a cadence
 * @param opt { reach, talking, sitting, headYaw, headPitch }
 */
export function updateAnim(an, dt, moveSpeed, opt = {}) {
  const k = (rate) => Math.min(1, dt * rate);

  an.sit += ((opt.sitting ? 1 : 0) - an.sit) * k(6);

  if (moveSpeed > 0.02 && an.sit < 0.3) {
    an.phase += dt * (5.2 + moveSpeed * 2.4);
    const amp = Math.min(0.62, moveSpeed * 0.46);
    an.legSwing = Math.sin(an.phase) * amp;
    an.armL = -Math.sin(an.phase) * amp * 0.85;
    an.armR = Math.sin(an.phase) * amp * 0.85;
    an.bob = Math.abs(Math.sin(an.phase)) * 0.022 - 0.011;
    an.lean += (0.045 + moveSpeed * 0.012 - an.lean) * k(6);
  } else {
    an.phase += dt * 1.4;
    an.legSwing += (0 - an.legSwing) * k(8);
    an.bob = Math.sin(an.phase * 0.9) * 0.006;
    an.lean += (0.02 - an.lean) * k(5);
    const idle = Math.sin(an.phase * 0.7) * 0.03;
    an.armL += (idle - an.armL) * k(6);
    an.armR += (-idle - an.armR) * k(6);
  }

  if (opt.reach) {
    an.armR += (-1.35 - an.armR) * k(7);
    an.armRz += (0.28 - an.armRz) * k(7);
  } else {
    an.armRz += (0 - an.armRz) * k(6);
  }

  if (opt.talking) {
    an._talkT = (an._talkT || 0) + dt * 9;
    an.headPitch = Math.sin(an._talkT) * 0.07;
    an.headYaw += ((Math.sin(an._talkT * 0.31) * 0.14) - an.headYaw) * k(4);
  } else {
    an.headPitch += ((opt.headPitch || 0) - an.headPitch) * k(5);
    an.headYaw += ((opt.headYaw || 0) - an.headYaw) * k(5);
  }
}

/* Scratch matrices. Drawing is single-threaded and one actor at a time. */
const _b = mat(), _t = mat(), _r = mat(), _m = mat();

/**
 * Draw one actor.
 * @param a { x, y, z, yaw, anim }   y is the floor under their feet
 */
export function drawActor(rz, M, a, shade) {
  if (!rz.sphereVisible(a.x, a.y + 0.9, a.z, 1.2)) return;
  const an = a.anim;
  const sit = an.sit;
  /* Sitting drops the hips and folds the legs forward. One number, because
     a chair is a pose and not a second rig. */
  const drop = sit * 0.44;
  setPosYaw(_b, a.x, a.y + an.bob - drop, a.z, a.yaw);
  setRotX(_r, -an.lean * (1 - sit) + sit * 0.06);
  mul(_b, _b, _r);
  /* BUILD. One non-uniform scale on the root, so a shared mesh comes
     out as somebody short and wide or tall and spare. It has to be
     applied here rather than baked, because every actor in the level
     draws the same twelve meshes. See BUILDS. */
  if (a.build) {
    setScale(_r, a.build.w, a.build.h, a.build.w);
    mul(_b, _b, _r);
  }
  const opt = { shade };

  const part = (mesh, fn) => {
    _m.set(_b);
    fn(_m);
    rz.drawMesh(mesh, _m, opt);
  };

  part(M.hips, () => {});
  part(M.torso, () => {});
  part(M.head, (m) => {
    setTranslate(_t, 0, HEAD_Y - 0.02, 0); mul(m, m, _t);
    setRotY(_r, an.headYaw); mul(m, m, _r);
    setRotX(_r, an.headPitch); mul(m, m, _r);
    setTranslate(_t, 0, -(HEAD_Y - 0.02), 0); mul(m, m, _t);
  });

  const arm = (side, swing, roll) => part(M.arm, (m) => {
    setTranslate(_t, side * (TORSO_W * 1.06), SHOULDER_Y - 0.02, 0); mul(m, m, _t);
    setRotX(_r, swing); mul(m, m, _r);
    setRotZ(_r, side * roll); mul(m, m, _r);
  });
  arm(-1, an.armL, 0.08);
  arm(1, an.armR, 0.08 + an.armRz);

  const leg = (side, swing) => {
    const s = swing * (1 - sit) + sit * -1.35;
    part(M.leg, (m) => {
      setTranslate(_t, side * 0.075, HIP_Y - 0.24, 0); mul(m, m, _t);
      setRotX(_r, s); mul(m, m, _r);
    });
    part(M.shoe, (m) => {
      const fy = HIP_Y - 0.24 - Math.cos(s) * (LEG_LEN - SHOE_H);
      const fz = Math.sin(s) * (LEG_LEN - SHOE_H);
      setTranslate(_t, side * 0.075, fy, fz); mul(m, m, _t);
      setRotX(_r, s * 0.25 + sit * 1.2); mul(m, m, _r);
    });
  };
  leg(-1, an.legSwing);
  leg(1, -an.legSwing);
}
