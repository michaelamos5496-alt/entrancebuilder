"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { GLASS_FAMILIES, type Group } from "@/domain/catalogue/data";
import type { Evaluation } from "@/domain/engine/types";
import type { Selections, SelectionKey } from "@/domain/design/types";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { OptionThumb } from "./OptionThumb";
import { GlassThumb } from "./GlassThumb";

interface CommonProps {
  group: Group;
  selections: Selections;
  /** availability for the current configuration, from the rules engine */
  evaluation: Evaluation;
  onSelect: <K extends SelectionKey>(key: K, value: Selections[K]) => void;
  disabled?: boolean;
}

/** Arrow-key navigation over a grid of toggle buttons (roving focus without breaking Tab order). */
function useGridKeys(columns: number) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const move: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    const d = move[e.key];
    if (!d) return;
    const items = refs.current.filter(Boolean) as HTMLButtonElement[];
    const target = items[i + d];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };
  return { refs, onKeyDown };
}

export function ChoiceGrid({ group, selections, evaluation, onSelect, disabled }: CommonProps) {
  const cols = group.columns ?? 3;
  const { refs, onKeyDown } = useGridKeys(cols);
  const value = selections[group.key] as string;
  return (
    <div role="radiogroup" aria-label={group.title} className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {group.options?.map((o, i) => {
        const st = evaluation.options[group.key]?.[o.value] ?? { available: false };
        const off = disabled || !st.available;
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={sel}
            aria-disabled={off || undefined}
            title={!st.available ? st.reason : undefined}
            onClick={() => { if (!off) onSelect(group.key, o.value as never); }}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "group flex flex-col items-center gap-1.5 rounded-md border-2 bg-surface px-2 pb-2.5 pt-2 text-center text-xs font-medium leading-tight transition",
              sel ? "border-ink text-ink shadow-card" : "border-transparent bg-canvas text-muted hover:border-line hover:text-ink",
              off && "cursor-not-allowed opacity-45",
            )}
          >
            <OptionThumb group={group.key} value={o.value} />
            <span>{o.label}</span>
            {!st.available && <span className="text-[10px] font-normal text-muted">{st.reason}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function SwatchGrid({ group, selections, evaluation, onSelect, disabled }: CommonProps) {
  const value = selections[group.key] as string;
  const { refs, onKeyDown } = useGridKeys(6);
  return (
    <div role="radiogroup" aria-label={group.title} className="grid grid-cols-6 gap-3">
      {group.palette?.map((c, i) => {
        const sel = value.toLowerCase() === c.value.toLowerCase();
        const st = evaluation.options[group.key]?.[c.value] ?? { available: false };
        return (
          <button
            key={c.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={sel}
            aria-label={st.available ? c.label : `${c.label} (unavailable)`}
            aria-disabled={!st.available || undefined}
            title={st.available ? c.label : `${c.label}: ${st.reason ?? "unavailable"}`}
            disabled={disabled}
            onClick={() => { if (st.available) onSelect(group.key, c.value as never); }}
            onKeyDown={(e) => onKeyDown(e, i)}
            style={{ background: c.value }}
            className={cn(
              "relative aspect-square rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.22)] transition hover:scale-110 disabled:opacity-40 disabled:hover:scale-100",
              sel && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
              !st.available && "cursor-not-allowed opacity-25 hover:scale-100",
            )}
          >
            {sel && (
              <span className={cn("absolute inset-0 grid place-items-center", parseInt(c.value.slice(1), 16) > 0x888888 ? "text-ink" : "text-white")}>
                <Icon name="check" size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function GlassPicker({ group, selections, evaluation, onSelect, disabled }: CommonProps) {
  const [family, setFamily] = useState<(typeof GLASS_FAMILIES)[number]>("All");
  const { refs, onKeyDown } = useGridKeys(3);
  const value = selections[group.key] as string;
  const options = (group.options ?? []).filter((o) => family === "All" || o.family === family);
  return (
    <div>
      <div role="group" aria-label={`${group.title} family`} className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {GLASS_FAMILIES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={family === f}
            onClick={() => setFamily(f)}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors",
              family === f ? "bg-ink text-white" : "bg-canvas text-muted hover:text-ink",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {options.length === 0 ? (
        <p className="rounded-md bg-canvas px-3 py-4 text-sm text-muted">No glass in this family yet.</p>
      ) : (
        <div role="radiogroup" aria-label={group.title} className="grid grid-cols-3 gap-2">
          {options.map((o, i) => {
            const sel = value === o.value;
            const st = evaluation.options[group.key]?.[o.value] ?? { available: false };
            return (
              <button
                key={o.value}
                ref={(el) => { refs.current[i] = el; }}
                type="button"
                role="radio"
                aria-checked={sel}
                aria-disabled={!st.available || undefined}
                title={st.available ? undefined : st.reason}
                disabled={disabled}
                onClick={() => { if (st.available) onSelect(group.key, o.value as never); }}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-md border-2 px-2 pb-2.5 pt-2 text-center text-xs font-medium transition disabled:opacity-40",
                  sel ? "border-ink bg-surface text-ink shadow-card" : "border-transparent bg-canvas text-muted hover:border-line hover:text-ink",
                  !st.available && "cursor-not-allowed opacity-40",
                )}
              >
                <GlassThumb kind={o.value as never} />
                <span>{o.label}</span>
                {!st.available && <span className="text-[10px] font-normal text-muted">{st.reason}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ToggleRow({ group, selections, onSelect }: CommonProps) {
  const on = selections[group.key] as boolean;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onSelect(group.key, !on as never)}
      className="flex w-full items-center justify-between gap-4 rounded-md bg-canvas px-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-bold">{group.title}</span>
        {group.hint && <span className="block text-xs text-muted">{group.hint}</span>}
      </span>
      <span aria-hidden className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors", on ? "bg-ink" : "bg-line")}>
        <span className={cn("absolute top-1 size-4 rounded-full bg-white transition-all", on ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}
