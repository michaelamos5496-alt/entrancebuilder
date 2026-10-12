"use client";

import { CATALOGUE } from "@/domain/catalogue";
import { GROUPS, IMAGE_DISCLAIMER, STEPS, type Group } from "@/domain/catalogue/data";
import type { Selections } from "@/domain/design/types";
import { labelOf, type Value } from "@/domain/engine/evaluate";
import type { Evaluation } from "@/domain/engine/types";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useConfigurator } from "./store";

/** The rows of the summary / print sheet: every group that applies to this configuration. */
export function specRows(s: Selections, ev: Evaluation): { group: Group; label: string; swatch?: string }[] {
  return GROUPS.filter((g) => g.kind !== "toggle" && ev.groups[g.key].available).map((g) => {
    const v = s[g.key];
    return { group: g, label: labelOf(CATALOGUE, g.key, v as Value), swatch: g.kind === "color" ? String(v) : undefined };
  });
}

export function SummaryPanel({ onSave, onShare }: { onSave: () => void; onShare: () => void }) {
  const c = useConfigurator();
  const rows = specRows(c.selections, c.evaluation);

  return (
    <div className="anim-rise">
      <h2 className="mt-6 text-2xl font-bold tracking-tight">{c.savedName ?? "Your door"}</h2>
      <p className="mt-1 text-sm text-muted">Review every choice, change what you like, then save or share.</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Button onClick={onSave}><Icon name="save" size={18} /> Save</Button>
        <Button variant="secondary" onClick={onShare}><Icon name="share" size={18} /> Share</Button>
        <Button variant="secondary" onClick={() => window.print()}><Icon name="print" size={18} /> PDF</Button>
      </div>
      <p className="mt-2 text-xs text-muted">“PDF” opens your browser&apos;s print dialog — choose “Save as PDF”.</p>

      <dl className="mt-6 divide-y divide-line rounded-md border border-line bg-surface">
        {rows.map(({ group, label, swatch }) => {
          const stepIndex = STEPS.findIndex((s) => s.id === group.step);
          return (
            <div key={group.key} className="px-4 py-3">
              <dt className="text-xs text-muted">{group.title}</dt>
              <dd className="mt-0.5 flex items-center justify-between gap-3 text-sm font-bold">
                <span className="flex min-w-0 items-center gap-2" data-value>
                  {swatch && <span className="size-3.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.25)]" style={{ background: swatch }} />}
                  <span className="truncate">{label}</span>
                </span>
                <button
                  type="button"
                  onClick={() => c.goStep(stepIndex)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-brand hover:bg-brand-soft"
                  aria-label={`Modify ${group.title}`}
                >
                  Modify
                </button>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-4 text-xs text-muted">{IMAGE_DISCLAIMER}</p>
    </div>
  );
}
