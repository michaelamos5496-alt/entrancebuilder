import type { Raster } from "@/domain/imaging/types";

/**
 * Rasterise the door's SVG (the same markup the on-screen preview renders) to pixels the warp can sample.
 * The result is cached by content + size so dragging the door never re-parses the SVG.
 */
const cache = new Map<string, Promise<Raster>>();
const MAX_ENTRIES = 12;

export function svgToRaster(markup: string, width: number, height: number): Promise<Raster> {
  const key = `${width}x${height}:${markup}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // refresh recency
    return hit;
  }
  const p = (async () => {
    // the markup only has a viewBox; give it an explicit size and the SVG namespace so it rasterises at the size we want
    const withNs = markup.replace("<svg", `<svg ${markup.includes("xmlns=") ? "" : 'xmlns="http://www.w3.org/2000/svg" '}width="${width}" height="${height}"`);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height);
    return { width, height, data: d.data };
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  return p;
}

/** Choose a raster size from how big the door will appear (bucketed so small drags reuse the cache). */
export function rasterSizeFor(displayHeightPx: number, aspect: number): { width: number; height: number } {
  const h = Math.min(1800, Math.max(192, Math.ceil((displayHeightPx * 1.25) / 128) * 128));
  return { width: Math.max(8, Math.round(h * aspect)), height: h };
}
