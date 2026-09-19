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
import { declareLights, buildFixtures } from './fixtures.js';
import * as D from './dimensions.js';
import { buildShell } from './shell.js';
import { buildFirstFloor } from './firstfloor.js';
import { buildSecondFloor } from './secondfloor.js';
import { buildStairs } from './stairs.js';
import { buildPorches } from './porches.js';
import { buildRoof } from './roof.js';
import { buildGrounds, SITE } from './grounds.js';
import { buildTrim } from './trim.js';
import { buildNav } from './nav.js';
import { buildTerminal } from './terminal/index.js';

/* ============================================================
   LIGHT

   Stage 2 lit this building like an overcast afternoon, on purpose: an
   architectural assessment needs a building you can see. The note there
   said a later stage takes the shutters off. This is that stage, and the
   shutters come off into the dark.

   It is a Tuesday night in October 1998, between eight and one. The
   building is working. It is also 196 years old, was finished before
   anyone had electricity, and everything that lights it was screwed to
   the plaster afterwards -- so what the player sees is fittings, and the
   distance between them.

   Three light models, applied in the order the fabric is built:

     THE ENVELOPE carries an outside face and an inside one in the same
     mesh, so it gets a value between the two. Outside at night that is
     nearly nothing; the streetlights and the porch lanterns do the work.

     THE INTERIOR is a tenth, which is what a room with no fitting
     burning in it looks like once your eyes adjust. The fittings are in
     fixtures.js and every one of them is on a breaker.

     THE OUTSIDE gets a thin sky term so that up-facing surfaces -- the
     walk, the parapet caps, the coach apron -- catch the city glow
     and the building reads as a silhouette rather than a hole.

   `darkAmbient` is the second half of every bake: the same geometry with
   every switchable fitting off. See MeshBuilder.dark.
   ============================================================ */

export const academy = {
  id: 'academy',
  name: 'Old Academy of Richmond County',

  build(b) {
    /* Long sightlines: the building is 112 feet across and you can see
       the length of it from the garden, so the fog sits well back and the
       far plane sits well beyond the site. */
    /* Black fog, closing at two hundred feet. Long enough to see the
       whole facade from the street and the length of the garden; short
       enough that the far end of a ninety-four-foot wing goes to nothing,
       which is most of what makes the building feel big at night. */
    b.view(ft(55), ft(200), ft(620));
    /* Sodium-tinted overcast, about two stops under the daylight sky
       Stage 2 used. Windows read as black against it, which is what the
       brief asks for and what a lit building at night actually does. */
    b.sky(0xFF2A2018);

    declareLights(b);

    /* Three light models, applied in the order the fabric is built.

       THE ENVELOPE carries both an outside face and an inside one in the
       same mesh, so it gets a value between the two -- which is also
       true of the real thing, because the wall with the windows in it is
       always the bright wall of the room.

       THE INTERIOR is dimmer, and takes what the fittings give it.

       THE OUTSIDE is overcast daylight: high ambient on the vertical
       faces, a strong sky term on everything pointing up. */
    b.lighting({ ambient: 0.30, sky: 0.09, skyDir: [0, 1, 0], max: 1.45, darkAmbient: 0.24 });
    buildShell(b);

    b.lighting({ ambient: 0.30, sky: 0, max: 1.45, darkAmbient: 0.22 });
    /* The two floors hand back the rooms that take wainscot rather than
       laying it themselves. See trim.js: a board has to know where the
       wall is interrupted, and the porch doors are cut two modules
       later. */
    const trim = [...buildFirstFloor(b), ...buildSecondFloor(b)];
    buildStairs(b);

    b.lighting({ ambient: 0.26, sky: 0.12, skyDir: [0, 1, 0], max: 1.5, darkAmbient: 0.20 });
    buildPorches(b);
    buildRoof(b);
    buildGrounds(b);

    /* AFTER EVERYTHING THAT CUTS A HOLE IN A WALL. Nothing built below
       this line may cut one. */
    b.lighting({ ambient: 0.30, sky: 0, max: 1.45, darkAmbient: 0.22 });
    buildTrim(b, trim);
    buildFixtures(b);

    /* ---- and the tenant ----
       Richmond Central Coach Terminal, fitted into the building in
       August. Furniture, equipment and signage only: see
       terminal/index.js for the rule and the one exception. */
    buildTerminal(b);

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
