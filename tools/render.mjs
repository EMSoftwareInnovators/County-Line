/* ============================================================
   render.mjs -- headless correctness checks on the rasterizer.

   Adapted from Final Rental's uvtest.mjs, which was one of the most
   useful things in that repository: it pins down texture orientation and
   face winding, so that "the sign is mirrored" and "I can see through the
   back of that wall" are caught by a test rather than by looking at a
   screenshot and wondering.

   Extended here for the things County Line's architecture depends on and
   Final Rental's store did not: the far plane being independent of the
   fog, the box-visibility test used to cull rooms, and automatic
   subdivision of large surfaces.
   ============================================================ */
import { Raster, F_DOUBLE, F_BLEND } from '../src/engine/raster.js';
import { MeshBuilder } from '../src/engine/mesh.js';
import { mat, setPosYaw, invertRigid } from '../src/engine/mathx.js';

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${label}: ${got}${ok ? '' : `   (expected ${want})`}`);
};
const section = (s) => console.log(`\n-- ${s} --`);

/* A 8x8 texture with a different color in each quadrant. */
const W = 8, H = 8;
const px = new Uint32Array(W * H);
const RED = 0xFF0000FF, GREEN = 0xFF00FF00, BLUE = 0xFFFF0000, WHITE = 0xFFFFFFFF;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    px[y * W + x] = y < 4 ? (x < 4 ? RED : GREEN) : (x < 4 ? BLUE : WHITE);
  }
}
const tex = { px, w: W, h: H, wMask: 7, hMask: 7, shift: 3 };

function view(camPos, camYaw, size = 64) {
  const rz = new Raster(size, size);
  rz.snap = 0;
  rz.setFog(100, 200);
  rz.far = 500;
  rz.clear(0xFF000000);
  const cam = mat(), v = mat();
  setPosYaw(cam, camPos[0], camPos[1], camPos[2], camYaw);
  invertRigid(v, cam);
  rz.setCamera(v, 1.2);
  return rz;
}

const NAMES = {
  [RED >>> 0]: 'RED(tex TL)', [GREEN >>> 0]: 'GREEN(tex TR)',
  [BLUE >>> 0]: 'BLUE(tex BL)', [WHITE >>> 0]: 'WHITE(tex BR)',
  0xFF000000: 'empty',
};
const name = (c) => NAMES[c >>> 0] || '0x' + (c >>> 0).toString(16);
const sample = (rz, x, y) => name(rz.color[y * rz.w + x]);
const drawn = (rz) => { let n = 0; for (const c of rz.color) if ((c >>> 0) !== 0xFF000000) n++; return n; };

/* ============================================================ */
section('texture orientation');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  // bottom-left, bottom-right, top-right, top-left, in world +X order
  mb.quad([-1, 0, 0], [1, 0, 0], [1, 2, 0], [-1, 2, 0], tex, [0, 0, 8, 8], 0, [1, 1, false]);
  const mesh = mb.build();
  const rz = view([0, 1, 4], Math.PI);
  rz.drawMesh(mesh, mat(), {});
  check('screen top-left    -> texture top-left', sample(rz, 25, 25), 'RED(tex TL)');
  check('screen top-right   -> texture top-right', sample(rz, 39, 25), 'GREEN(tex TR)');
  check('screen bottom-left -> texture bottom-left', sample(rz, 25, 39), 'BLUE(tex BL)');
  check('screen bottom-right-> texture bottom-right', sample(rz, 39, 39), 'WHITE(tex BR)');
}

section('face culling');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  mb.quad([-1, 0, 0], [1, 0, 0], [1, 2, 0], [-1, 2, 0], tex, [0, 0, 8, 8], 0, [1, 1, false]);
  const mesh = mb.build();
  const rz = view([0, 1, -4], 0);
  rz.drawMesh(mesh, mat(), {});
  check('a wall seen from behind is culled', drawn(rz) === 0 ? 'culled' : `drew ${drawn(rz)}px`, 'culled');

  const mb2 = new MeshBuilder();
  mb2.light = () => 1;
  mb2.quad([-1, 0, 0], [1, 0, 0], [1, 2, 0], [-1, 2, 0], tex, [0, 0, 8, 8], F_DOUBLE, [1, 1, false]);
  const rz2 = view([0, 1, -4], 0);
  rz2.drawMesh(mb2.build(), mat(), {});
  check('unless it is marked double-sided', drawn(rz2) > 0 ? 'drew' : 'culled', 'drew');
}

section('boxes');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  mb.box(-1, 0, -0.5, 1, 2, 0.5, { all: { tex, uv: [0, 0, 8, 8] } });
  const mesh = mb.build();
  for (const [label, pos, yaw] of [
    ['+Z side', [0, 1, 4], Math.PI],
    ['-Z side', [0, 1, -4], 0],
    ['+X side', [4, 1, 0], -Math.PI / 2],
    ['-X side', [-4, 1, 0], Math.PI / 2],
  ]) {
    const rz = view(pos, yaw);
    rz.drawMesh(mesh, mat(), {});
    const top = sample(rz, 27, 24), bottom = sample(rz, 27, 40);
    const left = sample(rz, 27, 24), right = sample(rz, 38, 24);
    check(`a box's ${label} is not mirrored`,
      (left === 'RED(tex TL)' && right === 'GREEN(tex TR)') ? 'correct' : `${left}/${right}`, 'correct');
    check(`a box's ${label} is not upside down`,
      (top === 'RED(tex TL)' && bottom === 'BLUE(tex BL)') ? 'upright' : `${top}/${bottom}`, 'upright');
  }
}

section('the far plane is not the fog');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  mb.quad([-4, 0, 0], [4, 0, 0], [4, 8, 0], [-4, 8, 0], tex, [0, 0, 8, 8], 0, [1, 1, false]);
  const mesh = mb.build();

  /* Final Rental culled anything past fogFar * 1.6, which is correct for a
     store and wrong for a hall you can see the far end of. */
  const rz = new Raster(64, 64);
  rz.snap = 0;
  rz.setFog(6, 14);
  rz.far = 90;
  rz.clear(0xFF000000);
  const cam = mat(), v = mat();
  setPosYaw(cam, 0, 4, 40, Math.PI);
  invertRigid(v, cam);
  rz.setCamera(v, 1.2);
  check('geometry 40 m away is still submitted with the fog at 14 m',
    rz.sphereVisible(0, 4, 0, 6) ? 'visible' : 'culled', 'visible');
  rz.drawMesh(mesh, mat(), {});
  check('and is drawn (fogged to black, but not skipped)',
    rz.tris > 0 ? 'drawn' : 'skipped', 'drawn');

  rz.far = 20;
  check('and beyond the far plane it is culled',
    rz.sphereVisible(0, 4, 0, 1) ? 'visible' : 'culled', 'culled');
}

section('room culling');
{
  const rz = view([0, 1, 0], 0, 64);
  check('a room in front of the camera is kept',
    rz.boxVisible({ x0: -5, x1: 5, y0: 0, y1: 4, z0: 8, z1: 18 }) ? 'visible' : 'culled', 'visible');
  check('a room behind it is not',
    rz.boxVisible({ x0: -5, x1: 5, y0: 0, y1: 4, z0: -40, z1: -30 }) ? 'visible' : 'culled', 'culled');
  check('a room off to the side is not',
    rz.boxVisible({ x0: 60, x1: 70, y0: 0, y1: 4, z0: -2, z1: 2 }) ? 'visible' : 'culled', 'culled');
  check('and the room the camera is standing in is kept',
    rz.boxVisible({ x0: -5, x1: 5, y0: 0, y1: 4, z0: -5, z1: 5 }) ? 'visible' : 'culled', 'visible');
}

section('automatic subdivision');
{
  /* A twenty-meter wall as one quad is two triangles, and affine mapping
     shears the texture across each of them. The builder cuts it up. */
  const coarse = new MeshBuilder();
  coarse.light = () => 1;
  coarse.maxEdge = 999;
  coarse.quad([0, 0, 0], [20, 0, 0], [20, 9, 0], [0, 9, 0], tex, [0, 0, 8, 8], 0);
  check('with subdivision off a big wall is two triangles', coarse.build().triCount, 2);

  const fine = new MeshBuilder();
  fine.light = () => 1;
  fine.maxEdge = 1.25;
  fine.quad([0, 0, 0], [20, 0, 0], [20, 9, 0], [0, 9, 0], tex, [0, 0, 8, 8], 0);
  const n = fine.build().triCount;
  check('with it on the same wall is a grid', n === 16 * 8 * 2 ? 'a 16x8 grid' : `${n} triangles`, 'a 16x8 grid');

  const small = new MeshBuilder();
  small.light = () => 1;
  small.quad([0, 0, 0], [0.8, 0, 0], [0.8, 0.6, 0], [0, 0.6, 0], tex, [0, 0, 8, 8], 0);
  check('and something small is left alone', small.build().triCount, 2);
}

section('texel density');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  mb.maxEdge = 999;
  // 4 m wide at 64 texels per meter should span 256 texels
  mb.surface([[0, 0, 0], [4, 0, 0], [4, 2, 0], [0, 2, 0]], tex, { density: 64 });
  const m = mb.build();
  const us = [];
  for (let i = 0; i < m.count; i++) us.push(m.vu[i * 2]);
  check('a 4 m surface at 64 texels/m spans 256 texels',
    Math.round(Math.max(...us) - Math.min(...us)), 256);
}

section('blending');
{
  const mb = new MeshBuilder();
  mb.light = () => 1;
  mb.quad([-1, 0, 0], [1, 0, 0], [1, 2, 0], [-1, 2, 0], tex, [0, 0, 8, 8], F_BLEND | F_DOUBLE, [1, 1, false]);
  const rz = view([0, 1, 4], Math.PI);
  rz.clear(0xFF000000);
  rz.drawMesh(mb.build(), mat(), {});
  const c = rz.color[25 * 64 + 25] >>> 0;
  check('a blended surface is half strength over black',
    (c & 255) > 0 && (c & 255) < 200 ? 'blended' : `0x${c.toString(16)}`, 'blended');
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
