import type { SupabaseClient } from "@supabase/supabase-js";
import type { Placement } from "@/domain/imaging/types";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import type { MediaDeps, View } from "./media";

export const BUCKET = "project-media";

/** Real wiring for the media handlers. `user` is RLS-scoped; `admin` is only used for storage and for rows the browser may not write. */
export async function buildMediaDeps(): Promise<MediaDeps> {
  const user: SupabaseClient = await createUserClient();
  const admin: SupabaseClient = createAdminClient();
  const must = <T>(r: { data: T | null; error: { message: string } | null }): T | null => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    getUserId: async () => {
      // getUser() asks the auth server to verify the token; getSession() would only decode what the cookie claims
      const { data } = await user.auth.getUser();
      return data.user?.id ?? null;
    },
    getOwnedProject: async (id) => must(await user.from("projects").select("id, preview_path").eq("id", id).maybeSingle()),
    listPhotoPaths: async (id) => (must(await user.from("project_photos").select("storage_path").eq("project_id", id)) ?? []).map((r: { storage_path: string }) => r.storage_path),
    getPhoto: async (id, view) => {
      const r = must(await user.from("project_photos").select("storage_path, width, height").eq("project_id", id).eq("view", view).maybeSingle()) as { storage_path: string; width: number; height: number } | null;
      return r ? { path: r.storage_path, width: r.width, height: r.height } : null;
    },
    storagePut: async (path, bytes, contentType) => {
      const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
      if (error) throw new Error(error.message);
    },
    storageRemove: async (paths) => {
      const { error } = await admin.storage.from(BUCKET).remove(paths);
      if (error) throw new Error(error.message);
    },
    upsertPhoto: async (row) => {
      const { error } = await admin.from("project_photos").upsert(row, { onConflict: "project_id,view" });
      if (error) throw new Error(error.message);
    },
    updatePlacement: async (id: string, view: View, placement: Placement) => {
      const { error } = await admin.from("project_photos").update({ placement }).eq("project_id", id).eq("view", view);
      if (error) throw new Error(error.message);
    },
    deletePhotoRow: async (id, view) => {
      const { error } = await admin.from("project_photos").delete().eq("project_id", id).eq("view", view);
      if (error) throw new Error(error.message);
    },
    setPreviewPath: async (id, path) => {
      const { error } = await admin.from("projects").update({ preview_path: path }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    deleteProjectRow: async (id) => {
      const { data, error } = await user.from("projects").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      return (data?.length ?? 0) > 0;
    },
    newId: () => crypto.randomUUID(),
  };
}

/**
 * `buildMediaDeps`, but returns null when the server is not fully configured (for example the public URL is set but the
 * service key is missing). Routes turn that into a clear 503 instead of an unexplained crash. Nothing is logged with secrets.
 */
export async function tryBuildMediaDeps(): Promise<MediaDeps | null> {
  try {
    return await buildMediaDeps();
  } catch {
    return null;
  }
}
