import type { Group } from "@/domain/catalogue/data";
import type { SelectionKey, Selections } from "@/domain/design/types";
import { evalPred } from "./predicate";
import type { Catalogue, Evaluation, Product, State, SupportKey } from "./types";

export type Value = string | boolean;

export function findGroup(c: Catalogue, key: SelectionKey): Group {
  const g = c.groups.find((x) => x.key === key);
  if (!g) throw new Error(`Unknown group "${key}"`);
  return g;
}

export function getProduct(c: Catalogue, id: string): Product | undefined {
  return c.products.find((p) => p.id === id);
}

/** Every value that exists for a group in the catalogue (before any product or rule filtering). */
export function valuesOf(c: Catalogue, key: SelectionKey): readonly Value[] {
  const g = findGroup(c, key);
  if (g.kind === "toggle") return [true, false];
  if (g.kind === "product") return c.products.map((p) => p.id);
  if (g.kind === "color") return (g.palette ?? []).map((x) => x.value);
  return (g.options ?? []).map((o) => o.value);
}

/** The order reconciliation walks: product first (root), then groups as declared. */
export function groupOrder(c: Catalogue): SelectionKey[] {
  return ["product", ...c.groups.map((g) => g.key).filter((k) => k !== "product")];
}

/**
 * Pure: which groups are locked and which options are available for a configuration.
 * Locked groups keep their stored value. Unavailable options cannot be selected.
 */
export function evaluate(c: Catalogue, cfg: Selections): Evaluation {
  const product = getProduct(c, cfg.product);
  const groups = {} as Evaluation["groups"];
  for (const g of c.groups) groups[g.key] = { available: true };

  for (const r of c.rules) {
    if (r.kind === "groupLockedWhen" && evalPred(r.when, cfg)) {
      for (const k of r.groups) if (groups[k].available) groups[k] = { available: false, reason: r.reason, fix: r.unlock?.note };
    }
  }

  const options: Evaluation["options"] = {};
  for (const g of c.groups) {
    if (g.kind === "toggle") continue;
    const states: Record<string, State> = {};
    const supported = product?.supports[g.key as SupportKey];
    for (const v of valuesOf(c, g.key) as string[]) {
      if (g.kind !== "product" && supported && !supported.includes(v)) {
        states[v] = { available: false, reason: `Not available on ${product?.name ?? "this door"}.` };
      } else {
        states[v] = { available: true };
      }
    }
    options[g.key] = states;
  }
  for (const r of c.rules) {
    if (r.kind === "optionBlockedWhen" && evalPred(r.when, cfg)) {
      const states = options[r.group];
      if (!states) continue;
      for (const v of r.values) if (states[v]?.available) states[v] = { available: false, reason: r.reason, fix: r.unlock?.note };
    }
  }
  return { groups, options };
}

/** Can the user set this right now? (group not locked, option available, value exists) */
export function canSet(c: Catalogue, cfg: Selections, key: SelectionKey, value: Value): State {
  const ev = evaluate(c, cfg);
  const g = ev.groups[key];
  if (!g) return { available: false, reason: "Unknown option." };
  if (!g.available) return g;
  const group = findGroup(c, key);
  if (group.kind === "toggle") return typeof value === "boolean" ? { available: true } : { available: false, reason: "Invalid value." };
  return ev.options[key]?.[String(value)] ?? { available: false, reason: "That option does not exist." };
}

/** Display label of a stored value (product name, option label, color name, On/Off). */
export function labelOf(c: Catalogue, key: SelectionKey, v: Value): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  const g = findGroup(c, key);
  if (g.kind === "product") return c.products.find((p) => p.id === v)?.name ?? v;
  return (g.options ?? g.palette ?? []).find((o) => o.value === v)?.label ?? v;
}
