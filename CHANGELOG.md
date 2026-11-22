# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Round 15 ("feature-2"): **added and removed lines in code mode**, to show a change in a launch post or changelog
  image (it was on the roadmap; code cards could only highlight lines). Two new fields, "Added lines" and "Removed
  lines", take the same `2, 4-6` form as "Highlight lines". Marked lines get a tint of the theme's diff colour, an edge
  and a `+` or `−` sign in the gutter, in the PNG and the SVG; syntax colours stay. Removed wins over added, added
  over highlighted. One place decides this (`lineMarks` and `markStyle` in `src/code.ts`), used by `src/render.ts`
  and `src/svg.ts`. The new `code.added` and `code.removed` design fields travel in the share link; templates leave
  them out, like the snippet and its highlighted lines. Unit tests (marks, colours, SVG output, templates) and one e2e
  test (preview changes, SVG has the signs, a fresh page from the link has the fields). README image
  `docs/diff-card.png` made with framecraft by `scripts/readme-images.mjs`; the app screenshots were regenerated too,
  since the sidebar has the new fields.

### Fixed

- Round 15: **an SVG with HTML inside (`foreignObject`)**, round 14's untested gap. Chromium and WebKit (seen in CI)
  taint a canvas such an SVG is drawn on, so it could never be exported. Chromium already refused it, but only with
  "could not be read as an image"; what WebKit did before is not known. `decodeSvg` now reads one pixel back after
  drawing and, if the canvas is tainted, refuses the file with "This browser cannot export an SVG with HTML inside
  it. Use a PNG of it instead." Firefox does not taint it, so there it loads and exports. The e2e test pins each
  engine's outcome and checks a loaded one exports. Real Safari was not tried by hand.
- Round 14 ("launch"): checked the two reported gaps that were bugs first, each with an e2e test seen to fail
  before the fix:
  - **SVG files were refused as a screenshot** (or a background image): `createImageBitmap` does not decode them.
    They now decode through an `<img>` (`decodeSvg` in `src/main.ts`), where an SVG runs no scripts and loads
    nothing, and are drawn 2000 px on the long side in their own shape, so they stay sharp on a 2x export. An SVG with
    only a `viewBox` keeps its shape too, to within a few px: browsers give it a small rounded default size first
    (2000 x 1124 in Chromium, 1127 in Firefox, 1128 in WebKit, for a 16:9 viewBox, seen in CI). The test feeds an SVG with a `<script>` and an external `<image>`, checks neither ran nor loaded,
    and checks the PNG still exports (the canvas is not tainted). Firefox and WebKit run it only in CI.
  - **Arrow keys moved a selected annotation out of the crop**, where it was hidden. Its corner (or, with Alt, its
    resize handle) now stops at the crop's edge, like a Pointer drag. One that is already outside, for example
    drawn before cropping, can still be moved back in.
- Round 14, launch review of the repo, no change needed: README already had a real hero image made with framecraft,
  a recorded demo GIF, a quickstart, a feature list, how it works, a comparison with alternatives, a roadmap and
  contributing notes; CONTRIBUTING.md, SECURITY.md, issue templates, repo description and topics were in place.
  Only the format list, the crop note and the roadmap (crop aspect-ratio lock) changed.
- Round 13 ("tests"): a reliability pass. Tried to break the built app with Playwright scripts (odd and empty input,
  huge input, unicode, broken files, blocked storage, crafted links, quick repeated actions). Each bug below got a
  failing test first (checked to fail without the fix), then the fix:
  - **The Pointer dragged annotations past the crop's edge** (round 12's reported gap), where they were hidden. The
    grabbed point, or the resize handle, now stops at the crop's edge, so part of the annotation always shows. e2e test.
    The keyboard can still move a selected annotation out of the crop on purpose (and back).
  - **A text label placed near the crop's edge was cut off by it**, and so was one whose words grew past it. A new or
    edited label is now shifted to stay inside the crop (a label bigger than the crop sticks out at its left or top,
    never off the image). e2e test.
  - **2 s freeze on a crafted snippet.** Trimming trailing whitespace with `/\s+$/` is quadratic in a run of spaces:
    a 20 000-character snippet (the cap, and a share link can carry one) with a long run of spaces and newlines in the
    middle took about 2 s to highlight. Now `trimEnd()`. Unit test with a 100 ms bound.
  - **"Saved" when nothing was saved.** With storage full or blocked, saving a template showed the error toast and
    at once replaced it with "Saved NAME.", and cleared the name. Deleting said "Deleted" and kept the template.
    Now only the error shows and the name stays. e2e test.
  - **Two images added quickly: the first one won.** A big image pasted just before a small one finished decoding
    last and replaced it. Only the most recent image is used now. e2e test.
  - **Pasting text copied from a spreadsheet or office app swapped in a picture.** Those apps put a picture of the
    selection on the clipboard next to the text; pasting into the snippet, caption or any text field now pastes
    the text. A picture alone still becomes the screenshot, wherever it is pasted. e2e test.
- Round 13, tried and fine, no change: an empty or whitespace-only snippet, emoji/CJK/RTL/combining characters and
  control characters (PNG and SVG export, the SVG stays clean), a 20 000-character line and 2000 lines (PNG export
  is refused with a message saying why), empty, truncated and 1 x 1 PNGs, 4000 x 2 and 2 x 4000 images, broken, empty and
  300 000-character share links, junk in stored templates, odd custom sizes (0, -5, 1e3, 99999, 640.5, empty). No
  request goes to another host. Offline after the page loaded (Playwright `setOffline`): a screenshot, a label and a
  PNG export all work; letters outside basic Latin (such as ğ or Greek) then draw in a fallback font, because those
  font files load on first use and could not. The app has no dates, so no time zone cases.
- Round 13, not done: SVG files cannot be used as a screenshot (Chromium's `createImageBitmap` refuses them; the
  toast says the file could not be read). No aspect-ratio lock for the crop (a feature, out of this round's lens).
  Codex was out of quota, so the review was by hand. Firefox and WebKit ran only in CI: the first CI run showed that
  a drag leaving the window never finished in Firefox there, so the new crop test keeps its drags inside the window.

### Added

- Round 12 ("feature"): **crop a screenshot**. Used the app as a newcomer would, with a full-size 2200 x 1280
  dashboard screenshot: there was no way to show only part of it, so every screenshot had to be cropped in another
  tool first. That was the biggest gap for the screenshot half of the app (more than the roadmap items).
  - A Crop tool in the toolbar. While it is picked, the preview shows the whole image with the image outside the crop
    dimmed and the crop outlined (preview only, never exported; it follows tilt and the phone frame). Drag over the
    part to keep; a click alone explains that with a toast. Keyboard: arrow keys move the crop, Alt+arrow keys resize
    it, Shift for bigger steps, Delete shows the whole image. The sidebar shows "Cropped to W x H of W x H px." and a
    "Show whole image" button while cropped.
  - The crop is a new `crop` design field (`{x, y, w, h}`, 0..1 of the image). `sanitizeCrop` keeps it inside the
    image and at least `MIN_CROP` (2%) a side; a bad one becomes the whole image. It travels in the share link like the
    annotations (landing on the first image added) and is cleared, with them, when the image is replaced. Templates
    do not store it and applying one keeps the current crop.
  - Annotations stay in whole-image coordinates; only the view changes (`wholeImageBox` in `src/layout.ts`;
    `Rendered.toContent`/`toScene` and the new `Rendered.whole` map to the whole image). So a crop never moves or
    drops an annotation, and a redaction outside the crop still covers its pixels when the crop is widened later.
    Line widths, step badges and new labels are sized by the part that shows, as before cropping. New annotations
    are drawn and placed (mouse and keyboard) inside the crop.
  - Undo covers crop changes as well as annotations (the button is now "Undo annotation or crop change").
  - Tests: unit tests for `sanitizeCrop` (via `sanitize`), templates leaving the crop alone, `wholeImageBox`, and
    `hitNote`'s new step-radius argument. One e2e test: a click is refused, a drag crops, the readout and the 1x PNG
    are the crop's size, an arrow drawn on the cropped view lands on the right spot of the whole image, the PNG's
    pixels match the same part of the source (mean difference 0.2 of 255; 6 with the crop not applied, checked), the
    keyboard resizes and Delete resets, undo steps back, the crop survives a link, and replacing the image clears it.
- Round 12, known limits: with the Pointer an annotation can still be dragged past the crop's edge, where it is
  hidden (it stays in the Annotations list and the keyboard can move it back). There is no aspect-ratio lock for the
  crop. A label placed right at the crop's edge can be partly cut off. With the Crop tool on the phone frame, the
  preview's dimming also darkens the bezel's rounded corners a little (preview only). Codex was out of quota again
  (second opinion by hand: annotations hidden outside the crop are no longer grabbed by the Pointer and show no
  resize handle). Firefox and WebKit ran only in CI.
- Round 12: `docs/screenshots/screenshot-mode.png` and `phone.png` regenerated with `scripts/readme-images.mjs` so
  the toolbar shows Crop; no README image shows a cropped screenshot.

### Security

- Round 11 ("security"). Probed the trust boundaries by running crafted inputs against the built app (Playwright
  Chromium) instead of reading only. Fixed the two that hurt, each with a test checked to fail without the fix:
  - **A share link could freeze the tab for about 27 s.** 184 characters holding 200 whole-image blurs; adding a
    4096 x 3072 screenshot then took 27 s on the main thread. Two changes:
    - Blur runs on the small downscaled copy (1 px there is one cell at full size) instead of the full-size region.
      The blur is drawn only from that small copy, as before, so it hides no less. It looks the same side by side.
      Each blur costs about a quarter of what it did (200 blurs: 27 s to 6.8 s).
    - At most 30 blur, pixelate and cover areas (`MAX_REDACTIONS` in `src/design.ts`): `sanitize` keeps the first
      30 from a link. The editor refuses the 31st with a message, and also refuses past 200 annotations; before,
      it silently allowed more than 200, which a reload then dropped. `noteLimit()` is the one check for both,
      so what the editor allows always survives a reload. A dropped redaction would show what it covered.
      Unit tests, plus two e2e tests: the crafted link renders 30 blurs within 10 s (about 1 s here), and a
      keyboard blur cuts neighbour-to-neighbour roughness on random pixels by more than 10x (7x in CI's WebKit; the
      test asks for 5x).
    - Still slow in one place: CI's WebKit (Linux, software canvas) took 19 s for those 30 whole-image blurs on
      12 MP, so the 10 s check runs in Chromium only. Real Safari on a Mac is not measured. If it is slow too, the
      next step is a lower `MAX_REDACTIONS` or a cap on total redacted area.
  - **One very long line hung highlighting for about 2.4 s.** highlight.js slows with the square of a line's length
    (one 20 000-character line in Java or INI: 1.6 to 2.4 s; the same text in 80-character lines: under 35 ms).
    Text with a line over 1000 characters (`MAX_HIGHLIGHT_LINE`) now stays plain. Unit test.
- Round 11, checked and fine, no change: `npm audit` 0 vulnerabilities (all and production-only); git history has
  one author (the noreply address), no keys, tokens or local paths; every tracked PNG has only IHDR/IDAT/IEND
  chunks; both workflows have `contents: read`, `persist-credentials: false`, and actions pinned to SHAs that
  match their tags (re-checked with `gh api`). The Pages workflow is `workflow_dispatch` only; its deploy job
  alone gets `pages: write`/`id-token: write`. Other crafted links (200 text labels, arrows, boxes or steps, or
  a full tilt with a 200-character 96 px caption) draw in about 60 to 140 ms and export at 3x in about 1 to
  1.6 s. Image decode bombs: a 1.5 MB PNG of 40000 x 40000 px and a 0.7 MB one of 16000 x 16000 px are refused
  in under 0.2 s. Chromium decodes lazily, so the size check runs before any big allocation. The first gets
  "could not be read" rather than the size message.
- Round 11, not done: the `/security-review` skill refused to run because the session's working directory is not a
  git repository (same as round 3). Codex was out of quota, so there was no second opinion. Firefox and WebKit
  ran only in CI.

- Round 10 ("design"): looked at the running app at 1440 px and 390 px, light and dark, in both modes, with the empty,
  annotating, label-editing, template and error-toast states, and walked the keyboard focus order (logical, every stop
  has a visible ring). Fixed what the screenshots showed:
  - **Dark mode selected states.** The picked segment of every segmented control (mode, scale, frame, background,
    shadow, caption position) was *darker* than its track, so it read as unselected; the picked annotation tool was
    nearly the toolbar's colour. Two tokens, `--seg-on` and `--tool-on`, are now lighter in dark mode. Light mode is
    unchanged.
  - The white annotation swatch was almost invisible in light mode and the black one in dark mode; both get a grey ring.
  - Dark-mode checkboxes use the amber accent, like the sliders, instead of the dark green.
  - **Copy image and Download PNG looked ready with no screenshot loaded.** They now show as unavailable
    (`aria-disabled`, with a "Add a screenshot first" tooltip) and still explain themselves on click, like SVG does
    while tilted. e2e test, checked to fail without the change.
  - `docs/screenshots/phone.png` and `screenshot-mode.png` regenerated with `scripts/readme-images.mjs`; the other
    README images came out byte-identical.
- Round 10, not changed: Codex, Safari, Firefox and screen-reader passes as in round 9 (none run locally).

- Round 9 ("first-run": a fresh clone of GitHub `main`, README quickstart followed literally, then a read of the code).
  The quickstart itself worked (`npm install`, `npm run dev`, typecheck, 62 unit and 37 e2e tests green). Fixed:
  - **A share link's annotations never showed.** Opening a link (or reloading the page) listed its annotations, but
    adding the screenshot cleared them. Now only *replacing* an image clears them; the first image added gets the
    link's annotations. The main-journey e2e test adds the image on the opened link; checked to fail before the fix.
    (The old test passed by accident: the list showed the annotations before the image had loaded.)
  - **The opening card said "Detected: JavaScript" under the file name `export.ts`.** highlight.js scored the sample
    22 for JavaScript and 21 for TypeScript. The sample now has a `type` alias and detects as TypeScript (unit test,
    and the e2e test now expects the exact text). Highlighted lines moved from 3-5 to 5-7 to stay on the same code.
    README hero, code-mode screenshot and demo GIF regenerated from the running app with the new sample.

### Changed

- Round 9: README and CONTRIBUTING said "Node.js 22 or newer", but Vite needs 22.12+ and Vitest does not support
  23 or 25. They now say so, and `package.json` declares `engines` so npm warns on an unsupported Node.
- Round 9: the README says the first `npm run e2e` needs `npx playwright install chromium` (checked: without it the
  run stops with "Executable doesn't exist"); the share-link paragraph says what happens to annotations.
- Round 9, not changed: Codex was out of quota again, so the review is by hand. Only Chromium is installed locally;
  Firefox and WebKit ran in CI. No manual Safari, Firefox or screen-reader pass yet.

- Round 8 ("perf-a11y"). Measured first (built page on `vite preview`, Playwright Chromium, M-series Mac; "4x" means
  DevTools CPU throttling at 4x), then fixed the two slow paths found:
  - **Long snippets in Auto-detect.** highlight.js detection highlights the text once per language (24), so each
    keystroke in a 2000-line (~120 000 character) paste cost about 1.35 s of main thread at 4x. The language is now
    guessed from the first 4000 characters (`DETECT_SAMPLE` in `src/code.ts`) and the whole text highlighted once with
    it: 1354 ms to 421 ms for the first paste, 1244 ms to 364 ms per edit after it. Short snippets are detected
    exactly as before. Two unit tests: a long snippet is still coloured past the sample, and one with no detectable
    language stays plain text with every character kept.
  - **Dragging a blur or pixelate on a big image.** The redacted copy got a new full-size canvas every frame; it now
    reuses the one it has for the same image. 4000 x 3000 image, unthrottled: 21.5 ms to 16 ms per redraw (a box
    annotation drags at 2.4 ms; the rest is the blur itself).
  - Sliders are 24 px tall instead of the native 16 px (WCAG 2.5.8 target size), in the same layout box.
- Unchanged and fine, recorded as the baseline: JS 169 kB (60.5 kB gzip), CSS 23 kB (11.2 kB gzip), 5 requests and
  125 kB transferred on first load; at 4x, first contentful paint about 96 ms, largest contentful paint about 380 ms,
  total blocking time about 200 ms (mostly highlight.js compiling its 24 grammars for the first detection).

### Added

- Round 8: **axe-core in CI.** An e2e test runs axe-core 4.14.0 (WCAG 2.0 to 2.2 A/AA plus best practices) at 1440 px
  light and 390 px dark, in code mode and in screenshot mode with a label being edited, in all three engines in CI.
  0 violations today; checked to fail (`page-has-heading-one`) with the page's `<h1>` turned into a `<div>`.
  `axe-core` is a pinned dev dependency.

### Removed

- Round 8: `assets/logo.png` (234 kB, used nowhere; the app and favicon use the hand-written SVG mark).

- Round 7 ("feature-2"): **recolour a placed annotation**. With the Pointer tool active, the colour swatches show the
  selected annotation's colour, and picking one (by mouse, or arrow keys inside the swatch group) recolours it, with
  a toast such as "Step 2 recoloured." and one undo step per change. With a drawing tool the swatches still set the
  colour of the next annotation, so picking a colour before drawing never repaints the last one. e2e test (checked to
  fail without the change).
- Round 7: **custom output size**. "Custom size" in the Size list shows Width and Height (px) fields, 64 to 4096 px a
  side (3x of the largest stays under the 16384 px export limit). A number reaches the design only when it is whole
  and in range, so typing "1000" never renders a 1 px card on the way; leaving the field puts back the size in use.
  The size goes into share links, templates and the file name (`framecraft-code-1000x420@2x.png`). New `width` and
  `height` design fields, clamped by `sanitize` (unit-tested), and used by `layoutScene` only for `size: 'custom'`
  (unit-tested); one e2e test covers typing, rejecting, the downloaded PNG's size and the share link.

- Round 6 ("launch"): a 16-second demo GIF near the top of the README (`docs/demo.gif`, 960 px, about 4 MB),
  recorded from the real app by `scripts/demo-gif.mjs` (Playwright video with a drawn pointer, encoded by ffmpeg).
- README sections "When to use something else" (Carbon, ray.so, freeze, silicon, Shots, CleanShot X, Xnapper, and
  what framecraft does that they do not) and "Contributing".
- `CONTRIBUTING.md` (setup, checks, house rules, how the README images are made), `SECURITY.md` (scope and how to
  report), and bug / feature issue forms. Repository topics `annotation`, `redaction` and `mockup`.
- An e2e test for the step-badge limit: 99 badges by keyboard, then the 100th refused from the keyboard and the
  mouse with "Steps go up to 99." Checked to fail with the guard removed.

### Fixed

- Round 5 ("tests", a reliability pass). Each bug below was reproduced first, then got a failing test, then the fix:
  - **Undo** removed the newest annotation whatever the last action was, so Ctrl+Z after deleting one deleted
    another. It now steps back through a history of the annotations (add, move, resize, edit, remove, remove all),
    which is cleared when a new image is placed. The Undo button is now labelled "Undo annotation change".
  - Deleting a step badge and adding another repeated a number (1, 3, 3). New steps count from the highest
    (`nextStep` in `src/design.ts`, unit-tested).
  - A right-click or middle-click on the preview placed an annotation.
  - A label squeezed by words wider than the image kept the small font after the words got shorter (the gap the
    last round left open). The pill's height remembers the size.
  - On a touch screen, a second finger started a second drawing and left a stray annotation. Other pointers are
    ignored until the first lifts (e2e test sends real multi-touch through the Chrome DevTools Protocol).
  - Removing an annotation from the list dropped keyboard focus to the page. Focus moves to the next Remove button,
    or to the preview when the list is empty.
  - Long captions, addresses and window titles were shortened one UTF-16 unit at a time, so an emoji could be cut in
    half and draw as a replacement box. `fitText` (now in `src/layout.ts`, unit-tested) cuts between graphemes.
  - Code in Cyrillic, Greek or Vietnamese needs a font file the browser fetches on first use. The preview drew
    fallback glyphs and kept them until the next edit (so an export right then had the wrong font). `draw()` now
    asks `document.fonts.load` for pending faces and redraws when they land. WebKit needed this exact shape: it
    fires no `loadingdone` for such a face and its `fonts.check()` calls a face that is still loading ready (both
    found from CI timelines, since WebKit is not installed locally).
  - An image dropped outside the stage (on the settings panel or header) made the browser navigate to the file,
    losing the screenshot and its annotations. File drops are taken anywhere on the page; text still drops into fields.
- After a Codex second-opinion review of this round: undo kept the selection on a discarded copy, so the next Delete
  hit the newest annotation (the selection now follows the restored copy); Ctrl+Z in the middle of a drag removed the
  annotation from under the pointer (undo now waits for the drag to end); a second finger with the Step tool still
  placed a badge (non-primary pointers are ignored); past step 99 every new badge was another 99 (a share link keeps
  at most 99, so a 100th is refused with a message). The first three have e2e tests, `nextStep` a unit test.
- README: "works offline" overclaimed. With no service worker the page does not load offline; after loading it keeps
  working, except that a not-yet-fetched non-Latin code font falls back to a system font.

### Added

- Round 5: an end-to-end test of the main journey (load, frame, cover a secret, arrow, caption, download at 2x, open
  the share link) that checks the downloaded PNG itself: its size, and the secret as one solid colour in the file.
  Also a regression test for a sideways phone photo (EXIF orientation 6 is shown upright in all three engines).
- The huge-snippet test pastes with one input event; Playwright's `fill` sent 12 000 (one per character, each
  re-highlighting), which was most of the suite's time. Local e2e run: about 12 s before, 6 s now.

- Round 4 ("feature"): **text labels**, the first item on the roadmap and the one thing a launch or README image
  kept needing (step badges and arrows had no words to point at). The Text tool places a one-line label on a pill
  in the annotation colour: click for the default size, drag to set it. The label's words show in a box beside the
  toolbar, selected, so typing replaces "Label"; Enter or Escape returns to the preview. Editing keeps the font size
  and resizes the pill; dragging the handle resizes the pill and the text fits it. Labels move, resize, delete and
  undo like every other annotation, by mouse or keyboard, and are listed by their words. The share link sanitizer
  caps the words at 80 characters and turns control characters into spaces. Pure sizing math is `labelFont` /
  `labelSize` in `src/layout.ts` (unit-tested); one e2e test covers click, type, widen, keyboard move, keyboard
  placement and delete. The README screenshot now shows a label (made by `scripts/readme-images.mjs`).
- After a Codex second-opinion review of the label work: clicking a second label while the words box still had
  focus left the box showing the first label's words (fixed, with an e2e test); Enter that confirms an IME
  composition no longer jumps back to the preview. (Left then, fixed in round 5: words wider than the image shrank
  the font for good.)

### Security

- Round 3 ("security" review). New **Cover** redaction: a solid, opaque fill baked into the redacted copy of the
  image. Blur and pixelate keep coarse letter shapes, and pixelated text in a known font can sometimes be
  reconstructed (e.g. Depix), so the README now recommends Cover for passwords, keys and tokens. The README image
  covers the fake deploy key instead of pixelating it.
- The production build carries a Content-Security-Policy `<meta>` tag (`vite.config.ts`, build only, because the
  dev server injects inline styles): `script-src 'self'`, `style-src 'self'`, no `unsafe-inline`, `object-src`,
  `base-uri` and `form-action` set to `'none'`. Every e2e test fails if the page reports a policy violation, and
  one test checks that an injected inline event handler is blocked.
- README says that the address bar (and so browser history) holds the code snippet as you edit.
- A crafted share link of about 150 characters (32 px font, one 5500-character line, 3000 lines) made the preview
  allocate over a gigabyte of canvas and could freeze the tab: the preview scale had a 0.05 floor and only exports
  were size-checked. The preview canvas is now capped at 4096 px a side (`PREVIEW_MAX` in `src/main.ts`), with an
  e2e test. Found by a Codex second-opinion review.

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

- Round 8 ("perf-a11y"): reported gaps re-checked. "axe is not in CI" was real and is fixed (see Added). Owner-only
  settings are still owner-only. Safari and Firefox by hand: still not done; CI runs every e2e test, axe included, in
  WebKit and Firefox. Also checked and fine, no change: no horizontal scroll at 390 px or at 640 x 450 (a 1280 px
  window at 200% zoom); every focus stop in the first 60 Tab presses has a visible ring; annotation colour swatches
  are 22 px but 6 px apart, which meets WCAG 2.5.8 by spacing. Not changed on purpose: startup TBT (~200 ms at 4x) is
  highlight.js compiling grammars for the first auto-detection; lazy-loading it would delay the first card.
- Round 7 ("feature-2"): picked the two roadmap items a newcomer hits first: a misplaced colour could only be fixed by
  deleting and redrawing, and sizes such as a DEV cover (1000 x 420) or a YouTube thumbnail had no preset. Not built:
  keyboard shortcuts for tools (Tab to the toolbar works), a swap-width-and-height button, remembering the custom size
  when the Size list switches away and back (it is kept in the design, so it does come back). Reported gaps
  re-checked: Codex was out of quota again (usage limit until 09:32), so the review was done by hand. axe-core 4.10.3
  (WCAG 2.2 AA plus best practices) was run against the dev page at 1440 px light and 390 px dark, code and screenshot
  mode, with the custom size fields showing and a step selected: 0 violations (contrast "incomplete" as before). axe
  is still not in CI. The owner-only settings (private vulnerability reporting, social preview upload) are unchanged.
- Round 6 ("launch"): re-checked the reported gaps. The 99-step refusal had no test (added). axe-core 4.10 (WCAG 2.2
  AA plus best practices) was run against the built page at 1440 and 390 px, light and dark, in code mode and in
  screenshot mode with a label being edited: 0 violations. axe could not decide contrast for `#readout` and the
  snippet box (it cannot see through the grid background); measured by hand, both are over 6:1. axe is not part of
  the test suite (it would be a new dev dependency); run it the same way after markup changes. Label recolouring is
  still a roadmap item, not a bug. The "Temporary: log ..." commits stay in history: removing them would need a
  force-push. Private vulnerability reporting is off (turning it on is a repository setting, left to the owner), so
  `SECURITY.md` asks for a contact request issue instead. `docs/hero.png` is 2560 x 1280, so it can be uploaded as
  the repository's social preview image (Settings, by hand; there is no API for it). `assets/logo.png` is not used
  anywhere. Codex was out of quota this round, so there was no second-opinion review.
- Round 5 ("tests"): tried to break the app with odd input. Checked and found fine, no change: empty, whitespace,
  control-character, RTL, emoji and 20 000-character snippets; junk "Highlight lines"; share links whose JSON is
  `null`, a string, an array or wrongly typed fields; malformed templates in localStorage; 1x1, 12000x1, 1x4000 and
  fully transparent images; truncated, empty and SVG files (clear error); layouts at 320 px and landscape phone.
  Previous round's gaps re-checked: the shrinking label font was a real bug (fixed); one-line labels and no
  recolouring after placing are design choices, still on the Roadmap. Typing in a 20 000-character snippet costs
  about 45 ms a keystroke (auto-detect runs every language); 6000 one-character lines take about 400 ms, because
  highlight.js auto-detect is roughly quadratic there. Not changed: a real paste is one input event, and only
  Playwright's per-character `fill` made it look like a freeze. Undo keeps one history entry per keystroke while
  typing a label's words. A few commits titled "Temporary: log ..." are diagnostics pushed to read WebKit's
  behaviour on CI; the commit after each removes them. No axe run this round (no markup changed apart from the Undo
  label).
- Round 4 ("feature"): picked text labels after using the app as a newcomer: every other gap (custom sizes, SVG for
  screenshots, more frames) has a workaround, but there was no way to put a word on a screenshot. Not built, on
  purpose: multi-line labels, a font or size picker, and recolouring a placed annotation (the colour swatches only
  affect the next one; true for all annotation kinds). Placing a screenshot still clears all annotations, so labels
  in a share link do not survive loading an image (unchanged behaviour). The previous round's gaps were re-checked:
  none is a bug (decode bombs are still left to the browser; Firefox/WebKit still only on CI).

- Round 3 ("security" review): the security-review skill could not run (it needs the session to start inside a git
  repo), so the review was done by hand, plus one Codex pass. Checked and found fine: share-link decoding (base64url check, 200 kB input and 1 MB
  inflate caps, every field clamped or enum-checked, colours must be `#rrggbb`); templates from localStorage go
  through the same sanitizer; all user text reaches the DOM through `textContent` and the SVG through an escaper
  (tested); no `eval`/`Function`/inline scripts; images are size- and pixel-capped; `npm audit` reports 0
  vulnerabilities; git history has no secrets, local paths or PNG text metadata; both workflows use
  `contents: read`, `persist-credentials: false` and actions pinned to SHAs that match their tags (checked with
  `gh api`). Not done: Firefox/WebKit runs of the new tests happen only on CI (only Chromium is installed locally);
  a crafted image that is small on disk but huge when decoded is only stopped by the browser's own decoder limits.
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
