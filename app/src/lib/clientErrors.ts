/** Validation and rate limiting for browser-reported errors. Pure so it can be tested. */
export interface ClientErrorReport {
  message: string;
  source?: string;
  path: string;
  line?: number;
  userAgent?: string;
}

export const CLIENT_ERROR_MAX_BYTES = 4096;

const str = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

/** Returns a clean report or null. Strips query strings/fragments from paths (they can hold share data). */
export function parseClientError(input: unknown): ClientErrorReport | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const message = str(o.message, 300);
  const path = str(o.path, 200);
  if (!message?.trim() || !path?.startsWith("/")) return null;
  const line = typeof o.line === "number" && Number.isFinite(o.line) ? Math.trunc(o.line) : undefined;
  return {
    message: message.replace(/\s+/g, " "),
    source: str(o.source, 200)?.split(/[?#]/)[0],
    path: path.split(/[?#]/)[0],
    line,
    userAgent: str(o.userAgent, 200),
  };
}

/** Best-effort fixed-window limiter. On serverless each instance has its own memory, so this only blunts floods; use the platform firewall for real limits. */
export function createLimiter(max: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string): boolean => {
    const t = now();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < t) hits.delete(k);
    const cur = hits.get(key);
    if (!cur || cur.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return true; }
    cur.n++;
    return cur.n <= max;
  };
}
