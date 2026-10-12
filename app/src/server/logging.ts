import { log } from "@/lib/log";
import type { Result } from "./media";

/** One structured line per API call: route, outcome, duration. Never the body, file, path or user. */
export function logApi(route: string, r: Result, startedAt: number): Result {
  const code = (r.body as { error?: { code?: string } }).error?.code;
  const level = r.status >= 500 ? "error" : r.status >= 400 ? "warn" : "info";
  log(level, "api", { route, status: r.status, ms: Date.now() - startedAt, ...(code ? { code } : {}) });
  return r;
}
