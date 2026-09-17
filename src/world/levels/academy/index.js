/* ============================================================
   index.js -- the Old Academy of Richmond County, assembled.

   540 Telfair Street, Augusta, Georgia. Built 1801-02 to Richard Clarke's
   Federal design for the Trustees of the Richmond Academy, and remade in
   1856-57 by William Henry Goodrich into the Tudor-Gothic building that
   stands today: crenellated parapets, drip molds, Tudor arches and a
   cast-iron colonnade across the center of the front. It has been a
   school, a Confederate hospital, US Army barracks, a library and, from
   1933 to 1994, the Augusta Museum -- which is the period the surviving
   plans describe and which this reconstruction follows.

   ORIENTATION, held consistently in geometry, coordinates, room ids and
   documentation:

       SOUTH   the front, on Telfair Street
       NORTH   the rear, the garden side
       WEST    left, looking at the front
       EAST    right

   ORIGIN: (0, 0, 0) is the center of the first-floor central room -- the
   one the museum called Revolutionary War -- at finished floor level.
   X = 0 is the building's center line. The front façade is at Z = -31'4½"
   and the north end of the wings at Z = +62'7½".

   This module does assembly and nothing else. Every number is in
   dimensions.js and every piece of geometry is in one of the modules
   below, in the order the building was put up: shell, floors, stairs,
   porches, roof, grounds.
   ============================================================ */
import { ft, ftin } from '../../../engine/units.js';
import { pointLight, fillLight } from '../../lighting.js';
import * as D from './dimensions.js';
import { buildShell } from './shell.js';
import { buildFirstFloor } from './firstfloor.js';
import { buildSecondFloor } from './secondfloor.js';
import { buildStairs } from './stairs.js';
import { buildPorches } from './porches.js';
import { buildRoof } from './roof.js';
import { buildGrounds, SITE } from './grounds.js';
import { buildNav } from './nav.js';

/* ============================================================
   LIGHT

   An overcast afternoon, because this stage is an architectural
   assessment and you cannot assess a building you cannot see. It is not
   the game's lighting and is not meant to be: no fixtures, no pools of
   light, no atmosphere. A later stage takes the shutters off.

   Vertex light is baked as geometry is created, so every fitting has to
   be declared before anything it is meant to light.
   ============================================================ */
function declareLights(b) {
  const L = (x, y, z, r, i) => b.light(pointLight(x, y, z, r, i));
  const F = (x, y, z, r, i) => b.light(fillLight(x, y, z, r, i));

  const h1 = D.FLOOR1_CEIL - ftin(1, 6);
  const h2 = D.FLOOR2_CEIL - ftin(1, 6);

  /* The central room, which is 44 feet across and needs it. */
  for (const x of [ft(-15), 0, ft(15)]) {
    for (const z of [ft(-10), ft(10)]) {
      L(x, h1, z, ft(36), 0.62);
      L(x, D.FLOOR2 + ftin(11, 6), z, ft(36), 0.56);
    }
    F(x, ftin(5, 0), 0, ft(28), 0.2);
  }

  /* The wings, band by band, on both floors. */
  const bands = [
    [ft(-39), ft(-8)], [ft(-39), ft(15.5)], [ft(-39), ft(32)], [ft(-39), ft(50)],
    [ft(39), ft(-8)], [ft(39), ft(15.5)], [ft(39), ft(32)], [ft(39), ft(50)],
    [ft(-29), ft(-22)], [ft(29), ft(-22)],
    [ft(-48), ft(40)], [ft(48), ft(40)],
    [ft(-48), ft(-8)], [ft(48), ft(-8)],
  ];
  for (const [x, z] of bands) {
    L(x, h1, z, ft(32), 0.58);
    L(x, h2, z, ft(32), 0.54);
    F(x, ftin(5, 6), z, ft(22), 0.18);
  }

  /* Daylight down the two covered porches, which are outdoors and should
     not read as dark rooms. */
  for (const x of [ft(-18), ft(-6), ft(6), ft(18)]) {
    /* A covered porch is still outdoors and has to read as daylight in
       shade, not as an unlit room. These are bounce, not fittings. */
    F(x, D.PORCH_CEIL - ftin(1, 0), D.Z_FACADE + ftin(6, 6), ft(26), 0.3);
    F(x, D.REAR_PORCH_CEIL - ftin(1, 0), D.Z_CENTRAL_N_OUT + ftin(7, 6), ft(26), 0.32);
    F(x, D.ROOF - ftin(2, 6), D.Z_FACADE + ftin(6, 6), ft(24), 0.28);
    F(x, ftin(3, 0), D.Z_FACADE + ftin(6, 6), ft(20), 0.16);
    F(x, ftin(3, 0), D.Z_CENTRAL_N_OUT + ftin(7, 6), ft(20), 0.16);
  }

  /* And a little light down into the garden, which is a court between two
     thirty-foot walls and would otherwise sit in its own shadow. */
  for (const z of [ft(38), ft(50), ft(60)]) {
    F(0, ftin(16, 0), z, ft(46), 0.22);
  }
}

export const academy = {
  id: 'academy',
  name: 'Old Academy of Richmond County',

  build(b) {
    /* Long sightlines: the building is 112 feet across and you can see
       the length of it from the garden, so the fog sits well back and the
       far plane sits well beyond the site. */
    b.view(ft(80), ft(300), ft(750));
    b.sky(0xFFB8A894);

    declareLights(b);

    /* Three light models, applied in the order the fabric is built.

       THE ENVELOPE carries both an outside face and an inside one in the
       same mesh, so it gets a value between the two -- which is also
       true of the real thing, because the wall with the windows in it is
       always the bright wall of the room.

       THE INTERIOR is dimmer, and takes what the fittings give it.

       THE OUTSIDE is overcast daylight: high ambient on the vertical
       faces, a strong sky term on everything pointing up. */
    b.lighting({ ambient: 0.66, sky: 0.34, skyDir: [0, 1, 0], max: 1.5 });
    buildShell(b);

    b.lighting({ ambient: 0.48, sky: 0, max: 1.45 });
    buildFirstFloor(b);
    buildSecondFloor(b);
    buildStairs(b);

    b.lighting({ ambient: 0.74, sky: 0.46, skyDir: [0, 1, 0], max: 1.55 });
    buildPorches(b);
    buildRoof(b);
    buildGrounds(b);

    /* ---- where the player starts ----
       On the front walk, looking north at the façade. The first thing
       Stage 2 has to be judged on is whether the front of the building is
       recognisable, so that is where it opens. */
    b.spawn({ x: 0, y: D.GRADE, z: D.Z_FACADE - ft(46), yaw: 0, pitch: 0.02 });

    b.mark('facade', { x: 0, y: D.GRADE, z: D.Z_FACADE - ft(46) });
    b.mark('central', { x: 0, y: 0, z: 0 });
    b.mark('garden', { x: 0, y: D.GARDEN_LEVEL, z: D.Z_PORCH_N + ft(16) });
    b.mark('plan', {
      width: D.WIDTH, depth: D.DEPTH, bay: D.BAY, wing: D.WING,
      floor2: D.FLOOR2, facade: D.Z_FACADE, north: D.Z_N_OUT,
      site: SITE,
    });

    buildNav(b);

    /* Stage 2 has no soundscape. One quiet bed outdoors so that stepping
       out of the building is not stepping into a vacuum. */
    b.ambience({ kind: 'air', x: 0, y: ft(6), z: D.Z_PORCH_N + ft(14), maxDist: ft(120), gain: 0.22, cutoff: 420, room: 'academy.garden' });
    b.ambience({ kind: 'air', x: 0, y: ft(6), z: D.Z_FACADE - ft(20), maxDist: ft(140), gain: 0.2, cutoff: 380, room: 'academy.grounds.front' });
  },
};

export default academy;
