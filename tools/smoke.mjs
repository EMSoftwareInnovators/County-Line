/* Boots the game in a real browser and reports what it built. Not a test
   so much as a look at the patient: run it when something is wrong. */
import { launch, openGame } from './browser.mjs';
const which = process.argv[2] || 'chromium';
const PORT = process.env.PORT || 8090;
const browser = await launch(which);
if (!browser) { console.log(`${which} is not installed; nothing to do`); process.exit(0); }
const page = await openGame(browser, PORT);
const st = await page.evaluate(() => {
  const g = window.__game;
  return {
    state: g.state, level: g.level.id,
    chunks: g.level.chunks.length,
    solids: g.level.collision.solids.length,
    floors: g.level.collision.floors.length,
    ramps: g.level.collision.ramps.length,
    ceilings: g.level.collision.ceilings.length,
    doors: g.level.doors.map((d) => `${d.id}(${d.leaves})`),
    rooms: g.level.rooms.map((r) => r.id),
    interactables: g.level.interact.items.map((i) => i.id),
    tris: g.level.chunks.reduce((n, c) => n + c.mesh.triCount, 0),
    verts: g.level.chunks.reduce((n, c) => n + c.mesh.count, 0),
    spawn: g.level.spawn,
  };
});
console.log(JSON.stringify(st, null, 2));
console.log('console:', page.logs.length ? '\n' + page.logs.join('\n') : 'clean');
await browser.close();
