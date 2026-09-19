/* ============================================================
   game.js -- the application.

   THIS FILE IS DELIBERATELY SMALL, and keeping it that way is one of the
   acceptance criteria for this stage. Final Rental's game.js is 4,295
   lines: the renderer, the shift clock, the customer line, the phone,
   the police, the popcorn machine, the vacuum cleaner and the endings all
   live on one object, reaching into each other's fields. It works, and it
   is the single largest piece of technical debt in that repository -- a
   change to how doors sound is a change to the same file as the ending
   sequence.

   Here the Game owns the loop and the state machine, and nothing else:

       frame()  ->  update the current state  ->  render

   Everything a state needs is a system it asks for. The level owns its
   own geometry, collision, interactables and doors. The campaign owns
   what shift it is. The menu controller owns menus. Settings own
   settings. When the job simulation arrives it will be modules
   registered with the play state, not methods added here.
   ============================================================ */
import { Raster } from '../engine/raster.js';
import { PostFX } from '../engine/postfx.js';
import { Input } from '../engine/input.js';
import { AudioEngine } from '../engine/audio.js';
import { makeTex } from '../engine/texture.js';
import { mat, invertRigid, clamp } from '../engine/mathx.js';
import { SCALE } from '../engine/units.js';

import { UI } from '../ui/ui.js';
import { MenuController, pauseScreen, settingsScreen, controlsScreen, infoScreen, action } from '../ui/menus.js';
import { glyph, setScheme, setInput } from '../ui/glyphs.js';

import { Settings, RESOLUTIONS, defaultSettings } from './settings.js';
import { SaveGame, Profile } from './save.js';
import { Campaign, TEST_CAMPAIGN, PHASE } from './campaign.js';
import { Sfx } from './sfx.js';
import { Debug } from './debug.js';
import { Power } from './terminal/power.js';
import { Fleet } from './terminal/fleet.js';

/** Every image-degradation stage off. See the note at the call site. */
const REVIEW_POST = { dither: false, bleed: 0, scan: 1, ghost: 0, grain: 0, vignette: 0 };
import { createPlayer, updatePlayer, buildCamera, forwardOf, eyePoint } from './player.js';
import { Npc, patrol } from './npc.js';
import { buildActorMeshes, makeActorSkin, drawActor, ACTOR_HEIGHT, WARDROBE } from './actor.js';
import { Interactable } from './interaction.js';
import { graphFromLevel } from './nav.js';

import { buildMaterials } from '../world/materials.js';
import { buildLevel } from '../world/level.js';
import { testbed } from '../world/levels/testbed.js';
import { academy } from '../world/levels/academy/index.js';

export const ST = {
  BOOT: 'BOOT',
  TITLE: 'TITLE',
  MENU: 'MENU',      // a menu opened from the title
  PLAY: 'PLAY',
  PAUSE: 'PAUSE',
};

/**
 * Every level this build knows how to load.
 *
 * `testbed` is Stage 1's disposable engine rig. It is kept because the
 * engine harnesses under tools/ still exercise the collider, the doors
 * and the interaction system against it, and because a neutral room is a
 * better place to find an engine bug than a historic building is. It is
 * not part of the game.
 */
const LEVELS = { testbed, academy };

export class Game {
  constructor(canvas) {
    this.canvas = canvas || document.getElementById('screen');
    this.ui = new UI();
    this.input = new Input(this.canvas);
    this.audio = new AudioEngine();
    this.sfx = new Sfx(this.audio);
    this.settings = new Settings();
    this.save = new SaveGame();
    this.profile = new Profile();
    this.campaign = new Campaign(TEST_CAMPAIGN);
    this.menu = new MenuController(this.ui, this.sfx);
    this.debug = new Debug();

    this.state = ST.BOOT;
    this.level = null;
    this.player = null;
    this.npcs = [];
    this.time = 0;
    this.playtime = 0;
    this.fade = 1;
    this.fadeTo = 0;
    this.wantLock = false;
    this.rebinding = null;
    this.rebindDevice = null;
    this.roomLights = {};
    this._emitters = [];

    this._mats = { cam: mat(), view: mat(), id: mat() };
    this.frame = this.frame.bind(this);
  }

  /* ============================================================
     BOOT
     ============================================================ */
  async boot() {
    this.settings.load();
    this.profile.load();

    const [rw, rh] = RESOLUTIONS[this.settings.get('resolution')];
    this.raster = new Raster(rw, rh);
    this.post = new PostFX(this.canvas, rw, rh);

    this.materials = buildMaterials();
    /* One mesh set per wardrobe. Six of them, because a terminal with
       fifteen people in it and one skin is a terminal full of the same
       person -- and because the meshes are a few dozen triangles each,
       so the whole cast costs less than a window. */
    this.actorSkins = WARDROBE.map((_, i) => makeActorSkin(makeTex, i));
    this.actorMeshSets = this.actorSkins.map((sk) => buildActorMeshes(sk));
    this.actorSkin = this.actorSkins[0];
    this.actorMeshes = this.actorMeshSets[0];

    setInput(this.input);
    this.settings.apply(this.systems());

    this.input.onLockChange = (locked) => {
      /* Losing the pointer means the player alt-tabbed or hit Escape, and
         the shift should stop rather than carry on behind a window nobody
         is looking at. It does NOT mean a lock we released on purpose, or
         one the browser refused to hand back -- a request made without a
         fresh gesture is simply denied, and treating that as "the player
         left" pauses the game at random. */
      const ours = this.time - (this._lockAskedT || -99) < 0.6;
      if (locked) { this.wantLock = true; return; }
      if (ours) return;
      if (this.state === ST.PLAY) this.pause();
    };
    this.input.onGesture = () => {
      /* The first gesture is also what starts the audio graph: every
         browser refuses an AudioContext outside one. */
      if (!this.audio.ready) { this.audio.init(); this.settings.apply(this.systems()); }
      this.audio.resume();
      if (!this.wantLock || this.input.locked) return;
      if (this.state !== ST.PLAY) return;
      this.grabLock();
    };
    this.input.onCaptured = (act, what, res) => {
      this.rebinding = null;
      this.rebindDevice = null;
      if (what !== null) {
        this.settings.captureBinds(this.input);
        this.persistSettings();
      } else if (res && !res.ok && !res.cancelled && res.reason) {
        /* Refused rather than cancelled. The player pressed a key and
           nothing happened, so say what and why -- silence here reads as
           a broken controls screen. */
        this.ui.toast(res.reason, 'warn');
        this.sfx.uiError();
      }
      this.menu.render();
    };

    addEventListener('resize', () => this.layout());
    /* Chromium and Firefox both suspend an AudioContext with the tab, and
       Firefox will not resume one from a timer -- only from an event. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.audio.resume();
    });

    /* The title screen drifts over the level the campaign would start on,
       so the first thing anybody sees is the building rather than a rig. */
    this.loadLevel(this.campaign.def.shift(0).level);
    this.toTitle(true);

    this.last = performance.now();
    requestAnimationFrame(this.frame);
    return this;
  }

  systems() {
    return {
      input: this.input, audio: this.audio,
      raster: this.raster, post: this.post, game: this,
    };
  }

  /**
   * Put every setting back to its default, keeping the bindings.
   *
   * There is a reason this exists: a menu row is one keypress from being
   * toggled by accident while looking for another one, and "invert look"
   * toggled by accident is a game that feels broken with no obvious
   * cause. Bindings are deliberately excluded -- CONTROLS has its own
   * two reset actions, and someone who has rebound the keyboard does not
   * want it wiped because they wanted the volume back.
   */
  resetSettings() {
    const v = this.settings.values;
    const d = defaultSettings();
    for (const k of Object.keys(d)) {
      if (k === 'keyBinds' || k === 'padBinds') continue;
      v[k] = d[k];
    }
    this.settings.apply(this.systems());
    this.persistSettings();
  }

  onSettingsApplied(v) {
    const [rw, rh] = RESOLUTIONS[v.resolution];
    if (this.raster && this.raster.w !== rw) {
      this.raster.resize(rw, rh);
      this.post.resize(rw, rh);
    }
  }

  layout() {
    const [rw, rh] = RESOLUTIONS[this.settings.get('resolution')];
    if (this.raster.w !== rw) { this.raster.resize(rw, rh); this.post.resize(rw, rh); }
  }

  persistSettings() {
    this.settings.captureBinds(this.input);
    this.settings.save();
  }

  /* ============================================================
     LEVELS
     ============================================================ */
  loadLevel(id) {
    const def = LEVELS[id];
    if (!def) throw new Error(`no level "${id}"`);
    this.stopAmbience();
    this.level = buildLevel(def, this.materials);
    this.nav = graphFromLevel(this.level);
    this.player = createPlayer(this.level.spawn);
    /* ---- the building's electricity ----
       Built from the schedule the level declared, and only if it
       declared one: the testbed has no breaker panel and does not need
       to pretend it has. */
    this.power = this.level.circuits.length ? new Power(this.level, {
      onTrip: (c) => this.onCircuitTrip(c),
      toast: (t) => this.ui.toast(t),
    }) : null;
    if (this.power) {
      this.power.openForBusiness();
      this.power.bind(this.level, this.ctx());
      this.power.apply();
    }
    /* ---- the coaches ----
       One mesh, built once, and a matrix per bus. The fleet adds itself
       to level.movers, so a coach standing at a berth is eight and a
       half feet of solid on the apron like anything else. */
    this.fleet = new Fleet(this.materials, this.level);
    this.roomLights = {};
    for (const r of this.level.rooms) this.roomLights[r.id] = true;
    this.level.chunkShade = {};
    this.raster.setFog(this.level.fog.near, this.level.fog.far);
    this.raster.far = this.level.far;
    this.spawnNpcs();
    return this.level;
  }

  /** Everybody in the world this frame: test actors, passengers, crew. */
  allActors() {
    if (!this.shift || !this.shift.running) return this.npcs;
    return this.npcs.concat(this.shift.actors());
  }

  spawnNpcs() {
    this.npcs = [];
    const route = this.level.marks.patrol;
    if (!route) return;
    /* One test actor. It walks a triangle in the hall, which is enough to
       show that an NPC can be placed, pathed, collided, animated, drawn
       and looked at. It is not a character and it has nothing to say. */
    const npc = new Npc({
      id: 'test-actor', name: 'test actor',
      x: route[0].x, y: route[0].y, z: route[0].z,
      states: patrol(route, 1.4),
      state: 'walk',
      data: { at: 0 },
    });
    this.npcs.push(npc);
    this.level.interact.add(new Interactable({
      id: 'npc:test-actor',
      cylFn: () => npc.cylinder(),
      describe: () => ({
        text: 'Get their attention',
        sub: 'test actor',
        action: () => this.ui.toast('The test actor does not react. Nothing here talks yet.'),
        hold: 0,
      }),
    }));
  }

  startAmbience() {
    if (!this.audio.ready || this._emitters.length) return;
    for (const a of this.level.ambient) {
      const e = a.kind === 'fluorescent'
        ? this.sfx.fluorescent(a.x, a.y, a.z, a)
        : this.sfx.airbed(a.x, a.y, a.z, a);
      if (e) { e.room = a.room; this._emitters.push(e); }
    }
    this.applyRoomLights();
  }

  stopAmbience() {
    for (const e of this._emitters) e.stop();
    this._emitters.length = 0;
  }

  /* ============================================================
     THE LOOP
     ============================================================ */
  frame(now) {
    this.input.poll();
    if (this.input.scheme !== this._scheme) {
      this._scheme = this.input.scheme;
      setScheme(this._scheme);
      if (this.menu.open) this.menu.render();
      if (this.state === ST.TITLE) this.renderTitle();
    }

    let dt = (now - this.last) / 1000;
    this.last = now;
    /* A tab that has been in the background hands back an enormous delta.
       Clamping it means coming back to the room you left rather than to
       four minutes of simulation in one step. */
    if (dt > 0.1) dt = 0.1;
    if (!(dt > 0)) dt = 0.016;
    this.time += dt;

    this.debug.update(dt);
    if (this.devTools) {
      if (this.input.rawHit('F1')) this.debug.cycle();
      if (this.input.rawHit('F2')) this.debug.showCollision = !this.debug.showCollision;
      if (this.input.rawHit('F4')) this.debug.reviewMode = !this.debug.reviewMode;
    }

    this.fade += (this.fadeTo - this.fade) * Math.min(1, dt * 3.2);

    switch (this.state) {
      case ST.TITLE: this.updateTitle(dt); break;
      case ST.MENU: this.updateMenu(dt); break;
      case ST.PLAY: this.updatePlay(dt); break;
      case ST.PAUSE: this.updateMenu(dt); break;
      default: break;
    }

    this.audio.update(dt, this.player
      ? { x: this.player.x, y: this.player.y + this.player.eye, z: this.player.z, yaw: this.player.yaw }
      : null);
    this.ui.update(dt);
    this.render(dt);
    this.ui.setDebug(this.debug.html(this));
    this.input.endFrame();
    requestAnimationFrame(this.frame);
  }

  /* ============================================================
     TITLE
     ============================================================ */
  toTitle(first) {
    this.state = ST.TITLE;
    this.menu.close();
    this.stopAmbience();
    this.ui.showTitle(true);
    this.ui.setHudVisible(false);
    this.ui.setPrompt('');
    this.ui.setClock('', '');
    this.ui.setObjective('');
    this.dropLock();
    this.wantLock = false;
    this.titleSel = 0;
    /* Worked out here rather than in titleItems(), which is asked for the
       list every frame the title is up. */
    this._canContinue = this.save.resumable(this.known());
    this.campaign.phase = PHASE.IDLE;
    this.renderTitle();
    this.fadeTo = 0;
    if (first) this.fade = 1;
  }

  titleItems() {
    const items = [
      { id: 'new', label: 'NEW TEST GAME', sub: 'the technical testbed' },
    ];
    if (this._canContinue) items.push({ id: 'continue', label: 'CONTINUE', sub: 'resume the saved shift' });
    items.push({ id: 'settings', label: 'SETTINGS' });
    items.push({ id: 'controls', label: 'CONTROLS' });
    items.push({ id: 'howto', label: 'HOW TO PLAY' });
    if (isDesktop()) items.push({ id: 'quit', label: 'QUIT' });
    return items;
  }

  renderTitle() {
    this.ui.setTitleMenu(this.titleItems(), this.titleSel);
  }

  updateTitle(dt) {
    const i = this.input;
    const items = this.titleItems();
    if (i.hit('uiUp')) { this.titleSel = (this.titleSel - 1 + items.length) % items.length; this.sfx.uiMove(); this.renderTitle(); }
    if (i.hit('uiDown')) { this.titleSel = (this.titleSel + 1) % items.length; this.sfx.uiMove(); this.renderTitle(); }
    if (i.hit('uiConfirm')) {
      this.sfx.uiSelect();
      this.titleAction(items[this.titleSel].id);
    }
  }

  titleAction(id) {
    switch (id) {
      case 'new': this.newGame(); break;
      case 'continue': this.continueGame(); break;
      case 'settings': this.openTitleMenu(settingsScreen(this)); break;
      case 'controls': this.openTitleMenu(controlsScreen(this)); break;
      case 'howto': this.openTitleMenu(this.howToScreen()); break;
      case 'quit': this.quitApplication(); break;
      default: break;
    }
  }

  howToScreen() {
    return infoScreen('HOW TO PLAY', [
      `${glyph('move')} walk &nbsp; ${glyph('look')} look around`,
      `${glyph('run')} hurry &nbsp; ${glyph('crouch')} crouch`,
      `${glyph('interact')} use whatever you are looking at`,
      `${glyph('pause')} pause`,
      '',
      'This is a technical testbed, not a level of the game.',
      'Walk the stairs, open the doors, go outside.',
      'F1 shows the developer read-out. F2 draws the collision world.',
    ], () => this.menu.back());
  }

  openTitleMenu(screen) {
    this.state = ST.MENU;
    this.ui.showTitle(false);
    this.menu.show(screen);
  }

  /* ============================================================
     MENUS (title submenus and pause both land here)
     ============================================================ */
  updateMenu(dt) {
    const i = this.input;
    if (this.rebinding) return;      // the capture owns the keyboard
    if (i.hit('uiUp')) this.menu.move(-1);
    if (i.hit('uiDown')) this.menu.move(1);
    if (i.hit('uiLeft')) this.menu.adjust(-1);
    if (i.hit('uiRight')) this.menu.adjust(1);
    if (i.hit('uiConfirm')) this.menu.confirm();
    if (i.hit('uiBack') || i.hit('pause')) {
      this.sfx.uiBack();
      if (!this.menu.back()) {
        if (this.state === ST.PAUSE) this.resume();
        else this.toTitle();
      }
    }
  }

  beginRebind(action, device) {
    this.rebinding = action;
    this.rebindDevice = device;
    this.input.capture(action, device);
    this.menu.render();
  }

  /* ============================================================
     PLAY
     ============================================================ */
  newGame() {
    this.save.clear();
    this.campaign.reset();
    this.loadLevel(this.campaign.def.shift(0).level);
    this.campaign.start(0, this.ctx());
    this.beginPlay();
    this.ui.toast('Test shift started');
  }

  /** What this build can open: anything else in a save is a refusal. */
  known() {
    return { campaigns: new Set([TEST_CAMPAIGN.id]), levels: new Set(Object.keys(LEVELS)) };
  }

  continueGame() {
    const r = this.save.load(this.known());
    if (!r.ok) {
      this.ui.toast(`Could not load: ${r.reason}`, 'warn');
      this.renderTitle();
      return;
    }
    const levelId = (this.save.data.player && this.save.data.player.level) || 'testbed';
    this.loadLevel(levelId);
    this.save.restore(this.campaign, this.player, this.level);
    const w = this.save.data.world || {};
    if (this.power) this.power.restore(w.power);
    if (this.fleet && this.fleet.enabled) this.fleet.restore(w.fleet);
    if (this.campaign.phase !== PHASE.ACTIVE) this.campaign.phase = PHASE.ACTIVE;
    this.beginPlay();
    this.ui.toast('Shift resumed');
  }

  beginPlay() {
    this.state = ST.PLAY;
    this.menu.close();
    this.ui.showTitle(false);
    this.ui.setHudVisible(true);
    this.fadeTo = 0;
    this.wantLock = true;
    this.player.frozen = false;
    if (!this.audio.ready) this.audio.init();
    this.settings.apply(this.systems());
    this.startAmbience();
    this.grabLock();
    this.updateObjectiveLine();
  }

  updatePlay(dt) {
    const i = this.input;
    if (i.hit('pause')) { this.pause(); return; }

    this.playtime += dt;
    this.campaign.update(dt);
    this.level.update(dt);
    if (this.power) this.power.update(dt);
    if (this.fleet) this.fleet.update(dt);

    const ctx = this.ctx();
    updatePlayer(this.player, dt, i, ctx);

    for (const n of this.npcs) n.update(dt, ctx);

    /* ---- interaction ---- */
    const eye = eyePoint(this.player);
    const dir = forwardOf(this.player);
    const useDown = i.isDown('interact');
    this.level.interact.update(eye, dir, ctx, dt, useDown);
    if (this.level.interact.activate(ctx, i.hit('interact'))) {
      /* an action ran; its own code says what happened */
    }
    this.showPrompt();

    this.checkObjectives();
    this.ui.setClock(this.campaign.clockString(), this.campaign.shift ? this.campaign.shift.name.toUpperCase() : '');

    /* Interiors and the outdoors want different fog. Switching on the
       room the camera is in is crude and it is also exactly right: the
       player is either in the building or they are not. */
    const room = this.level.roomAt(this.player.x, this.player.y, this.player.z);
    const outside = !room || room.outdoor;
    const f = this.level.fog;
    if (this.devTools && this.debug.reviewMode) {
      /* Fog is atmosphere, and atmosphere is exactly what gets in the way
         of judging a facade against a photograph of one. */
      this.raster.setFog(this.level.far * 0.9, this.level.far);
    } else {
      this.raster.setFog(outside ? f.near * 1.6 : f.near, outside ? f.far * 1.5 : f.far);
    }

    if (!this.input.locked && this.input.scheme === 'kbm' && this.wantLock) {
      /* Telling a player to click when clicking cannot work is worse than
         saying nothing. A page that has refused pointer lock outright --
         an iframe embed without allow="pointer-lock" is the usual one --
         gets the truth and the way round it instead. */
      this.ui.notice(this.input.lockBlocked
        ? 'This page will not let the game take the mouse. Open it in its own tab, or use a controller.'
        : 'Click to look around');
    } else this.ui.notice('');

    // F3: put the player on the gallery, for testing the upper floor fast
    if (i.rawHit('F3')) {
      const m = this.level.marks.stairTop;
      if (m) { this.player.x = m.x; this.player.y = m.y; this.player.z = m.z; this.player.vy = 0; }
    }
  }

  showPrompt() {
    const it = this.level.interact;
    const p = it.prompt;
    this.ui.setReticle(!!it.target);
    if (!p) { this.ui.setPrompt(''); this.ui.setHold(0); return; }
    const key = p.action && !p.disabled ? glyph('interact') : '';
    const hold = p.hold ? '<span class="hold">hold</span> ' : '';
    this.ui.setPrompt(`${key}${hold}${p.text}`, p.sub || '');
    this.ui.setHold(it.holdFraction());
  }

  /* ---------------- the world's side of interaction ---------------- */

  /**
   * Everything an interactable is handed. This is the ONE place the game
   * exposes itself to the world, and keeping it explicit is what stops a
   * light switch reaching into the renderer.
   */
  ctx() {
    if (!this._ctx) {
      this._ctx = {
        game: this,
        get level() { return this.game.level; },
        get player() { return this.game.player; },
        collision: null,
        nav: null,
        hasKey: (k) => this.campaign.hasFlag(`key:${k}`),
        useDoor: (d) => this.useDoor(d),
        doorLocked: (d) => this.doorLocked(d),
        openTestCrate: () => this.openTestCrate(),
        roomLit: (id) => this.roomLit(id),
        toggleRoomLights: (id) => this.toggleRoomLights(id),
        get power() { return this.game.power; },
        get fleet() { return this.game.fleet; },
        toast: (t, k) => this.ui.toast(t, k),
      };
    }
    this._ctx.collision = this.level.collision;
    this._ctx.nav = this.nav;
    this._ctx.onStep = (m, run) => this.sfx.footstep(m, run);
    this._ctx.onLand = (h) => this.sfx.land(h);
    return this._ctx;
  }

  /** Everything about the world that belongs in the save. */
  worldExtras() {
    const out = {};
    if (this.power) out.power = this.power.save();
    if (this.fleet && this.fleet.enabled) out.fleet = this.fleet.save();
    return out;
  }

  /**
   * A breaker has gone. Nothing supernatural happens: the lights in
   * those rooms go out, whatever was plugged in stops, and somebody has
   * to walk to the library and push it back up.
   */
  onCircuitTrip(c) {
    this.ui.toast(`Somewhere a breaker has gone: ${c.label.toLowerCase()}.`, 'warn');
  }

  useDoor(d) {
    const s = this.audio.spatial(d.x, d.y + 1, d.z, 14);
    const r = d.use(this.ctx());
    if (r === 'opened' || r === 'unlocked') this.sfx.doorOpen(s.pan);
    else if (r === 'closed') this.sfx.doorClose(s.pan);
    else this.sfx.lockedRattle(s.pan);
  }

  doorLocked(d) {
    const s = this.audio.spatial(d.x, d.y + 1, d.z, 14);
    this.sfx.lockedRattle(s.pan);
    this.ui.toast(d.lockedText);
  }

  openTestCrate() {
    this.level.marks.crateOpen = true;
    this.sfx.putDown(0);
    this.ui.toast('Empty. It is a test crate.');
    this.completeObjective('use-something');
  }

  roomLit(id) { return this.roomLights[id] !== false; }

  toggleRoomLights(id) {
    this.roomLights[id] = !this.roomLit(id);
    this.sfx.switchClick(this.roomLights[id]);
    this.applyRoomLights();
  }

  applyRoomLights() {
    for (const r of this.level.rooms) {
      /* 0.18 rather than 0: a pitch-black room in a 320x240 frame is a
         hole in the screen, and the player still has to be able to find
         the switch again. */
      this.level.chunkShade[r.id] = this.roomLit(r.id) ? 1 : 0.18;
    }
    for (const e of this._emitters) {
      if (!e.room) continue;
      e.gain = this.roomLit(e.room) ? (e._baseGain === undefined ? (e._baseGain = e.gain) : e._baseGain) : 0;
    }
  }

  /* ---------------- objectives ---------------- */

  checkObjectives() {
    if (this.campaign.phase !== PHASE.ACTIVE) return;
    const p = this.player;
    const room = this.level.roomAt(p.x, p.y, p.z);
    /* Read the floor off the room rather than off a height: levels do not
       agree about where the first floor's ceiling is, and a threshold in
       meters that means "upstairs" in one building means "halfway up the
       stairs" in the next. */
    if (room && room.floor >= 2) this.completeObjective('walk-upstairs');
    if (room && room.outdoor) this.completeObjective('go-outside');
  }

  completeObjective(id) {
    if (this.campaign.objectiveDone(id)) return;
    const shift = this.campaign.shift;
    const o = shift && shift.objectives.find((x) => x.id === id);
    if (!o) return;
    const all = this.campaign.completeObjective(id);
    this.ui.toast(`✓ ${o.text}`, 'good');
    this.sfx.uiSelect();
    this.updateObjectiveLine();
    this.autosave();
    if (all) this.ui.toast('Test shift complete. The engine works.', 'good');
  }

  updateObjectiveLine() {
    const left = this.campaign.remainingObjectives();
    this.ui.setObjective(left.length ? left[0].text : 'Test shift complete');
  }

  /* ---------------- pause ---------------- */

  pause() {
    if (this.state !== ST.PLAY) return;
    this.state = ST.PAUSE;
    this.player.frozen = true;
    this.dropLock();
    this.wantLock = false;
    this.ui.setPrompt('');
    this.ui.setHold(0);
    this.ui.notice('');
    this.ui.setHudVisible(false);
    this.sfx.uiBack();
    this.menu.show(pauseScreen(this));
  }

  resume() {
    this.state = ST.PLAY;
    this.menu.close();
    this.ui.setHudVisible(true);
    this.player.frozen = false;
    this.wantLock = true;
    this.grabLock();
  }

  quitToTitle() {
    this.autosave();
    this.toTitle();
  }

  quitApplication() {
    /* Electron closes the window when the page asks to; a browser tab
       cannot and should not, so say so instead of doing nothing. */
    if (isDesktop()) { window.close(); return; }
    this.ui.toast('Close the tab to quit.');
  }

  saveNow() {
    const ok = this.autosave();
    this.ui.toast(ok ? 'Saved.' : 'Could not save -- storage is unavailable.', ok ? 'good' : 'warn');
  }

  /**
   * Save without being asked. Used at every objective and on the way out.
   *
   * A failure here is not worth interrupting play for -- the shift carries
   * on in memory -- but it must not be silent either, or the player finds
   * out at the title screen that the last hour did not stick. Said once per
   * session, then left alone.
   */
  autosave() {
    this.profile.addPlaytime(0);
    const ok = this.save.autosave(this.campaign, this.player, this.level, this.playtime,
      this.worldExtras());
    if (!ok && !this._saveWarned) {
      this._saveWarned = true;
      this.ui.toast('This browser will not let the game save. Progress is kept until you close the tab.', 'warn');
    }
    if (ok) this._saveWarned = false;
    return ok;
  }

  /* ---------------- pointer lock ---------------- */

  grabLock() { this._lockAskedT = this.time; this.input.requestLock(); }
  dropLock() { this._lockAskedT = this.time; this.input.exitLock(); }

  /* ============================================================
     RENDER
     ============================================================ */
  render(dt) {
    const rz = this.raster;
    const m = this._mats;
    rz.clear(this.level ? this.level.sky : 0xFF000000);

    if (this.player && this.level) {
      buildCamera(this.player, m.cam);
      invertRigid(m.view, m.cam);
      const fov = this.settings.get('fieldOfView') * Math.PI / 180;
      rz.setCamera(m.view, fov);

      this.level.draw(rz, { identity: m.id });

      for (const n of this.allActors()) {
        if (n.hidden) continue;
        const room = this.level.roomAt(n.x, n.y + 1, n.z);
        /* Somebody standing in a room whose breaker is off is a
           silhouette, not a person. chunkLit is what the panel wrote. */
        const lit = room ? this.level.chunkLit[room.id] : undefined;
        const shade = lit === undefined ? 1 : 0.22 + 0.78 * lit;
        const set = this.actorMeshSets[(n.skin || 0) % this.actorMeshSets.length];
        drawActor(rz, set, n, shade);
      }

      this.debug.drawCollision(rz, this.level, this.player, m.id);
    }

    /* ARCHITECTURE REVIEW MODE (F4, development builds only).
       Strips the CRT so a screenshot can be held against a photograph
       without arguing with dither, bleed, scanlines, grain and a
       vignette. The geometry, the materials and the baked lighting are
       untouched -- this changes how the frame is PRESENTED and nothing
       about what was drawn, which is the only way the comparison means
       anything. It is not a graphics option and the player never sees
       it. */
    const review = this.devTools && this.debug.reviewMode;
    const p = review ? REVIEW_POST : this.settings.postParams();
    this.post.setVignette(review ? 0 : (p.vignette === undefined ? 0.42 : p.vignette));
    this.post.render(rz.color, {
      dt,
      dither: p.dither,
      bleed: p.bleed,
      scan: p.scan,
      ghost: p.ghost,
      grain: p.grain,
      fade: clamp(this.fade, 0, 1),
    });
    this.ui.setFade(0);
  }
}

/** True inside the Electron shell, which serves the game from game://app. */
function isDesktop() {
  return typeof location !== 'undefined' && location.protocol === 'game:';
}
