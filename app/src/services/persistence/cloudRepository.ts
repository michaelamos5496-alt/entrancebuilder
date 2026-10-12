import { CATALOGUE } from "@/domain/catalogue";
import type { ViewSide } from "@/domain/design/types";
import { deserialize, serialize } from "@/domain/engine/serialize";
import type { Placement } from "@/domain/imaging/types";
import { parsePlacement } from "@/domain/project/placementSchema";
import {
  ProjectError, checkName,
  type LoadedPhoto, type LoadedProject, type PhotoSave, type ProjectRepository, type ProjectSummary, type SaveInput, type SaveResult,
} from "./types";

/** The narrow set of backend operations the repository needs. The real one talks to Supabase; tests use a fake. */
export type CloudErrorKind = "auth" | "conflict" | "invalid" | "not_found" | "network" | "unavailable" | "server";
export class CloudApiError extends Error {
  constructor(public readonly kind: CloudErrorKind, message: string = kind) {
    super(message);
    this.name = "CloudApiError";
  }
}

export interface CloudPhotoRow {
  view: ViewSide;
  storage_path: string;
  width: number;
  height: number;
  placement: unknown;
}
export interface CloudProjectRow {
  id: string;
  name: string;
  document: unknown;
  scene: unknown;
  preview_path: string | null;
  created_at: string;
  updated_at: string;
  project_photos: CloudPhotoRow[];
}
export interface ProjectWrite {
  name: string;
  document: unknown;
  scene: Record<string, unknown>;
  catalogue_version: string;
  schema_version: number;
}

export interface CloudApi {
  /** the verified signed-in user id, or null */
  getUserId(): Promise<string | null>;
  listProjects(): Promise<CloudProjectRow[]>;
  getProject(id: string): Promise<CloudProjectRow | null>;
  insertProject(v: ProjectWrite): Promise<CloudProjectRow>;
  updateProject(id: string, v: ProjectWrite): Promise<CloudProjectRow | null>;
  signedUrls(paths: string[]): Promise<Record<string, string>>;
  fetchBlob(url: string): Promise<Blob>;
  uploadPhoto(id: string, view: ViewSide, blob: Blob, placement: Placement): Promise<void>;
  uploadPreview(id: string, blob: Blob): Promise<void>;
  patchPlacement(id: string, view: ViewSide, placement: Placement): Promise<void>;
  deletePhoto(id: string, view: ViewSide): Promise<void>;
  renameProject(id: string, name: string): Promise<void>;
  deleteProject(id: string): Promise<void>;
}

const VIEWS: ViewSide[] = ["exterior", "interior"];

export function toProjectError(e: unknown): ProjectError {
  if (e instanceof ProjectError) return e;
  if (e instanceof CloudApiError) {
    switch (e.kind) {
      case "auth": return new ProjectError("AUTH_REQUIRED", "Please sign in to save to your account.");
      case "conflict": return new ProjectError("NAME_TAKEN", "You already have a project with that name.");
      case "invalid": return new ProjectError("INVALID", e.message && e.message !== "invalid" ? e.message : "That couldn't be saved because some of it isn't valid.");
      case "not_found": return new ProjectError("NOT_FOUND", "That project no longer exists.");
      case "network": return new ProjectError("NETWORK", "Couldn't reach the server. Check your connection and try again.");
      case "unavailable": return new ProjectError("UNAVAILABLE", "Cloud storage isn't available right now.");
      default: return new ProjectError("SERVER", "Something went wrong on our side. Nothing was changed. Please try again.");
    }
  }
  return new ProjectError("SERVER", "Something went wrong. Please try again.");
}

function sceneOf(photos: SaveInput["photos"]): Record<string, unknown> {
  const scene: Record<string, unknown> = {};
  for (const v of VIEWS) {
    const p = photos[v];
    if (p?.kind === "gallery") scene[v] = { kind: "gallery", galleryId: p.galleryId, placement: p.placement };
  }
  return scene;
}

async function summarise(api: CloudApi, rows: CloudProjectRow[]): Promise<ProjectSummary[]> {
  const urls = await api.signedUrls(rows.map((r) => r.preview_path).filter((p): p is string => !!p)).catch(() => ({}) as Record<string, string>);
  const out: ProjectSummary[] = [];
  for (const r of rows) {
    const restored = deserialize(CATALOGUE, r.document);
    if (!restored.ok) continue;
    const gallery = typeof r.scene === "object" && r.scene !== null ? (Object.keys(r.scene) as ViewSide[]) : [];
    const views = new Set<ViewSide>([...gallery.filter((v) => VIEWS.includes(v)), ...r.project_photos.map((p) => p.view)]);
    out.push({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, config: restored.config, previewUrl: r.preview_path ? (urls[r.preview_path] ?? null) : null, photoViews: VIEWS.filter((v) => views.has(v)) });
  }
  return out;
}

export function createCloudRepository(api: CloudApi): ProjectRepository {
  return {
    mode: "cloud",
    where: "your account (private cloud storage)",

    async list() {
      try {
        if (!(await api.getUserId())) throw new CloudApiError("auth");
        const rows = await api.listProjects();
        return await summarise(api, rows);
      } catch (e) { throw toProjectError(e); }
    },

    async load(id): Promise<LoadedProject> {
      try {
        if (!(await api.getUserId())) throw new CloudApiError("auth");
        const row = await api.getProject(id);
        if (!row) throw new CloudApiError("not_found");
        const restored = deserialize(CATALOGUE, row.document);
        if (!restored.ok) throw new ProjectError("INVALID", "This project was saved in a format this version can't open.");
        const warnings: string[] = [];
        const photos: LoadedProject["photos"] = {};
        const scene = (typeof row.scene === "object" && row.scene !== null ? row.scene : {}) as Record<string, { kind?: string; galleryId?: string; placement?: unknown }>;
        for (const v of VIEWS) {
          const g = scene[v];
          if (g?.kind === "gallery" && typeof g.galleryId === "string") {
            // gallery photo sizes are fixed by the gallery; validate placement against a nominal size
            const placement = parsePlacement(g.placement, 1200, 800);
            if (placement) photos[v] = { kind: "gallery", galleryId: g.galleryId, width: 1200, height: 800, placement } satisfies LoadedPhoto;
            else warnings.push(`The ${v} photo's door position was invalid, so that photo was skipped.`);
          }
        }
        const stored = row.project_photos.filter((p) => VIEWS.includes(p.view));
        if (stored.length) {
          const urls = await api.signedUrls(stored.map((p) => p.storage_path));
          for (const p of stored) {
            const placement = parsePlacement(p.placement, p.width, p.height);
            if (!placement) { warnings.push(`The ${p.view} photo's door position was invalid, so that photo was skipped.`); continue; }
            const url = urls[p.storage_path];
            if (!url) { warnings.push(`The ${p.view} photo couldn't be found in storage.`); continue; }
            try {
              photos[p.view] = { kind: "upload", width: p.width, height: p.height, placement, blob: await api.fetchBlob(url) };
            } catch {
              warnings.push(`The ${p.view} photo couldn't be downloaded. The rest of the project opened.`);
            }
          }
        }
        return { id: row.id, name: row.name, config: restored.config, photos, warnings };
      } catch (e) { throw toProjectError(e); }
    },

    async save(input): Promise<SaveResult> {
      try {
        const name = checkName(input.name);
        if (!(await api.getUserId())) throw new CloudApiError("auth"); // do not even try while signed out
        const write: ProjectWrite = {
          name,
          document: serialize(CATALOGUE, input.config),
          scene: sceneOf(input.photos),
          catalogue_version: CATALOGUE.version,
          schema_version: 2,
        };
        // 1. the project row: the source of truth. If this fails, nothing else is attempted.
        const row = input.id ? await api.updateProject(input.id, write) : await api.insertProject(write);
        if (!row) throw new CloudApiError("not_found");
        const warnings: string[] = [];

        // 2. photos. A failure here leaves the project saved and is reported honestly.
        for (const v of VIEWS) {
          const p: PhotoSave | undefined = input.photos[v];
          const hadStored = row.project_photos.some((x) => x.view === v);
          try {
            if (p?.kind === "upload") {
              if (p.blob) await api.uploadPhoto(row.id, v, p.blob, p.placement);
              else if (hadStored) await api.patchPlacement(row.id, v, p.placement);
              else throw new ProjectError("INVALID", "The stored photo to keep wasn't found. Upload it again.");
            } else if (hadStored) {
              await api.deletePhoto(row.id, v); // switched to a sample photo, or removed
            }
          } catch (e) {
            const pe = toProjectError(e);
            warnings.push(`Saved, but your ${v} photo wasn't stored: ${pe.message}`);
          }
        }

        // 3. preview image (cosmetic)
        if (input.preview) {
          try { await api.uploadPreview(row.id, input.preview); } catch { warnings.push("Saved, but the preview image couldn't be stored."); }
        }

        const fresh = (await api.getProject(row.id)) ?? row;
        const [project] = await summarise(api, [fresh]);
        if (!project) throw new ProjectError("SERVER", "The project saved but couldn't be read back.");
        return { project, warnings };
      } catch (e) { throw toProjectError(e); }
    },

    async rename(id, name) {
      try {
        const n = checkName(name);
        if (!(await api.getUserId())) throw new CloudApiError("auth");
        await api.renameProject(id, n);
      } catch (e) { throw toProjectError(e); }
    },

    async remove(id) {
      try {
        if (!(await api.getUserId())) throw new CloudApiError("auth");
        await api.deleteProject(id);
      } catch (e) { throw toProjectError(e); }
    },
  };
}
