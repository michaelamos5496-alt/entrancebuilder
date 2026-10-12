import type { GlassKey, LayoutKey, Selections } from "@/domain/design/types";
import type { Product, SupportKey } from "@/domain/engine/types";
import { COLOR, FINISH } from "./data";

/**
 * SAMPLE products — five fictional models, deliberately small. Each supports a different subset
 * so compatibility behaviour is visible and testable. Names are original (no third-party marks).
 */
const ALL_LAYOUTS: LayoutKey[] = [
  "single", "side-left", "side-right", "side-both", "transom",
  "side-left-transom", "side-right-transom", "side-both-transom", "double",
];

/** Door, frame (both sides) and interior colors share one list per product. */
function colors(list: readonly string[]): Partial<Record<SupportKey, readonly string[]>> {
  return { colorDoorExt: list, colorFrameExt: list, colorDoorInt: list, colorFrameInt: list };
}

/** The same glass list applies to the door lite, sidelites and transom. */
function glass(list: readonly GlassKey[]): Partial<Record<SupportKey, readonly string[]>> {
  return { glass: list, sideliteGlass: list, transomGlass: list };
}

export const PRODUCTS: readonly Product[] = [
  {
    id: "haven",
    name: "Haven",
    blurb: "Traditional raised panels with the widest choice of layouts and glass.",
    style: "classic",
    assetId: "product.haven",
    supports: {
      layout: ALL_LAYOUTS,
      height: ["std", "tall"],
      lite: ["none", "half", "three"],
      accessory: ["none", "knocker", "kick", "mail"],
      ...glass(["mosaic", "arch", "frosted", "ripple", "frame", "bands", "clear"]),
      glassFrame: ["slim", "wide", "none"],
      ...colors([COLOR.black, COLOR.charcoal, COLOR.gray, COLOR.beige, COLOR.navy, COLOR.blue, COLOR.green, COLOR.sage, COLOR.red, COLOR.brown, COLOR.white]),
      handle: ["lever", "knob", "pull"],
      handleFinish: [FINISH.matteBlack, FINISH.nickel, FINISH.brass, FINISH.chrome, FINISH.bronze, FINISH.copper],
    },
    defaults: { lite: "none", glass: "frame", sideliteGlass: "frame", transomGlass: "frame", colorDoorExt: COLOR.navy, handle: "lever", handleFinish: FINISH.matteBlack },
  },
  {
    id: "heritage",
    name: "Heritage",
    blurb: "Classic single-height doors with stained-glass lites and period hardware.",
    style: "classic",
    assetId: "product.heritage",
    supports: {
      layout: ["single", "side-left", "side-right", "side-both", "transom", "side-both-transom"],
      height: ["std"],
      lite: ["none", "half"],
      accessory: ["none", "knocker", "kick", "mail"],
      ...glass(["mosaic", "arch", "frosted", "frame", "bands"]),
      glassFrame: ["slim", "wide"],
      ...colors([COLOR.black, COLOR.charcoal, COLOR.beige, COLOR.navy, COLOR.green, COLOR.red, COLOR.brown, COLOR.white]),
      handle: ["lever", "knob"],
      handleFinish: [FINISH.matteBlack, FINISH.nickel, FINISH.brass, FINISH.bronze],
    },
    defaults: { lite: "half", glass: "mosaic", sideliteGlass: "mosaic", transomGlass: "mosaic", colorDoorExt: COLOR.red, handle: "lever", handleFinish: FINISH.brass },
  },
  {
    id: "meridian",
    name: "Meridian",
    blurb: "Flat contemporary slab with linear grooves and modern glazing.",
    style: "contemporary",
    assetId: "product.meridian",
    supports: {
      layout: ["single", "side-left", "side-right", "transom", "double"],
      height: ["std", "tall"],
      lite: ["none", "half", "three"],
      accessory: ["none", "kick", "mail"],
      ...glass(["frosted", "linear", "clear", "grid", "blinds", "vent"]),
      glassFrame: ["slim", "wide", "none"],
      ...colors([COLOR.black, COLOR.charcoal, COLOR.gray, COLOR.navy, COLOR.blue, COLOR.sage, COLOR.white]),
      handle: ["bar", "pull"],
      handleFinish: [FINISH.matteBlack, FINISH.nickel, FINISH.chrome],
    },
    defaults: { lite: "none", glass: "linear", sideliteGlass: "linear", transomGlass: "linear", colorDoorExt: COLOR.charcoal, handle: "bar", handleFinish: FINISH.nickel },
  },
  {
    id: "axis",
    name: "Axis",
    blurb: "Tall, minimal and monochrome: single or double, with a full-height lite.",
    style: "contemporary",
    assetId: "product.axis",
    supports: {
      layout: ["single", "double"],
      height: ["tall"],
      lite: ["none", "three"],
      accessory: ["none", "kick"],
      ...glass(["linear", "clear", "frosted"]),
      glassFrame: ["slim", "none"],
      ...colors([COLOR.black, COLOR.charcoal, COLOR.gray, COLOR.white]),
      handle: ["bar", "pull"],
      handleFinish: [FINISH.matteBlack, FINISH.chrome],
    },
    defaults: { height: "tall", lite: "three", glass: "linear", sideliteGlass: "linear", transomGlass: "linear", glassFrame: "none", colorDoorExt: COLOR.black, handle: "bar", handleFinish: FINISH.chrome },
  },
  {
    id: "solstice",
    name: "Solstice",
    blurb: "Glass-forward contemporary door: always glazed, with sidelites and transoms.",
    style: "contemporary",
    assetId: "product.solstice",
    supports: {
      layout: ["single", "transom", "side-both", "side-both-transom"],
      height: ["std", "tall"],
      lite: ["half", "three"],
      accessory: ["none", "mail"],
      ...glass(["frosted", "clear", "linear", "grid", "blinds", "vent", "bands"]),
      glassFrame: ["slim", "wide", "none"],
      ...colors([COLOR.black, COLOR.charcoal, COLOR.gray, COLOR.beige, COLOR.blue, COLOR.green, COLOR.sage, COLOR.white]),
      handle: ["bar", "pull", "lever"],
      handleFinish: [FINISH.matteBlack, FINISH.nickel, FINISH.brass, FINISH.chrome, FINISH.bronze, FINISH.copper],
    },
    defaults: { lite: "three", glass: "clear", sideliteGlass: "clear", transomGlass: "clear", colorDoorExt: COLOR.sage, handle: "pull", handleFinish: FINISH.matteBlack },
  },
];

export const DEFAULT_PRODUCT_ID = "haven";

export type { Selections };
