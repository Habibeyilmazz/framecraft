import { describe, expect, it } from 'vitest';
import { applyTemplate, decodeDesign, defaultDesign, encodeDesign, MAX_CODE, sanitize, toTemplate } from '../src/design';

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
