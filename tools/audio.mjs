/* ============================================================
   audio.mjs -- the mixer, in a real browser with a real AudioContext.

   Checks the thing Final Rental could not: that there are five named
   buses, that each has its own level, that a level set in the options
   reaches the graph, and that a sound placed in the world pans and fades
   with distance.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT, { mute: false });
const check = checker();

/* An AudioContext only starts from a user gesture. Give it one. */
await page.mouse.click(400, 300);
await page.waitForTimeout(400);
await page.keyboard.press('Enter');
await page.waitForTimeout(600);

const graph = await page.evaluate(() => {
  const a = window.__game.audio;
  return {
    ready: a.ready,
    state: a.ctx ? a.ctx.state : 'none',
    buses: Object.keys(a.bus),
    levels: { ...a.levels },
    sampleRate: a.ctx ? a.ctx.sampleRate : 0,
  };
});
check('the audio graph starts', graph.ready === true, graph.state);
check('it has MASTER, AMBIENCE, SFX, VOICE and UI',
  ['master', 'ambience', 'sfx', 'voice', 'ui'].every((b) => graph.buses.includes(b)),
  graph.buses.join(','));

/* Levels are ramped rather than assigned -- a gain that jumps clicks --
   so the graph is read after the ramp has had time to land. */
const routed = await page.evaluate(async () => {
  const a = window.__game.audio;
  a.setLevel('voice', 0.33);
  a.setLevel('ambience', 0.11);
  await new Promise((r) => setTimeout(r, 1800));
  return { voice: a.bus.voice.gain.value, ambience: a.bus.ambience.gain.value, master: a.bus.master.gain.value };
});
check('a bus level reaches its gain node',
  Math.abs(routed.voice - 0.33) < 0.03 && Math.abs(routed.ambience - 0.11) < 0.03,
  JSON.stringify(routed));
check('and does not disturb the others', routed.master > 0.5, String(routed.master));

/* ---- limiting ---- */
const comp = await page.evaluate(() => {
  const a = window.__game.audio;
  return {
    sfxThreshold: a._sfxComp.threshold.value,
    sfxRatio: a._sfxComp.ratio.value,
    safetyThreshold: a._safety.threshold.value,
  };
});
check('the effects bus is compressed', comp.sfxRatio > 1 && comp.sfxThreshold < 0, JSON.stringify(comp));
check('and the output has a safety limiter', comp.safetyThreshold > -6, String(comp.safetyThreshold));

/* ---- positional ---- */
const spatial = await page.evaluate(() => {
  const a = window.__game.audio;
  a.listener = { x: 0, y: 1.6, z: 0, yaw: 0 };
  return {
    right: a.spatial(5, 1.6, 0, 20),
    left: a.spatial(-5, 1.6, 0, 20),
    ahead: a.spatial(0, 1.6, 5, 20),
    far: a.spatial(0, 1.6, 40, 20),
  };
});
check('something to the right pans right', spatial.right.pan > 0.9, String(spatial.right.pan));
check('something to the left pans left', spatial.left.pan < -0.9, String(spatial.left.pan));
check('something straight ahead does not pan', Math.abs(spatial.ahead.pan) < 0.05, String(spatial.ahead.pan));
check('something close is louder than something far',
  spatial.ahead.gain > spatial.far.gain, `${spatial.ahead.gain} vs ${spatial.far.gain}`);
check('and something out of range is silent', spatial.far.gain === 0, String(spatial.far.gain));

/* ---- emitters follow the listener ---- */
/* The listener is driven from the player every frame, so the way to move
   it is to move the player -- setting audio.listener by hand is undone by
   the next frame, which is itself worth knowing. */
const em = await page.evaluate(async () => {
  const g = window.__game;
  const e = g.sfx.fluorescent(7.5, 2, 10, { maxDist: 14, gain: 1 });
  const put = (z) => { g.player.x = 7.5; g.player.z = z; g.player.y = 0; };
  put(9.0);
  await new Promise((r) => setTimeout(r, 900));
  const near = e.node.gain.value;
  put(1.0);
  await new Promise((r) => setTimeout(r, 900));
  const far = e.node.gain.value;
  e.stop();
  return { near, far };
});
check('a positional loop gets quieter as you walk away', em.near > em.far, JSON.stringify(em));

/* ---- ducking ---- */
const duck = await page.evaluate(async () => {
  const a = window.__game.audio;
  a.setLevel('ambience', 0.8);
  a.update(0.016);
  await new Promise((r) => setTimeout(r, 400));
  const before = a.bus.ambience.gain.value;
  a.duckAmbience(1.0);
  a.update(0.016);
  await new Promise((r) => setTimeout(r, 250));
  const during = a.bus.ambience.gain.value;
  return { before, during };
});
check('voice ducks the room', duck.during < duck.before * 0.9, JSON.stringify(duck));

/* ---- muting ---- */
/* A gain node with nothing playing through it is not pulled by the audio
   thread, and Chromium then reports its AudioParam at whatever it was
   last assigned rather than at where the automation has got to. Reading
   a silent bus therefore says nothing about whether the mute landed. Each
   bus is given something to carry for the duration. */
const muted = await page.evaluate(async () => {
  const a = window.__game.audio;
  const keepAlive = Object.keys(a.bus).map((b) => {
    const o = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(a.bus[b]);
    o.start();
    return o;
  });
  await new Promise((r) => setTimeout(r, 200));
  a.setMuted(true);
  await new Promise((r) => setTimeout(r, 1600));
  const v = Object.keys(a.bus).map((b) => a.bus[b].gain.value);
  a.setMuted(false);
  keepAlive.forEach((o) => o.stop());
  return v;
});
check('muting pulls every bus down', muted.every((v) => v < 0.02), muted.join(','));

/* ---- the level's own ambience ---- */
const beds = await page.evaluate(() => window.__game._emitters.length);
check('the level starts its ambience', beds >= 2, String(beds));

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
