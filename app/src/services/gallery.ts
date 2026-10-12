import { getAsset } from "@/domain/catalogue/assets";
import type { ViewSide } from "@/domain/design/types";

/**
 * Placeholder gallery: original illustrations created for this project (no third-party licence).
 * INTEGRATION POINT: Phase 5/6 loads real gallery photos (with stored default placements) from the database.
 */
export interface GalleryPhoto {
  id: string;
  label: string;
  view: ViewSide;
  /** key in the asset manifest */
  assetId: string;
  /** resolved from the manifest, never written by hand */
  url: string;
}

const photo = (id: string, label: string, view: ViewSide): GalleryPhoto => {
  const assetId = `gallery.${id}`;
  return { id, label, view, assetId, url: getAsset(assetId).src! };
};

export const GALLERY: readonly GalleryPhoto[] = [
  photo("house-1", "Gray siding", "exterior"),
  photo("house-2", "Red brick", "exterior"),
  photo("house-3", "Craftsman stucco", "exterior"),
  photo("room-1", "Living room", "interior"),
];

export const galleryFor = (view: ViewSide) => GALLERY.filter((g) => g.view === view);
export const findGallery = (id: string) => GALLERY.find((g) => g.id === id);
