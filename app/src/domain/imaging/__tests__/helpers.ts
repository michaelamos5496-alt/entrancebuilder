import type { Quad, Raster } from "../types";

export function raster(w: number, h: number, fill: [number, number, number, number] = [0, 0, 0, 0]): Raster {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { width: w, height: h, data };
}
export const px = (r: Raster, x: number, y: number) => Array.from(r.data.slice((y * r.width + x) * 4, (y * r.width + x) * 4 + 4));
export function paint(r: Raster, x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) r.data.set(c, (y * r.width + x) * 4);
}
export const quad = (...p: number[]) => [{ x: p[0], y: p[1] }, { x: p[2], y: p[3] }, { x: p[4], y: p[5] }, { x: p[6], y: p[7] }] as unknown as Quad;
export const near = (a: number[], b: number[], tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
