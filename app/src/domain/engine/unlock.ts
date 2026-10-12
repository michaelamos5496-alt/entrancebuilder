import type { SelectionKey, Selections } from "@/domain/design/types";
import { canSet, findGroup, type Value } from "./evaluate";
import { reconcile } from "./reconcile";
import type { Catalogue, Change } from "./types";
import { fixFor } from "./unlockRules";

export interface Plan {
  config: Selections;
  /** changes made on purpose so the choice works */
  adjustments: Change[];
  /** other values that had to be replaced because of the new combination */
  resets: Change[];
}

const MAX_DEPTH = 4;

/**
 * Plan a user choice that is not selectable as things stand: apply whatever it needs (add a sidelite, switch the door
 * model, turn off "frame follows door"...) and then the choice itself. Returns null when no sequence of changes works,
 * and never returns a configuration where the chosen value did not stick. Pure.
 */
export function planSet(c: Catalogue, cfg: Selections, key: SelectionKey, value: Value, depth = 0): Plan | null {
  if (depth > MAX_DEPTH) return null;
  let cur = cfg;
  const adjustments: Change[] = [];
  const resets: Change[] = [];
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (canSet(c, cur, key, value).available) {
      const r = reconcile(c, { ...cur, [key]: value });
      if (r.config[key] !== value) return null;
      return { config: r.config, adjustments, resets: [...resets, ...r.changes.filter((ch) => ch.kind === "reset")] };
    }
    const fix = fixFor(c, cur, key, value, findGroup(c, key));
    if (!fix) return null;
    for (const [k, v] of fix.sets) {
      if (cur[k] === v) continue;
      const sub = planSet(c, cur, k, v, depth + 1);
      if (!sub) return null;
      adjustments.push(...sub.adjustments, { key: k, from: cur[k], to: sub.config[k], kind: "adjust", reason: fix.note });
      resets.push(...sub.resets);
      cur = sub.config;
    }
  }
  return null;
}
