import { execFileSync } from "node:child_process";
import { expect, test } from "./helpers";

test.describe("operational endpoints", () => {
  test("health reports mode and configuration presence, never secrets", async ({ request }) => {
    const r = await request.get("/api/health");
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toContain("no-store");
    const j = await r.json();
    expect(j).toMatchObject({ status: "ok", mode: expect.stringMatching(/^(cloud|local-dev)$/) });
    expect(typeof j.serviceKeyConfigured).toBe("boolean");
    expect(JSON.stringify(j)).not.toMatch(/eyJ|sb_secret|service_role/);
  });

  test("client error reports: valid accepted, invalid and oversized refused", async ({ request }) => {
    const ok = await request.post("/api/client-error", { data: { message: "e2e test error", path: "/configurator?d=PRIVATE#x" } });
    expect(ok.status()).toBe(204);
    expect((await request.post("/api/client-error", { data: "not json", headers: { "content-type": "application/json" } })).status()).toBe(400);
    expect((await request.post("/api/client-error", { data: { message: "", path: "/" } })).status()).toBe(400);
    expect((await request.post("/api/client-error", { data: { message: "x".repeat(6000), path: "/" } })).status()).toBe(413);
  });

  test("an uncaught error in the browser is reported to the log endpoint with a clean path", async ({ page }) => {
    const bodies: string[] = [];
    await page.route("**/api/client-error", async (route) => { bodies.push(route.request().postData() ?? ""); await route.fulfill({ status: 204 }); });
    await page.goto("/designs?secret=1");
    await page.evaluate(() => { setTimeout(() => { throw new Error("e2e boom"); }, 0); });
    await expect.poll(() => bodies.length).toBeGreaterThan(0);
    const report = JSON.parse(bodies[0]);
    expect(report.message).toContain("e2e boom");
    expect(report.path).toBe("/designs"); // query string is never sent
  });

  test("the post-deploy smoke script passes against this server", async ({ baseURL }) => {
    const out = execFileSync("node", ["scripts/smoke.mjs", baseURL!], { encoding: "utf8" });
    expect(out).toContain("All ");
    expect(out).not.toContain("FAIL");
  });
});
