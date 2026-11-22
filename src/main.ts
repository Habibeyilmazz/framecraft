import '@fontsource/jetbrains-mono/400.css';
import '@fontsource-variable/instrument-sans';
import './style.css';
import { CODE_THEMES, highlight, LANGUAGES, type Highlighted } from './code';
import { applyTemplate, decodeDesign, defaultDesign, encodeDesign, hitNote, moveNote, sanitize, toTemplate, type Design, type Note, type NoteKind } from './design';
import { layoutCard, layoutScene } from './layout';
import { GRADIENTS, MESHES, NOTE_COLORS, SIZE_PRESETS } from './presets';
import { checkExportSize, contentSize, MONO, render, SANS, toBlob, type Assets, type Img, type Rendered } from './render';
import { codeToSvg } from './svg';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];

let design: Design = defaultDesign();
let shot: Img | undefined;
let bgImage: Img | undefined;
let rendered: Rendered | null = null;
let noteColor = NOTE_COLORS[0];
/** The annotation the keyboard edits: the one last clicked or dragged, else the newest. */
let selected: Note | undefined;
const current = (): Note | undefined => (selected && design.notes.includes(selected) ? selected : design.notes.at(-1));

const canvas = $<HTMLCanvasElement>('#preview');
const wrap = $('#canvas-wrap');

// ---------- state helpers ----------

type Bag = Record<string, unknown>;
const getPath = (path: string): unknown => path.split('.').reduce<unknown>((o, k) => (o as Bag)[k], design);
function setPath(path: string, value: unknown) {
  const keys = path.split('.');
  const last = keys.pop()!;
  (keys.reduce<unknown>((o, k) => (o as Bag)[k], design) as Bag)[last] = value;
}

let hlCache: { key: string; value: Highlighted } | null = null;
function codeHighlight(): Highlighted {
  const key = design.code.lang + '\u0000' + design.code.text;
  if (hlCache?.key !== key) hlCache = { key, value: highlight(design.code.text, design.code.lang) };
  return hlCache.value;
}

const assets = (): Assets => ({ shot, bgImage, code: design.mode === 'code' ? codeHighlight() : undefined });

// ---------- toast ----------

let toastTimer = 0;
function toast(msg: string, error = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), error ? 5000 : 2400);
}

// ---------- building the static option lists ----------

function fillOptions() {
  $<HTMLSelectElement>('#lang').append(
    new Option('Auto-detect', 'auto'),
    ...Object.entries(LANGUAGES).map(([id, l]) => new Option(l.label, id)),
  );
  $<HTMLSelectElement>('#theme').append(...Object.entries(CODE_THEMES).map(([id, t]) => new Option(t.label, id)));
  $<HTMLSelectElement>('#size').append(
    ...Object.entries(SIZE_PRESETS).map(([id, s]) => new Option(s.w ? `${s.label} (${s.w} × ${s.h})` : s.label, id)),
  );
  const swatch = (name: string, value: number, label: string, css: string) => {
    const l = document.createElement('label');
    l.style.background = css;
    l.title = label;
    l.innerHTML = `<input type="radio" name="${name}" value="${value}" data-bind="${name}"><span class="visually-hidden"></span>`;
    l.querySelector('span')!.textContent = label;
    return l;
  };
  $('#gradients').append(
    ...GRADIENTS.map((g, i) => swatch('bg.gradient', i, g.name, `linear-gradient(${g.angle}deg, ${g.stops.join(', ')})`)),
  );
  const spots = ['20% 25%', '80% 20%', '25% 85%', '80% 80%'];
  $('#meshes').append(
    ...MESHES.map((m, i) =>
      swatch('bg.mesh', i, m.name, [...m.blobs.map((c, j) => `radial-gradient(circle at ${spots[j]}, ${c}, transparent 65%)`), m.base].join(', ')),
    ),
  );
  $('#note-colors').append(
    ...NOTE_COLORS.map((c, i) => {
      const l = document.createElement('label');
      l.style.background = c;
      l.innerHTML = `<input type="radio" name="note-color" value="${c}" ${i === 0 ? 'checked' : ''}><span class="visually-hidden">Colour ${c}</span>`;
      return l;
    }),
  );
}

// ---------- design -> controls ----------

function syncControls() {
  for (const el of $$<HTMLInputElement>('[data-bind]')) {
    const v = getPath(el.dataset.bind!);
    if (el.type === 'radio') el.checked = String(v) === el.value;
    else if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el && el.value !== String(v)) el.value = String(v);
  }
  for (const out of $$<HTMLOutputElement>('[data-out]')) {
    const v = getPath(out.dataset.out!) as number;
    out.textContent = 'pct' in out.dataset ? `${Math.round(v * 100)}%` : 'deg' in out.dataset ? `${v}°` : String(v);
  }
  // data-show="path:a,b|path2:c" shows the element when any condition matches
  for (const el of $$('[data-show]')) {
    el.hidden = !el.dataset.show!.split('|').some((cond) => {
      const [path, vals] = cond.split(':');
      return vals.split(',').includes(String(getPath(path)));
    });
  }
  $('#tools').hidden = design.mode !== 'shot' || !shot;
  const svgBtn = $('#export-svg');
  const tilted = !!(design.tiltX || design.tiltY);
  svgBtn.setAttribute('aria-disabled', String(tilted));
  svgBtn.title = tilted ? 'SVG cannot show tilt. Reset tilt to export SVG.' : 'Download as SVG with selectable text';
  $('#detected').textContent = design.mode === 'code' && design.code.lang === 'auto' ? `Detected: ${LANGUAGES[codeHighlight().lang]?.label ?? 'plain text'}` : '';
  $('#replace-shot').textContent = shot ? 'Replace image' : 'Choose image';
  renderNotesList();
}

function renderNotesList() {
  const host = $('#notes-list');
  host.replaceChildren();
  if (design.mode !== 'shot' || !design.notes.length) return;
  const names: Record<NoteKind, string> = { arrow: 'Arrow', box: 'Box', blur: 'Blur', pixel: 'Pixelate', step: 'Step' };
  const head = document.createElement('div');
  head.className = 'notes-head';
  head.innerHTML = `<span>Annotations</span><button type="button" class="link-btn">Remove all</button>`;
  head.querySelector('button')!.onclick = () => commit(() => (design.notes = []));
  const ul = document.createElement('ul');
  design.notes.forEach((n, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<i class="dot"></i><button type="button" class="link-btn note-name"></button><button type="button" class="link-btn">Remove</button>`;
    li.querySelector<HTMLElement>('.dot')!.style.background = n.c;
    const label = n.t === 'step' ? `Step ${n.n}` : `${names[n.t]} ${design.notes.slice(0, i + 1).filter((m) => m.t === n.t).length}`;
    const [pick, remove] = li.querySelectorAll('button');
    pick.textContent = label;
    pick.title = 'Select, then use the arrow keys on the preview';
    pick.setAttribute('aria-pressed', String(n === current()));
    pick.onclick = () => {
      selected = n;
      renderNotesList();
      canvas.focus();
    };
    remove.setAttribute('aria-label', `Remove ${label}`);
    remove.onclick = () => commit(() => design.notes.splice(i, 1));
    ul.append(li);
  });
  host.append(head, ul);
}

// ---------- drawing ----------

let frame = 0;
function scheduleDraw() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(draw);
}

function draw() {
  const a = assets();
  const size = contentSize(design, a);
  $('#empty').hidden = !(design.mode === 'shot' && !shot);
  canvas.hidden = !size;
  if (!size) {
    rendered = null;
    $('#readout').textContent = '';
    return;
  }
  const scene = layoutScene(design, layoutCard(design, size));
  const box = wrap.getBoundingClientRect();
  const f = Math.min(1, (box.width - 56) / scene.W, (box.height - 56) / scene.H);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  rendered = render(design, a, Math.max(0.05, f) * dpr, canvas);
  canvas.style.width = `${Math.round(scene.W * f)}px`;
  canvas.style.height = `${Math.round(scene.H * f)}px`;
  const s = design.scale;
  $('#readout').textContent = `${scene.W} × ${scene.H} · exports at ${s}x as ${scene.W * s} × ${scene.H * s} px`;
}

let urlTimer = 0;
function commit(change?: () => void) {
  change?.();
  syncControls();
  scheduleDraw();
  clearTimeout(urlTimer);
  urlTimer = window.setTimeout(async () => {
    history.replaceState(null, '', `#d=${await encodeDesign(design)}`);
  }, 300);
}

// ---------- controls -> design ----------

function onInput(e: Event) {
  const el = e.target as HTMLInputElement;
  const path = el.dataset.bind;
  if (!path) return;
  const cur = getPath(path);
  let v: unknown = el.value;
  if (el.type === 'checkbox') v = el.checked;
  else if (typeof cur === 'number') v = Number(el.value);
  setPath(path, v);
  commit();
}

// ---------- images ----------

const MAX_BYTES = 40 * 1024 * 1024;
async function loadImage(file: File): Promise<Img | null> {
  if (!file.type.startsWith('image/')) {
    toast(`${file.name || 'That file'} is not an image. Use PNG, JPEG, WebP, GIF or AVIF.`, true);
    return null;
  }
  if (file.size > MAX_BYTES) {
    toast('That image is over 40 MB. Use a smaller file.', true);
    return null;
  }
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width > 12000 || bmp.height > 12000 || bmp.width * bmp.height > 50_000_000) {
      toast('That image is over 12000 px on a side or 50 megapixels. Use a smaller file.', true);
      return null;
    }
    return bmp;
  } catch {
    toast('That file could not be read as an image.', true);
    return null;
  }
}

async function useShot(file: File) {
  const img = await loadImage(file);
  if (!img) return;
  shot = img;
  commit(() => {
    design.mode = 'shot';
    design.notes = [];
  });
}

let pickTarget: 'shot' | 'bg' = 'shot';
const fileInput = $<HTMLInputElement>('#file');
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  if (pickTarget === 'shot') return useShot(file);
  const img = await loadImage(file);
  if (img) {
    bgImage = img;
    commit(() => (design.bg.kind = 'image'));
  }
});

// ---------- annotations ----------

const tool = () => document.querySelector<HTMLInputElement>('input[name="tool"]:checked')?.value ?? '';
let draft: { note: Note; ox: number; oy: number } | null = null;
let drag: { note: Note; orig: Note; sx: number; sy: number } | null = null;

/** The annotation under the pointer, grabbed within about 6 screen px. */
function noteAt(p: [number, number]): Note | undefined {
  if (!rendered) return;
  const { scene, card } = rendered;
  const tol = (6 * scene.W) / canvas.getBoundingClientRect().width / scene.k;
  return design.notes[hitNote(design.notes, p[0], p[1], card.content.w, card.content.h, tol)];
}

function pointerToContent(e: PointerEvent): [number, number] | null {
  if (!rendered) return null;
  const r = canvas.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * rendered.scene.W;
  const y = ((e.clientY - r.top) / r.height) * rendered.scene.H;
  return rendered.toContent(x, y);
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

canvas.addEventListener('pointerdown', (e) => {
  const t = tool() as NoteKind | '';
  if (design.mode !== 'shot' || !shot) return;
  const p = pointerToContent(e);
  if (!p) return;
  if (!t) {
    const note = noteAt(p);
    if (!note) return;
    selected = note;
    drag = { note, orig: { ...note }, sx: p[0], sy: p[1] };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    return renderNotesList();
  }
  if (p[0] < 0 || p[0] > 1 || p[1] < 0 || p[1] > 1) return;
  const [x, y] = p;
  const base: Note = { t, x, y, x2: x, y2: y, w: 0, h: 0, n: 1, c: noteColor };
  if (t === 'step') {
    base.n = design.notes.filter((n) => n.t === 'step').length + 1;
    commit(() => design.notes.push(base));
    return;
  }
  draft = { note: base, ox: x, oy: y };
  design.notes.push(base);
  selected = base;
  canvas.setPointerCapture(e.pointerId);
  e.preventDefault();
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointerToContent(e);
  if (!p) return;
  if (drag) {
    Object.assign(drag.note, drag.orig);
    moveNote(drag.note, p[0] - drag.sx, p[1] - drag.sy, false);
    return scheduleDraw();
  }
  canvas.toggleAttribute('data-grab', !draft && !tool() && design.mode === 'shot' && !!noteAt(p));
  if (!draft) return;
  const [x, y] = [clamp01(p[0]), clamp01(p[1])];
  const n = draft.note;
  if (n.t === 'arrow') {
    n.x2 = x;
    n.y2 = y;
  } else {
    n.x = Math.min(draft.ox, x);
    n.y = Math.min(draft.oy, y);
    n.w = Math.abs(x - draft.ox);
    n.h = Math.abs(y - draft.oy);
  }
  scheduleDraw();
});

function endDraft() {
  if (drag) {
    drag = null;
    commit();
  }
  if (!draft) return;
  const n = draft.note;
  const tiny = n.t === 'arrow' ? Math.hypot(n.x2 - n.x, n.y2 - n.y) < 0.01 : n.w < 0.005 || n.h < 0.005;
  if (tiny) design.notes.splice(design.notes.indexOf(n), 1);
  draft = null;
  commit();
}
canvas.addEventListener('pointerup', endDraft);
canvas.addEventListener('pointercancel', endDraft);

// Keyboard alternative to drawing: Enter adds, arrows move, Alt+arrows resize, Delete removes the selected annotation.
canvas.addEventListener('keydown', (e) => {
  if (design.mode !== 'shot' || !shot) return;
  const t = tool() as NoteKind | '';
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (!t) return toast('Pick a tool first, then press Enter to add it.');
    const n: Note = { t, x: 0.35, y: 0.35, x2: 0.5, y2: 0.5, w: 0.3, h: 0.3, n: 1, c: noteColor };
    if (t === 'step') {
      n.x = n.y = 0.5;
      n.n = design.notes.filter((m) => m.t === 'step').length + 1;
    }
    selected = n;
    commit(() => design.notes.push(n));
    toast('Added. Arrow keys move it, Alt+arrow keys resize it, Delete removes it.');
    return;
  }
  const note = current();
  if (!note) return;
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    return commit(() => design.notes.splice(design.notes.indexOf(note), 1));
  }
  const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!dir[e.key]) return;
  e.preventDefault();
  const step = e.shiftKey ? 0.05 : 0.01;
  const [dx, dy] = dir[e.key].map((v) => v * step);
  commit(() => moveNote(note, dx, dy, e.altKey));
});

function undoNote() {
  if (design.mode === 'shot' && design.notes.length) commit(() => design.notes.pop());
}

// ---------- export ----------

function exportName(ext: string) {
  return `framecraft-${design.mode === 'code' ? 'code' : 'screenshot'}-${design.size}@${design.scale}x.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function renderExport(): HTMLCanvasElement | null {
  try {
    checkExportSize(design, assets(), design.scale);
    const r = render(design, assets(), design.scale);
    if (!r) toast('Add a screenshot first.', true);
    return r?.canvas ?? null;
  } catch (err) {
    toast((err as Error).message, true);
    return null;
  }
}

async function exportPng() {
  const c = renderExport();
  if (!c) return;
  try {
    download(await toBlob(c), exportName('png'));
    toast('PNG downloaded.');
  } catch (err) {
    toast((err as Error).message, true);
  }
}

async function copyImage() {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    toast('This browser cannot copy images. Use Download PNG instead.', true);
    return;
  }
  const c = renderExport();
  if (!c) return;
  try {
    // pass the promise straight in: Safari only allows clipboard writes started inside the click
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(c) })]);
    toast('Image copied. Paste it anywhere.');
  } catch {
    toast('The browser blocked copying. Use Download PNG instead.', true);
  }
}

async function exportSvg() {
  if (design.tiltX || design.tiltY) {
    toast('SVG cannot show tilt. Reset tilt, or download a PNG.', true);
    return;
  }
  const svg = await codeToSvg(design, codeHighlight(), bgImage);
  download(new Blob([svg], { type: 'image/svg+xml' }), exportName('svg'));
  toast('SVG downloaded.');
}

async function copyLink() {
  const url = `${location.origin}${location.pathname}#d=${await encodeDesign(design)}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    toast(design.mode === 'shot' ? 'Link copied. It keeps the design, not the screenshot.' : 'Link copied.');
  } catch {
    toast('The browser blocked copying. Copy the address bar instead.', true);
  }
}

// ---------- templates ----------

const TEMPLATE_KEY = 'framecraft:templates';
type Stored = { name: string; style: unknown };
function readTemplates(): Stored[] {
  try {
    const v = JSON.parse(localStorage.getItem(TEMPLATE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((t) => t && typeof t.name === 'string').slice(0, 100) : [];
  } catch {
    return [];
  }
}
function writeTemplates(list: Stored[]) {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(list));
  } catch {
    toast('This browser is not letting framecraft save templates.', true);
  }
}
function renderTemplates() {
  const ul = $('#templates');
  ul.replaceChildren();
  readTemplates().forEach((t, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span></span><button type="button" class="link-btn" data-act="apply">Apply</button><button type="button" class="link-btn" data-act="del">Delete</button>`;
    li.querySelector('span')!.textContent = t.name;
    li.querySelector<HTMLElement>('[data-act="apply"]')!.setAttribute('aria-label', `Apply ${t.name}`);
    li.querySelector<HTMLElement>('[data-act="del"]')!.setAttribute('aria-label', `Delete ${t.name}`);
    li.onclick = (e) => {
      const act = (e.target as HTMLElement).dataset.act;
      if (act === 'apply') {
        commit(() => (design = applyTemplate(design, t.style)));
        toast(`Applied ${t.name}.`);
      } else if (act === 'del') {
        const list = readTemplates();
        list.splice(i, 1);
        writeTemplates(list);
        renderTemplates();
        toast(`Deleted ${t.name}.`);
      }
    };
    ul.append(li);
  });
}

// ---------- wiring ----------

function wire() {
  document.addEventListener('input', onInput);
  document.addEventListener('change', (e) => {
    const el = e.target as HTMLInputElement;
    if (el.name === 'note-color') noteColor = el.value;
    if (el.name === 'tool') canvas.dataset.tool = el.value;
  });
  $$('[data-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      pickTarget = b.dataset.pick as 'shot' | 'bg';
      fileInput.click();
    }),
  );
  $('#export-png').addEventListener('click', exportPng);
  $('#copy-image').addEventListener('click', copyImage);
  $('#export-svg').addEventListener('click', exportSvg);
  $('#copy-link').addEventListener('click', copyLink);
  $('#undo').addEventListener('click', undoNote);
  $('#shuffle').addEventListener('click', () => commit(() => (design.bg.seed = Math.floor(Math.random() * 1e9))));
  $('#flatten').addEventListener('click', () => commit(() => (design.tiltX = design.tiltY = 0)));
  $('#save-template').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $<HTMLInputElement>('#template-name');
    const name = input.value.trim();
    if (!name) return;
    const list = readTemplates().filter((t) => t.name !== name);
    writeTemplates([...list, { name, style: toTemplate(design) }]);
    input.value = '';
    renderTemplates();
    toast(`Saved ${name}.`);
  });

  document.addEventListener('keydown', (e) => {
    const typing = (e.target as HTMLElement).closest('input[type="text"], textarea, select');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault();
      undoNote();
    }
  });

  document.addEventListener('paste', (e) => {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    useShot(file);
  });

  const stage = $('#stage');
  const hint = $('#drop-hint');
  let depth = 0;
  stage.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    depth++;
    hint.hidden = false;
  });
  stage.addEventListener('dragleave', () => {
    if (--depth <= 0) hint.hidden = true;
  });
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    hint.hidden = true;
    const file = e.dataTransfer?.files[0];
    if (file) useShot(file);
  });

  new ResizeObserver(scheduleDraw).observe(wrap);
}

/** Load the design from the URL hash, if there is one. Our own updates use replaceState, which fires no hashchange. */
async function loadHash() {
  const m = location.hash.match(/^#d=(.+)$/);
  if (!m) return;
  const decoded = await decodeDesign(m[1]);
  if (decoded) design = decoded;
  else toast('That link does not contain a framecraft design. Starting fresh.', true);
}

async function start() {
  fillOptions();
  wire();
  await loadHash();
  window.addEventListener('hashchange', () => loadHash().then(() => commit()));
  design = sanitize(design);
  renderTemplates();
  syncControls();
  draw();
  // canvas text needs the web fonts actually loaded, not just declared
  await Promise.all([document.fonts.load(`400 16px ${MONO}`), document.fonts.load(`600 16px ${SANS}`)]).catch(() => {});
  hlCache = null;
  scheduleDraw();
}

start();
