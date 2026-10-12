import { isCloudConfigured } from "@/lib/env";

/** Liveness + configuration summary for uptime monitors and post-deploy checks. Reveals no secrets and touches no data. */
export function GET() {
  return Response.json(
    {
      status: "ok",
      mode: isCloudConfigured() ? "cloud" : "local-dev",
      // presence only, never values
      serviceKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
