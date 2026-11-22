export type Pt = [number, number];
/** A projected corner: screen position plus the homogeneous w the GPU needs for perspective-correct texturing. */
export type ProjPt = { x: number; y: number; w: number };
export type Mat3 = number[]; // row-major, 9 entries

/**
 * Corners (TL, TR, BR, BL) of a w x h card centred at (cx, cy), rotated tiltX degrees around
 * the horizontal axis and tiltY around the vertical axis, seen by a camera at distance d.
 */
export function projectCard(w: number, h: number, cx: number, cy: number, tiltX: number, tiltY: number): ProjPt[] {
  const a = (tiltX * Math.PI) / 180;
  const b = (tiltY * Math.PI) / 180;
  const d = 2.4 * Math.max(w, h);
  const corners: Pt[] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return corners.map(([x, y]) => {
    const x1 = x * Math.cos(b);
    const z1 = -x * Math.sin(b);
    const y2 = y * Math.cos(a) - z1 * Math.sin(a);
    const z2 = y * Math.sin(a) + z1 * Math.cos(a);
    const w2 = (d + z2) / d;
    return { x: cx + x1 / w2, y: cy + y2 / w2, w: w2 };
  });
}

/** Homography mapping the four src points onto the four dst points (solved by Gaussian elimination). */
export function homography(src: Pt[], dst: Pt[]): Mat3 {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const p = A[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Degenerate quad');
    for (let k = col; k < 9; k++) A[col][k] /= p;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  return [...A.map((row) => row[8]), 1];
}

export function applyH(m: Mat3, [x, y]: Pt): Pt {
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

export function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map((v) => v / det);
}
