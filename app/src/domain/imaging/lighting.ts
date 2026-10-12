import { toPx } from "./quad";
import type { Quad, Raster } from "./types";

export interface Lighting {
  /** multiplier for the door's brightness */
  gain: number;
  /** per-channel multiplier (colour temperature) */
  tint: readonly [number, number, number];
  /** mean luminance (0..1) of the area around the doorway; 0.5 if it could not be measured */
  ambient: number;
}

const NEUTRAL: Lighting = { gain: 1, tint: [1, 1, 1], ambient: 0.5 };

/**
 * A simple, honest estimate of how bright/warm the photo is around the doorway.
 * It measures the ring of pixels around the quad (outside it, within 60% of its size) in a small thumbnail,
 * then nudges the door toward that brightness and colour cast. It cannot know where the light comes from,
 * only how much of it there is. Strength is deliberately partial so the door's own colour still reads.
 */
export function estimateLighting(thumb: Raster, quad: Quad, strength = 0.6): Lighting {
  const { width: W, height: H, data } = thumb;
  if (W < 2 || H < 2) return NEUTRAL;
  const q = toPx(quad, W, H);
  const xs = q.map((p) => p.x), ys = q.map((p) => p.y);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const padX = (bx1 - bx0) * 0.6 + 1, padY = (by1 - by0) * 0.6 + 1;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.max(0, Math.floor(by0 - padY)); y <= Math.min(H - 1, Math.ceil(by1 + padY)); y++) {
    for (let x = Math.max(0, Math.floor(bx0 - padX)); x <= Math.min(W - 1, Math.ceil(bx1 + padX)); x++) {
      const inside = x + 0.5 >= bx0 && x + 0.5 <= bx1 && y + 0.5 >= by0 && y + 0.5 <= by1;
      if (inside) continue;
      const i = (y * W + x) * 4;
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  if (n < 4) return NEUTRAL;
  r /= n * 255; g /= n * 255; b /= n * 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // a typical well-lit scene averages ~0.45; map the deviation to a gentle gain
  const raw = Math.min(1.35, Math.max(0.55, lum / 0.45));
  const gain = 1 + (raw - 1) * strength;
  const mean = (r + g + b) / 3 || 1;
  const cast = (ch: number) => 1 + (Math.min(1.25, Math.max(0.8, ch / mean)) - 1) * strength * 0.5;
  return { gain, tint: [cast(r), cast(g), cast(b)], ambient: lum };
}

/** Combine the automatic estimate with the manual brightness slider (-50..+50). */
export function finalLighting(auto: Lighting | null, matchLighting: boolean, brightness: number): { gain: number; tint: readonly [number, number, number] } {
  const base = matchLighting && auto ? auto : NEUTRAL;
  const manual = 1 + Math.min(50, Math.max(-50, brightness)) / 100;
  return { gain: base.gain * manual, tint: base.tint };
}
