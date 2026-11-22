// Makes the README images by driving framecraft itself in Chromium.
// Start the app first (npm run dev), then: node scripts/readme-images.mjs [url]
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:4210/';
const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const browser = await chromium.launch();

async function save(page, button, path) {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: button }).click();
  await (await dl).saveAs(root(path));
}

// 1. plain screenshots of the running app
const app = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await app.goto(url);
await app.waitForTimeout(500);
await app.screenshot({ path: root('docs/screenshots/code-mode.png') });

await app.getByRole('radio', { name: 'Screenshot', exact: true }).check();
await app.setInputFiles('#file', root('e2e/fixtures/sample-screenshot.png'));
await app.getByRole('radio', { name: 'Gradient' }).check();
await app.getByRole('radio', { name: 'Lagoon' }).check();
const box = await app.locator('#preview').boundingBox();
const at = (u, v) => [box.x + box.width * u, box.y + box.height * v];
async function drag(tool, a, b) {
  await app.getByRole('radio', { name: tool, exact: true }).check();
  await app.mouse.move(...at(...a));
  await app.mouse.down();
  await app.mouse.move(...at(...b), { steps: 6 });
  await app.mouse.up();
}
await app.getByRole('radio', { name: 'Colour #111111' }).check();
await drag('Cover', [0.72, 0.755], [0.93, 0.81]); // a solid cover, as the README recommends for keys
await app.getByRole('radio', { name: 'Colour #ff4d3d' }).check();
await drag('Box', [0.24, 0.235], [0.468, 0.485]);
await drag('Arrow', [0.62, 0.13], [0.48, 0.26]);
await app.getByRole('radio', { name: 'Text', exact: true }).check();
await app.mouse.click(...at(0.625, 0.13));
await app.keyboard.type('Builds are up 12%');
await app.keyboard.press('Enter');
await app.getByRole('radio', { name: 'Step', exact: true }).check();
await app.mouse.click(...at(0.243, 0.238));
await app.mouse.click(...at(0.715, 0.75));
await app.getByRole('radio', { name: 'Pointer' }).check();
await app.waitForTimeout(300);
await app.screenshot({ path: root('docs/screenshots/screenshot-mode.png') });

// 2. the hero: framecraft framing its own screenshot
const hero = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await hero.goto(url);
await hero.getByRole('radio', { name: 'Screenshot', exact: true }).check();
await hero.setInputFiles('#file', root('docs/screenshots/code-mode.png'));
await hero.getByLabel('Address').fill('framecraft');
await hero.getByLabel('Size', { exact: true }).selectOption('github');
await hero.getByRole('radio', { name: 'Mesh' }).check();
await hero.getByRole('radio', { name: 'Sorbet' }).check();
await hero.locator('#r-padding').fill('64');
await hero.locator('#r-bg-noise').fill('0'); // grain is lovely but makes the PNG four times bigger
await hero.locator('#r-tiltY').fill('-10');
await hero.locator('#r-tiltX').fill('6');
await hero.getByRole('radio', { name: 'Large' }).check();
await hero.getByRole('radio', { name: '2x' }).check();
await hero.waitForTimeout(300);
await save(hero, 'Download PNG', 'docs/hero.png');

// 3. a code card as PNG and SVG
const code = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await code.goto(url);
await code.getByLabel('Snippet').fill(`import { render } from './render';

// every pixel is drawn in your browser tab
const card = render(design, assets, 2);
card?.canvas.toBlob(save, 'image/png');`);
await code.getByLabel('Language').selectOption('typescript');
await code.getByLabel('Highlight lines').fill('3');
await code.getByLabel('File name').fill('share.ts');
await code.getByRole('radio', { name: 'Gradient' }).check();
await code.getByRole('radio', { name: 'Dusk' }).check();
await code.locator('#r-bg-noise').fill('0');
await code.getByRole('radio', { name: '2x' }).check();
await code.waitForTimeout(300);
await save(code, 'Download PNG', 'docs/code-card.png');
await save(code, 'SVG', 'docs/code-card.svg');

// 3b. a code card showing a change, with added and removed lines
const diff = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await diff.goto(url);
await diff.getByLabel('Snippet').fill(`export function exportName(d: Design, ext: string) {
  const { w, h } = outputSize(d);
  return \`framecraft-\${w}x\${h}.\${ext}\`;
  return \`framecraft-\${d.mode}-\${w}x\${h}@\${d.scale}x.\${ext}\`;
}`);
await diff.getByLabel('Language').selectOption('typescript');
await diff.getByLabel('Highlight lines').fill('');
await diff.getByLabel('Removed lines').fill('3');
await diff.getByLabel('Added lines').fill('4');
await diff.getByLabel('File name').fill('export.ts');
await diff.getByLabel('Theme').selectOption('github-dark');
await diff.getByRole('radio', { name: 'Gradient' }).check();
await diff.getByRole('radio', { name: 'Dusk' }).check();
await diff.locator('#r-bg-noise').fill('0');
await diff.getByRole('radio', { name: '2x' }).check();
await diff.waitForTimeout(300);
await save(diff, 'Download PNG', 'docs/diff-card.png');

// 4. the editor on a phone, with a box selected so its resize handle shows
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await phone.goto(url);
await phone.getByRole('radio', { name: 'Screenshot', exact: true }).check();
await phone.setInputFiles('#file', root('e2e/fixtures/sample-screenshot.png'));
await phone.getByRole('radio', { name: 'Gradient' }).check();
await phone.getByRole('radio', { name: 'Lagoon' }).check();
await phone.getByRole('radio', { name: 'Box', exact: true }).check();
await phone.evaluate(() => window.scrollTo(0, 0)); // checking the gradient scrolled the settings into view
await phone.waitForTimeout(300);
const pbox = await phone.locator('#preview').boundingBox();
await phone.mouse.move(pbox.x + pbox.width * 0.24, pbox.y + pbox.height * 0.235);
await phone.mouse.down();
await phone.mouse.move(pbox.x + pbox.width * 0.468, pbox.y + pbox.height * 0.485, { steps: 6 });
await phone.mouse.up();
await phone.getByRole('radio', { name: 'Pointer' }).check();
await phone.waitForTimeout(300);
await phone.screenshot({ path: root('docs/screenshots/phone.png') });

await browser.close();
