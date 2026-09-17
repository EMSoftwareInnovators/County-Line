/* ============================================================
   input.mjs -- mouse look and the controller, without a mouse or a
   controller.

   Pointer-lock movement and a gamepad are both things a test rig cannot
   produce, so both are stood in for: synthetic mousemove events carrying
   movementX/movementY, and a fake pad installed over
   navigator.getGamepads that reports exactly what a real one reports.

   That is not the same as plugging a controller in, and it is not claimed
   to be. What it does verify is everything between the device and the
   player -- deadzones, response curves, the two different curves for
   moving and for looking, button-to-action translation, rebinding, the
   sensitivity sliders and invert-Y -- which is where the bugs live.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

await page.keyboard.press('Enter');
await page.waitForTimeout(600);

/* ============================================================
   MOUSE LOOK
   ============================================================ */

/* The browser will not grant pointer lock to a test, so the flag it sets
   is set directly and the events it would deliver are delivered by hand.
   Everything downstream of `locked` is the real code path. */
const look = (dx, dy) => page.evaluate(([dx, dy]) => {
  const g = window.__game;
  g.input.locked = true;
  const before = { yaw: g.player.yaw, pitch: g.player.pitch };
  document.getElementById('screen').dispatchEvent(
    new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
  return before;
}, [dx, dy]);

await page.evaluate(() => {
  const g = window.__game;
  g.player.yaw = 0; g.player.pitch = 0;
  g.settings.values.invertY = false;
  g.settings.values.mouseSensitivity = 0.5;
  g.settings.apply(g.systems());
});
let before = await look(200, 0);
await page.waitForTimeout(120);
let after = await page.evaluate(() => ({ yaw: window.__game.player.yaw, pitch: window.__game.player.pitch }));
const yawPerCount = (after.yaw - before.yaw) / 200;
check('moving the mouse right turns the camera right', after.yaw > before.yaw,
  `yaw ${before.yaw.toFixed(3)} -> ${after.yaw.toFixed(3)}`);

await page.evaluate(() => { window.__game.player.yaw = 0; window.__game.player.pitch = 0; });
before = await look(0, 200);
await page.waitForTimeout(120);
after = await page.evaluate(() => ({ yaw: window.__game.player.yaw, pitch: window.__game.player.pitch }));
check('moving the mouse down looks down', after.pitch < 0, `pitch ${after.pitch.toFixed(3)}`);

/* invert Y */
await page.evaluate(() => {
  const g = window.__game;
  g.player.yaw = 0; g.player.pitch = 0;
  g.settings.values.invertY = true;
  g.settings.apply(g.systems());
});
await look(0, 200);
await page.waitForTimeout(120);
after = await page.evaluate(() => window.__game.player.pitch);
check('invert Y turns that the other way up', after > 0, `pitch ${after.toFixed(3)}`);
await page.evaluate(() => {
  const g = window.__game;
  g.settings.values.invertY = false;
  g.settings.apply(g.systems());
});

/* sensitivity */
await page.evaluate(() => {
  const g = window.__game;
  g.player.yaw = 0; g.player.pitch = 0;
  g.settings.values.mouseSensitivity = 1.0;
  g.settings.apply(g.systems());
});
await look(200, 0);
await page.waitForTimeout(120);
const fastYaw = await page.evaluate(() => window.__game.player.yaw);
check('a higher sensitivity turns further for the same movement',
  fastYaw / 200 > yawPerCount * 1.4, `${yawPerCount.toFixed(5)} -> ${(fastYaw / 200).toFixed(5)}`);

await page.evaluate(() => {
  const g = window.__game;
  g.settings.values.mouseSensitivity = 0.5;
  g.settings.apply(g.systems());
  g.player.yaw = 0; g.player.pitch = 0;
});

/* the pitch limit */
for (let i = 0; i < 40; i++) await look(0, -400);
await page.waitForTimeout(150);
const up = await page.evaluate(() => window.__game.player.pitch);
for (let i = 0; i < 80; i++) await look(0, 400);
await page.waitForTimeout(150);
const down = await page.evaluate(() => window.__game.player.pitch);
check('looking up stops short of straight up', up < 1.5 && up > 1.3, up.toFixed(3));
check('and looking down stops short of straight down', down > -1.5 && down < -1.3, down.toFixed(3));

/* the clamp on an absurd single event */
await page.evaluate(() => { window.__game.player.yaw = 0; window.__game.player.pitch = 0; });
await look(100000, 0);
await page.waitForTimeout(120);
const spike = await page.evaluate(() => window.__game.player.yaw);
check('one absurd mouse event cannot spin the camera round',
  Math.abs(spike) < 1.2, `yaw ${spike.toFixed(3)}`);

/* ---- a page that will not hand over the mouse ---- */

/* An iframe embed without allow="pointer-lock" refuses every request. The
   game has to stop telling the player to click, because clicking is never
   going to work, and say what will. */
await page.evaluate(() => { window.__game.input.locked = false; });
const beforeBlocked = await page.evaluate(() => ({
  blocked: window.__game.input.lockBlocked,
  notice: document.getElementById('notice').textContent,
}));
check('one refusal is just bad timing', beforeBlocked.blocked === false, String(beforeBlocked.blocked));

await page.evaluate(() => {
  const g = window.__game;
  g.wantLock = true;
  for (let i = 0; i < 3; i++) document.dispatchEvent(new Event('pointerlockerror'));
});
await page.waitForTimeout(300);
const blocked = await page.evaluate(() => ({
  blocked: window.__game.input.lockBlocked,
  notice: document.getElementById('notice').textContent,
}));
check('three in a row is a policy', blocked.blocked === true, String(blocked.blocked));
check('and the player is told the truth instead of "click to look around"',
  /will not let the game take the mouse/.test(blocked.notice), blocked.notice);

/* and it clears itself the moment the lock is granted after all */
await page.evaluate(() => {
  const g = window.__game;
  g.input.locked = true;
  g.input.refusals = 0;
  g.input.lockBlocked = false;
});
await page.waitForTimeout(200);
check('getting the mouse clears it again',
  await page.evaluate(() => window.__game.input.lockBlocked === false));
await page.evaluate(() => { window.__game.input.locked = false; });

/* ============================================================
   THE CONTROLLER
   ============================================================ */

/* A pad that reports itself exactly as a standard-mapping Xbox pad does. */
await page.evaluate(() => {
  window.__pad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02fd)',
    index: 0,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
  navigator.getGamepads = () => [window.__pad];
  window.dispatchEvent(new Event('gamepadconnected'));
});

const setAxes = (a) => page.evaluate((a) => { window.__pad.axes = a; }, a);
const setButton = (i, on) => page.evaluate(([i, on]) => {
  window.__pad.buttons[i] = { pressed: on, value: on ? 1 : 0 };
}, [i, on]);
const settle = (ms = 400) => page.waitForTimeout(ms);

await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 7.5; g.player.y = 0; g.player.z = 5.0;
  g.player.yaw = 0; g.player.pitch = 0;
  g.player.vx = 0; g.player.vz = 0;
  g.input.locked = false;
});

/* ---- the pad is noticed ---- */
await setButton(0, true); await settle(200); await setButton(0, false); await settle(200);
const scheme = await page.evaluate(() => ({ scheme: window.__game.input.scheme, id: window.__game.input.padId }));
check('the pad is recognized as an Xbox pad', scheme.scheme === 'xbox', scheme.scheme);
check('and prompts switch to controller art',
  await page.evaluate(() => window.__cl.glyphs.currentScheme() === 'xbox'));

/* ---- the deadzone ---- */
await setAxes([0.15, 0, 0, 0]);
await settle();
check('a stick inside the deadzone does nothing',
  await page.evaluate(() => Math.abs(window.__game.input.moveX) < 1e-6),
  await page.evaluate(() => String(window.__game.input.moveX)));

/* ---- moving ---- */
let z0 = await page.evaluate(() => window.__game.player.z);
await setAxes([0, -1, 0, 0]);          // left stick forward
await settle(900);
await setAxes([0, 0, 0, 0]);
await settle(200);
let z1 = await page.evaluate(() => window.__game.player.z);
check('the left stick walks the player forward', z1 > z0 + 0.6, `z ${z0.toFixed(2)} -> ${z1.toFixed(2)}`);

const x0 = await page.evaluate(() => window.__game.player.x);
await setAxes([1, 0, 0, 0]);
await settle(900);
await setAxes([0, 0, 0, 0]);
await settle(200);
const x1 = await page.evaluate(() => window.__game.player.x);
check('and sideways', x1 > x0 + 0.4, `x ${x0.toFixed(2)} -> ${x1.toFixed(2)}`);

/* half a stick should be slower than a whole one */
await page.evaluate(() => { const p = window.__game.player; p.x = 7.5; p.z = 4.0; p.vx = 0; p.vz = 0; });
await setAxes([0, -0.5, 0, 0]);
await settle(900);
await setAxes([0, 0, 0, 0]);
const halfWay = await page.evaluate(() => window.__game.player.z - 4.0);
await page.evaluate(() => { const p = window.__game.player; p.x = 7.5; p.z = 4.0; p.vx = 0; p.vz = 0; });
await setAxes([0, -1, 0, 0]);
await settle(900);
await setAxes([0, 0, 0, 0]);
const fullWay = await page.evaluate(() => window.__game.player.z - 4.0);
check('the stick is analog, not a switch', halfWay < fullWay * 0.8,
  `${halfWay.toFixed(2)} vs ${fullWay.toFixed(2)}`);

/* ---- looking ---- */
await page.evaluate(() => { window.__game.player.yaw = 0; window.__game.player.pitch = 0; });
await setAxes([0, 0, 1, 0]);           // right stick right
await settle(600);
await setAxes([0, 0, 0, 0]);
const padYaw = await page.evaluate(() => window.__game.player.yaw);
check('the right stick turns the camera', padYaw > 0.4, `yaw ${padYaw.toFixed(3)}`);

await page.evaluate(() => { window.__game.player.yaw = 0; window.__game.player.pitch = 0; });
await setAxes([0, 0, 0, 1]);           // right stick down
await settle(600);
await setAxes([0, 0, 0, 0]);
const padPitch = await page.evaluate(() => window.__game.player.pitch);
check('and looks down', padPitch < -0.2, `pitch ${padPitch.toFixed(3)}`);

/* controller sensitivity */
await page.evaluate(() => {
  const g = window.__game;
  g.settings.values.padSensitivity = 1.0;
  g.settings.apply(g.systems());
  g.player.yaw = 0;
});
await setAxes([0, 0, 1, 0]);
await settle(600);
await setAxes([0, 0, 0, 0]);
const fastPadYaw = await page.evaluate(() => window.__game.player.yaw);
check('the controller sensitivity slider works', fastPadYaw > padYaw * 1.2,
  `${padYaw.toFixed(3)} -> ${fastPadYaw.toFixed(3)}`);

/* invert Y on the pad too */
await page.evaluate(() => {
  const g = window.__game;
  g.settings.values.invertY = true;
  g.settings.apply(g.systems());
  g.player.pitch = 0;
});
await setAxes([0, 0, 0, 1]);
await settle(500);
await setAxes([0, 0, 0, 0]);
const invPitch = await page.evaluate(() => window.__game.player.pitch);
check('invert Y applies to the stick as well as the mouse', invPitch > 0.1, invPitch.toFixed(3));
await page.evaluate(() => {
  const g = window.__game;
  g.settings.values.invertY = false;
  g.settings.values.padSensitivity = 0.5;
  g.settings.apply(g.systems());
});

/* ---- buttons ---- */
await page.evaluate(() => {
  const p = window.__game.player;
  p.x = 13.6; p.y = 0; p.z = 7.0; p.yaw = Math.PI / 2; p.pitch = 0;
  p.vx = 0; p.vz = 0;
  const d = window.__game.level.doorById('hall-corridor');
  d.target = 0; d.amount = 0;
});
await settle(300);
await setButton(0, true); await settle(120); await setButton(0, false);
await settle(500);
check('A opens a door', await page.evaluate(() => window.__game.level.doorById('hall-corridor').open));

await setButton(9, true); await settle(150); await setButton(9, false);
await settle(400);
check('START pauses', (await page.evaluate(() => window.__game.state)) === 'PAUSE',
  await page.evaluate(() => window.__game.state));

/* the d-pad works the menu */
const sel0 = await page.evaluate(() => window.__game.menu.sel);
await setButton(13, true); await settle(150); await setButton(13, false);
await settle(300);
const sel1 = await page.evaluate(() => window.__game.menu.sel);
check('the d-pad moves the menu highlight', sel1 !== sel0, `${sel0} -> ${sel1}`);

/* B backs out, and does NOT pause */
await setButton(1, true); await settle(150); await setButton(1, false);
await settle(400);
check('B backs out of the pause menu rather than re-pausing',
  (await page.evaluate(() => window.__game.state)) === 'PLAY',
  await page.evaluate(() => window.__game.state));

/* the left stick works a menu too */
await setButton(9, true); await settle(150); await setButton(9, false);
await settle(400);
const msel0 = await page.evaluate(() => window.__game.menu.sel);
await setAxes([0, 0.9, 0, 0]);
await settle(300);
await setAxes([0, 0, 0, 0]);
await settle(200);
const msel1 = await page.evaluate(() => window.__game.menu.sel);
check('and so does the left stick', msel1 !== msel0, `${msel0} -> ${msel1}`);
await setButton(1, true); await settle(150); await setButton(1, false);
await settle(300);

/* ---- rebinding a pad button ---- */
const rebound = await page.evaluate(async () => {
  const g = window.__game;
  g.input.bindPadButton(3, 'interact');
  return { onY: g.input.actionsOn(3), onA: g.input.actionsOn(0) };
});
check('an action can be moved to another button',
  rebound.onY.includes('interact') && !rebound.onA.includes('interact'),
  JSON.stringify(rebound));

await page.evaluate(() => {
  const p = window.__game.player;
  p.x = 17.0; p.y = 0; p.z = 7.0; p.yaw = Math.PI / 2; p.pitch = 0;
});
await settle(300);
await setButton(3, true); await settle(120); await setButton(3, false);
await settle(500);
check('and the new button does the job',
  await page.evaluate(() => window.__game.level.doorById('workroom-door').open));

/* ---- a pad the browser will not describe ---- */
const untrusted = await page.evaluate(async () => {
  const g = window.__game;
  window.__pad.id = 'Some Unknown Pad';
  window.__pad.mapping = '';
  g.input.padBindsAreUser = false;
  g.input._laidOutFor = null;
  g.input.poll();
  return { trusted: g.input.padTrusted, binds: Object.keys(g.input.padBinds).length };
});
check('a pad with no reported mapping is not given the standard layout',
  untrusted.trusted === false && untrusted.binds === 0, JSON.stringify(untrusted));

check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
