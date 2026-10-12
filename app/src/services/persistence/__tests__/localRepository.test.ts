import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blobStore } from "../blobStore";
import { localProjectRepository as repo } from "../localRepository";
import { ProjectError, type SaveInput } from "../types";
import { PLACEMENT, blob, config, readText } from "./fixtures";

// a tiny browser-like environment for the parts the repository touches
class MemoryStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const storage = new MemoryStorage();
Object.assign(globalThis, { window: globalThis, localStorage: storage });

const save = (over: Partial<SaveInput> = {}) => repo.save({ name: "Front door", config: config(), photos: {}, preview: null, ...over });
const allKeys = async () => {
  const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open("threshold-media", 1); r.onsuccess = () => res(r.result); r.onupgradeneeded = () => r.result.createObjectStore("blobs"); });
  return new Promise<string[]>((res) => { const q = db.transaction("blobs").objectStore("blobs").getAllKeys(); q.onsuccess = () => { db.close(); res(q.result as string[]); }; });
};
const wipe = async () => { storage.clear(); await blobStore.delete(await allKeys()); };
beforeEach(wipe);

describe("local development repository", () => {
  it("is honest about being local", () => {
    expect(repo.mode).toBe("local-dev");
    expect(repo.where).toMatch(/local development/i);
    expect(repo.where).toMatch(/not an account/i);
  });

  it("a saved project can be reopened with every configuration choice intact", async () => {
    const c = config("meridian", { colorDoorExt: "#3e5567", lite: "three", glass: "blinds", handle: "pull", layout: "side-left", hand: "right" });
    const { project } = await save({ config: c });
    const loaded = await repo.load(project.id);
    expect(loaded.config).toEqual(c);
    expect(loaded.name).toBe("Front door");
    expect(project.config).toEqual(c);
  });

  it("round-trips an uploaded photo's bytes and placement, and a gallery photo's placement", async () => {
    const { project } = await save({
      photos: {
        exterior: { kind: "upload", blob: blob("JPEGBYTES-exterior"), width: 1600, height: 1200, placement: { ...PLACEMENT, flip: true, brightness: 12 } },
        interior: { kind: "gallery", galleryId: "room-1", width: 1200, height: 800, placement: PLACEMENT },
      },
    });
    expect(project.photoViews).toEqual(["exterior", "interior"]);
    const l = await repo.load(project.id);
    expect(l.warnings).toEqual([]);
    const ext = l.photos.exterior!;
    expect(ext.kind).toBe("upload");
    if (ext.kind === "upload") expect(await readText(ext.blob)).toBe("JPEGBYTES-exterior");
    expect(ext.placement).toEqual({ ...PLACEMENT, flip: true, brightness: 12 });
    expect(l.photos.interior).toMatchObject({ kind: "gallery", galleryId: "room-1" });
  });

  it("stores and lists a preview image", async () => {
    const { project } = await save({ preview: blob("PNGDATA", "image/png") });
    expect(project.previewUrl).toMatch(/^blob:/);
    const list = await repo.list();
    expect(list[0].previewUrl).toMatch(/^blob:/);
  });

  it("updating keeps the id and creation time, bumps updated time, and can keep the stored photo while changing only its placement", async () => {
    const a = await save({ photos: { exterior: { kind: "upload", blob: blob("ORIGINAL"), width: 1600, height: 1200, placement: PLACEMENT } } });
    await new Promise((r) => setTimeout(r, 5));
    const b = await save({ id: a.project.id, name: "Renamed", config: config("axis"), photos: { exterior: { kind: "upload", blob: null, width: 1600, height: 1200, placement: { ...PLACEMENT, flip: true } } } });
    expect(b.project.id).toBe(a.project.id);
    expect(b.project.createdAt).toBe(a.project.createdAt);
    expect(b.project.updatedAt > a.project.updatedAt).toBe(true);
    const l = await repo.load(a.project.id);
    expect(l.name).toBe("Renamed");
    expect(l.config.product).toBe("axis");
    const ext = l.photos.exterior!;
    expect(ext.placement.flip).toBe(true);
    if (ext.kind === "upload") expect(await readText(ext.blob)).toBe("ORIGINAL");
    expect((await repo.list())).toHaveLength(1);
  });

  it("replacing or removing a photo deletes the old file (no leaks)", async () => {
    const a = await save({ photos: { exterior: { kind: "upload", blob: blob("ONE"), width: 800, height: 600, placement: PLACEMENT } }, preview: blob("P1", "image/png") });
    expect((await allKeys()).length).toBe(2);
    await save({ id: a.project.id, name: "Front door", photos: { exterior: { kind: "upload", blob: blob("TWO"), width: 800, height: 600, placement: PLACEMENT } }, preview: blob("P2", "image/png") });
    expect((await allKeys()).length).toBe(2);
    await save({ id: a.project.id, name: "Front door", photos: {}, preview: null });
    expect((await allKeys()).length).toBe(1); // only the preview remains
    expect((await repo.load(a.project.id)).photos).toEqual({});
  });

  it("names: required, trimmed, bounded, and unique ignoring case (but a project may keep its own name)", async () => {
    const a = await save({ name: "  Porch  " });
    expect(a.project.name).toBe("Porch");
    await expect(save({ name: "porch" })).rejects.toMatchObject({ code: "NAME_TAKEN" });
    await expect(save({ name: "   " })).rejects.toMatchObject({ code: "INVALID" });
    await expect(save({ name: "x".repeat(61) })).rejects.toMatchObject({ code: "INVALID" });
    await expect(save({ id: a.project.id, name: "PORCH" })).resolves.toBeTruthy();
  });

  it("updating a project that no longer exists is an error, not a silent create", async () => {
    await expect(save({ id: "gone" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid placement before writing anything", async () => {
    await expect(save({ photos: { exterior: { kind: "upload", blob: blob("X"), width: 1600, height: 1200, placement: { ...PLACEMENT, quad: [] as never } } } })).rejects.toMatchObject({ code: "INVALID" });
    expect(await repo.list()).toHaveLength(0);
    expect(await allKeys()).toHaveLength(0);
  });

  it("if browser storage is full, the save fails with a clear error and leaves no orphaned files or half-written project", async () => {
    const spy = vi.spyOn(storage, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    await expect(save({ photos: { exterior: { kind: "upload", blob: blob("BIG"), width: 800, height: 600, placement: PLACEMENT } }, preview: blob("P", "image/png") })).rejects.toMatchObject({ code: "QUOTA" });
    spy.mockRestore();
    expect(await allKeys()).toHaveLength(0);
    expect(await repo.list()).toHaveLength(0);
  });

  it("remove deletes the project and all its files; removing twice is harmless", async () => {
    const a = await save({ photos: { exterior: { kind: "upload", blob: blob("X"), width: 800, height: 600, placement: PLACEMENT } }, preview: blob("P", "image/png") });
    await repo.remove(a.project.id);
    expect(await repo.list()).toHaveLength(0);
    expect(await allKeys()).toHaveLength(0);
    await expect(repo.remove(a.project.id)).resolves.toBeUndefined();
  });

  it("loading a project whose photo file went missing still opens it, with a warning", async () => {
    const a = await save({ photos: { exterior: { kind: "upload", blob: blob("X"), width: 800, height: 600, placement: PLACEMENT } } });
    await blobStore.delete(await allKeys());
    const l = await repo.load(a.project.id);
    expect(l.config).toEqual(a.project.config);
    expect(l.photos.exterior).toBeUndefined();
    expect(l.warnings.join(" ")).toMatch(/missing/i);
  });

  it("survives corrupt storage without throwing", async () => {
    storage.setItem("threshold.projects.v2", "{not json");
    expect(await repo.list()).toEqual([]);
    storage.setItem("threshold.projects.v2", JSON.stringify([null, 5, { id: 1 }, { id: "a", name: "ok", config: "garbage", photos: {} }]));
    expect(await repo.list()).toEqual([]);
    await expect(repo.load("a")).rejects.toBeInstanceOf(ProjectError);
  });

  it("imports Phase 2 saved designs once, without touching the originals", async () => {
    const legacy = [{ id: "old-1", name: "Old door", selections: { layout: "single", style: "contemporary", lite: "half", glass: "frosted", colorDoorExt: "#3a3d42", handle: "bar", handleFinish: "#b4b7ba" }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" }];
    storage.setItem("threshold.designs.v1", JSON.stringify(legacy));
    const list = await repo.list();
    expect(list.map((p) => p.name)).toEqual(["Old door"]);
    expect(list[0].config.product).toBe("meridian");
    expect(JSON.parse(storage.getItem("threshold.designs.v1")!)).toEqual(legacy); // original untouched
    expect(await repo.list()).toHaveLength(1); // not imported twice
    expect((await repo.load("old-1")).config.lite).toBe("half");
  });

  it("rename: updates the name, keeps everything else, rejects duplicates and bad names", async () => {
    const a = await save({ name: "One", photos: { exterior: { kind: "upload", blob: blob("KEEP"), width: 800, height: 600, placement: PLACEMENT } } });
    await save({ name: "Two" });
    await repo.rename(a.project.id, "Uno");
    const l = await repo.load(a.project.id);
    expect(l.name).toBe("Uno");
    expect(l.config).toEqual(a.project.config);
    expect(l.photos.exterior?.kind).toBe("upload");
    await expect(repo.rename(a.project.id, "TWO")).rejects.toMatchObject({ code: "NAME_TAKEN" });
    await expect(repo.rename(a.project.id, "")).rejects.toMatchObject({ code: "INVALID" });
    await expect(repo.rename("nope", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists newest first", async () => {
    await save({ name: "first" });
    await new Promise((r) => setTimeout(r, 5));
    await save({ name: "second" });
    expect((await repo.list()).map((p) => p.name)).toEqual(["second", "first"]);
  });
});
