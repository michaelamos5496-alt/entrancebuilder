import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const tryBuild = vi.fn();
vi.mock("@/server/supabaseDeps", () => ({ tryBuildMediaDeps: () => tryBuild(), buildMediaDeps: () => tryBuild() }));

import { DELETE as deleteProject } from "../route";
import { DELETE as deletePhoto, PATCH, POST } from "../media/route";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = { params: Promise.resolve({ id: ID }) };
const configure = () => { vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon"); };
const upload = (size = 10, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.set("kind", "photo"); f.set("view", "exterior"); f.set("placement", "{}"); f.set("file", new File([new Uint8Array(size)], "p.jpg"));
  return new Request("http://t/api/projects/x/media", { method: "POST", body: f, headers: extra });
};
afterEach(() => { vi.unstubAllEnvs(); tryBuild.mockReset(); });

describe("API routes: configuration", () => {
  it("answer 503 (not a crash) when cloud storage is not configured at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    for (const r of [await POST(upload(), ctx), await PATCH(new Request("http://t", { method: "PATCH", body: "{}" }), ctx), await deletePhoto(new Request("http://t/x?view=exterior", { method: "DELETE" }), ctx), await deleteProject(new Request("http://t", { method: "DELETE" }), ctx)]) {
      expect(r.status).toBe(503);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect((await r.json()).error.code).toBe("UNAVAILABLE");
    }
    expect(tryBuild).not.toHaveBeenCalled();
  });
  it("answer 503 when the public settings exist but the server key is missing", async () => {
    configure();
    tryBuild.mockResolvedValue(null);
    for (const r of [await POST(upload(), ctx), await deleteProject(new Request("http://t", { method: "DELETE" }), ctx)]) expect(r.status).toBe(503);
  });
});

describe("API routes: request guards (before any authentication or storage work)", () => {
  it("reject an oversized upload by its declared length without reading the body", async () => {
    configure();
    const r = await POST(upload(10, { "content-length": String(50 * 1024 * 1024) }), ctx);
    expect(r.status).toBe(413);
    expect(r.headers.get("cache-control")).toBe("no-store"); // early refusals are uncacheable too
    expect(tryBuild).not.toHaveBeenCalled();
  });
  it("reject a body that is not multipart, and a multipart without a file", async () => {
    configure();
    const bad = await POST(new Request("http://t", { method: "POST", body: "not multipart", headers: { "content-type": "text/plain" } }), ctx);
    expect(bad.status).toBe(400);
    expect(bad.headers.get("cache-control")).toBe("no-store");
    const f = new FormData(); f.set("kind", "photo");
    expect((await POST(new Request("http://t", { method: "POST", body: f }), ctx)).status).toBe(400);
    expect(tryBuild).not.toHaveBeenCalled();
  });
  it("reject malformed JSON on PATCH", async () => {
    configure();
    expect((await PATCH(new Request("http://t", { method: "PATCH", body: "{nope" }), ctx)).status).toBe(400);
  });
  it("never cache responses", async () => {
    configure(); tryBuild.mockResolvedValue({ getUserId: async () => null } as never);
    const r = await POST(upload(), ctx);
    expect(r.status).toBe(401);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
