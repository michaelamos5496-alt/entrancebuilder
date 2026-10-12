"use client";

import { useMemo, useRef, useState } from "react";
import { CATALOGUE } from "@/domain/catalogue";
import { GROUP_BY_KEY } from "@/domain/catalogue/data";
import { createConfig, reconcile } from "@/domain/engine/reconcile";
import type { Product, StyleKey } from "@/domain/engine/types";
import { cn } from "@/lib/cn";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { useConfigurator } from "./store";

type Filter = "all" | StyleKey;

const THUMB = new Map<string, ReturnType<typeof createConfig>["config"]>(
  CATALOGUE.products.map((p) => [p.id, createConfig(CATALOGUE, p.id).config]),
);

/** Door model cards. Selecting one sets the active product; the card previews what that would reset. */
export function ProductPicker() {
  const c = useConfigurator();
  const [filter, setFilter] = useState<Filter>("all");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const products = CATALOGUE.products.filter((p) => filter === "all" || p.style === filter);

  const resets = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const p of CATALOGUE.products) {
      if (p.id === c.selections.product) continue;
      const { changes } = reconcile(CATALOGUE, { ...c.selections, product: p.id });
      const keys = [...new Set(changes.filter((ch) => ch.kind === "reset" && ch.key !== "product").map((ch) => ch.key))];
      out.set(p.id, keys.map((k) => GROUP_BY_KEY.get(k)?.title ?? k));
    }
    return out;
  }, [c.selections]);

  function onKey(e: React.KeyboardEvent, i: number) {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    const t = refs.current.filter(Boolean)[i + d];
    if (t) { e.preventDefault(); t.focus(); }
  }

  return (
    <div>
      <div role="group" aria-label="Door style" className="mb-3 flex gap-1.5">
        {(["all", "classic", "contemporary"] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cn("rounded-full px-3 py-1.5 text-xs font-bold capitalize transition-colors", filter === f ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink")}
          >
            {f === "all" ? "All styles" : f}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Door model" className="grid grid-cols-2 gap-2.5">
        {products.map((p: Product, i) => {
          const sel = c.selections.product === p.id;
          const reset = resets.get(p.id) ?? [];
          return (
            <button
              key={p.id}
              ref={(el) => { refs.current[i] = el; }}
              type="button"
              role="radio"
              aria-checked={sel}
              aria-describedby={`prod-${p.id}-note`}
              onClick={() => c.select("product", p.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex flex-col overflow-hidden rounded-md border-2 bg-surface text-left transition",
                sel ? "border-ink shadow-card" : "border-line hover:border-muted",
              )}
            >
              <span className="block aspect-[4/5] bg-[#dfe3e6] p-2" aria-hidden>
                <SchematicDoor selections={THUMB.get(p.id)!} view="exterior" mode="cutout" className="size-full" />
              </span>
              <span className="block px-3 pb-3 pt-2">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{p.name}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{p.style}</span>
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{p.blurb}</span>
                <span id={`prod-${p.id}-note`} className={cn("mt-2 block text-[11px] font-medium", sel ? "text-success" : reset.length ? "text-brand" : "text-muted")}>
                  {sel ? "Selected" : reset.length ? `Switching will change: ${reset.join(", ")}` : "Fits your current choices"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
