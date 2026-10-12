/** Pure imaging types. No DOM: everything here runs (and is tested) in Node. */

export interface Pt {
  x: number;
  y: number;
}

/** Corners in clockwise order from the top-left: TL, TR, BR, BL. */
export type Quad = readonly [Pt, Pt, Pt, Pt];

/** Non-premultiplied RGBA, 8 bits per channel: the same layout as the browser's ImageData. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export const CORNER_NAMES = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"] as const;

/** What the user has set up for one photo. Corners are normalised to the PHOTO (0..1), not the screen. */
export interface Placement {
  /** the doorway opening the door is fitted into */
  quad: Quad;
  flip: boolean;
  /** false: corners move together as a rectangle; true: each corner is free */
  perspective: boolean;
  matchLighting: boolean;
  /** manual brightness, -50..+50 (percent) */
  brightness: number;
  shadow: boolean;
}

export interface Photo {
  id: string;
  label: string;
  source: "gallery" | "upload";
  width: number;
  height: number;
}
