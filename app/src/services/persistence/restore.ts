import type { ViewSide } from "@/domain/design/types";
import type { Placement } from "@/domain/imaging/types";
import { GALLERY } from "@/services/gallery";
import { decodePhotoFile, decodeTrustedUrl, type PhotoAsset } from "@/services/imaging/decodePhoto";
import type { LoadedProject } from "./types";

export interface RestoredPhoto {
  asset: PhotoAsset;
  placement: Placement;
}

/** Stable id for a photo that came out of storage: lets "save" tell an unchanged stored photo from a newly chosen one. */
export const savedPhotoId = (projectId: string, view: ViewSide) => `saved:${projectId}:${view}`;

/** Turn stored photo data back into in-memory photos. A photo that fails becomes a warning; the project still opens. */
export async function restorePhotos(p: LoadedProject): Promise<{ photos: Partial<Record<ViewSide, RestoredPhoto>>; warnings: string[] }> {
  const photos: Partial<Record<ViewSide, RestoredPhoto>> = {};
  const warnings = [...p.warnings];
  for (const view of ["exterior", "interior"] as const) {
    const s = p.photos[view];
    if (!s) continue;
    try {
      if (s.kind === "gallery") {
        const g = GALLERY.find((x) => x.id === s.galleryId && x.view === view);
        if (!g) { warnings.push(`The sample ${view} photo is no longer available.`); continue; }
        photos[view] = { asset: await decodeTrustedUrl(g.url, g.id, g.label), placement: s.placement };
      } else {
        const file = new File([s.blob], `${view}.jpg`, { type: "image/jpeg" });
        photos[view] = { asset: await decodePhotoFile(file, { id: savedPhotoId(p.id, view), label: "Your saved photo" }), placement: s.placement };
      }
    } catch {
      warnings.push(`The ${view} photo couldn't be opened, so the project opened without it.`);
    }
  }
  return { photos, warnings };
}
