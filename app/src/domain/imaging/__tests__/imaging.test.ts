import { describe, expect, it } from "vitest";
import { apply, invert, squareToQuad } from "../homography";
import { defaultQuad, fitRect, isConvexQuad, isRectangle, isUsableQuad, moveCorner, quadAspect, resizeRect, scaleAboutBase, slideInside, toPx, toRectangle } from "../quad";
import { warpOver, quadPoint } from "../warp";
import { estimateLighting, finalLighting } from "../lighting";
import { near, paint, px, quad, raster } from "./helpers";

describe("homography", () => {
  it("maps the unit square corners onto the quad corners", () => {
    const q = quad(10, 20, 110, 30, 100, 150, 5, 140);
    const H = squareToQuad(q)!;
    const corners: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    corners.forEach(([u, v], i) => {
      const p = apply(H, u, v);
      expect(p.x).toBeCloseTo(q[i].x, 9);
      expect(p.y).toBeCloseTo(q[i].y, 9);
    });
  });
  it("inverse round-trips arbitrary points", () => {
    const H = squareToQuad(quad(10, 20, 110, 30, 100, 150, 5, 140))!;
    const I = invert(H)!;
    for (const [u, v] of [[0.3, 0.7], [0.9, 0.1], [0.5, 0.5]]) {
      const p = apply(H, u, v), b = apply(I, p.x, p.y);
      expect(b.x).toBeCloseTo(u, 9);
      expect(b.y).toBeCloseTo(v, 9);
    }
  });
  it("a parallelogram is affine (no perspective terms)", () => {
    const H = squareToQuad(quad(0, 0, 10, 0, 12, 5, 2, 5))!;
    expect(H[6]).toBe(0);
    expect(H[7]).toBe(0);
  });
  it("rejects degenerate quads", () => {
    expect(squareToQuad(quad(0, 0, 10, 0, 20, 0, 30, 0))).toBeNull();
  });
});

describe("quad geometry", () => {
  it("default quad has the door's aspect ratio in photo pixels and stays inside the photo", () => {
    for (const [w, h] of [[3000, 2000], [1000, 2000], [6000, 2000], [1200, 1200]]) {
      const q = defaultQuad(w, h, 0.5);
      expect(quadAspect(toPx(q, w, h))).toBeCloseTo(0.5, 6);
      expect(q.every((p) => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)).toBe(true);
      expect(isUsableQuad(q, w, h)).toBe(true);
    }
  });
  it("a very wide door still fits in a portrait photo", () => {
    const q = defaultQuad(600, 2000, 1.6);
    expect(Math.max(...q.map((p) => p.x))).toBeLessThanOrEqual(1);
  });
  it("detects convex vs concave/self-intersecting/collapsed quads", () => {
    expect(isConvexQuad(quad(0, 0, 10, 0, 10, 10, 0, 10))).toBe(true);
    expect(isConvexQuad(quad(0, 0, 10, 0, 10, 10, 0, 10).slice().reverse() as never)).toBe(false); // counter-clockwise
    expect(isConvexQuad(quad(0, 0, 10, 0, 5, 3, 0, 10))).toBe(false); // concave
    expect(isConvexQuad(quad(0, 0, 10, 10, 10, 0, 0, 10))).toBe(false); // bow-tie
    expect(isConvexQuad(quad(0, 0, 10, 0, 10, 0, 0, 0))).toBe(false); // collapsed
  });
  it("moveCorner refuses moves that would make the quad unusable, accepts valid ones", () => {
    const q = quad(0.3, 0.2, 0.5, 0.2, 0.5, 0.8, 0.3, 0.8);
    const ok = moveCorner(q, 0, { x: 0.28, y: 0.15 }, 1000, 1000);
    expect(ok[0]).toEqual({ x: 0.28, y: 0.15 });
    const folded = moveCorner(q, 0, { x: 0.6, y: 0.9 }, 1000, 1000); // drags TL past BR
    expect(folded).toBe(q);
  });
  it("resizeRect keeps the door aspect and the opposite corner fixed", () => {
    const w = 2000, h = 1500, aspect = 0.45;
    const start = defaultQuad(w, h, aspect);
    const next = resizeRect(start, 0, { x: start[0].x - 0.05, y: start[0].y - 0.08 }, aspect, w, h);
    expect(next[2]).toEqual(start[2]); // bottom-right anchored
    expect(quadAspect(toPx(next, w, h))).toBeCloseTo(aspect, 6);
    expect(isRectangle(next)).toBe(true);
    expect(next[0].x).toBeLessThan(start[0].x);
  });
  it("scaling about the base keeps the bottom centre in place", () => {
    const q = defaultQuad(2000, 1500, 0.5);
    const s = scaleAboutBase(q, 1.5, 2000, 1500);
    expect((s[2].x + s[3].x) / 2).toBeCloseTo((q[2].x + q[3].x) / 2, 9);
    expect(s[2].y).toBeCloseTo(q[2].y, 9);
    expect(s[3].y - s[0].y).toBeCloseTo((q[3].y - q[0].y) * 1.5, 9);
  });
  it("slideInside pulls an out-of-bounds quad back", () => {
    const q = quad(-0.1, 0.2, 0.1, 0.2, 0.1, 0.8, -0.1, 0.8);
    expect(Math.min(...slideInside(q, 0.02).map((p) => p.x))).toBeGreaterThanOrEqual(0.02 - 1e-9);
  });
  it("toRectangle converts a perspective quad to an upright rectangle of similar size", () => {
    const w = 1000, h = 1000;
    const q = quad(0.3, 0.2, 0.55, 0.25, 0.5, 0.8, 0.28, 0.78);
    const r = toRectangle(q, w, h);
    expect(isRectangle(r)).toBe(true);
    expect(quadAspect(toPx(r, w, h))).toBeCloseTo(quadAspect(toPx(q, w, h)), 1);
  });
  it("fitRect fits the door without distortion", () => {
    const narrow = fitRect(0.4, 0.8); // door narrower than doorway -> centred, full height
    expect(narrow.v0).toBe(0);
    expect(narrow.u1 - narrow.u0).toBeCloseTo(0.5, 9);
    expect((narrow.u0 + narrow.u1) / 2).toBeCloseTo(0.5, 9);
    const wide = fitRect(1.2, 0.6); // door wider -> full width, standing on the bottom edge
    expect(wide.v1).toBe(1);
    expect(wide.v1 - wide.v0).toBeCloseTo(0.5, 9);
  });
});

describe("warpOver (perspective compositing)", () => {
  const red: [number, number, number, number] = [255, 0, 0, 255];
  const blue: [number, number, number, number] = [0, 0, 255, 255];

  it("an axis-aligned quad reproduces the source", () => {
    const src = raster(8, 8, red);
    const dst = raster(32, 32, [10, 20, 30, 255]);
    warpOver(dst, src, quad(8, 8, 24, 8, 24, 24, 8, 24));
    expect(px(dst, 16, 16)).toEqual([255, 0, 0, 255]);
    expect(px(dst, 9, 9)).toEqual([255, 0, 0, 255]);
  });

  it("never modifies pixels outside the quad (the photo is preserved)", () => {
    const photo = raster(40, 40, [90, 120, 60, 255]);
    paint(photo, 0, 0, 10, 10, [1, 2, 3, 255]);
    const before = Uint8ClampedArray.from(photo.data);
    warpOver(photo, raster(8, 8, red), quad(15, 12, 30, 14, 28, 34, 14, 32));
    let changedOutside = 0;
    const q = quad(15, 12, 30, 14, 28, 34, 14, 32);
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
      const inside = x >= Math.min(...q.map((p) => p.x)) - 2 && x <= Math.max(...q.map((p) => p.x)) + 2 && y >= 11 && y <= 35;
      if (inside) continue;
      for (let c = 0; c < 4; c++) if (photo.data[(y * 40 + x) * 4 + c] !== before[(y * 40 + x) * 4 + c]) changedOutside++;
    }
    expect(changedOutside).toBe(0);
  });

  it("leaves every pixel outside the quad's actual shape untouched, even inside its bounding box (diamond quad)", () => {
    const photo = raster(80, 80, [90, 120, 60, 255]);
    const before = Uint8ClampedArray.from(photo.data);
    const q = quad(40, 8, 72, 40, 40, 72, 8, 40); // a diamond: its bounding box corners are far outside it
    warpOver(photo, raster(6, 6, red), q);
    const side = (a: { x: number; y: number }, b: { x: number; y: number }, x: number, y: number) => ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    let wrong = 0, painted = 0;
    for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
      const d = Math.min(...[0, 1, 2, 3].map((i) => side(q[i], q[(i + 1) % 4], x + 0.5, y + 0.5))); // >0 inside (clockwise quad)
      const changed = [0, 1, 2, 3].some((c) => photo.data[(y * 80 + x) * 4 + c] !== before[(y * 80 + x) * 4 + c]);
      if (changed) painted++;
      if (d < -1.5 && changed) wrong++;
      if (d > 1.5 && !changed) wrong++;
    }
    expect(wrong).toBe(0);
    expect(painted).toBeGreaterThan(1000);
  });

  it("transparent source pixels leave the photo showing through (glass / cut-outs)", () => {
    const src = raster(8, 8, red);
    paint(src, 2, 2, 6, 6, [0, 0, 0, 0]); // a transparent window
    const dst = raster(32, 32, [0, 255, 0, 255]);
    warpOver(dst, src, quad(0, 0, 32, 0, 32, 32, 0, 32));
    expect(px(dst, 16, 16)).toEqual([0, 255, 0, 255]); // window shows the photo
    expect(px(dst, 2, 2)).toEqual([255, 0, 0, 255]);
  });

  it("semi-transparent source pixels blend with the photo (glass tint)", () => {
    const dst = raster(16, 16, [0, 0, 0, 255]);
    warpOver(dst, raster(4, 4, [200, 200, 200, 128]), quad(0, 0, 16, 0, 16, 16, 0, 16));
    const p = px(dst, 8, 8);
    expect(p[0]).toBeGreaterThan(90);
    expect(p[0]).toBeLessThan(110);
    expect(p[3]).toBe(255);
  });

  it("onto a transparent overlay it keeps colour and alpha", () => {
    const dst = raster(16, 16);
    warpOver(dst, raster(4, 4, [10, 200, 30, 255]), quad(2, 2, 14, 2, 14, 14, 2, 14));
    expect(px(dst, 8, 8)).toEqual([10, 200, 30, 255]);
    expect(px(dst, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("maps source regions to the right places under perspective", () => {
    // left half red, right half blue, drawn into a trapezoid (perspective)
    const src = raster(40, 40, red);
    paint(src, 20, 0, 40, 40, blue);
    const dst = raster(200, 200, [0, 0, 0, 255]);
    const q = quad(60, 20, 140, 40, 150, 170, 40, 190);
    warpOver(dst, src, q);
    for (const [u, v, want] of [[0.25, 0.5, [255, 0, 0, 255]], [0.75, 0.5, [0, 0, 255, 255]], [0.2, 0.2, [255, 0, 0, 255]], [0.8, 0.85, [0, 0, 255, 255]]] as const) {
      const p = quadPoint(q, u, v)!;
      expect(near(px(dst, Math.round(p.x), Math.round(p.y)), [...want], 3), `u=${u} v=${v}`).toBe(true);
    }
    // the seam (u=0.5) lands where perspective says, NOT at the midpoint of the quad's screen width
    const mid = quadPoint(q, 0.5, 0.5)!;
    const left = quadPoint(q, 0, 0.5)!, right = quadPoint(q, 1, 0.5)!;
    expect(Math.abs(mid.x - (left.x + right.x) / 2)).toBeGreaterThan(0.2); // genuinely projective
    expect(near(px(dst, Math.round(mid.x) - 3, Math.round(mid.y)), [255, 0, 0, 255], 3)).toBe(true);
    expect(near(px(dst, Math.round(mid.x) + 3, Math.round(mid.y)), [0, 0, 255, 255], 3)).toBe(true);
  });

  it("flip mirrors the source", () => {
    const src = raster(20, 20, red);
    paint(src, 10, 0, 20, 20, blue);
    const dst = raster(40, 40, [0, 0, 0, 255]);
    warpOver(dst, src, quad(0, 0, 40, 0, 40, 40, 0, 40), { flip: true });
    expect(near(px(dst, 5, 20), [0, 0, 255, 255])).toBe(true);
    expect(near(px(dst, 35, 20), [255, 0, 0, 255])).toBe(true);
  });

  it("fits a narrower door inside the doorway without touching the margins", () => {
    const dst = raster(100, 100, [0, 255, 0, 255]);
    warpOver(dst, raster(4, 8, red), quad(0, 0, 100, 0, 100, 100, 0, 100), { rect: fitRect(0.5, 1) });
    expect(px(dst, 50, 50)).toEqual([255, 0, 0, 255]);
    expect(px(dst, 5, 50)).toEqual([0, 255, 0, 255]); // margin untouched
    expect(px(dst, 95, 50)).toEqual([0, 255, 0, 255]);
  });

  it("applies lighting gain and tint", () => {
    const dst = raster(16, 16, [0, 0, 0, 255]);
    warpOver(dst, raster(4, 4, [100, 100, 100, 255]), quad(0, 0, 16, 0, 16, 16, 0, 16), { gain: 1.5, tint: [1, 1, 0.5] });
    expect(px(dst, 8, 8)).toEqual([150, 150, 75, 255]);
  });

  it("edges are anti-aliased, not jagged (a diagonal edge has intermediate coverage)", () => {
    const dst = raster(60, 60, [0, 0, 0, 255]);
    warpOver(dst, raster(4, 4, [255, 255, 255, 255]), quad(10, 10, 50, 20, 40, 50, 12, 40));
    const values = new Set<number>();
    for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) values.add(dst.data[(y * 60 + x) * 4]);
    expect(values.size).toBeGreaterThan(5);
  });

  it("does nothing, and does not throw, for a degenerate quad or clipped-away quad", () => {
    const dst = raster(10, 10, [5, 5, 5, 255]);
    const before = Uint8ClampedArray.from(dst.data);
    expect(warpOver(dst, raster(4, 4, red), quad(0, 0, 5, 5, 10, 10, 15, 15))).toBe(0);
    expect(warpOver(dst, raster(4, 4, red), quad(100, 100, 120, 100, 120, 120, 100, 120))).toBe(0);
    expect(Array.from(dst.data)).toEqual(Array.from(before));
  });

  it("handles a 1x1 source", () => {
    const dst = raster(10, 10, [0, 0, 0, 255]);
    expect(() => warpOver(dst, raster(1, 1, red), quad(1, 1, 9, 1, 9, 9, 1, 9))).not.toThrow();
    expect(px(dst, 5, 5)).toEqual([255, 0, 0, 255]);
  });
});

describe("lighting estimate", () => {
  const thumb = (c: [number, number, number]) => raster(32, 24, [...c, 255]);
  const q = defaultQuad(32, 24, 0.5);
  it("darkens for dark photos and brightens for bright ones", () => {
    expect(estimateLighting(thumb([30, 30, 30]), q).gain).toBeLessThan(0.85);
    expect(estimateLighting(thumb([235, 235, 235]), q).gain).toBeGreaterThan(1.1);
    expect(estimateLighting(thumb([115, 115, 115]), q).gain).toBeCloseTo(1, 1);
  });
  it("detects a warm cast", () => {
    const t = estimateLighting(thumb([200, 150, 90]), q).tint;
    expect(t[0]).toBeGreaterThan(t[2]);
  });
  it("is bounded (never extreme) and measures only OUTSIDE the doorway", () => {
    const t = thumb([120, 120, 120]);
    paint(t, 10, 8, 22, 22, [0, 0, 0, 255]); // black doorway interior
    const L = estimateLighting(t, quad(10 / 32, 8 / 24, 22 / 32, 8 / 24, 22 / 32, 22 / 24, 10 / 32, 22 / 24));
    expect(L.gain).toBeGreaterThan(0.9); // the black doorway is ignored
    expect(estimateLighting(thumb([0, 0, 0]), q).gain).toBeGreaterThanOrEqual(0.55 + (1 - 0.55) * (1 - 0.6) - 1e-9);
  });
  it("returns neutral when nothing can be measured", () => {
    expect(estimateLighting(raster(1, 1), q).gain).toBe(1);
  });
  it("manual brightness composes with auto and is clamped", () => {
    const auto = { gain: 1.2, tint: [1, 1, 1] as const, ambient: 0.5 };
    expect(finalLighting(auto, true, 0).gain).toBeCloseTo(1.2, 9);
    expect(finalLighting(auto, false, 0).gain).toBe(1);
    expect(finalLighting(auto, true, 100).gain).toBeCloseTo(1.2 * 1.5, 9);
    expect(finalLighting(null, true, -50).gain).toBeCloseTo(0.5, 9);
  });
});
