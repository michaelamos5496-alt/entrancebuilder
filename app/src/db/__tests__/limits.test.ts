import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIA_LIMITS } from "@/domain/project/media";
import { REQUEST_LIMIT_BYTES } from "@/server/media";

const sql = fs.readFileSync(path.join(process.cwd(), "supabase", "migrations", "20261012000001_projects.sql"), "utf8");
const PLATFORM_BODY_LIMIT = 4.5 * 1024 * 1024; // Vercel serverless request body limit

describe("upload limits agree everywhere (code, database, storage, hosting platform)", () => {
  it("the bucket size limit equals the server's photo cap", () => {
    const m = sql.match(/'project-media', 'project-media', false, (\d+),/);
    expect(Number(m?.[1])).toBe(MEDIA_LIMITS.photoMaxBytes);
  });
  it("the photo table's byte constraint equals the server's photo cap", () => {
    const m = sql.match(/project_photos_bytes check \(bytes between 1 and (\d+)\)/);
    expect(Number(m?.[1])).toBe(MEDIA_LIMITS.photoMaxBytes);
  });
  it("the bucket only allows the types the server accepts", () => {
    expect(sql).toMatch(/allowed_mime_types[\s\S]*array\['image\/jpeg', 'image\/png'\]/);
  });
  it("a maximum-size upload (plus multipart overhead) fits under the hosting platform's request-body limit", () => {
    expect(REQUEST_LIMIT_BYTES).toBeLessThan(PLATFORM_BODY_LIMIT);
    expect(MEDIA_LIMITS.photoMaxBytes + 64 * 1024).toBeLessThan(PLATFORM_BODY_LIMIT);
  });
  it("the browser aims below the cap", () => {
    expect(MEDIA_LIMITS.photoTargetBytes).toBeLessThan(MEDIA_LIMITS.photoMaxBytes);
  });
  it("the preview cap fits inside the bucket limit", () => {
    expect(MEDIA_LIMITS.previewMaxBytes).toBeLessThanOrEqual(MEDIA_LIMITS.photoMaxBytes);
  });
});
