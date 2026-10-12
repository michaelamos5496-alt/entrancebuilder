import { publicSupabaseConfig } from "@/lib/env";
import { REQUEST_LIMIT_BYTES, handlePhotoDelete, handlePlacement, handleUpload, type Result } from "@/server/media";
import { logApi } from "@/server/logging";
import { tryBuildMediaDeps } from "@/server/supabaseDeps";

/** Every API reply is private and uncacheable. */
const reply = (body: Record<string, unknown>, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const json = (r: Result) => reply(r.body, r.status);
const unavailable = () => reply({ error: { code: "UNAVAILABLE", message: "Cloud storage is not configured on this server." } }, 503);

/** Uploads validate and store files; allow time beyond the default on slow connections. */
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** multipart/form-data: kind=photo|preview, view, placement (JSON), file */
export async function POST(request: Request, { params }: Ctx) {
  if (!publicSupabaseConfig()) return unavailable();
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > REQUEST_LIMIT_BYTES) {
    return reply({ error: { code: "TOO_LARGE", message: "That upload is too large." } }, 413);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return reply({ error: { code: "BAD_REQUEST", message: "The upload could not be read." } }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size > REQUEST_LIMIT_BYTES) {
    return reply({ error: { code: "BAD_REQUEST", message: "A file is required." } }, 400);
  }
  const { id } = await params;
  const deps = await tryBuildMediaDeps();
  if (!deps) return unavailable();
  const t0 = Date.now();
  return json(logApi("media.upload", await handleUpload(deps, id, {
    kind: String(form.get("kind") ?? ""),
    view: form.get("view") ? String(form.get("view")) : undefined,
    placement: form.get("placement") ? String(form.get("placement")) : undefined,
    bytes: new Uint8Array(await file.arrayBuffer()),
  }), t0));
}

/** JSON { view, placement } : change only where the door sits on an already-stored photo */
export async function PATCH(request: Request, { params }: Ctx) {
  if (!publicSupabaseConfig()) return unavailable();
  let body: { view?: unknown; placement?: unknown };
  try { body = await request.json(); } catch { return reply({ error: { code: "BAD_REQUEST", message: "Invalid request." } }, 400); }
  const { id } = await params;
  const deps = await tryBuildMediaDeps();
  if (!deps) return unavailable();
  const t0 = Date.now();
  return json(logApi("media.placement", await handlePlacement(deps, id, String(body.view ?? ""), body.placement), t0));
}

/** ?view=exterior|interior */
export async function DELETE(request: Request, { params }: Ctx) {
  if (!publicSupabaseConfig()) return unavailable();
  const { id } = await params;
  const deps = await tryBuildMediaDeps();
  if (!deps) return unavailable();
  const t0 = Date.now();
  return json(logApi("media.delete", await handlePhotoDelete(deps, id, new URL(request.url).searchParams.get("view") ?? ""), t0));
}
