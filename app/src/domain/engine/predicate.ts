import { hasSidelite, hasTransom, isDouble } from "@/domain/design/layout";
import type { Selections } from "@/domain/design/types";
import type { Pred } from "./types";

export function evalPred(p: Pred, cfg: Selections): boolean {
  if ("field" in p) return p.in.includes(cfg[p.field] as string | boolean);
  if ("layout" in p) {
    if (p.layout === "sidelite") return hasSidelite(cfg.layout);
    if (p.layout === "transom") return hasTransom(cfg.layout);
    return isDouble(cfg.layout);
  }
  if ("all" in p) return p.all.every((q) => evalPred(q, cfg));
  if ("any" in p) return p.any.some((q) => evalPred(q, cfg));
  return !evalPred(p.not, cfg);
}

/** Every selection field a predicate reads (used to validate rule ordering). */
export function predFields(p: Pred): string[] {
  if ("field" in p) return [p.field];
  if ("layout" in p) return ["layout"];
  if ("all" in p) return p.all.flatMap(predFields);
  if ("any" in p) return p.any.flatMap(predFields);
  return predFields(p.not);
}
