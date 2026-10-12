"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

interface Item<T extends string> { value: T; label: string; disabled?: boolean; title?: string }

/** Radio-group semantics with roving tabindex and arrow-key navigation. */
export function SegmentedControl<T extends string>({
  label, items, value, onChange, className,
}: { label: string; items: readonly Item<T>[]; value: T; onChange: (v: T) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    for (let step = 1; step <= items.length; step++) {
      const j = (i + dir * step + items.length * step) % items.length;
      if (!items[j].disabled) {
        onChange(items[j].value);
        refs.current[j]?.focus();
        return;
      }
    }
  }

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-full bg-surface p-1 shadow-card", className)}>
      {items.map((it, i) => {
        const checked = it.value === value;
        return (
          <button
            key={it.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={it.disabled}
            title={it.title}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-bold transition-colors disabled:opacity-40 sm:px-4 sm:py-2",
              checked ? "bg-ink text-white" : "text-muted hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
