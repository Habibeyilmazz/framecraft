import { CODE_THEMES, parseLineRanges, type Highlighted } from './code';
import { stepRadius, type Design, type Note } from './design';
import { codeMetrics, layoutCard, layoutScene, shotDisplaySize, type Box, type CardLayout, type CodeMetrics, type Scene } from './layout';
import { applyH, homography, invert3, projectCard, type Mat3, type ProjPt } from './perspective';
import { contrastInk, GRADIENTS, gradientLine, MESHES, meshBlobs, SHADOW_PRESETS } from './presets';

export type Img = CanvasImageSource & { width: number; height: number };

export interface Assets {
  shot?: Img;
  bgImage?: Img;
  code?: Highlighted;
}

export const MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
export const SANS = '"Instrument Sans Variable", system-ui, -apple-system, "Segoe UI", sans-serif';

type Ctx = CanvasRenderingContext2D;

let scratch: CanvasRenderingContext2D | undefined;

export function measureCode(fontSize: number): (s: string) => number {
  scratch ??= document.createElement('canvas').getContext('2d')!;
  scratch.font = `400 ${fontSize}px ${MONO}`;
  const ctx = scratch;
  return (s) => ctx.measureText(s).width;
}

export function codeLayout(d: Design, hl: Highlighted): CodeMetrics {
  return codeMetrics(hl.lines.map((l) => l.map((t) => t.text).join('')), d.code.fontSize, d.code.lineNumbers, measureCode(d.code.fontSize));
}

/** Natural content size for the current mode, or null when there is nothing to draw yet. */
export function contentSize(d: Design, a: Assets): { w: number; h: number } | null {
  if (d.mode === 'code') return a.code ? codeLayout(d, a.code) : null;
  return a.shot ? shotDisplaySize(a.shot.width, a.shot.height) : null;
}

export interface Rendered {
  canvas: HTMLCanvasElement;
  scene: Scene;
  card: CardLayout;
  /** Map a point in output logical px to content-relative coordinates (0..1 inside the content). */
  toContent: (x: number, y: number) => [number, number];
}

export function roundRect(ctx: Ctx | Path2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.roundRect(x, y, w, h, r);
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- background ----------

let noiseTile: HTMLCanvasElement | null = null;
function noise(): HTMLCanvasElement {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas');
  noiseTile.width = noiseTile.height = 160;
  const c = noiseTile.getContext('2d')!;
  const img = c.createImageData(160, 160);
  let s = 1;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = s & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return noiseTile;
}

export function drawBackground(ctx: Ctx, d: Design, W: number, H: number, bgImage?: Img) {
  const bg = d.bg;
  if (bg.kind === 'none') return;
  if (bg.kind === 'solid' || (bg.kind === 'image' && !bgImage)) {
    ctx.fillStyle = bg.color;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === 'gradient') {
    const g = GRADIENTS[bg.gradient % GRADIENTS.length];
    const lg = ctx.createLinearGradient(...gradientLine(g.angle, W, H));
    g.stops.forEach((c, i) => lg.addColorStop(i / (g.stops.length - 1), c));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
  } else if (bg.kind === 'mesh') {
    const m = MESHES[bg.mesh % MESHES.length];
    ctx.fillStyle = m.base;
    ctx.fillRect(0, 0, W, H);
    const R = Math.max(W, H);
    meshBlobs(bg.seed, m.blobs.length).forEach((b, i) => {
      const rg = ctx.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * R);
      rg.addColorStop(0, hexA(m.blobs[i], 0.9));
      rg.addColorStop(1, hexA(m.blobs[i], 0));
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    });
  } else if (bg.kind === 'image' && bgImage) {
    const s = Math.max(W / bgImage.width, H / bgImage.height);
    const w = bgImage.width * s;
    const h = bgImage.height * s;
    ctx.drawImage(bgImage, (W - w) / 2, (H - h) / 2, w, h);
  }
  if (bg.noise > 0) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // grain stays one device pixel at every export scale
    ctx.globalAlpha = bg.noise * 0.35;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(noise(), 'repeat')!;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}

// ---------- card ----------

function trafficLights(ctx: Ctx, bar: number) {
  const r = bar * 0.15;
  ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(bar * 0.6 + i * r * 3.3, bar / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill();
  });
}

function fitText(ctx: Ctx, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

function drawWindowChrome(ctx: Ctx, d: Design, L: CardLayout) {
  const dark = d.dark;
  const { w, bar } = L;
  ctx.fillStyle = dark ? '#26282d' : '#ebecef';
  ctx.fillRect(0, 0, w, bar);
  trafficLights(ctx, bar);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (d.frame === 'browser') {
    const pw = Math.min(w * 0.5, Math.max(w - bar * 6, bar * 2));
    const ph = bar * 0.58;
    ctx.beginPath();
    roundRect(ctx, (w - pw) / 2, (bar - ph) / 2, pw, ph, ph / 2);
    ctx.fillStyle = dark ? '#36383e' : '#ffffff';
    ctx.fill();
    ctx.font = `500 ${bar * 0.3}px ${SANS}`;
    ctx.fillStyle = dark ? '#b9bcc4' : '#5d6168';
    ctx.fillText(fitText(ctx, d.url, pw - ph), w / 2, bar / 2 + bar * 0.01);
  } else if (d.title) {
    ctx.font = `600 ${bar * 0.34}px ${SANS}`;
    ctx.fillStyle = dark ? '#c4c7ce' : '#4a4e55';
    ctx.fillText(fitText(ctx, d.title, w - bar * 5), w / 2, bar / 2);
  }
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
  ctx.fillRect(0, bar - 1, w, 1);
}

let redactCache: { img: Img; key: string; out: Img } | null = null;

/**
 * Bake blur and pixelate into a copy of the image, in image pixels. Each redaction samples the copy, so an
 * overlapping one can never bring back pixels an earlier one covered. Cells are at least 8 image px, so even
 * a tiny image loses its detail.
 */
export function redact(img: Img, notes: Note[]): Img {
  const marks = notes.filter((n) => n.t === 'blur' || n.t === 'pixel');
  if (!marks.length) return img;
  const key = JSON.stringify(marks);
  if (redactCache?.img === img && redactCache.key === key) return redactCache.out;
  const out = document.createElement('canvas');
  out.width = img.width;
  out.height = img.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  for (const n of marks) {
    const x = Math.floor(n.x * img.width);
    const y = Math.floor(n.y * img.height);
    const w = Math.ceil(n.w * img.width);
    const h = Math.ceil(n.h * img.height);
    if (w < 1 || h < 1) continue;
    const blur = n.t === 'blur';
    const cell = Math.max(8, img.width / (blur ? 160 : 70));
    const tiny = document.createElement('canvas');
    tiny.width = Math.max(1, Math.round(w / cell));
    tiny.height = Math.max(1, Math.round(h / cell));
    const tctx = tiny.getContext('2d')!;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(out, x, y, w, h, 0, 0, tiny.width, tiny.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    // clear first: the original pixels must not survive under a semi-transparent redaction
    ctx.clearRect(x, y, w, h);
    ctx.imageSmoothingEnabled = blur;
    if (blur && 'filter' in ctx) ctx.filter = `blur(${cell}px)`;
    const pad = blur ? cell * 2 : 0; // oversize so the blur has no faded edge
    ctx.drawImage(tiny, x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.restore();
  }
  redactCache = { img, key, out };
  return out;
}

/** Arrows, boxes and step badges, drawn over the (already redacted) image. */
function drawNotes(ctx: Ctx, notes: Note[], c: Box) {
  const unit = Math.max(2, c.w * 0.005);
  for (const n of notes) {
    ctx.strokeStyle = ctx.fillStyle = n.c;
    ctx.lineWidth = unit;
    ctx.lineCap = ctx.lineJoin = 'round';
    if (n.t === 'box') {
      ctx.beginPath();
      roundRect(ctx, c.x + n.x * c.w, c.y + n.y * c.h, n.w * c.w, n.h * c.h, unit * 2);
      ctx.stroke();
    } else if (n.t === 'arrow') {
      const x1 = c.x + n.x * c.w, y1 = c.y + n.y * c.h;
      const x2 = c.x + n.x2 * c.w, y2 = c.y + n.y2 * c.h;
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 1) continue;
      const head = Math.min(unit * 5, len * 0.6);
      const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const bx = x2 - ux * head, by = y2 - uy * head;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(bx + ux * head * 0.3, by + uy * head * 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(bx - uy * head * 0.62, by + ux * head * 0.62);
      ctx.lineTo(bx + uy * head * 0.62, by - ux * head * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (n.t === 'step') {
      const r = stepRadius(c.w);
      const x = c.x + n.x * c.w, y = c.y + n.y * c.h;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.14);
      ctx.strokeStyle = contrastInk(n.c) === '#ffffff' ? '#ffffff' : 'rgba(0,0,0,0.55)';
      ctx.stroke();
      ctx.fillStyle = contrastInk(n.c);
      ctx.font = `700 ${r * 1.05}px ${SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(n.n), x, y + r * 0.04);
    }
  }
}

function drawShotCard(ctx: Ctx, d: Design, L: CardLayout, img: Img) {
  const c = L.content;
  ctx.beginPath();
  roundRect(ctx, 0, 0, L.w, L.h, L.radius);
  ctx.clip();
  if (d.frame === 'phone') {
    ctx.fillStyle = '#141518';
    ctx.fillRect(0, 0, L.w, L.h);
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, c.x, c.y, c.w, c.h, L.radius - L.bezel);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.drawImage(redact(img, d.notes), c.x, c.y, c.w, c.h);
    drawNotes(ctx, d.notes, c);
    if (c.h > c.w) {
      const iw = c.w * 0.32, ih = c.w * 0.094;
      ctx.beginPath();
      roundRect(ctx, c.x + (c.w - iw) / 2, c.y + c.w * 0.028, iw, ih, ih / 2);
      ctx.fillStyle = '#000';
      ctx.fill();
    }
    ctx.restore();
    // a soft rim so the bezel reads as metal, not a flat outline
    ctx.beginPath();
    roundRect(ctx, 1, 1, L.w - 2, L.h - 2, L.radius - 1);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.stroke();
    return;
  }
  ctx.fillStyle = d.dark ? '#1c1d21' : '#ffffff';
  ctx.fillRect(0, 0, L.w, L.h);
  if (L.bar) drawWindowChrome(ctx, d, L);
  ctx.drawImage(redact(img, d.notes), c.x, c.y, c.w, c.h);
  drawNotes(ctx, d.notes, c);
  if (d.frame !== 'none') {
    ctx.beginPath();
    roundRect(ctx, 0.5, 0.5, L.w - 1, L.h - 1, L.radius);
    ctx.lineWidth = 1;
    ctx.strokeStyle = d.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    ctx.stroke();
  }
}

function drawCodeCard(ctx: Ctx, d: Design, L: CardLayout, hl: Highlighted) {
  const th = CODE_THEMES[d.code.theme];
  const m = codeLayout(d, hl);
  const marks = parseLineRanges(d.code.highlight, hl.lines.length);
  ctx.beginPath();
  roundRect(ctx, 0, 0, L.w, L.h, L.radius);
  ctx.clip();
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, L.w, L.h);
  if (L.bar) {
    ctx.fillStyle = th.bar;
    ctx.fillRect(0, 0, L.w, L.bar);
    trafficLights(ctx, L.bar);
    if (d.code.title) {
      ctx.font = `500 ${L.bar * 0.33}px ${SANS}`;
      ctx.fillStyle = th.colors.comment;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, d.code.title, L.w - L.bar * 5), L.w / 2, L.bar / 2);
    }
  }
  const top = L.content.y + m.padY;
  ctx.textBaseline = 'middle';
  hl.lines.forEach((line, i) => {
    const y = top + i * m.lh;
    const mid = y + m.lh / 2;
    const on = marks.has(i + 1);
    if (on) {
      ctx.fillStyle = th.hl;
      ctx.fillRect(0, y, L.w, m.lh);
      ctx.fillStyle = th.colors.keyword;
      ctx.fillRect(0, y, Math.max(2, m.fs * 0.2), m.lh);
    }
    ctx.font = `400 ${m.fs}px ${MONO}`;
    if (d.code.lineNumbers) {
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? th.colors.fg : th.lineNo;
      ctx.fillText(String(i + 1), m.padX + m.gutter - m.fs * 1.6, mid);
    }
    ctx.textAlign = 'left';
    let x = m.padX + m.gutter;
    for (const t of line) {
      ctx.fillStyle = th.colors[t.role];
      ctx.fillText(t.text, x, mid);
      x += ctx.measureText(t.text).width;
    }
  });
}

// ---------- perspective via WebGL ----------

let gl: WebGLRenderingContext | null | undefined;
let glCanvas: HTMLCanvasElement;
function getGL(): WebGLRenderingContext | null {
  if (gl !== undefined) return gl;
  glCanvas = document.createElement('canvas');
  gl = glCanvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true });
  if (!gl) return null;
  const vs = `attribute vec4 p; attribute vec2 uv; varying vec2 v; void main(){ v = uv; gl_Position = p; }`;
  const fs = `precision mediump float; varying vec2 v; uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, v); }`;
  const prog = gl.createProgram()!;
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  const stride = 6 * 4;
  const p = gl.getAttribLocation(prog, 'p');
  const uv = gl.getAttribLocation(prog, 'uv');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 4, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, stride, 16);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  return gl;
}

/** Draw src onto a transparent W x H (device px) canvas with its corners at quad (TL, TR, BR, BL). */
function warp(src: HTMLCanvasElement, quad: ProjPt[], W: number, H: number): HTMLCanvasElement | null {
  const g = getGL();
  if (!g) return null;
  glCanvas.width = W;
  glCanvas.height = H;
  g.viewport(0, 0, W, H);
  g.clearColor(0, 0, 0, 0);
  g.clear(g.COLOR_BUFFER_BIT);
  g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, src);
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const data: number[] = [];
  for (const i of [0, 1, 3, 2]) {
    const { x, y, w } = quad[i];
    data.push(((x / W) * 2 - 1) * w, (1 - (y / H) * 2) * w, 0, w, ...uvs[i]);
  }
  g.bufferData(g.ARRAY_BUFFER, new Float32Array(data), g.DYNAMIC_DRAW);
  g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}

// ---------- scene ----------

export function render(d: Design, a: Assets, scale: number, target?: HTMLCanvasElement): Rendered | null {
  const size = contentSize(d, a);
  if (!size) return null;
  const card = layoutCard(d, size);
  const scene = layoutScene(d, card);
  const S = scale;
  const canvas = target ?? document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(scene.W * S));
  canvas.height = Math.max(1, Math.round(scene.H * S));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  ctx.clearRect(0, 0, scene.W, scene.H);
  drawBackground(ctx, d, scene.W, scene.H, a.bgImage);

  // the card is drawn once at its final pixel size, with a 2px transparent margin so tilted edges stay smooth
  const cs = scene.k * S;
  const m = 2;
  const cc = document.createElement('canvas');
  cc.width = Math.ceil(card.w * cs) + m * 2;
  cc.height = Math.ceil(card.h * cs) + m * 2;
  const cctx = cc.getContext('2d')!;
  cctx.setTransform(cs, 0, 0, cs, m, m);
  if (d.mode === 'code') drawCodeCard(cctx, d, card, a.code!);
  else drawShotCard(cctx, d, card, a.shot!);

  const lw = cc.width / S;
  const lh = cc.height / S;
  const tilted = !!(d.tiltX || d.tiltY);
  const x0 = Math.round((scene.cx - lw / 2) * S) / S;
  const y0 = Math.round((scene.cy - lh / 2) * S) / S;
  const flat: ProjPt[] = [[0, 0], [lw, 0], [lw, lh], [0, lh]].map(([x, y]) => ({ x: x0 + x, y: y0 + y, w: 1 }));
  const proj = tilted ? projectCard(lw, lh, scene.cx, scene.cy, d.tiltX, d.tiltY) : flat;

  const sh = SHADOW_PRESETS[d.shadow];
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (sh.alpha) {
    // canvas shadows ignore the transform, so scale them by hand
    ctx.shadowColor = `rgba(0,0,0,${sh.alpha})`;
    ctx.shadowBlur = sh.blur * S;
    ctx.shadowOffsetY = sh.y * S;
  }
  const warped = tilted ? warp(cc, proj.map((q) => ({ ...q, x: q.x * S, y: q.y * S })), canvas.width, canvas.height) : null;
  if (warped) ctx.drawImage(warped, 0, 0);
  else ctx.drawImage(cc, x0 * S, y0 * S); // also the fallback when WebGL is unavailable
  const quad = warped ? proj : flat;
  ctx.restore();

  if (d.caption.text.trim()) {
    ctx.font = `600 ${d.caption.size}px ${SANS}`;
    ctx.fillStyle = d.caption.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, d.caption.text, scene.W - d.padding), scene.W / 2, scene.captionY);
  }

  const H: Mat3 = homography(
    [[0, 0], [cc.width, 0], [cc.width, cc.height], [0, cc.height]],
    quad.map((q) => [q.x, q.y]),
  );
  const inv = invert3(H);
  const toContent = (x: number, y: number): [number, number] => {
    const [px, py] = applyH(inv, [x, y]);
    const u = (px - m) / cs;
    const v = (py - m) / cs;
    return [(u - card.content.x) / card.content.w, (v - card.content.y) / card.content.h];
  };
  return { canvas, scene, card, toContent };
}

// Safari's canvas area cap is the smallest of the major browsers (about 16.7 megapixels on iOS, 268 on desktop Chrome);
// shortcut: one conservative limit for all, raise it if people hit it on desktop.
export const MAX_SIDE = 16384;
export const MAX_AREA = 120_000_000;

/** Throws with a readable message when an export would be larger than browsers can draw. */
export function checkExportSize(d: Design, a: Assets, scale: number) {
  const size = contentSize(d, a);
  if (!size) return;
  const { W, H } = layoutScene(d, layoutCard(d, size));
  const w = Math.round(W * scale);
  const h = Math.round(H * scale);
  if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_AREA)
    throw new Error(`At ${scale}x this image would be ${w} × ${h} px, more than browsers can export. Use a lower scale, a fixed size, or shorter lines.`);
}

export async function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
  if (!blob) throw new Error('The image is too large for this browser to encode. Try a smaller export scale.');
  return blob;
}
