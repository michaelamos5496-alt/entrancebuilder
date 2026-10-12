import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DOC, PLACEMENT, USER_A, USER_B, as, freshDb } from "./harness";

let db: PGlite;
beforeAll(async () => { db = await freshDb(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec("delete from public.project_photos; delete from public.projects; delete from storage.objects;"); });

const A = { user: USER_A }, B = { user: USER_B };
const insertProject = (name = "Front door", extra = "") =>
  db.query<{ id: string }>(`insert into public.projects (name, document, catalogue_version${extra ? ", " + extra.split("=")[0] : ""}) values ($1, $2, 'v1'${extra ? ", " + extra.split("=")[1] : ""}) returning id`, [name, JSON.stringify(DOC)]);
const rejects = async (p: Promise<unknown>, re: RegExp) => { await expect(p).rejects.toThrow(re); };

describe("projects: ownership", () => {
  it("owner_id is filled from the signed-in user, not from the client", async () => {
    const r = await as(db, A, () => db.query<{ owner_id: string }>(`insert into public.projects (name, document, catalogue_version) values ('x', $1, 'v1') returning owner_id`, [JSON.stringify(DOC)]));
    expect(r.rows[0].owner_id).toBe(USER_A);
  });

  it("a user cannot create a project owned by someone else", async () => {
    await rejects(as(db, A, () => db.query(`insert into public.projects (owner_id, name, document, catalogue_version) values ($1, 'steal', $2, 'v1')`, [USER_B, JSON.stringify(DOC)])), /row-level security/);
  });

  it("users see only their own projects", async () => {
    await as(db, A, () => insertProject("A's door"));
    await as(db, B, () => insertProject("B's door"));
    const a = await as(db, A, () => db.query<{ name: string }>("select name from public.projects"));
    const b = await as(db, B, () => db.query<{ name: string }>("select name from public.projects"));
    expect(a.rows.map((r) => r.name)).toEqual(["A's door"]);
    expect(b.rows.map((r) => r.name)).toEqual(["B's door"]);
  });

  it("a user cannot read, update or delete another user's project by id", async () => {
    const { rows } = await as(db, A, () => insertProject("private"));
    const id = rows[0].id;
    expect((await as(db, B, () => db.query("select * from public.projects where id = $1", [id]))).rows).toHaveLength(0);
    expect((await as(db, B, () => db.query("update public.projects set name = 'hacked' where id = $1 returning id", [id]))).rows).toHaveLength(0);
    expect((await as(db, B, () => db.query("delete from public.projects where id = $1 returning id", [id]))).rows).toHaveLength(0);
    const still = await as(db, A, () => db.query<{ name: string }>("select name from public.projects where id = $1", [id]));
    expect(still.rows[0].name).toBe("private");
  });

  it("ownership cannot be transferred or hijacked via update", async () => {
    const { rows } = await as(db, A, () => insertProject("mine"));
    await rejects(as(db, A, () => db.query("update public.projects set owner_id = $1 where id = $2", [USER_B, rows[0].id])), /row-level security|owner_id cannot be changed/);
  });

  it("anonymous visitors cannot read or write anything", async () => {
    await as(db, A, () => insertProject("x"));
    await rejects(as(db, "anon", () => db.query("select * from public.projects")), /permission denied/);
    await rejects(as(db, "anon", () => db.query(`insert into public.projects (name, document, catalogue_version) values ('x', '{}', 'v1')`)), /permission denied/);
    await rejects(as(db, "anon", () => db.query("select * from public.project_photos")), /permission denied/);
  });

  it("with no user in the token, nothing is visible or insertable", async () => {
    await as(db, A, () => insertProject("x"));
    const rows = await as(db, { user: "" }, () => db.query("select * from public.projects"));
    expect(rows.rows).toHaveLength(0);
    await rejects(as(db, { user: "" }, () => db.query(`insert into public.projects (name, document, catalogue_version) values ('x', $1, 'v1')`, [JSON.stringify(DOC)])), /null value|row-level security/);
  });
});

describe("projects: data integrity", () => {
  it("rejects bad names (empty, whitespace, too long)", async () => {
    for (const bad of ["", "   ", "x".repeat(61)]) await rejects(as(db, A, () => insertProject(bad)), /projects_name_length/);
  });
  it("names are unique per owner, case-insensitively, but may repeat across owners", async () => {
    await as(db, A, () => insertProject("Porch"));
    await rejects(as(db, A, () => insertProject("  porch ")), /projects_owner_name_key/);
    await expect(as(db, B, () => insertProject("Porch"))).resolves.toBeTruthy();
  });
  it("rejects documents that are not a door configuration object, or are huge", async () => {
    const ins = (doc: unknown) => as(db, A, () => db.query(`insert into public.projects (name, document, catalogue_version) values ('d', $1, 'v1')`, [JSON.stringify(doc)]));
    await rejects(ins([]), /projects_document_shape/);
    await rejects(ins("text"), /projects_document_shape/);
    await rejects(ins({ schemaVersion: 2 }), /projects_document_shape/);
    await rejects(ins({ ...DOC, junk: "x".repeat(20000) }), /projects_document_size/);
  });
  it("updated_at moves forward on update; created_at does not", async () => {
    const { rows } = await as(db, A, () => insertProject("t"));
    const before = (await db.query<{ c: Date; u: Date }>("select created_at c, updated_at u from public.projects where id = $1", [rows[0].id])).rows[0];
    await db.exec("select pg_sleep(0.02)");
    await as(db, A, () => db.query("update public.projects set name = 't2' where id = $1", [rows[0].id]));
    const after = (await db.query<{ c: Date; u: Date }>("select created_at c, updated_at u from public.projects where id = $1", [rows[0].id])).rows[0];
    expect(new Date(after.c).getTime()).toBe(new Date(before.c).getTime());
    expect(new Date(after.u).getTime()).toBeGreaterThan(new Date(before.u).getTime());
  });
  it("caps projects per account", async () => {
    await db.exec(`insert into public.projects (owner_id, name, document, catalogue_version)
      select '${USER_A}', 'p' || g, '{"schemaVersion":2,"product":"haven"}', 'v1' from generate_series(1, 200) g`);
    await rejects(as(db, A, () => insertProject("one too many")), /project limit reached/);
    await expect(as(db, B, () => insertProject("fine"))).resolves.toBeTruthy();
  });
  it("a preview path must live inside the project's own folder", async () => {
    const { rows } = await as(db, A, () => insertProject("pv"));
    const id = rows[0].id;
    await as(db, A, () => db.query("update public.projects set preview_path = $1 where id = $2", [`${USER_A}/${id}/preview.png`, id]));
    await rejects(as(db, A, () => db.query("update public.projects set preview_path = $1 where id = $2", [`${USER_B}/${id}/preview.png`, id])), /projects_preview_path_owned/);
    await rejects(as(db, A, () => db.query("update public.projects set preview_path = '../../etc/passwd' where id = $1", [id])), /projects_preview_path_owned/);
  });
});

describe("projects: scene (sample-gallery photo + placement)", () => {
  const ins = (scene: unknown) => as(db, A, () => db.query(`insert into public.projects (name, document, scene, catalogue_version) values ('s', $1, $2, 'v1')`, [JSON.stringify(DOC), JSON.stringify(scene)]));
  it("accepts a gallery photo with a valid placement, and the empty default", async () => {
    await ins({ exterior: { kind: "gallery", galleryId: "house-2", placement: PLACEMENT } });
    const d = await as(db, B, () => db.query(`insert into public.projects (name, document, catalogue_version) values ('d', $1, 'v1') returning scene`, [JSON.stringify(DOC)]));
    expect(d.rows[0]).toEqual({ scene: {} });
  });
  it.each([
    ["an array", []], ["unknown view", { attic: { kind: "gallery", galleryId: "x", placement: PLACEMENT } }],
    ["an upload (those belong in storage)", { exterior: { kind: "upload", galleryId: "x", placement: PLACEMENT } }],
    ["a path-like gallery id", { exterior: { kind: "gallery", galleryId: "../../etc", placement: PLACEMENT } }],
    ["an invalid placement", { exterior: { kind: "gallery", galleryId: "house-1", placement: { ...PLACEMENT, brightness: 999 } } }],
  ])("rejects %s", async (_n, scene) => { await rejects(ins(scene), /projects_scene_valid/); });
  it("rejects an oversized scene", async () => {
    await rejects(ins({ exterior: { kind: "gallery", galleryId: "a", placement: PLACEMENT, pad: "x".repeat(5000) } }), /projects_scene_valid/);
  });
});

describe("project photos", () => {
  let pid: string;
  beforeEach(async () => { pid = (await as(db, A, () => insertProject("with photo"))).rows[0].id; });
  const photo = (over: Record<string, unknown> = {}) => ({
    project_id: pid, owner_id: USER_A, view: "exterior", storage_path: `${USER_A}/${pid}/photo-exterior-1.jpg`,
    width: 1600, height: 1200, bytes: 500000, placement: PLACEMENT, ...over,
  });
  const insertPhoto = (p: ReturnType<typeof photo>) =>
    db.query(`insert into public.project_photos (project_id, owner_id, view, storage_path, width, height, bytes, placement) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.project_id, p.owner_id, p.view, p.storage_path, p.width, p.height, p.bytes, JSON.stringify(p.placement)]);

  it("browsers (authenticated) cannot write photo rows at all", async () => {
    await rejects(as(db, A, () => insertPhoto(photo())), /permission denied/);
  });
  it("the server (service role) can write a valid photo row, and the owner can read it", async () => {
    await as(db, "service_role", () => insertPhoto(photo()));
    const r = await as(db, A, () => db.query("select view, width from public.project_photos"));
    expect(r.rows).toEqual([{ view: "exterior", width: 1600 }]);
  });
  it("another user cannot see the photo row", async () => {
    await as(db, "service_role", () => insertPhoto(photo()));
    expect((await as(db, B, () => db.query("select * from public.project_photos"))).rows).toHaveLength(0);
  });
  it("even the server cannot store a file path outside the owner's project folder", async () => {
    await rejects(as(db, "service_role", () => insertPhoto(photo({ storage_path: `${USER_B}/${pid}/x.jpg` }))), /project_photos_path_owned/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ storage_path: `${USER_A}/${USER_A}/x.jpg` }))), /project_photos_path_owned/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ storage_path: "other.jpg" }))), /project_photos_path_owned/);
  });
  it("rejects invalid dimensions, sizes, views and placements", async () => {
    await rejects(as(db, "service_role", () => insertPhoto(photo({ width: 50 }))), /project_photos_size/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ height: 99999 }))), /project_photos_size/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ bytes: 99_999_999 }))), /project_photos_bytes/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ view: "attic" }))), /project_photos_view/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ placement: { ...PLACEMENT, brightness: 500 } }))), /project_photos_placement/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ placement: { ...PLACEMENT, quad: [] } }))), /project_photos_placement/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ placement: { ...PLACEMENT, flip: "yes" } }))), /project_photos_placement/);
    await rejects(as(db, "service_role", () => insertPhoto(photo({ placement: "nope" }))), /project_photos_placement/);
  });
  it("one photo per view per project", async () => {
    await as(db, "service_role", () => insertPhoto(photo()));
    await rejects(as(db, "service_role", () => insertPhoto(photo({ storage_path: `${USER_A}/${pid}/photo-exterior-2.jpg` }))), /project_photos_one_per_view/);
    await expect(as(db, "service_role", () => insertPhoto(photo({ view: "interior", storage_path: `${USER_A}/${pid}/photo-interior-1.jpg` })))).resolves.toBeTruthy();
  });
  it("photos are deleted with their project", async () => {
    await as(db, "service_role", () => insertPhoto(photo()));
    await as(db, A, () => db.query("delete from public.projects where id = $1", [pid]));
    expect((await db.query("select * from public.project_photos")).rows).toHaveLength(0);
  });
  it("deleting a user removes their projects and photos", async () => {
    await as(db, "service_role", () => insertPhoto(photo()));
    await db.exec(`delete from auth.users where id = '${USER_A}'`);
    expect((await db.query("select * from public.projects")).rows).toHaveLength(0);
    expect((await db.query("select * from public.project_photos")).rows).toHaveLength(0);
  });
});

describe("private storage", () => {
  it("the bucket is private with size and type limits", async () => {
    const b = (await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'project-media'")).rows[0];
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(4 * 1024 * 1024);
    expect(b.allowed_mime_types.sort()).toEqual(["image/jpeg", "image/png"]);
  });
  const put = async (path: string) => db.query("insert into storage.objects (bucket_id, name) values ('project-media', $1)", [path]);
  it("users read only objects in their own folder", async () => {
    await as(db, "service_role", () => put(`${USER_A}/p1/a.jpg`));
    await as(db, "service_role", () => put(`${USER_B}/p2/b.jpg`));
    const a = await as(db, A, () => db.query<{ name: string }>("select name from storage.objects"));
    expect(a.rows.map((r) => r.name)).toEqual([`${USER_A}/p1/a.jpg`]);
    const b = await as(db, B, () => db.query<{ name: string }>("select name from storage.objects"));
    expect(b.rows.map((r) => r.name)).toEqual([`${USER_B}/p2/b.jpg`]);
  });
  it("a folder-name trick does not grant access to another user's files", async () => {
    await as(db, "service_role", () => put(`${USER_B}/p/${USER_A}/x.jpg`));
    await as(db, "service_role", () => put(`${USER_A}x/p/y.jpg`));
    expect((await as(db, A, () => db.query("select * from storage.objects"))).rows).toHaveLength(0);
  });
  it("browsers cannot upload, overwrite or delete, even in their own folder", async () => {
    await rejects(as(db, A, () => put(`${USER_A}/p/new.jpg`)), /row-level security/);
    await as(db, "service_role", () => put(`${USER_A}/p/old.jpg`));
    expect((await as(db, A, () => db.query("update storage.objects set name = 'x' where name like $1 returning id", [`${USER_A}/%`]))).rows).toHaveLength(0);
    expect((await as(db, A, () => db.query("delete from storage.objects where name like $1 returning id", [`${USER_A}/%`]))).rows).toHaveLength(0);
    expect((await db.query("select * from storage.objects")).rows).toHaveLength(1);
  });
  it("anonymous visitors cannot list or read objects", async () => {
    await as(db, "service_role", () => put(`${USER_A}/p/a.jpg`));
    const r = await as(db, "anon", () => db.query("select * from storage.objects").catch((e: Error) => e));
    expect(r instanceof Error ? r.message : (r as { rows: unknown[] }).rows.length).toSatisfy((v: unknown) => v === 0 || /permission denied/.test(String(v)));
  });
  it("objects in other buckets are not exposed by our policy", async () => {
    await db.exec("insert into storage.buckets (id, name) values ('other', 'other')");
    await as(db, "service_role", () => db.query("insert into storage.objects (bucket_id, name) values ('other', $1)", [`${USER_A}/p/x.jpg`]));
    expect((await as(db, A, () => db.query("select * from storage.objects"))).rows).toHaveLength(0);
  });
});
