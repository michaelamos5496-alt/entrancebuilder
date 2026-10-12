import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_MAX_BYTES, createLimiter, parseClientError } from "../clientErrors";
import { errorSummary, formatLog, redact } from "../log";

describe("structured logging", () => {
  it("emits one JSON object with time, level, event and app", () => {
    const line = formatLog("warn", "x", { a: 1 }, new Date("2026-01-02T03:04:05Z"));
    expect(JSON.parse(line)).toEqual({ ts: "2026-01-02T03:04:05.000Z", level: "warn", event: "x", app: "threshold", a: 1 });
    expect(line).not.toContain("\n");
  });
  it("never logs sensitive values, at any depth", () => {
    const out = redact({ authorization: "Bearer abc", nested: { Cookie: "sb=1", token: "t", password: "p", apiKey: "k", SUPABASE_SERVICE_ROLE_KEY: "s", email: "a@b.c", fine: "ok", deep: { a: { b: { c: { secret: "x" } } } } }, list: [{ jwt: "j" }] }) as Record<string, unknown>;
    const text = JSON.stringify(out);
    for (const bad of ["Bearer abc", "sb=1", '"t"', '"p"', '"k"', '"s"', "a@b.c", '"j"']) expect(text).not.toContain(bad);
    expect(text).toContain("[redacted]");
    expect(text).toContain("ok");
  });
  it("truncates huge strings and collections", () => {
    const o = redact({ big: "x".repeat(5000), arr: Array.from({ length: 100 }, (_, i) => i) }) as { big: string; arr: number[] };
    expect(o.big.length).toBeLessThan(600);
    expect(o.arr).toHaveLength(20);
  });
  it("error summaries drop stacks and keep the digest", () => {
    const e = Object.assign(new Error("boom"), { digest: "abc123" });
    expect(errorSummary(e)).toEqual({ name: "Error", message: "boom", digest: "abc123" });
    expect(JSON.stringify(errorSummary(e))).not.toContain("at ");
    expect(errorSummary("plain string").message).toBe("plain string");
  });
});

describe("client error reports", () => {
  const good = { message: "x is not a function", path: "/configurator?d=SECRETDESIGN#frag", source: "https://app/_next/chunk.js?v=1", line: 12, userAgent: "UA" };
  it("accepts a normal report and strips query strings and fragments", () => {
    const r = parseClientError(good)!;
    expect(r.path).toBe("/configurator");
    expect(r.source).toBe("https://app/_next/chunk.js");
    expect(JSON.stringify(r)).not.toContain("SECRETDESIGN");
  });
  it.each([null, [], "x", 5, {}, { message: "", path: "/" }, { message: "m", path: "no-slash" }, { message: 5, path: "/" }])("rejects %j", (v) => expect(parseClientError(v)).toBeNull());
  it("bounds field lengths and ignores unknown fields", () => {
    const r = parseClientError({ ...good, message: "m".repeat(5000), evil: "<script>", line: "NaN" })!;
    expect(r.message.length).toBe(300);
    expect("evil" in r).toBe(false);
    expect(r.line).toBeUndefined();
    expect(CLIENT_ERROR_MAX_BYTES).toBeLessThanOrEqual(8192);
  });
  it("the limiter allows a burst up to the maximum, blocks, then recovers after the window", () => {
    let t = 0;
    const allow = createLimiter(3, 1000, () => t);
    expect([allow("a"), allow("a"), allow("a"), allow("a")]).toEqual([true, true, true, false]);
    expect(allow("b")).toBe(true); // other clients are independent
    t = 1500;
    expect(allow("a")).toBe(true);
  });
});
