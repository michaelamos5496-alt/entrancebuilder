"use client";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";
import { CloudApiError, type CloudApi, type CloudProjectRow, type ProjectWrite } from "./cloudRepository";

const BUCKET = "project-media";
const COLUMNS = "id, name, document, scene, preview_path, created_at, updated_at, project_photos(view, storage_path, width, height, placement)";

function fromPostgrest(e: PostgrestError | { message?: string; code?: string; status?: number } | null): never {
  const code = (e as PostgrestError)?.code ?? "";
  if (code === "23505") throw new CloudApiError("conflict");
  if (code === "42501" || code === "PGRST301" || code === "PGRST303") throw new CloudApiError("auth");
  if (code === "23514" || code === "P0001" || code === "22P02") throw new CloudApiError("invalid", /limit/i.test(e?.message ?? "") ? "You've reached the project limit. Delete some projects first." : undefined);
  if (/fetch|network|failed to fetch/i.test(e?.message ?? "")) throw new CloudApiError("network");
  throw new CloudApiError("server");
}

async function call(path: string, init: RequestInit): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new CloudApiError("network");
  }
  if (res.ok) return;
  let message: string | undefined;
  try { message = ((await res.json()) as { error?: { message?: string } }).error?.message; } catch { /* no body */ }
  if (res.status === 401) throw new CloudApiError("auth");
  if (res.status === 404) throw new CloudApiError("not_found");
  if (res.status === 400 || res.status === 413) throw new CloudApiError("invalid", message);
  if (res.status === 503) throw new CloudApiError("unavailable");
  throw new CloudApiError("server");
}

/** Thin adapter over supabase-js + our /api routes. Contains no business logic (that is in cloudRepository.ts). */
export function supabaseCloudApi(getClient: () => Promise<SupabaseClient> = getBrowserClient): CloudApi {
  return {
    async getUserId() {
      const { data, error } = await (await getClient()).auth.getUser(); // verified with the auth server
      if (error && /fetch|network/i.test(error.message)) throw new CloudApiError("network");
      return data.user?.id ?? null;
    },
    async listProjects() {
      const { data, error } = await (await getClient()).from("projects").select(COLUMNS).order("updated_at", { ascending: false });
      if (error) fromPostgrest(error);
      return (data ?? []) as unknown as CloudProjectRow[];
    },
    async getProject(id) {
      const { data, error } = await (await getClient()).from("projects").select(COLUMNS).eq("id", id).maybeSingle();
      if (error) fromPostgrest(error);
      return (data as unknown as CloudProjectRow | null) ?? null;
    },
    async insertProject(v: ProjectWrite) {
      // owner_id is deliberately NOT sent: the database fills it from the verified session
      const { data, error } = await (await getClient()).from("projects").insert(v).select(COLUMNS).single();
      if (error) fromPostgrest(error);
      return data as unknown as CloudProjectRow;
    },
    async updateProject(id, v) {
      const { data, error } = await (await getClient()).from("projects").update(v).eq("id", id).select(COLUMNS).maybeSingle();
      if (error) fromPostgrest(error);
      return (data as unknown as CloudProjectRow | null) ?? null;
    },
    async signedUrls(paths) {
      if (!paths.length) return {};
      const { data, error } = await (await getClient()).storage.from(BUCKET).createSignedUrls(paths, 3600);
      if (error) throw new CloudApiError("server");
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
      return out;
    },
    async fetchBlob(url) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new CloudApiError("server");
        return await r.blob();
      } catch (e) {
        throw e instanceof CloudApiError ? e : new CloudApiError("network");
      }
    },
    async uploadPhoto(id, view, blob, placement) {
      const form = new FormData();
      form.set("kind", "photo");
      form.set("view", view);
      form.set("placement", JSON.stringify(placement));
      form.set("file", blob, "photo.jpg");
      await call(`/api/projects/${id}/media`, { method: "POST", body: form });
    },
    async uploadPreview(id, blob) {
      const form = new FormData();
      form.set("kind", "preview");
      form.set("file", blob, "preview.png");
      await call(`/api/projects/${id}/media`, { method: "POST", body: form });
    },
    async patchPlacement(id, view, placement) {
      await call(`/api/projects/${id}/media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ view, placement }) });
    },
    async deletePhoto(id, view) {
      await call(`/api/projects/${id}/media?view=${view}`, { method: "DELETE" });
    },
    async renameProject(id, name) {
      const { data, error } = await (await getClient()).from("projects").update({ name }).eq("id", id).select("id").maybeSingle();
      if (error) fromPostgrest(error);
      if (!data) throw new CloudApiError("not_found");
    },
    async deleteProject(id) {
      await call(`/api/projects/${id}`, { method: "DELETE" });
    },
  };
}
