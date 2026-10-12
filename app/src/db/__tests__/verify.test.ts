import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { freshDb } from "./harness";

const script = fs.readFileSync(path.join(process.cwd(), "supabase", "verify", "verify_security.sql"), "utf8");
let db: PGlite;
beforeAll(async () => { db = await freshDb(); }, 60_000);
afterAll(async () => { await db.close(); });
const run = async () => (await db.query<{ name: string; ok: boolean }>(script)).rows;

describe("operator verification script (supabase/verify/verify_security.sql)", () => {
  it("every check passes on a database built from the real migration", async () => {
    const rows = await run();
    expect(rows.length).toBeGreaterThanOrEqual(14);
    expect(rows.filter((r) => !r.ok).map((r) => r.name)).toEqual([]);
  });

  // the script must actually be able to FAIL, otherwise it gives false comfort
  const breakers: [string, string, RegExp][] = [
    ["RLS switched off", "alter table public.projects disable row level security", /RLS enabled on public.projects/],
    ["anon granted read access", "grant select on public.projects to anon", /anon has no privileges/],
    ["browsers allowed to write photo rows", "grant insert on public.project_photos to authenticated", /cannot write project_photos/],
    ["a write policy added to photo rows", "create policy bad on public.project_photos for insert to authenticated with check (true)", /ONLY a select policy/],
    ["bucket made public", "update storage.buckets set public = true where id = 'project-media'", /PRIVATE/],
    ["bucket limit raised", "update storage.buckets set file_size_limit = 99999999 where id = 'project-media'", /bucket limits/],
    ["a storage write policy added", "create policy bad_w on storage.objects for insert to authenticated with check (bucket_id = 'project-media')", /browsers cannot write files/],
    ["owner protection trigger dropped", "drop trigger projects_protect_owner on public.projects", /owner_id cannot be changed/],
  ];
  for (const [label, sql, expected] of breakers) {
    it(`detects: ${label}`, async () => {
      const broken = await freshDb();
      try {
        await broken.exec(sql);
        const rows = (await broken.query<{ name: string; ok: boolean }>(script)).rows;
        const failed = rows.filter((r) => !r.ok).map((r) => r.name);
        expect(failed.some((n) => expected.test(n)), `expected a failure matching ${expected}, got: ${failed.join(" | ") || "none"}`).toBe(true);
      } finally { await broken.close(); }
    }, 60_000);
  }
});
