export interface Gradient {
  name: string;
  angle: number;
  stops: string[];
}

export const GRADIENTS: Gradient[] = [
  { name: 'Moss', angle: 135, stops: ['#1f4d40', '#4f8a6c', '#d9c56b'] },
  { name: 'Ember', angle: 135, stops: ['#ff8a4c', '#ff3d6e'] },
  { name: 'Lagoon', angle: 160, stops: ['#0f6e8c', '#36c2b4', '#c7f0d8'] },
  { name: 'Dusk', angle: 135, stops: ['#2b3a67', '#b5577b', '#f6b26b'] },
  { name: 'Citrus', angle: 120, stops: ['#f9e34b', '#4ec58a'] },
  { name: 'Ink', angle: 160, stops: ['#0e1726', '#24365c'] },
  { name: 'Peach', angle: 135, stops: ['#ffd6b0', '#ff9a8b'] },
  { name: 'Glacier', angle: 135, stops: ['#e3f1ff', '#9cc3ff', '#5a7dff'] },
  { name: 'Graphite', angle: 150, stops: ['#3a3f47', '#16191d'] },
  { name: 'Paper', angle: 135, stops: ['#f4f5f0', '#dfe3dc'] },
];

export interface Mesh {
  name: string;
  base: string;
  blobs: string[];
}

export const MESHES: Mesh[] = [
  { name: 'Moss', base: '#1d3d33', blobs: ['#3f7d63', '#d9c56b', '#2a5f7a', '#8fc49a'] },
  { name: 'Aurora', base: '#0f1b3d', blobs: ['#2ad1a3', '#3a6cff', '#b04fd6', '#0d9488'] },
  { name: 'Sorbet', base: '#ffd9c4', blobs: ['#ff8fa3', '#ffd36e', '#8fd3ff', '#ffb38a'] },
  { name: 'Sunset', base: '#3b1d3a', blobs: ['#ff6b4a', '#ffb547', '#c2367a', '#5b2a86'] },
  { name: 'Sea glass', base: '#d7efe8', blobs: ['#7fd1c4', '#a6c8ff', '#e8f7c8', '#4fb3a9'] },
  { name: 'Night', base: '#0b0f17', blobs: ['#1f3b73', '#0f766e', '#3b2a73', '#164e63'] },
];

export interface SizePreset {
  label: string;
  w: number;
  h: number;
}

export const SIZE_PRESETS: Record<string, SizePreset> = {
  auto: { label: 'Fit content', w: 0, h: 0 },
  github: { label: 'GitHub social preview', w: 1280, h: 640 },
  readme: { label: 'README banner', w: 1280, h: 480 },
  x: { label: 'X post', w: 1600, h: 900 },
  linkedin: { label: 'LinkedIn post', w: 1200, h: 627 },
  og: { label: 'Open Graph', w: 1200, h: 630 },
  square: { label: 'Square', w: 1080, h: 1080 },
  custom: { label: 'Custom size', w: 0, h: 0 },
};

export const SHADOW_PRESETS: Record<string, { blur: number; y: number; alpha: number }> = {
  none: { blur: 0, y: 0, alpha: 0 },
  soft: { blur: 24, y: 8, alpha: 0.2 },
  medium: { blur: 48, y: 20, alpha: 0.32 },
  large: { blur: 90, y: 36, alpha: 0.45 },
};

export const NOTE_COLORS = ['#ff4d3d', '#ffb020', '#22c55e', '#3b82f6', '#111111', '#ffffff'];

/** Small deterministic PRNG so a mesh looks the same for everyone who opens the link. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blob centres and radii (relative to the canvas) for a mesh background. */
export function meshBlobs(seed: number, count: number): { x: number; y: number; r: number }[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, i) => ({
    // spread blobs over the four quadrants, then jitter, so a mesh never collapses into one corner
    x: (i % 2) * 0.5 + rnd() * 0.5,
    y: Math.floor(i / 2) * 0.5 + rnd() * 0.5,
    r: 0.55 + rnd() * 0.35,
  }));
}

/** Start and end points of a CSS-style angled gradient across a w x h box. */
export function gradientLine(angleDeg: number, w: number, h: number): [number, number, number, number] {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return [cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half];
}

/** Black or white, whichever reads better on the given colour. */
export function contrastInk(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.179 ? '#111111' : '#ffffff'; // 0.179: where contrast against black and white is equal
}
