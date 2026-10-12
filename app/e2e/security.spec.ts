import { expect, makeJpeg, openConfigurator, overlayPixels, test, uploadHousePhoto } from "./helpers";

test.describe("production security headers", () => {
  for (const path of ["/", "/configurator", "/designs", "/api/health"]) {
    test(`${path} sends the hardening headers`, async ({ request }) => {
      const r = await request.get(path);
      const h = r.headers();
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("DENY");
      expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(h["strict-transport-security"]).toContain("max-age=");
      expect(h["x-powered-by"]).toBeUndefined();
    });
  }

  test("the whole app works under the Content Security Policy (no violations through photo, save, export)", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => { if (/content security policy|refused to (load|connect|apply|execute)/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => violations.push(String(e).slice(0, 200)));
    await openConfigurator(page, "?preset=sunlit-transom");
    await uploadHousePhoto(page, await makeJpeg(page, 1600, 1200));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    await page.getByRole("navigation", { name: "Configuration steps" }).getByRole("button", { name: "Summary" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Save project" }).click();
    await expect(page.getByRole("dialog")).toContainText("Saved in this browser");
    await page.keyboard.press("Escape");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download image" }).click()]);
    expect(dl.suggestedFilename()).toBe("door-preview.png");
    await page.goto("/designs");
    await expect(page.getByRole("img", { name: /Preview of/ })).toBeVisible();
    expect(violations, "CSP violations or script errors").toEqual([]);
  });
});
