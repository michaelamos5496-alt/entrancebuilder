import type { Group } from "@/domain/catalogue/data";
import type { SelectionKey, Selections } from "@/domain/design/types";
import { hasLeftSide, hasRightSide, hasTransom, isDouble } from "@/domain/design/layout";
import type { LayoutKey } from "@/domain/design/types";
import { evalPred } from "./predicate";
import type { Catalogue, Evaluation, Product, State, SupportKey, Unlock } from "./types";

export type Value = string | boolean;
export interface Fix {
  sets: [SelectionKey, Value][];
  note: string;
}

/** The layout that has what the user has now, plus one more feature. */
function layoutFor(current: LayoutKey, how: NonNullable<Unlock["layout"]>): LayoutKey {
  if (how === "single") return "single";
  const transom = how === "addTransom" ? true : hasTransom(current);
  const left = isDouble(current) ? false : hasLeftSide(current);
  const right = isDouble(current) ? false : hasRightSide(current);
  const sides = how === "addSidelite" && !left && !right ? { left: false, right: true } : { left, right };
  const base = sides.left && sides.right ? "side-both" : sides.left ? "side-left" : sides.right ? "side-right" : transom ? "transom" : "single";
  return (base !== "transom" && base !== "single" && transom ? `${base}-transom` : base) as LayoutKey;
}

function fromUnlock(u: Unlock, cfg: Selections): Fix {
  const sets: [SelectionKey, Value][] = Object.entries(u.set ?? {}) as [SelectionKey, Value][];
  if (u.layout) sets.push(["layout", layoutFor(cfg.layout, u.layout)]);
  return { sets, note: u.note };
}

/** A door model that supports `value` for `key`, preferring the current style and then catalogue order. */
export function productSupporting(c: Catalogue, cfg: Selections, key: SelectionKey, value: string): Product | undefined {
  const ok = (p: Product) => {
    const list = p.supports[key as SupportKey];
    return !list || list.includes(value);
  };
  const current = c.products.find((p) => p.id === cfg.product);
  return c.products.find((p) => ok(p) && p.style === current?.style && p.id !== cfg.product) ?? c.products.find((p) => ok(p) && p.id !== cfg.product);
}

/**
 * What would make `key = value` selectable, or null if nothing can. Pure; checks locks first, then product support,
 * then blocked options. Applying the fix may reveal the next obstacle, so callers loop.
 */
export function fixFor(c: Catalogue, cfg: Selections, key: SelectionKey, value: Value, group: Group): Fix | null {
  for (const r of c.rules) {
    if (r.kind === "groupLockedWhen" && r.groups.includes(key) && evalPred(r.when, cfg)) return r.unlock ? fromUnlock(r.unlock, cfg) : null;
  }
  if (group.kind === "toggle") return null;
  if (group.kind !== "product") {
    const product = c.products.find((p) => p.id === cfg.product);
    const list = product?.supports[key as SupportKey];
    if (list && !list.includes(String(value))) {
      const p = productSupporting(c, cfg, key, String(value));
      return p ? { sets: [["product", p.id]], note: `Switches to the ${p.name} door, which offers this.` } : null;
    }
  }
  for (const r of c.rules) {
    if (r.kind === "optionBlockedWhen" && r.group === key && r.values.includes(String(value)) && evalPred(r.when, cfg)) {
      return r.unlock ? fromUnlock(r.unlock, cfg) : null;
    }
  }
  return null;
}

/**
 * UI helper: adds "choosing this switches X" hints for options the current door model lacks. Kept out of `evaluate`
 * because reconcile calls that many times and the hint is only needed for display.
 */
export function withFixHints(c: Catalogue, cfg: Selections, ev: Evaluation): Evaluation {
  const options: Evaluation["options"] = {};
  for (const [key, states] of Object.entries(ev.options) as [SelectionKey, Record<string, State>][]) {
    const next: Record<string, State> = {};
    for (const [v, st] of Object.entries(states)) {
      if (st.available || st.fix || !st.reason?.startsWith("Not available on ")) { next[v] = st; continue; }
      const p = productSupporting(c, cfg, key, v);
      next[v] = p ? { ...st, fix: `Switches to ${p.name}.` } : st;
    }
    options[key] = next;
  }
  return { groups: ev.groups, options };
}
