// The picture's turn and mirror as one affine matrix, and the fit of the
// picture inside its frame. Dependency-free so the stage's geometry is tested
// without a canvas. Matrix is canvas order: x' = a*x + c*y + e, y' = b*x + d*y + f.

import type { ImageSize, Pt } from "@/lib/angleMeasure";

export type Affine = { a: number; b: number; c: number; d: number; e: number; f: number };

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function applyAffine(m: Affine, p: Pt): Pt {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** n after m (n applied to m's output). */
export function composeAffine(n: Affine, m: Affine): Affine {
  return {
    a: n.a * m.a + n.c * m.b,
    b: n.b * m.a + n.d * m.b,
    c: n.a * m.c + n.c * m.d,
    d: n.b * m.c + n.d * m.d,
    e: n.a * m.e + n.c * m.f + n.e,
    f: n.b * m.e + n.d * m.f + n.f,
  };
}

/** Whether the matrix swaps width and height (a quarter or three-quarter turn). */
export function swapsAxes(m: Affine): boolean {
  return Math.abs(m.a) < 0.5;
}

/** The size of the picture as displayed. */
export function displaySize(m: Affine, original: ImageSize): ImageSize {
  return swapsAxes(m) ? { width: original.height, height: original.width } : { ...original };
}

/** Turn the displayed picture a quarter clockwise. */
export function turnClockwise(m: Affine, original: ImageSize): Affine {
  const d = displaySize(m, original);
  return composeAffine({ a: 0, b: 1, c: -1, d: 0, e: d.height, f: 0 }, m);
}

/** Flip the displayed picture left to right. */
export function flipAcross(m: Affine, original: ImageSize): Affine {
  const d = displaySize(m, original);
  return composeAffine({ a: -1, b: 0, c: 0, d: 1, e: d.width, f: 0 }, m);
}

/** Where a displayed picture sits in its frame: scale and offset in frame pixels. */
export type View = { scale: number; x: number; y: number };

/** The whole picture, centred, as large as fits. */
export function fitView(picture: ImageSize, frame: ImageSize): View {
  if (!(picture.width > 0) || !(picture.height > 0) || !(frame.width > 0) || !(frame.height > 0)) return { scale: 1, x: 0, y: 0 };
  const scale = Math.min(frame.width / picture.width, frame.height / picture.height);
  return { scale, x: (frame.width - picture.width * scale) / 2, y: (frame.height - picture.height * scale) / 2 };
}

/** Zoom by `factor` keeping the frame point `at` still; the zoom stays between `min` and `max` times the fit. */
export function zoomView(view: View, factor: number, at: Pt, fit: View, limits = { min: 1, max: 8 }): View {
  const target = Math.min(fit.scale * limits.max, Math.max(fit.scale * limits.min, view.scale * factor));
  const k = target / view.scale;
  return { scale: target, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k };
}

export function pictureToFrame(view: View, p: Pt): Pt {
  return { x: p.x * view.scale + view.x, y: p.y * view.scale + view.y };
}

export function frameToPicture(view: View, p: Pt): Pt {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}
