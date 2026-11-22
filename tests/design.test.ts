import { describe, expect, it } from 'vitest';
import { applyTemplate, decodeDesign, defaultDesign, encodeDesign, handleOf, hitNote, MAX_CODE, MAX_LABEL, moveNote, nextStep, sanitize, toTemplate, type Note } from '../src/design';

describe('sanitize', () => {
  it('returns defaults for junk', () => {
    expect(sanitize(null)).toEqual(defaultDesign());
    expect(sanitize('x')).toEqual(defaultDesign());
    expect(sanitize([1, 2])).toEqual(defaultDesign());
  });

  it('clamps numbers, rejects bad enums, colours and types', () => {
    const d = sanitize({
      padding: 9999,
      radius: -5,
      tiltX: Number.NaN,
      scale: 2.6,
      mode: 'video',
      shadow: 'large',
      bg: { color: 'red', noise: 3, kind: 'mesh' },
      caption: { text: 42, color: '#ABCDEF' },
      code: { lineNumbers: 'yes', fontSize: 100 },
    });
    expect(d.padding).toBe(240);
    expect(d.radius).toBe(0);
    expect(d.tiltX).toBe(0);
    expect(d.scale).toBe(3);
    expect(d.mode).toBe('code');
    expect(d.shadow).toBe('large');
    expect(d.bg.color).toBe(defaultDesign().bg.color);
    expect(d.bg.noise).toBe(1);
    expect(d.caption.text).toBe('');
    expect(d.caption.color).toBe('#abcdef');
    expect(d.code.lineNumbers).toBe(true);
    expect(d.code.fontSize).toBe(32);
  });

  it('truncates long strings and drops invalid notes', () => {
    const d = sanitize({
      code: { text: 'a'.repeat(MAX_CODE + 50) },
      notes: [{ t: 'arrow', x: 2, y: -1, x2: 0.5, y2: 0.5, c: '#00ff00' }, { t: 'laser' }, 'nope', { t: 'step', n: 500 }],
    });
    expect(d.code.text).toHaveLength(MAX_CODE);
    expect(d.notes).toHaveLength(2);
    expect(d.notes[0]).toMatchObject({ t: 'arrow', x: 1, y: 0, x2: 0.5, c: '#00ff00' });
    expect(d.notes[1]).toMatchObject({ t: 'step', n: 99 });
  });

  it('keeps solid cover redactions from a shared link, with a valid colour', () => {
    const [n] = sanitize({ notes: [{ t: 'cover', x: 0.2, y: 0.3, w: 0.4, h: 0.1, c: 'url(javascript:x)' }] }).notes;
    expect(n).toMatchObject({ t: 'cover', x: 0.2, y: 0.3, w: 0.4, h: 0.1, c: '#ff4d3d' });
  });

  it('keeps a text label on one line and within the length cap', () => {
    const [label, box] = sanitize({
      notes: [
        { t: 'text', x: 0.1, y: 0.2, w: 0.3, h: 0.05, s: 'Ship\nit\u0000' + 'x'.repeat(200) },
        { t: 'box', s: 'ignored' },
      ],
    }).notes;
    expect(label.s).toHaveLength(MAX_LABEL);
    expect(label.s!.startsWith('Ship it ')).toBe(true);
    expect(box.s).toBeUndefined();
    expect(sanitize({ notes: [{ t: 'text', s: 42 }] }).notes[0].s).toBe('');
  });

  it('does not keep unknown keys', () => {
    const d = sanitize({ evil: '<script>', bg: { onload: 1 } }) as unknown as Record<string, unknown>;
    expect(d.evil).toBeUndefined();
    expect((d.bg as Record<string, unknown>).onload).toBeUndefined();
  });
});

describe('share URL encoding', () => {
  it('round-trips a design', async () => {
    const d = defaultDesign();
    d.mode = 'shot';
    d.caption.text = 'Ünïcode & <angle> "quotes" 🚀';
    d.notes.push({ t: 'box', x: 0.1, y: 0.2, x2: 0, y2: 0, w: 0.3, h: 0.4, n: 1, c: '#3b82f6' });
    const s = await encodeDesign(d);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeDesign(s)).toEqual(d);
  });

  it('compresses the default design to a short link', async () => {
    expect((await encodeDesign(defaultDesign())).length).toBeLessThan(800);
  });

  it('returns null for anything that is not a design', async () => {
    expect(await decodeDesign('')).toBeNull();
    expect(await decodeDesign('not base64!')).toBeNull();
    expect(await decodeDesign('AAAA')).toBeNull();
    expect(await decodeDesign('a'.repeat(300_000))).toBeNull();
  });

  it('refuses a small link that inflates to a huge payload', async () => {
    const bomb = new Uint8Array(await new Response(
      new Blob([new Uint8Array(20_000_000).fill(32)]).stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).arrayBuffer());
    let bin = '';
    for (const b of bomb) bin += String.fromCharCode(b);
    const s = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(s.length).toBeLessThan(200_000);
    expect(await decodeDesign(s)).toBeNull();
  });
});

describe('templates', () => {
  it('carry style but not content', () => {
    const src = defaultDesign();
    src.padding = 20;
    src.code.theme = 'nord';
    src.code.text = 'secret code';
    src.notes.push({ t: 'step', x: 0.5, y: 0.5, x2: 0, y2: 0, w: 0, h: 0, n: 1, c: '#ff4d3d' });
    const t = JSON.parse(JSON.stringify(toTemplate(src)));
    expect(JSON.stringify(t)).not.toContain('secret code');
    expect(t.notes).toBeUndefined();

    const cur = defaultDesign();
    cur.mode = 'shot';
    cur.code.text = 'mine';
    cur.url = 'my.site';
    const out = applyTemplate(cur, t);
    expect(out.padding).toBe(20);
    expect(out.code.theme).toBe('nord');
    expect(out.code.text).toBe('mine');
    expect(out.mode).toBe('shot');
    expect(out.url).toBe('my.site');
  });

  it('survive a tampered template', () => {
    const out = applyTemplate(defaultDesign(), { padding: 'lots', bg: 5, code: null });
    expect(out.padding).toBe(defaultDesign().padding);
  });
});

describe('moveNote', () => {
  const note = (t: Note['t'], o: Partial<Note> = {}): Note => ({ t, x: 0.4, y: 0.4, x2: 0.6, y2: 0.6, w: 0.2, h: 0.2, n: 1, c: '#ff4d3d', ...o });

  it('moves a box but keeps it inside the image', () => {
    const n = note('box');
    moveNote(n, 0.1, 0, false);
    expect(n.x).toBeCloseTo(0.5);
    moveNote(n, 1, 1, false);
    expect([n.x, n.y]).toEqual([0.8, 0.8]);
    expect([n.w, n.h]).toEqual([0.2, 0.2]);
  });

  it('resizes a box without letting it collapse or overflow', () => {
    const n = note('pixel');
    moveNote(n, -1, -1, true);
    expect([n.w, n.h]).toEqual([0.01, 0.01]);
    moveNote(n, 5, 5, true);
    expect([n.w, n.h]).toEqual([0.6, 0.6]);
  });

  it('puts the resize handle on the point that resizing moves', () => {
    for (const t of ['arrow', 'box', 'blur', 'pixel', 'cover'] as const) {
      const n = note(t);
      const [hx, hy] = handleOf(n)!;
      moveNote(n, 0.05, 0.1, true);
      expect(handleOf(n)).toEqual([expect.closeTo(hx + 0.05), expect.closeTo(hy + 0.1)]);
    }
    expect(handleOf(note('step'))).toBeNull();
  });

  it('moves a whole arrow, or only its tip when resizing', () => {
    const a = note('arrow');
    moveNote(a, 0.1, 0, false);
    expect([a.x, a.x2]).toEqual([0.5, 0.7]);
    moveNote(a, 0, 0.1, true);
    expect([a.y, a.y2]).toEqual([0.4, 0.7]);
  });

  it('moves a step badge', () => {
    const s = note('step');
    moveNote(s, -1, 0.05, false);
    expect([s.x, s.y]).toEqual([0, 0.45]);
  });
});

describe('hitNote', () => {
  const note = (o: Partial<Note>): Note => ({ t: 'box', x: 0, y: 0, x2: 0, y2: 0, w: 0, h: 0, n: 1, c: '#ff4d3d', ...o });
  // content 1000 x 500 px, grab distance 6 px
  const hit = (notes: Note[], x: number, y: number) => hitNote(notes, x / 1000, y / 500, 1000, 500, 6);

  it('grabs a box by its outline but not its middle', () => {
    const box = note({ x: 0.1, y: 0.1, w: 0.4, h: 0.4 }); // 100..500 x 50..250 px
    expect(hit([box], 104, 150)).toBe(0);
    expect(hit([box], 300, 245)).toBe(0);
    expect(hit([box], 300, 150)).toBe(-1);
    expect(hit([box], 300, 270)).toBe(-1);
  });

  it('grabs redactions anywhere inside', () => {
    expect(hit([note({ t: 'pixel', x: 0.1, y: 0.1, w: 0.4, h: 0.4 })], 300, 150)).toBe(0);
    expect(hit([note({ t: 'cover', x: 0.1, y: 0.1, w: 0.4, h: 0.4 })], 300, 150)).toBe(0);
  });

  it('measures arrows in real pixels, whatever the aspect ratio', () => {
    const arrow = note({ t: 'arrow', x: 0.1, y: 0.5, x2: 0.9, y2: 0.5 }); // 100..900 px along y = 250
    expect(hit([arrow], 500, 255)).toBe(0);
    expect(hit([arrow], 500, 260)).toBe(-1);
    expect(hit([arrow], 905, 250)).toBe(0);
    expect(hit([arrow], 920, 250)).toBe(-1);
  });

  it('grabs a step badge within its radius', () => {
    const step = note({ t: 'step', x: 0.5, y: 0.5 }); // radius 18 px at 1000 px wide
    expect(hit([step], 500 + 20, 250)).toBe(0);
    expect(hit([step], 500 + 30, 250)).toBe(-1);
  });

  it('grabs a text label anywhere inside, and resizes it from its corner', () => {
    const label = note({ t: 'text', x: 0.1, y: 0.1, w: 0.2, h: 0.1 });
    expect(hit([label], 200, 75)).toBe(0);
    const [hx, hy] = handleOf(label)!;
    expect(hx).toBeCloseTo(0.3);
    expect(hy).toBeCloseTo(0.2);
  });

  it('returns the topmost of overlapping annotations', () => {
    const a = note({ t: 'blur', x: 0, y: 0, w: 1, h: 1 });
    const b = note({ t: 'pixel', x: 0, y: 0, w: 1, h: 1 });
    expect(hit([a, b], 500, 250)).toBe(1);
    expect(hit([], 500, 250)).toBe(-1);
  });
});

describe('nextStep', () => {
  const step = (n: number): Note => ({ t: 'step', x: 0, y: 0, x2: 0, y2: 0, w: 0, h: 0, n, c: '#ff4d3d' });

  it('numbers past the highest step, so deleting one never makes a duplicate', () => {
    expect(nextStep([])).toBe(1);
    expect(nextStep([step(1), step(2)])).toBe(3);
    expect(nextStep([step(1), step(3)])).toBe(4); // step 2 was deleted
    expect(nextStep([step(3), { ...step(7), t: 'box' }])).toBe(4); // other annotations do not count
  });

  it('stops at 99, the most a share link keeps', () => {
    expect(nextStep([step(99)])).toBe(99);
  });
});
