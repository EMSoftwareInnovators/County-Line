/* ============================================================
   play.mjs -- the movement, collision, stairs, door and interaction
   harness. Drives the game through the same input path a player uses:
   real key events into a real browser, never a method call on the game
   object, because a controller that only works when called directly is
   not a controller.
   ============================================================ */
import { launch, openGame, checker } from './browser.mjs';

const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`SKIP  ${which} is not installed`); process.exit(0); }
const page = await openGame(browser, PORT);
const check = checker();

const pos = () => page.evaluate(() => {
  const p = window.__game.player;
  return { x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded, crouch: p.crouch };
});
const put = (x, y, z, yaw = 0) => page.evaluate(([x, y, z, yaw]) => {
  const p = window.__game.player;
  p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = 0;
  p.vx = 0; p.vz = 0; p.vy = 0;
}, [x, y, z, yaw]);
const hold = async (key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
};
const state = () => page.evaluate(() => window.__game.state);

/* ---- start a shift through the menu, as a player would ---- */
await page.keyboard.press('Enter');
await page.waitForTimeout(500);
check('ENTER on the title starts the test shift', (await state()) === 'PLAY', await state());

/* This harness tests the ENGINE -- movement, collision, stairs, doors,
   interaction -- and it does that against the greybox testbed, which is
   what the testbed is for: known coordinates, a 9 m hall, one staircase,
   one plinth, one set of double doors. Stage 2 moved the campaign's own
   shift onto the Old Academy, so the level is asked for by name here
   rather than taken from whatever the campaign happens to open. The
   academy has its own harness, tools/academy.mjs. */
await page.evaluate(() => { window.__game.loadLevel('testbed'); });
await page.waitForTimeout(400);
check('the engine harness runs on the greybox testbed',
  (await page.evaluate(() => window.__game.level.id)) === 'testbed',
  await page.evaluate(() => window.__game.level.id));

const spawn = await pos();
check('the player spawns on the floor', Math.abs(spawn.y) < 0.01 && spawn.grounded, JSON.stringify(spawn));

/* ---- walking ---- */
await hold('KeyW', 700);
let p = await pos();
check('W walks forward (+Z)', p.z > spawn.z + 0.6, `z ${spawn.z.toFixed(2)} -> ${p.z.toFixed(2)}`);
const afterW = p;
await hold('KeyS', 700);
p = await pos();
check('S walks back', p.z < afterW.z - 0.4, `z ${afterW.z.toFixed(2)} -> ${p.z.toFixed(2)}`);
await hold('KeyD', 600);
p = await pos();
check('D strafes right (+X)', p.x > spawn.x + 0.3, `x ${spawn.x.toFixed(2)} -> ${p.x.toFixed(2)}`);
await hold('KeyA', 600);

/* ---- running ---- */
await put(7.5, 0, 4.0, 0);
await hold('KeyW', 800);
const walked = (await pos()).z - 4.0;
await put(7.5, 0, 4.0, 0);
await page.keyboard.down('ShiftLeft');
await hold('KeyW', 800);
await page.keyboard.up('ShiftLeft');
const ran = (await pos()).z - 4.0;
check('holding SHIFT moves further in the same time', ran > walked * 1.3, `${walked.toFixed(2)} vs ${ran.toFixed(2)}`);

/* ---- crouch ---- */
await page.keyboard.down('ControlLeft');
await page.waitForTimeout(350);
const crouched = await pos();
await page.keyboard.up('ControlLeft');
await page.waitForTimeout(350);
const stood = await pos();
check('CTRL crouches and releasing stands back up', crouched.crouch > 0.9 && stood.crouch < 0.1,
  `${crouched.crouch.toFixed(2)} -> ${stood.crouch.toFixed(2)}`);

/* ---- walls ---- */
await put(1.0, 0, 7.0, -Math.PI / 2);          // facing -X, into the west wall
await hold('KeyW', 1200);
p = await pos();
check('a wall stops the player', p.x > 0.35, `x ${p.x.toFixed(3)}`);
check('and does not push them through it', p.x < 1.1, `x ${p.x.toFixed(3)}`);

/* ---- the staircase: up ---- */
await put(5.0, 0, 4.6, 0);
const upStart = await pos();
await hold('KeyW', 5200);
const upEnd = await pos();
check('walking north up the flight raises the player', upEnd.y > 3.5,
  `y ${upStart.y.toFixed(2)} -> ${upEnd.y.toFixed(2)}`);
check('and lands them on the gallery slab', Math.abs(upEnd.y - 3.81) < 0.06 && upEnd.grounded,
  `y ${upEnd.y.toFixed(3)}`);

/* ---- stopping halfway, and turning ---- */
await put(5.0, 0, 4.9, 0);
await hold('KeyW', 1800);
const mid = await pos();
await page.waitForTimeout(500);
const stopped = await pos();
check('stopping on the stairs leaves the player where they stopped',
  Math.abs(stopped.y - mid.y) < 0.02 && stopped.y > 0.3 && stopped.y < 3.6,
  `y ${mid.y.toFixed(3)} -> ${stopped.y.toFixed(3)}`);
await page.evaluate(() => { window.__game.player.yaw = Math.PI / 2; });
await hold('KeyW', 400);
const turned = await pos();
check('turning on the stairs does not drop the player through them',
  turned.grounded && turned.y > 0.2, `y ${turned.y.toFixed(3)} grounded ${turned.grounded}`);

/* ---- the staircase: down ---- */
await put(5.0, 3.81, 10.9, Math.PI);
await hold('KeyW', 5200);
const downEnd = await pos();
check('walking back down returns to the hall floor',
  Math.abs(downEnd.y) < 0.03 && downEnd.grounded, `y ${downEnd.y.toFixed(3)}`);

/* ---- never in the air on the way down ---- */
await put(5.0, 3.81, 10.9, Math.PI);
const airborne = await page.evaluate(async () => {
  const g = window.__game;
  let air = 0, worst = 0;
  const t0 = performance.now();
  const tick = () => {
    if (!g.player.grounded) { air++; worst = Math.max(worst, g.player.vy); }
  };
  const id = setInterval(tick, 16);
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  await new Promise((r) => setTimeout(r, 4800));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
  clearInterval(id);
  return { air, elapsed: performance.now() - t0 };
});
check('descending never leaves the ground', airborne.air <= 2, `${airborne.air} airborne samples`);

/* ---- the plinth: a 150 mm step up ---- */
await put(10.5, 0, 1.2, 0);
await hold('KeyW', 1400);
p = await pos();
check('the player steps up onto a 6 inch plinth', p.y > 0.1 && p.grounded, `y ${p.y.toFixed(3)}`);

/* ---- doors ---- */
const doorState = (id) => page.evaluate((id) => {
  const d = window.__game.level.doorById(id);
  return { open: d.open, amount: d.amount, locked: d.locked };
}, id);

await put(13.6, 0, 7.0, Math.PI / 2);          // facing +X at the double doors
await page.waitForTimeout(200);
let look = await page.evaluate(() => {
  const t = window.__game.level.interact.target;
  return t ? t.id : null;
});
check('looking at the double doors offers them', look === 'door:hall-corridor', String(look));
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
check('E opens the double doors', (await doorState('hall-corridor')).open);
await page.waitForTimeout(400);
check('and both leaves swing', (await doorState('hall-corridor')).amount > 0.8);

await hold('KeyW', 2600);
p = await pos();
check('the player walks through the open double doors', p.x > 15.5, `x ${p.x.toFixed(2)}`);

// shut them and confirm they block
await page.evaluate(() => {
  const g = window.__game;
  const d = g.level.doorById('hall-corridor');
  d.target = 0; d.amount = 0;
});
await put(16.0, 0, 7.0, -Math.PI / 2);
await hold('KeyW', 1600);
p = await pos();
check('a shut door is solid', p.x > 15.0, `x ${p.x.toFixed(2)}`);

/* ---- single door ---- */
await put(17.0, 0, 7.0, Math.PI / 2);
await page.waitForTimeout(200);
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
check('the single door opens', (await doorState('workroom-door')).open);
await hold('KeyW', 2200);
p = await pos();
check('and can be walked through', p.x > 18.4, `x ${p.x.toFixed(2)}`);

/* ---- a held interaction ---- */
await put(21.0, 0, 11.6, Math.PI);
await page.evaluate(() => { window.__game.player.pitch = -0.2; });
await page.waitForTimeout(250);
look = await page.evaluate(() => {
  const t = window.__game.level.interact.target;
  return t ? t.id : null;
});
check('the test crate can be looked at', look === 'test-crate', String(look));
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);
check('a tap does not complete a held action',
  !(await page.evaluate(() => !!window.__game.level.marks.crateOpen)));
await hold('KeyE', 1100);
check('holding E completes it',
  await page.evaluate(() => !!window.__game.level.marks.crateOpen));

/* ---- the light switch ---- */
await put(5.4, 0, 1.3, Math.PI);
await page.evaluate(() => { window.__game.player.pitch = -0.08; });
await page.waitForTimeout(250);
const litBefore = await page.evaluate(() => window.__game.roomLit('hall'));
await page.keyboard.press('KeyE');
await page.waitForTimeout(250);
const litAfter = await page.evaluate(() => window.__game.roomLit('hall'));
check('the light switch works', litBefore !== litAfter, `${litBefore} -> ${litAfter}`);
check('and dims the room it belongs to',
  await page.evaluate(() => window.__game.level.chunkShade.hall < 1));
await page.keyboard.press('KeyE');
await page.waitForTimeout(200);

/* ---- going outside ---- */
await put(4.0, 0, 1.4, Math.PI);
await page.evaluate(() => { window.__game.player.pitch = 0; });
await page.waitForTimeout(250);
await page.keyboard.press('KeyE');
await page.waitForTimeout(700);
check('the exterior door opens', (await doorState('front-door')).open);
await hold('KeyW', 2600);
p = await pos();
check('the player gets outside', p.z < -0.6, `z ${p.z.toFixed(2)}`);
check('and steps down onto the path without falling',
  Math.abs(p.y - (-0.15)) < 0.03 && p.grounded, `y ${p.y.toFixed(3)}`);
const room = await page.evaluate(() => {
  const g = window.__game;
  const r = g.level.roomAt(g.player.x, g.player.y, g.player.z);
  return r ? r.id : null;
});
check('and is in the yard', room === 'yard', String(room));

// and back in
await page.evaluate(() => { window.__game.player.yaw = 0; });
await hold('KeyW', 2600);
p = await pos();
check('and can come back in over the threshold',
  p.z > 0.4 && Math.abs(p.y) < 0.03, `z ${p.z.toFixed(2)} y ${p.y.toFixed(3)}`);

/* ---- the yard boundary ---- */
await put(4.0, -0.15, -10.5, Math.PI);
await hold('KeyW', 2500);
p = await pos();
check('the yard is fenced', p.z > -12.4, `z ${p.z.toFixed(2)}`);

/* ---- objectives ---- */
const obj = await page.evaluate(() => ({
  up: window.__game.campaign.objectiveDone('walk-upstairs'),
  out: window.__game.campaign.objectiveDone('go-outside'),
  left: window.__game.campaign.remainingObjectives().map((o) => o.id),
}));
check('the shift tracked both objectives', obj.up && obj.out, JSON.stringify(obj));
check('and has none left outstanding', obj.left.length === 0, obj.left.join(',') || 'none');

/* ---- the NPC ---- */
const npc0 = await page.evaluate(() => {
  const n = window.__game.npcs[0];
  return n ? { x: n.x, z: n.z, y: n.y, state: n.state } : null;
});
await page.waitForTimeout(2500);
const npc1 = await page.evaluate(() => {
  const n = window.__game.npcs[0];
  return n ? { x: n.x, z: n.z, y: n.y, state: n.state } : null;
});
check('the test actor exists and patrols', !!npc0 && Math.hypot(npc1.x - npc0.x, npc1.z - npc0.z) > 0.4,
  npc0 ? `${npc0.state} ${npc0.x.toFixed(1)},${npc0.z.toFixed(1)} -> ${npc1.x.toFixed(1)},${npc1.z.toFixed(1)}` : 'none');
check('and stays on the floor', npc1 && Math.abs(npc1.y) < 0.05, npc1 ? String(npc1.y) : '-');

/* ---- nothing shouted on the way through ---- */
check('no page errors', page.logs.filter((l) => l.startsWith('[pageerror]')).length === 0,
  page.logs.join(' | '));

await browser.close();
console.log(check.fails() ? `\n${check.fails()} FAILED` : '\nall good');
process.exit(check.fails() ? 1 : 0);
