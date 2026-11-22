import type { Design } from './design';
import { projectCard } from './perspective';
import { SIZE_PRESETS } from './presets';

// All sizes are logical pixels (1x export). Export scale multiplies them at draw time.

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardLayout {
  w: number;
  h: number;
  content: Box;
  bar: number;
  bezel: number;
  radius: number;
}

export interface CodeMetrics {
  w: number;
  h: number;
  fs: number;
  lh: number;
  padX: number;
  padY: number;
  gutter: number;
}

export interface Scene {
  W: number;
  H: number;
  k: number;
  cx: number;
  cy: number;
  captionY: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Screenshots are shown at most 1400x1000 logical px; 2x/3x export brings back retina detail. */
export function shotDisplaySize(iw: number, ih: number): { w: number; h: number } {
  const s = Math.min(1, 1400 / iw, 1000 / ih);
  return { w: Math.max(1, Math.round(iw * s)), h: Math.max(1, Math.round(ih * s)) };
}

export function codeMetrics(lines: string[], fontSize: number, lineNumbers: boolean, measure: (s: string) => number): CodeMetrics {
  const fs = fontSize;
  const lh = Math.round(fs * 1.7);
  const padX = Math.round(fs * 1.9);
  const padY = Math.round(fs * 1.5);
  const gutter = lineNumbers ? measure(String(lines.length)) + fs * 1.6 : 0;
  const textW = Math.max(0, ...lines.map(measure));
  return { w: Math.max(fs * 26, Math.ceil(padX * 2 + gutter + textW)), h: padY * 2 + lines.length * lh, fs, lh, padX, padY, gutter };
}

export function layoutCard(d: Design, content: { w: number; h: number }): CardLayout {
  const { w, h } = content;
  if (d.mode === 'code') {
    const bar = d.code.bar ? Math.round((40 * d.code.fontSize) / 15) : 0;
    return { w, h: h + bar, content: { x: 0, y: bar, w, h }, bar, bezel: 0, radius: d.radius };
  }
  switch (d.frame) {
    case 'mac': {
      const bar = Math.round(clamp(w * 0.03, 28, 48));
      return { w, h: h + bar, content: { x: 0, y: bar, w, h }, bar, bezel: 0, radius: d.radius };
    }
    case 'browser': {
      const bar = Math.round(clamp(w * 0.042, 36, 60));
      return { w, h: h + bar, content: { x: 0, y: bar, w, h }, bar, bezel: 0, radius: d.radius };
    }
    case 'phone': {
      const bezel = Math.round(clamp(w * 0.04, 8, 36));
      const screenR = Math.round(Math.min(w, h) * 0.12);
      return { w: w + bezel * 2, h: h + bezel * 2, content: { x: bezel, y: bezel, w, h }, bar: 0, bezel, radius: screenR + bezel };
    }
    default:
      return { w, h, content: { x: 0, y: 0, w, h }, bar: 0, bezel: 0, radius: d.radius };
  }
}

export function captionBand(d: Design): number {
  return d.caption.text.trim() ? Math.round(d.caption.size * 2.1) : 0;
}

export function layoutScene(d: Design, card: { w: number; h: number }): Scene {
  const p = d.padding;
  const band = captionBand(d);
  const preset = SIZE_PRESETS[d.size];
  const W = preset.w || Math.round(card.w + 2 * p);
  const H = preset.h || Math.round(card.h + 2 * p + band);
  // padding and caption can eat a whole preset; keep at least a sliver so the scale stays positive
  const availW = Math.max(1, W - 2 * p);
  const availH = Math.max(1, H - 2 * p - band);
  let k = preset.w ? Math.min(availW / card.w, availH / card.h) : 1;
  if (d.tiltX || d.tiltY) {
    // shrink so the tilted card still fits the padded area
    const q = projectCard(card.w * k, card.h * k, 0, 0, d.tiltX, d.tiltY);
    const bw = Math.max(...q.map((c) => c.x)) - Math.min(...q.map((c) => c.x));
    const bh = Math.max(...q.map((c) => c.y)) - Math.min(...q.map((c) => c.y));
    k *= Math.min(1, availW / bw, availH / bh);
  }
  const top = d.caption.pos === 'top' ? band : 0;
  const cy = p + top + availH / 2;
  const capLine = d.caption.size * 1.25;
  const captionY = d.caption.pos === 'top' ? p + capLine / 2 : p + availH + band - capLine / 2;
  return { W, H, k, cx: W / 2, cy, captionY };
}
