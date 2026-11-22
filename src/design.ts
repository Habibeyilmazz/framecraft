// The whole design as plain JSON. Everything here goes into the share URL, so
// images never live in it; they are held in memory by main.ts.

export const MODES = ['code', 'shot'] as const;
export const FRAMES = ['none', 'browser', 'mac', 'phone'] as const;
export const BG_KINDS = ['gradient', 'mesh', 'solid', 'image', 'none'] as const;
export const SHADOWS = ['none', 'soft', 'medium', 'large'] as const;
export const SIZES = ['auto', 'github', 'readme', 'x', 'linkedin', 'og', 'square'] as const;
export const NOTE_KINDS = ['arrow', 'box', 'blur', 'pixel', 'step'] as const;
export const CAPTION_POS = ['bottom', 'top'] as const;
export const THEMES = ['framecraft', 'one-dark', 'dracula', 'nord', 'github-dark', 'github-light', 'solarized-light'] as const;

export type Frame = (typeof FRAMES)[number];
export type NoteKind = (typeof NOTE_KINDS)[number];

/** Annotation in image-relative coordinates (0..1). Arrows use x,y -> x2,y2; rects use x,y,w,h; steps use x,y,n. */
export interface Note {
  t: NoteKind;
  x: number;
  y: number;
  x2: number;
  y2: number;
  w: number;
  h: number;
  n: number;
  c: string;
}

export interface Design {
  v: 1;
  mode: (typeof MODES)[number];
  size: (typeof SIZES)[number];
  scale: number;
  bg: { kind: (typeof BG_KINDS)[number]; color: string; gradient: number; mesh: number; seed: number; noise: number };
  padding: number;
  radius: number;
  shadow: (typeof SHADOWS)[number];
  tiltX: number;
  tiltY: number;
  caption: { text: string; size: number; color: string; pos: (typeof CAPTION_POS)[number] };
  frame: Frame;
  dark: boolean;
  url: string;
  title: string;
  code: {
    text: string;
    lang: string;
    theme: (typeof THEMES)[number];
    fontSize: number;
    lineNumbers: boolean;
    highlight: string;
    title: string;
    bar: boolean;
  };
  notes: Note[];
}

export const SAMPLE_CODE = `// Pick a frame, drop a screenshot, ship the launch post.
export async function exportImage(design: Design, scale = 2) {
  const canvas = render(design, { scale });
  const blob = await new Promise<Blob | null>((done) =>
    canvas.toBlob(done, 'image/png'),
  );
  if (!blob) throw new Error('Canvas could not be encoded');
  return blob; // nothing leaves the browser
}`;

export function defaultDesign(): Design {
  return {
    v: 1,
    mode: 'code',
    size: 'auto',
    scale: 2,
    bg: { kind: 'mesh', color: '#2f5a4c', gradient: 3, mesh: 3, seed: 7, noise: 0.25 },
    padding: 72,
    radius: 14,
    shadow: 'medium',
    tiltX: 0,
    tiltY: 0,
    caption: { text: '', size: 28, color: '#ffffff', pos: 'bottom' },
    frame: 'browser',
    dark: false,
    url: 'example.com',
    title: '',
    code: {
      text: SAMPLE_CODE,
      lang: 'auto',
      theme: 'framecraft',
      fontSize: 15,
      lineNumbers: true,
      highlight: '3-5',
      title: 'export.ts',
      bar: true,
    },
    notes: [],
  };
}

/** Nudge an annotation (or, with resize, its size or arrow tip) while keeping it inside the image. */
export function moveNote(n: Note, dx: number, dy: number, resize: boolean) {
  const c = (v: number, hi = 1) => Math.min(hi, Math.max(0, v));
  if (n.t === 'arrow') {
    n.x2 = c(n.x2 + dx);
    n.y2 = c(n.y2 + dy);
    if (resize) return;
    n.x = c(n.x + dx);
    n.y = c(n.y + dy);
  } else if (n.t === 'step') {
    n.x = c(n.x + dx);
    n.y = c(n.y + dy);
  } else if (resize) {
    n.w = Math.max(0.01, c(n.w + dx, 1 - n.x));
    n.h = Math.max(0.01, c(n.h + dy, 1 - n.y));
  } else {
    n.x = c(n.x + dx, 1 - n.w);
    n.y = c(n.y + dy, 1 - n.h);
  }
}

// ---- validation (the URL hash and localStorage are untrusted input) ----

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const num = (v: unknown, min: number, max: number, def: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
const int = (v: unknown, min: number, max: number, def: number) => Math.round(num(v, min, max, def));
const str = (v: unknown, max: number, def: string) => (typeof v === 'string' ? v.slice(0, max) : def);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
const color = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : def);
function pick<T extends string>(v: unknown, list: readonly T[], def: T): T {
  return list.includes(v as T) ? (v as T) : def;
}

export const MAX_CODE = 20000;
export const MAX_NOTES = 200;

function sanitizeNote(v: unknown): Note | null {
  const o = obj(v);
  if (!NOTE_KINDS.includes(o.t as NoteKind)) return null;
  return {
    t: o.t as NoteKind,
    x: num(o.x, 0, 1, 0),
    y: num(o.y, 0, 1, 0),
    x2: num(o.x2, 0, 1, 0),
    y2: num(o.y2, 0, 1, 0),
    w: num(o.w, 0, 1, 0),
    h: num(o.h, 0, 1, 0),
    n: int(o.n, 1, 99, 1),
    c: color(o.c, '#ff4d3d'),
  };
}

/** Turn anything (parsed JSON from a URL or storage) into a valid Design. Unknown keys are dropped. */
export function sanitize(input: unknown): Design {
  const d = defaultDesign();
  const o = obj(input);
  const bg = obj(o.bg);
  const cap = obj(o.caption);
  const code = obj(o.code);
  return {
    v: 1,
    mode: pick(o.mode, MODES, d.mode),
    size: pick(o.size, SIZES, d.size),
    scale: int(o.scale, 1, 3, d.scale),
    bg: {
      kind: pick(bg.kind, BG_KINDS, d.bg.kind),
      color: color(bg.color, d.bg.color),
      gradient: int(bg.gradient, 0, 99, d.bg.gradient),
      mesh: int(bg.mesh, 0, 99, d.bg.mesh),
      seed: int(bg.seed, 0, 1e9, d.bg.seed),
      noise: num(bg.noise, 0, 1, d.bg.noise),
    },
    padding: int(o.padding, 0, 240, d.padding),
    radius: int(o.radius, 0, 48, d.radius),
    shadow: pick(o.shadow, SHADOWS, d.shadow),
    tiltX: num(o.tiltX, -30, 30, d.tiltX),
    tiltY: num(o.tiltY, -30, 30, d.tiltY),
    caption: {
      text: str(cap.text, 200, d.caption.text),
      size: int(cap.size, 12, 96, d.caption.size),
      color: color(cap.color, d.caption.color),
      pos: pick(cap.pos, CAPTION_POS, d.caption.pos),
    },
    frame: pick(o.frame, FRAMES, d.frame),
    dark: bool(o.dark, d.dark),
    url: str(o.url, 200, d.url),
    title: str(o.title, 200, d.title),
    code: {
      text: str(code.text, MAX_CODE, d.code.text),
      lang: str(code.lang, 32, d.code.lang),
      theme: pick(code.theme, THEMES, d.code.theme),
      fontSize: int(code.fontSize, 10, 32, d.code.fontSize),
      lineNumbers: bool(code.lineNumbers, d.code.lineNumbers),
      highlight: str(code.highlight, 200, d.code.highlight),
      title: str(code.title, 120, d.code.title),
      bar: bool(code.bar, d.code.bar),
    },
    notes: (Array.isArray(o.notes) ? o.notes.slice(0, MAX_NOTES) : []).map(sanitizeNote).filter((n): n is Note => n !== null),
  };
}

// ---- share URL: JSON -> deflate-raw -> base64url ----

/** Run bytes through a (de)compression stream, giving up once the output passes maxOut bytes (a zip bomb guard). */
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, maxOut = Infinity): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.length;
    if (size > maxOut) {
      await reader.cancel();
      throw new Error('Design too large');
    }
    chunks.push(r.value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export async function encodeDesign(d: Design): Promise<string> {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(d)), new CompressionStream('deflate-raw'));
  let bin = '';
  for (const b of packed) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Returns null for anything that is not a framecraft design (bad base64, bad deflate, bad JSON). */
export async function decodeDesign(s: string): Promise<Design | null> {
  if (s.length > 200_000 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'), 1_000_000));
    return sanitize(JSON.parse(json));
  } catch {
    return null;
  }
}

// ---- templates: the style without the content ----

export type Template = Omit<Design, 'notes' | 'mode' | 'code'> & { code: Omit<Design['code'], 'text' | 'highlight' | 'title'> };

export function toTemplate(d: Design): Template {
  const { notes: _n, mode: _m, code, ...rest } = d;
  const { text: _t, highlight: _h, title: _ti, ...codeStyle } = code;
  return { ...structuredClone(rest), code: { ...codeStyle } };
}

/** Apply a stored template's style over the current design, keeping its content. */
export function applyTemplate(current: Design, t: unknown): Design {
  const o = obj(t);
  const style = sanitize({ ...o, mode: current.mode, notes: current.notes, code: { ...obj(o.code), text: current.code.text, highlight: current.code.highlight, title: current.code.title } });
  return { ...style, url: current.url, title: current.title };
}
