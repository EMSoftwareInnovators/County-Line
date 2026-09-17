/* ============================================================
   trim.js -- the wainscot, laid after the building is standing.

   THIS IS A SEPARATE PASS BECAUSE ORDER MATTERS AND NOTHING ELSE MADE
   THAT OBVIOUS.

   A board on a wall has to know two things that no floor module knows on
   its own: where the wall is interrupted, and whether there is a wall
   there at all. Both are questions about the finished building, and the
   wainscot kept being laid before the building was finished:

     * Stage 2 ran a chair rail round each room as a band on a rectangle,
       straight across every doorway in the building.
     * Stage 2.1 fixed that by asking the level for its doors -- and then
       ran it across every cased archway, because an arch is not a door.
     * Including the archways fixed that, and it then took its gaps from
       the wrong story, because the two floors share their wall lines.
     * Filtering by height fixed that, and it still ran across the two
       front-porch doors, because the wainscot was laid at the end of
       buildFirstFloor and porches.js had not run yet. Being last in your
       own module is not the same as being last.

   So it is last, properly: index.js calls this after the shell, both
   floors, the stairs and the porches, and the two floor modules hand it
   nothing but a list of rectangles. Anything built after this that cuts a
   wall will be missed, which is the one rule this file has and the reason
   it is written down here.
   ============================================================ */
import * as D from './dimensions.js';
import { openingsAround, wainscot } from './parts.js';

/**
 * @param b     the level builder
 * @param jobs  [{ chunk, x0, x1, z0, z1, y }] -- from the floor modules
 */
export function buildTrim(b, jobs) {
  for (const j of jobs) {
    b.chunk(j.chunk);
    b.detail(2.2);
    const r = { x0: j.x0, x1: j.x1, z0: j.z0, z1: j.z1, y: j.y };
    wainscot(b, r, {
      height: D.WAINSCOT_H, cap: D.WAINSCOT_CAP, base: D.BASE_H,
      gaps: openingsAround(b.level, r),
    });
  }
}
