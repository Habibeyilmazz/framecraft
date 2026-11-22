import { describe, expect, it } from 'vitest';
import { defaultDesign } from '../src/design';
import { codeMetrics, fitText, labelFont, labelSize, layoutCard, layoutScene, shotDisplaySize } from '../src/layout';
import { applyH, homography, invert3, projectCard, type Pt } from '../src/perspective';
import { contrastInk, gradientLine, meshBlobs } from '../src/presets';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);

describe('perspective', () => {
  it('leaves an untilted card where it is', () => {
    const q = projectCard(200, 100, 50, 60, 0, 0);
    expect(q.map((c) => [c.x, c.y, c.w])).toEqual([
      [-50, 10, 1],
      [150, 10, 1],
      [150, 110, 1],
      [-50, 110, 1],
    ]);
  });

  it('turning sideways makes the far edge shorter than the near edge', () => {
    const [tl, tr, br, bl] = projectCard(400, 300, 0, 0, 0, 20);
    const left = bl.y - tl.y;
    const right = br.y - tr.y;
    expect(right).toBeGreaterThan(left);
  });

  it('homography maps the four corners and inverts cleanly', () => {
    const src: Pt[] = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const dst: Pt[] = [[10, 12], [120, 0], [130, 70], [0, 60]];
    const H = homography(src, dst);
    src.forEach((p, i) => {
      const [x, y] = applyH(H, p);
      close(x, dst[i][0]);
      close(y, dst[i][1]);
    });
    const back = applyH(invert3(H), applyH(H, [37, 21]));
    close(back[0], 37);
    close(back[1], 21);
  });

  it('rejects a degenerate quad', () => {
    expect(() => homography([[0, 0], [0, 0], [0, 0], [0, 0]], [[0, 0], [1, 0], [1, 1], [0, 1]])).toThrow();
  });
});

describe('layout', () => {
  it('scales big screenshots down to the display box but never up', () => {
    expect(shotDisplaySize(2800, 1600)).toEqual({ w: 1400, h: 800 });
    expect(shotDisplaySize(1170, 2532)).toEqual({ w: 462, h: 1000 });
    expect(shotDisplaySize(300, 200)).toEqual({ w: 300, h: 200 });
    expect(shotDisplaySize(12000, 1)).toEqual({ w: 1400, h: 1 });
    expect(shotDisplaySize(1, 12000)).toEqual({ w: 1, h: 1000 });
  });

  it('sizes code from the longest line and the line count', () => {
    const m = codeMetrics(['ab', 'abcdef'], 10, false, (s) => s.length * 6);
    expect(m.h).toBe(m.padY * 2 + 2 * m.lh);
    expect(m.w).toBe(Math.max(260, m.padX * 2 + 36));
    const withNumbers = codeMetrics(Array(120).fill('x'.repeat(80)), 10, true, (s) => s.length * 6);
    expect(withNumbers.gutter).toBe(18 + 16);
  });

  it('adds frame chrome around the content', () => {
    const d = defaultDesign();
    d.mode = 'shot';
    d.frame = 'browser';
    const b = layoutCard(d, { w: 1000, h: 600 });
    expect(b.content).toEqual({ x: 0, y: b.bar, w: 1000, h: 600 });
    expect(b.h).toBe(600 + b.bar);
    d.frame = 'phone';
    const p = layoutCard(d, { w: 400, h: 860 });
    expect(p.w).toBe(400 + 2 * p.bezel);
    expect(p.content.x).toBe(p.bezel);
    d.frame = 'none';
    expect(layoutCard(d, { w: 10, h: 20 })).toMatchObject({ w: 10, h: 20, bar: 0 });
  });

  it('fits content plus padding in auto size, and fits the card inside fixed presets', () => {
    const d = defaultDesign();
    d.padding = 50;
    expect(layoutScene(d, { w: 400, h: 300 })).toMatchObject({ W: 500, H: 400, k: 1, cx: 250, cy: 200 });
    d.size = 'github';
    const s = layoutScene(d, { w: 2360, h: 540 });
    expect(s).toMatchObject({ W: 1280, H: 640 });
    close(s.k, 0.5); // width-bound: (1280 - 100) / 2360
  });

  it('leaves room for a caption and shrinks a tilted card to fit', () => {
    const d = defaultDesign();
    d.padding = 40;
    d.caption.text = 'Hello';
    d.caption.size = 20;
    const s = layoutScene(d, { w: 400, h: 300 });
    expect(s.H).toBe(300 + 80 + 42);
    expect(s.captionY).toBeGreaterThan(s.cy + 150);
    d.caption.pos = 'top';
    const top = layoutScene(d, { w: 400, h: 300 });
    expect(top.captionY).toBeLessThan(top.cy - 150);
    d.caption.text = '';
    d.size = 'square';
    const flat = layoutScene(d, { w: 800, h: 800 }).k;
    d.tiltY = 25;
    expect(layoutScene(d, { w: 800, h: 800 }).k).toBeLessThan(flat);
  });
});

describe('text labels', () => {
  it('sizes the pill around the text, and fits text back into any box', () => {
    const w1 = 4; // text 4 em wide
    const size = labelSize(w1, 20);
    expect(size).toEqual({ w: 100, h: 32 }); // half an em each side, 1.6 em tall
    close(labelFont(w1, size.w, size.h), 20);
    // a box that is too narrow shrinks the font to fit the width; a short one to fit the height
    close(labelFont(w1, 50, 32), 10);
    close(labelFont(w1, 1000, 16), 10);
    expect(labelFont(0, 0, 0)).toBe(0);
  });
});

describe('layout edge cases', () => {
  it('keeps the scale positive when padding and caption leave no room', () => {
    const d = defaultDesign();
    d.size = 'readme';
    d.padding = 240;
    d.caption.text = 'Hello';
    d.tiltY = 15;
    const s = layoutScene(d, { w: 400, h: 300 });
    expect(s.k).toBeGreaterThan(0);
    expect(Number.isFinite(s.k)).toBe(true);
  });
});

describe('presets', () => {
  it('runs a 90° gradient left to right across the box', () => {
    const [x1, y1, x2, y2] = gradientLine(90, 200, 100);
    close(x1, 0);
    close(y1, 50);
    close(x2, 200);
    close(y2, 50);
  });
  it('places the same mesh for the same seed', () => {
    expect(meshBlobs(42, 4)).toEqual(meshBlobs(42, 4));
    expect(meshBlobs(42, 4)).not.toEqual(meshBlobs(43, 4));
  });
  it('picks readable ink', () => {
    expect(contrastInk('#ffffff')).toBe('#111111');
    expect(contrastInk('#ffb020')).toBe('#111111');
    expect(contrastInk('#ff4d3d')).toBe('#111111');
    expect(contrastInk('#3b82f6')).toBe('#111111'); // black really is the higher contrast here
    expect(contrastInk('#1d4ed8')).toBe('#ffffff');
    expect(contrastInk('#000000')).toBe('#ffffff');
  });
});

describe('fitText', () => {
  const units = (s: string) => s.length * 5; // a UTF-16 code unit is 5 px wide, so an emoji is 10

  it('leaves text that fits alone', () => {
    expect(fitText('example.com', 100, units)).toBe('example.com');
  });

  it('cuts long text and adds an ellipsis that still fits', () => {
    expect(fitText('abcdefghij', 30, units)).toBe('abcde…');
    expect(fitText('abcdefghij', 1, units)).toBe('a…'); // never empty
  });

  it('never cuts an emoji or a joined emoji sequence in half', () => {
    // 3 rockets and a half fit in 42 px; the half must go
    expect(fitText('🚀'.repeat(10), 42, units)).toBe('🚀🚀🚀…');
    const family = '👩‍👩‍👧';
    expect(fitText(family + family, 50, units)).toBe(family + '…');
  });
});
