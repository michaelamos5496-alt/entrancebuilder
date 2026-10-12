import { CATALOGUE } from "@/domain/catalogue";
import { COLOR, FINISH } from "@/domain/catalogue/data";
import { createConfig } from "@/domain/engine/reconcile";
import type { Selections } from "./types";

/** The configuration a new visitor starts with: the default product, nothing customised. */
export const DEFAULT_CONFIG: Selections = createConfig(CATALOGUE).config;

export interface Preset {
  slug: string;
  title: string;
  tags: readonly ("contemporary" | "classic" | "trends")[];
  product: string;
  overrides: Partial<Selections>;
}

/** "Get inspired" starting points. Each must be valid as written (enforced by tests: no silent repairs). */
export const PRESETS: readonly Preset[] = [
  { slug: "midnight-classic", title: "Midnight Classic", tags: ["classic"], product: "haven",
    overrides: { colorDoorExt: COLOR.navy, handleFinish: FINISH.brass } },
  { slug: "garden-lite", title: "Garden Lite", tags: ["classic", "trends"], product: "haven",
    overrides: { lite: "three", glass: "mosaic", colorDoorExt: COLOR.green, handleFinish: FINISH.brass } },
  { slug: "slate-modern", title: "Slate Modern", tags: ["contemporary"], product: "meridian",
    overrides: { colorDoorExt: COLOR.charcoal, handle: "bar", handleFinish: FINISH.nickel } },
  { slug: "frosted-panel", title: "Frosted Panel", tags: ["contemporary", "trends"], product: "meridian",
    overrides: { lite: "half", glass: "frosted", colorDoorExt: COLOR.black, handle: "bar", handleFinish: FINISH.matteBlack } },
  { slug: "brick-red-welcome", title: "Brick Red Welcome", tags: ["classic"], product: "heritage",
    overrides: { layout: "side-right", lite: "half", glass: "bands", sideliteGlass: "bands", colorDoorExt: COLOR.red } },
  { slug: "grand-entry", title: "Grand Entry", tags: ["classic", "trends"], product: "haven",
    overrides: { layout: "side-both-transom", height: "tall", lite: "three", glass: "arch", sideliteGlass: "arch", transomGlass: "arch", colorDoorExt: COLOR.black, handleFinish: FINISH.brass } },
  { slug: "double-contemporary", title: "Double Contemporary", tags: ["contemporary"], product: "meridian",
    overrides: { layout: "double", lite: "three", glass: "linear", colorDoorExt: COLOR.gray, handle: "bar", handleFinish: FINISH.matteBlack } },
  { slug: "sunlit-transom", title: "Sunlit Transom", tags: ["contemporary", "trends"], product: "solstice",
    overrides: { layout: "transom", glass: "clear", transomGlass: "clear", colorDoorExt: COLOR.white, handle: "pull", handleFinish: FINISH.matteBlack } },
  { slug: "sand-and-brass", title: "Sand & Brass", tags: ["classic", "trends"], product: "haven",
    overrides: { lite: "half", glass: "ripple", colorDoorExt: COLOR.beige, handleFinish: FINISH.brass } },
  { slug: "evergreen-sidelites", title: "Evergreen Sidelites", tags: ["contemporary"], product: "solstice",
    overrides: { layout: "side-both", lite: "half", glass: "bands", sideliteGlass: "bands", colorDoorExt: COLOR.green } },
  { slug: "tall-black", title: "Tall & Black", tags: ["contemporary", "trends"], product: "axis",
    overrides: { handle: "pull", handleFinish: FINISH.chrome } },
  { slug: "coastal-blue", title: "Coastal Blue", tags: ["classic", "trends"], product: "haven",
    overrides: { layout: "side-left-transom", lite: "three", glass: "frosted", sideliteGlass: "frosted", transomGlass: "frosted", colorDoorExt: COLOR.blue, handleFinish: FINISH.chrome } },
];

export function presetConfig(slug: string): Selections | null {
  const p = PRESETS.find((x) => x.slug === slug);
  return p ? createConfig(CATALOGUE, p.product, p.overrides).config : null;
}
