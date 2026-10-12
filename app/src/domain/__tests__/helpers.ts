import { CATALOGUE } from "@/domain/catalogue";
import { evaluate, findGroup, valuesOf, type Value } from "@/domain/engine/evaluate";
import { createConfig, reconcile } from "@/domain/engine/reconcile";
import type { EngineAction } from "@/domain/engine/reducer";
import type { SelectionKey, Selections } from "@/domain/design/types";
import { expect } from "vitest";

export const C = CATALOGUE;
export const cfg = (product = "haven", overrides: Partial<Selections> = {}) => createConfig(C, product, overrides).config;

/** deterministic PRNG so failures are reproducible */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The invariant every reachable configuration must satisfy. */
export function assertValid(c: Selections, label = "") {
  const ev = evaluate(C, c);
  for (const g of C.groups) {
    const v = c[g.key] as Value;
    // every stored value must exist in the catalogue, locked or not
    expect(valuesOf(C, g.key), `${label} ${g.key}=${String(v)} not in catalogue`).toContain(v);
    if (g.kind === "toggle" || !ev.groups[g.key].available) continue;
    expect(ev.options[g.key]?.[String(v)]?.available, `${label} ${g.key}=${String(v)} is unavailable`).toBe(true);
  }
  const again = reconcile(C, c);
  expect(again.config, `${label} not a reconcile fixed point`).toEqual(c);
  if (c.matchFrame) {
    expect(c.colorFrameExt).toBe(c.colorDoorExt);
    expect(c.colorFrameInt).toBe(c.colorDoorInt);
  }
}

export function randomAction(rand: () => number): EngineAction {
  const r = rand();
  if (r < 0.04) return { type: "undo" };
  if (r < 0.08) return { type: "redo" };
  if (r < 0.09) return { type: "reset" };
  const groups = C.groups;
  const g = groups[Math.floor(rand() * groups.length)];
  const vals = valuesOf(C, g.key);
  // sometimes try values that are not allowed to prove they are rejected
  const value = vals[Math.floor(rand() * vals.length)];
  return { type: "set", key: g.key as SelectionKey, value };
}

export { findGroup };
