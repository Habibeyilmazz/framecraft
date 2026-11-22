# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Mouse resizing: with the Pointer tool, the selected annotation shows a round handle (an arrow's tip, a box's
  bottom-right corner); dragging it does what Alt+arrow keys do. The handle is a DOM element over the canvas, so it
  never appears in exports, and it follows tilt. Fingers get a larger grab radius.
- A phone screenshot in the README (`docs/screenshots/phone.png`, made by `scripts/readme-images.mjs`).
- The Pointer tool drags any annotation, not just the newest. The names in the Annotations list are buttons that
  select which annotation the arrow keys and Delete act on; the selected one has an outline in the list.
- CI runs the end-to-end tests in Firefox and WebKit as well as Chromium (`ALL_BROWSERS=1`).

### Fixed

- Design pass (round 2): on phones the header buttons were scattered over three ragged rows; now the copy buttons
  share one row and scale + Download PNG the next. The phone preview fills the width and the stage ends just below
  it (it was a fixed 62vh with a small card floating in empty mat).
- Inspector segmented controls are 36px tall like inputs and buttons, so the caption Colour and Position labels
  line up.
- Light theme: focus rings on the green mat (preview canvas, empty-state button) were 2.5:1; they now use amber
  (6.6:1).
- The empty state reads "Add a screenshot" and hides the drop/paste hints on touch-only devices.
- The wordmark is the page's `<h1>` (the only finding of an axe-core WCAG 2.2 AA run, light and dark, desktop and
  phone, both modes).
- On phone-width screens the annotation toolbar squashed its colour swatches to slivers that overlapped the tools;
  it now wraps onto extra rows.
- Delete on the preview removes the selected annotation instead of always the newest.
- End-to-end tests read the preview only after it has redrawn (they were flaky in WebKit), and no longer assume a
  1x screen.

### Notes for the next person

- Round 2 ("design" review): looked at real screenshots at 1440 and 390 px, light and dark, plus 768/961/980 px;
  tabbed through the whole page (every stop has a visible ring); axe-core is clean. Not done: touch drag tested
  only through Playwright mouse events, not a real finger; no real Safari/Firefox by hand; no SVG export for
  screenshots; Pages workflow still unrun.
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
