"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

type Tone = "info" | "success" | "error";
interface ToastItem { id: number; text: string; tone: Tone }

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const push = useCallback((text: string, tone: Tone = "info") => {
    const id = next.current++;
    setItems((cur) => [...cur.slice(-2), { id, text, tone }]);
    // long, multi-line notices stay up longer so they can be read
    const lines = text.split("\n").length;
    window.setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), Math.min(12000, (tone === "error" ? 7000 : 4000) + (lines - 1) * 1500));
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="no-print pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-3 lg:inset-x-auto lg:bottom-24 lg:right-3 lg:w-[444px] lg:items-stretch"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "anim-rise pointer-events-none flex max-w-md items-start gap-3 rounded-md px-4 py-3 text-sm font-medium text-white shadow-pop lg:max-w-none",
              t.tone === "error" ? "bg-danger" : t.tone === "success" ? "bg-success" : "bg-ink",
            )}
          >
            <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "check" : "info"} size={18} className="mt-0.5 shrink-0" />
            <span className="whitespace-pre-line">{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
