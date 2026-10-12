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
    <div role="radiogroup" aria-label={label} className={cn("glass inline-flex rounded-full p-1", className)}>
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
              "rounded-full px-3 py-1.5 text-sm font-semibold tracking-tight transition-colors disabled:opacity-40 sm:px-4 sm:py-2",
              checked ? "bg-slate text-white shadow-[0_6px_14px_-6px_rgb(0_0_0/0.6)]" : "text-ink/65 hover:text-ink",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
