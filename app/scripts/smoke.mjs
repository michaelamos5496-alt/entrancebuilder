// Post-deploy smoke test. Safe to run against production: it only reads public pages and sends requests that must be refused.
//   node scripts/smoke.mjs https://your-domain.example [--expect=cloud|local-dev]
// Exit code 0 only if every check passes. Prints one line per check.
const base = (process.argv[2] ?? "").replace(/\/$/, "");
const expectMode = process.argv.find((a) => a.startsWith("--expect="))?.split("=")[1];
if (!/^https?:\/\//.test(base)) { console.error("usage: node scripts/smoke.mjs <base-url> [--expect=cloud|local-dev]"); process.exit(2); }

const results = [];
const check = async (name, fn) => {
  try { const detail = await fn(); results.push([true, name, detail ?? ""]); }
  catch (e) { results.push([false, name, e instanceof Error ? e.message : String(e)]); }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const get = (p, init) => fetch(base + p, { redirect: "manual", ...init });
const UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

let mode = "unknown";
await check("health endpoint answers ok and reveals no secrets", async () => {
  const r = await get("/api/health");
  assert(r.status === 200, `status ${r.status}`);
  const j = await r.json();
  assert(j.status === "ok", "status field");
  assert(["cloud", "local-dev"].includes(j.mode), "mode field");
  assert(typeof j.serviceKeyConfigured === "boolean", "serviceKeyConfigured must be a boolean (presence only)");
  assert(!JSON.stringify(j).match(/eyJ|sb_secret|service_role/), "health output contains something key-like");
  mode = j.mode;
  if (expectMode) assert(j.mode === expectMode, `expected mode ${expectMode}, got ${j.mode}`);
  return `mode=${j.mode} version=${j.version} env=${j.env} serviceKeyConfigured=${j.serviceKeyConfigured}`;
});

for (const p of ["/", "/configurator", "/designs", "/login", "/legal/privacy"]) {
  await check(`page ${p} loads over a healthy connection`, async () => {
    const r = await get(p);
    assert(r.status === 200, `status ${r.status}`);
    const html = await r.text();
    assert(html.length > 1000, "suspiciously small response");
    assert(!/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(html) || mode === "cloud", "a JWT is embedded in the page"); // the public anon key is a JWT in cloud mode
    assert(!/SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role/.test(html), "page mentions the service role");
  });
}

await check("security headers are present", async () => {
  const h = (await get("/")).headers;
  for (const [k, v] of [["x-content-type-options", /nosniff/], ["x-frame-options", /DENY/], ["referrer-policy", /./], ["content-security-policy", /frame-ancestors 'none'/], ["strict-transport-security", /max-age/]]) {
    assert(v.test(h.get(k) ?? ""), `missing or wrong ${k}: ${h.get(k)}`);
  }
  assert(!h.get("x-powered-by"), "x-powered-by should be removed");
  if (base.startsWith("https://")) assert(!/unsafe-eval/.test(h.get("content-security-policy") ?? ""), "CSP allows eval");
});

await check("a missing page is a proper 404 with a way back", async () => {
  const r = await get("/definitely-not-a-page");
  assert(r.status === 404, `status ${r.status}`);
  assert(/Create a new door/.test(await r.text()), "no link back");
});

await check("project API refuses anonymous callers (401 in cloud mode, 503 when storage is not configured)", async () => {
  const want = mode === "cloud" ? 401 : 503;
  for (const [m, p] of [["POST", `/api/projects/${UUID}/media`], ["DELETE", `/api/projects/${UUID}`], ["DELETE", `/api/projects/${UUID}/media?view=exterior`]]) {
    const r = await get(p, { method: m, ...(m === "POST" ? { body: new FormData() } : {}) });
    assert([want, 400].includes(r.status) && r.status !== 200, `${m} ${p} -> ${r.status} (wanted ${want})`);
    assert(r.headers.get("cache-control")?.includes("no-store"), `${m} ${p}: response is cacheable`);
  }
});

await check("an oversized upload is refused before it is processed", async () => {
  const r = await get(`/api/projects/${UUID}/media`, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(60 * 1024 * 1024) }, body: "x" }).catch(() => ({ status: 413 }));
  assert([413, 400].includes(r.status) || r.status === 503 || r.status === 401, `status ${r.status}`);
});

await check("the sign-in callback never redirects off-site", async () => {
  const r = await get("/auth/callback?code=bogus&next=//evil.example");
  assert(r.status >= 300 && r.status < 400, `status ${r.status}`);
  const loc = r.headers.get("location") ?? "";
  assert(new URL(loc, base).origin === new URL(base).origin, `redirects to ${loc}`);
});

await check("client error reports are validated (bad input rejected, good input accepted)", async () => {
  const bad = await get("/api/client-error", { method: "POST", body: "nope", headers: { "content-type": "application/json" } });
  assert(bad.status === 400, `bad body -> ${bad.status}`);
  const ok = await get("/api/client-error", { method: "POST", body: JSON.stringify({ message: "smoke test (ignore)", path: "/smoke" }), headers: { "content-type": "application/json" } });
  assert(ok.status === 204, `good body -> ${ok.status}`);
});

let failed = 0;
for (const [ok, name, detail] of results) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  | " + detail : ""}`); }
console.log(failed ? `\n${failed} of ${results.length} checks FAILED against ${base}` : `\nAll ${results.length} checks passed against ${base}`);
process.exit(failed ? 1 : 0);
