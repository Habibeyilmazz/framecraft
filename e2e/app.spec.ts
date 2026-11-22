import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { crc32, deflateRawSync, deflateSync } from 'node:zlib';

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

/** Wait until the preview has redrawn: the canvas updates on the next animation frame, not with the controls. */
const drawn = (page: Page) => page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));

async function loadShot(page: Page) {
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await expect(page.getByRole('heading', { name: 'Add a screenshot' })).toBeVisible();
  await page.setInputFiles('#file', SAMPLE);
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await drawn(page); // the preview canvas appears on the next frame
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
  // record Content-Security-Policy violations, so every test also checks the policy does not break the app
  await page.addInitScript(() => {
    const w = window as unknown as { cspViolations: string[] };
    w.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (e) => w.cspViolations.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  await page.goto('/');
  await expect(page.locator('#preview')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
});

test('ships a strict Content-Security-Policy that blocks injected scripts', async ({ page }) => {
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(csp).not.toContain('unsafe-inline');
  const ran = await page.evaluate(async () => {
    const w = window as unknown as { cspViolations: string[]; injected?: boolean };
    const div = document.createElement('div');
    div.innerHTML = '<img src="x" onerror="window.injected = true">';
    document.body.append(div);
    await new Promise((done) => setTimeout(done, 200));
    div.remove();
    const blocked = w.cspViolations.splice(0).some((v) => v.startsWith('script-src'));
    return { injected: !!w.injected, blocked };
  });
  expect(ran).toEqual({ injected: false, blocked: true });
});

test('opens on a highlighted code card and detects the language', async ({ page }) => {
  await expect(page.locator('#detected')).toHaveText('Detected: TypeScript'); // the sample is export.ts
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

test('a custom size sets the export size, waits for a valid number, and travels in the link', async ({ page }) => {
  const width = page.getByRole('spinbutton', { name: 'Width (px)' });
  const height = page.getByRole('spinbutton', { name: 'Height (px)' });
  await expect(width).toBeHidden();
  await page.getByLabel('Size', { exact: true }).selectOption('custom');
  await width.fill('1000');
  await height.fill('420');
  await expect(page.locator('#readout')).toContainText('1000 × 420 · exports at 2x as 2000 × 840 px');

  // half-typed or out-of-range numbers leave the size alone; leaving the field shows the size in use again
  await width.fill('');
  await width.pressSequentially('9');
  await expect(page.locator('#readout')).toContainText('1000 × 420');
  await width.fill('99999');
  await width.blur();
  await expect(width).toHaveValue('1000');
  await expect(page.locator('#readout')).toContainText('1000 × 420');

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('framecraft-code-1000x420@2x.png');
  expect(pngSize(await readFile((await file.path())!))).toEqual({ w: 2000, h: 840 });

  await page.waitForTimeout(400); // URL updates are debounced
  const fresh = await page.context().newPage();
  await fresh.goto(page.url());
  await expect(fresh.getByRole('spinbutton', { name: 'Height (px)' })).toHaveValue('420');
  await expect(fresh.locator('#readout')).toContainText('1000 × 420');
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

test('export buttons look unavailable until there is a screenshot, and say why on click', async ({ page }) => {
  const png = page.getByRole('button', { name: 'Download PNG' });
  const copy = page.getByRole('button', { name: 'Copy image' });
  await expect(png).toHaveAttribute('aria-disabled', 'false'); // the code card can always export
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await expect(png).toHaveAttribute('aria-disabled', 'true');
  await expect(copy).toHaveAttribute('aria-disabled', 'true');
  await png.click({ force: true }); // aria-disabled still explains itself on click
  await expect(page.locator('#toast')).toHaveText('Add a screenshot first.');
  await page.setInputFiles('#file', SAMPLE);
  await expect(png).toHaveAttribute('aria-disabled', 'false');
  await expect(copy).toHaveAttribute('aria-disabled', 'false');
});

test('frames a screenshot and redacts a region with pixelate', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check(); // frame: none, so the canvas is the screenshot
  // the deploy key in the fixture sits around x 0.75-0.94, y 0.78-0.84 of the image
  const key: [number, number, number, number] = [0.76, 0.79, 0.17, 0.04];
  await drawn(page);
  const before = await regionStats(page, key);
  await page.getByRole('radio', { name: 'Pixelate' }).check();
  const box = (await page.locator('#preview').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.76);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.87, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Pixelate 1')).toBeVisible();
  await drawn(page);
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

test('cover hides a secret under one solid colour', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  const key: [number, number, number, number] = [0.76, 0.79, 0.17, 0.04];
  await drawn(page);
  expect(await regionStats(page, key)).toBeGreaterThan(10);
  await page.getByRole('radio', { name: 'Cover' }).check();
  await page.getByRole('radio', { name: 'Colour #111111' }).check();
  const box = (await page.locator('#preview').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.76);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.87, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByText('Cover 1')).toBeVisible();
  await drawn(page);
  // pixelate and blur keep a few shades per cell; a cover leaves exactly one
  expect(await regionStats(page, key)).toBe(1);
  const [r, g, b] = await page.evaluate(([x, y]) => {
    const c = document.querySelector<HTMLCanvasElement>('#preview')!;
    return [...c.getContext('2d')!.getImageData(x * c.width, y * c.height, 1, 1).data];
  }, [0.85, 0.81]);
  expect([r, g, b]).toEqual([0x11, 0x11, 0x11]);
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
  await drawn(page);
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
  await expect(page.getByRole('heading', { name: 'Add a screenshot' })).toBeVisible();
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
  // a landscape preview uses the width of the phone, and the stage ends just below it (no empty mat)
  await drawn(page);
  const preview = (await page.locator('#preview').boundingBox())!;
  const stage = (await page.locator('#canvas-wrap').boundingBox())!;
  expect(preview.width).toBeGreaterThanOrEqual(375 - 2 * 16 - 1);
  expect(stage.y + stage.height - (preview.y + preview.height)).toBeLessThanOrEqual(17);
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
  await drawn(page);
  const before = await regionStats(page, centre);
  expect(before).toBeGreaterThan(100);

  await page.getByRole('radio', { name: 'Pixelate' }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Pixelate 1')).toBeVisible();
  await drawn(page);
  // a ratio, not a count: on a 2x screen (WebKit's default device) the upscaled cells blend at their edges
  expect(await regionStats(page, centre)).toBeLessThan(before / 4);

  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('Delete');
  await expect(page.getByText('Pixelate 1')).toHaveCount(0);
});

/** A grey PNG of w x h px, built here so a big image costs no fixture file. */
function greyPng(w: number, h: number) {
  const chunk = (type: string, data: Buffer) => {
    const td = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(td.length + 8);
    out.writeUInt32BE(data.length);
    td.copy(out, 4);
    out.writeUInt32BE(crc32(td), td.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 0], 8); // 8-bit greyscale
  const rows = Buffer.alloc((w + 1) * h, 128);
  for (let y = 0; y < h; y++) rows[y * (w + 1)] = 0; // filter byte
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

test('a share link stacking blurs keeps 30 and draws a big screenshot quickly', async ({ page, browserName }) => {
  // 200 whole-image blurs in a 184-character link froze the tab for about 27 s once a 12 MP screenshot was added
  test.slow(browserName !== 'chromium'); // CI's WebKit draws canvases in software: these 30 blurs took 19 s there
  const notes = Array.from({ length: 200 }, () => ({ t: 'blur', x: 0, y: 0, w: 1, h: 1 }));
  await page.goto(`/#d=${deflateRawSync(JSON.stringify({ mode: 'shot', notes })).toString('base64url')}`);
  await expect(page.getByRole('heading', { name: 'Add a screenshot' })).toBeVisible();
  const start = Date.now();
  await page.setInputFiles('#file', { name: 'big.png', mimeType: 'image/png', buffer: greyPng(4096, 3072) });
  await expect(page.locator('#readout')).toHaveText(/exports at/, { timeout: 60_000 });
  // timed where it was measured: 27 s in Chromium before the fix, about 1 s after
  if (browserName === 'chromium') expect(Date.now() - start).toBeLessThan(10_000);
  await expect(page.getByRole('button', { name: /^Blur \d+$/ })).toHaveCount(30);
});

test('blur wipes out detail, and the 31st redaction is refused', async ({ page }) => {
  // random pixels, so every neighbour differs a lot until something smooths them
  const noise = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(400, 300);
    for (let i = 0; i < img.data.length; i++) img.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
    ctx.putImageData(img, 0, 0);
    const bytes = new Uint8Array(await (await c.convertToBlob()).arrayBuffer());
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  });
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await page.setInputFiles('#file', { name: 'noise.png', mimeType: 'image/png', buffer: Buffer.from(noise, 'base64') });
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.locator('#r-padding').fill('0');
  // mean difference between horizontal neighbours (red channel) in the middle of the area the keyboard covers
  const roughness = () =>
    page.evaluate(() => {
      const c = document.querySelector<HTMLCanvasElement>('#preview')!;
      const d = c.getContext('2d')!.getImageData(c.width * 0.42, c.height * 0.42, c.width * 0.16, c.height * 0.16).data;
      let sum = 0;
      for (let i = 4; i < d.length; i += 4) sum += Math.abs(d[i] - d[i - 4]);
      return sum / (d.length / 4);
    });
  await drawn(page);
  const before = await roughness();
  expect(before).toBeGreaterThan(15); // about 85 on a 1x screen; a 2x one (WebKit's default device) doubles each pixel

  await page.getByRole('radio', { name: 'Blur' }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Blur 1')).toBeVisible();
  await drawn(page);
  // 7x in CI's WebKit, which smooths the upscale but may not apply the canvas blur filter; more than 10x elsewhere
  expect(await roughness()).toBeLessThan(before / 5);

  for (let i = 1; i < 30; i++) await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Blur \d+$/ })).toHaveCount(30);
  await page.getByRole('radio', { name: 'Cover' }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText(/^Up to 30 blur, pixelate and cover areas/);
  await expect(page.getByRole('button', { name: /^Cover \d+$/ })).toHaveCount(0);
});

test('an export too large for the browser explains itself', async ({ page }) => {
  await page.getByLabel('Snippet').fill('x'.repeat(5000));
  await page.getByRole('radio', { name: '3x' }).check();
  await page.getByRole('button', { name: 'Download PNG' }).click();
  await expect(page.locator('#toast')).toHaveText(/more than browsers can export/);
});

/** Put text in a field the way a paste does, with one input event (fill sends one per character on long text). */
const paste = (page: Page, label: string, text: string) =>
  page.getByLabel(label).evaluate((el: HTMLTextAreaElement, t) => {
    el.value = t;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  }, text);

test('a huge snippet keeps the preview canvas small', async ({ page }) => {
  // a share link this small once made the preview allocate over a gigabyte of canvas
  await page.locator('#r-code-fontSize').fill('32');
  await paste(page, 'Snippet', 'W'.repeat(5500) + '\nx'.repeat(3000));
  await drawn(page);
  const { w, h } = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#preview')!;
    return { w: c.width, h: c.height };
  });
  expect(Math.max(w, h)).toBeLessThanOrEqual(4096);
  await expect(page.locator('#readout')).toHaveText(/exports at/);
});

test('the pointer drags any annotation, and the list picks which one the keyboard edits', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await drawn(page); // the canvas changes size with the frame
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
  // the newest annotation is the selected one
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await drawn(page);
  expect(await red(0.2, 0.35)).toBeGreaterThan(5);

  // drag the box by its left edge; it is not the newest annotation
  await page.getByRole('radio', { name: 'Pointer' }).check();
  await page.mouse.move(...at(0.2, 0.35));
  await page.mouse.down();
  await page.mouse.move(...at(0.5, 0.35), { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Box 1', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await drawn(page);
  expect(await red(0.2, 0.35)).toBe(0);
  expect(await red(0.5, 0.35)).toBeGreaterThan(5);

  // picking the step in the list sends Delete to it, not to the newest annotation
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  await expect(page.locator('#preview')).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Box 1', exact: true })).toBeVisible();
});

test('with the Pointer, the colour swatches recolour the selected annotation', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await drawn(page);
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;
  /** How many pixels in a small square around (u, v) are within a few levels of the colour [r, g, b]. */
  const near = (u: number, v: number, rgb: number[]) =>
    page.evaluate(([u, v, rgb]) => {
      const c = document.querySelector<HTMLCanvasElement>('#preview')!;
      const d = c.getContext('2d')!.getImageData(u * c.width - 8, v * c.height - 8, 16, 16).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (rgb.every((x, k) => Math.abs(d[i + k] - x) < 8)) n++;
      return n;
    }, [u, v, rgb] as const);
  const swatch = (hex: string) => page.getByRole('radio', { name: `Colour ${hex}` });
  const dot = (name: string) => page.getByRole('listitem').filter({ has: page.getByRole('button', { name, exact: true }) }).locator('.dot');

  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.mouse.click(...at(0.3, 0.3));
  await page.mouse.click(...at(0.7, 0.3));
  // with a drawing tool, a swatch only sets the colour of the next annotation
  await swatch('#22c55e').check();
  await expect(dot('Step 2')).toHaveCSS('background-color', 'rgb(255, 77, 61)');

  await page.getByRole('radio', { name: 'Pointer' }).check();
  await expect(swatch('#ff4d3d')).toBeChecked(); // shows the selected step's colour, not the next one's
  await swatch('#3b82f6').check();
  await expect(page.locator('#toast')).toHaveText('Step 2 recoloured.');
  await expect(dot('Step 2')).toHaveCSS('background-color', 'rgb(59, 130, 246)');
  await expect(dot('Step 1')).toHaveCSS('background-color', 'rgb(255, 77, 61)');
  await drawn(page);
  expect(await near(0.7, 0.3, [59, 130, 246])).toBeGreaterThan(20);
  expect(await near(0.7, 0.3, [255, 77, 61])).toBe(0);
  expect(await near(0.3, 0.3, [255, 77, 61])).toBeGreaterThan(20);

  // selecting another annotation shows its colour; recolouring it works from the keyboard too
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  await expect(swatch('#ff4d3d')).toBeChecked();
  await swatch('#ff4d3d').focus();
  await page.keyboard.press('ArrowRight');
  await expect(dot('Step 1')).toHaveCSS('background-color', 'rgb(255, 176, 32)');

  // undo puts the old colour back, and the swatches follow
  await page.keyboard.press('Control+z');
  await expect(dot('Step 1')).toHaveCSS('background-color', 'rgb(255, 77, 61)');
  await expect(swatch('#ff4d3d')).toBeChecked();

  // back on a drawing tool, the swatches show the colour for the next annotation again
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await expect(swatch('#ffb020')).toBeChecked();
  await page.mouse.click(...at(0.5, 0.7));
  await expect(dot('Step 3')).toHaveCSS('background-color', 'rgb(255, 176, 32)');
});

test('the selected annotation has a handle that resizes it with the mouse', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await drawn(page);
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;

  await page.getByRole('radio', { name: 'Box', exact: true }).check();
  await page.mouse.move(...at(0.2, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.4, 0.4), { steps: 4 });
  await page.mouse.up();
  const handle = page.locator('#handle');
  await expect(handle).toBeHidden(); // only with the Pointer tool
  await page.getByRole('radio', { name: 'Pointer' }).check();
  await drawn(page);
  await expect(handle).toBeVisible();
  const centre = async () => {
    const r = (await handle.boundingBox())!;
    return [r.x + r.width / 2, r.y + r.height / 2];
  };
  const [hx, hy] = await centre();
  expect(Math.abs(hx - at(0.4, 0.4)[0])).toBeLessThan(3);
  expect(Math.abs(hy - at(0.4, 0.4)[1])).toBeLessThan(3);

  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(...at(0.7, 0.6), { steps: 6 });
  await page.mouse.up();
  await drawn(page);
  const [nx, ny] = await centre();
  expect(Math.abs(nx - at(0.7, 0.6)[0])).toBeLessThan(3);
  expect(Math.abs(ny - at(0.7, 0.6)[1])).toBeLessThan(3);
  // resized, not moved: the top-left corner stayed, so the outline still passes through it
  const kept = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#preview')!;
    const d = c.getContext('2d')!.getImageData(0.2 * c.width - 3, 0.5 * c.height - 3, 6, 6).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110) n++;
    return n;
  });
  expect(kept).toBeGreaterThan(3);
});

test('text labels: click to place, type the words, and edit them from the keyboard', async ({ page }) => {
  await page.getByLabel('Padding').fill('0');
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await drawn(page);
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;
  /** Clearly red pixels in a strip of the preview from u0 to u1 at height v. */
  const redStrip = (u0: number, u1: number, v: number) =>
    page.evaluate(([u0, u1, v]) => {
      const c = document.querySelector<HTMLCanvasElement>('#preview')!;
      const d = c.getContext('2d')!.getImageData(u0 * c.width, v * c.height - 2, (u1 - u0) * c.width, 4).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 110 && d[i + 2] < 110) n++;
      return n;
    }, [u0, u1, v]);

  const words = page.getByLabel('Label text');
  await expect(words).toBeHidden();
  await page.getByRole('radio', { name: 'Text', exact: true }).check();
  await page.mouse.click(...at(0.3, 0.6));
  // the new label's words are selected, ready to be typed over
  await expect(words).toBeFocused();
  await expect(words).toHaveValue('Label');
  await page.keyboard.type('Ship it');
  await expect(page.getByRole('button', { name: 'Text “Ship it”', exact: true })).toBeVisible();
  await drawn(page);
  const short = await redStrip(0.3, 0.6, 0.6);
  expect(short).toBeGreaterThan(20);
  expect(await redStrip(0.45, 0.6, 0.6)).toBe(0);

  // longer words widen the pill at the same font size
  await words.fill('Ship it today, the stats are live');
  await drawn(page);
  expect(await redStrip(0.45, 0.6, 0.6)).toBeGreaterThan(20);

  // Enter goes back to the preview, where arrow keys move the label and Delete removes it
  await words.press('Enter');
  await expect(page.locator('#preview')).toBeFocused();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await drawn(page);
  expect(await redStrip(0.3, 0.6, 0.6)).toBe(0);
  expect(await redStrip(0.3, 0.6, 0.7)).toBeGreaterThan(20);

  // the keyboard can place one too
  await page.keyboard.press('Enter');
  await expect(words).toBeFocused();
  await page.keyboard.type('Second');
  await words.press('Escape');
  await expect(page.getByRole('button', { name: 'Text “Second”', exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: 'Text “Second”', exact: true })).toHaveCount(0);

  // with another tool picked, the words box hides
  await page.getByRole('radio', { name: 'Arrow', exact: true }).check();
  await expect(words).toBeHidden();
});

test('a second label gets its own words in the text box, even while the box has focus', async ({ page }) => {
  await loadShot(page);
  const box = (await page.locator('#preview').boundingBox())!;
  const words = page.getByLabel('Label text');
  await page.getByRole('radio', { name: 'Text', exact: true }).check();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.keyboard.type('First');
  await expect(words).toBeFocused();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.7);
  await expect(words).toHaveValue('Label');
  await page.keyboard.type('Second');
  await expect(page.getByRole('button', { name: 'Text “First”', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Text “First”', exact: true }).click();
  await page.getByRole('radio', { name: 'Pointer' }).check();
  await expect(words).toHaveValue('First');
});

type Rect = { x: number; y: number; w: number; h: number };
/** The design in the share link (the URL updates 300 ms after a change). */
const linkDesign = (page: Page) =>
  page.evaluate(async () => {
    const s = location.hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    if (!s) return { notes: [], crop: { x: 0, y: 0, w: 1, h: 1 } };
    const bytes = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const json = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    return JSON.parse(json) as { notes: ({ t: string; n: number; s?: string } & Rect)[]; crop: Rect };
  });
/** The annotations in the share link. */
const linkNotes = async (page: Page) => (await linkDesign(page)).notes;

test('undo brings back a deleted annotation, and new steps never repeat a number', async ({ page }) => {
  await loadShot(page);
  const box = (await page.locator('#preview').boundingBox())!;
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  for (const u of [0.2, 0.4, 0.6]) await page.mouse.click(box.x + box.width * u, box.y + box.height * 0.5);
  await page.getByRole('button', { name: 'Remove Step 2' }).click();
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5);
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveText(['Step 1', 'Step 3', 'Step 4']);

  await page.getByRole('button', { name: 'Remove Step 1' }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveText(['Step 1', 'Step 3', 'Step 4']);
  await page.getByRole('button', { name: 'Remove all' }).click();
  await page.getByRole('button', { name: 'Undo annotation or crop change' }).click();
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveCount(3);
  // undo walks back through the history, then has nothing left to undo
  for (let i = 0; i < 8; i++) await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveCount(0);
});

test('undo keeps the selected annotation selected, and waits while one is being dragged', async ({ page }) => {
  await loadShot(page);
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Step 1', exact: true }).click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ControlOrMeta+z');
  // Delete still acts on Step 1, not on the newest
  await page.keyboard.press('Delete');
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveText(['Step 2']);

  // Ctrl+Z in the middle of a drag does not pull the annotation out from under the pointer
  await page.getByRole('radio', { name: 'Box', exact: true }).check();
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;
  await page.mouse.move(...at(0.2, 0.2));
  await page.mouse.down();
  await page.mouse.move(...at(0.4, 0.4), { steps: 3 });
  await page.keyboard.press('ControlOrMeta+z');
  await page.mouse.move(...at(0.5, 0.5), { steps: 3 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /^(Step|Box) \d+$/ })).toHaveText(['Step 2', 'Box 1']);
});

test('a label shrunk by long words grows back when they get shorter', async ({ page }) => {
  await loadShot(page);
  const box = (await page.locator('#preview').boundingBox())!;
  await page.getByRole('radio', { name: 'Text', exact: true }).check();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  const words = page.getByLabel('Label text');
  await words.fill('Hi');
  await expect.poll(async () => (await linkNotes(page))[0]?.s).toBe('Hi');
  const before = (await linkNotes(page))[0];
  await words.fill('W'.repeat(80));
  await expect.poll(async () => (await linkNotes(page))[0]?.w).toBe(1);
  await words.fill('Hi');
  await expect.poll(async () => (await linkNotes(page))[0]?.w).toBeCloseTo(before.w, 3);
  expect((await linkNotes(page))[0].h).toBeCloseTo(before.h, 3);
});

test('crop: drag over the part to keep, export just that part, keep annotations on the image, undo and reset', async ({ page }) => {
  await loadShot(page); // 2200 x 1280, shown at 1400 x 815
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.getByLabel('Padding').fill('0');
  const at = async (u: number, v: number) => {
    const box = (await page.locator('#preview').boundingBox())!;
    return [box.x + box.width * u, box.y + box.height * v] as const;
  };
  const dragOn = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...(await at(...from)));
    await page.mouse.down();
    await page.mouse.move(...(await at(...to)), { steps: 4 });
    await page.mouse.up();
  };
  // a step on the whole image, near its top-left corner, which the crop will leave out
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.mouse.click(...(await at(0.1, 0.1)));
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toBeVisible();

  await page.getByRole('radio', { name: 'Crop', exact: true }).check();
  await page.mouse.click(...(await at(0.5, 0.5))); // a click is not a crop
  await expect(page.locator('#toast')).toHaveText('Drag over the part of the image to keep.');
  await dragOn([0.5, 0.25], [1, 1]); // the right half, bottom three quarters
  await expect(page.locator('#crop-info')).toHaveText(/^Cropped to 110\d × 9\d\d of 2200 × 1280 px\.$/);
  await expect.poll(async () => (await linkDesign(page)).crop.x).toBeCloseTo(0.5, 2);
  const crop = (await linkDesign(page)).crop;
  // the Crop tool shows the whole image; back on the Pointer, the preview and the export are the crop alone
  await page.getByRole('radio', { name: 'Pointer', exact: true }).check();
  await drawn(page);
  const shown = await readout(page);
  expect(shown.w).toBeCloseTo(crop.w * 2200, -1);
  expect(shown.h).toBeCloseTo(crop.h * 1280, -1);

  // an arrow drawn on the cropped view lands on that spot of the whole image
  await page.getByRole('radio', { name: 'Arrow', exact: true }).check();
  await dragOn([0.2, 0.5], [0.6, 0.5]);
  await expect.poll(async () => (await linkNotes(page)).length).toBe(2);
  const arrow = (await linkDesign(page)).notes[1] as unknown as { x: number; x2: number; y: number };
  expect(arrow.x).toBeCloseTo(crop.x + 0.2 * crop.w, 2);
  expect(arrow.x2).toBeCloseTo(crop.x + 0.6 * crop.w, 2);
  expect(arrow.y).toBeCloseTo(crop.y + 0.5 * crop.h, 2);

  // the downloaded PNG holds the cropped pixels of the source image
  await page.getByRole('radio', { name: '1x' }).check();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const png = await readFile((await (await dl).path())!);
  expect(pngSize(png)).toEqual(shown);
  const diff = await page.evaluate(
    async ([out, src, c]) => {
      const load = async (b64: string) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))]));
      const [a, b] = [await load(out), await load(src)];
      const pixels = (bmp: ImageBitmap, sx: number, sy: number, sw: number, sh: number) => {
        const ctx = new OffscreenCanvas(40, 40).getContext('2d')!;
        ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, 40, 40);
        return ctx.getImageData(0, 0, 40, 40).data;
      };
      // the bottom-right quarter of the export (no annotations there) against the same part of the source
      const p = pixels(a, a.width / 2, a.height / 2, a.width / 2, a.height / 2);
      const q = pixels(b, (c.x + c.w / 2) * b.width, (c.y + c.h / 2) * b.height, (c.w / 2) * b.width, (c.h / 2) * b.height);
      let sum = 0;
      for (let i = 0; i < p.length; i += 4) sum += Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]);
      return sum / (p.length / 4) / 3;
    },
    [png.toString('base64'), (await readFile(SAMPLE)).toString('base64'), crop] as const,
  );
  expect(diff).toBeLessThan(1.5); // mean difference per channel, out of 255: about 0.2 here (resampling); 6 for the uncropped image

  // the keyboard moves and resizes the crop; undo steps back through crop changes too
  await page.getByRole('radio', { name: 'Crop', exact: true }).check();
  await page.locator('#preview').focus();
  await page.keyboard.press('Delete');
  await expect(page.locator('#crop-row')).toBeHidden();
  for (let i = 0; i < 10; i++) await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.locator('#crop-info')).toHaveText('Cropped to 1980 × 1280 of 2200 × 1280 px.');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#crop-info')).toHaveText('Cropped to 2002 × 1280 of 2200 × 1280 px.');

  // the crop travels in the link with the annotations; replacing the image clears both
  await page.waitForTimeout(400);
  const fresh = await page.context().newPage();
  await fresh.goto(page.url());
  await fresh.setInputFiles('#file', SAMPLE);
  await expect(fresh.locator('#crop-info')).toHaveText('Cropped to 2002 × 1280 of 2200 × 1280 px.');
  await fresh.getByRole('button', { name: 'Show whole image' }).click();
  await expect(fresh.locator('#crop-row')).toBeHidden();
  await page.setInputFiles('#file', SAMPLE);
  await expect(page.locator('#crop-row')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Step 1', exact: true })).toHaveCount(0);
});

test('the pointer cannot drag an annotation, or its handle, out of the crop', async ({ page }) => {
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.getByLabel('Padding').fill('0');
  const at = async (u: number, v: number) => {
    const box = (await page.locator('#preview').boundingBox())!;
    return [box.x + box.width * u, box.y + box.height * v] as const;
  };
  const dragOn = async (from: [number, number], to: [number, number]) => {
    await page.mouse.move(...(await at(...from)));
    await page.mouse.down();
    await page.mouse.move(...(await at(...to)), { steps: 4 });
    await page.mouse.up();
  };
  await page.getByRole('radio', { name: 'Crop', exact: true }).check();
  await dragOn([0.5, 0], [1, 1]); // the right half
  await expect.poll(async () => (await linkDesign(page)).crop.x).toBeCloseTo(0.5, 2);
  await page.getByRole('radio', { name: 'Box', exact: true }).check();
  await drawn(page); // the preview now shows the crop alone
  await dragOn([0.4, 0.4], [0.6, 0.6]);
  await expect.poll(async () => (await linkNotes(page))[0]?.x).toBeCloseTo(0.7, 2);
  await page.getByRole('radio', { name: 'Pointer', exact: true }).check();
  await drawn(page);
  // grab the box's left edge and throw it far past the crop's left edge (off the canvas)
  await dragOn([0.4, 0.5], [-0.5, 0.5]);
  await expect.poll(async () => (await linkNotes(page))[0].x).toBeCloseTo(0.5, 2);
  // the resize handle stops at the crop's bottom-right corner too
  const [x, y] = [(await linkNotes(page))[0].x + (await linkNotes(page))[0].w, 0.6];
  await dragOn([(x - 0.5) * 2, y], [1.5, 1.5]);
  await expect.poll(async () => (await linkNotes(page))[0].w).toBeCloseTo(0.5, 2);
  const n = (await linkNotes(page))[0];
  expect([n.x, n.y, n.x + n.w, n.y + n.h].map((v) => v.toFixed(2))).toEqual(['0.50', '0.40', '1.00', '1.00']);
});

test('a right-click on the preview does not place an annotation', async ({ page }) => {
  await loadShot(page);
  const box = (await page.locator('#preview').boundingBox())!;
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'middle' });
  await page.getByRole('radio', { name: 'Box', exact: true }).check();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('#notes-list')).toBeEmpty();
});

test('removing an annotation from the list keeps keyboard focus in the list', async ({ page }) => {
  await loadShot(page);
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.locator('#preview').focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Remove Step 2' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Step 3' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Remove Step 1' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#preview')).toBeFocused();
});

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true });

  test('a second finger does not leave a stray annotation', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'multi-touch is sent through the Chrome DevTools Protocol');
    await loadShot(page);
    await page.getByRole('radio', { name: 'Box', exact: true }).check();
    const box = (await page.locator('#preview').boundingBox())!;
    const at = (u: number, v: number, id: number) => ({ x: box.x + box.width * u, y: box.y + box.height * v, id });
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, touchPoints: ReturnType<typeof at>[]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints } as never);
    await touch('touchStart', [at(0.2, 0.2, 0)]);
    await touch('touchMove', [at(0.3, 0.3, 0)]);
    await touch('touchStart', [at(0.3, 0.3, 0), at(0.6, 0.6, 1)]);
    await touch('touchMove', [at(0.4, 0.4, 0), at(0.8, 0.8, 1)]);
    await touch('touchEnd', [at(0.8, 0.8, 1)]);
    await touch('touchEnd', []);
    await expect(page.getByRole('button', { name: /^Box \d$/ })).toHaveText(['Box 1']);
    // the box follows the first finger only: it ends at (0.4, 0.4), not where the second finger went
    await expect.poll(async () => (await linkNotes(page)).map((n) => [n.w, n.h].map((v) => Math.round(v * 10) / 10))).toEqual([[0.2, 0.2]]);

    // two fingers down at once with the Step tool place one badge
    await page.getByRole('radio', { name: 'Step', exact: true }).check();
    await touch('touchStart', [at(0.6, 0.2, 0)]);
    await touch('touchStart', [at(0.6, 0.2, 0), at(0.8, 0.2, 1)]);
    await touch('touchEnd', [at(0.8, 0.2, 1)]);
    await touch('touchEnd', []);
    await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveText(['Step 1']);
  });
});

test('a photo stored sideways (EXIF orientation) is shown upright', async ({ page }) => {
  // a 300 x 100 JPEG whose EXIF says "rotate 90° clockwise to view", as phone cameras write
  const jpeg = await page.evaluate(async () => {
    const c = new OffscreenCanvas(300, 100);
    c.getContext('2d')!.fillRect(0, 0, 300, 100);
    const bytes = new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg' })).arrayBuffer());
    // APP1 segment: "Exif", big-endian TIFF header, one IFD entry: Orientation (0x0112) = 6
    const exif = [0xff, 0xe1, 0, 34, ...'Exif'.split('').map((ch) => ch.charCodeAt(0)), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0];
    return btoa(String.fromCharCode(...bytes.subarray(0, 2), ...exif, ...bytes.subarray(2)));
  });
  await page.getByRole('radio', { name: 'Screenshot', exact: true }).check();
  await page.setInputFiles('#file', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.getByLabel('Padding').fill('0');
  await expect(page.locator('#readout')).toHaveText(/^100 × 300 /);
});

test('main journey: frame a screenshot, cover a secret, caption it, download it, share the look', async ({ page, context, browserName }) => {
  await loadShot(page);
  await page.getByRole('radio', { name: 'None', exact: true }).first().check();
  await page.getByLabel('Padding').fill('0');
  await drawn(page);
  const box = (await page.locator('#preview').boundingBox())!;
  const at = (u: number, v: number) => [box.x + box.width * u, box.y + box.height * v] as const;
  await page.getByRole('radio', { name: 'Cover' }).check();
  await page.getByRole('radio', { name: 'Colour #111111' }).check();
  await page.mouse.move(...at(0.72, 0.76));
  await page.mouse.down();
  await page.mouse.move(...at(0.97, 0.87), { steps: 4 });
  await page.mouse.up();
  await page.getByRole('radio', { name: 'Arrow', exact: true }).check();
  await page.mouse.move(...at(0.4, 0.4));
  await page.mouse.down();
  await page.mouse.move(...at(0.6, 0.6), { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /^(Cover|Arrow) 1$/ })).toHaveText(['Cover 1', 'Arrow 1']);
  const content = await readout(page); // no caption yet: the content alone
  await page.getByRole('textbox', { name: 'Text' }).fill('Deploys at a glance');
  await page.getByRole('radio', { name: '2x' }).check();
  await drawn(page);
  const scene = await readout(page);
  expect(scene.w).toBe(content.w);
  expect(scene.h).toBeGreaterThan(content.h); // the caption band

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PNG' }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toBe('framecraft-screenshot-auto@2x.png');
  const png = await readFile((await file.path())!);
  expect(pngSize(png)).toEqual({ w: scene.w * 2, h: scene.h * 2 });
  // the downloaded file, not just the preview, has the secret under one solid colour
  const secret = await page.evaluate(
    async ([b64, h]) => {
      const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]));
      const ctx = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0.76 * bmp.width, 0.79 * h * 2, 0.17 * bmp.width, 0.04 * h * 2).data;
      const distinct = new Set<string>();
      for (let i = 0; i < d.length; i += 4) distinct.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      return [...distinct];
    },
    [png.toString('base64'), content.h] as const,
  );
  expect(secret).toEqual(['17,17,17']);

  // the share link carries the look and the annotations, never the image
  if (browserName !== 'chromium') return; // only Chromium lets a test grant clipboard-read
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.locator('#toast')).toHaveText(/keeps the design, not the screenshot/);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const fresh = await context.newPage();
  await fresh.goto(link);
  await expect(fresh.getByRole('heading', { name: 'Add a screenshot' })).toBeVisible();
  await expect(fresh.getByRole('textbox', { name: 'Text' })).toHaveValue('Deploys at a glance');
  await expect(fresh.getByRole('radio', { name: 'None', exact: true }).first()).toBeChecked();
  // the first image added to the opened link gets the link's annotations; replacing that image clears them
  await fresh.setInputFiles('#file', SAMPLE);
  await expect(fresh.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible(); // the image has loaded
  await expect(fresh.getByRole('button', { name: /^(Cover|Arrow) 1$/ })).toHaveText(['Cover 1', 'Arrow 1']);
  await fresh.setInputFiles('#file', SAMPLE);
  await expect(fresh.getByRole('button', { name: /^(Cover|Arrow) 1$/ })).toHaveCount(0);
});

test('the preview redraws when a font for new characters arrives', async ({ page }) => {
  // Cyrillic glyphs come in their own font file, fetched on first use; make it arrive late
  await page.route('**/*cyrillic*', async (route) => {
    const response = await route.fetch();
    await new Promise((done) => setTimeout(done, 300));
    await route.fulfill({ response });
  });
  await paste(page, 'Snippet', '// Привет, мир\nconst answer = 42;');
  // wait for that font file itself: in WebKit document.fonts.ready can resolve before the load starts
  await expect
    .poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('JetBrains') && f.unicodeRange.includes('U+400') && f.status === 'loaded')))
    .toBe(true);
  const stale = await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    await frame();
    const c = document.querySelector<HTMLCanvasElement>('#preview')!;
    const shown = c.toDataURL();
    document.querySelector('textarea')!.dispatchEvent(new Event('input', { bubbles: true })); // force a redraw
    await frame();
    return shown !== c.toDataURL();
  });
  expect(stale).toBe(false);
});

test('an image dropped outside the stage loads instead of navigating away', async ({ page }) => {
  const b64 = (await readFile(SAMPLE)).toString('base64');
  const prevented = await page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'shot.png', { type: 'image/png' }));
    const target = document.querySelector('#inspector')!;
    // a drop the page does not cancel makes the browser open the file in place of the app
    return ['dragenter', 'dragover', 'drop'].map((type) => {
      const e = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    });
  }, b64);
  expect(prevented.slice(1)).toEqual([true, true]);
  await expect(page.getByRole('toolbar', { name: 'Annotation tools' })).toBeVisible();
  // text dragged into a field still lands there
  const text = await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'hello');
    const e = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    document.querySelector('#inspector')!.dispatchEvent(e);
    return e.defaultPrevented;
  });
  expect(text).toBe(false);
});

test('step badges stop at 99 with a message instead of repeating 99', async ({ page }) => {
  await loadShot(page);
  await page.getByRole('radio', { name: 'Step', exact: true }).check();
  await page.locator('#preview').focus();
  for (let i = 0; i < 99; i++) await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveCount(99);
  await expect(page.getByRole('button', { name: /^Step \d+$/ }).last()).toHaveText('Step 99');
  // the 100th is refused, from the keyboard and from the mouse
  await page.locator('#preview').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toast')).toHaveText('Steps go up to 99.');
  const box = (await page.locator('#preview').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await expect(page.getByRole('button', { name: /^Step \d+$/ })).toHaveCount(99);
});

test('axe finds no WCAG 2.2 AA problems, light on a desktop and dark on a phone, in both modes', async ({ page }) => {
  // page.evaluate runs outside the page's Content-Security-Policy, so axe needs no script tag
  const axeSource = await readFile('node_modules/axe-core/axe.min.js', 'utf8');
  const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
  for (const [colorScheme, viewport] of [['light', { width: 1440, height: 900 }], ['dark', { width: 390, height: 844 }]] as const) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await page.evaluate(axeSource);
    for (const mode of ['code', 'shot']) {
      if (mode === 'shot') {
        await loadShot(page);
        await page.getByRole('radio', { name: 'Text', exact: true }).check();
        await page.locator('#preview').focus();
        await page.keyboard.press('Enter'); // a label: the words box, a selected item in the list and the resize handle show
      }
      await drawn(page);
      const found = await page.evaluate(async (runOnly) => {
        const { violations } = await (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe.run(document, { runOnly });
        return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      }, tags);
      expect(found, `${colorScheme} ${viewport.width}px ${mode}`).toEqual([]);
    }
  }
});
