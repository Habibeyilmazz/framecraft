<p align="center"><img src="docs/hero.png" alt="The framecraft editor, framed by framecraft in a browser window, tilted on a soft pastel mesh background" width="100%"></p>

# framecraft

Turn a screenshot or a code snippet into a polished image for a README, a launch post or a social card.
Everything happens in your browser tab: images are never uploaded, and there is no server to send them to.

The image above was made with framecraft: it is framecraft's own screenshot, put in a browser frame,
tilted and exported at 2x by [`scripts/readme-images.mjs`](scripts/readme-images.mjs), which drives the real app.

<p align="center"><img src="docs/demo.gif" alt="A 16-second recording of framecraft: a screenshot is dropped in, a deploy key is covered, a box, an arrow, a text label and two numbered steps are added, the size is set to GitHub social preview, the card is tilted and a PNG is downloaded" width="100%"></p>

The recording above is the real app, driven by [`scripts/demo-gif.mjs`](scripts/demo-gif.mjs) (Playwright plus ffmpeg).

## Quickstart

Needs Node.js 22.12 or newer, on an even-numbered (LTS) line: the test runner (Vitest) does not support 23 or 25.

```sh
git clone https://github.com/Habibeyilmazz/framecraft.git
cd framecraft
npm install
npm run dev        # then open http://localhost:4210
```

`npm run build` writes a static site to `dist/` that you can host anywhere (it uses relative paths, so a sub-folder works).

## What it does

**Screenshot mode**

![Screenshot mode with a browser frame, a box, an arrow, a text label, two numbered steps and a deploy key hidden under a solid cover](docs/screenshots/screenshot-mode.png)

- Drop an image on the page, paste it with Ctrl+V / ⌘V, or pick a file (PNG, JPEG, WebP, GIF, AVIF, SVG). An SVG
  is drawn 2000 px on its long side, so a diagram stays sharp on a 2x export; its scripts never run and it loads
  nothing from the network. Chrome and Safari cannot export an SVG with HTML inside (`foreignObject`), so there it is
  refused with a message (Firefox can); use a PNG of it instead.
- Frames: none, browser window (with an editable address), macOS window (with a title), phone. Light or dark windows.
- Crop: pick Crop and the whole image shows with the crop outlined; drag over the part to keep. From the keyboard,
  arrow keys move the crop, Alt+arrow keys resize it and Delete shows the whole image again; so does
  "Show whole image" in the sidebar. Annotations stay attached to the whole image, so a crop never moves or drops
  one: a redaction outside the crop still covers its pixels if you widen the crop later. Undo covers crop changes,
  and replacing the image clears the crop. Moving an annotation with the Pointer or the arrow keys stops at the crop's
  edge (one already outside can still be moved back in), and a new text label is kept inside it.
- Annotations: arrows, boxes, numbered step badges, text labels, and three redactions: blur, pixelate and cover. Blur and pixelate
  rebuild the region from a tiny downscaled copy (cells of at least 8 image pixels) and clear the original pixels
  first, so the exported file does not contain what you covered, and overlapping redactions never bring covered
  pixels back. Cover paints the region one solid colour. An image takes up to 200 annotations, 30 of them
  redactions, and 99 step badges; past that the editor says so instead of adding one that a reload would drop.
- **For passwords, keys and tokens use Cover.** Blurred or pixelated text keeps a coarse shape, and tools such as
  Depix have recovered short pixelated strings in a known font. A solid fill leaves nothing to reconstruct.
  Every annotation is listed in the sidebar with a Remove button; Ctrl+Z / ⌘Z undoes the last change to them
  (adding, moving, resizing, editing or removing).
- Text labels: pick Text and click the image to place a label, or drag to set its size. Its words are selected in a
  box next to the toolbar, so you can type straight away; Enter takes you back to the image. Selecting a label later
  shows the box again. A label is one line of up to 80 characters on a pill in the annotation colour, with black or
  white text, whichever contrasts more. Editing the words keeps the font size and grows or shrinks the pill;
  resizing the pill scales the text to fit.
- With the Pointer tool, drag any annotation to move it (grab a box by its outline, a redaction anywhere inside).
  The selected annotation shows a round handle (an arrow's tip, a box's bottom-right corner): drag it to resize.
  Pick a colour while the Pointer is active to recolour the selected annotation (undo puts the old colour back);
  with a drawing tool, the colour applies to the next annotation you add.
- Keyboard: Tab to the preview, pick a tool, press Enter to add an annotation, arrow keys to move it (Shift for bigger
  steps), Alt+arrow keys to resize it or move an arrow's tip, Delete to remove it. The keys act on the selected
  annotation: the newest one, the one you last dragged, or the one you pick by name in the sidebar list.
- With forced colours (Windows High Contrast) the chosen options use the system highlight colour and the colour
  swatches keep their colours (checked with Chromium's emulation, not on real Windows).

**Code mode**

<img src="docs/code-card.png" alt="A highlighted TypeScript snippet in a dark window on a dusk gradient" width="560">

- Syntax highlighting for 24 languages with [highlight.js](https://highlightjs.org/), including automatic language detection (from the first 4000 characters, so a long paste stays quick). Text with a line over 1000 characters, such as minified code, stays uncoloured: highlighting slows down sharply on very long lines.
- Themes: Framecraft, One Dark, Dracula, Nord, GitHub Dark, GitHub Light, Solarized Light (palettes follow the published schemes they are named after).
- Line numbers, highlighted lines (`2, 4-6`), file name in the window bar, font size.
- Added and removed lines, like a diff, to show a change: list them (`4`, `3`) and they get a green or red tint, an edge
  and a `+` or `−` sign beside the line number, in the theme's own diff colours. The code keeps its syntax colours.
  A line in more than one list shows as removed, then added, then highlighted.

<img src="docs/diff-card.png" alt="A TypeScript function in GitHub Dark with line 3 marked removed in red and line 4 marked added in green" width="560">

**Both modes**

- Backgrounds: 10 gradients, 6 mesh gradients (shuffle for a new arrangement), solid colour, your own image, or transparent; optional grain.
- Padding, corner radius, four shadow strengths, 3D tilt in two axes, and a caption above or below.
- Output sizes: fit to content, GitHub social preview (1280 × 640), README banner (1280 × 480), X post (1600 × 900),
  LinkedIn post (1200 × 627), Open Graph (1200 × 630), square (1080 × 1080), or a custom width and height from 64 to
  4096 px (for example 1000 × 420 for a DEV cover image). A custom size goes into share links, templates and the
  file name (`framecraft-code-1000x420@2x.png`).
- Export PNG at 1x, 2x or 3x, or copy the image straight to the clipboard. Exports over 16384 px on a side or
  120 megapixels are refused with a message instead of failing silently.
- Export SVG for code cards: the code stays real text with the fonts embedded, so it is sharp at any size
  ([example](docs/code-card.svg)). SVG is not offered for tilted cards, because SVG has no perspective transform.
- **Copy link** puts the whole design in the URL (compressed), so anyone who opens it gets the same look.
  Screenshots and background images are never put in the link. Annotations and the crop are: they land on the first
  screenshot added after opening the link (or reloading the page), and replacing that screenshot clears them. The address bar
  holds the current design as you edit, including a code snippet, so the snippet ends up in your browser history
  like any other URL.
- **Templates** save the look (not your image, its crop and annotations, or your code) in this browser's local storage.

![Code mode in the editor](docs/screenshots/code-mode.png)

On a narrow screen the preview sits above the settings and fills the width.

<img src="docs/screenshots/phone.png" alt="framecraft on a phone in dark mode: a box drawn on the screenshot, with its round resize handle" width="300">

## How it works

- One design object (`src/design.ts`) describes everything except images. It is validated whenever it comes from
  outside (a shared link or a saved template): unknown keys are dropped, numbers are clamped, strings are length-capped.
  The share link is that JSON, deflated with the browser's `CompressionStream` and base64url-encoded.
- `src/layout.ts` is pure geometry: content size, frame chrome, the output size and the scale that fits the card in it.
- `src/render.ts` draws with the Canvas 2D API: background, then the card (frame, image or code, annotations) on its
  own canvas at the final pixel size, then the card onto the background with a shadow. Tilt projects the card through
  a tiny WebGL quad so the texture is perspective-correct; a homography (`src/perspective.ts`) maps the mouse back
  onto the tilted card so annotations land where you click.
- `src/svg.ts` builds the SVG from the same layout numbers, so the PNG and SVG match.
- Fonts (Instrument Sans, JetBrains Mono) are bundled with the app, so it makes no third-party requests. Once the page
  has loaded it keeps working without a connection, except that code in a script other than Latin (Cyrillic, Greek,
  Vietnamese) falls back to a system monospace font if its font file was not fetched while online. There is no service
  worker, so the page itself does not load offline.
- The built page carries a strict Content-Security-Policy (`vite.config.ts`): it may load only its own scripts, styles,
  fonts and images, and inline scripts are blocked. It is a `<meta>` tag because static hosts such as GitHub Pages
  cannot set headers, so `frame-ancestors` (framing protection) is not part of it.

## Development

```sh
npm run typecheck  # TypeScript
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests in Chromium (Playwright; builds and serves on port 4211)
```

Before the first `npm run e2e`, download Playwright's Chromium once with `npx playwright install chromium`;
without it the run stops with "Executable doesn't exist".

CI runs the end-to-end tests in Chromium, Firefox and WebKit (Safari's engine). To do the same locally, install
those browsers with `npx playwright install firefox webkit` and run `ALL_BROWSERS=1 npm run e2e`. Some tests are
skipped outside Chromium: the clipboard test (only Chromium lets a test grant clipboard access; the main-journey test
also stops before its share-link step there), the two-finger test (it sends touches through the Chrome DevTools
Protocol) and the three paste tests on Firefox (it drops the data from a simulated paste). Real Safari and Firefox have not
been tried by hand.

The e2e tests use a made-up dashboard (`e2e/fixtures/fake-app.html`, screenshot regenerated by `e2e/make-fixture.mjs`).
To regenerate the README images, run `npm run dev` and then `node scripts/readme-images.mjs`.

A manual GitHub Pages workflow is included (`.github/workflows/pages.yml`). To use it, set Pages to "GitHub Actions"
in the repository settings, then run the workflow from the Actions tab. It has not been run on this repository yet;
the built `dist/` has been checked served from a sub-folder, the way Pages serves a project site.

## When to use something else

framecraft does two jobs, framing screenshots and making code cards, with one set of backgrounds and sizes, in a
static page you can host yourself. Other tools go deeper on one of those jobs:

- **[Carbon](https://github.com/carbon-app/carbon)** and **[ray.so](https://ray.so)** make code images only, with
  far more themes and fonts than framecraft's seven themes and one font. Pick them if code cards are all you need.
- **[freeze](https://github.com/charmbracelet/freeze)** and **[silicon](https://github.com/Aloxaf/silicon)** render code
  images from the command line, which suits scripts and CI. framecraft has no CLI.
- **[Shots](https://shots.so)** offers many more device mockups. framecraft has four frames
  (none, browser, macOS window, phone) and a two-axis tilt.
- **CleanShot X** and **Xnapper** are paid macOS apps that capture, annotate and frame in one step. framecraft starts
  from an image you already have and runs in a browser tab.

Reasons to pick framecraft: annotations and redaction (blur, pixelate and a solid cover that clears the covered
pixels before export) next to the framing, a share link that carries the whole look, no account, no upload, and MIT
source you can run or host yourself.

## Roadmap

Not built yet:

- Multi-line text labels.
- An aspect-ratio lock for the crop.
- SVG export for screenshot mode.
- A custom gradient editor.
- More frames (iPad, Android, Windows window) and line wrapping for long code lines.

## Contributing

Bug reports and small, focused pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains the setup,
the tests a change needs and the house rules (synthetic test data only, no new runtime dependency without a reason).
To report a security problem, such as a redaction that leaves recoverable pixels, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
