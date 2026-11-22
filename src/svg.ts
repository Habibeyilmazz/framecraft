import monoFontUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import sansFontUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url';
import { CODE_THEMES, parseLineRanges, type Highlighted } from './code';
import type { Design } from './design';
import { layoutCard, layoutScene, type CodeMetrics } from './layout';
import { GRADIENTS, gradientLine, MESHES, meshBlobs, SHADOW_PRESETS } from './presets';
import { codeLayout } from './render';

// strip characters XML 1.0 forbids (a NUL from a shared link would break the file), then escape markup
const esc = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => String(Math.round(v * 100) / 100);

export interface SvgInputs {
  metrics: CodeMetrics;
  monoFont?: string; // data: URL
  sansFont?: string; // data: URL
  bgImage?: string; // data: URL
}

/** Build a standalone SVG of a code card. Text stays text, so it is crisp at any size and selectable. Tilt is not supported. */
export function buildCodeSvg(d: Design, hl: Highlighted, inp: SvgInputs): string {
  const m = inp.metrics;
  const th = CODE_THEMES[d.code.theme];
  const card = layoutCard(d, { w: m.w, h: m.h });
  const scene = layoutScene({ ...d, tiltX: 0, tiltY: 0 }, card);
  const { W, H, k } = scene;
  const defs: string[] = [];
  const body: string[] = [];

  const fonts: string[] = [];
  if (inp.monoFont) fonts.push(`@font-face{font-family:"JetBrains Mono";src:url(${inp.monoFont}) format("woff2");}`);
  if (inp.sansFont) fonts.push(`@font-face{font-family:"Instrument Sans Variable";font-weight:400 700;src:url(${inp.sansFont}) format("woff2");}`);
  if (fonts.length) defs.push(`<style>${fonts.join('')}</style>`);

  // background
  const bg = d.bg;
  if (bg.kind === 'solid' || (bg.kind === 'image' && !inp.bgImage)) body.push(`<rect width="${W}" height="${H}" fill="${bg.color}"/>`);
  else if (bg.kind === 'gradient') {
    const g = GRADIENTS[bg.gradient % GRADIENTS.length];
    const [x1, y1, x2, y2] = gradientLine(g.angle, W, H);
    defs.push(
      `<linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">${g.stops
        .map((c, i) => `<stop offset="${n(i / (g.stops.length - 1))}" stop-color="${c}"/>`)
        .join('')}</linearGradient>`,
    );
    body.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
  } else if (bg.kind === 'mesh') {
    const mesh = MESHES[bg.mesh % MESHES.length];
    const R = Math.max(W, H);
    body.push(`<rect width="${W}" height="${H}" fill="${mesh.base}"/>`);
    meshBlobs(bg.seed, mesh.blobs.length).forEach((b, i) => {
      defs.push(
        `<radialGradient id="m${i}" gradientUnits="userSpaceOnUse" cx="${n(b.x * W)}" cy="${n(b.y * H)}" r="${n(b.r * R)}"><stop offset="0" stop-color="${mesh.blobs[i]}" stop-opacity="0.9"/><stop offset="1" stop-color="${mesh.blobs[i]}" stop-opacity="0"/></radialGradient>`,
      );
      body.push(`<rect width="${W}" height="${H}" fill="url(#m${i})"/>`);
    });
  } else if (bg.kind === 'image' && inp.bgImage) {
    body.push(`<image href="${inp.bgImage}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`);
  }
  if (bg.kind !== 'none' && bg.noise > 0) {
    defs.push(`<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>`);
    body.push(`<rect width="${W}" height="${H}" filter="url(#grain)" opacity="${n(bg.noise * 0.35)}" style="mix-blend-mode:overlay"/>`);
  }

  // card
  const x0 = scene.cx - (card.w * k) / 2;
  const y0 = scene.cy - (card.h * k) / 2;
  const r = Math.min(card.radius, card.w / 2, card.h / 2);
  const sh = SHADOW_PRESETS[d.shadow];
  defs.push(`<clipPath id="card"><rect width="${n(card.w)}" height="${n(card.h)}" rx="${r}"/></clipPath>`);
  const g: string[] = [];
  if (sh.alpha) {
    defs.push(
      `<filter id="shadow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${n(sh.y / k)}" stdDeviation="${n(sh.blur / 2 / k)}" flood-color="#000" flood-opacity="${sh.alpha}"/></filter>`,
    );
    g.push(`<rect width="${n(card.w)}" height="${n(card.h)}" rx="${r}" fill="${th.bg}" filter="url(#shadow)"/>`);
  }
  const inner: string[] = [`<rect width="${n(card.w)}" height="${n(card.h)}" fill="${th.bg}"/>`];
  if (card.bar) {
    const b = card.bar;
    inner.push(`<rect width="${n(card.w)}" height="${b}" fill="${th.bar}"/>`);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => inner.push(`<circle cx="${n(b * 0.6 + i * b * 0.15 * 3.3)}" cy="${n(b / 2)}" r="${n(b * 0.15)}" fill="${c}"/>`));
    if (d.code.title)
      inner.push(
        `<text x="${n(card.w / 2)}" y="${n(b / 2)}" text-anchor="middle" dominant-baseline="central" font-family="'Instrument Sans Variable', system-ui, sans-serif" font-weight="500" font-size="${n(b * 0.33)}" fill="${th.colors.comment}">${esc(d.code.title)}</text>`,
      );
  }
  const marks = parseLineRanges(d.code.highlight, hl.lines.length);
  const top = card.content.y + m.padY;
  const textX = m.padX + m.gutter;
  hl.lines.forEach((line, i) => {
    const y = top + i * m.lh;
    const mid = y + m.lh / 2;
    const on = marks.has(i + 1);
    if (on) {
      inner.push(`<rect y="${n(y)}" width="${n(card.w)}" height="${m.lh}" fill="${th.hl}"/>`);
      inner.push(`<rect y="${n(y)}" width="${n(Math.max(2, m.fs * 0.2))}" height="${m.lh}" fill="${th.colors.keyword}"/>`);
    }
    if (d.code.lineNumbers)
      inner.push(`<text x="${n(m.padX + m.gutter - m.fs * 1.6)}" y="${n(mid)}" text-anchor="end" fill="${on ? th.colors.fg : th.lineNo}">${i + 1}</text>`);
    if (line.length)
      inner.push(`<text x="${n(textX)}" y="${n(mid)}">${line.map((t) => `<tspan fill="${th.colors[t.role]}">${esc(t.text)}</tspan>`).join('')}</text>`);
  });
  g.push(
    `<g clip-path="url(#card)" font-family="'JetBrains Mono', ui-monospace, Menlo, monospace" font-size="${m.fs}" dominant-baseline="central" xml:space="preserve">${inner.join('')}</g>`,
  );
  body.push(`<g transform="translate(${n(x0)} ${n(y0)}) scale(${n(k)})">${g.join('')}</g>`);

  if (d.caption.text.trim())
    body.push(
      `<text x="${n(W / 2)}" y="${n(scene.captionY)}" text-anchor="middle" dominant-baseline="central" font-family="'Instrument Sans Variable', system-ui, sans-serif" font-weight="600" font-size="${d.caption.size}" fill="${d.caption.color}">${esc(d.caption.text)}</text>`,
    );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs>${body.join('')}</svg>`;
}

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((done, fail) => {
    const r = new FileReader();
    r.onload = () => done(String(r.result));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(blob);
  });
}

/** Browser wrapper: measures with the real font and embeds fonts and the background image so the file stands alone. */
export async function codeToSvg(d: Design, hl: Highlighted, bgImage?: CanvasImageSource & { width: number; height: number }): Promise<string> {
  let bg: string | undefined;
  if (d.bg.kind === 'image' && bgImage) {
    const c = document.createElement('canvas');
    c.width = bgImage.width;
    c.height = bgImage.height;
    c.getContext('2d')!.drawImage(bgImage, 0, 0);
    bg = c.toDataURL('image/jpeg', 0.9);
  }
  const needSans = !!(d.caption.text.trim() || (d.code.bar && d.code.title));
  const [monoFont, sansFont] = await Promise.all([dataUrl(monoFontUrl), needSans ? dataUrl(sansFontUrl) : undefined]);
  return buildCodeSvg(d, hl, { metrics: codeLayout(d, hl), monoFont, sansFont, bgImage: bg });
}
