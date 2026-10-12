import { describe, expect, it } from "vitest";
import { orientationTransform, readJpegInfo } from "../exif";
import { IMAGE_LIMITS, UploadError, fitWithin, isCompleteImage, sniffImage, validateDimensions, validateFileHead } from "../validate";

const bytes = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const WEBP = bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), ...ascii("VP8 "));
const HEIC = bytes(0, 0, 0, 24, ...ascii("ftypheic"), 0, 0, 0, 0);

describe("file validation", () => {
  it("identifies images by content, ignoring the name", () => {
    expect(sniffImage(JPEG)).toBe("jpeg");
    expect(sniffImage(PNG)).toBe("png");
    expect(sniffImage(WEBP)).toBe("webp");
    expect(sniffImage(HEIC)).toBe("heic");
    expect(sniffImage(bytes(...ascii("<svg xmlns")))).toBeNull();
    expect(sniffImage(bytes(...ascii("GIF89a")))).toBeNull();
    expect(sniffImage(bytes(...ascii("%PDF-1.7")))).toBeNull();
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
  it("accepts JPEG, PNG and WebP regardless of extension", () => {
    expect(validateFileHead({ size: 1000, name: "photo.png" }, JPEG)).toBe("jpeg");
    expect(validateFileHead({ size: 1000, name: "photo" }, PNG)).toBe("png");
    expect(validateFileHead({ size: 1000, name: "x.jpg" }, WEBP)).toBe("webp");
  });
  it.each([
    [{ size: 0, name: "a.jpg" }, JPEG, "EMPTY"],
    [{ size: IMAGE_LIMITS.maxBytes + 1, name: "a.jpg" }, JPEG, "TOO_LARGE"],
    [{ size: 100, name: "evil.jpg" }, bytes(...ascii("<script>alert(1)</script>")), "UNSUPPORTED"],
    [{ size: 100, name: "vector.svg" }, bytes(...ascii("<svg")), "UNSUPPORTED"],
    [{ size: 100, name: "iphone.heic" }, HEIC, "HEIC"],
  ] as const)("rejects %j with %s", (file, head, code) => {
    try {
      validateFileHead(file, head);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UploadError);
      expect((e as UploadError).code).toBe(code);
      expect((e as UploadError).message.length).toBeGreaterThan(10);
    }
  });
  it("checks decoded dimensions", () => {
    expect(() => validateDimensions(4000, 3000)).not.toThrow();
    expect(() => validateDimensions(100, 3000)).toThrow(UploadError);
    expect(() => validateDimensions(20000, 20000)).toThrow(UploadError);
  });
  it("downscales large photos without upscaling small ones, keeping aspect", () => {
    expect(fitWithin(9000, 6000, 3000)).toEqual({ width: 3000, height: 2000, scale: 1 / 3 });
    expect(fitWithin(6000, 2000, 3000)).toEqual({ width: 3000, height: 1000, scale: 0.5 });
    expect(fitWithin(800, 600, 3000)).toEqual({ width: 800, height: 600, scale: 1 });
    expect(fitWithin(1, 100000, 3000).width).toBe(1);
  });
});

/** Build a tiny JPEG header: SOI, APP1(Exif orientation [+GPS]), SOF0 with the given size. */
function jpegWithExif(w: number, h: number, orientation: number, gps = false, big = false): Uint8Array {
  const le = !big;
  const u16 = (n: number) => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const entries: number[][] = [[...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0]];
  if (gps) entries.push([...u16(0x8825), ...u16(4), ...u32(1), ...u32(200)]);
  const ifd = [...u16(entries.length), ...entries.flat(), ...u32(0)];
  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...ifd];
  const exif = [...ascii("Exif"), 0, 0, ...tiff];
  const app1 = [0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 255, ...exif];
  const sof = [0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xda, 0, 2]);
}

describe("JPEG header reader", () => {
  it("reads size and orientation (both byte orders)", () => {
    for (const big of [false, true]) {
      const info = readJpegInfo(jpegWithExif(4000, 3000, 6, false, big))!;
      expect(info).toMatchObject({ width: 4000, height: 3000, orientation: 6, hasGps: false });
    }
  });
  it("flags embedded GPS so we can prove it is removed", () => {
    expect(readJpegInfo(jpegWithExif(10, 10, 1, true))!.hasGps).toBe(true);
  });
  it("defaults to upright, and ignores invalid orientation values", () => {
    expect(readJpegInfo(jpegWithExif(10, 10, 9))!.orientation).toBe(1);
    expect(readJpegInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 1, 1, 0x11, 0]))!).toMatchObject({ width: 30, height: 20, orientation: 1 });
  });
  it("returns null (never throws) for garbage and truncated data", () => {
    expect(readJpegInfo(new Uint8Array())).toBeNull();
    expect(readJpegInfo(bytes(1, 2, 3, 4))).toBeNull();
    const good = jpegWithExif(10, 10, 6);
    for (let n = 0; n < good.length; n++) expect(() => readJpegInfo(good.slice(0, n))).not.toThrow();
    const rnd = new Uint8Array(500).map((_, i) => (i * 37 + 11) & 255);
    rnd[0] = 0xff; rnd[1] = 0xd8;
    expect(() => readJpegInfo(rnd)).not.toThrow();
  });
  it("orientation transforms swap dimensions for the quarter-turn cases", () => {
    for (const o of [5, 6, 7, 8]) expect(orientationTransform(o, 400, 300)).toMatchObject({ width: 300, height: 400 });
    for (const o of [1, 2, 3, 4]) expect(orientationTransform(o, 400, 300)).toMatchObject({ width: 400, height: 300 });
  });
  it("orientation 6 maps the stored top-left pixel to the upright top-right corner", () => {
    const { matrix: [a, b, c, d, e, f] } = orientationTransform(6, 400, 300);
    // stored (0,0) -> upright (300,0): x' = a*x + c*y + e, y' = b*x + d*y + f
    expect([a * 0 + c * 0 + e, b * 0 + d * 0 + f]).toEqual([300, 0]);
    // stored (400,0) (top-right) -> upright bottom-right (300,400)
    expect([a * 400 + e, b * 400 + f]).toEqual([300, 400]);
  });
});

describe("detecting cut-off files", () => {
  const sos = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0];
  const jpeg = (scan: number[], end: boolean) => new Uint8Array([0xff, 0xd8, ...Array.from(jpegWithExif(8, 8, 1, false)).slice(2, -4), ...sos, ...scan, ...(end ? [0xff, 0xd9] : [])]);
  it("accepts a JPEG that ends with EOI, even with trailing data after it", () => {
    expect(isCompleteImage("jpeg", jpeg([1, 2, 0xff, 0x00, 3], true))).toBe(true);
    expect(isCompleteImage("jpeg", new Uint8Array([...jpeg([1, 2, 3], true), ...new Array(500).fill(7)]))).toBe(true); // e.g. appended motion-photo video
  });
  it("rejects a JPEG cut off inside the scan", () => {
    expect(isCompleteImage("jpeg", jpeg([1, 2, 3, 4, 5, 6], false))).toBe(false);
  });
  it("is not fooled by an EOI inside an EXIF thumbnail before the main scan", () => {
    const withThumbEoi = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 6, 0xff, 0xd9, 0, 0, ...sos, 1, 2, 3]);
    expect(isCompleteImage("jpeg", withThumbEoi)).toBe(false);
  });
  it("PNG needs IEND; WebP needs its declared size", () => {
    const png = (end: boolean) => new Uint8Array([...PNG, ...new Array(40).fill(1), ...(end ? [0, 0, 0, 0, ...ascii("IEND"), 0xae, 0x42, 0x60, 0x82] : [])]);
    expect(isCompleteImage("png", png(true))).toBe(true);
    expect(isCompleteImage("png", png(false))).toBe(false);
    const webp = (declared: number, actual: number) => new Uint8Array([...ascii("RIFF"), declared & 255, declared >> 8, 0, 0, ...ascii("WEBP"), ...new Array(actual - 12).fill(0)]);
    expect(isCompleteImage("webp", webp(92, 100))).toBe(true);
    expect(isCompleteImage("webp", webp(5000, 100))).toBe(false);
  });
  it("never throws on tiny or empty input", () => {
    for (const k of ["jpeg", "png", "webp"] as const) for (const n of [0, 1, 3, 11]) expect(() => isCompleteImage(k, new Uint8Array(n))).not.toThrow();
  });
});
