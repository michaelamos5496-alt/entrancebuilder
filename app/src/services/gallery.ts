import { getAsset } from "@/domain/catalogue/assets";
import type { ViewSide } from "@/domain/design/types";

/**
 * Sample gallery: CC0 photographs from Wikimedia Commons (see public/gallery/CREDITS.md).
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
  photo("house-1", "White clapboard", "exterior"),
  photo("house-2", "Red brick", "exterior"),
  photo("house-3", "Yellow stucco", "exterior"),
  photo("house-4", "Modern duplex", "exterior"),
  photo("house-5", "White ranch", "exterior"),
  photo("room-1", "Living room", "interior"),
];

export const galleryFor = (view: ViewSide) => GALLERY.filter((g) => g.view === view);
export const findGallery = (id: string) => GALLERY.find((g) => g.id === id);
