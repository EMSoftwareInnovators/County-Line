/* ============================================================
   nav.js -- a waypoint graph, and the shortest way through it.

   The ALGORITHM is Final Rental's: hand-placed nodes, an adjacency list,
   Dijkstra, and a straight-line shortcut taken whenever the collider says
   the direct route is clear, because most of the time it is and a path
   that hugs waypoints looks like a path.

   The DATA is not. Final Rental's nodes were eighteen literals naming the
   aisles of a video store, hard-coded in the module, and the nodes were
   (x, z) pairs because the store had one floor. County Line's graph is
   declared by the level, and a node carries a height, so a route from the
   ticket hall to an upstairs office goes up the stairs rather than
   through the ceiling.
   ============================================================ */

export class NavGraph {
  /**
   * @param nodes [{ x, y, z, tag? }]
   * @param edges [[a, b], ...] -- undirected; cost is the 3D distance
   */
  constructor(nodes = [], edges = []) {
    this.nodes = nodes;
    this.adj = nodes.map(() => []);
    for (const [a, b] of edges) this.link(a, b);
  }

  add(node) {
    this.nodes.push(node);
    this.adj.push([]);
    return this.nodes.length - 1;
  }

  unlink(a, b) {
    if (!this.adj[a] || !this.adj[b]) return;
    this.adj[a] = this.adj[a].filter(([n]) => n !== b);
    this.adj[b] = this.adj[b].filter(([n]) => n !== a);
  }

  link(a, b, costScale = 1) {
    const n = this.nodes[a], m = this.nodes[b];
    if (!n || !m) return;
    const w = Math.hypot(n.x - m.x, (n.y || 0) - (m.y || 0), n.z - m.z) * costScale;
    this.adj[a].push([b, w]);
    this.adj[b].push([a, w]);
  }

  /**
   * The node nearest to a point that the walker can actually reach.
   * Falls back on raw distance when nothing is directly reachable, which
   * is the right answer for somebody who has been placed inside geometry.
   */
  nearest(x, y, z, reach) {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      /* Height first: a node one floor up is not "near", however close it
         looks on a plan. */
      if (Math.abs((n.y || 0) - y) > 2.2) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bestD && (!reach || reach(x, z, n.x, n.z))) { bestD = d; best = i; }
    }
    if (best >= 0) return best;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const d = Math.hypot(n.x - x, (n.y || 0) - y, n.z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * @param reach (x0,z0,x1,z1) => boolean -- the caller's walkability test,
   *              usually CollisionWorld.clearPath bound to a body's size
   * @returns [{ x, y, z }] ending at the target, or null if there is no route
   */
  path(from, to, reach) {
    if (reach && reach(from.x, from.z, to.x, to.z) && Math.abs((from.y || 0) - (to.y || 0)) < 0.6) {
      return [{ x: to.x, y: to.y || 0, z: to.z }];
    }
    const a = this.nearest(from.x, from.y || 0, from.z, reach);
    const b = this.nearest(to.x, to.y || 0, to.z, reach);
    if (a < 0 || b < 0) return [{ x: to.x, y: to.y || 0, z: to.z }];
    if (a === b) return [this.nodes[a], { x: to.x, y: to.y || 0, z: to.z }];

    const n = this.nodes.length;
    const dist = new Float64Array(n).fill(Infinity);
    const prev = new Int32Array(n).fill(-1);
    const seen = new Uint8Array(n);
    dist[a] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < n; i++) if (!seen[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === b) break;
      seen[u] = 1;
      for (const [v, w] of this.adj[u]) {
        if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
      }
    }
    if (dist[b] === Infinity) return null;
    const out = [];
    for (let c = b; c >= 0; c = prev[c]) { out.unshift(this.nodes[c]); if (c === a) break; }
    out.push({ x: to.x, y: to.y || 0, z: to.z });
    return out;
  }
}

/** Build the graph a level declared. */
/* How far a stuck node may be shifted, and how finely to look. */
const NUDGE_MAX = 2.6;
const NUDGE_STEP = 0.22;

/**
 * Move a waypoint that is inside something to the nearest place a body
 * fits, keeping it in the same room.
 *
 * WHY THIS HAS TO EXIST. The graph is declared by the level before any
 * furniture is in it -- it has to be, because nav.js is the circulation
 * schedule and the schedule is about the ARCHITECTURE. Then the tenant
 * moves in, and a bus company that puts a clerk's desk where the docent
 * library's reading table used to be has just put a desk on top of a
 * waypoint. Seven of the Old Academy's sixty-three were inside
 * something: a bench, two stairwell guards, the crew room table, a WC,
 * a chair and a gallery table.
 *
 * Nothing announced it, because a blocked waypoint does not fail. The
 * router still hands back a route through it, the walker still sets off,
 * and then it spends the rest of its life pressing into a table -- which
 * is what "the supervisor gave the whole tour from inside the clerk's
 * office" turned out to be.
 *
 * Nudging is right rather than removing: the node is there because the
 * room has to be routable, and a room with its only waypoint deleted
 * stops being reachable at all. A node that cannot be freed within a
 * couple of meters is left where it is, because at that point the room
 * is full and that is a furniture bug, not a graph one.
 */
function unstick(level, node, r, h) {
  const col = level.collision;
  if (col.fits(node.x, (node.y || 0) + 0.05, node.z, r, h)) return node;
  const room = level.roomAt(node.x, (node.y || 0) + 0.1, node.z);
  for (let d = NUDGE_STEP; d <= NUDGE_MAX; d += NUDGE_STEP) {
    /* a ring at a time, so the nearest free spot wins */
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      const x = node.x + Math.cos(th) * d;
      const z = node.z + Math.sin(th) * d;
      if (!col.fits(x, (node.y || 0) + 0.05, z, r, h)) continue;
      if (room) {
        const here = level.roomAt(x, (node.y || 0) + 0.1, z);
        if (!here || here.id !== room.id) continue;
      }
      return { ...node, x, z, nudged: d };
    }
  }
  return node;
}

/** How far a waypoint may be moved vertically to sit on the floor. */
const SETTLE = 1.3;

/**
 * The surface a body standing here would actually be on.
 *
 * WAYPOINTS FLOAT, AND NOTHING NOTICES. A node's height is typed in
 * with the rest of it, and it is typed as the level a person is
 * nominally on -- grade, or the first floor -- which is right until
 * the ground under that spot is not at that level. The waypoint
 * outside the west service door was declared at grade and the ground
 * beneath it is the top of the three steps up to the door, so it sat
 * nearly three feet under the paving. The walker reached the node
 * before it, found the next one buried, and stopped.
 *
 * Searched both ways, because the two failures are symmetrical: a node
 * under a step is as useless as one hanging over a drop. Capped, so a
 * node over a stairwell cannot fall to the floor below.
 */
function settle(level, x, z, from) {
  /* THE HIGHEST SURFACE, not the nearest one. Where two floors are
     stacked within reach -- a flight of steps over the yard it climbs
     out of, a landing over the paving beneath it -- the nearest to the
     height somebody typed is as likely to be the one UNDER the steps as
     the one on top, and the waypoint outside the west service door
     picked the wrong one by eight inches. A person stands on a step,
     not in the void below it. */
  let best = from, found = false;
  for (let d = -SETTLE; d <= SETTLE + 1e-6; d += 0.2) {
    const g = level.collision.groundAt(x, z, from + d, 0.25);
    if (!g || Math.abs(g.y - from) > SETTLE) continue;
    if (!found || g.y > best) { best = g.y; found = true; }
  }
  return best;
}

/** How far either side of a doorway its approach waypoints sit. */
const THRESHOLD = 0.85;
/** How far a bent leg may swing out to get around something. */
const BEND_MAX = 3.2;
/** What a stride taken outdoors costs, against one taken inside. */
const OUTSIDE_COST = 8;

/**
 * A rise big enough that the edge must be a staircase or a ramp rather
 * than a doorway, and so cannot be checked as a line in plan.
 *
 * THIS NUMBER WAS HALF A METER AND THAT WAS A BUG WITH A LONG SHADOW.
 * The Old Academy stands about two foot ten above its grade, so every
 * edge from a room to the ground outside it cleared half a meter --
 * and every one of them was therefore waved through as "stairs", with
 * no doorway waypoint and no walkability check at all. The graph
 * cheerfully joined the coach bays to the west offices through the
 * outside wall. A story in this building is thirteen and a half feet;
 * a threshold is under three. Two meters tells them apart and nothing
 * in between exists.
 */
const A_STORY = 2.0;

/**
 * Link two waypoints by a route a body can actually walk.
 *
 * A LINK IS A PROMISE. Everything downstream -- the router, the
 * shortcut test, the walker -- treats an edge as "you can go from here
 * to there", and an edge that is not true does not fail anywhere: the
 * router hands it back, the walker sets off, presses into a filing
 * cabinet, times out, skips the waypoint and arrives in the wrong room
 * claiming success. So an edge whose straight line is blocked is bent
 * round the obstruction instead of being asserted, with a waypoint put
 * where the corner is.
 *
 * Straight where it can be, one corner where it cannot, and where even
 * that fails the edge is made anyway -- the two rooms do connect, the
 * graph saying otherwise would be worse, and the harness that counts
 * these is what says so out loud.
 */
function linkWalkable(g, ia, ib, clear, costScale = 1) {
  const a = g.nodes[ia], b = g.nodes[ib];
  if (!a || !b) return;
  if (clear(a, b)) { g.link(ia, ib, costScale); return; }
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  const px = -dz / len, pz = dx / len;          // perpendicular
  for (let off = 0.4; off <= BEND_MAX; off += 0.4) {
    for (const side of [1, -1]) {
      /* Try the corner at a few points along the leg, not just the
         middle: what is in the way is rarely halfway along. */
      for (const f of [0.5, 0.3, 0.7]) {
        const m = {
          x: a.x + dx * f + px * side * off,
          y: a.y,
          z: a.z + dz * f + pz * side * off,
          tag: `bend.${ia}.${ib}`,
        };
        if (!clear(a, m) || !clear(m, b)) continue;
        const im = g.add(m);
        g.link(ia, im, costScale);
        g.link(im, ib, costScale);
        return;
      }
    }
  }
  g.link(ia, ib);
}

/**
 * Every doorway in the building, as three points: the opening itself
 * and a standing spot on each side of it.
 *
 * Doors and cased openings both, because the graph does not care
 * whether a hole in a wall has a leaf hung in it.
 *
 * `yaw` IS THE WAY THE DOORWAY FACES, not the direction of the wall it
 * is in -- the same convention as everything else that carries a yaw in
 * this engine, where forward is (sin, cos). Rotating it a quarter turn
 * to "get the normal" puts both approach points inside the masonry, a
 * body fits in neither, and every doorway in the building reports
 * itself unusable, which is exactly as silent as it sounds.
 */
function thresholds(level) {
  const out = [];
  for (const d of [...level.doors, ...level.openings]) {
    const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw);
    out.push({
      exterior: !!d.exterior,
      mid: { x: d.x, z: d.z, y: d.y || 0 },
      a: { x: d.x + nx * THRESHOLD, z: d.z + nz * THRESHOLD },
      b: { x: d.x - nx * THRESHOLD, z: d.z - nz * THRESHOLD },
    });
  }
  return out;
}

/**
 * The level's graph, with every waypoint checked against what is
 * actually standing in the building, and every edge that runs through a
 * wall re-routed through the doorway it was always meant to use.
 *
 * ------------------------------------------------------------
 * WHY THE EDGES NEED THIS.
 *
 * nav.js in the level is the CIRCULATION SCHEDULE: it says the docent
 * library connects to the waiting room, which is true of the building
 * and is the thing worth writing down by hand. What it is not is a set
 * of walkable line segments. The straight line between two room centers
 * goes through the partition between them, every time, and the walker
 * that is handed such an edge sets off at the wall, presses into it,
 * gives up a waypoint at a time and reports itself arrived somewhere
 * else entirely.
 *
 * Thirty-five of the Old Academy's seventy-nine edges were like this.
 * It went unnoticed for two stages because the only routes anybody
 * walked -- lobby, waiting room, platform -- happened to be the four
 * whose doorway waypoints had been added BY HAND, one at a time, each
 * time somebody noticed an actor clipping a jamb. This is that fix,
 * done once, from the level's own record of where it cut its walls.
 *
 * Declared edges are kept as declared where they are walkable. Where
 * they are not, the edge is replaced by two through the doorway that
 * actually joins those two rooms -- which is the route a person takes
 * and the one the level meant.
 * ------------------------------------------------------------
 *
 * @param opt.r / opt.h  the body it has to fit; defaults to the player's
 */
export function graphFromLevel(level, opt = {}) {
  const r = opt.r === undefined ? 0.2794 : opt.r;
  const h = opt.h === undefined ? 1.778 : opt.h;
  const nodes = level.navNodes
    .map((n) => ({ ...n, y: settle(level, n.x, n.z, n.y || 0) }))
    .map((n) => unstick(level, n, r, h));
  const g = new NavGraph(nodes, []);
  /* Through doors: see CollisionWorld.clearPath. The graph is built
     with the building shut up for the night, and a door is not a wall. */
  const clear = (p, q) => level.collision.clearPath(
    p.x, p.z, q.x, q.z, Math.min(p.y || 0, q.y || 0), r, h, { throughDoors: true });
  const gates = thresholds(level);
  const byDoor = new Map();

  for (const [ia, ib] of level.navEdges) {
    const a = nodes[ia], b = nodes[ib];
    if (!a || !b) continue;
    /* Stairs are edges between floors and are not straight lines in
       plan; the ramp does the work and clearPath cannot see it. */
    if (Math.abs((a.y || 0) - (b.y || 0)) > A_STORY) { g.link(ia, ib); continue; }
    if (clear(a, b)) { g.link(ia, ib); continue; }

    /* Find the doorway that joins these two, by being reachable from
       one on one side and the other on the other. */
    let best = -1, bestCost = Infinity;
    for (let i = 0; i < gates.length; i++) {
      const t = gates[i];
      if (Math.abs((t.mid.y || 0) - (a.y || 0)) > A_STORY) continue;
      const fwd = clear(a, { ...t.a, y: a.y }) && clear(b, { ...t.b, y: b.y });
      const rev = clear(a, { ...t.b, y: a.y }) && clear(b, { ...t.a, y: b.y });
      if (!fwd && !rev) continue;
      const cost = Math.hypot(a.x - t.mid.x, a.z - t.mid.z)
        + Math.hypot(b.x - t.mid.x, b.z - t.mid.z);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    /* NO GATE PASSED, so ask the building instead of the furniture.
       clearPath from a room's center to a doorway is a fair question in
       an empty room and an unfair one in a baggage room with a conveyor
       down the middle -- the doorway is still the way out, it just
       cannot be seen from the exact point somebody typed into nav.js.
       So fall back to the doorway that genuinely joins these two rooms,
       by standing on each side of it and asking which room that is. */
    if (best < 0) {
      const ra = level.roomAt(a.x, (a.y || 0) + 0.1, a.z);
      const rb = level.roomAt(b.x, (b.y || 0) + 0.1, b.z);
      if (ra && rb && ra.id !== rb.id) {
        for (let i = 0; i < gates.length; i++) {
          const t = gates[i];
          if (Math.abs((t.mid.y || 0) - (a.y || 0)) > A_STORY) continue;
          const sa = level.roomAt(t.a.x, (t.mid.y || 0) + 0.1, t.a.z);
          const sb = level.roomAt(t.b.x, (t.mid.y || 0) + 0.1, t.b.z);
          if (!sa || !sb) continue;
          const joins = (sa.id === ra.id && sb.id === rb.id)
            || (sa.id === rb.id && sb.id === ra.id);
          if (!joins) continue;
          const cost = Math.hypot(a.x - t.mid.x, a.z - t.mid.z)
            + Math.hypot(b.x - t.mid.x, b.z - t.mid.z);
          if (cost < bestCost) { bestCost = cost; best = i; }
        }
      }
    }
    if (best < 0) { linkWalkable(g, ia, ib, clear); continue; }

    /* THREE NODES, NOT ONE: a standing spot either side and the
       threshold between them.

       A single node in the middle of the opening is not enough, and the
       reason is worth stating because it cost four hand-placed nodes in
       an earlier stage before anyone saw the pattern. The leg from a
       room's center to a doorway is a DIAGONAL, and a body a foot and
       ten across taking a three-foot-eight opening at an angle clips the
       jamb, stops, and is stuck in the middle of a perfectly good
       doorway. Approach square and go straight through. */
    let gi = byDoor.get(best);
    if (gi === undefined) {
      const t = gates[best];
      const y = t.mid.y;
      /* The approach points are waypoints like any other and can land
         behind a bin as easily as a declared one can. The threshold
         itself is never moved: it is the hole in the wall. */
      /* EACH SIDE STANDS ON ITS OWN GROUND.

         Both approach points used to take the doorway's own y, which is
         the INSIDE floor level -- and the Old Academy stands three feet
         above its yard, so the waypoint outside the west service door
         hung three feet in the air over the apron. The walker reached
         the one before it, found the next one above its head, and
         stopped there: the supervisor spent the back half of the tour
         standing at the coach bays describing rooms nobody could see. */
      const pa = unstick(level, { x: t.a.x, y: settle(level, t.a.x, t.a.z, y), z: t.a.z, tag: `door.${best}.a` }, r, h);
      const pb = unstick(level, { x: t.b.x, y: settle(level, t.b.x, t.b.z, y), z: t.b.z, tag: `door.${best}.b` }, r, h);
      const na = g.add(pa);
      const nm = g.add({ x: t.mid.x, y, z: t.mid.z, tag: `door.${best}` });
      const nb = g.add(pb);
      g.link(na, nm);
      g.link(nm, nb);
      gi = { a: na, b: nb };
      byDoor.set(best, gi);
    }
    /* whichever side each room is actually on */
    const t = gates[best];
    const aFirst = Math.hypot(a.x - t.a.x, a.z - t.a.z)
      <= Math.hypot(a.x - t.b.x, a.z - t.b.z);
    /* GOING OUTSIDE IS NOT FREE. Two rooms at the back of the west wing
       and the east wing are eighty feet apart through the building and
       sixty across the rear porch, so the shortest route between the
       platform corridor and the baggage room was out of one porch door,
       along the back of the building and in at the other -- which is
       not what anybody does, and which walked the supervisor into a
       shut exterior door on the first night with the terminal not yet
       open. Weighted rather than forbidden, because some rooms really
       are only reachable that way and the porches are part of the
       building's circulation. */
    const scale = t.exterior ? 6 : 1;
    linkWalkable(g, ia, aFirst ? gi.a : gi.b, clear, scale);
    linkWalkable(g, ib, aFirst ? gi.b : gi.a, clear, scale);
  }

  /* ---- and a last pass over whatever is still a lie ----
     A bend invents a corner in open space, which is the right answer
     when something small is in the way and the wrong one when the
     obstruction is a fitted counter running most of a wall. By this
     point the graph has a waypoint at every doorway and a standing spot
     either side of each, so the cheapest fix left is to route the edge
     through a waypoint that can see both ends -- an ordinary visibility
     relaxation, over the nodes the building already has.

     The blocked edge is REMOVED rather than left alongside the detour,
     because it is shorter and the router would go on choosing it. */
  const nodes2 = g.nodes;
  for (let a = 0; a < nodes2.length; a++) {
    for (const [b] of g.adj[a].slice()) {
      if (b < a) continue;
      const na = nodes2[a], nb = nodes2[b];
      if (Math.abs((na.y || 0) - (nb.y || 0)) > A_STORY) continue;
      if (clear(na, nb)) continue;
      let via = -1, viaCost = Infinity;
      for (let m = 0; m < nodes2.length; m++) {
        if (m === a || m === b) continue;
        const nm = nodes2[m];
        if (Math.abs((nm.y || 0) - (na.y || 0)) > A_STORY) continue;
        const cost = Math.hypot(na.x - nm.x, na.z - nm.z)
          + Math.hypot(nb.x - nm.x, nb.z - nm.z);
        if (cost >= viaCost) continue;
        if (!clear(na, nm) || !clear(nm, nb)) continue;
        via = m; viaCost = cost;
      }
      if (via < 0) continue;
      g.unlink(a, b);
      g.link(a, via);
      g.link(via, b);
    }
  }

  /* ---- every place the job happens is on the graph ----
     nav.js in the level is the building's CIRCULATION: rooms, halls,
     stairs, doorways. That is the right thing to write by hand and it
     is not the whole graph, because a terminal's work does not all
     happen in the middle of rooms. The coach yard is a hundred and
     forty feet of apron with four bays, a staging line and a canopy on
     it, and the declared graph gave it two waypoints, both at the far
     north end by the gate -- so anybody standing at a bay had no
     waypoint they could see, `nearest` fell back to raw distance,
     handed back a node inside the building, and the walker set off at
     the outside wall.

     A station is the level saying "work happens here". Anywhere that is
     not already covered gets a waypoint and is tied into whatever it
     can see. */
  for (const st of level.stations.values()) {
    if (!st.box) continue;
    const b = st.box;
    const c = { x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 };
    const room = level.roomAt(c.x, (b.y0 || 0) + 0.1, c.z);
    const y = room ? room.y0 : (b.y0 || 0);
    let spot = null;
    for (let d = 0.7; d <= 2.6 && !spot; d += 0.3) {
      for (let a = 0; a < 12; a++) {
        const th = (a / 12) * Math.PI * 2;
        const x = c.x + Math.cos(th) * d, z = c.z + Math.sin(th) * d;
        if (!level.collision.fits(x, y + 0.05, z, r, h)) continue;
        spot = { x, y, z, tag: `work.${st.id}` };
        break;
      }
    }
    if (!spot) continue;
    /* already served by something it can see */
    const near = [];
    for (let i = 0; i < g.nodes.length; i++) {
      const n = g.nodes[i];
      if (Math.abs((n.y || 0) - y) > A_STORY) continue;
      const dd = Math.hypot(n.x - spot.x, n.z - spot.z);
      if (dd > 22 || !clear(spot, n)) continue;
      near.push([dd, i]);
    }
    near.sort((u, v) => u[0] - v[0]);
    if (near.length && near[0][0] < 2.5) continue;
    if (!near.length) continue;
    const ni = g.add(spot);
    for (const [, i] of near.slice(0, 3)) g.link(ni, i);
  }

  /* ---- and nothing is left in the graph that is not true ----
     Everything above tries to REPAIR an edge that cannot be walked: put
     a waypoint in the doorway, bend it around the furniture, route it
     through a node that can see both ends. What is left after all that
     is an edge no repair could find a way through, and leaving it in is
     the worst of the options -- it is shorter than the honest route, so
     Dijkstra picks it every time, and the walker sets off through a
     wall. The yard was joined to the rear of the building by one such
     edge, and every route off the platform took it.

     So they go. An edge is only kept if dropping it would strand a node
     altogether, because a room that cannot be routed to at all is a
     worse failure than one routed to badly, and the harness counts
     both. */
  for (let a = 0; a < g.nodes.length; a++) {
    for (const [b] of g.adj[a].slice()) {
      if (b < a) continue;
      const na = g.nodes[a], nb = g.nodes[b];
      if (Math.abs((na.y || 0) - (nb.y || 0)) > A_STORY) continue;
      if (clear(na, nb)) continue;
      if (g.adj[a].length <= 1 || g.adj[b].length <= 1) continue;
      g.unlink(a, b);
    }
  }

  /* ---- and going outside costs what it should ----
     Marking the doorway was not enough and the reason is instructive:
     the porch route did not cross a doorway edge at all. Once outside,
     the back of the building is a straight run of ordinary walkable
     edges between ordinary waypoints, so the penalty has to sit on
     BEING OUTSIDE rather than on the act of stepping out.

     Sixty feet across the rear porch beats eighty through the building
     on distance alone, which is how the platform corridor came to be
     joined to the baggage room by way of the garden. A person does not
     do that, and on a first night with the terminal not yet open they
     could not: those doors are shut until the clerk unlocks them. */
  const outdoors = g.nodes.map((n) => {
    const r = level.roomAt(n.x, (n.y || 0) + 0.1, n.z);
    return !r || r.outdoor;
  });
  for (let a = 0; a < g.nodes.length; a++) {
    for (const e of g.adj[a]) {
      if (outdoors[a] && outdoors[e[0]]) e[1] *= OUTSIDE_COST;
    }
  }
  return g;
}
