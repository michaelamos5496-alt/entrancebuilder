import { finalLighting, type Lighting } from "@/domain/imaging/lighting";
import { fitRect, quadAspect, toPx } from "@/domain/imaging/quad";
import type { Placement, Raster } from "@/domain/imaging/types";
import { warpOver, quadPoint } from "@/domain/imaging/warp";

export interface Layer {
  /** the door, rasterised, with transparency */
  door: Raster;
  doorAspect: number;
  placement: Placement;
  /** automatic lighting estimate for the current doorway (or null) */
  lighting: Lighting | null;
}

/**
 * Draw ONLY the door (and its shadow) onto a transparent canvas the size of the photo view.
 * The photograph itself is never touched, so it can be shown, hidden or exported unchanged.
 */
export function paintOverlay(canvas: HTMLCanvasElement, layer: Layer): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width: W, height: H } = canvas;
  ctx.clearRect(0, 0, W, H);
  const { placement: p } = layer;
  const quadPx = toPx(p.quad, W, H);
  const rect = fitRect(layer.doorAspect, quadAspect(quadPx));
  const { gain, tint } = finalLighting(layer.lighting, p.matchLighting, p.brightness);

  const image = ctx.createImageData(W, H);
  warpOver(image, layer.door, quadPx, { rect, flip: p.flip, gain, tint });

  if (p.shadow) {
    // soft shadow of the door on the wall: its fitted outline, offset away from an upper-left light and blurred
    const corners = ([[0, 0], [1, 0], [1, 1], [0, 1]] as const).map(([cu, cv]) => {
      const u = rect.u0 + (rect.u1 - rect.u0) * cu, v = rect.v0 + (rect.v1 - rect.v0) * cv;
      return quadPoint(quadPx, u, v);
    });
    if (corners.every(Boolean)) {
      const hPx = Math.hypot(quadPx[0].x - quadPx[3].x, quadPx[0].y - quadPx[3].y);
      const OFF = 20000; // draw the shape far off-canvas and bring only its shadow back (works without ctx.filter)
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.38)";
      ctx.shadowBlur = Math.max(2, hPx * 0.03);
      ctx.shadowOffsetX = OFF + hPx * 0.014;
      ctx.shadowOffsetY = hPx * 0.007;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      corners.forEach((c, i) => (i ? ctx.lineTo(c!.x - OFF, c!.y) : ctx.moveTo(c!.x - OFF, c!.y)));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  const tmp = document.createElement("canvas");
  tmp.width = W;
  tmp.height = H;
  tmp.getContext("2d")!.putImageData(image, 0, 0);
  ctx.drawImage(tmp, 0, 0);
}

/** Photo + door at the photo's own resolution, with an honesty caption. Returns a PNG blob. */
export async function exportComposite(photo: HTMLCanvasElement, layer: Layer): Promise<Blob> {
  const out = document.createElement("canvas");
  out.width = photo.width;
  out.height = photo.height;
  const ctx = out.getContext("2d")!;
  ctx.drawImage(photo, 0, 0);
  const overlay = document.createElement("canvas");
  overlay.width = photo.width;
  overlay.height = photo.height;
  paintOverlay(overlay, layer);
  ctx.drawImage(overlay, 0, 0);

  const size = Math.max(14, Math.round(photo.width / 90));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const text = "Approximate preview — illustrative door, not a photograph of the product";
  const pad = size * 0.6;
  const w = ctx.measureText(text).width + pad * 2;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(size * 0.5, photo.height - size * 2.4, w, size * 1.8);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, size * 0.5 + pad, photo.height - size * 1.15);

  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), "image/png"));
}
