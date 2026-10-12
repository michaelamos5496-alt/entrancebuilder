"use client";

import Link from "next/link";
import { useState } from "react";
import { PRESETS, presetConfig } from "@/domain/design/defaults";
import { cn } from "@/lib/cn";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "contemporary", label: "Contemporary" },
  { id: "classic", label: "Classic" },
  { id: "trends", label: "Trends" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];
const PAGE = 6;

export function Inspiration() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [shown, setShown] = useState(PAGE);
  const list = PRESETS.filter((p) => filter === "all" || p.tags.includes(filter));

  return (
    <div>
      <div role="group" aria-label="Filter inspirations" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => { setFilter(f.id); setShown(PAGE); }}
            className={cn(
              "rounded-full px-5 py-2.5 text-sm font-bold transition-colors",
              filter === f.id ? "bg-slate text-white" : "glass text-ink hover:bg-white",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="mt-6"><EmptyState title="Nothing here yet">No inspirations match this filter.</EmptyState></div>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {list.slice(0, shown).map((p) => {
            const sel = presetConfig(p.slug)!;
            return (
              <li key={p.slug} className="anim-rise">
                <Link
                  href={`/configurator?preset=${p.slug}`}
                  className="group block overflow-hidden rounded-[28px] glass transition-shadow hover:shadow-pop"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-[#dfe3e6]">
                    <SchematicDoor
                      selections={sel}
                      view="exterior"
                      className="size-full origin-bottom transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <h3 className="font-bold">{p.title}</h3>
                      <p className="text-xs capitalize text-muted">{p.tags.join(" · ")}</p>
                    </div>
                    <span className="text-sm font-bold text-brand group-hover:underline">Configure →</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > shown && (
        <div className="mt-8 text-center">
          <Button variant="secondary" size="lg" onClick={() => setShown((n) => n + PAGE)}>See more</Button>
        </div>
      )}
    </div>
  );
}
