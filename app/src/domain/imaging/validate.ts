export const IMAGE_LIMITS = {
  /** largest file we will read */
  maxBytes: 25 * 1024 * 1024,
  /** smallest usable photo */
  minEdge: 200,
  /** refuse to decode absurd images (memory) */
  maxPixels: 150_000_000,
  /** photos are downscaled to this long edge after decoding (keeps memory and drawing fast) */
  workingEdge: 3000,
} as const;

export type ImageKind = "jpeg" | "png" | "webp";

export type UploadErrorCode = "EMPTY" | "TOO_LARGE" | "UNSUPPORTED" | "HEIC" | "CORRUPT" | "TOO_SMALL" | "TOO_MANY_PIXELS" | "CANCELLED" | "READ_FAILED";

export class UploadError extends Error {
  constructor(public readonly code: UploadErrorCode, message: string) {
    super(message);
    this.name = "UploadError";
  }
}

const mb = (n: number) => `${Math.round((n / 1024 / 1024) * 10) / 10} MB`;

/** Identify an image by its first bytes. We never trust the file extension or the browser-reported MIME type. */
export function sniffImage(b: Uint8Array): ImageKind | "heic" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  const ascii = (from: number, n: number) => String.fromCharCode(...Array.from(b.slice(from, from + n)));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  if (b.length >= 12 && ascii(4, 4) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heim|heis)/.test(ascii(8, 4))) return "heic";
  return null;
}

/** Cheap checks before any decoding. Throws UploadError with a message fit to show the user. */
export function validateFileHead(file: { size: number; name: string }, head: Uint8Array): ImageKind {
  if (file.size === 0) throw new UploadError("EMPTY", "That file is empty.");
  if (file.size > IMAGE_LIMITS.maxBytes) throw new UploadError("TOO_LARGE", `That file is ${mb(file.size)}. The limit is ${mb(IMAGE_LIMITS.maxBytes)}.`);
  const kind = sniffImage(head);
  if (kind === "heic") throw new UploadError("HEIC", "HEIC photos aren't supported yet. Export or share the photo as JPEG and try again.");
  if (!kind) throw new UploadError("UNSUPPORTED", "That doesn't look like a JPEG, PNG or WebP image.");
  return kind;
}

/** Checks after decoding. */
export function validateDimensions(w: number, h: number): void {
  if (w < IMAGE_LIMITS.minEdge || h < IMAGE_LIMITS.minEdge) throw new UploadError("TOO_SMALL", `That image is only ${w}×${h}px. Use a photo at least ${IMAGE_LIMITS.minEdge}px on each side.`);
  if (w * h > IMAGE_LIMITS.maxPixels) throw new UploadError("TOO_MANY_PIXELS", "That image is too large to open safely. Try a smaller version.");
}

/** Size after scaling so the long edge is at most `max` (never upscales). */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

/**
 * Detect files that were cut off (interrupted download, bad copy). Browsers decode half a JPEG and paint the rest grey,
 * so decoding alone would "succeed" with a broken photo.
 *  - JPEG: an end-of-image marker must follow the first scan (EXIF thumbnails have their own, earlier markers, so we skip those).
 *  - PNG: the IEND chunk must be present at the end.
 *  - WebP: the RIFF header's declared size must fit in the file.
 */
export function isCompleteImage(kind: ImageKind, b: Uint8Array): boolean {
  if (kind === "png") {
    const tail = b.slice(Math.max(0, b.length - 1024));
    for (let i = 0; i + 4 <= tail.length; i++) if (tail[i] === 0x49 && tail[i + 1] === 0x45 && tail[i + 2] === 0x4e && tail[i + 3] === 0x44) return true;
    return false;
  }
  if (kind === "webp") {
    if (b.length < 12) return false;
    const declared = (b[4] | (b[5] << 8) | (b[6] << 16) | (b[7] << 24)) >>> 0;
    return declared + 8 <= b.length;
  }
  // jpeg: walk the header segments up to the first scan, then look for EOI after it
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) return true;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m === 0xda) { i += 2 + len; break; }
    if (len < 2) return false;
    i += 2 + len;
  }
  if (i >= b.length) return false;
  for (let k = b.length - 2; k >= i; k--) if (b[k] === 0xff && b[k + 1] === 0xd9) return true;
  return false;
}
