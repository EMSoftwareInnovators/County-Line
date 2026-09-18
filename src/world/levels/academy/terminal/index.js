/* ============================================================
   terminal/index.js -- Richmond Central Coach Terminal, fitted out
   inside the Old Academy.

   OCTOBER 1998. Georgia Coach Lines took a fifteen-year lease on the
   Old Academy in the spring, four years after the museum moved out, and
   opened the terminal in August. The building was already vacant, its
   rooms were already the right sizes, and the city wanted it occupied.
   So the company moved in the way a bus company moves in: it bought
   counters, benches, lockers and a scale, screwed signs over the doors
   the building already had, ran conduit along the picture rails, and
   paved a yard on the west side where the railroad path used to go.

   THE BUS COMPANY ADAPTED TO THE OLD ACADEMY. THE OLD ACADEMY DID NOT
   ADAPT TO THE BUS COMPANY. That is the rule this whole directory
   follows, and it is a rule about what the code may call, not just about
   what it looks like:

     nothing under terminal/ calls `wall`, `wallWith`, `door`,
     `window`, `floor` or `ceiling`.

   Everything here is furniture, equipment, signage and paint. Delete
   this directory and the 1856 building comes back untouched, which is
   also how a lease ends.

   ONE EXCEPTION, AND IT IS OUTSIDE. platform.js lays the asphalt apron
   and the concrete loading platform with `b.floor`, and puts ramps on
   the collision mesh, because a coach yard is paving and paving is a
   slab. It is on the west ground, not the building: no wall is cut, no
   floor of the Academy is touched, and grounds.js already owned that
   ground. Nothing else in here goes near the shell.

   ASSEMBLY ORDER matches the order a crew would have worked: the public
   rooms first because they open to the street, then the staff side,
   then whatever got shoved upstairs, then the yard.
   ============================================================ */
import { standOn } from './props.js';
import { buildPublic } from './public.js';
import { buildStaff } from './staff.js';
import { buildUpstairs } from './upstairs.js';
import { buildPlatform } from './platform.js';

export function buildTerminal(b) {
  /* props.js carries the floor level the furniture stands on, set once
     per room. It is reset between modules so that a room which forgets
     to set it gets the lobby floor rather than whatever the last room
     happened to be standing on. */
  buildPublic(b); standOn(0);
  buildStaff(b); standOn(0);
  buildUpstairs(b); standOn(0);
  buildPlatform(b); standOn(0);
}

export { COACH, buildCoachMesh, buildRollMesh, coachFootprint } from './coach.js';
export { YARD, BAYS } from './platform.js';
