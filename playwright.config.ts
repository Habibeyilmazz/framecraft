import { defineConfig, devices } from '@playwright/test';

// Locally only Chromium is needed; set ALL_BROWSERS=1 (CI does) to also run Firefox and WebKit (Safari's engine).
const browsers = process.env.ALL_BROWSERS ? (['Desktop Chrome', 'Desktop Firefox', 'Desktop Safari'] as const) : (['Desktop Chrome'] as const);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: 'http://localhost:4211/' },
  projects: browsers.map((name) => ({ name: devices[name].defaultBrowserType, use: { ...devices[name] } })),
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4211/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
