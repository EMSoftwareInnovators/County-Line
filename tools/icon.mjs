/* ============================================================
   icon.mjs -- draws the application icon.

   electron-builder wants a 512x512 PNG at build/icon.png. Rather than
   check a binary into a repository that otherwise contains no art, it is
   drawn the same way every other texture in this game is: into a canvas,
   at build time. Run it after changing the branding.

     node tools/icon.mjs
   ============================================================ */
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch } from './browser.mjs';

const browser = await launch('chromium');
if (!browser) { console.log('SKIP  chromium is not installed'); process.exit(0); }
const page = await browser.newPage();

const dataUrl = await page.evaluate(() => {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d');

  g.fillStyle = '#121110';
  g.fillRect(0, 0, S, S);

  // a faint scanline field, because that is what the game looks like
  g.fillStyle = 'rgba(255,255,255,0.028)';
  for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 2);

  // the line itself: a county line, drawn as a surveyor would
  g.strokeStyle = '#c8b46a';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(56, 300);
  g.lineTo(456, 300);
  g.stroke();
  g.lineWidth = 8;
  for (let x = 72; x < 456; x += 48) {
    g.beginPath();
    g.moveTo(x, 300);
    g.lineTo(x, 340);
    g.stroke();
  }

  g.fillStyle = '#d9d3c4';
  g.font = 'bold 104px "Courier New", monospace';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText('CO', S / 2, 236);
  g.fillStyle = '#c8b46a';
  g.fillText('LN', S / 2, 452);

  g.strokeStyle = 'rgba(217,211,196,0.28)';
  g.lineWidth = 10;
  g.strokeRect(5, 5, S - 10, S - 10);

  return c.toDataURL('image/png');
});

await browser.close();
mkdirSync('build', { recursive: true });
writeFileSync('build/icon.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote build/icon.png');
