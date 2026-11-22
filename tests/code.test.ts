import { describe, expect, it } from 'vitest';
import { CODE_THEMES, highlight, htmlToLines, parseLineRanges } from '../src/code';

describe('parseLineRanges', () => {
  it('reads single lines and ranges', () => {
    expect([...parseLineRanges('1, 3-5, 9', 20)]).toEqual([1, 3, 4, 5, 9]);
  });
  it('accepts reversed ranges and spaces', () => {
    expect([...parseLineRanges(' 6 - 4 ', 20)]).toEqual([4, 5, 6]);
  });
  it('ignores junk and caps to the line count', () => {
    expect([...parseLineRanges('a, -2, 0, 7-1000000, 3x', 8)]).toEqual([7, 8]);
  });
  it('is empty for an empty spec', () => {
    expect(parseLineRanges('', 10).size).toBe(0);
  });
});

describe('htmlToLines', () => {
  it('splits nested spans into coloured tokens per line and unescapes entities', () => {
    const lines = htmlToLines('<span class="hljs-keyword">const</span> a = <span class="hljs-string">&quot;x&lt;y&quot;\n&amp;</span>;\n');
    expect(lines).toEqual([
      [
        { text: 'const', role: 'keyword' },
        { text: ' a = ', role: 'fg' },
        { text: '"x<y"', role: 'string' },
      ],
      [
        { text: '&', role: 'string' },
        { text: ';', role: 'fg' },
      ],
      [],
    ]);
  });
  it('inherits the parent role for unknown scopes', () => {
    expect(htmlToLines('<span class="hljs-string">a<span class="hljs-whatever">b</span></span>')[0]).toEqual([
      { text: 'a', role: 'string' },
      { text: 'b', role: 'string' },
    ]);
  });
});

describe('highlight', () => {
  it('auto-detects common languages', () => {
    expect(highlight('def add(a, b):\n    return a + b\n\nprint(add(1, 2))', 'auto').lang).toBe('python');
    expect(highlight('package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}', 'auto').lang).toBe('go');
    expect(highlight('{\n  "name": "framecraft",\n  "private": true\n}', 'auto').lang).toBe('json');
  });
  it('keeps every character of the source, with tabs expanded', () => {
    const src = 'fn main() {\n\tlet x = "<&>";\n}';
    const out = highlight(src, 'rust');
    expect(out.lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src.replace('\t', '  '));
  });
  it('falls back to auto for an unknown language id', () => {
    expect(highlight('SELECT * FROM users WHERE id = 1;', 'klingon').lang).toBe('sql');
  });
  it('does not treat inherited object keys as languages', () => {
    for (const lang of ['constructor', 'toString', '__proto__']) expect(() => highlight('let a = 1;', lang)).not.toThrow();
  });
});

describe('themes', () => {
  it('define a colour for every role', () => {
    for (const t of Object.values(CODE_THEMES)) {
      for (const c of Object.values(t.colors)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
