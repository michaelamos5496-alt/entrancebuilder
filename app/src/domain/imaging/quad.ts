import type { Pt, Quad } from "./types";

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function toPx(q: Quad, w: number, h: number): Quad {
  return q.map((p) => ({ x: p.x * w, y: p.y * h })) as unknown as Quad;
}
export function toNorm(q: Quad, w: number, h: number): Quad {
  return q.map((p) => ({ x: p.x / w, y: p.y / h })) as unknown as Quad;
}

/** Average width ÷ height of a quad, in whatever units its points use. */
export function quadAspect(q: Quad): number {
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2;
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2;
  return h === 0 ? 0 : w / h;
}

/**
 * A quad can be inverted (and the door drawn) only if it is convex with the corners in
 * clockwise order and not collapsed. Concave or self-intersecting quads would fold the door over itself.
 */
export function isConvexQuad(q: Quad, minArea = 1e-9): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const c = cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]);
    if (Math.abs(c) < minArea) return false;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign > 0; // positive in screen coordinates = clockwise from top-left
}

/** Minimum side length in pixels, so the quad cannot be dragged to nothing. */
export function minSidePx(q: Quad, w: number, h: number): number {
  const p = toPx(q, w, h);
  return Math.min(dist(p[0], p[1]), dist(p[1], p[2]), dist(p[2], p[3]), dist(p[3], p[0]));
}

export const MIN_SIDE_PX = 24;

export function isUsableQuad(q: Quad, w: number, h: number): boolean {
  const inside = q.every((p) => p.x >= -0.2 && p.x <= 1.2 && p.y >= -0.2 && p.y <= 1.2);
  return inside && isConvexQuad(toPx(q, w, h), 1) && minSidePx(q, w, h) >= MIN_SIDE_PX;
}

/**
 * The starting doorway: a rectangle with the door's own aspect ratio (in photo pixels),
 * standing on a ground line, horizontally centred.
 */
export function defaultQuad(photoW: number, photoH: number, doorAspect: number, opts: { heightFrac?: number; cx?: number; bottom?: number } = {}): Quad {
  const { cx = 0.5, bottom = 0.82 } = opts;
  let hPx = (opts.heightFrac ?? 0.4) * photoH;
  let wPx = hPx * doorAspect;
  if (wPx > photoW * 0.8) { wPx = photoW * 0.8; hPx = wPx / doorAspect; } // very wide doors in portrait photos
  const hN = hPx / photoH, wN = wPx / photoW;
  const left = cx - wN / 2, top = bottom - hN;
  return [{ x: left, y: top }, { x: left + wN, y: top }, { x: left + wN, y: bottom }, { x: left, y: bottom }];
}

export function translate(q: Quad, dx: number, dy: number): Quad {
  return q.map((p) => ({ x: p.x + dx, y: p.y + dy })) as unknown as Quad;
}

export function centroid(q: Quad): Pt {
  return { x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4, y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4 };
}

/** Scale about the bottom-centre (the door stays standing on the same spot). Works in pixel space to avoid aspect skew. */
export function scaleAboutBase(q: Quad, factor: number, w: number, h: number): Quad {
  const px = toPx(q, w, h);
  const base = { x: (px[2].x + px[3].x) / 2, y: (px[2].y + px[3].y) / 2 };
  return toNorm(px.map((p) => ({ x: base.x + (p.x - base.x) * factor, y: base.y + (p.y - base.y) * factor })) as unknown as Quad, w, h);
}

/** Keep a translated quad inside the photo (with a margin) by sliding it back. */
export function slideInside(q: Quad, margin = 0.02): Quad {
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  let dx = 0, dy = 0;
  if (Math.min(...xs) < margin) dx = margin - Math.min(...xs);
  if (Math.max(...xs) > 1 - margin) dx = 1 - margin - Math.max(...xs);
  if (Math.min(...ys) < margin) dy = margin - Math.min(...ys);
  if (Math.max(...ys) > 1 - margin) dy = 1 - margin - Math.max(...ys);
  return dx || dy ? translate(q, dx, dy) : q;
}

/** Free perspective move of one corner. Returns the same quad if the result would be unusable. */
export function moveCorner(q: Quad, i: number, to: Pt, w: number, h: number): Quad {
  const next = q.map((p, k) => (k === i ? { x: clamp(to.x, 0, 1), y: clamp(to.y, 0, 1) } : p)) as unknown as Quad;
  return isUsableQuad(next, w, h) ? next : q;
}

/**
 * Rectangle resize: the corner opposite to `i` stays fixed and the door keeps `aspect` (width ÷ height, in pixels).
 * Assumes `q` is an axis-aligned rectangle (perspective mode off).
 */
export function resizeRect(q: Quad, i: number, to: Pt, aspect: number, w: number, h: number): Quad {
  const px = toPx(q, w, h);
  const o = px[(i + 2) % 4];
  const dx = to.x * w - o.x, dy = to.y * h - o.y;
  const sx = dx >= 0 ? 1 : -1, sy = dy >= 0 ? 1 : -1;
  // choose the larger of the two implied sizes so the corner follows the pointer along the dominant axis
  const width = Math.max(Math.abs(dx), Math.abs(dy) * aspect, MIN_SIDE_PX);
  const height = width / aspect;
  const x2 = o.x + sx * width, y2 = o.y + sy * height;
  const xs = [Math.min(o.x, x2), Math.max(o.x, x2)], ys = [Math.min(o.y, y2), Math.max(o.y, y2)];
  const rect: Quad = toNorm([
    { x: xs[0], y: ys[0] }, { x: xs[1], y: ys[0] }, { x: xs[1], y: ys[1] }, { x: xs[0], y: ys[1] },
  ] as unknown as Quad, w, h);
  return isUsableQuad(rect, w, h) ? rect : q;
}

/** Replace a perspective quad by the axis-aligned rectangle with the same centre and average size. */
export function toRectangle(q: Quad, w: number, h: number): Quad {
  const p = toPx(q, w, h);
  const wPx = (dist(p[0], p[1]) + dist(p[3], p[2])) / 2;
  const hPx = (dist(p[0], p[3]) + dist(p[1], p[2])) / 2;
  const cx = (p[0].x + p[1].x + p[2].x + p[3].x) / 4, bottom = Math.max(p[2].y, p[3].y);
  const l = cx - wPx / 2, t = bottom - hPx;
  return toNorm([{ x: l, y: t }, { x: l + wPx, y: t }, { x: l + wPx, y: bottom }, { x: l, y: bottom }] as unknown as Quad, w, h);
}

export function isRectangle(q: Quad, tol = 1e-6): boolean {
  return Math.abs(q[0].y - q[1].y) < tol && Math.abs(q[2].y - q[3].y) < tol && Math.abs(q[0].x - q[3].x) < tol && Math.abs(q[1].x - q[2].x) < tol;
}

/**
 * Where the door sits inside the doorway, in the quad's own (u,v) unit square. The door is fitted
 * without distortion: centred, standing on the bottom edge, as large as the doorway allows.
 * `quadAspectPx` and `doorAspect` are both width ÷ height.
 */
export function fitRect(doorAspect: number, quadAspectPx: number): { u0: number; u1: number; v0: number; v1: number } {
  if (!(doorAspect > 0) || !(quadAspectPx > 0)) return { u0: 0, u1: 1, v0: 0, v1: 1 };
  if (doorAspect <= quadAspectPx) {
    const w = doorAspect / quadAspectPx;
    return { u0: (1 - w) / 2, u1: (1 + w) / 2, v0: 0, v1: 1 };
  }
  const h = quadAspectPx / doorAspect;
  return { u0: 0, u1: 1, v0: 1 - h, v1: 1 };
}
