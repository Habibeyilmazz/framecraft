import { describe, expect, it } from 'vitest';
import { highlight } from '../src/code';
import { defaultDesign } from '../src/design';
import { codeMetrics } from '../src/layout';
import { buildCodeSvg } from '../src/svg';

function build(mut: (d: ReturnType<typeof defaultDesign>) => void = () => {}) {
  const d = defaultDesign();
  d.code.text = 'const a = "<b>" && 1;\nlet c = 2;';
  d.code.lang = 'javascript';
  mut(d);
  const hl = highlight(d.code.text, d.code.lang);
  const metrics = codeMetrics(hl.lines.map((l) => l.map((t) => t.text).join('')), d.code.fontSize, d.code.lineNumbers, (s) => s.length * 9);
  return buildCodeSvg(d, hl, { metrics });
}

describe('buildCodeSvg', () => {
  it('keeps code as escaped, coloured text', () => {
    const svg = build();
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.replace(/<[^>]+>/g, '')).toContain('const a = &quot;&lt;b&gt;&quot; &amp;&amp; 1;');
    expect(svg).not.toContain('"<b>"');
    expect(svg).toMatch(/<tspan fill="#[0-9a-f]{6}">const<\/tspan>/);
    expect(svg.match(/<text /g)!.length).toBeGreaterThanOrEqual(4); // 2 code lines + 2 line numbers (+ title)
  });

  it('draws the chosen background and shadow', () => {
    expect(build((d) => (d.bg.kind = 'gradient'))).toContain('<linearGradient id="bg"');
    expect(build((d) => (d.bg.kind = 'mesh'))).toContain('<radialGradient id="m0"');
    expect(build((d) => ((d.bg.kind = 'solid'), (d.bg.color = '#123456')))).toContain('fill="#123456"');
    expect(build((d) => (d.shadow = 'none'))).not.toContain('feDropShadow');
    expect(build((d) => (d.shadow = 'large'))).toContain('feDropShadow');
  });

  it('escapes the caption and title', () => {
    const svg = build((d) => {
      d.caption.text = 'a < b';
      d.code.title = '"x" & y';
    });
    expect(svg).toContain('a &lt; b');
    expect(svg).toContain('&quot;x&quot; &amp; y');
  });

  it('marks highlighted lines', () => {
    const on = build((d) => (d.code.highlight = '2'));
    const off = build((d) => (d.code.highlight = ''));
    expect(on.match(/<rect y=/g)!.length).toBe(2);
    expect(off).not.toMatch(/<rect y=/);
  });
});
