// Records the README demo GIF by driving framecraft in Chromium, then encodes it with ffmpeg.
// Start the app first (npm run dev), then: node scripts/demo-gif.mjs [url]   (needs ffmpeg on PATH)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:4210/';
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const size = { width: 1280, height: 800 };
const dir = mkdtempSync(join(tmpdir(), 'framecraft-demo-'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: size, recordVideo: { dir, size } });
// Playwright's video has no mouse pointer, so draw one that follows the mouse (it is page UI, never in exports)
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    Object.assign(dot.style, {
      position: 'fixed', left: '0', top: '0', width: '18px', height: '18px', margin: '-9px 0 0 -9px', borderRadius: '50%',
      background: 'rgba(20, 20, 20, 0.55)', border: '2px solid #fff', zIndex: '2147483647', pointerEvents: 'none', opacity: '0',
    });
    document.body.append(dot);
    addEventListener('pointermove', (e) => {
      dot.style.opacity = '1';
      dot.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    }, true);
  });
});
const page = await context.newPage();
const started = Date.now();
await page.goto(url);
await page.locator('#r-bg-noise').fill('0'); // grain turns into GIF noise
await page.locator('#inspector').evaluate((el) => el.scrollTo(0, 0)); // the fill scrolled the settings
await page.mouse.move(640, 400);
await page.waitForTimeout(400);
const trim = (Date.now() - started) / 1000; // cut the page load from the GIF

const pause = (ms) => page.waitForTimeout(ms);
let mouse = [640, 400];
async function moveTo(x, y, steps = 14) {
  await page.mouse.move(x, y, { steps });
  mouse = [x, y];
}
async function clickOn(locator) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.click(...mouse);
  await pause(250);
}
const radio = (name) => page.getByRole('radio', { name, exact: true });

await pause(800);
await clickOn(radio('Screenshot'));
await page.setInputFiles('#file', root('e2e/fixtures/sample-screenshot.png'));
await pause(600);
await clickOn(radio('Gradient'));
await clickOn(radio('Lagoon'));
await page.locator('#r-bg-noise').fill('0');

const box = await page.locator('#preview').boundingBox();
const at = (u, v) => [box.x + box.width * u, box.y + box.height * v];
async function drag(tool, a, b) {
  await clickOn(radio(tool));
  await moveTo(...at(...a));
  await page.mouse.down();
  await moveTo(...at(...b), 16);
  await page.mouse.up();
  await pause(300);
}
await clickOn(page.getByRole('radio', { name: 'Colour #111111' }));
await drag('Cover', [0.72, 0.755], [0.93, 0.81]);
await clickOn(page.getByRole('radio', { name: 'Colour #ff4d3d' }));
await drag('Box', [0.24, 0.235], [0.468, 0.485]);
await drag('Arrow', [0.62, 0.13], [0.48, 0.26]);
await clickOn(radio('Text'));
await moveTo(...at(0.625, 0.13));
await page.mouse.click(...mouse);
await page.keyboard.type('Builds are up 12%', { delay: 45 });
await page.keyboard.press('Enter');
await clickOn(radio('Step'));
for (const p of [[0.243, 0.238], [0.715, 0.75]]) {
  await moveTo(...at(...p));
  await page.mouse.click(...mouse);
  await pause(250);
}
await clickOn(radio('Pointer'));

// a social-card size, then tilt the card a little at a time, the way dragging the sliders does
await page.locator('#size').scrollIntoViewIfNeeded();
await moveTo(...(await page.locator('#size').boundingBox().then((b) => [b.x + b.width / 2, b.y + b.height / 2])));
await page.locator('#size').selectOption('github');
await pause(500);
for (const [id, to] of [['#r-tiltY', -10], ['#r-tiltX', 6]]) {
  const slider = page.locator(id);
  await slider.scrollIntoViewIfNeeded();
  const b = await slider.boundingBox();
  await moveTo(b.x + b.width / 2, b.y + b.height / 2);
  for (let v = 0; v !== to; v += Math.sign(to)) {
    await slider.fill(String(v + Math.sign(to)));
    await moveTo(b.x + (b.width * (v + Math.sign(to) + 30)) / 60, b.y + b.height / 2, 2);
    await pause(40);
  }
}
await pause(400);
await clickOn(page.getByRole('button', { name: 'Download PNG' }));
await pause(1500);

const video = await page.video().path();
await context.close();
await browser.close();

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-ss', String(trim), '-i', video,
  '-vf', 'fps=10,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  root('docs/demo.gif'),
]);
rmSync(dir, { recursive: true });
console.log('wrote docs/demo.gif');
