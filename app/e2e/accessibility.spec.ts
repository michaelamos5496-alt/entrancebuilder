import { expect, expectAccessible, goToStep, makeJpeg, openConfigurator, overlayPixels, test, uploadHousePhoto } from "./helpers";

const notes: string[] = [];
const note = (label: string, rest: { id: string; impact?: string | null; nodes: unknown[] }[]) => rest.forEach((v) => notes.push(`${label}: ${v.impact} ${v.id} (${v.nodes.length})`));
test.afterAll(() => { if (notes.length) console.log("Non-blocking (moderate/minor) accessibility notes:\n" + notes.join("\n")); });

test.describe("automated accessibility scans (WCAG 2.2 AA + best practice; fail on serious/critical)", () => {
  for (const [name, path] of [["home", "/"], ["my designs (empty)", "/designs"], ["login", "/login"], ["privacy", "/legal/privacy"], ["terms", "/legal/terms"], ["not found", "/nope"]] as const) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      note(name, await expectAccessible(page, name));
    });
  }

  test("configurator: every step", async ({ page }) => {
    await openConfigurator(page, "?preset=grand-entry");
    for (const step of ["Layout", "Door", "Glass", "Colors", "Handle", "Summary"]) {
      await goToStep(page, step);
      note(`step ${step}`, await expectAccessible(page, `step ${step}`));
    }
  });

  test("configurator: search results and the empty-search state", async ({ page }) => {
    await openConfigurator(page);
    await page.getByRole("searchbox", { name: "Search options" }).fill("frosted");
    note("search results", await expectAccessible(page, "search results"));
    await page.getByRole("searchbox", { name: "Search options" }).fill("zzzz");
    note("search empty", await expectAccessible(page, "search empty"));
  });

  test("dialogs: photo picker, save, share", async ({ page }) => {
    await openConfigurator(page);
    await page.getByRole("radio", { name: "House" }).click();
    await page.getByRole("button", { name: "Choose a photo" }).click();
    note("photo dialog (gallery)", await expectAccessible(page, "photo dialog gallery"));
    await page.getByRole("tab", { name: /Upload/ }).click();
    note("photo dialog (upload)", await expectAccessible(page, "photo dialog upload"));
    await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image at all") });
    await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
    note("photo dialog (error)", await expectAccessible(page, "photo dialog error"));
    await page.keyboard.press("Escape");
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    note("save dialog", await expectAccessible(page, "save dialog"));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Share" }).click();
    note("share dialog", await expectAccessible(page, "share dialog"));
  });

  test("house mode with a photo: corner handles, toolbar, lighting panel", async ({ page }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    note("photo stage", await expectAccessible(page, "photo stage"));
    await page.getByRole("button", { name: "Lighting" }).click();
    note("lighting panel", await expectAccessible(page, "lighting panel"));
  });


  test("mobile layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openConfigurator(page);
    note("mobile configurator", await expectAccessible(page, "mobile configurator"));
    await page.getByRole("button", { name: "Open menu" }).click();
    note("mobile menu", await expectAccessible(page, "mobile menu"));
  });
});

test.describe("cookie banner", () => {
  test.use({ consent: false });
  test("is accessible, readable, dismissible, and remembered", async ({ page }) => {
    await page.goto("/");
    const banner = page.getByRole("region", { name: "Cookie consent" });
    await expect(banner).toBeVisible();
    note("cookie banner", await expectAccessible(page, "cookie banner"));
    await banner.getByRole("button", { name: "Reject all" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toHaveCount(0);
  });
});

test.describe("keyboard-only use", () => {
  test("skip link jumps to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("every focused control shows a visible focus indicator", async ({ page }) => {
    await openConfigurator(page);
    const bad: string[] = [];
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== "none";
        return { visible, label: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40), tag: el.tagName };
      });
      if (r && !r.visible) bad.push(`${r.tag} "${r.label}"`);
    }
    expect(bad, "focused elements without a visible focus indicator").toEqual([]);
  });

  test("option groups are operable with the keyboard: arrows move, Space/Enter select", async ({ page }) => {
    await openConfigurator(page);
    const group = page.getByRole("radiogroup", { name: "Configuration" });
    const first = group.getByRole("radio").first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio").nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(group.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Space");
    await expect(group.getByRole("radio").nth(1)).toHaveAttribute("aria-checked", "true");
  });

  test("dialogs: focus moves in, Escape closes, focus returns to the trigger", async ({ page }) => {
    await openConfigurator(page);
    await goToStep(page, "Summary");
    const trigger = page.getByRole("button", { name: "Share" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("checkbox")).toBeFocused();
    // focus is trapped inside the dialog
    for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("the doorway and its corners can be moved from the keyboard", async ({ page }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    const outline = page.locator("svg polygon[stroke-dasharray]");
    const start = await outline.getAttribute("points");
    await page.getByRole("button", { name: /Top-left corner/ }).focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowUp");
    await expect(outline).not.toHaveAttribute("points", start!);
    await outline.focus();
    const moved = await outline.getAttribute("points");
    await page.keyboard.press("ArrowRight");
    await expect(outline).not.toHaveAttribute("points", moved!);
    await page.keyboard.press("-");
    await page.getByRole("button", { name: "Undo placement" }).click();
  });

  test("the whole save flow works without a mouse", async ({ page }) => {
    await openConfigurator(page);
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Project name")).toBeFocused();
    await page.keyboard.type("Keyboard door");
    await page.keyboard.press("Enter"); // submit the form
    await expect(dialog).toContainText("Saved in this browser");
  });
});
