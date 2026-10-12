import type { Group } from "@/domain/catalogue/data";
import type { SelectionKey, Selections } from "@/domain/design/types";

/** Everything that can be configured except the product itself. */
export type SupportKey = Exclude<SelectionKey, "product" | "matchFrame">;

export type StyleKey = "classic" | "contemporary";

// ---- assets ---------------------------------------------------------------------------

export type AssetId = string;

/**
 * Every visual the catalogue refers to is listed here. Nothing else may be referenced by id.
 *  - "schematic": drawn by the 2D stand-in renderer from a configuration (no file).
 *  - "image": a file under /public.
 */
export interface AssetEntry {
  id: AssetId;
  kind: "schematic" | "image";
  alt: string;
  /** public URL for kind "image" */
  src?: string;
  /** provenance, so no asset of unknown licence slips in */
  license: string;
}

// ---- products -------------------------------------------------------------------------

export interface Product {
  id: string;
  name: string;
  blurb: string;
  style: StyleKey;
  /** thumbnail in the asset manifest */
  assetId: AssetId;
  /**
   * Allowed values per group. A group that is not listed accepts every value in the option registry.
   * Colours are listed as hex values from the palette.
   */
  supports: Partial<Record<SupportKey, readonly string[]>>;
  /** Preferred values, used when the product is selected and when a value must be replaced. */
  defaults: Partial<Selections>;
}

// ---- rules ----------------------------------------------------------------------------

/**
 * Serialisable conditions (so rules can later live in the database as JSON).
 * `layout` predicates read the layout without listing every layout key.
 */
export type Pred =
  | { field: SelectionKey; in: readonly (string | boolean)[] }
  | { layout: "sidelite" | "transom" | "double" }
  | { all: readonly Pred[] }
  | { any: readonly Pred[] }
  | { not: Pred };

/**
 * What to change so a locked group or a blocked option becomes usable. Selecting such an option applies it first,
 * so no choice is ever a dead end. `note` is shown to the user ("Adds a sidelite to your layout.").
 */
export interface Unlock {
  set?: Partial<Record<SelectionKey, string | boolean>>;
  /** layout edits that keep what the user already has (e.g. keep the transom when adding a sidelite) */
  layout?: "addSidelite" | "addTransom" | "single";
  note: string;
}

export type Rule =
  | {
      id: string;
      kind: "groupLockedWhen";
      /** the group cannot be changed while `when` holds; its stored value is preserved */
      groups: readonly SelectionKey[];
      when: Pred;
      reason: string;
      unlock?: Unlock;
    }
  | {
      id: string;
      kind: "optionBlockedWhen";
      group: SelectionKey;
      values: readonly string[];
      when: Pred;
      reason: string;
      unlock?: Unlock;
    }
  | {
      id: string;
      kind: "follow";
      /** target is forced equal to source while `when` holds */
      target: SelectionKey;
      source: SelectionKey;
      when: Pred;
    };

// ---- catalogue ------------------------------------------------------------------------

export interface Catalogue {
  version: string;
  groups: readonly Group[];
  products: readonly Product[];
  rules: readonly Rule[];
  assets: Readonly<Record<AssetId, AssetEntry>>;
  /** values used before a product's own defaults are applied */
  baseDefaults: Omit<Selections, "product">;
  defaultProductId: string;
}

// ---- evaluation & changes -------------------------------------------------------------

export interface State {
  available: boolean;
  reason?: string;
  /** set when the user can still pick this: choosing it makes the stated change first */
  fix?: string;
}

export interface Evaluation {
  groups: Record<SelectionKey, State>;
  /** per group, per option value */
  options: Partial<Record<SelectionKey, Record<string, State>>>;
}

export interface Change {
  key: SelectionKey;
  from: string | boolean;
  to: string | boolean;
  /**
   * "reset": a value stopped being compatible and was replaced (tell the user).
   * "follow": a value was kept in sync by a `follow` rule (not worth a notice).
   * "repair": a stored/imported value was invalid and replaced while restoring.
   * "adjust": changed on purpose so the option the user just picked works (tell the user).
   */
  kind: "reset" | "follow" | "repair" | "adjust";
  reason: string;
}
