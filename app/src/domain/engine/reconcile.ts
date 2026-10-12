import type { Selections } from "@/domain/design/types";
import { evalPred } from "./predicate";
import { evaluate, findGroup, getProduct, groupOrder, labelOf, valuesOf, type Value } from "./evaluate";
import type { Catalogue, Change } from "./types";

const MAX_PASSES = 12;

export interface Reconciled {
  config: Selections;
  changes: Change[];
}

/**
 * Make a configuration valid while changing as little as possible.
 *  - Walks groups in a fixed order (product first), so earlier choices win over later ones.
 *  - Locked groups are left alone (their value returns when the lock lifts).
 *  - An unavailable current value is replaced by the product default, else the base default, else the first available option.
 *  - Re-evaluates after every replacement, until nothing changes (bounded).
 * Idempotent: reconcile(reconcile(x)) === reconcile(x).
 */
export function reconcile(c: Catalogue, input: Selections): Reconciled {
  const config: Selections = { ...input };
  const changes: Change[] = [];
  const order = groupOrder(c);

  if (!getProduct(c, config.product)) {
    const to = c.defaultProductId;
    changes.push({ key: "product", from: config.product, to, kind: "reset", reason: "That door model is no longer available." });
    config.product = to;
  }

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    const ev = evaluate(c, config);

    for (const key of order) {
      const group = findGroup(c, key);
      if (group.kind === "toggle" || !ev.groups[key].available) continue;
      const cur = config[key] as Value;
      if (ev.options[key]?.[String(cur)]?.available) continue;

      const product = getProduct(c, config.product);
      const states = ev.options[key] ?? {};
      const candidates: Value[] = [
        product?.defaults[key] as Value,
        (c.baseDefaults as unknown as Record<string, Value>)[key],
        ...valuesOf(c, key),
      ].filter((v): v is Value => v !== undefined);
      const next = candidates.find((v) => states[String(v)]?.available);
      if (next === undefined) continue; // validateCatalogue guarantees this cannot happen

      const why = states[String(cur)]?.reason ?? "That option isn't available here.";
      (config as unknown as Record<string, Value>)[key] = next;
      changes.push({
        key, from: cur, to: next, kind: "reset",
        reason: `${group.title}: ${labelOf(c, key, cur)} → ${labelOf(c, key, next)}. ${why}`,
      });
      changed = true;
      break; // availability of later groups depends on this one: re-evaluate
    }

    if (!changed) {
      for (const r of c.rules) {
        if (r.kind !== "follow" || !evalPred(r.when, config)) continue;
        const from = config[r.target] as Value;
        const to = config[r.source] as Value;
        if (from !== to) {
          (config as unknown as Record<string, Value>)[r.target] = to;
          changes.push({ key: r.target, from, to, kind: "follow", reason: `${findGroup(c, r.target).title} follows ${findGroup(c, r.source).title}.` });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return { config, changes };
}

/** The configuration for a product with nothing customised yet. */
export function createConfig(c: Catalogue, productId: string = c.defaultProductId, overrides: Partial<Selections> = {}): Reconciled {
  const product = getProduct(c, productId) ?? getProduct(c, c.defaultProductId)!;
  return reconcile(c, { ...c.baseDefaults, ...product.defaults, ...overrides, product: product.id } as Selections);
}
