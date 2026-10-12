import { parsePlacement } from "@/domain/project/placementSchema";
import { MEDIA_LIMITS, validatePhotoUpload, validatePreviewUpload } from "@/domain/project/media";
import type { Placement } from "@/domain/imaging/types";

/**
 * Request handling for project media, written against injected dependencies so every security rule
 * can be tested without a network. The real wiring (Supabase clients) lives in the route files.
 *
 * Rules enforced here, in this order:
 *   1. The caller must be signed in (verified by the auth server, not by a client claim).
 *   2. The project id must be a UUID and must be owned by the caller. Ownership is checked through the
 *      caller's own (RLS-scoped) database session, so another user's project looks like "not found".
 *   3. Only then is anything validated and written, using privileged access limited to the caller's folder.
 *   4. Uploaded bytes are re-validated and stripped of metadata. Nothing client-supplied becomes part of a path.
 */
export type View = "exterior" | "interior";

export interface MediaDeps {
  getUserId(): Promise<string | null>;
  /** RLS-scoped: returns null unless the signed-in user owns the project */
  getOwnedProject(id: string): Promise<{ id: string; preview_path: string | null } | null>;
  /** RLS-scoped */
  listPhotoPaths(projectId: string): Promise<string[]>;
  getPhoto(projectId: string, view: View): Promise<{ path: string; width: number; height: number } | null>;
  /** privileged; only called after ownership is established */
  storagePut(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  storageRemove(paths: string[]): Promise<void>;
  upsertPhoto(row: { project_id: string; owner_id: string; view: View; storage_path: string; width: number; height: number; bytes: number; placement: Placement }): Promise<void>;
  updatePlacement(projectId: string, view: View, placement: Placement): Promise<void>;
  deletePhotoRow(projectId: string, view: View): Promise<void>;
  setPreviewPath(projectId: string, path: string | null): Promise<void>;
  /** RLS-scoped delete of the project row */
  deleteProjectRow(projectId: string): Promise<boolean>;
  newId(): string;
}

export interface Result {
  status: number;
  body: Record<string, unknown>;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const err = (status: number, code: string, message: string): Result => ({ status, body: { error: { code, message } } });
const GENERIC = err(500, "SERVER_ERROR", "Something went wrong on our side. Nothing was changed. Please try again.");

async function authorise(d: MediaDeps, projectId: string): Promise<{ userId: string } | Result> {
  const userId = await d.getUserId();
  if (!userId) return err(401, "AUTH_REQUIRED", "Please sign in to continue.");
  if (!UUID.test(projectId)) return err(404, "NOT_FOUND", "Project not found.");
  const project = await d.getOwnedProject(projectId);
  if (!project) return err(404, "NOT_FOUND", "Project not found."); // same answer whether it exists or not
  return { userId };
}

export interface UploadRequest {
  kind: string;
  view?: string;
  placement?: string;
  bytes: Uint8Array;
}

export async function handleUpload(d: MediaDeps, projectId: string, req: UploadRequest): Promise<Result> {
  try {
    const auth = await authorise(d, projectId);
    if ("status" in auth) return auth;
    const { userId } = auth;

    if (req.kind === "preview") {
      const check = validatePreviewUpload(req.bytes);
      if (!check.ok) return err(check.code === "TOO_LARGE" ? 413 : 400, check.code, check.message);
      const path = `${userId}/${projectId}/preview-${d.newId()}.png`;
      const project = (await d.getOwnedProject(projectId))!;
      await d.storagePut(path, check.bytes, "image/png");
      try {
        await d.setPreviewPath(projectId, path);
      } catch (e) {
        await d.storageRemove([path]).catch(() => {});
        throw e;
      }
      if (project.preview_path && project.preview_path !== path) await d.storageRemove([project.preview_path]).catch(() => {});
      return { status: 200, body: { path } };
    }

    if (req.kind === "photo") {
      if (req.view !== "exterior" && req.view !== "interior") return err(400, "BAD_VIEW", "Unknown photo type.");
      const view: View = req.view;
      const check = validatePhotoUpload(req.bytes);
      if (!check.ok) return err(check.code === "TOO_LARGE" ? 413 : 400, check.code, check.message);
      let raw: unknown;
      try { raw = JSON.parse(req.placement ?? ""); } catch { return err(400, "BAD_PLACEMENT", "The door placement is invalid."); }
      const placement = parsePlacement(raw, check.width, check.height);
      if (!placement) return err(400, "BAD_PLACEMENT", "The door placement is invalid.");

      const path = `${userId}/${projectId}/photo-${view}-${d.newId()}.jpg`;
      const previous = (await d.getPhoto(projectId, view))?.path ?? null;
      await d.storagePut(path, check.bytes, "image/jpeg");
      try {
        await d.upsertPhoto({ project_id: projectId, owner_id: userId, view, storage_path: path, width: check.width, height: check.height, bytes: check.bytes.length, placement });
      } catch (e) {
        await d.storageRemove([path]).catch(() => {}); // do not leave an orphan behind
        throw e;
      }
      if (previous && previous !== path) await d.storageRemove([previous]).catch(() => {});
      return { status: 200, body: { path, width: check.width, height: check.height } };
    }
    return err(400, "BAD_KIND", "Unknown upload type.");
  } catch {
    return GENERIC;
  }
}

/** Update only the placement of an already-stored photo (no file bytes). Dimensions come from the stored row, never from the client. */
export async function handlePlacement(d: MediaDeps, projectId: string, viewRaw: string, placementRaw: unknown): Promise<Result> {
  try {
    const auth = await authorise(d, projectId);
    if ("status" in auth) return auth;
    if (viewRaw !== "exterior" && viewRaw !== "interior") return err(400, "BAD_VIEW", "Unknown photo type.");
    const stored = await d.getPhoto(projectId, viewRaw);
    if (!stored) return err(404, "NOT_FOUND", "No photo stored for that view.");
    const placement = parsePlacement(placementRaw, stored.width, stored.height);
    if (!placement) return err(400, "BAD_PLACEMENT", "The door placement is invalid.");
    await d.updatePlacement(projectId, viewRaw, placement);
    return { status: 200, body: {} };
  } catch {
    return GENERIC;
  }
}

export async function handlePhotoDelete(d: MediaDeps, projectId: string, viewRaw: string): Promise<Result> {
  try {
    const auth = await authorise(d, projectId);
    if ("status" in auth) return auth;
    if (viewRaw !== "exterior" && viewRaw !== "interior") return err(400, "BAD_VIEW", "Unknown photo type.");
    const path = (await d.getPhoto(projectId, viewRaw))?.path;
    if (path) {
      await d.deletePhotoRow(projectId, viewRaw);
      await d.storageRemove([path]).catch(() => {});
    }
    return { status: 200, body: {} };
  } catch {
    return GENERIC;
  }
}

/** Delete the project and every file it owns. Files first would orphan nothing, but the row is the source of truth, so it goes first. */
export async function handleProjectDelete(d: MediaDeps, projectId: string): Promise<Result> {
  try {
    const auth = await authorise(d, projectId);
    if ("status" in auth) return auth;
    const project = (await d.getOwnedProject(projectId))!;
    const photos = await d.listPhotoPaths(projectId);
    const deleted = await d.deleteProjectRow(projectId);
    if (!deleted) return err(404, "NOT_FOUND", "Project not found.");
    const files = [...photos, ...(project.preview_path ? [project.preview_path] : [])];
    if (files.length) await d.storageRemove(files).catch(() => {});
    return { status: 200, body: {} };
  } catch {
    return GENERIC;
  }
}

export const REQUEST_LIMIT_BYTES = MEDIA_LIMITS.photoMaxBytes + 64 * 1024;
