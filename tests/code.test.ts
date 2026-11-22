import { describe, expect, it } from 'vitest';
import { CODE_THEMES, DETECT_SAMPLE, highlight, htmlToLines, lineMarks, markStyle, MAX_HIGHLIGHT_LINE, parseLineRanges } from '../src/code';
import { defaultDesign, MAX_CODE } from '../src/design';

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

describe('lineMarks', () => {
  it('marks highlighted, added and removed lines; removed wins, then added', () => {
    const m = lineMarks({ highlight: '1-4', added: '3-4', removed: '4, 9' }, 6);
    expect([...m].sort(([a], [b]) => a - b)).toEqual([[1, 'hl'], [2, 'hl'], [3, 'add'], [4, 'del']]);
  });
  it('gives added and removed lines a tint of the theme colour, an edge and a sign', () => {
    const th = CODE_THEMES['github-dark'];
    expect(markStyle(th, 'add')).toEqual({ fill: 'rgba(126,231,135,0.16)', edge: '#7ee787', sign: '+' });
    expect(markStyle(th, 'del').sign).toBe('\u2212');
    expect(markStyle(CODE_THEMES['github-light'], 'add').fill).toBe('rgba(17,99,41,0.12)');
    expect(markStyle(th, 'hl')).toEqual({ fill: th.hl, edge: th.colors.keyword, sign: '' });
  });
  it('every theme has hex add and del colours', () => {
    for (const th of Object.values(CODE_THEMES)) for (const k of ['add', 'del'] as const) expect(th.colors[k]).toMatch(/^#[0-9a-f]{6}$/);
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
  it('detects the sample the app opens with as TypeScript, as its file name says', () => {
    const d = defaultDesign();
    expect(d.code.title).toBe('export.ts');
    expect(highlight(d.code.text, 'auto').lang).toBe('typescript');
  });
  it('keeps every character of the source, with tabs expanded', () => {
    const src = 'fn main() {\n\tlet x = "<&>";\n}';
    const out = highlight(src, 'rust');
    expect(out.lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src.replace('\t', '  '));
  });
  it('falls back to auto for an unknown language id', () => {
    expect(highlight('SELECT * FROM users WHERE id = 1;', 'klingon').lang).toBe('sql');
  });
  it('detects a long snippet from its start and still highlights all of it', () => {
    const py = 'def add(a, b):\n    return a + b\n\n';
    const src = py.repeat(Math.ceil((DETECT_SAMPLE * 3) / py.length)).trimEnd();
    const out = highlight(src, 'auto');
    expect(out.lang).toBe('python');
    expect(out.lines.length).toBe(src.split('\n').length);
    expect(out.lines.at(-1)!.some((t) => t.role === 'keyword')).toBe(true); // past the sample, still coloured
  });
  it('keeps a long snippet with no detectable language as plain lines', () => {
    const src = 'zz\n\n'.repeat(DETECT_SAMPLE);
    const out = highlight(src, 'auto');
    expect(out.lang).toBe('plaintext');
    expect(out.lines.map((l) => l.map((t) => t.text).join('')).join('\n')).toBe(src.trimEnd());
  });
  it('leaves text with a very long line plain instead of hanging on it', () => {
    // a share link can carry one 20 000-character line in a chosen language; highlight.js took 2.4 s on it
    const src = 'int a = 1;\n' + '$'.repeat(20_000);
    const start = performance.now();
    const out = highlight(src, 'java');
    expect(performance.now() - start).toBeLessThan(500);
    expect(out.lang).toBe('java');
    expect(out.lines).toEqual([[{ text: 'int a = 1;', role: 'fg' }], [{ text: '$'.repeat(20_000), role: 'fg' }]]);
    expect(highlight('1e'.repeat(5000), 'auto').lang).toBe('plaintext');
    // a line at the limit is still coloured
    expect(highlight('int a = 1; // ' + 'x'.repeat(MAX_HIGHLIGHT_LINE - 14), 'java').lines[0].some((t) => t.role !== 'fg')).toBe(true);
  });
  it('stays fast on a long run of whitespace inside the text (a share link can carry one)', () => {
    // trimming trailing space with /\s+$/ took 300 ms here and grows with the square of the run
    const code = 'a' + ' \n'.repeat((MAX_CODE - 2) / 2) + 'a';
    const start = performance.now();
    const { lines } = highlight(code, 'plaintext');
    expect(performance.now() - start).toBeLessThan(100);
    expect(lines.length).toBe(MAX_CODE / 2);
    expect(highlight('x = 1  \n \t\n\n', 'python').lines.length).toBe(1); // trailing blank lines still go
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
