import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders, supabaseOrigin } from "../securityHeaders";

const get = (list: { key: string; value: string }[], key: string) => list.find((h) => h.key === key)?.value;

describe("security headers", () => {
  it("production sets CSP, HSTS and the standard hardening headers", () => {
    const h = securityHeaders({ production: true });
    for (const k of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Cross-Origin-Opener-Policy"]) expect(get(h, k), k).toBeTruthy();
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
    expect(get(h, "X-Frame-Options")).toBe("DENY");
    expect(get(h, "Permissions-Policy")).toMatch(/camera=\(\)/);
  });
  it("development gets no CSP/HSTS (dev tooling needs eval; HSTS on localhost is harmful)", () => {
    const h = securityHeaders({ production: false });
    expect(get(h, "Content-Security-Policy")).toBeUndefined();
    expect(get(h, "Strict-Transport-Security")).toBeUndefined();
    expect(get(h, "X-Content-Type-Options")).toBe("nosniff");
  });
  it("the CSP forbids framing, plugins and other origins by default", () => {
    const csp = contentSecurityPolicy({ production: true });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/\*/); // no wildcard origins
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
  });
  it("without cloud mode, no third-party origin is allowed at all", () => {
    const csp = contentSecurityPolicy({ production: true, supabaseUrl: null });
    expect(csp).not.toMatch(/https?:\/\/(?!localhost)/);
    expect(csp).not.toMatch(/wss?:/);
  });
  it("with cloud mode, only the project's own Supabase origin is added (https + websocket)", () => {
    const csp = contentSecurityPolicy({ production: true, supabaseUrl: "https://abcd.supabase.co/some/path" });
    expect(csp).toContain("connect-src 'self' blob: data: https://abcd.supabase.co wss://abcd.supabase.co");
    expect(csp).toContain("img-src 'self' data: blob: https://abcd.supabase.co");
    expect(csp.match(/supabase\.co/g)).toHaveLength(3);
  });
  it("garbage or empty URLs add nothing", () => {
    expect(supabaseOrigin("not a url")).toBeNull();
    expect(supabaseOrigin("")).toBeNull();
    expect(contentSecurityPolicy({ production: true, supabaseUrl: "javascript:alert(1)" })).not.toContain("javascript");
  });
});
