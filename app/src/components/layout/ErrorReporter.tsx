"use client";

import { useEffect } from "react";

const MAX_PER_PAGE = 5;

export function reportClientError(message: string, extra: { source?: string; line?: number } = {}): void {
  try {
    const w = window as unknown as { __reported?: Set<string> };
    w.__reported ??= new Set();
    if (w.__reported.size >= MAX_PER_PAGE || w.__reported.has(message)) return;
    w.__reported.add(message);
    const body = JSON.stringify({ message: message.slice(0, 300), path: window.location.pathname, userAgent: navigator.userAgent.slice(0, 200), ...extra });
    if (!(navigator.sendBeacon && navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" })))) {
      void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    }
  } catch {
    /* reporting must never cause an error itself */
  }
}

/** Sends uncaught errors to the operational log: message, page path and browser only. Never photos, designs or personal data. */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.message || "Script error", { source: e.filename, line: e.lineno });
    const onRejection = (e: PromiseRejectionEvent) => reportClientError(`Unhandled rejection: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return null;
}
