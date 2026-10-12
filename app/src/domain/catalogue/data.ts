import type { GlassKey, LayoutKey, SelectionKey, StepId } from "@/domain/design/types";

/**
 * SAMPLE catalogue — original names and values, stored locally.
 * Phase 3 replaces this with the database-backed catalogue + declarative rules.
 */

export interface Option {
  value: string;
  label: string;
  /** used for search and the glass "Family" filter */
  family?: string;
}

export interface Swatch {
  value: string;
  label: string;
}

export type GroupKind = "choice" | "glass" | "color" | "toggle" | "product";

export interface Group {
  key: SelectionKey;
  step: Exclude<StepId, "summary">;
  title: string;
  kind: GroupKind;
  options?: readonly Option[];
  palette?: readonly Swatch[];
  columns?: 2 | 3;
  /** short helper text shown under the title */
  hint?: string;
}

export interface StepDef {
  id: StepId;
  title: string;
  heading: string;
}

export const STEPS: readonly StepDef[] = [
  { id: "layout", title: "Layout", heading: "Choose your layout" },
  { id: "door", title: "Door", heading: "Shape the door" },
  { id: "glass", title: "Glass", heading: "Pick the glass" },
  { id: "color", title: "Colors", heading: "Set the colors" },
  { id: "hardware", title: "Handle", heading: "Finish with hardware" },
  { id: "summary", title: "Summary", heading: "Your door" },
];

export const COLOR_PALETTE: readonly Swatch[] = [
  { value: "#1c1c1c", label: "Black" },
  { value: "#3a3d42", label: "Charcoal" },
  { value: "#a9a9a7", label: "Gray" },
  { value: "#bab7a8", label: "Beige" },
  { value: "#2b3a4f", label: "Navy" },
  { value: "#3e5567", label: "Blue" },
  { value: "#5f6f55", label: "Green" },
  { value: "#74806b", label: "Sage" },
  { value: "#9b3d30", label: "Red" },
  { value: "#deb51e", label: "Yellow" },
  { value: "#6e5442", label: "Brown" },
  { value: "#f4f3ef", label: "White" },
];

/** Named palette values, so products can reference colors without repeating hex codes. */
export const COLOR = {
  black: "#1c1c1c", charcoal: "#3a3d42", gray: "#a9a9a7", beige: "#bab7a8", navy: "#2b3a4f", blue: "#3e5567",
  green: "#5f6f55", sage: "#74806b", red: "#9b3d30", yellow: "#deb51e", brown: "#6e5442", white: "#f4f3ef",
} as const;

export const FINISH = {
  matteBlack: "#25272b", nickel: "#b4b7ba", brass: "#b8975a", chrome: "#dfe3e6", bronze: "#5b4636", copper: "#a9694a",
} as const;

export const HANDLE_FINISHES: readonly Swatch[] = [
  { value: "#25272b", label: "Matte black" },
  { value: "#b4b7ba", label: "Brushed nickel" },
  { value: "#b8975a", label: "Satin brass" },
  { value: "#dfe3e6", label: "Chrome" },
  { value: "#5b4636", label: "Bronze" },
  { value: "#a9694a", label: "Copper" },
];

export const GLASS_FAMILIES = [
  "All",
  "Mosaic",
  "Frosted",
  "Silkscreen",
  "Grooved",
  "Grilles",
  "Venting",
  "Blinds",
] as const;

const glassOptions: readonly (Option & { value: GlassKey })[] = [
  { value: "mosaic", label: "Mosaic", family: "Mosaic" },
  { value: "arch", label: "Arch mosaic", family: "Mosaic" },
  { value: "frosted", label: "Frosted", family: "Frosted" },
  { value: "ripple", label: "Ripple", family: "Frosted" },
  { value: "frame", label: "Framed", family: "Silkscreen" },
  { value: "bands", label: "Bands", family: "Silkscreen" },
  { value: "clear", label: "Clear", family: "Silkscreen" },
  { value: "linear", label: "Linear", family: "Grooved" },
  { value: "grid", label: "Grid", family: "Grilles" },
  { value: "vent", label: "Vent", family: "Venting" },
  { value: "blinds", label: "Blinds", family: "Blinds" },
];

export const LAYOUT_OPTIONS: readonly (Option & { value: LayoutKey })[] = [
  { value: "single", label: "Single door" },
  { value: "side-left", label: "Left sidelite" },
  { value: "side-right", label: "Right sidelite" },
  { value: "side-both", label: "Two sidelites" },
  { value: "transom", label: "Transom" },
  { value: "side-left-transom", label: "Left sidelite + transom" },
  { value: "side-right-transom", label: "Right sidelite + transom" },
  { value: "side-both-transom", label: "Sidelites + transom" },
  { value: "double", label: "Double doors" },
];

export const GROUPS: readonly Group[] = [
  { key: "layout", step: "layout", title: "Configuration", kind: "choice", options: LAYOUT_OPTIONS },
  {
    key: "height", step: "layout", title: "Door height", kind: "choice", columns: 2,
    options: [
      { value: "std", label: "Standard · 80 in" },
      { value: "tall", label: "Tall · 96 in" },
    ],
  },
  {
    key: "hand", step: "layout", title: "Opening direction", kind: "choice", columns: 2,
    hint: "Seen from outside, hinges on the left or right.",
    options: [
      { value: "left", label: "Left hand" },
      { value: "right", label: "Right hand" },
    ],
  },

  {
    key: "product", step: "door", title: "Door model", kind: "product",
    hint: "Sample models for demonstration, not real products. Each supports its own layouts, glass, colors and hardware.",
  },
  {
    key: "lite", step: "door", title: "Glass lite", kind: "choice",
    options: [
      { value: "none", label: "Solid" },
      { value: "half", label: "1/2 lite" },
      { value: "three", label: "3/4 lite" },
    ],
  },
  {
    key: "sideliteStyle", step: "door", title: "Sidelite style", kind: "choice",
    options: [
      { value: "match", label: "Match door" },
      { value: "full", label: "Full lite" },
      { value: "half", label: "1/2 lite" },
    ],
  },
  {
    key: "accessory", step: "door", title: "Accessories", kind: "choice",
    options: [
      { value: "none", label: "None" },
      { value: "knocker", label: "Knocker" },
      { value: "kick", label: "Kick plate" },
      { value: "mail", label: "Mail slot" },
    ],
  },

  { key: "glass", step: "glass", title: "Door glass", kind: "glass", options: glassOptions },
  {
    key: "glassFrame", step: "glass", title: "Glass frame profile", kind: "choice",
    options: [
      { value: "slim", label: "Slim" },
      { value: "wide", label: "Wide" },
      { value: "none", label: "None" },
    ],
  },
  { key: "sideliteGlass", step: "glass", title: "Sidelite glazing", kind: "glass", options: glassOptions },
  { key: "transomGlass", step: "glass", title: "Transom glazing", kind: "glass", options: glassOptions },

  { key: "matchFrame", step: "color", title: "Frame follows door", kind: "toggle", hint: "Frame colors copy the door colors." },
  { key: "colorDoorExt", step: "color", title: "Door · exterior", kind: "color", palette: COLOR_PALETTE },
  { key: "colorFrameExt", step: "color", title: "Frame · exterior", kind: "color", palette: COLOR_PALETTE },
  { key: "colorDoorInt", step: "color", title: "Door · interior", kind: "color", palette: COLOR_PALETTE },
  { key: "colorFrameInt", step: "color", title: "Frame · interior", kind: "color", palette: COLOR_PALETTE },
  { key: "colorSill", step: "color", title: "Sill", kind: "color", palette: COLOR_PALETTE },

  {
    key: "handle", step: "hardware", title: "Handle model", kind: "choice", columns: 2,
    options: [
      { value: "lever", label: "Lever" },
      { value: "bar", label: "Contemporary bar" },
      { value: "knob", label: "Round knob" },
      { value: "pull", label: "Pull handle" },
    ],
  },
  { key: "handleFinish", step: "hardware", title: "Finish", kind: "color", palette: HANDLE_FINISHES },
];

export const GROUP_BY_KEY = new Map<SelectionKey, Group>(GROUPS.map((g) => [g.key, g]));

export const COLOR_DISCLAIMER =
  "Colors on screen are a guide only. Check a physical swatch before ordering your door.";
export const IMAGE_DISCLAIMER =
  "Images are illustrative and may not exactly represent the product. Confirm details with your retailer.";
