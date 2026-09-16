/* ============================================================
   lint.mjs -- a read of the source, with no browser and no dependencies.

   Three jobs.

   1. HOUSE STYLE. Final Rental shipped tools/english.mjs because "till"
      survived on the HUD for weeks. County Line is set in the American
      South; the list is carried over with the additions this project has
      earned.

   2. THE NAMESPACE RULE. County Line must never read or write Final
      Rental's browser storage, and the only place allowed to touch
      localStorage at all is the storage layer. That is checkable, so it
      is checked rather than remembered.

   3. THE SIZE RULE. This stage exists partly because Final Rental's
      game.js reached 4,295 lines. A file over the limit is not a crime,
      but it should be a decision, and a failing check is how a decision
      gets made rather than drifted into.
   ============================================================ */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let fails = 0;
const fail = (file, line, msg) => {
  fails++;
  console.log(`FAIL  ${file}${line ? ':' + line : ''}  ${msg}`);
};

const walk = (p, out = []) => {
  if (!existsSync(p)) return out;
  const st = statSync(p);
  if (st.isDirectory()) {
    for (const f of readdirSync(p)) {
      if (f === 'node_modules' || f === '.git' || f === 'dist') continue;
      walk(join(p, f), out);
    }
    return out;
  }
  if (/\.(js|mjs|cjs|html|css|md)$/.test(p)) out.push(p);
  return out;
};

const SELF = 'tools/lint.mjs';
const FILES = [...walk('src'), ...walk('tools'), ...walk('electron'), 'index.html', 'serve.cjs']
  .filter((f) => f !== SELF && existsSync(f));

/* ============================================================
   1. HOUSE STYLE
   ============================================================ */
const BRITISH = [
  ['till', 'register (or "until")', { skip: ['until', 'still', 'tilt'] }],
  ['shop', 'store', { skip: ['workshop', 'shopping'] }],
  ['queue', 'line', { skip: ['a queue it has to walk', 'queue of', 'render quantum'] }],
  ['pavement', 'sidewalk'],
  ['kerb', 'curb'],
  ['grey', 'gray'],
  ['colour', 'color'],
  ['colours', 'colors'],
  ['coloured', 'colored'],
  ['centre', 'center'],
  ['centres', 'centers'],
  ['centred', 'centered'],
  ['metre', 'meter'],
  ['metres', 'meters'],
  ['litre', 'liter'],
  ['storey', 'floor or story'],
  ['storeys', 'floors or stories'],
  ['neighbour', 'neighbor'],
  ['behaviour', 'behavior'],
  ['favour', 'favor'],
  ['favourite', 'favorite'],
  ['honour', 'honor'],
  ['humour', 'humor'],
  ['licence', 'license'],
  ['defence', 'defense'],
  ['offence', 'offense'],
  ['theatre', 'theater'],
  ['aluminium', 'aluminum'],
  ['tyre', 'tire'],
  ['whilst', 'while'],
  ['amongst', 'among'],
  ['lorry', 'truck'],
  ['rubbish', 'trash'],
  ['torch', 'flashlight'],
  ['fortnight', 'two weeks'],
  ['maths', 'math'],
  ['petrol', 'gasoline'],
  ['car park', 'parking lot'],
  ['postcode', 'zip code'],
  ['laundrette', 'laundromat'],
  ['parlour', 'parlor'],
  ['trousers', 'pants'],
  ['jumper', 'sweater'],
  ['bloke', 'guy'],
];

/* -ise/-yse where American English wants -ize/-yze. Spelled out rather than
   matched by pattern: "premise" and "surprise" end that way in both. */
const ISE = ['realise', 'realised', 'apologise', 'organise', 'organised', 'recognise',
  'recognised', 'specialise', 'analyse', 'analysed', 'criticise', 'normalise',
  'normalised', 'quantisation', 'memorise', 'summarise', 'prioritise', 'serialise',
  'serialised', 'initialise', 'initialised', 'sanitise', 'sanitised'];

/* "Round" for "around", only after a verb: a round is also a shape. */
const ROUND = new RegExp(String.raw`\b(turn|turns|turned|turning|come|comes|came|coming`
  + String.raw`|go|goes|went|going|walk|walks|walked|walking|look|looks|looked|looking`
  + String.raw`|get|gets|got|getting|sit|sits|sat|stand|stands|stood|hang|hangs|hung`
  + String.raw`|drive|drives|drove|driving|show|shows|showed|showing)\s+round\b`, 'i');

console.log('-- house style --');
let styleHits = 0;
for (const f of FILES) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const [word, better, opt] of BRITISH) {
      const re = new RegExp(`\\b${word}\\b`, 'i');
      if (!re.test(line)) continue;
      if (opt && opt.skip && opt.skip.some((sk) => line.toLowerCase().includes(sk))) continue;
      fail(f, i + 1, `"${word}" -- American English is "${better}"`);
      styleHits++;
    }
    for (const w of ISE) {
      if (new RegExp(`\\b${w}\\b`, 'i').test(line)) {
        fail(f, i + 1, `"${w}" -- American English uses -ize/-yze`);
        styleHits++;
      }
    }
    if (ROUND.test(line)) { fail(f, i + 1, '"round" for "around"'); styleHits++; }
  });
}
if (!styleHits) console.log(' ok   nothing reads as British');

/* ============================================================
   2. THE NAMESPACE RULE
   ============================================================ */
console.log('\n-- storage hygiene --');
let storeHits = 0;
for (const f of FILES) {
  if (!f.startsWith('src/')) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/finalrental/i.test(line) && !/never|not|must|Final Rental's browser storage/i.test(line)) {
      fail(f, i + 1, 'names Final Rental storage');
      storeHits++;
    }
    if (/\blocalStorage\b/.test(line) && !f.endsWith('engine/storage.js')) {
      fail(f, i + 1, 'touches localStorage outside src/engine/storage.js');
      storeHits++;
    }
    if (/sessionStorage|indexedDB/.test(line)) {
      fail(f, i + 1, 'uses a storage API the save layer does not manage');
      storeHits++;
    }
  });
}
if (!storeHits) console.log(' ok   only the storage layer persists anything, and only under countyline.');

/* ============================================================
   3. THE SIZE RULE
   ============================================================ */
console.log('\n-- module size --');
const LIMIT = 900;
let big = 0;
const sizes = [];
for (const f of FILES) {
  if (!f.startsWith('src/')) continue;
  const n = readFileSync(f, 'utf8').split('\n').length;
  sizes.push([f, n]);
  if (n > LIMIT) { fail(f, 0, `${n} lines -- over the ${LIMIT} line limit`); big++; }
}
sizes.sort((a, b) => b[1] - a[1]);
for (const [f, n] of sizes.slice(0, 5)) console.log(`      ${String(n).padStart(4)}  ${f}`);
if (!big) console.log(` ok   no source file is over ${LIMIT} lines`);

/* ============================================================
   4. ODDS AND ENDS
   ============================================================ */
console.log('\n-- odds and ends --');
let odds = 0;
for (const f of FILES) {
  const text = readFileSync(f, 'utf8');
  const lines = text.split('\n');
  if (/\r\n/.test(text)) { fail(f, 0, 'has CRLF line endings'); odds++; }
  if (text.length && !text.endsWith('\n')) { fail(f, 0, 'has no trailing newline'); odds++; }
  lines.forEach((line, i) => {
    if (/\bTODO\b|\bFIXME\b|\bXXX\b/.test(line)) { fail(f, i + 1, 'left a TODO'); odds++; }
    if (/\s+$/.test(line)) { fail(f, i + 1, 'trailing whitespace'); odds++; }
    if (f.startsWith('src/') && /console\.log\(/.test(line)) {
      fail(f, i + 1, 'console.log in shipped source');
      odds++;
    }
    if (/\bdebugger\b/.test(line)) { fail(f, i + 1, 'debugger statement'); odds++; }
  });
}
if (!odds) console.log(' ok   no stray debugging, no whitespace, no TODOs');

/* ============================================================
   5. CONTENT THAT BELONGS TO THE OTHER GAME
   ============================================================ */
console.log('\n-- no Final Rental gameplay --');
/* Comments in this repository discuss Final Rental at length and should:
   knowing why something is the way it is, is the point. What must not
   appear is its CONTENT as code -- identifiers, strings, level data. So
   the check reads code lines only, with comments stripped. */
const FORBIDDEN = [
  'sunsetvideo', 'sunset video', 'vhs', 'rewinder', 'rewound', 'lateFee',
  'tapeLabel', 'genreLabel', 'killer', 'suspect', 'deputy', 'bulletin',
  'boombox', 'popcorn', 'popper',
];
let leak = 0;
for (const f of FILES) {
  if (!f.startsWith('src/')) continue;
  const text = readFileSync(f, 'utf8');
  // strip block comments and line comments, then look at what is left
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  code.split('\n').forEach((line, i) => {
    for (const w of FORBIDDEN) {
      if (line.toLowerCase().includes(w.toLowerCase())) {
        fail(f, i + 1, `Final Rental content in code: "${w}"`);
        leak++;
      }
    }
  });
}
if (!leak) console.log(' ok   no Final Rental gameplay leaked into County Line code');

/* ============================================================
   6. BROWSER COMPATIBILITY

   County Line has to run in Chromium AND in Gecko, and the failure mode
   for getting this wrong is the worst kind: it works perfectly on the
   machine it was written on. Some of that can only be found by running
   Firefox, which tools/check.mjs does when Firefox is installed. The rest
   is a read of the source, and it is cheap, so it is here.

   Two lists. Things no browser but Chromium implements, which must not
   appear at all; and things both implement but DIFFERENTLY, which must
   appear only alongside a guard.
   ============================================================ */
console.log('\n-- browser compatibility --');
const CHROME_ONLY = [
  ['showOpenFilePicker', 'the File System Access API'],
  ['showSaveFilePicker', 'the File System Access API'],
  ['navigator.keyboard', 'the Keyboard API (lock/getLayoutMap)'],
  ['navigator.userAgentData', 'UA-CH'],
  ['navigator.scheduling', 'isInputPending'],
  ['document.startViewTransition', 'view transitions'],
  ['chrome.', 'the chrome.* namespace'],
  ['webkitRequestAnimationFrame', 'a prefixed rAF'],
  ['webkitRequestFullscreen', 'a prefixed fullscreen request'],
  ['unadjustedMovement', 'raw pointer-lock movement, which Gecko ignores'],
  ['Array.fromAsync', 'Array.fromAsync'],
  ['Object.groupBy', 'Object.groupBy'],
];
let incompat = 0;
for (const f of FILES) {
  if (!f.startsWith('src/')) continue;
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const [needle, what] of CHROME_ONLY) {
      if (code.includes(needle)) {
        fail(f, i + 1, `uses ${what}, which Firefox does not have`);
        incompat++;
      }
    }
  });
}

/* requestPointerLock returns a Promise in Chromium and undefined in
   Gecko. Awaiting it, or calling .catch on it unguarded, throws in
   Firefox and only in Firefox. */
for (const f of FILES) {
  if (!f.startsWith('src/')) continue;
  const text = readFileSync(f, 'utf8');
  if (!/requestPointerLock/.test(text)) continue;
  if (/await\s+[\w.]*requestPointerLock/.test(text)) {
    fail(f, 0, 'awaits requestPointerLock(), which is undefined in Firefox');
    incompat++;
  }
  if (/requestPointerLock\(\)\s*\.catch/.test(text)) {
    fail(f, 0, 'calls .catch on requestPointerLock() without checking it returned anything');
    incompat++;
  }
}

/* An AudioContext must be reachable under both names, and every graph
   call must be able to cope with the context not existing. */
const audioSrc = existsSync('src/engine/audio.js') ? readFileSync('src/engine/audio.js', 'utf8') : '';
if (audioSrc && !/webkitAudioContext/.test(audioSrc)) {
  fail('src/engine/audio.js', 0, 'does not fall back to webkitAudioContext');
  incompat++;
}

/* Gecko reports pointer-lock movement in device pixels rather than CSS
   pixels. Without a correction the game is twice as sensitive in Firefox
   on any Retina display, which is every Mac. */
const inputSrc = existsSync('src/engine/input.js') ? readFileSync('src/engine/input.js', 'utf8') : '';
if (inputSrc && !/pointerScale/.test(inputSrc)) {
  fail('src/engine/input.js', 0, 'does not correct Gecko pointer-lock deltas for devicePixelRatio');
  incompat++;
}

if (!incompat) console.log(' ok   nothing here needs a particular browser');

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
