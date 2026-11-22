import { defineConfig } from 'vitest/config';

export default defineConfig({
  // relative asset paths so the build works from any sub-path, e.g. GitHub Pages
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});
