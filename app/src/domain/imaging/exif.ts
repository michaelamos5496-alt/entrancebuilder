export interface JpegInfo {
  /** stored pixel size, before any EXIF rotation */
  width: number;
  height: number;
  /** EXIF orientation 1..8 (1 = upright); 1 when absent */
  orientation: number;
  hasGps: boolean;
}

/** Minimal, bounds-checked JPEG header reader: pixel size from the SOF marker, orientation + GPS presence from EXIF. */
export function readJpegInfo(b: Uint8Array): JpegInfo | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let width = 0, height = 0, orientation = 1, hasGps = false;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { i += marker === 0xff ? 1 : 2; continue; }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) break;
    const seg = i + 4;
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && len >= 7) {
      height = (b[seg + 1] << 8) | b[seg + 2];
      width = (b[seg + 3] << 8) | b[seg + 4];
    } else if (marker === 0xe1 && len >= 14 && b[seg] === 0x45 && b[seg + 1] === 0x78 && b[seg + 2] === 0x69 && b[seg + 3] === 0x66) {
      const tiff = seg + 6;
      const little = b[tiff] === 0x49;
      const u16 = (o: number) => (little ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
      const u32 = (o: number) => (little ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0 : ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0);
      if (tiff + 8 <= b.length) {
        const ifd = tiff + u32(tiff + 4);
        if (ifd + 2 <= b.length) {
          const n = Math.min(u16(ifd), 64);
          for (let k = 0; k < n; k++) {
            const e = ifd + 2 + k * 12;
            if (e + 12 > b.length) break;
            const tag = u16(e);
            if (tag === 0x0112) orientation = u16(e + 8);
            if (tag === 0x8825) hasGps = true;
          }
        }
      }
    }
    i += 2 + len;
  }
  if (!width || !height) return null;
  if (orientation < 1 || orientation > 8) orientation = 1;
  return { width, height, orientation, hasGps };
}

/**
 * Canvas transform that turns stored pixels into the upright image for an EXIF orientation.
 * Returns the upright size and the 2D matrix [a,b,c,d,e,f] to pass to `ctx.setTransform`.
 */
export function orientationTransform(o: number, w: number, h: number): { width: number; height: number; matrix: [number, number, number, number, number, number] } {
  switch (o) {
    case 2: return { width: w, height: h, matrix: [-1, 0, 0, 1, w, 0] };
    case 3: return { width: w, height: h, matrix: [-1, 0, 0, -1, w, h] };
    case 4: return { width: w, height: h, matrix: [1, 0, 0, -1, 0, h] };
    case 5: return { width: h, height: w, matrix: [0, 1, 1, 0, 0, 0] };
    case 6: return { width: h, height: w, matrix: [0, 1, -1, 0, h, 0] };
    case 7: return { width: h, height: w, matrix: [0, -1, -1, 0, h, w] };
    case 8: return { width: h, height: w, matrix: [0, -1, 1, 0, 0, w] };
    default: return { width: w, height: h, matrix: [1, 0, 0, 1, 0, 0] };
  }
}
