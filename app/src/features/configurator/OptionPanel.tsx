"use client";

import { useMemo, useState } from "react";
import { CATALOGUE } from "@/domain/catalogue";
import { COLOR_DISCLAIMER, GROUPS, GROUP_BY_KEY, STEPS, type Group } from "@/domain/catalogue/data";
import { getProduct, labelOf, type Value } from "@/domain/engine/evaluate";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { ChoiceGrid, GlassPicker, SwatchGrid, ToggleRow } from "./OptionControls";
import { ProductPicker } from "./ProductPicker";
import { useConfigurator } from "./store";

function GroupSection({ group }: { group: Group }) {
  const c = useConfigurator();
  const st = c.evaluation.groups[group.key];
  const common = { group, selections: c.selections, evaluation: c.evaluation, onSelect: c.select, disabled: !st.available };
  const current = group.kind === "toggle" ? undefined : labelOf(CATALOGUE, group.key, c.selections[group.key] as Value);

  return (
    <section className="mt-7" aria-labelledby={`g-${group.key}`}>
      {group.kind !== "toggle" && (
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h3 id={`g-${group.key}`} className="text-sm font-bold">{group.title}</h3>
          {st.available && <span className="truncate text-xs text-muted">{current}</span>}
        </div>
      )}
      {group.hint && group.kind !== "toggle" && st.available && <p className="-mt-1 mb-2.5 text-xs text-muted">{group.hint}</p>}
      {!st.available && group.kind !== "toggle" ? (
        <p className="flex items-start gap-2 rounded-md bg-canvas px-3 py-3 text-xs text-muted">
          <Icon name="info" size={16} className="mt-px shrink-0" />
          {st.reason}
        </p>
      ) : group.kind === "product" ? (
        <ProductPicker />
      ) : group.kind === "choice" ? (
        <ChoiceGrid {...common} />
      ) : group.kind === "glass" ? (
        <GlassPicker {...common} />
      ) : group.kind === "color" ? (
        <SwatchGrid {...common} />
      ) : (
        <ToggleRow {...common} />
      )}
    </section>
  );
}

function SearchResults({ query, onDone }: { query: string; onDone: () => void }) {
  const c = useConfigurator();
  const toast = useToast();
  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    const out: { group: Group; value: string; label: string }[] = [];
    for (const g of GROUPS) {
      if (g.kind === "product") {
        for (const p of CATALOGUE.products) {
          if (`${p.name} ${p.style} ${g.title}`.toLowerCase().includes(q)) out.push({ group: g, value: p.id, label: p.name });
        }
        continue;
      }
      for (const o of g.options ?? []) {
        if (`${o.label} ${g.title} ${o.family ?? ""}`.toLowerCase().includes(q)) out.push({ group: g, value: o.value, label: o.label });
      }
    }
    return out.slice(0, 30);
  }, [q]);

  if (hits.length === 0) {
    return <p className="mt-6 rounded-md bg-canvas px-4 py-6 text-center text-sm text-muted">No result found for “{query.trim()}”.</p>;
  }
  return (
    <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface">
      {hits.map((h) => {
        const stepIndex = STEPS.findIndex((s) => s.id === h.group.step);
        const st = c.evaluation.groups[h.group.key];
        const opt = c.evaluation.options[h.group.key]?.[h.value];
        return (
          <li key={`${h.group.key}-${h.value}`}>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas"
              onClick={() => {
                if (!st.available) {
                  toast(st.reason ?? "Not available right now.", "info");
                } else if (opt && !opt.available) {
                  toast(opt.reason ?? "Not available right now.", "info");
                } else {
                  c.select(h.group.key, h.value as never);
                }
                c.goStep(stepIndex);
                onDone();
              }}
            >
              <span>
                <span className="block text-sm font-bold">{h.label}</span>
                <span className="block text-xs text-muted">{STEPS[stepIndex].title} · {h.group.title}</span>
              </span>
              <Icon name="chevron" size={18} className="shrink-0 text-muted" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function OptionPanel() {
  const c = useConfigurator();
  const [query, setQuery] = useState("");
  const step = STEPS[c.step];
  const searching = query.trim().length > 0;
  const groups = GROUPS.filter((g) => g.step === step.id);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search options</span>
        <Icon name="search" size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search options (e.g. frosted, lever)"
          className="h-11 w-full rounded-md border border-line bg-surface pl-10 pr-3 text-sm placeholder:text-muted/80"
        />
      </label>

      {searching ? (
        <SearchResults query={query} onDone={() => setQuery("")} />
      ) : (
        <div key={step.id} className="anim-rise">
          <p className="mt-5 text-xs font-medium text-muted" data-testid="active-product">
            Active door: <strong className="text-ink">{getProduct(CATALOGUE, c.selections.product)?.name}</strong> · <span className="capitalize">{getProduct(CATALOGUE, c.selections.product)?.style}</span>
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">{step.heading}</h2>
          {groups.map((g) => <GroupSection key={g.key} group={g} />)}
          {step.id === "color" && <p className="mt-6 rounded-md bg-canvas px-3 py-3 text-xs text-muted">{COLOR_DISCLAIMER}</p>}
        </div>
      )}
    </div>
  );
}

export { GROUP_BY_KEY };
