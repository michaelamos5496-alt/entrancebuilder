import { orientationTransform, readJpegInfo } from "@/domain/imaging/exif";
import type { Photo, Raster } from "@/domain/imaging/types";
import { IMAGE_LIMITS, UploadError, fitWithin, isCompleteImage, validateDimensions, validateFileHead } from "@/domain/imaging/validate";

/** A decoded, normalised photo held in memory. Pixels are upright, EXIF-free, and at most `workingEdge` on the long side. */
export interface PhotoAsset extends Photo {
  canvas: HTMLCanvasElement;
  /** tiny copy for lighting estimates */
  thumb: Raster;
}

export type Stage = "reading" | "decoding" | "preparing";
export interface Progress {
  stage: Stage;
  /** 0..1 across the whole job */
  fraction: number;
}

interface Options {
  signal?: AbortSignal;
  onProgress?: (p: Progress) => void;
  id?: string;
  label?: string;
}

const checkAbort = (s?: AbortSignal) => {
  if (s?.aborted) throw new UploadError("CANCELLED", "Cancelled.");
};

function readWithProgress(file: Blob, onFraction: (f: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onprogress = (e) => e.lengthComputable && onFraction(e.loaded / e.total);
    r.onerror = () => reject(new UploadError("READ_FAILED", "We couldn't read that file. Check it hasn't moved or been deleted."));
    r.onload = () => resolve(r.result as ArrayBuffer);
    signal?.addEventListener("abort", () => { r.abort(); reject(new UploadError("CANCELLED", "Cancelled.")); }, { once: true });
    r.readAsArrayBuffer(file);
  });
}

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));

type Drawable = ImageBitmap | HTMLImageElement;
const sizeOf = (d: Drawable) => ("naturalWidth" in d ? { w: d.naturalWidth, h: d.naturalHeight } : { w: d.width, h: d.height });

async function decodeBlob(blob: Blob): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // the decoded image no longer needs the URL
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Draw `src` (optionally with an EXIF transform) onto a new canvas of the working size, halving step-by-step for quality. */
function toWorkingCanvas(src: Drawable, srcW: number, srcH: number, matrix: [number, number, number, number, number, number] | null, uprightW: number, uprightH: number): HTMLCanvasElement {
  const { width, height } = fitWithin(uprightW, uprightH, IMAGE_LIMITS.workingEdge);
  let current: CanvasImageSource = src;
  let cw = srcW, ch = srcH;

  // upright first at full size if a manual rotation is needed
  if (matrix) {
    const c = document.createElement("canvas");
    c.width = uprightW; c.height = uprightH;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(...matrix);
    ctx.drawImage(src, 0, 0);
    current = c; cw = uprightW; ch = uprightH;
  }
  while (cw / 2 >= width && ch / 2 >= height) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.floor(cw / 2)); c.height = Math.max(1, Math.floor(ch / 2));
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, c.width, c.height);
    current = c; cw = c.width; ch = c.height;
  }
  const out = document.createElement("canvas");
  out.width = width; out.height = height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff"; // photos have no transparency; flatten PNG/WebP alpha onto white
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, width, height);
  return out;
}

function makeThumb(canvas: HTMLCanvasElement): Raster {
  const { width, height } = fitWithin(canvas.width, canvas.height, 96);
  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(canvas, 0, 0, width, height);
  const d = ctx.getImageData(0, 0, width, height);
  return { width, height, data: d.data };
}

/**
 * Turn a user-chosen file into a normalised in-memory photo.
 * Validates by content (not name), reads with progress, applies EXIF orientation, downscales large images,
 * and re-draws the pixels - which removes all metadata (EXIF GPS, camera, timestamps). Nothing leaves the browser.
 */
export async function decodePhotoFile(file: File, opts: Options = {}): Promise<PhotoAsset> {
  const { signal, onProgress } = opts;
  const report = (stage: Stage, fraction: number) => onProgress?.({ stage, fraction: Math.min(1, Math.max(0, fraction)) });

  checkAbort(signal);
  report("reading", 0);
  const head = new Uint8Array(await file.slice(0, 131072).arrayBuffer());
  const kind = validateFileHead(file, head);

  // cheap pre-check of declared size before allocating decode memory
  const info = readJpegInfo(head);
  if (info) validateDimensions(info.width, info.height);

  const buf = await readWithProgress(file, (f) => report("reading", f * 0.5), signal);
  checkAbort(signal);
  if (!isCompleteImage(kind, new Uint8Array(buf))) {
    throw new UploadError("CORRUPT", "That image looks incomplete: the file seems to have been cut off. Try downloading or exporting it again.");
  }

  report("decoding", 0.5);
  await yieldToUi();
  let drawable: Drawable;
  try {
    drawable = await decodeBlob(new Blob([buf]));
  } catch {
    throw new UploadError("CORRUPT", "We couldn't read that image. It may be damaged or incomplete.");
  }
  checkAbort(signal);

  try {
    const { w, h } = sizeOf(drawable);
    validateDimensions(w, h);
    report("preparing", 0.8);
    await yieldToUi();

    // Browsers apply EXIF orientation while decoding. For quarter-turn orientations (5-8) we can verify that from the
    // size: if the decoded size is still the stored size, the platform did not rotate it, so we do.
    // Orientations 2-4 (mirror / 180°) cannot be detected from size; we trust the platform for those.
    let matrix: [number, number, number, number, number, number] | null = null;
    let uw = w, uh = h;
    if (info && info.orientation >= 5 && w === info.width && h === info.height) {
      const t = orientationTransform(info.orientation, info.width, info.height);
      matrix = t.matrix; uw = t.width; uh = t.height;
    }
    const canvas = toWorkingCanvas(drawable, w, h, matrix, uw, uh);
    await yieldToUi();
    const thumb = makeThumb(canvas);
    report("preparing", 1);
    return {
      id: opts.id ?? `upload:${file.name}:${file.size}:${file.lastModified}`,
      label: opts.label ?? file.name,
      source: "upload",
      width: canvas.width,
      height: canvas.height,
      canvas,
      thumb,
    };
  } finally {
    if ("close" in drawable) drawable.close();
  }
}

/** Load one of our own bundled illustrations (a trusted URL, may be SVG) through the same normalising path. */
export async function decodeTrustedUrl(url: string, id: string, label: string, signal?: AbortSignal): Promise<PhotoAsset> {
  checkAbort(signal);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  try {
    await img.decode();
  } catch {
    throw new UploadError("CORRUPT", "That sample photo couldn't be loaded.");
  }
  checkAbort(signal);
  const w = img.naturalWidth || 1200, h = img.naturalHeight || 800;
  const canvas = toWorkingCanvas(img, w, h, null, w, h);
  return { id, label, source: "gallery", width: canvas.width, height: canvas.height, canvas, thumb: makeThumb(canvas) };
}
