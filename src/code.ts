import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import go from 'highlight.js/lib/languages/go';
import ini from 'highlight.js/lib/languages/ini';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import scss from 'highlight.js/lib/languages/scss';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

export const LANGUAGES: Record<string, { label: string; def: Parameters<typeof hljs.registerLanguage>[1] }> = {
  typescript: { label: 'TypeScript', def: typescript },
  javascript: { label: 'JavaScript', def: javascript },
  python: { label: 'Python', def: python },
  go: { label: 'Go', def: go },
  rust: { label: 'Rust', def: rust },
  java: { label: 'Java', def: java },
  kotlin: { label: 'Kotlin', def: kotlin },
  swift: { label: 'Swift', def: swift },
  c: { label: 'C', def: c },
  cpp: { label: 'C++', def: cpp },
  csharp: { label: 'C#', def: csharp },
  ruby: { label: 'Ruby', def: ruby },
  php: { label: 'PHP', def: php },
  bash: { label: 'Shell', def: bash },
  sql: { label: 'SQL', def: sql },
  xml: { label: 'HTML / XML', def: xml },
  css: { label: 'CSS', def: css },
  scss: { label: 'SCSS', def: scss },
  json: { label: 'JSON', def: json },
  yaml: { label: 'YAML', def: yaml },
  ini: { label: 'TOML / INI', def: ini },
  markdown: { label: 'Markdown', def: markdown },
  dockerfile: { label: 'Dockerfile', def: dockerfile },
  diff: { label: 'Diff', def: diff },
};
for (const [id, { def }] of Object.entries(LANGUAGES)) hljs.registerLanguage(id, def);

export type Role = 'fg' | 'comment' | 'keyword' | 'string' | 'number' | 'title' | 'type' | 'attr' | 'variable' | 'meta' | 'add' | 'del';

export interface Theme {
  label: string;
  dark: boolean;
  bg: string;
  bar: string;
  lineNo: string;
  hl: string;
  colors: Record<Role, string>;
}

const t = (label: string, dark: boolean, bg: string, bar: string, lineNo: string, hl: string, c: Omit<Record<Role, string>, 'add' | 'del'> & Partial<Record<'add' | 'del', string>>): Theme => ({
  label,
  dark,
  bg,
  bar,
  lineNo,
  hl,
  colors: { add: c.string, del: c.keyword, ...c },
});

// Palettes follow the published (MIT-licensed) colour schemes they are named after.
export const CODE_THEMES: Record<string, Theme> = {
  framecraft: t('Framecraft', true, '#16241f', '#1d2e28', '#5d7a6e', 'rgba(242,184,75,0.13)', {
    fg: '#e4ece6', comment: '#7f978c', keyword: '#f2b84b', string: '#b5d99c', number: '#f58e6b', title: '#8fd3c1', type: '#e8d36a', attr: '#f2b84b', variable: '#e4ece6', meta: '#9fb8ff',
  }),
  'one-dark': t('One Dark', true, '#282c34', '#21252b', '#5c6370', 'rgba(97,175,239,0.12)', {
    fg: '#abb2bf', comment: '#7f848e', keyword: '#c678dd', string: '#98c379', number: '#d19a66', title: '#61afef', type: '#e5c07b', attr: '#d19a66', variable: '#e06c75', meta: '#56b6c2',
  }),
  dracula: t('Dracula', true, '#282a36', '#21222c', '#6272a4', 'rgba(189,147,249,0.14)', {
    fg: '#f8f8f2', comment: '#6272a4', keyword: '#ff79c6', string: '#f1fa8c', number: '#bd93f9', title: '#50fa7b', type: '#8be9fd', attr: '#50fa7b', variable: '#f8f8f2', meta: '#ffb86c',
  }),
  nord: t('Nord', true, '#2e3440', '#3b4252', '#616e88', 'rgba(136,192,208,0.12)', {
    fg: '#d8dee9', comment: '#7b88a1', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', title: '#88c0d0', type: '#8fbcbb', attr: '#8fbcbb', variable: '#d8dee9', meta: '#5e81ac',
  }),
  'github-dark': t('GitHub Dark', true, '#0d1117', '#161b22', '#6e7681', 'rgba(56,139,253,0.15)', {
    fg: '#e6edf3', comment: '#8b949e', keyword: '#ff7b72', string: '#a5d6ff', number: '#79c0ff', title: '#d2a8ff', type: '#ffa657', attr: '#79c0ff', variable: '#ffa657', meta: '#79c0ff', add: '#7ee787', del: '#ffa198',
  }),
  'github-light': t('GitHub Light', false, '#ffffff', '#f6f8fa', '#8c959f', 'rgba(84,174,255,0.16)', {
    fg: '#1f2328', comment: '#59636e', keyword: '#cf222e', string: '#0a3069', number: '#0550ae', title: '#8250df', type: '#953800', attr: '#0550ae', variable: '#953800', meta: '#0550ae', add: '#116329', del: '#82071e',
  }),
  'solarized-light': t('Solarized Light', false, '#fdf6e3', '#eee8d5', '#93a1a1', 'rgba(181,137,0,0.13)', {
    fg: '#586e75', comment: '#93a1a1', keyword: '#859900', string: '#2aa198', number: '#d33682', title: '#268bd2', type: '#b58900', attr: '#b58900', variable: '#cb4b16', meta: '#6c71c4',
  }),
};

// highlight.js scope (first class, without "hljs-") -> theme role
const SCOPE_ROLE: Record<string, Role> = {
  comment: 'comment', quote: 'comment', doctag: 'keyword',
  keyword: 'keyword', 'selector-tag': 'keyword', literal: 'number', section: 'title',
  string: 'string', regexp: 'string', 'meta-string': 'string', char: 'string',
  number: 'number', symbol: 'number', bullet: 'number',
  title: 'title', function: 'title', 'selector-id': 'title', name: 'keyword', tag: 'fg',
  type: 'type', built_in: 'type', class: 'type', 'selector-class': 'type',
  attr: 'attr', attribute: 'attr', property: 'attr', 'selector-attr': 'attr', 'selector-pseudo': 'attr',
  variable: 'variable', 'template-variable': 'variable', params: 'fg', subst: 'fg',
  meta: 'meta', link: 'string', addition: 'add', deletion: 'del',
};

export interface Token {
  text: string;
  role: Role;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#x27': "'", '#39': "'" };
const unescape = (s: string) => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e: string) => ENTITIES[e]);

/** Turn highlight.js HTML output into lines of coloured tokens. Only <span class> and entities occur in its output. */
export function htmlToLines(html: string): Token[][] {
  const lines: Token[][] = [[]];
  const stack: Role[] = ['fg'];
  const re = /<span class="([^"]*)">|<\/span>|([^<]+)/g;
  for (let m; (m = re.exec(html)); ) {
    if (m[1] !== undefined) {
      const scope = m[1].split(' ')[0].replace(/^hljs-/, '');
      stack.push(SCOPE_ROLE[scope] ?? stack[stack.length - 1]);
    } else if (m[0] === '</span>') {
      if (stack.length > 1) stack.pop();
    } else {
      const role = stack[stack.length - 1];
      unescape(m[2]).split('\n').forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ text: part, role });
      });
    }
  }
  return lines;
}

export interface Highlighted {
  lang: string;
  lines: Token[][];
}

/** Highlight code; lang 'auto' lets highlight.js guess from the registered languages. */
export function highlight(code: string, lang: string): Highlighted {
  const text = code.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').replace(/\s+$/, '');
  if (Object.hasOwn(LANGUAGES, lang)) return { lang, lines: htmlToLines(hljs.highlight(text, { language: lang, ignoreIllegals: true }).value) };
  const res = hljs.highlightAuto(text);
  return { lang: res.language ?? 'plaintext', lines: htmlToLines(res.value) };
}

/** Parse "3, 5-7" into a set of 1-based line numbers. Junk is ignored; ranges are capped to maxLine. */
export function parseLineRanges(spec: string, maxLine: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    let a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    if (a > b) [a, b] = [b, a];
    for (let i = Math.max(1, a); i <= Math.min(b, maxLine); i++) out.add(i);
  }
  return out;
}
