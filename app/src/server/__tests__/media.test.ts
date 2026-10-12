import { describe, expect, it } from "vitest";
import { handlePhotoDelete, handlePlacement, handleProjectDelete, handleUpload, type MediaDeps, type View } from "../media";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const MINE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const THEIRS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const ascii = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
function jpeg(w = 1600, h = 1200, withExif = false, complete = true) {
  const exif = withExif ? [0xff, 0xe1, 0, 20, ...ascii("Exif"), 0, 0, ...new Array(12).fill(7)] : [];
  return new Uint8Array([0xff, 0xd8, ...exif, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 1, 2, 3, ...(complete ? [0xff, 0xd9] : [])]);
}
const png = (w = 640, h = 480) => { const be = (n: number) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]; return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, ...ascii("IHDR"), ...be(w), ...be(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...ascii("IEND"), 1, 2, 3, 4]); };
const PLACEMENT = JSON.stringify({ quad: [{ x: 0.3, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 0.3, y: 0.8 }], flip: false, perspective: false, matchLighting: true, brightness: 0, shadow: true });

/** An in-memory backend that behaves like RLS: only returns rows owned by the signed-in user. */
function backend(user: string | null) {
  const projects = new Map<string, { id: string; owner: string; preview_path: string | null }>([
    [MINE, { id: MINE, owner: ME, preview_path: null }],
    [THEIRS, { id: THEIRS, owner: OTHER, preview_path: null }],
  ]);
  const photos = new Map<string, { path: string; owner: string; width: number; height: number; placement?: unknown }>();
  const files = new Map<string, { bytes: Uint8Array; type: string }>();
  const calls: string[] = [];
  let failUpsert = false, n = 0;
  const key = (p: string, v: string) => `${p}:${v}`;
  const deps: MediaDeps = {
    getUserId: async () => user,
    getOwnedProject: async (id) => { const p = projects.get(id); return p && p.owner === user ? { id, preview_path: p.preview_path } : null; },
    listPhotoPaths: async (id) => [...photos.entries()].filter(([k, v]) => k.startsWith(id) && v.owner === user).map(([, v]) => v.path),
    getPhoto: async (id, v) => { const p = photos.get(key(id, v)); return p && p.owner === user ? { path: p.path, width: p.width, height: p.height } : null; },
    updatePlacement: async (id, v, pl) => { calls.push("placement"); photos.get(key(id, v))!.placement = pl; },
    storagePut: async (path, bytes, type) => { calls.push(`put:${path}`); files.set(path, { bytes, type }); },
    storageRemove: async (paths) => { for (const p of paths) { calls.push(`rm:${p}`); files.delete(p); } },
    upsertPhoto: async (r) => { if (failUpsert) throw new Error("db down"); calls.push("upsert"); photos.set(key(r.project_id, r.view), { path: r.storage_path, owner: r.owner_id, width: r.width, height: r.height, placement: r.placement }); },
    deletePhotoRow: async (id, v) => { photos.delete(key(id, v)); },
    setPreviewPath: async (id, p) => { projects.get(id)!.preview_path = p; },
    deleteProjectRow: async (id) => { const p = projects.get(id); if (!p || p.owner !== user) return false; projects.delete(id); for (const k of [...photos.keys()]) if (k.startsWith(id)) photos.delete(k); return true; },
    newId: () => `id${++n}`,
  };
  return { deps, projects, photos, files, calls, failUpsert: (v: boolean) => { failUpsert = v; } };
}
const up = (b: Uint8Array, over: Partial<Parameters<typeof handleUpload>[2]> = {}) => ({ kind: "photo", view: "exterior", placement: PLACEMENT, bytes: b, ...over });

describe("authentication and ownership", () => {
  it("signed-out callers get 401 and nothing is written", async () => {
    const b = backend(null);
    const r = await handleUpload(b.deps, MINE, up(jpeg()));
    expect(r.status).toBe(401);
    expect(b.calls).toEqual([]);
  });
  it("a user cannot upload into another user's project: 404, indistinguishable from a missing project, nothing written", async () => {
    const b = backend(ME);
    const theirs = await handleUpload(b.deps, THEIRS, up(jpeg()));
    const missing = await handleUpload(b.deps, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", up(jpeg()));
    expect(theirs.status).toBe(404);
    expect(theirs.body).toEqual(missing.body);
    expect(b.calls).toEqual([]);
    expect(b.files.size).toBe(0);
  });
  it.each(["../../etc/passwd", "a/b", "", "not-a-uuid", `${MINE}/../${THEIRS}`, "00000000-0000-0000-0000-000000000000"])("rejects a malformed project id %j before touching storage", async (id) => {
    const b = backend(ME);
    const r = await handleUpload(b.deps, id, up(jpeg()));
    expect(r.status).toBe(404);
    expect(b.calls).toEqual([]);
  });
  it("cannot delete, replace the placement of, or remove photos from someone else's project", async () => {
    const b = backend(ME);
    expect((await handleProjectDelete(b.deps, THEIRS)).status).toBe(404);
    expect((await handlePhotoDelete(b.deps, THEIRS, "exterior")).status).toBe(404);
    expect((await handlePlacement(b.deps, THEIRS, "exterior", JSON.parse(PLACEMENT))).status).toBe(404);
    expect(b.projects.has(THEIRS)).toBe(true);
  });
  it("the storage path always starts with the verified user id and project id, never with client input", async () => {
    const b = backend(ME);
    const r = await handleUpload(b.deps, MINE, up(jpeg(), { view: "exterior" }));
    expect(r.status).toBe(200);
    expect(String(r.body.path)).toMatch(new RegExp(`^${ME}/${MINE}/photo-exterior-id\\d+\\.jpg$`));
  });
});

describe("photo upload", () => {
  it("stores a valid photo, strips metadata, and records the row", async () => {
    const b = backend(ME);
    const r = await handleUpload(b.deps, MINE, up(jpeg(1600, 1200, true)));
    expect(r.status).toBe(200);
    const stored = b.files.get(String(r.body.path))!;
    expect(stored.type).toBe("image/jpeg");
    expect(String.fromCharCode(...stored.bytes)).not.toContain("Exif");
    expect(b.photos.get(`${MINE}:exterior`)!.owner).toBe(ME);
  });
  it.each([
    ["not an image", new Uint8Array(ascii("x".repeat(50)))],
    ["a PNG", png()],
    ["a cut-off JPEG", jpeg(1600, 1200, false, false)],
    ["a tiny JPEG", jpeg(50, 50)],
    ["a huge-dimension JPEG", jpeg(9000, 9000)],
  ])("rejects %s with 400 and writes nothing", async (_n, bytes) => {
    const b = backend(ME);
    const r = await handleUpload(b.deps, MINE, up(bytes));
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(b.calls).toEqual([]);
  });
  it.each([["unknown view", { view: "attic" }], ["no view", { view: undefined }], ["unknown kind", { kind: "video" }], ["bad placement JSON", { placement: "{nope" }], ["unusable placement", { placement: JSON.stringify({ quad: [] }) }]])("rejects %s", async (_n, over) => {
    const b = backend(ME);
    const r = await handleUpload(b.deps, MINE, up(jpeg(), over as never));
    expect(r.status).toBe(400);
    expect(b.calls).toEqual([]);
  });
  it("replacing a photo removes the old file only after the new one is recorded", async () => {
    const b = backend(ME);
    const first = await handleUpload(b.deps, MINE, up(jpeg()));
    const second = await handleUpload(b.deps, MINE, up(jpeg(1200, 900)));
    expect(b.files.has(String(first.body.path))).toBe(false);
    expect(b.files.has(String(second.body.path))).toBe(true);
    expect(b.calls.indexOf("upsert")).toBeGreaterThanOrEqual(0);
    expect(b.photos.size).toBe(1);
  });
  it("if the database write fails, the freshly uploaded file is removed (no orphan) and the user gets a generic error", async () => {
    const b = backend(ME);
    b.failUpsert(true);
    const r = await handleUpload(b.deps, MINE, up(jpeg()));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toMatch(/db down/); // internals are not leaked
    expect(b.files.size).toBe(0);
  });
});

describe("preview upload", () => {
  it("stores a valid PNG preview and replaces the previous one", async () => {
    const b = backend(ME);
    const one = await handleUpload(b.deps, MINE, { kind: "preview", bytes: png() });
    const two = await handleUpload(b.deps, MINE, { kind: "preview", bytes: png(320, 240) });
    expect(one.status).toBe(200);
    expect(b.files.has(String(one.body.path))).toBe(false);
    expect(b.projects.get(MINE)!.preview_path).toBe(two.body.path);
  });
  it("rejects a JPEG or junk posing as a preview", async () => {
    const b = backend(ME);
    expect((await handleUpload(b.deps, MINE, { kind: "preview", bytes: jpeg() })).status).toBe(400);
    expect((await handleUpload(b.deps, MINE, { kind: "preview", bytes: new Uint8Array(ascii("<script>")) })).status).toBe(400);
    expect(b.files.size).toBe(0);
  });
});

describe("delete", () => {
  it("deleting a project removes the row and every stored file", async () => {
    const b = backend(ME);
    await handleUpload(b.deps, MINE, up(jpeg()));
    await handleUpload(b.deps, MINE, up(jpeg(), { view: "interior" }));
    await handleUpload(b.deps, MINE, { kind: "preview", bytes: png() });
    expect(b.files.size).toBe(3);
    const r = await handleProjectDelete(b.deps, MINE);
    expect(r.status).toBe(200);
    expect(b.projects.has(MINE)).toBe(false);
    expect(b.files.size).toBe(0);
  });
  it("removing one photo keeps the other", async () => {
    const b = backend(ME);
    await handleUpload(b.deps, MINE, up(jpeg()));
    await handleUpload(b.deps, MINE, up(jpeg(), { view: "interior" }));
    await handlePhotoDelete(b.deps, MINE, "exterior");
    expect(b.photos.has(`${MINE}:exterior`)).toBe(false);
    expect(b.photos.has(`${MINE}:interior`)).toBe(true);
    expect(b.files.size).toBe(1);
  });
});

describe("placement update", () => {
  it("updates a stored photo's placement, validates it, and needs an existing photo", async () => {
    const b = backend(ME);
    expect((await handlePlacement(b.deps, MINE, "exterior", JSON.parse(PLACEMENT))).status).toBe(404);
    await handleUpload(b.deps, MINE, up(jpeg()));
    expect((await handlePlacement(b.deps, MINE, "exterior", JSON.parse(PLACEMENT))).status).toBe(200);
    expect((await handlePlacement(b.deps, MINE, "exterior", { quad: [] })).status).toBe(400);
    expect((await handlePlacement(b.deps, MINE, "attic" as View, JSON.parse(PLACEMENT))).status).toBe(400);
    expect(b.calls.filter((c) => c === "placement")).toHaveLength(1);
  });
});
