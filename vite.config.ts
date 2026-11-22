import { defineConfig } from 'vitest/config';

// The built app only ever loads its own files, so the policy can be strict. It is a <meta> tag because static hosts
// such as GitHub Pages cannot set headers. Build only: the dev server injects inline styles for hot reload.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:", // Vite inlines the smallest font subsets
  "connect-src 'self'", // the SVG export fetches the bundled fonts to embed them
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  // relative asset paths so the build works from any sub-path, e.g. GitHub Pages
  base: './',
  plugins: [
    {
      name: 'csp',
      apply: 'build',
      transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
    },
  ],
  test: { include: ['tests/**/*.test.ts'] },
});
