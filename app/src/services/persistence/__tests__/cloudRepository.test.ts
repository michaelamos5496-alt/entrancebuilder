import { describe, expect, it } from "vitest";
import { CloudApiError, createCloudRepository, type CloudApi, type CloudProjectRow, type ProjectWrite } from "../cloudRepository";
import { PLACEMENT, blob, config } from "./fixtures";

/** An in-memory backend with failure injection. It records every call so tests can assert what was (not) attempted. */
function fake(user: string | null = "u1") {
  const rows = new Map<string, CloudProjectRow>();
  const files = new Map<string, Blob>();
  const calls: string[] = [];
  const fail = new Set<string>();
  let n = 0;
  const maybeFail = (op: string, kind: CloudApiError["kind"] = "server") => { if (fail.has(op)) throw new CloudApiError(kind); };
  const api: CloudApi = {
    getUserId: async () => { calls.push("getUserId"); return user; },
    listProjects: async () => { calls.push("list"); maybeFail("list", "network"); return [...rows.values()]; },
    getProject: async (id) => { calls.push("get"); maybeFail("get"); return rows.get(id) ?? null; },
    insertProject: async (v: ProjectWrite) => {
      calls.push("insert"); maybeFail("insert");
      if ([...rows.values()].some((r) => r.name.toLowerCase() === v.name.toLowerCase())) throw new CloudApiError("conflict");
      const now = new Date(1_700_000_000_000 + ++n * 1000).toISOString();
      const row: CloudProjectRow = { id: `p${n}`, name: v.name, document: v.document, scene: v.scene, preview_path: null, created_at: now, updated_at: now, project_photos: [] };
      rows.set(row.id, row); return row;
    },
    updateProject: async (id, v) => {
      calls.push("update"); maybeFail("update");
      const r = rows.get(id); if (!r) return null;
      if ([...rows.values()].some((o) => o.id !== id && o.name.toLowerCase() === v.name.toLowerCase())) throw new CloudApiError("conflict");
      Object.assign(r, { name: v.name, document: v.document, scene: v.scene, updated_at: new Date(1_700_000_000_000 + ++n * 1000).toISOString() }); return r;
    },
    signedUrls: async (paths) => { calls.push("sign"); maybeFail("sign"); return Object.fromEntries(paths.filter((p) => files.has(p)).map((p) => [p, `https://signed/${p}`])); },
    fetchBlob: async (url) => { calls.push("fetchBlob"); maybeFail("fetchBlob", "network"); return files.get(url.replace("https://signed/", ""))!; },
    uploadPhoto: async (id, view, b, placement) => {
      calls.push(`uploadPhoto:${view}`); maybeFail(`uploadPhoto:${view}`, "invalid");
      const r = rows.get(id)!; const path = `${user}/${id}/photo-${view}`; files.set(path, b);
      r.project_photos = [...r.project_photos.filter((p) => p.view !== view), { view, storage_path: path, width: 1600, height: 1200, placement }];
    },
    uploadPreview: async (id, b) => { calls.push("uploadPreview"); maybeFail("uploadPreview"); const path = `${user}/${id}/preview`; files.set(path, b); rows.get(id)!.preview_path = path; },
    patchPlacement: async (id, view, placement) => { calls.push(`patch:${view}`); const p = rows.get(id)!.project_photos.find((x) => x.view === view)!; p.placement = placement; },
    deletePhoto: async (id, view) => { calls.push(`deletePhoto:${view}`); const r = rows.get(id)!; r.project_photos = r.project_photos.filter((p) => p.view !== view); },
    renameProject: async (id, name) => {
      calls.push("rename");
      const r = rows.get(id); if (!r) throw new CloudApiError("not_found");
      if ([...rows.values()].some((o) => o.id !== id && o.name.toLowerCase() === name.toLowerCase())) throw new CloudApiError("conflict");
      r.name = name;
    },
    deleteProject: async (id) => { calls.push("deleteProject"); maybeFail("deleteProject"); rows.delete(id); },
  };
  return { api, rows, files, calls, fail };
}
const input = (o: Record<string, unknown> = {}) => ({ name: "Front door", config: config(), photos: {}, preview: null, ...o }) as Parameters<ReturnType<typeof createCloudRepository>["save"]>[0];

describe("cloud repository", () => {
  it("is labelled as the account store", () => {
    expect(createCloudRepository(fake().api).mode).toBe("cloud");
  });

  it("signed-out: refuses before contacting the database for writes, with a sign-in error", async () => {
    const f = fake(null);
    await expect(createCloudRepository(f.api).save(input())).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(f.calls).toEqual(["getUserId"]);
    await expect(createCloudRepository(f.api).list()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(createCloudRepository(f.api).load("x")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    await expect(createCloudRepository(f.api).remove("x")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("saves, lists and reopens with the configuration restored exactly", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const c = config("solstice", { colorDoorExt: "#74806b", layout: "side-both", handle: "lever", lite: "half" });
    const { project, warnings } = await repo.save(input({ config: c, name: "Garden" }));
    expect(warnings).toEqual([]);
    expect((await repo.list()).map((p) => p.name)).toEqual(["Garden"]);
    expect((await repo.load(project.id)).config).toEqual(c);
  });

  it("never sends ownership: the write payload has no owner field", async () => {
    const f = fake(); let seen: ProjectWrite | null = null;
    const orig = f.api.insertProject; f.api.insertProject = async (v) => { seen = v; return orig(v); };
    await createCloudRepository(f.api).save(input());
    expect(Object.keys(seen!).sort()).toEqual(["catalogue_version", "document", "name", "schema_version", "scene"].sort());
  });

  it("uploads photos and preview, restores them on load with placements", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const { project } = await repo.save(input({
      photos: {
        exterior: { kind: "upload", blob: blob("EXT"), width: 1600, height: 1200, placement: { ...PLACEMENT, flip: true } },
        interior: { kind: "gallery", galleryId: "room-1", width: 1200, height: 800, placement: PLACEMENT },
      },
      preview: blob("PNG", "image/png"),
    }));
    expect(project.previewUrl).toMatch(/^https:\/\/signed\//);
    expect(project.photoViews).toEqual(["exterior", "interior"]);
    const l = await repo.load(project.id);
    expect(l.warnings).toEqual([]);
    expect(l.photos.exterior).toMatchObject({ kind: "upload", placement: { flip: true } });
    expect(l.photos.interior).toMatchObject({ kind: "gallery", galleryId: "room-1" });
  });

  it("if the project row cannot be saved, nothing else is attempted", async () => {
    const f = fake(); f.fail.add("insert");
    await expect(createCloudRepository(f.api).save(input({ photos: { exterior: { kind: "upload", blob: blob("X"), width: 1600, height: 1200, placement: PLACEMENT } }, preview: blob("P", "image/png") }))).rejects.toMatchObject({ code: "SERVER" });
    expect(f.calls.filter((c) => c.startsWith("upload"))).toEqual([]);
    expect(f.files.size).toBe(0);
  });

  it("a photo failure after the row is saved is reported as a warning, not hidden and not fatal", async () => {
    const f = fake(); f.fail.add("uploadPhoto:exterior");
    const r = await createCloudRepository(f.api).save(input({ photos: { exterior: { kind: "upload", blob: blob("X"), width: 1600, height: 1200, placement: PLACEMENT } }, preview: blob("P", "image/png") }));
    expect(r.project.name).toBe("Front door");
    expect(r.warnings.join(" ")).toMatch(/exterior photo wasn't stored/);
    expect(f.rows.size).toBe(1);
  });

  it("a preview failure is a warning too", async () => {
    const f = fake(); f.fail.add("uploadPreview");
    const r = await createCloudRepository(f.api).save(input({ preview: blob("P", "image/png") }));
    expect(r.warnings).toEqual(["Saved, but the preview image couldn't be stored."]);
  });

  it("updating: keeps a stored photo (placement only) and removes photos that were dropped", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const a = await repo.save(input({ photos: { exterior: { kind: "upload", blob: blob("E"), width: 1600, height: 1200, placement: PLACEMENT }, interior: { kind: "upload", blob: blob("I"), width: 1600, height: 1200, placement: PLACEMENT } } }));
    f.calls.length = 0;
    await repo.save(input({ id: a.project.id, photos: { exterior: { kind: "upload", blob: null, width: 1600, height: 1200, placement: { ...PLACEMENT, shadow: false } } } }));
    expect(f.calls).toContain("patch:exterior");
    expect(f.calls).not.toContain("uploadPhoto:exterior");
    expect(f.calls).toContain("deletePhoto:interior");
    expect(f.rows.get(a.project.id)!.project_photos.map((p) => p.view)).toEqual(["exterior"]);
  });

  it("maps errors to user-safe messages without leaking internals", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    await repo.save(input({ name: "Taken" }));
    await expect(repo.save(input({ name: "taken" }))).rejects.toMatchObject({ code: "NAME_TAKEN" });
    f.fail.add("insert");
    const e = await repo.save(input({ name: "Another" })).catch((x) => x);
    expect(e.code).toBe("SERVER");
    expect(e.message).not.toMatch(/CloudApiError|stack|sql|postgres/i);
    f.fail.clear(); f.fail.add("list");
    await expect(repo.list()).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("updating or loading a missing project is NOT_FOUND", async () => {
    const repo = createCloudRepository(fake().api);
    await expect(repo.save(input({ id: "nope" }))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.load("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a photo that cannot be downloaded or has a bad placement only produces a warning; the project still opens", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const { project } = await repo.save(input({ photos: { exterior: { kind: "upload", blob: blob("E"), width: 1600, height: 1200, placement: PLACEMENT } } }));
    f.fail.add("fetchBlob");
    let l = await repo.load(project.id);
    expect(l.config).toEqual(config());
    expect(l.photos.exterior).toBeUndefined();
    expect(l.warnings.join(" ")).toMatch(/couldn't be downloaded/);
    f.fail.clear(); f.rows.get(project.id)!.project_photos[0].placement = { quad: [] };
    l = await repo.load(project.id);
    expect(l.warnings.join(" ")).toMatch(/door position was invalid/);
  });

  it("list skips projects whose stored document cannot be understood instead of failing everything", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    await repo.save(input({ name: "good" }));
    f.rows.set("bad", { id: "bad", name: "bad", document: "garbage", scene: {}, preview_path: null, created_at: "", updated_at: "", project_photos: [] });
    expect((await repo.list()).map((p) => p.name)).toEqual(["good"]);
  });

  it("remove calls the server delete (which also removes files); failure is reported", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const { project } = await repo.save(input());
    await repo.remove(project.id);
    expect(f.rows.size).toBe(0);
    f.fail.add("deleteProject");
    await expect(repo.remove("x")).rejects.toMatchObject({ code: "SERVER" });
  });

  it("rename: works, rejects duplicates and bad names, needs sign-in, and 404s a missing project", async () => {
    const f = fake(); const repo = createCloudRepository(f.api);
    const a = await repo.save(input({ name: "One" })); await repo.save(input({ name: "Two" }));
    await repo.rename(a.project.id, " Uno ");
    expect(f.rows.get(a.project.id)!.name).toBe("Uno");
    await expect(repo.rename(a.project.id, "two")).rejects.toMatchObject({ code: "NAME_TAKEN" });
    await expect(repo.rename(a.project.id, "  ")).rejects.toMatchObject({ code: "INVALID" });
    await expect(repo.rename("missing", "x")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createCloudRepository(fake(null).api).rename("x", "y")).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });

  it("invalid names are rejected locally before any request", async () => {
    const f = fake();
    await expect(createCloudRepository(f.api).save(input({ name: "  " }))).rejects.toMatchObject({ code: "INVALID" });
    expect(f.calls).toEqual([]);
  });
});
