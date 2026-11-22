// Regenerates e2e/fixtures/sample-screenshot.png from the made-up app page next to it.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 640 }, deviceScaleFactor: 2 });
await page.goto('file://' + here('./fixtures/fake-app.html'));
await page.screenshot({ path: here('./fixtures/sample-screenshot.png') });
await browser.close();
