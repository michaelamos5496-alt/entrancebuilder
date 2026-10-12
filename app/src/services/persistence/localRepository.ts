import { CATALOGUE } from "@/domain/catalogue";
import type { Selections, ViewSide } from "@/domain/design/types";
import { parsePlacement } from "@/domain/project/placementSchema";
import { deserialize, serialize } from "@/domain/engine/serialize";
import type { Placement } from "@/domain/imaging/types";
import { blobStore } from "./blobStore";
import {
  ProjectError, checkName, sameName,
  type LoadedPhoto, type LoadedProject, type ProjectRepository, type ProjectSummary, type SaveInput, type SaveResult,
} from "./types";

/**
 * LOCAL DEVELOPMENT MODE. Data lives in THIS browser only (localStorage + IndexedDB): it is not an account,
 * is not backed up, and is not available on other devices. The UI says so wherever it is used.
 * It exists so the whole save / reopen / delete flow works without Supabase credentials.
 */
const KEY = "threshold.projects.v2";
const LEGACY_KEY = "threshold.designs.v1"; // Phase 2 saves: imported once, never modified or deleted
const MIGRATED_KEY = "threshold.projects.v2.migrated";
const MAX_PROJECTS = 200;

type StoredPhoto =
  | { kind: "gallery"; galleryId: string; width: number; height: number; placement: Placement }
  | { kind: "upload"; mediaKey: string; width: number; height: number; placement: Placement };

interface Row {
  id: string;
  name: string;
  config: unknown; // serialised, versioned
  createdAt: string;
  updatedAt: string;
  photos: Partial<Record<ViewSide, StoredPhoto>>;
  previewKey: string | null;
}

const VIEWS: ViewSide[] = ["exterior", "interior"];
const uid = () => crypto.randomUUID();

function readRows(): Row[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const data: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? (data as Row[]).filter((r) => typeof r?.id === "string" && typeof r?.name === "string") : [];
  } catch {
    return [];
  }
}

function writeRows(rows: Row[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(rows));
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
    throw new ProjectError(quota ? "QUOTA" : "UNAVAILABLE", quota ? "Your browser's storage is full. Delete some projects and try again." : "Couldn't use this browser's storage.");
  }
}

/** One-time, non-destructive import of Phase 2 saved designs. */
function importLegacy(): void {
  try {
    if (window.localStorage.getItem(MIGRATED_KEY)) return;
    window.localStorage.setItem(MIGRATED_KEY, "1");
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const old: unknown = JSON.parse(raw);
    if (!Array.isArray(old)) return;
    const rows = readRows();
    for (const o of old as { id?: string; name?: string; selections?: unknown; createdAt?: string; updatedAt?: string }[]) {
      if (typeof o?.id !== "string" || typeof o.name !== "string" || rows.some((r) => r.id === o.id)) continue;
      const restored = deserialize(CATALOGUE, o.selections);
      if (!restored.ok) continue;
      rows.push({ id: o.id, name: o.name, config: serialize(CATALOGUE, restored.config), createdAt: String(o.createdAt), updatedAt: String(o.updatedAt), photos: {}, previewKey: null });
    }
    writeRows(rows);
  } catch {
    /* an unreadable legacy store must not break the new one */
  }
}

function configOf(row: Row): Selections | null {
  const r = deserialize(CATALOGUE, row.config);
  return r.ok ? r.config : null;
}

export const localProjectRepository: ProjectRepository = {
  mode: "local-dev",
  where: "this browser on this device (local development mode: not an account, not backed up)",

  async list() {
    importLegacy();
    const out: ProjectSummary[] = [];
    for (const row of readRows().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
      const config = configOf(row);
      if (!config) continue;
      let previewUrl: string | null = null;
      if (row.previewKey) {
        try {
          const blob = await blobStore.get(row.previewKey);
          if (blob) previewUrl = URL.createObjectURL(blob);
        } catch { /* a missing preview is cosmetic */ }
      }
      out.push({ id: row.id, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt, config, previewUrl, photoViews: VIEWS.filter((v) => row.photos[v]) });
    }
    return out;
  },

  async load(id) {
    importLegacy();
    const row = readRows().find((r) => r.id === id);
    const config = row && configOf(row);
    if (!row || !config) throw new ProjectError("NOT_FOUND", "That project no longer exists on this device.");
    const warnings: string[] = [];
    const photos: LoadedProject["photos"] = {};
    for (const v of VIEWS) {
      const p = row.photos[v];
      if (!p) continue;
      const placement = parsePlacement(p.placement, p.width, p.height);
      if (!placement) { warnings.push(`The ${v} photo's door position was invalid, so that photo was skipped.`); continue; }
      if (p.kind === "gallery") { photos[v] = { kind: "gallery", galleryId: p.galleryId, width: p.width, height: p.height, placement } satisfies LoadedPhoto; continue; }
      try {
        const blob = await blobStore.get(p.mediaKey);
        if (blob) photos[v] = { kind: "upload", width: p.width, height: p.height, placement, blob };
        else warnings.push(`The ${v} photo is missing from this browser's storage.`);
      } catch (e) {
        warnings.push(e instanceof ProjectError ? e.message : `The ${v} photo couldn't be read.`);
      }
    }
    return { id: row.id, name: row.name, config, photos, warnings };
  },

  async save(input: SaveInput): Promise<SaveResult> {
    importLegacy();
    const name = checkName(input.name);
    const rows = readRows();
    const existing = input.id ? rows.find((r) => r.id === input.id) : undefined;
    if (input.id && !existing) throw new ProjectError("NOT_FOUND", "That project no longer exists, so it can't be updated. Save it as a new project instead.");
    if (rows.some((r) => r.id !== existing?.id && sameName(r.name, name))) throw new ProjectError("NAME_TAKEN", `A project named “${name}” already exists.`);
    if (!existing && rows.length >= MAX_PROJECTS) throw new ProjectError("INVALID", "You've reached the project limit. Delete some projects first.");

    const id = existing?.id ?? uid();
    const warnings: string[] = [];
    const newKeys: string[] = []; // written during this save: removed again if anything fails
    const obsolete: string[] = []; // replaced/removed: deleted only after the metadata is safely written
    const photos: Row["photos"] = {};

    try {
      for (const v of VIEWS) {
        const p = input.photos[v];
        const old = existing?.photos[v];
        if (!p) { if (old?.kind === "upload") obsolete.push(old.mediaKey); continue; }
        const placement = parsePlacement(p.placement, p.width, p.height);
        if (!placement) throw new ProjectError("INVALID", "The door position on the photo isn't valid. Reset it and try again.");
        if (p.kind === "gallery") {
          photos[v] = { kind: "gallery", galleryId: p.galleryId, width: p.width, height: p.height, placement };
          if (old?.kind === "upload") obsolete.push(old.mediaKey);
        } else if (p.blob) {
          const mediaKey = `photo:${id}:${v}:${uid()}`;
          await blobStore.put(mediaKey, p.blob);
          newKeys.push(mediaKey);
          photos[v] = { kind: "upload", mediaKey, width: p.width, height: p.height, placement };
          if (old?.kind === "upload") obsolete.push(old.mediaKey);
        } else if (old?.kind === "upload") {
          photos[v] = { ...old, placement, width: p.width, height: p.height }; // keep the stored file, update placement
        } else {
          throw new ProjectError("INVALID", "The photo to keep wasn't found. Upload it again.");
        }
      }

      let previewKey = existing?.previewKey ?? null;
      if (input.preview) {
        try {
          const key = `preview:${id}:${uid()}`;
          await blobStore.put(key, input.preview);
          newKeys.push(key);
          if (previewKey) obsolete.push(previewKey);
          previewKey = key;
        } catch {
          warnings.push("The project was saved, but its preview image couldn't be stored.");
        }
      }

      const now = new Date().toISOString();
      const row: Row = { id, name, config: serialize(CATALOGUE, input.config), createdAt: existing?.createdAt ?? now, updatedAt: now, photos, previewKey };
      writeRows(existing ? rows.map((r) => (r.id === id ? row : r)) : [...rows, row]);
    } catch (e) {
      await blobStore.delete(newKeys).catch(() => {}); // roll back files written for this failed save
      throw e;
    }
    await blobStore.delete(obsolete).catch(() => {});

    const saved = (await this.list()).find((p) => p.id === id)!;
    return { project: saved, warnings };
  },

  async rename(id, name) {
    const n = checkName(name);
    const rows = readRows();
    const row = rows.find((r) => r.id === id);
    if (!row) throw new ProjectError("NOT_FOUND", "That project no longer exists on this device.");
    if (rows.some((r) => r.id !== id && sameName(r.name, n))) throw new ProjectError("NAME_TAKEN", `A project named “${n}” already exists.`);
    writeRows(rows.map((r) => (r.id === id ? { ...r, name: n, updatedAt: new Date().toISOString() } : r)));
  },

  async remove(id) {
    const rows = readRows();
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    writeRows(rows.filter((r) => r.id !== id));
    const keys = [row.previewKey, ...VIEWS.map((v) => { const p = row.photos[v]; return p?.kind === "upload" ? p.mediaKey : null; })].filter((k): k is string => !!k);
    await blobStore.delete(keys).catch(() => {});
  },
};
