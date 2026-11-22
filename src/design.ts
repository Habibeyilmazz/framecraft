// The whole design as plain JSON. Everything here goes into the share URL, so
// images never live in it; they are held in memory by main.ts.

export const MODES = ['code', 'shot'] as const;
export const FRAMES = ['none', 'browser', 'mac', 'phone'] as const;
export const BG_KINDS = ['gradient', 'mesh', 'solid', 'image', 'none'] as const;
export const SHADOWS = ['none', 'soft', 'medium', 'large'] as const;
export const SIZES = ['auto', 'github', 'readme', 'x', 'linkedin', 'og', 'square', 'custom'] as const;
export const NOTE_KINDS = ['arrow', 'box', 'blur', 'pixel', 'cover', 'step', 'text'] as const;
export const CAPTION_POS = ['bottom', 'top'] as const;
export const THEMES = ['framecraft', 'one-dark', 'dracula', 'nord', 'github-dark', 'github-light', 'solarized-light'] as const;

export type Frame = (typeof FRAMES)[number];
export type NoteKind = (typeof NOTE_KINDS)[number];

/** Annotation in image-relative coordinates (0..1). Arrows use x,y -> x2,y2; rects and text labels use x,y,w,h; steps use x,y,n. */
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
  /** The words on a text label (text notes only). */
  s?: string;
}

export interface Design {
  v: 1;
  mode: (typeof MODES)[number];
  size: (typeof SIZES)[number];
  /** Output size in px when size is 'custom'. */
  width: number;
  height: number;
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

// it must auto-detect as TypeScript, the language its file name (export.ts) promises (tests/code.test.ts)
export const SAMPLE_CODE = `// Pick a frame, drop a screenshot, ship the launch post.
type Scale = 1 | 2 | 3;

export async function exportImage(design: Design, scale: Scale = 2) {
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
    width: 1280,
    height: 720,
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
      highlight: '5-7',
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

/** The point that resizes an annotation when dragged (what moveNote's resize moves): an arrow's tip, a box's bottom-right corner. Steps have none. */
export function handleOf(n: Note): [number, number] | null {
  if (n.t === 'step') return null;
  return n.t === 'arrow' ? [n.x2, n.y2] : [n.x + n.w, n.y + n.h];
}

/** The highest step number a share link keeps. */
export const MAX_STEP = 99;

/** Number for a new step badge: one past the highest, so deleting a step never leads to a repeat. Callers refuse it past MAX_STEP. */
export const nextStep = (notes: Note[]) => Math.max(0, ...notes.filter((n) => n.t === 'step').map((n) => n.n)) + 1;

export const MAX_NOTES = 200;
/** Each blur or pixelate re-reads up to the whole image, so a link stacking hundreds of them froze the tab. */
export const MAX_REDACTIONS = 30;
const isRedaction = (t: NoteKind) => t === 'blur' || t === 'pixel' || t === 'cover';

/**
 * Why a new annotation of kind t cannot be added, or null if it can. The editor refuses past the limits sanitize
 * enforces, so a reload or share link never drops an annotation (a dropped redaction would show what it covered).
 */
export function noteLimit(notes: Note[], t: NoteKind): string | null {
  if (notes.length >= MAX_NOTES) return `Up to ${MAX_NOTES} annotations. Remove one first.`;
  if (isRedaction(t) && notes.filter((n) => isRedaction(n.t)).length >= MAX_REDACTIONS)
    return `Up to ${MAX_REDACTIONS} blur, pixelate and cover areas. Draw a bigger one instead.`;
  if (t === 'step' && nextStep(notes) > MAX_STEP) return `Steps go up to ${MAX_STEP}.`;
  return null;
}

/** Radius of a step badge on content that is w px wide. */
export const stepRadius = (w: number) => Math.max(10, w * 0.018);

/**
 * Index of the topmost annotation at (x, y) in 0..1 content coordinates, or -1. w and h are the content size in px
 * and tol is the grab distance in the same px, so hits are measured in real distance whatever the aspect ratio.
 */
export function hitNote(notes: Note[], x: number, y: number, w: number, h: number, tol: number): number {
  const px = x * w;
  const py = y * h;
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    if (n.t === 'arrow') {
      const [ax, ay, bx, by] = [n.x * w, n.y * h, n.x2 * w, n.y2 * h];
      const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = len2 ? Math.min(1, Math.max(0, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0;
      if (Math.hypot(px - ax - t * (bx - ax), py - ay - t * (by - ay)) <= tol) return i;
    } else if (n.t === 'step') {
      if (Math.hypot(px - n.x * w, py - n.y * h) <= stepRadius(w) + tol) return i;
    } else {
      const [l, t, r, b] = [n.x * w, n.y * h, (n.x + n.w) * w, (n.y + n.h) * h];
      const near = px >= l - tol && px <= r + tol && py >= t - tol && py <= b + tol;
      // a box is only an outline, so you grab its edge; redactions are solid
      const onEdge = n.t !== 'box' || px <= l + tol || px >= r - tol || py <= t + tol || py >= b - tol;
      if (near && onEdge) return i;
    }
  }
  return -1;
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
export const MAX_LABEL = 80;
/** Limits of a custom output size, in px at 1x (3x of the largest stays under the 16384 px export limit). */
export const MIN_SIDE = 64;
export const MAX_SIDE = 4096;

function sanitizeNote(v: unknown): Note | null {
  const o = obj(v);
  if (!NOTE_KINDS.includes(o.t as NoteKind)) return null;
  const note: Note = {
    t: o.t as NoteKind,
    x: num(o.x, 0, 1, 0),
    y: num(o.y, 0, 1, 0),
    x2: num(o.x2, 0, 1, 0),
    y2: num(o.y2, 0, 1, 0),
    w: num(o.w, 0, 1, 0),
    h: num(o.h, 0, 1, 0),
    n: int(o.n, 1, MAX_STEP, 1),
    c: color(o.c, '#ff4d3d'),
  };
  // labels are one line: control characters (newlines included) become spaces
  if (note.t === 'text') note.s = str(o.s, MAX_LABEL, '').replace(/[\u0000-\u001f\u007f]/g, ' ');
  return note;
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
    width: int(o.width, MIN_SIDE, MAX_SIDE, d.width),
    height: int(o.height, MIN_SIDE, MAX_SIDE, d.height),
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
    notes: sanitizeNotes(o.notes),
  };
}

/** The first MAX_NOTES valid annotations, keeping only the first MAX_REDACTIONS redactions among them. */
function sanitizeNotes(v: unknown): Note[] {
  let redactions = 0;
  return (Array.isArray(v) ? v.slice(0, MAX_NOTES) : [])
    .map(sanitizeNote)
    .filter((n): n is Note => n !== null && (!isRedaction(n.t) || ++redactions <= MAX_REDACTIONS));
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
