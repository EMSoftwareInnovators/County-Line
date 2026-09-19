/* ============================================================
   check.mjs -- run everything.

   Boots a static server on a port of its own, runs the checks that need
   no browser, then runs the browser harnesses against every engine that
   is actually installed.

   BOTH ENGINES MATTER. Working in Chromium is not evidence that a thing
   works: Chromium and Gecko disagree about pointer-lock deltas, about
   what requestPointerLock() returns, about when an AudioContext may
   start, and about how hard a tab is throttled in the background. So the
   browser suite is run once per engine, and an engine that is not
   installed is reported as SKIPPED rather than quietly not run -- a
   suite that says "all good" because it did half the work is worse than
   one that fails.

   To add Firefox on a machine that does not have it:
     npx playwright install firefox
   or point COUNTY_LINE_FIREFOX at an existing binary.
   ============================================================ */
import { spawn } from 'node:child_process';
import { findChromium, findFirefox } from './browser.mjs';

const PORT = process.env.PORT || '8199';

const run = (args, env) => new Promise((res) => {
  const p = spawn(process.execPath, args, {
    stdio: 'inherit',
    env: { ...process.env, PORT, ...env },
  });
  p.on('exit', (code) => res(code || 0));
});

const HEADLESS = [
  ['lint', 'tools/lint.mjs'],
  ['units, collision, save, settings, bindings', 'tools/unit.mjs'],
  ['renderer', 'tools/render.mjs'],
  ['production build', 'tools/build.mjs'],
];

const BROWSER = [
  ['movement, stairs, doors, interaction', 'tools/play.mjs'],
  ['mouse look and the controller', 'tools/input.mjs'],
  ['title, pause, settings, rebinding', 'tools/menus.mjs'],
  ['save and load', 'tools/saveload.mjs'],
  ['audio routing', 'tools/audio.mjs'],
  ['performance', 'tools/perf.mjs'],
  ['the shipped web build', 'tools/production.mjs'],
  ['the Old Academy: every doorway', 'tools/academy-doors.mjs'],
  ['the Old Academy: invariants and routes A-K', 'tools/academy.mjs'],
  ['Richmond Central: circulation, the panel, the yard', 'tools/terminal.mjs'],
  ['Richmond Central: the whole night, and putting it down', 'tools/shift.mjs'],
  ['Richmond Central: doing the job with the keyboard', 'tools/clerk.mjs'],
  ['the Old Academy: can you see in here', 'tools/lum.mjs'],
  ['Richmond Central: the first-night walkthrough', 'tools/tour.mjs'],
  ['Richmond Central: serving somebody through the box', 'tools/talk.mjs'],
];

const server = spawn(process.execPath, ['serve.cjs'], {
  stdio: 'ignore',
  env: { ...process.env, PORT },
});
await new Promise((r) => setTimeout(r, 700));

let failed = 0;
const skipped = [];

for (const [label, file] of HEADLESS) {
  console.log(`\n===== ${label} =====`);
  failed += await run([file]);
}

const ENGINES = [
  ['chromium', findChromium()],
  ['firefox', findFirefox()],
];

for (const [engine, exe] of ENGINES) {
  if (!exe) {
    skipped.push(engine);
    console.log(`\n===== ${engine.toUpperCase()}: NOT INSTALLED, SKIPPED =====`);
    console.log(`  install it with:  npx playwright install ${engine}`);
    console.log(`  or point COUNTY_LINE_${engine.toUpperCase()} at a binary`);
    continue;
  }
  console.log(`\n########## ${engine.toUpperCase()} ##########`);
  console.log(`  ${exe}`);
  for (const [label, file] of BROWSER) {
    console.log(`\n===== ${engine}: ${label} =====`);
    failed += await run([file, engine]);
  }
}

server.kill();

console.log('\n============================================');
if (skipped.length) {
  console.log(`SKIPPED: ${skipped.join(', ')} -- not installed on this machine.`);
  console.log('The suite has NOT verified those engines.');
}
console.log(failed ? `${failed} CHECK(S) FAILED` : 'ALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
