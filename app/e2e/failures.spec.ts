import { expect, goToStep, makeJpeg, openConfigurator, overlayPixels, photoCanvas, test, uploadHousePhoto } from "./helpers";
import type { Page } from "@playwright/test";

const ascii = (s: string) => Buffer.from(s, "latin1");
const openUpload = async (page: Page) => {
  await page.getByRole("radio", { name: "House" }).click();
  const choose = page.getByRole("button", { name: "Choose a photo" });
  if (await choose.isVisible().catch(() => false)) await choose.click(); else await page.getByRole("button", { name: "Replace photo" }).click();
  await page.getByRole("dialog").getByRole("tab", { name: /Upload/ }).click();
};
const fileInput = (page: Page) => page.getByRole("dialog").locator('input[type="file"]');
const dialogAlert = (page: Page) => page.getByRole("dialog").getByRole("alert");

test.describe("invalid uploads never trap the user", () => {
  const cases: [string, Buffer, RegExp][] = [
    ["text pretending to be a JPEG", ascii("hello, definitely not a photo ".repeat(10)), /doesn.t look like a JPEG, PNG or WebP/],
    ["an SVG with a script", ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), /doesn.t look like/],
    ["an iPhone HEIC file", Buffer.concat([Buffer.from([0, 0, 0, 24]), ascii("ftypheic"), Buffer.alloc(64)]), /HEIC/],
    ["an empty file", Buffer.alloc(0), /empty/i],
  ];
  for (const [name, buffer, message] of cases) {
    test(`${name}: clear message, dialog still usable, current photo kept`, async ({ page }) => {
      await openConfigurator(page);
      await uploadHousePhoto(page, await makeJpeg(page, 1200, 900));
      await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
      await page.getByRole("button", { name: "Replace photo" }).click();
      await page.getByRole("dialog").getByRole("tab", { name: /Upload/ }).click();
      await fileInput(page).setInputFiles({ name: "bad.jpg", mimeType: "image/jpeg", buffer });
      await expect(dialogAlert(page)).toContainText(message);
      // not trapped: switch tab, pick a sample, or close
      await page.getByRole("dialog").getByRole("tab", { name: "Sample gallery" }).click();
      await expect(dialogAlert(page)).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(photoCanvas(page)).toBeVisible(); // the previous photo is still there
      await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    });
  }

  test("a cut-off JPEG and a tiny image are rejected with specific messages", async ({ page }) => {
    await openConfigurator(page);
    await openUpload(page);
    const good = await makeJpeg(page, 1600, 1200);
    await fileInput(page).setInputFiles({ name: "cut.jpg", mimeType: "image/jpeg", buffer: good.subarray(0, Math.floor(good.length / 3)) });
    await expect(dialogAlert(page)).toContainText(/incomplete|cut off/);
    await fileInput(page).setInputFiles({ name: "tiny.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(page, 60, 60) });
    await expect(dialogAlert(page)).toContainText(/only 60×60px/);
    await fileInput(page).setInputFiles({ name: "ok.jpg", mimeType: "image/jpeg", buffer: good });
    await expect(photoCanvas(page)).toBeVisible(); // and a good one works right after the errors
  });

  test("a file over the size limit is refused before it is read", async ({ page }) => {
    await openConfigurator(page);
    await openUpload(page);
    await fileInput(page).setInputFiles({ name: "huge.jpg", mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(26 * 1024 * 1024)]) });
    await expect(dialogAlert(page)).toContainText(/limit is 25 MB/);
  });
});

test.describe("failed network requests", () => {
  test("a sample photo that fails to load shows an error and the user can pick another", async ({ page }) => {
    await page.route("**/gallery/house-1.svg", (r) => r.abort("connectionfailed"));
    await openConfigurator(page);
    await page.getByRole("radio", { name: "House" }).click();
    await page.getByRole("button", { name: "Choose a photo" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Gray siding/ }).click();
    await expect(dialogAlert(page)).toContainText(/couldn.t be loaded/);
    await expect(page.getByRole("dialog").getByRole("button", { name: /Red brick/ })).toBeEnabled();
    await page.getByRole("dialog").getByRole("button", { name: /Red brick/ }).click();
    await expect(photoCanvas(page)).toBeVisible();
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
  });

  test("going offline mid-session does not break designing, saving or exporting", async ({ page, context }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page, 1400, 1000));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    await context.setOffline(true);
    await goToStep(page, "Colors");
    await page.getByRole("radiogroup", { name: "Door · exterior" }).getByRole("radio", { name: "Red" }).click();
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Save project" }).click();
    await expect(page.getByRole("dialog")).toContainText("Saved in this browser");
    await page.keyboard.press("Escape");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download image" }).click()]);
    expect(dl.suggestedFilename()).toBe("door-preview.png");
    await context.setOffline(false);
  });
});

test.describe("browser storage problems", () => {
  test("corrupt saved data does not stop the app from starting", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("threshold.draft.v1", "{this is not json");
      localStorage.setItem("threshold.projects.v2", "[null, 5, {\"id\": 1}]");
      localStorage.setItem("threshold.designs.v1", "garbage");
    });
    await openConfigurator(page);
    await expect(page.getByTestId("active-product")).toContainText("Haven"); // fell back to defaults
    await page.goto("/designs");
    await expect(page.getByText("No projects yet")).toBeVisible();
  });

  test("storage that refuses writes: designing still works and Save explains the problem", async ({ page }) => {
    await page.addInitScript(() => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (String(k).startsWith("threshold.projects") || String(k).startsWith("threshold.draft")) throw new DOMException("full", "QuotaExceededError");
        return orig.call(this, k, v);
      };
    });
    await openConfigurator(page);
    await goToStep(page, "Door");
    await page.getByRole("radio", { name: /Solstice/ }).click();
    await expect(page.getByTestId("active-product")).toContainText("Solstice");
    await goToStep(page, "Summary");
    await page.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Save project" }).click();
    await expect(dialogAlert(page)).toContainText(/storage is full/i);
    await expect(page.getByRole("dialog")).not.toContainText("Saved in this browser");
    await expect(dialogAlert(page)).toContainText("Nothing has been lost");
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("term").filter({ hasText: "Door model" }).locator("xpath=following-sibling::*[1]")).toContainText("Solstice"); // the design is untouched
  });
});

test.describe("slow work can be cancelled", () => {
  test("a very large photo shows progress, can be cancelled, and the picker stays usable", async ({ page }) => {
    await openConfigurator(page);
    await openUpload(page);
    const big = await makeJpeg(page, 7000, 5000);
    await fileInput(page).setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: big });
    // The load may finish before we can press Cancel (it is fast on a good machine). Either way the app must end in a usable state.
    const cancelled = await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click({ timeout: 1500 }).then(() => true, () => false);
    if (cancelled) {
      await expect(page.getByRole("dialog").getByRole("tab", { name: /Upload/ })).toBeVisible();
      await expect(dialogAlert(page)).toHaveCount(0); // cancelling is not an error
    } else {
      await expect(photoCanvas(page)).toBeVisible();
    }
  });

  test("a large photo is reduced to a safe working size", async ({ page }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page, 6000, 4000));
    await expect(photoCanvas(page)).toBeVisible({ timeout: 20_000 });
    const size = await photoCanvas(page).evaluate((c: HTMLCanvasElement) => ({ w: c.width, h: c.height }));
    expect(size.w).toBeLessThan(2200); // display canvas (device pixels), never the full 6000 px
  });
});

test.describe("not-found and navigation recovery", () => {
  test("an unknown page offers a way back", async ({ page }) => {
    await page.goto("/definitely-not-here");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("doesn't exist");
    await page.getByRole("link", { name: "Create a new door" }).click();
    await expect(page.getByTestId("active-product")).toBeVisible();
  });

  test("opening a project that no longer exists explains it and leaves a working configurator", async ({ page }) => {
    await page.goto("/configurator?open=00000000-0000-4000-8000-000000000000");
    await expect(page.getByTestId("active-product")).toBeVisible();
    await expect(page.getByText(/no longer exists/)).toBeVisible();
    await goToStep(page, "Door");
    await page.getByRole("radio", { name: /Meridian/ }).click();
    await expect(page.getByTestId("active-product")).toContainText("Meridian");
  });

  test("a damaged share link is reported and a new design starts", async ({ page }) => {
    await page.goto("/configurator?d=%%%not-valid");
    await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /couldn.t be read/ })).toBeVisible();
    await expect(page.getByTestId("active-product")).toContainText("Haven");
  });
});
