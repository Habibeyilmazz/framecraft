# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-11-22

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
- Known limits are in the README Roadmap. Annotations cannot be edited after drawing; there is no keyboard way to place them.
