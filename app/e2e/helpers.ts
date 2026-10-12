import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/** `test` with the cookie choice already made (as it is for a returning visitor). Use `test.use({ consent: false })` to see the banner. */
export const test = base.extend<{ consent: boolean }>({
  consent: [true, { option: true }],
  page: async ({ page, consent }, provide) => {
    if (consent) await page.addInitScript(() => { try { localStorage.setItem("threshold.consent.v1", "dismissed"); } catch { /* storage blocked */ } });
    await provide(page);
  },
});
export { expect };

/** A real JPEG made by the browser itself (so there are no binary fixtures to maintain). */
export async function makeJpeg(page: Page, w = 1600, h = 1200, hue = 30): Promise<Buffer> {
  const b64 = await page.evaluate(
    ({ w, h, hue }) => {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${hue},45%,70%)`); g.addColorStop(1, `hsl(${hue + 40},35%,35%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(w * 0.1, h * 0.2, w * 0.2, h * 0.25); ctx.fillRect(w * 0.7, h * 0.2, w * 0.2, h * 0.25);
      ctx.fillStyle = "rgba(40,30,25,.9)"; ctx.fillRect(w * 0.42, h * 0.42, w * 0.16, h * 0.4);
      return c.toDataURL("image/jpeg", 0.9).split(",")[1];
    },
    { w, h, hue },
  );
  return Buffer.from(b64, "base64");
}

export const file = (buffer: Buffer, name = "photo.jpg", mimeType = "image/jpeg") => ({ name, mimeType, buffer });

export async function openConfigurator(page: Page, query = "") {
  await page.goto(`/configurator${query}`);
  await expect(page.getByTestId("active-product")).toBeVisible();
}

/** House mode -> photo dialog -> Upload tab -> choose a file. Resolves once the door is composited. */
export async function uploadHousePhoto(page: Page, buffer: Buffer, name = "photo.jpg") {
  await page.getByRole("radio", { name: "House" }).click();
  const choose = page.getByRole("button", { name: "Choose a photo" });
  if (await choose.isVisible().catch(() => false)) await choose.click();
  else await page.getByRole("button", { name: "Replace photo" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: /Upload/ }).click();
  await dialog.locator('input[type="file"]').setInputFiles(file(buffer, name));
}

export const doorOverlay = (page: Page) => page.locator("canvas.pointer-events-none");
export const photoCanvas = (page: Page) => page.getByRole("img", { name: /^Your photo/ });

/** Number of non-transparent pixels in the door overlay (proves the door really is drawn on the photo). */
export const overlayPixels = (page: Page) =>
  doorOverlay(page).evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  });

export async function goToStep(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Configuration steps" }).getByRole("button", { name }).click();
}

/** Fail on critical/serious accessibility violations; return the rest for the report. */
export async function expectAccessible(page: Page, label: string, opts: { include?: string; exclude?: string[]; disable?: string[] } = {}) {
  // entrance animations must have finished, or contrast is measured on half-transparent text
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  let b = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]);
  if (opts.include) b = b.include(opts.include);
  for (const e of opts.exclude ?? []) b = b.exclude(e);
  if (opts.disable?.length) b = b.disableRules(opts.disable);
  const { violations } = await b.analyze();
  const serious = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  const summary = (list: typeof violations) => list.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")}`).join("\n");
  expect(serious, `${label}: accessibility violations\n${summary(serious)}`).toEqual([]);
  return violations.filter((v) => !serious.includes(v));
}
