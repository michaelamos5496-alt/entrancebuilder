import type { SelectionKey, Selections } from "@/domain/design/types";
import { findGroup, getProduct, valuesOf, type Value } from "./evaluate";
import { createConfig, reconcile } from "./reconcile";
import type { Catalogue, Change, StyleKey } from "./types";

export const SCHEMA_VERSION = 2;

/** The persisted/shared form of a configuration. Plain JSON, versioned. */
export type SerializedConfig = Selections & { schemaVersion: typeof SCHEMA_VERSION; catalogueVersion: string };

export function serialize(c: Catalogue, config: Selections): SerializedConfig {
  return { schemaVersion: SCHEMA_VERSION, catalogueVersion: c.version, ...config };
}

export type Deserialized =
  | { ok: true; config: Selections; repairs: Change[]; migratedFrom?: number }
  | { ok: false; error: string };

const LEGACY_STYLE_PRODUCT: Record<StyleKey, string> = { classic: "haven", contemporary: "meridian" };

/**
 * Restore from untrusted input (URL, storage). Never throws.
 *  - Not an object / from a newer schema  -> error.
 *  - Schema 1 (had `style`, no `product`)  -> migrated to the matching product.
 *  - Unknown or invalid individual values  -> replaced with defaults and reported as repairs.
 *  - The result always passes `reconcile` (valid for its product and the rules).
 */
export function deserialize(c: Catalogue, input: unknown): Deserialized {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, error: "Not a door configuration." };
  const src = input as Record<string, unknown>;
  const version = typeof src.schemaVersion === "number" ? src.schemaVersion : src.product === undefined ? 1 : SCHEMA_VERSION;
  if (version > SCHEMA_VERSION) return { ok: false, error: "This design was made with a newer version of the app." };

  const repairs: Change[] = [];
  let productId: string;
  if (typeof src.product === "string" && getProduct(c, src.product)) {
    productId = src.product;
  } else {
    const legacy = typeof src.style === "string" && (src.style === "classic" || src.style === "contemporary") ? LEGACY_STYLE_PRODUCT[src.style] : undefined;
    productId = legacy && getProduct(c, legacy) ? legacy : c.defaultProductId;
    if (src.product !== undefined && !legacy) {
      repairs.push({ key: "product", from: String(src.product), to: productId, kind: "repair", reason: "That door model doesn't exist, so the default model was used." });
    }
  }

  const base = createConfig(c, productId).config as unknown as Record<string, Value>;
  const candidate: Record<string, Value> = { ...base };
  for (const g of c.groups) {
    if (g.key === "product") continue;
    const v = src[g.key];
    if (v === undefined) continue;
    const key = g.key as SelectionKey;
    if (valuesOf(c, key).includes(v as Value)) {
      candidate[key] = v as Value;
    } else {
      repairs.push({ key, from: String(v), to: String(base[key]), kind: "repair", reason: `${findGroup(c, key).title}: “${String(v)}” isn't a valid option, so the default was used.` });
    }
  }

  const { config, changes } = reconcile(c, { ...candidate, product: productId } as unknown as Selections);
  return {
    ok: true,
    config,
    repairs: [...repairs, ...changes.filter((ch) => ch.kind === "reset").map((ch): Change => ({ ...ch, kind: "repair" }))],
    ...(version < SCHEMA_VERSION ? { migratedFrom: version } : {}),
  };
}

// ---- URL-safe text form ---------------------------------------------------------------

function toB64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(text: string): string {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

export function encodeConfig(c: Catalogue, config: Selections): string {
  return toB64Url(JSON.stringify(serialize(c, config)));
}

export function decodeConfig(c: Catalogue, token: string): Deserialized {
  try {
    return deserialize(c, JSON.parse(fromB64Url(token)));
  } catch {
    return { ok: false, error: "That link couldn't be read." };
  }
}
