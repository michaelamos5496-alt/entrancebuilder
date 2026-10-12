"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";

export type ConsentChoice = "all" | "none" | "dismissed";
const KEY = "threshold.consent.v1";

/** Records the visitor's choice. Nothing is gated on it yet because no analytics or tracking exists; future tracking MUST read this. */
export function readConsent(): ConsentChoice | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "all" || v === "none" || v === "dismissed" ? v : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}
const snapshot = () => readConsent() ?? "unset";
const serverSnapshot = () => "server";

export function CookieBanner() {
  const state = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  if (state !== "unset") return null;

  const choose = (v: ConsentChoice) => {
    try { window.localStorage.setItem(KEY, v); } catch { /* blocked storage: banner will reappear, acceptable */ }
    listeners.forEach((l) => l());
  };

  return (
    <section
      aria-label="Cookie consent"
      className="no-print anim-rise fixed bottom-3 left-3 z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-lg bg-ink p-4 text-white shadow-pop max-lg:bottom-24"
    >
      <h2 className="text-sm font-bold">Cookies</h2>
      <p className="mt-1 text-xs leading-relaxed text-white/80">
        We only store what the app needs to remember your work on this device. If we add analytics later, we&apos;ll ask first.{" "}
        <Link href="/legal/privacy" className="underline">Privacy policy</Link>
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" variant="secondary" className="border-transparent" onClick={() => choose("all")}>Accept all</Button>
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => choose("none")}>Reject all</Button>
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => choose("dismissed")}>Got it</Button>
      </div>
    </section>
  );
}
