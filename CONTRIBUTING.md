# Contributing to framecraft

Thanks for helping. framecraft is a small static web app (Vite, TypeScript, the Canvas 2D API and highlight.js), so
a change is usually a few files.

## Setup

Needs Node.js 22 or newer.

```sh
npm install
npm run dev        # http://localhost:4210
```

## Before you open a pull request

```sh
npm run typecheck
npm test           # unit tests (Vitest), well under a second
npm run e2e        # end-to-end tests in Chromium (Playwright, builds and serves on port 4211)
```

The first e2e run needs a Chromium for Playwright: `npx playwright install chromium`. CI also runs the e2e tests in
Firefox and WebKit; to do that locally, install them too and run `ALL_BROWSERS=1 npm run e2e`.

## House rules

- **New logic gets a test.** Pure functions (layout, design sanitizing, highlighting) go in `tests/` as unit tests;
  anything about the editor goes in `e2e/app.spec.ts`. A bug fix comes with a test that failed before the fix.
- **Synthetic data only.** Test fixtures and README images use the made-up dashboard in `e2e/fixtures/`. Never commit
  a real screenshot, name, email address, key or token.
- **Nothing leaves the browser.** No analytics, no third-party requests, no uploads. Fonts are bundled.
- **The Content-Security-Policy stays strict.** No inline scripts, inline `<style>` blocks or `style="..."` attributes
  in the built page; every e2e test fails on a policy violation.
- **Validate what comes from outside.** Share links and saved templates go through `sanitize` in `src/design.ts`. A new
  design field needs a default, a clamp or allow-list there, and a unit test.
- **Few dependencies.** Prefer the platform (Canvas, `CompressionStream`, `createImageBitmap`) over a package.
- **Accessible by keyboard.** Every new control needs a label and a visible focus ring, and annotations must stay
  usable without a mouse.

## README images and demo GIF

They are made by driving the real app, so they never drift from it:

```sh
npm run dev                         # in one terminal
node scripts/readme-images.mjs      # hero, screenshots, code card PNG and SVG
node scripts/demo-gif.mjs           # docs/demo.gif (needs ffmpeg on PATH)
```

## Changelog

Add a line under `[Unreleased]` in `CHANGELOG.md` saying what changed for someone using the app.
