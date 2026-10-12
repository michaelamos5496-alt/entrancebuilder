import type { Selections, ViewSide } from "@/domain/design/types";
import { estimateLighting } from "@/domain/imaging/lighting";
import { defaultPlacement } from "@/domain/imaging/placement";
import type { Placement } from "@/domain/imaging/types";
import { MEDIA_LIMITS } from "@/domain/project/media";
import { cutoutAspect } from "@/features/preview/SchematicDoor";
import { paintOverlay } from "./compose";
import type { PhotoAsset } from "./decodePhoto";
import { rasterSizeFor, svgToRaster } from "./doorRaster";

const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, q));

/**
 * The (already normalised) photo as a JPEG, ready to store. Detailed photos can exceed the server's upload cap
 * (4 MiB, set by the hosting platform's request limit), so quality is lowered, and as a last resort the image is
 * scaled down, until it fits. Never returns something the server would reject for size.
 */
export async function photoToJpeg(photo: PhotoAsset, targetBytes = MEDIA_LIMITS.photoTargetBytes): Promise<Blob> {
  let source: HTMLCanvasElement = photo.canvas;
  for (let shrink = 0; shrink < 4; shrink++) {
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const blob = await toBlob(source, "image/jpeg", q);
      if (blob.size <= targetBytes) return blob;
    }
    const next = document.createElement("canvas");
    next.width = Math.max(200, Math.round(source.width * 0.8));
    next.height = Math.max(200, Math.round(source.height * 0.8));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, next.width, next.height);
    source = next;
  }
  return toBlob(source, "image/jpeg", 0.5);
}

export interface PreviewInput {
  /** SVG markup of the door for `view` */
  markup: string;
  selections: Selections;
  view: ViewSide;
  photo: PhotoAsset | null;
  placement: Placement | null;
}

/**
 * The thumbnail saved with a project: exactly what the user is looking at, small.
 * With a photo it is the photo + composited door; without one it is the door on a plain backdrop.
 */
export async function buildPreviewPng(i: PreviewInput, maxEdge = 720): Promise<Blob> {
  const aspect = cutoutAspect(i.selections);
  const canvas = document.createElement("canvas");
  let placement: Placement;
  let lighting = null;

  if (i.photo && i.placement) {
    const s = Math.min(1, maxEdge / Math.max(i.photo.width, i.photo.height));
    canvas.width = Math.max(16, Math.round(i.photo.width * s));
    canvas.height = Math.max(16, Math.round(i.photo.height * s));
    canvas.getContext("2d")!.drawImage(i.photo.canvas, 0, 0, canvas.width, canvas.height);
    placement = i.placement;
    lighting = estimateLighting(i.photo.thumb, placement.quad);
  } else {
    canvas.width = Math.round(maxEdge * 0.8);
    canvas.height = maxEdge;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = i.view === "exterior" ? "#dfe3e6" : "#eee8dc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = i.view === "exterior" ? "#b9bbb9" : "#a98a63";
    ctx.fillRect(0, canvas.height * 0.88, canvas.width, canvas.height * 0.12);
    placement = { ...defaultPlacement(canvas.width, canvas.height, aspect), shadow: false };
    placement = { ...placement, quad: defaultPlacement(canvas.width, canvas.height, aspect).quad.map((p) => ({ x: p.x, y: p.y + 0.06 })) as unknown as Placement["quad"] };
  }

  const quadH = Math.hypot((placement.quad[0].x - placement.quad[3].x) * canvas.width, (placement.quad[0].y - placement.quad[3].y) * canvas.height);
  const size = rasterSizeFor(quadH, aspect);
  const door = await svgToRaster(i.markup, size.width, size.height);
  const overlay = document.createElement("canvas");
  overlay.width = canvas.width;
  overlay.height = canvas.height;
  paintOverlay(overlay, { door, doorAspect: aspect, placement, lighting });
  canvas.getContext("2d")!.drawImage(overlay, 0, 0);
  return toBlob(canvas, "image/png");
}
