import { readJpegInfo } from "@/domain/imaging/exif";
import { isCompleteImage, sniffImage } from "@/domain/imaging/validate";

/**
 * Server-side validation of bytes that arrive from a browser. The client is never trusted:
 * every rule here is re-checked even though the UI already normalises photos.
 */
export const MEDIA_LIMITS = {
  /**
   * Vercel serverless functions reject request bodies over ~4.5 MB. Photos are therefore capped at 4 MiB (the browser
   * re-encodes to fit, see photoToJpeg) so an upload that passes locally cannot fail only in production.
   */
  photoMaxBytes: 4 * 1024 * 1024,
  /** the client aims below the cap so the multipart envelope never pushes a request over the platform limit */
  photoTargetBytes: Math.floor(3.8 * 1024 * 1024),
  photoMinEdge: 200,
  photoMaxEdge: 3200,
  previewMaxBytes: 2 * 1024 * 1024,
  previewMinEdge: 16,
  previewMaxEdge: 2000,
} as const;

export type MediaCheck = { ok: true; width: number; height: number; bytes: Uint8Array } | { ok: false; code: "EMPTY" | "TOO_LARGE" | "BAD_TYPE" | "INCOMPLETE" | "BAD_SIZE"; message: string };

const fail = (code: Extract<MediaCheck, { ok: false }>["code"], message: string): MediaCheck => ({ ok: false, code, message });

/** JPEG segments that can carry personal data or active payloads (EXIF/XMP, vendor blocks, comments). ICC (APP2) and Adobe (APP14) are kept for colour fidelity. */
const STRIP = (m: number) => m === 0xe1 || (m >= 0xe3 && m <= 0xed) || m === 0xef || m === 0xfe;

/** Remove metadata segments from a JPEG without touching the image data. Returns the input unchanged if it cannot be parsed. */
export function stripJpegMetadata(b: Uint8Array): Uint8Array {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return b;
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b; // not a well-formed header: refuse to guess
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda) { // start of scan: everything after is image data, copy verbatim
      for (let k = i; k < b.length; k++) out.push(b[k]);
      return Uint8Array.from(out);
    }
    if (m === 0xd9) { out.push(0xff, 0xd9); return Uint8Array.from(out); }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return b;
    if (!STRIP(m)) for (let k = i; k < i + 2 + len; k++) out.push(b[k]);
    i += 2 + len;
  }
  return b;
}

export function validatePhotoUpload(input: Uint8Array): MediaCheck {
  if (input.length === 0) return fail("EMPTY", "The file is empty.");
  if (input.length > MEDIA_LIMITS.photoMaxBytes) return fail("TOO_LARGE", "The photo is too large.");
  if (sniffImage(input) !== "jpeg") return fail("BAD_TYPE", "Photos must be JPEG.");
  if (!isCompleteImage("jpeg", input)) return fail("INCOMPLETE", "The photo file is incomplete.");
  const info = readJpegInfo(input);
  if (!info) return fail("BAD_TYPE", "The photo could not be read.");
  const { width, height } = info;
  if (width < MEDIA_LIMITS.photoMinEdge || height < MEDIA_LIMITS.photoMinEdge || width > MEDIA_LIMITS.photoMaxEdge || height > MEDIA_LIMITS.photoMaxEdge) {
    return fail("BAD_SIZE", `Photo dimensions must be ${MEDIA_LIMITS.photoMinEdge}–${MEDIA_LIMITS.photoMaxEdge}px.`);
  }
  const bytes = stripJpegMetadata(input);
  return { ok: true, width, height, bytes };
}

export function validatePreviewUpload(input: Uint8Array): MediaCheck {
  if (input.length === 0) return fail("EMPTY", "The file is empty.");
  if (input.length > MEDIA_LIMITS.previewMaxBytes) return fail("TOO_LARGE", "The preview is too large.");
  if (sniffImage(input) !== "png") return fail("BAD_TYPE", "Previews must be PNG.");
  if (!isCompleteImage("png", input)) return fail("INCOMPLETE", "The preview file is incomplete.");
  // IHDR is always the first chunk: width/height are big-endian u32 at bytes 16..23
  if (input.length < 24) return fail("BAD_TYPE", "The preview could not be read.");
  const u32 = (o: number) => ((input[o] << 24) | (input[o + 1] << 16) | (input[o + 2] << 8) | input[o + 3]) >>> 0;
  const width = u32(16), height = u32(20);
  if (width < MEDIA_LIMITS.previewMinEdge || height < MEDIA_LIMITS.previewMinEdge || width > MEDIA_LIMITS.previewMaxEdge || height > MEDIA_LIMITS.previewMaxEdge) {
    return fail("BAD_SIZE", `Preview dimensions must be ${MEDIA_LIMITS.previewMinEdge}–${MEDIA_LIMITS.previewMaxEdge}px.`);
  }
  return { ok: true, width, height, bytes: input };
}
