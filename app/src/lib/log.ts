/**
 * Structured operational logging: one JSON object per line on stdout/stderr, which Vercel (and any log drain)
 * captures. Designed to be safe by default:
 *  - values under sensitive keys are replaced, never logged;
 *  - long strings are truncated;
 *  - request/response bodies, photos and cookies are never passed in by callers.
 */
export type Level = "info" | "warn" | "error";

const SENSITIVE = /(authorization|cookie|token|password|secret|apikey|api_key|service_?role|session|jwt|email|signature)/i;
const MAX_STRING = 500;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[${value.length - MAX_STRING} more]` : value;
  if (typeof value !== "object") return value;
  if (depth >= 4) return "[object]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
  return out;
}

export function formatLog(level: Level, event: string, fields: Record<string, unknown> = {}, now = new Date()): string {
  return JSON.stringify({ ts: now.toISOString(), level, event, app: "threshold", ...(redact(fields) as object) });
}

export function log(level: Level, event: string, fields?: Record<string, unknown>): void {
  const line = formatLog(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** The error message, without stack traces, URLs with tokens or nested causes. */
export function errorSummary(e: unknown): { name: string; message: string; digest?: string } {
  const err = e instanceof Error ? e : new Error(String(e));
  const digest = typeof e === "object" && e !== null && "digest" in e ? String((e as { digest: unknown }).digest) : undefined;
  return { name: err.name, message: err.message.slice(0, MAX_STRING), ...(digest ? { digest } : {}) };
}
