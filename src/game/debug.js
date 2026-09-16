/* ============================================================
   debug.js -- developer diagnostics, kept out of the player's way.

   Final Rental's debugging lived on `window.__game` and in twenty-odd
   headless harnesses under tools/. Both of those are good ideas and both
   are carried over. What it did not have was anything to look at while
   playing, which is the thing you actually want when a building is being
   laid out to real measurements and the question is "how far is that
   wall, and am I on the floor I think I am".

   F1 cycles the overlay: off, a one-line strip, the full read-out.
   F2 draws the collision world.

   None of this is on the HUD. It is a separate layer, it is off by
   default, and it says nothing a player would want to read.
   ============================================================ */
import { MeshBuilder } from '../engine/mesh.js';
import { F_EMIT, F_BLEND, F_DOUBLE } from '../engine/raster.js';
import { toFtIn, toFt } from '../engine/units.js';
import { makeTex } from '../engine/texture.js';

export class Debug {
  constructor() {
    /** 0 off, 1 one line, 2 everything. */
    this.level = 0;
    this.showCollision = false;
    this.fps = 0;
    this._frames = 0;
    this._acc = 0;
    this._colMesh = null;
    this._colT = 0;
    this._colAt = { x: 1e9, z: 1e9 };
    this._tex = null;
  }

  cycle() { this.level = (this.level + 1) % 3; }

  update(dt) {
    this._frames++;
    this._acc += dt;
    if (this._acc >= 0.5) {
      this.fps = Math.round(this._frames / this._acc);
      this._frames = 0; this._acc = 0;
    }
  }

  /** @param g the Game, read-only */
  html(g) {
    if (!this.level) return '';
    const p = g.player;
    if (!p) return '';
    const room = g.level ? g.level.roomAt(p.x, p.y, p.z) : null;
    const pos = `${p.x.toFixed(2)} ${p.y.toFixed(2)} ${p.z.toFixed(2)}`;

    if (this.level === 1) {
      return `<div class="dbg-line">${this.fps} fps &middot; ${pos} &middot; `
        + `${room ? room.name : 'outside'} &middot; ${g.state}</div>`;
    }

    const tgt = g.level && g.level.interact.target;
    const surf = p.surface;
    const rows = [
      ['fps', `${this.fps}`],
      ['state', g.state],
      ['pos (m)', pos],
      ['pos (ft)', `${toFt(p.x).toFixed(1)} ${toFt(p.y).toFixed(1)} ${toFt(p.z).toFixed(1)}`],
      ['eye', `${(p.y + p.eye).toFixed(2)} m / ${toFtIn(p.y + p.eye)}`],
      ['yaw / pitch', `${(p.yaw * 57.2958).toFixed(0)}° / ${(p.pitch * 57.2958).toFixed(0)}°`],
      ['room', room ? `${room.name} (${room.id})` : 'outside'],
      ['floor', room ? String(room.floor) : '-'],
      ['on', surf ? `${surf.tag || 'floor'}${surf.material ? ' / ' + surf.material : ''}` : 'air'],
      ['grounded', p.grounded ? 'yes' : `no (vy ${p.vy.toFixed(2)})`],
      ['stance', p.crouch > 0.5 ? 'crouched' : 'standing'],
      ['look at', tgt ? tgt.id : '-'],
      ['chunks', g.level ? `${g.level.stats.chunksDrawn}/${g.level.stats.chunks}` : '-'],
      ['tris', g.level ? String(g.level.stats.tris) : '-'],
      ['solids', g.level ? String(g.level.collision.solids.length + g.level.collision.dynamic.length) : '-'],
      ['shift', g.campaign ? `${g.campaign.shift ? g.campaign.shift.id : '-'} ${g.campaign.phase}` : '-'],
      ['audio', g.audio.ready ? `${g.audio.ctx.state}` : 'not started'],
    ];
    return `<table class="dbg">${rows.map(([k, v]) =>
      `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>`
      + `<div class="dbg-keys">F1 overlay &middot; F2 collision &middot; F3 teleport up</div>`;
  }

  /* ---------------- collision view ---------------- */

  /**
   * Draw the collision world as translucent boxes.
   *
   * Only what is near the player, and rebuilt at most twice a second:
   * a whole building's worth of edge geometry submitted every frame in a
   * software rasterizer is not a diagnostic, it is a slideshow.
   */
  drawCollision(rz, level, p, mat) {
    if (!this.showCollision || !level) return;
    const moved = Math.hypot(p.x - this._colAt.x, p.z - this._colAt.z) > 3;
    if (!this._colMesh || moved) {
      this._colAt = { x: p.x, z: p.z };
      this._colMesh = this._buildCollisionMesh(level, p);
    }
    if (this._colMesh) rz.drawMesh(this._colMesh, mat, { flags: F_BLEND | F_DOUBLE | F_EMIT });
  }

  _tint(css) {
    if (!this._tex) this._tex = {};
    if (!this._tex[css]) {
      this._tex[css] = makeTex(8, 8, (g, w, h) => { g.fillStyle = css; g.fillRect(0, 0, w, h); });
    }
    return this._tex[css];
  }

  _buildCollisionMesh(level, p) {
    const R = 16;
    const mb = new MeshBuilder();
    mb.light = () => 1;
    mb.maxEdge = 999;              // no subdivision: these are diagnostics
    const near = (b) => Math.abs((b.x0 + b.x1) / 2 - p.x) < R && Math.abs((b.z0 + b.z1) / 2 - p.z) < R;
    const shell = (b, css, inset) => {
      const t = inset || 0.01;
      mb.box(b.x0 + t, b.y0 + t, b.z0 + t, b.x1 - t, b.y1 - t, b.z1 - t,
        { all: { tex: this._tint(css), uv: [0, 0, 8, 8] } });
    };
    const c = level.collision;
    for (const s of c.solids) if (near(s)) shell(s, s.tag === 'door' ? '#d05a3a' : '#3a6ad0');
    for (const s of c.dynamic) if (near(s)) shell(s, '#d0a03a');
    for (const f of c.floors) {
      if (!near({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 })) continue;
      shell({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1, y0: f.y, y1: f.y + 0.03 }, '#3ad06a');
    }
    for (const r of c.ramps) {
      if (!near({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 })) continue;
      /* A ramp is drawn as the sloped quad it is, so the thing the player
         is actually walking on is visible rather than inferred. */
      const t = this._tint('#d03ac0');
      const up = r.axis === 'x';
      const p0 = up ? [r.x0, r.yLow, r.z0] : [r.x0, r.yLow, r.z0];
      const p1 = up ? [r.x1, r.yHigh, r.z0] : [r.x1, r.yLow, r.z0];
      const p2 = up ? [r.x1, r.yHigh, r.z1] : [r.x1, r.yHigh, r.z1];
      const p3 = up ? [r.x0, r.yLow, r.z1] : [r.x0, r.yHigh, r.z1];
      mb.quad(p0, p1, p2, p3, t, [0, 0, 8, 8], F_DOUBLE, [1, 1, false]);
    }
    return mb.sh.length ? mb.build() : null;
  }
}
