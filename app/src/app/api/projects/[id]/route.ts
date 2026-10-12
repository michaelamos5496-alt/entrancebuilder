import { publicSupabaseConfig } from "@/lib/env";
import { handleProjectDelete } from "@/server/media";
import { logApi } from "@/server/logging";
import { tryBuildMediaDeps } from "@/server/supabaseDeps";

const reply = (body: Record<string, unknown>, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Delete a project and every file it owns. Ownership is verified through the caller's own database session. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!publicSupabaseConfig()) {
    return reply({ error: { code: "UNAVAILABLE", message: "Cloud storage is not configured on this server." } }, 503);
  }
  const { id } = await params;
  const deps = await tryBuildMediaDeps();
  if (!deps) {
    return reply({ error: { code: "UNAVAILABLE", message: "Cloud storage is not configured on this server." } }, 503);
  }
  const t0 = Date.now();
  const r = logApi("project.delete", await handleProjectDelete(deps, id), t0);
  return reply(r.body, r.status);
}
