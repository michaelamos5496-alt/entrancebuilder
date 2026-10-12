import { describe, expect, it } from "vitest";
import { readJpegInfo } from "@/domain/imaging/exif";
import { MEDIA_LIMITS, stripJpegMetadata, validatePhotoUpload, validatePreviewUpload } from "../media";
import { parsePlacement } from "../placementSchema";

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
/** Build a small but structurally valid JPEG: SOI, optional APPn segments, SOF0, SOS, scan, EOI. */
function jpeg(w: number, h: number, segments: { marker: number; body: number[] }[] = [], complete = true): Uint8Array {
  const seg = (m: number, body: number[]) => [0xff, m, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
  return new Uint8Array([
    0xff, 0xd8,
    ...segments.flatMap((s) => seg(s.marker, s.body)),
    0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0,
    0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0,
    1, 2, 3, 0xff, 0x00, 4, 5, 6,
    ...(complete ? [0xff, 0xd9] : []),
  ]);
}
const exifBody = [...ascii("Exif"), 0, 0, 0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x25, 0x88, 4, 0, 1, 0, 0, 0, 0xc8, 0, 0, 0, 0, 0, 0, 0]; // has a GPS tag
const png = (w: number, h: number, end = true) => {
  const be = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be(w), ...be(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...(end ? [0, 0, 0, 0, ...ascii("IEND"), 0xae, 0x42, 0x60, 0x82] : [])]);
};

describe("photo upload validation (server side)", () => {
  it("accepts a normal JPEG and reports its real size from the file, not from the client", () => {
    const r = validatePhotoUpload(jpeg(1600, 1200));
    expect(r).toMatchObject({ ok: true, width: 1600, height: 1200 });
  });
  it.each([
    ["empty", new Uint8Array(), "EMPTY"],
    ["plain text named .jpg", new Uint8Array(ascii("hello hello hello")), "BAD_TYPE"],
    ["PNG (only JPEG photos are accepted)", png(1600, 1200), "BAD_TYPE"],
    ["SVG with script", new Uint8Array(ascii("<svg><script>alert(1)</script></svg>")), "BAD_TYPE"],
    ["cut-off JPEG", jpeg(1600, 1200, [], false), "INCOMPLETE"],
    ["too small", jpeg(100, 100), "BAD_SIZE"],
    ["too big (pixels)", jpeg(9000, 6000), "BAD_SIZE"],
  ] as const)("rejects %s", (_n, bytes, code) => {
    const r = validatePhotoUpload(bytes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
  it("rejects oversize files", () => {
    const big = new Uint8Array(MEDIA_LIMITS.photoMaxBytes + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(validatePhotoUpload(big)).toMatchObject({ ok: false, code: "TOO_LARGE" });
  });
  it("removes EXIF/GPS and comments but keeps the image decodable", () => {
    const withMeta = jpeg(800, 600, [{ marker: 0xe1, body: exifBody }, { marker: 0xfe, body: ascii("secret comment") }, { marker: 0xe0, body: ascii("JFIF\0") }, { marker: 0xed, body: ascii("Photoshop") }]);
    expect(readJpegInfo(withMeta)!.hasGps).toBe(true);
    const r = validatePhotoUpload(withMeta);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const text = String.fromCharCode(...r.bytes);
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("secret comment");
    expect(text).not.toContain("Photoshop");
    expect(text).toContain("JFIF"); // harmless header kept
    expect(readJpegInfo(r.bytes)).toMatchObject({ width: 800, height: 600, hasGps: false });
    // the scan data is byte-for-byte identical
    const scan = (b: Uint8Array) => b.slice(b.findIndex((_, i) => b[i] === 0xff && b[i + 1] === 0xda));
    expect(Array.from(scan(r.bytes))).toEqual(Array.from(scan(withMeta)));
  });
  it("keeps colour-critical segments (ICC profile, Adobe)", () => {
    const icc = ascii("ICC_PROFILE\0");
    const out = stripJpegMetadata(jpeg(400, 400, [{ marker: 0xe2, body: icc }, { marker: 0xee, body: ascii("Adobe") }]));
    const t = String.fromCharCode(...out);
    expect(t).toContain("ICC_PROFILE");
    expect(t).toContain("Adobe");
  });
  it("returns malformed input unchanged instead of guessing, and never throws", () => {
    const garbage = new Uint8Array([0xff, 0xd8, 1, 2, 3, 4, 5]);
    expect(stripJpegMetadata(garbage)).toBe(garbage);
    const good = jpeg(300, 300, [{ marker: 0xe1, body: exifBody }]);
    for (let n = 0; n < good.length; n++) expect(() => stripJpegMetadata(good.slice(0, n))).not.toThrow();
  });
});

describe("preview upload validation", () => {
  it("accepts a normal PNG and reads its size from the header", () => {
    expect(validatePreviewUpload(png(640, 480))).toMatchObject({ ok: true, width: 640, height: 480 });
  });
  it.each([
    ["JPEG", jpeg(640, 480), "BAD_TYPE"],
    ["no IEND", png(640, 480, false), "INCOMPLETE"],
    ["too large dimensions", png(5000, 5000), "BAD_SIZE"],
    ["tiny", png(4, 4), "BAD_SIZE"],
    ["empty", new Uint8Array(), "EMPTY"],
  ] as const)("rejects %s", (_n, bytes, code) => {
    const r = validatePreviewUpload(bytes);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
});

describe("placement parsing (untrusted)", () => {
  const good = { quad: [{ x: 0.3, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 0.3, y: 0.8 }], flip: false, perspective: false, matchLighting: true, brightness: 0, shadow: true };
  it("accepts a valid placement", () => expect(parsePlacement(good, 1600, 1200)).toEqual(good));
  it.each([
    ["null", null], ["array", []], ["no quad", { ...good, quad: undefined }], ["3 points", { ...good, quad: good.quad.slice(0, 3) }],
    ["NaN coordinate", { ...good, quad: [{ x: NaN, y: 0 }, ...good.quad.slice(1)] }],
    ["string coordinate", { ...good, quad: [{ x: "0.3", y: 0.2 }, ...good.quad.slice(1)] }],
    ["Infinity", { ...good, quad: [{ x: Infinity, y: 0.2 }, ...good.quad.slice(1)] }],
    ["bow-tie quad", { ...good, quad: [good.quad[0], good.quad[2], good.quad[1], good.quad[3]] }],
    ["collapsed quad", { ...good, quad: good.quad.map(() => ({ x: 0.4, y: 0.4 })) }],
    ["way outside the photo", { ...good, quad: good.quad.map((p) => ({ x: p.x + 5, y: p.y })) }],
    ["flip not boolean", { ...good, flip: "yes" }], ["brightness 500", { ...good, brightness: 500 }], ["brightness NaN", { ...good, brightness: NaN }],
  ])("rejects %s", (_n, v) => expect(parsePlacement(v, 1600, 1200)).toBeNull());
  it("drops unknown fields (no prototype or extra-key smuggling)", () => {
    const r = parsePlacement({ ...good, evil: "x", __proto__: { polluted: true } }, 1600, 1200)!;
    expect(Object.keys(r).sort()).toEqual(["brightness", "flip", "matchLighting", "perspective", "quad", "shadow"]);
  });
});
