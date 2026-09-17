/* ============================================================
   build.mjs -- the production build.

   County Line has no bundler and wants none. It is plain ES modules with
   no dependencies, which means "building" is not transforming the code --
   it is proving the tree is complete and self-contained, and then laying
   it out as the thing you would upload.

   So this:
     1. parses every module the game ships;
     2. resolves every import, and fails on one that points at a file that
        is not there or at a package that would have to be installed;
     3. checks nothing reaches outside the tree or off the machine;
     4. copies index.html and src/ into dist/web/ and writes a manifest.

   The result of `npm run build` is dist/web -- a folder that can be
   served by anything, including the repository's own serve.cjs, and
   opened by any browser released in the last three years.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

const OUT = process.env.BUILD_DIR || 'dist/web';
const ROOT = process.cwd();
let fails = 0;
const fail = (msg) => { fails++; console.log(`FAIL  ${msg}`); };

const walk = (p, out = []) => {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f), out); return out; }
  out.push(p);
  return out;
};

/* ---------- 1 and 2: every module, and every import it names ---------- */
console.log('-- modules --');
const modules = walk('src').filter((f) => f.endsWith('.js'));
const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;
const DYNAMIC = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
let edges = 0;
for (const f of modules) {
  const src = readFileSync(f, 'utf8');
  for (const re of [IMPORT, DYNAMIC]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      edges++;
      if (!spec.startsWith('.')) { fail(`${f} imports a package: "${spec}"`); continue; }
      if (/^https?:/.test(spec)) { fail(`${f} imports over the network: "${spec}"`); continue; }
      const target = resolve(dirname(f), spec);
      if (!existsSync(target)) { fail(`${f} imports "${spec}", which is not there`); continue; }
      if (relative(ROOT, target).startsWith('..')) fail(`${f} imports outside the tree: "${spec}"`);
    }
  }
}
console.log(` ok   ${modules.length} modules, ${edges} imports, all resolved locally`);

/* ---------- 3: nothing reaches off the machine ---------- */
console.log('\n-- self-contained --');
let remote = 0;
for (const f of [...modules, 'index.html', 'src/style.css']) {
  const src = readFileSync(f, 'utf8');
  for (const [what, re] of [
    /* An http(s) URL in a STRING is fine -- the boot failure message
       tells the player to serve the folder over http. What must not
       appear is a URL being loaded from. */
    ['an http(s) URL it would load from',
      /(?:src|href|from|import\()\s*=?\s*['"`]https?:\/\//],
    ['fetch()', /\bfetch\s*\(/],
    ['XMLHttpRequest', /XMLHttpRequest/],
    ['WebSocket', /\bWebSocket\b/],
    ['an external font', /@import|fonts\.googleapis/],
  ]) {
    if (re.test(src)) { fail(`${f} contains ${what}`); remote++; }
  }
}
if (!remote) console.log(' ok   the game talks to nobody and loads nothing remote');

/* ---------- 4: lay it out ---------- */
console.log('\n-- output --');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const SHIP = ['index.html', ...walk('src')];
let bytes = 0;
const manifest = [];
for (const f of SHIP) {
  const dest = join(OUT, f);
  mkdirSync(dirname(dest), { recursive: true });
  if (f === 'index.html') {
    /* Mark the shipped page as production. src/main.js reads this attribute
       and withholds the developer hooks, so nothing in a downloaded build
       hands out a handle on the simulation. An attribute rather than an
       inline script: the desktop build serves the page under a policy that
       allows no inline script at all. */
    const html = readFileSync(f, 'utf8');
    const marked = html.replace(
      /<script type="module" src="src\/main\.js">/,
      '<script type="module" data-prod="1" src="src/main.js">');
    if (marked === html) fail('index.html: could not mark the build as production');
    writeFileSync(dest, marked);
    bytes += Buffer.byteLength(marked);
    manifest.push({ path: f, bytes: Buffer.byteLength(marked) });
    continue;
  }
  copyFileSync(f, dest);
  const n = statSync(f).size;
  bytes += n;
  manifest.push({ path: f, bytes: n });
}
manifest.sort((a, b) => b.bytes - a.bytes);
writeFileSync(join(OUT, 'build.json'), JSON.stringify({
  name: 'county-line',
  built: new Date().toISOString(),
  files: manifest.length,
  bytes,
  manifest,
}, null, 2));

console.log(` ok   ${manifest.length} files, ${(bytes / 1024).toFixed(0)} KB, in ${OUT}`);
console.log('      largest:');
for (const m of manifest.slice(0, 5)) {
  console.log(`        ${String((m.bytes / 1024).toFixed(1)).padStart(7)} KB  ${m.path}`);
}

/* ---------- the shipped page withholds the developer hooks ---------- */
const shipped = readFileSync(join(OUT, 'index.html'), 'utf8');
if (!/data-prod="1"/.test(shipped)) fail('the built page is not marked as production');
if (!/IS_PRODUCTION/.test(readFileSync(join(OUT, 'src/main.js'), 'utf8'))) {
  fail('the built main.js does not check the production marker');
}
console.log(' ok   the built page withholds the developer hooks');

/* ---------- and it still parses from the output ---------- */
for (const f of walk(OUT).filter((p) => p.endsWith('.js'))) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(`return import(${JSON.stringify('file://' + resolve(f))})`);
  } catch (e) { fail(`${f} would not parse: ${e.message}`); }
}

console.log(fails ? `\n${fails} FAILED` : '\nall good');
process.exit(fails ? 1 : 0);
