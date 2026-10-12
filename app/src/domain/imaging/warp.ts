import { apply, invert, squareToQuad } from "./homography";
import { quadAspect } from "./quad";
import type { Quad, Raster } from "./types";

export interface WarpOptions {
  /** where the source image sits inside the quad's unit square (see `fitRect`) */
  rect?: { u0: number; u1: number; v0: number; v1: number };
  /** mirror the source left-to-right */
  flip?: boolean;
  /** multiply the source colour (lighting match) */
  gain?: number;
  tint?: readonly [number, number, number];
}

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/**
 * Perspective-correct "source over destination" compositing of `src` into `dst`.
 * `quadPx` is where the unit square lands in destination pixels (TL, TR, BR, BL).
 *  - Inverse mapping per destination pixel + bilinear sampling (premultiplied alpha), so transparency,
 *    glass and fine hardware lines are preserved and there are no holes.
 *  - Edges are anti-aliased by coverage (about one pixel wide).
 *  - Only pixels inside the quad are touched; the rest of `dst` is never modified (the photo is preserved).
 * Returns the number of destination pixels written (0 for a degenerate quad).
 */
export function warpOver(dst: Raster, src: Raster, quadPx: Quad, opts: WarpOptions = {}): number {
  const H = squareToQuad(quadPx);
  const inv = H && invert(H);
  if (!inv) return 0;
  const rect = opts.rect ?? { u0: 0, u1: 1, v0: 0, v1: 1 };
  const du = rect.u1 - rect.u0, dv = rect.v1 - rect.v0;
  if (!(du > 0) || !(dv > 0)) return 0;
  const gain = opts.gain ?? 1;
  const tint = opts.tint ?? [1, 1, 1];

  // approximate size of the fitted door in destination pixels, for the edge anti-aliasing width
  const aspect = quadAspect(quadPx);
  const hpx = Math.max(1, Math.hypot(quadPx[0].x - quadPx[3].x, quadPx[0].y - quadPx[3].y) * dv);
  const wpx = Math.max(1, hpx * aspect * (du / dv));

  const xs = quadPx.map((p) => p.x), ys = quadPx.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1), x1 = Math.min(dst.width - 1, Math.ceil(Math.max(...xs)) + 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1), y1 = Math.min(dst.height - 1, Math.ceil(Math.max(...ys)) + 1);

  const sd = src.data, dd = dst.data, sw = src.width, sh = src.height;
  let written = 0;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w = inv[6] * px + inv[7] * py + inv[8];
      if (!(w > 0) && !(w < 0)) continue;
      const u = (inv[0] * px + inv[1] * py + inv[2]) / w;
      const v = (inv[3] * px + inv[4] * py + inv[5]) / w;

      // position inside the fitted door rectangle (0..1)
      let s = (u - rect.u0) / du;
      const t = (v - rect.v0) / dv;
      // coverage: distance to the nearest edge, in destination pixels
      const edge = Math.min(Math.min(s, 1 - s) * wpx, Math.min(t, 1 - t) * hpx);
      if (edge < -0.5) continue;
      const cover = edge >= 0.5 ? 1 : edge + 0.5;

      if (opts.flip) s = 1 - s;
      // bilinear sample (pixel centres at +0.5)
      const fx = Math.min(Math.max(s * sw - 0.5, 0), sw - 1), fy = Math.min(Math.max(t * sh - 0.5, 0), sh - 1);
      const ix = Math.min(Math.floor(fx), sw - 2 < 0 ? 0 : sw - 2), iy = Math.min(Math.floor(fy), sh - 2 < 0 ? 0 : sh - 2);
      const ax = fx - ix, ay = fy - iy;
      const ix1 = Math.min(ix + 1, sw - 1), iy1 = Math.min(iy + 1, sh - 1);
      const i00 = (iy * sw + ix) * 4, i10 = (iy * sw + ix1) * 4, i01 = (iy1 * sw + ix) * 4, i11 = (iy1 * sw + ix1) * 4;
      const w00 = (1 - ax) * (1 - ay), w10 = ax * (1 - ay), w01 = (1 - ax) * ay, w11 = ax * ay;
      const a00 = sd[i00 + 3] / 255, a10 = sd[i10 + 3] / 255, a01 = sd[i01 + 3] / 255, a11 = sd[i11 + 3] / 255;
      const sa = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11; // alpha
      if (sa <= 0) continue;
      // premultiplied interpolation, then un-premultiply
      const pr = sd[i00] * a00 * w00 + sd[i10] * a10 * w10 + sd[i01] * a01 * w01 + sd[i11] * a11 * w11;
      const pg = sd[i00 + 1] * a00 * w00 + sd[i10 + 1] * a10 * w10 + sd[i01 + 1] * a01 * w01 + sd[i11 + 1] * a11 * w11;
      const pb = sd[i00 + 2] * a00 * w00 + sd[i10 + 2] * a10 * w10 + sd[i01 + 2] * a01 * w01 + sd[i11 + 2] * a11 * w11;
      const r = clamp255((pr / sa) * gain * tint[0]);
      const g = clamp255((pg / sa) * gain * tint[1]);
      const b = clamp255((pb / sa) * gain * tint[2]);
      const a = sa * cover;

      // source-over onto (possibly transparent) destination
      const o = (y * dst.width + x) * 4;
      const da = dd[o + 3] / 255;
      const oa = a + da * (1 - a);
      if (oa <= 0) continue;
      dd[o] = (r * a + dd[o] * da * (1 - a)) / oa;
      dd[o + 1] = (g * a + dd[o + 1] * da * (1 - a)) / oa;
      dd[o + 2] = (b * a + dd[o + 2] * da * (1 - a)) / oa;
      dd[o + 3] = oa * 255;
      written++;
    }
  }
  return written;
}

/** Map a point in the unit square of a quad into destination pixels (used by tests and hit-testing). */
export function quadPoint(quadPx: Quad, u: number, v: number) {
  const H = squareToQuad(quadPx);
  return H ? apply(H, u, v) : null;
}
