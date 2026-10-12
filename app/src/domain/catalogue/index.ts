import type { Catalogue } from "@/domain/engine/types";
import { ASSETS } from "./assets";
import { GROUPS } from "./data";
import { DEFAULT_PRODUCT_ID, PRODUCTS } from "./products";
import { RULES } from "./rules";

/** The single, immutable sample catalogue. Phase 6 replaces the source (database) but not the shape. */
export const CATALOGUE: Catalogue = {
  version: "2026.10-sample.1",
  groups: GROUPS,
  products: PRODUCTS,
  rules: RULES,
  assets: ASSETS,
  defaultProductId: DEFAULT_PRODUCT_ID,
  baseDefaults: {
    layout: "single",
    height: "std",
    hand: "left",
    lite: "none",
    accessory: "none",
    sideliteStyle: "match",
    glass: "frame",
    glassFrame: "slim",
    sideliteGlass: "frame",
    transomGlass: "frame",
    matchFrame: true,
    colorDoorExt: "#2b3a4f",
    colorFrameExt: "#2b3a4f",
    colorDoorInt: "#f4f3ef",
    colorFrameInt: "#f4f3ef",
    colorSill: "#a9a9a7",
    handle: "lever",
    handleFinish: "#25272b",
  },
};

export { getAsset } from "./assets";
