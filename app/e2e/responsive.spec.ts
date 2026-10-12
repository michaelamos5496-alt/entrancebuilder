import { expect, goToStep, makeJpeg, openConfigurator, overlayPixels, test, uploadHousePhoto } from "./helpers";

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 820, height: 1100 },
  { name: "phone", width: 390, height: 844 },
  { name: "small-phone", width: 320, height: 640 },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const [label, path] of [["home", "/"], ["designs", "/designs"], ["login", "/login"], ["configurator", "/configurator"]] as const) {
      test(`${label}: no horizontal scroll, content visible`, async ({ page }) => {
        await page.goto(path);
        await expect(page.locator("main")).toBeVisible();
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        expect(o.sw, `horizontal overflow on ${label}`).toBeLessThanOrEqual(o.cw);
        await page.screenshot({ path: `e2e/screens/${vp.name}-${label}.png` });
      });
    }

    test("critical journey: choose a door, add a photo, place it, save, reopen", async ({ page }) => {
      await openConfigurator(page);
      // controls the journey needs are reachable (scrollable into view) and not covered
      await goToStep(page, "Door");
      await page.getByRole("radio", { name: /Meridian/ }).click();
      await expect(page.getByTestId("active-product")).toContainText("Meridian");
      await uploadHousePhoto(page, await makeJpeg(page, 1600, 1200));
      await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
      const corner = page.getByRole("button", { name: /Bottom-right corner/ });
      const box = (await corner.boundingBox())!;
      expect(box.width, "touch target").toBeGreaterThanOrEqual(36);
      const poly = page.locator("svg polygon[stroke-dasharray]");
      const before = await poly.getAttribute("points");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 14, box.y + box.height / 2 + 10, { steps: 4 });
      await page.mouse.up();
      await expect(poly).not.toHaveAttribute("points", before!);
      await page.screenshot({ path: `e2e/screens/${vp.name}-photo.png` });
      await goToStep(page, "Summary");
      await page.getByRole("button", { name: "Save", exact: true }).last().click(); // the bar at the bottom is always on screen
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      const dbox = (await dialog.boundingBox())!;
      expect(dbox.x).toBeGreaterThanOrEqual(0);
      expect(dbox.x + dbox.width).toBeLessThanOrEqual(vp.width + 1); // dialog fits the screen
      await page.screenshot({ path: `e2e/screens/${vp.name}-save.png` });
      await dialog.getByLabel("Project name").fill(`Journey ${vp.name}`);
      await dialog.getByRole("button", { name: "Save project" }).click();
      await expect(dialog).toContainText("Saved in this browser");
      await dialog.getByRole("button", { name: "Continue" }).click();
      await page.goto("/designs");
      await expect(page.getByRole("heading", { name: `Journey ${vp.name}` })).toBeVisible();
      await page.getByRole("link", { name: `Edit Journey ${vp.name}` }).click();
      await expect(page.getByTestId("active-product")).toContainText("Meridian");
      await expect(page.getByRole("img", { name: /^Your photo/ })).toBeVisible();
    });
  });
}

test.describe("interactive states", () => {
  test("hover, focus, disabled and error states are visibly different", async ({ page }) => {
    await openConfigurator(page, "?preset=tall-black"); // Axis
    const group = page.getByRole("radiogroup", { name: "Configuration" });
    const enabled = group.getByRole("radio", { name: /^Double doors/ });
    const disabled = page.getByRole("button", { name: "Previous" }); // first step: nothing before it
    const style = (loc: typeof enabled) => loc.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, border: c.borderColor, op: c.opacity, ring: c.outlineStyle + c.outlineWidth, cursor: c.cursor, shadow: c.boxShadow }; });
    const rest = await style(enabled);
    await enabled.hover();
    await page.waitForTimeout(300); // let the 150ms colour transition finish
    const hover = await style(enabled);
    expect([hover.bg !== rest.bg, hover.color !== rest.color, hover.border !== rest.border, hover.shadow !== rest.shadow].some(Boolean), "hover must change something visible").toBe(true);
    await enabled.focus();
    await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    const focus = await style(enabled);
    expect(focus.ring).not.toMatch(/^none/);
    const dis = await style(disabled);
    expect(parseFloat(dis.op)).toBeLessThan(1);
    await page.screenshot({ path: "e2e/screens/states-options.png" });
    // error state in a form
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    const name = page.getByRole("dialog").getByLabel("Project name");
    await name.fill("   ");
    await page.getByRole("dialog").getByRole("button", { name: "Save project" }).click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(/name/i);
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await page.screenshot({ path: "e2e/screens/states-error.png" });
  });
});
