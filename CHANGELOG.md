# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The Pointer tool drags any annotation, not just the newest. The names in the Annotations list are buttons that
  select which annotation the arrow keys and Delete act on; the selected one has an outline in the list.
- CI runs the end-to-end tests in Firefox and WebKit as well as Chromium (`ALL_BROWSERS=1`).

### Fixed

- On phone-width screens the annotation toolbar squashed its colour swatches to slivers that overlapped the tools;
  it now wraps onto extra rows.
- Delete on the preview removes the selected annotation instead of always the newest.
- End-to-end tests read the preview only after it has redrawn (they were flaky in WebKit), and no longer assume a
  1x screen.

### Notes for the next person

- Round 1 ("first-run" review): fresh clone, `npm install`, `npm run dev`, build, unit and e2e tests all worked as the
  README says. `dist/` was served from a sub-folder (as GitHub Pages would) and loaded fonts and exported SVG fine.
- Still open: Safari and Firefox are covered only by Playwright's engines in CI, not by hand; no SVG export for
  screenshot mode; the Pages workflow has never been run (enabling Pages is the owner's call).

## [0.1.0] - 2026-11-22

### Fixed (after a second-opinion review)

- Redactions now work in image pixels with a minimum cell size, so small images are really pixelated, and each
  redaction samples the already-redacted copy, so overlapping ones cannot restore covered pixels.
- Share links: inherited keys such as `constructor` are no longer accepted as a language; decompression stops at
  1 MB, so a tiny link cannot inflate into a huge payload.
- Layout keeps a positive scale when padding and caption fill a fixed size; 1 px tall or wide images still render.
- SVG export strips characters XML forbids; oversized exports show a message.
- Annotations can be added, moved, resized and removed from the keyboard.

### Added

- Screenshot mode: drop, paste or pick an image; browser, macOS, phone or no frame; light and dark windows.
- Annotations: arrow, box, numbered steps, blur and pixelate (original pixels are cleared under redactions), with a
  removable list and undo.
- Code mode: highlight.js with 24 languages and auto-detect, 7 themes, line numbers, highlighted lines, file name.
- Backgrounds (gradient, mesh, solid, image, none, grain), padding, radius, shadow, two-axis 3D tilt (WebGL), caption.
- Size presets for GitHub social preview, README banner, X, LinkedIn, Open Graph and square.
- PNG export at 1x/2x/3x, copy image to clipboard, SVG export for untilted code cards with embedded fonts.
- Share links that carry the design (never images) in the URL; templates in localStorage.
- Unit tests (Vitest) and end-to-end tests (Playwright), CI workflow, manual GitHub Pages workflow.

### Notes for the next person

- Dev server port 4210, e2e preview port 4211 (`playwright.config.ts`).
- `scripts/readme-images.mjs` regenerates `docs/` images from a running dev server.
- Known limits are in the README Roadmap. Only the most recent annotation can be moved or resized after drawing.
