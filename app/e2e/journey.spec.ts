import fs from "node:fs";
import { doorOverlay, expect, test, goToStep, makeJpeg, openConfigurator, overlayPixels, photoCanvas, uploadHousePhoto } from "./helpers";

test.describe("main user journey", () => {
  test("home → configure → compatibility → photo → place → save → refresh → reopen → export → delete", async ({ page }) => {
    // --- home
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Create your door" })).toBeVisible();
    await page.getByRole("link", { name: "START CREATING" }).first().click();
    await expect(page.getByTestId("active-product")).toContainText("Haven");

    // --- product selection + compatibility
    await goToStep(page, "Layout");
    await page.getByRole("radio", { name: /^Left sidelite/ }).first().click();
    await goToStep(page, "Door");
    await page.getByRole("radio", { name: /Axis/ }).click();
    await expect(page.getByTestId("active-product")).toContainText("Axis");
    await expect(page.getByRole("status").filter({ hasText: /choices were reset/ })).toContainText("Configuration: Left sidelite → Single door"); // told about EVERY reset
    await goToStep(page, "Layout");
    // Axis has no sidelites, but the option is not greyed out: choosing it switches the door and says so.
    const left = page.getByRole("radiogroup", { name: "Configuration" }).getByRole("radio", { name: /^Left sidelite\s*Switches/ });
    await expect(left).not.toHaveAttribute("aria-disabled", "true");
    await left.click();
    await expect(page.getByTestId("active-product")).not.toContainText("Axis");
    await expect(page.getByRole("radio", { name: /^Left sidelite(?! \+)/ })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("status").filter({ hasText: /Switches to the/ })).toBeVisible();
    await goToStep(page, "Door"); // back to Axis for the rest of the journey
    await page.getByRole("radio", { name: /Axis/ }).click();
    await expect(page.getByTestId("active-product")).toContainText("Axis");
    await goToStep(page, "Colors");
    await page.getByRole("radiogroup", { name: "Door · exterior" }).getByRole("radio", { name: "Gray" }).click();

    // --- photo + placement
    const jpeg = await makeJpeg(page, 1800, 1200);
    await uploadHousePhoto(page, jpeg);
    await expect(photoCanvas(page)).toBeVisible();
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(2000);
    const outline = page.locator("svg polygon[stroke-dasharray]");
    const before = await outline.getAttribute("points");
    const corner = page.getByRole("button", { name: /Top-left corner/ });
    const box = (await corner.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x - 30, box.y - 30, { steps: 6 });
    await page.mouse.up();
    await expect(outline).not.toHaveAttribute("points", before!);
    await page.getByRole("button", { name: "Reset door position" }).click();
    await expect(outline).toHaveAttribute("points", before!);
    await page.getByRole("button", { name: "Flip door" }).click();
    await page.getByRole("button", { name: "Make door larger" }).click();
    const placed = await outline.getAttribute("points");

    // --- save (local development mode is stated plainly)
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Local development mode");
    await expect(dialog.getByLabel("Project name")).toBeFocused();
    await dialog.getByLabel("Project name").fill("E2E porch");
    await dialog.getByRole("button", { name: "Save project" }).click();
    await expect(dialog).toContainText("Saved in this browser");
    await dialog.getByRole("button", { name: "Continue" }).click();

    // --- refresh the app, reopen from My designs
    await page.reload();
    await page.getByRole("link", { name: "My designs" }).first().click();
    await expect(page.getByRole("heading", { name: "E2E porch" })).toBeVisible();
    await expect(page.getByText("1 photo")).toBeVisible();
    await expect(page.getByRole("img", { name: "Preview of E2E porch" })).toBeVisible();
    await page.getByRole("link", { name: "Edit E2E porch" }).click();
    await expect(page.getByTestId("active-product")).toContainText("Axis");
    await expect(photoCanvas(page)).toBeVisible();
    await expect(page.locator("svg polygon[stroke-dasharray]")).toHaveAttribute("points", placed!);
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(2000);
    await goToStep(page, "Colors");
    await expect(page.getByRole("radiogroup", { name: "Door · exterior" }).getByRole("radio", { name: "Gray" })).toHaveAttribute("aria-checked", "true");

    // --- export contains the preview
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download image" }).click()]);
    expect(download.suggestedFilename()).toBe("door-preview.png");
    const path = await download.path();
    const png = fs.readFileSync(path);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    expect(w / h).toBeCloseTo(1.5, 1);
    expect(png.length).toBeGreaterThan(20_000);

    // --- delete cleans up
    await page.goto("/designs");
    await page.getByRole("button", { name: "Delete E2E porch" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No projects yet")).toBeVisible();
    await expect(doorOverlay(page)).toHaveCount(0);
  });

  test("a design survives a browser refresh and back/forward navigation", async ({ page }) => {
    await openConfigurator(page, "?preset=grand-entry");
    await goToStep(page, "Colors");
    await page.getByRole("radiogroup", { name: "Door · exterior" }).getByRole("radio", { name: "Red" }).click();
    await page.reload();
    await expect(page.getByTestId("active-product")).toContainText("Haven");
    await goToStep(page, "Colors");
    await expect(page.getByRole("radiogroup", { name: "Door · exterior" }).getByRole("radio", { name: "Red" })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("link", { name: "My designs" }).first().click();
    await expect(page.getByRole("heading", { name: "My designs" })).toBeVisible(); // let the navigation finish before going back
    await page.goBack();
    await expect(page.getByTestId("active-product")).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "My designs" })).toBeVisible();
  });

  test("undo, redo and reset work across the whole configuration", async ({ page }) => {
    await openConfigurator(page);
    await goToStep(page, "Door");
    await page.getByRole("radio", { name: /Solstice/ }).click();
    await expect(page.getByTestId("active-product")).toContainText("Solstice");
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();
    await expect(page.getByTestId("active-product")).toContainText("Haven");
    await page.getByRole("button", { name: "Redo", exact: true }).first().click();
    await expect(page.getByTestId("active-product")).toContainText("Solstice");
    await page.getByRole("button", { name: "Reset design" }).click();
    await expect(page.getByTestId("active-product")).toContainText("Haven");
  });
});
