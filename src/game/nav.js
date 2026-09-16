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
export function graphFromLevel(level) {
  return new NavGraph(level.navNodes.slice(), level.navEdges.slice());
}
