import { predFields } from "./predicate";
import { groupOrder, valuesOf } from "./evaluate";
import { createConfig } from "./reconcile";
import type { Catalogue, SupportKey } from "./types";

/**
 * Structural checks that make the catalogue trustworthy. Returns human-readable problems (empty = valid).
 * Run in tests; cheap enough to run in development too.
 */
export function validateCatalogue(c: Catalogue): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);
  const keys = c.groups.map((g) => g.key);
  const order = groupOrder(c);
  const index = (k: string) => order.indexOf(k as never);

  if (new Set(keys).size !== keys.length) err("Duplicate group keys.");
  for (const g of c.groups) {
    if (g.kind !== "toggle" && valuesOf(c, g.key).length === 0) err(`Group "${g.key}" has no options.`);
    const vals = valuesOf(c, g.key).map(String);
    if (new Set(vals).size !== vals.length) err(`Group "${g.key}" has duplicate option values.`);
    if (g.kind === "color") for (const v of vals) if (!/^#[0-9a-f]{6}$/i.test(v)) err(`Group "${g.key}" has a non-hex color "${v}".`);
  }

  // base defaults
  for (const [k, v] of Object.entries(c.baseDefaults)) {
    if (!keys.includes(k as never)) err(`baseDefaults has unknown key "${k}".`);
    else if (!valuesOf(c, k as never).includes(v as never)) err(`baseDefaults.${k} = "${String(v)}" is not an option.`);
  }

  // products
  const ids = c.products.map((p) => p.id);
  if (new Set(ids).size !== ids.length) err("Duplicate product ids.");
  if (!ids.includes(c.defaultProductId)) err(`defaultProductId "${c.defaultProductId}" is not a product.`);
  for (const p of c.products) {
    if (!c.assets[p.assetId]) err(`Product "${p.id}" references missing asset "${p.assetId}".`);
    for (const [k, list] of Object.entries(p.supports) as [SupportKey, readonly string[]][]) {
      if (!keys.includes(k)) { err(`Product "${p.id}" supports unknown group "${k}".`); continue; }
      if (list.length === 0) err(`Product "${p.id}" supports nothing for "${k}".`);
      for (const v of list) if (!valuesOf(c, k).includes(v)) err(`Product "${p.id}" lists "${v}" for "${k}", which is not in the catalogue.`);
    }
    for (const [k, v] of Object.entries(p.defaults)) {
      if (!keys.includes(k as never)) { err(`Product "${p.id}" defaults has unknown key "${k}".`); continue; }
      const sup = p.supports[k as SupportKey];
      if (!valuesOf(c, k as never).includes(v as never)) err(`Product "${p.id}" default ${k}="${String(v)}" is not an option.`);
      else if (sup && !sup.includes(v as string)) err(`Product "${p.id}" default ${k}="${String(v)}" is not supported by the product.`);
    }
    const built = createConfig(c, p.id);
    const bad = built.changes.filter((ch) => ch.kind === "reset");
    if (bad.length) err(`Product "${p.id}" defaults are not self-consistent: ${bad.map((b) => b.key).join(", ")} had to be changed.`);
  }

  // rules
  for (const r of c.rules) {
    const affected = r.kind === "groupLockedWhen" ? r.groups : r.kind === "optionBlockedWhen" ? [r.group] : [r.target];
    for (const a of affected) if (!keys.includes(a)) err(`Rule "${r.id}" targets unknown group "${a}".`);
    if (r.kind === "optionBlockedWhen") for (const v of r.values) if (keys.includes(r.group) && !valuesOf(c, r.group).includes(v)) err(`Rule "${r.id}" blocks "${v}", which is not an option of "${r.group}".`);
    // "earlier choices win": a rule may only read groups that come before the group it restricts
    const read = r.kind === "follow" ? [r.source, ...predFields(r.when)] : predFields(r.when);
    for (const a of affected) for (const f of read) {
      if (!keys.includes(f as never)) err(`Rule "${r.id}" reads unknown group "${f}".`);
      else if (r.kind !== "follow" && index(f) >= index(a)) err(`Rule "${r.id}" restricts "${a}" using "${f}", which does not come before it.`);
    }
    if (r.kind === "follow") {
      for (const p of c.products) {
        const t = p.supports[r.target as SupportKey], s = p.supports[r.source as SupportKey];
        if ((t ?? []).slice().sort().join() !== (s ?? []).slice().sort().join()) err(`Product "${p.id}": "${r.target}" and "${r.source}" must support the same values because one follows the other.`);
      }
    }
  }
  return errors;
}
