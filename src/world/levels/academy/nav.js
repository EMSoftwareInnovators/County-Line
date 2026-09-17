/* ============================================================
   nav.js -- navigation topology for the Old Academy.

   Not NPC routes. This is the graph a future passenger, clerk or driver
   would walk the building on: a node in each room a person would have
   reason to stand in, a node at each doorway, and edges only where a
   door or an opening actually exists. Because it is built from the same
   plan as the walls, it is also a cheap check on the plan -- an edge that
   cannot be walked is a door that was not modelled.

   Node heights matter: Stage 1's NavGraph refuses to treat a node a
   story up as "near", so a route from the garden to the Archives has to
   climb one of the two staircases rather than pass through a ceiling.
   ============================================================ */
import { ft } from '../../../engine/units.js';
import * as D from './dimensions.js';

export function buildNav(b) {
  const N = {};
  const at = (id, x, y, z) => { N[id] = b.navNode({ x, y, z, tag: id }); return N[id]; };
  const link = (a, c) => b.navEdge(N[a], N[c]);

  const F1 = 0, F2 = D.FLOOR2;

  /* ---- approach and the front ---- */
  at('street', 0, D.GRADE, D.Z_FACADE - ft(60));
  at('front.walk', 0, D.GRADE, D.Z_FACADE - ft(24));
  at('front.steps', 0, D.GRADE, D.Z_FACADE - ft(5));
  at('porch.front', 0, F1, D.Z_FACADE + ft(7));
  at('porch.front.w', D.X_BAY_W + ft(5), F1, D.Z_FACADE + ft(7));
  at('porch.front.e', D.X_BAY_E - ft(5), F1, D.Z_FACADE + ft(7));

  /* ---- the central room, and its six directions ---- */
  at('central', 0, F1, 0);
  at('central.s', 0, F1, D.Z_CENTRAL_S + ft(3));
  at('central.n', 0, F1, D.Z_CENTRAL_N - ft(3));
  at('central.sw', D.X_BAY_W + ft(4), F1, ft(-6));
  at('central.se', D.X_BAY_E - ft(4), F1, ft(-6));
  at('central.nw', D.X_BAY_W + ft(4), F1, ft(12.5));
  at('central.ne', D.X_BAY_E - ft(4), F1, ft(12.5));

  /* ---- west wing, ground ---- */
  at('indians', ft(-39), F1, ft(-5));
  at('indians.n', ft(-32), F1, D.Z_FB_N - ft(3));
  at('indians.s', ft(-38), F1, D.Z_INDIANS_S + ft(3));
  at('docent', ft(-46), F1, ft(-25));
  at('west.store', ft(-30), F1, ft(-25));
  at('west.rearhall', ft(-32), F1, ft(15.5));
  at('west.stairhall', ft(-48), F1, ft(13));
  at('west.stair.foot', ft(-42.5), F1, ft(11.9));
  at('west.stair.top', ft(-42.5), F2, ft(16.1));
  at('west.offices', ft(-39), F1, ft(40));
  at('west.offices.s', ft(-32), F1, D.Z_NB_S + ft(3));
  at('west.door', D.X_W_OUT - ft(6), D.GRADE, ft(43));

  /* ---- east wing, ground ---- */
  at('americana.inner', ft(39), F1, ft(-5));
  at('americana.inner.n', ft(32), F1, D.Z_FB_N - ft(3));
  at('americana.inner.s', ft(38), F1, D.Z_INDIANS_S + ft(3));
  at('americana.main', ft(30), F1, ft(-25));
  at('giftshop', ft(46), F1, ft(-25));
  at('east.rearhall', ft(32), F1, ft(15.5));
  at('east.stairhall', ft(48), F1, ft(13));
  at('east.stair.foot', ft(42.5), F1, ft(11.9));
  at('east.stair.top', ft(42.5), F2, ft(16.1));
  at('east.animal', ft(32), F1, ft(32));
  at('east.staff', ft(32), F1, ft(52));
  at('east.service', ft(48), F1, ft(30));
  at('east.vestibule', ft(48), F1, ft(43));
  at('east.council', ft(48), F1, ft(54));
  at('east.door.n', D.X_E_OUT + ft(6), D.GRADE, ft(43));
  at('east.door.s', D.X_E_OUT + ft(6), D.GRADE, ft(15.58));

  /* ---- rear porch and garden ---- */
  at('porch.rear', 0, F1, D.Z_CENTRAL_N_OUT + ft(7));
  at('porch.rear.w', D.X_BAY_W + ft(5), F1, D.Z_CENTRAL_N_OUT + ft(4));
  at('porch.rear.e', D.X_BAY_E - ft(5), F1, D.Z_CENTRAL_N_OUT + ft(4));
  at('garden.s', 0, D.GARDEN_LEVEL, D.Z_PORCH_N + ft(6));
  at('garden', 0, D.GARDEN_LEVEL, D.Z_PORCH_N + ft(16));
  at('garden.n', 0, D.GARDEN_LEVEL, D.Z_N_IN - ft(6));

  /* ---- upper floor ---- */
  at('upper.west.landing', ft(-32), F2, ft(15.5));
  at('upper.west.history', ft(-39), F2, ft(40));
  at('upper.west.rotating', ft(-39), F2, ft(-8));
  at('upper.war', ft(-11), F2, 0);
  at('upper.mammals', ft(11), F2, 0);
  at('upper.east.landing', ft(32), F2, ft(15.5));
  at('upper.east.minerals', ft(28), F2, ft(26));
  at('upper.east.archives', ft(39), F2, ft(45));
  at('upper.east.natural', ft(39), F2, ft(-8));
  at('gallery', 0, F2, D.Z_FACADE + ft(7));

  /* ============================================================
     EDGES -- one per real opening, and no others
     ============================================================ */
  const E = [
    ['street', 'front.walk'], ['front.walk', 'front.steps'], ['front.steps', 'porch.front'],
    ['porch.front', 'porch.front.w'], ['porch.front', 'porch.front.e'],
    ['porch.front.w', 'docent'], ['porch.front.e', 'giftshop'],
    ['porch.front', 'central.s'], ['central.s', 'central'],

    ['central', 'central.n'], ['central.n', 'porch.rear'],
    ['central', 'central.sw'], ['central.sw', 'indians'],
    ['central', 'central.se'], ['central.se', 'americana.inner'],
    ['central', 'central.nw'], ['central.nw', 'west.rearhall'],
    ['central', 'central.ne'], ['central.ne', 'east.rearhall'],

    ['indians', 'indians.n'], ['indians', 'indians.s'],
    ['indians.s', 'docent'], ['indians.s', 'west.store'],
    ['indians.n', 'west.rearhall'], ['indians.n', 'west.stairhall'],
    ['docent', 'west.store'],
    ['west.rearhall', 'west.stairhall'],
    ['west.stairhall', 'west.stair.foot'], ['west.stair.foot', 'west.stair.top'],
    ['west.stairhall', 'west.offices.s'], ['west.rearhall', 'west.offices.s'],
    ['west.offices.s', 'west.offices'], ['west.offices', 'west.door'],

    ['americana.inner', 'americana.inner.n'], ['americana.inner', 'americana.inner.s'],
    ['americana.inner.s', 'americana.main'], ['americana.inner.s', 'giftshop'],
    ['americana.main', 'giftshop'],
    ['americana.inner.n', 'east.rearhall'], ['americana.inner.n', 'east.stairhall'],
    ['east.rearhall', 'east.stairhall'],
    ['east.stairhall', 'east.stair.foot'], ['east.stair.foot', 'east.stair.top'],
    ['east.stairhall', 'east.service'], ['east.rearhall', 'east.animal'],
    ['east.animal', 'east.service'], ['east.animal', 'east.staff'],
    ['east.animal', 'east.vestibule'], ['east.service', 'east.vestibule'],
    ['east.vestibule', 'east.council'], ['east.staff', 'east.council'],
    ['east.vestibule', 'east.door.n'], ['east.stairhall', 'east.door.s'],

    ['west.rearhall', 'porch.rear.w'], ['east.rearhall', 'porch.rear.e'],
    ['porch.rear.w', 'porch.rear'], ['porch.rear.e', 'porch.rear'],
    ['porch.rear', 'garden.s'], ['garden.s', 'garden'], ['garden', 'garden.n'],

    ['west.stair.top', 'upper.west.landing'],
    ['upper.west.landing', 'upper.west.history'],
    ['upper.west.landing', 'upper.west.rotating'],
    ['upper.west.landing', 'upper.war'],
    ['upper.west.rotating', 'upper.war'],
    ['upper.war', 'upper.mammals'],
    ['upper.mammals', 'upper.east.landing'],
    ['upper.mammals', 'upper.east.natural'],
    ['east.stair.top', 'upper.east.landing'],
    ['upper.east.landing', 'upper.east.natural'],
    ['upper.east.landing', 'upper.east.minerals'],
    ['upper.east.landing', 'upper.east.archives'],
    ['upper.east.minerals', 'upper.east.archives'],
    ['upper.war', 'gallery'],

    ['west.door', 'front.walk'], ['east.door.n', 'front.walk'], ['east.door.s', 'front.walk'],
  ];
  for (const [a, c] of E) link(a, c);
  return N;
}
