import zlib from "node:zlib";
import { expect, makeJpeg, openConfigurator, overlayPixels, test, uploadHousePhoto } from "./helpers";
import type { Page, Response } from "@playwright/test";

/** Budgets are deliberately a little above today's measurements so regressions fail but noise does not. */
const BUDGET_JS_GZ_KB = 215; // per page, local development mode (production build)

test.describe("payload", () => {
  for (const path of ["/", "/configurator", "/designs"]) {
    test(`JavaScript for ${path} stays within budget and excludes the Supabase library in local mode`, async ({ page }) => {
      const sizes = new Map<string, number>();
      let supabaseLoaded = false;
      const onResp = async (r: Response) => {
        if (r.request().resourceType() !== "script") return;
        try {
          const body = await r.body();
          sizes.set(r.url(), zlib.gzipSync(body).length);
          if (/GoTrueClient|supabase-js/.test(body.toString("utf8"))) supabaseLoaded = true;
        } catch { /* a cancelled request */ }
      };
      page.on("response", onResp);
      await page.goto(path, { waitUntil: "networkidle" });
      page.off("response", onResp);
      const kb = [...sizes.values()].reduce((a, b) => a + b, 0) / 1024;
      console.log(`payload ${path}: ${kb.toFixed(0)} KB gzip, ${sizes.size} scripts`);
      expect(kb).toBeLessThan(BUDGET_JS_GZ_KB);
      expect(supabaseLoaded, "the auth/database client must not be downloaded when cloud mode is off").toBe(false);
    });
  }

  test("images stay within budget: only sample-gallery JPEGs, each under 500 KB, 1.2 MB in total", async ({ page }) => {
    const images = new Map<string, number>();
    page.on("response", async (r) => {
      if (r.request().resourceType() !== "image") return;
      images.set(new URL(r.url()).pathname, (await r.body().catch(() => Buffer.alloc(0))).length);
    });
    await page.goto("/", { waitUntil: "networkidle" });
    for (const [path, bytes] of images) {
      expect(path, "only the CC0 sample gallery may be loaded as a raster image").toMatch(/^\/gallery\/[\w-]+\.jpg$/);
      expect(bytes / 1024, `${path} is too heavy`).toBeLessThan(500);
    }
    const total = [...images.values()].reduce((a, b) => a + b, 0) / 1024;
    expect(total, "home-page image weight").toBeLessThan(1200); // hero + three small step thumbnails
  });
});

async function liveCount(page: Page, ctor: string): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const proto = await cdp.send("Runtime.evaluate", { expression: `${ctor}.prototype` });
  const r = await cdp.send("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId! });
  const n = await cdp.send("Runtime.callFunctionOn", { objectId: r.objects.objectId!, functionDeclaration: "function(){return this.length}", returnByValue: true });
  await cdp.detach();
  return n.result.value as number;
}

test.describe("memory", () => {
  test("replacing the photo many times does not accumulate canvases or images", async ({ page }) => {
    await openConfigurator(page);
    const photos = [await makeJpeg(page, 3000, 2000, 10), await makeJpeg(page, 3000, 2000, 120), await makeJpeg(page, 2400, 3000, 200)];
    await uploadHousePhoto(page, photos[0], "a.jpg");
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    const before = { canvas: await liveCount(page, "HTMLCanvasElement"), image: await liveCount(page, "HTMLImageElement") };
    for (let i = 1; i <= 12; i++) {
      await page.getByRole("button", { name: "Replace photo" }).click();
      await page.getByRole("dialog").getByRole("tab", { name: /Upload/ }).click();
      await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({ name: `p${i}.jpg`, mimeType: "image/jpeg", buffer: photos[i % 3] });
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.waitForTimeout(150);
    }
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    const after = { canvas: await liveCount(page, "HTMLCanvasElement"), image: await liveCount(page, "HTMLImageElement") };
    console.log(`live canvases ${before.canvas} -> ${after.canvas}; live images ${before.image} -> ${after.image} (after 12 photo swaps + GC)`);
    expect(after.canvas, "canvas objects survive garbage collection: a leak").toBeLessThanOrEqual(before.canvas + 4);
    expect(after.image).toBeLessThanOrEqual(before.image + 4);
  });

  test("switching between pages and back does not stack up canvases", async ({ page }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page, 2000, 1500));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    const start = await liveCount(page, "HTMLCanvasElement");
    for (let i = 0; i < 6; i++) {
      await page.getByRole("link", { name: "My designs" }).first().click();
      await expect(page.getByRole("heading", { name: "My designs" })).toBeVisible();
      await page.getByRole("link", { name: "Create a door" }).first().click();
      await expect(page.getByTestId("active-product")).toBeVisible();
    }
    expect(await liveCount(page, "HTMLCanvasElement")).toBeLessThanOrEqual(start + 4);
  });
});

test.describe("responsiveness", () => {
  test("dragging a doorway corner stays smooth (no more than two long tasks)", async ({ page }) => {
    await openConfigurator(page);
    await uploadHousePhoto(page, await makeJpeg(page, 3000, 2000));
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(1000);
    await page.evaluate(() => {
      const w = window as unknown as { __long: number[] };
      w.__long = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ["longtask"] });
    });
    const b = (await page.getByRole("button", { name: /Top-left corner/ }).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 80; i++) await page.mouse.move(b.x + b.width / 2 - i * 2, b.y + b.height / 2 - i * 1.5);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const long = await page.evaluate(() => (window as unknown as { __long: number[] }).__long);
    console.log(`drag: ${long.length} long tasks ${long.map(Math.round).join(",")} ms`);
    expect(long.filter((d) => d > 50).length).toBeLessThanOrEqual(2);
    expect(Math.max(0, ...long)).toBeLessThan(400);
  });

  test("a 7000×5000 photo is ready quickly", async ({ page }) => {
    await openConfigurator(page);
    const buf = await makeJpeg(page, 7000, 5000);
    const t0 = Date.now();
    await uploadHousePhoto(page, buf);
    await expect.poll(() => overlayPixels(page), { timeout: 15_000 }).toBeGreaterThan(1000);
    const ms = Date.now() - t0;
    console.log(`7000x5000 photo ready in ${ms} ms`);
    expect(ms).toBeLessThan(5000);
  });
});
