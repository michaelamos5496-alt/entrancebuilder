import { afterEach, describe, expect, it, vi } from "vitest";
import { isCloudConfigured, publicSupabaseConfig, safeNext } from "../env";
import { serviceRoleKey } from "../serverEnv";

// the `server-only` guard throws outside a server build; tests stand in for the server
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("safeNext (open-redirect guard)", () => {
  it.each([["/designs", "/designs"], ["/configurator?open=abc", "/configurator?open=abc"]])("allows %s", (i, o) => expect(safeNext(i)).toBe(o));
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", "/a\nb", "/ok\u0000"])("rejects %j", (i) => expect(safeNext(i)).toBe("/designs"));
  it("falls back for null/undefined", () => { expect(safeNext(null)).toBe("/designs"); expect(safeNext(undefined, "/x")).toBe("/x"); });
});

describe("environment", () => {
  it("cloud mode needs both public values", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(isCloudConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    expect(isCloudConfigured()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    expect(publicSupabaseConfig()).toEqual({ url: "https://abc.supabase.co", anonKey: "anon" });
  });
  it("refuses plain http to a remote host but allows localhost for development", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://abc.supabase.co");
    expect(publicSupabaseConfig()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(publicSupabaseConfig()).not.toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not a url");
    expect(publicSupabaseConfig()).toBeNull();
  });
  it("the service role key is required and can never be read in a browser", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => serviceRoleKey()).toThrow(/not set/);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "secret");
    expect(serviceRoleKey()).toBe("secret");
    vi.stubGlobal("window", {});
    expect(() => serviceRoleKey()).toThrow(/browser/);
  });
});
