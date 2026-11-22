import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const SAMPLE = 'e2e/fixtures/sample-screenshot.png';

/** Width and height from a PNG file's IHDR chunk. */
function pngSize(buf: Buffer) {
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

async function readout(page: Page) {
  const text = (await page.locator('#readout').textContent())!;
  const [, w, h] = text.match(/^(\d+) × (\d+)/)!;
  return { w: Number(w), h: Number(h) };
}

async function loadShot(page: Page) {
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Drop a screenshot here' })).toBeVisible();
  await page.setInputFiles('#file', SAMPLE);
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
}

/** Rough fingerprint of a region of the preview canvas (relative coordinates). */
function regionStats(page: Page, r: [number, number, number, number]) {
  return page.evaluate(([x, y, w, h]) => {
    const c = document.querySelector<HTMLCanvasElement>('#preview')!;
    const d = c.getContext('2d')!.getImageData(x * c.width, y * c.height, w * c.width, h * c.height).data;
    const distinct = new Set<number>();
    for (let i = 0; i < d.length; i += 4) distinct.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return distinct.size;
  }, r);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#preview')).toBeVisible();
});

test('opens on a highlighted code card and detects the language', async ({ page }) => {
  await expect(page.locator('#detected')).toHaveText(/Detected: /);
  await page.getByLabel('Snippet').fill('def greet(name):\n    return f"hello {name}"\n\nprint(greet("you"))');
  await expect(page.locator('#detected')).toHaveText('Detected: Python');
  const box = (await page.locator('#preview').boundingBox())!;
  expect(box.width).toBeGreaterThan(200);
});

test('downloads a PNG at the chosen scale and size preset', async ({ page }) => {
  await page.getByLabel('Size', { exact: true }).selectOption('github');
  await page.getByRole('radio', { name: '3x' }).check();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('framecraft-code-github@3x.png');
  expect(pngSize(await readFile((await file.path())!))).toEqual({ w: 3840, h: 1920 });
});

test('fit-content export matches the readout', async ({ page }) => {
  await page.getByRole('radio', { name: '1x' }).check();
  const size = await readout(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  expect(pngSize(await readFile((await (await dl).path())!))).toEqual(size);
});

test('exports a standalone SVG for code', async ({ page }) => {
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'SVG' }).click();
  const svg = await readFile((await (await dl).path())!, 'utf8');
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  expect(svg).toContain('@font-face{font-family:"JetBrains Mono";src:url(data:font/woff2;base64,');
  expect(svg).toContain('exportImage');
});

test('blocks SVG export while the card is tilted', async ({ page }) => {
  await page.getByLabel(/Turn sideways/).fill('12');
  await expect(page.getByRole('button', { name: 'SVG' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'SVG' }).click({ force: true }); // aria-disabled still explains itself on click
  await expect(page.locator('#toast')).toHaveText(/SVG cannot show tilt/);
});

test('frames a screenshot and redacts a region with pixelate', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check(); // frame: none, so the canvas is the screenshot
  // the deploy key in the fixture sits around x 0.75-0.94, y 0.78-0.84 of the image
  const key: [number, number, number, number] = [0.76, 0.79, 0.17, 0.04];
  const before = await regionStats(page, key);
  await page.getByRole('radio', { name: 'Pixelate' }).check();
  const box = (await page.locator('#preview').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.76);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.87, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Pixelate 1')).toBeVisible();
  const after = await regionStats(page, key);
  expect(after).toBeLessThan(before / 3);

  await page.getByRole('radio', { name: 'Step' }).check();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.3);
  await expect(page.getByText('Step 2')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByText('Step 2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Pixelate 1' }).click();
  await expect(page.getByText('Pixelate 1')).toHaveCount(0);
});

test('annotations land where you draw on a tilted card', async ({ page }) => {
  await loadShot(page);
  await page.getByLabel(/Turn sideways/).fill('-18');
  await page.getByRole('radio', { name: 'Step' }).check();
  const box = (await page.locator('#preview').boundingBox())!;
  const at = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.55 };
  // probe a few px left of the centre, off the digit
  const probe = () =>
    page.evaluate(([x, y]) => {
      const c = document.querySelector<HTMLCanvasElement>('#preview')!;
      const r = c.getBoundingClientRect();
      const d = c.getContext('2d')!.getImageData(((x - r.left) / r.width) * c.width, ((y - r.top) / r.height) * c.height, 1, 1).data;
      return [d[0], d[1], d[2]];
    }, [at.x - 6, at.y + 3]);
  await page.mouse.click(at.x, at.y);
  await expect(page.getByText('Step 1')).toBeVisible();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const [r, g, b] = await probe();
  // the badge is filled with the default red, so the clicked pixel turns red
  expect(r).toBeGreaterThan(200);
  expect(g).toBeLessThan(120);
  expect(b).toBeLessThan(120);
});

test('rejects a file that is not an image', async ({ page }) => {
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await page.setInputFiles('#file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#toast')).toHaveText(/notes.txt is not an image/);
  await expect(page.getByRole('heading', { name: 'Drop a screenshot here' })).toBeVisible();
});

test('pasting an image switches to screenshot mode', async ({ page, browserName }) => {
  test.skip(browserName === 'firefox', 'Firefox drops clipboardData from a synthetic paste event');
  const b64 = (await readFile(SAMPLE)).toString('base64');
  await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
  }, b64);
  await expect(page.getByRole('radio', { name: 'Screenshot', exact: true })).toBeChecked();
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
});

test('the URL carries the design and restores it', async ({ page }) => {
  await page.getByLabel('Padding').fill('120');
  await page.getByLabel('Theme').selectOption('nord');
  await page.getByRole('textbox', { name: 'Text' }).fill('Shipped with framecraft');
  await expect(page).toHaveURL(/#d=/);
  await page.waitForTimeout(400); // URL updates are debounced
  const url = page.url();
  const fresh = await page.context().newPage();
  await fresh.goto(url);
  await expect(fresh.getByLabel('Padding')).toHaveValue('120');
  await expect(fresh.getByLabel('Theme')).toHaveValue('nord');
  await expect(fresh.getByRole('textbox', { name: 'Text' })).toHaveValue('Shipped with framecraft');
});

test('a broken link falls back to the default design', async ({ page }) => {
  await page.goto('/#d=garbage!!');
  await expect(page.locator('#toast')).toHaveText(/does not contain a framecraft design/);
  await expect(page.locator('#preview')).toBeVisible();
});

test('templates save the look and apply it later', async ({ page }) => {
  await page.getByRole('radio', { name: 'Gradient' }).check();
  await page.getByLabel('Padding').fill('24');
  await page.getByLabel('Name', { exact: true }).fill('Tight gradient');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByLabel('Padding').fill('200');
  await page.getByRole('radio', { name: 'Solid' }).check();
  await page.getByLabel('Snippet').fill('echo kept');
  await page.getByRole('button', { name: 'Apply Tight gradient' }).click();
  await expect(page.getByLabel('Padding')).toHaveValue('24');
  await expect(page.getByRole('radio', { name: 'Gradient' })).toBeChecked();
  await expect(page.getByLabel('Snippet')).toHaveValue('echo kept');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Apply Tight gradient' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete Tight gradient' }).click();
  await expect(page.getByRole('button', { name: 'Apply Tight gradient' })).toHaveCount(0);
});

test('copies the image to the clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'only Chromium lets a test grant clipboard-read');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy image' }).click();
  await expect(page.locator('#toast')).toHaveText('Image copied. Paste it anywhere.');
  const types = await page.evaluate(async () => (await navigator.clipboard.read())[0].types);
  expect(types).toContain('image/png');
});

test('works on a phone-sized screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.locator('#preview')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // the annotation toolbar wraps instead of squashing its colour swatches
  await loadShot(page);
  const swatches = await page.locator('#note-colors label').evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().width));
  expect(Math.min(...swatches)).toBeGreaterThanOrEqual(22);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test('keyboard places a redaction that also wipes detail out of a tiny image', async ({ page }) => {
  // a 64x64 image of random pixels: every pixel differs, so detail is easy to count
  const noise = await page.evaluate(async () => {
    const c = new OffscreenCanvas(64, 64);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(64, 64);
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
    ctx.putImageData(img, 0, 0);
    const bytes = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
    return btoa(String.fromCharCode(...bytes));
  });
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await page.setInputFiles('#file', { name: 'noise.png', mimeType: 'image/png', buffer: Buffer.from(noise, 'base64') });
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.locator('#r-padding').fill('0');
  const centre: [number, number, number, number] = [0.4, 0.4, 0.2, 0.2];
  const before = await regionStats(page, centre);
  expect(before).toBeGreaterThan(100);

  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Pixelate 1')).toBeVisible();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  // a ratio, not a count: on a 2x screen (WebKit's default device) the upscaled cells blend at their edges
  expect(await regionStats(page, centre)).toBeLessThan(before / 4);

  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Delete');
  await expect(page.getByText('Pixelate 1')).toHaveCount(0);
});

test('an export too large for the browser explains itself', async ({ page }) => {
  await page.getByLabel('Snippet').fill('x'.repeat(5000));
  await page.getByRole('radio', { name: '3x' }).check();
  await page.getByRole('button', { name: 'Download PNG' }).click();
  await expect(page.locator('#toast')).toHaveText(/more than browsers can export/);
});

test('the pointer drags any annotation, and the list picks which one the keyboard edits', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;
  /** Count clearly red pixels in a small square of the preview around (u, v). */
  const red = (u: number, v: number) =>
    page.evaluate(([u, v]) => {
      const c = document.querySelector<HTMLCanvasElement>('#preview')!;
      const d = c.getContext('2d')!.getImageData(u * c.width - 6, v * c.height - 6, 12, 12).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110) n++;
      return n;
    }, [u, v]);

  await page.getByRole('radio', { name: 'Box', exact: true }).check();
  await page.mouse.move(...at(0.2, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.4, 0.5), { steps: 4 });
  await page.mouse.up();
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.mouse.click(...at(0.8, 0.2));
  expect(await red(0.2, 0.35)).toBeGreaterThan(5);

  // drag the box by its left edge; it is not the newest annotation
  await page.getByRole('radio', { name: 'Pointer' }).check();
  await page.mouse.move(...at(0.2, 0.35));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.35), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Box 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  expect(await red(0.2, 0.35)).toBe(0);
  expect(await red(0.5, 0.35)).toBeGreaterThan(5);

  // picking the step in the list sends Delete to it, not to the newest annotation
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  await expect(page.locator('#preview')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Box 1', exact: true })).toBeVisible();
});
