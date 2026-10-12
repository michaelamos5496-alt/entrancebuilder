import { CLIENT_ERROR_MAX_BYTES, createLimiter, parseClientError } from "@/lib/clientErrors";
import { log } from "@/lib/log";

const allow = createLimiter(20, 60_000);

/** Receives small, privacy-safe error reports from browsers and writes them to the operational log. Stores nothing. */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allow(ip)) return new Response(null, { status: 429 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > CLIENT_ERROR_MAX_BYTES) return new Response(null, { status: 413 });
  let text = "";
  try { text = await request.text(); } catch { return new Response(null, { status: 400 }); }
  if (text.length > CLIENT_ERROR_MAX_BYTES) return new Response(null, { status: 413 });
  let report;
  try { report = parseClientError(JSON.parse(text)); } catch { return new Response(null, { status: 400 }); }
  if (!report) return new Response(null, { status: 400 });
  log("warn", "client_error", { ...report });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
