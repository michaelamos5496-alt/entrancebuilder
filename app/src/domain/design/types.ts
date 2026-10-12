export type LayoutKey =
  | "single"
  | "side-left"
  | "side-right"
  | "side-both"
  | "transom"
  | "side-left-transom"
  | "side-right-transom"
  | "side-both-transom"
  | "double";

export type GlassKey =
  | "mosaic"
  | "arch"
  | "frosted"
  | "ripple"
  | "frame"
  | "bands"
  | "clear"
  | "linear"
  | "grid"
  | "vent"
  | "blinds";

export type HandleKey = "lever" | "bar" | "knob" | "pull";

export type ProductId = string;

/**
 * The complete, serialisable configuration of a door.
 * Flat on purpose: every field is one catalogue "group". `product` is the active door model.
 * Which values are allowed is decided by the catalogue + rules engine (domain/engine), not by these types.
 */
export interface Selections {
  layout: LayoutKey;
  height: "std" | "tall";
  hand: "left" | "right";

  product: ProductId;
  lite: "none" | "half" | "three";
  accessory: "none" | "knocker" | "kick" | "mail";
  sideliteStyle: "match" | "full" | "half";

  glass: GlassKey;
  glassFrame: "slim" | "wide" | "none";
  sideliteGlass: GlassKey;
  transomGlass: GlassKey;

  matchFrame: boolean;
  colorDoorExt: string;
  colorFrameExt: string;
  colorDoorInt: string;
  colorFrameInt: string;
  colorSill: string;

  handle: HandleKey;
  handleFinish: string;
}

export type SelectionKey = keyof Selections;

export type StepId = "layout" | "door" | "glass" | "color" | "hardware" | "summary";

export type ViewSide = "exterior" | "interior";
