import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: process.env.CI ? 'line' : 'list',
  use: { baseURL: 'http://localhost:4211/', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4211/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
