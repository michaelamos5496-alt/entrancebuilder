import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getAsset } from "@/domain/catalogue";
import { PRESETS } from "@/domain/design/defaults";
import { createConfig } from "@/domain/engine/reconcile";
import { validateCatalogue } from "@/domain/engine/validate";
import { GALLERY } from "@/services/gallery";
import { C, assertValid } from "./helpers";

describe("sample catalogue integrity", () => {
  it("passes structural validation", () => {
    expect(validateCatalogue(C)).toEqual([]);
  });

  it("is small and complete: 5 products, each with a distinct support set", () => {
    expect(C.products.map((p) => p.id)).toEqual(["haven", "heritage", "meridian", "axis", "solstice"]);
    const sig = C.products.map((p) => JSON.stringify(p.supports));
    expect(new Set(sig).size).toBe(sig.length);
  });

  it("every product builds a valid default configuration with no silent changes", () => {
    for (const p of C.products) {
      const { config, changes } = createConfig(C, p.id);
      expect(config.product).toBe(p.id);
      expect(changes.filter((c) => c.kind === "reset"), p.id).toEqual([]);
      assertValid(config, p.id);
    }
  });

  it("every preset is valid exactly as written", () => {
    for (const pr of PRESETS) {
      const { config, changes } = createConfig(C, pr.product, pr.overrides);
      expect(changes.filter((c) => c.kind === "reset"), pr.slug).toEqual([]);
      for (const [k, v] of Object.entries(pr.overrides)) expect(config[k as keyof typeof config], `${pr.slug}.${k}`).toBe(v);
      assertValid(config, pr.slug);
    }
  });

  it("validation really detects bad data (it is not vacuous)", () => {
    const bad = structuredClone(C) as unknown as { products: { supports: Record<string, string[]>; assetId: string }[] };
    bad.products[0].supports.glass = ["does-not-exist"];
    bad.products[1].assetId = "missing.asset";
    const errors = validateCatalogue(bad as never);
    expect(errors.some((e) => e.includes("does-not-exist"))).toBe(true);
    expect(errors.some((e) => e.includes("missing.asset"))).toBe(true);
  });

  it("rejects a rule that restricts an earlier group using a later one", () => {
    const bad = { ...C, rules: [...C.rules, { id: "bad-order", kind: "groupLockedWhen" as const, groups: ["layout" as const], when: { field: "handle" as const, in: ["lever"] }, reason: "x" }] };
    expect(validateCatalogue(bad).some((e) => e.includes("bad-order"))).toBe(true);
  });
});

describe("asset manifest", () => {
  it("every product and gallery photo references an asset that exists", () => {
    for (const p of C.products) expect(getAsset(p.assetId).id).toBe(p.assetId);
    for (const g of GALLERY) expect(getAsset(g.assetId).kind).toBe("image");
  });

  it("every image asset exists on disk under /public and has a licence note", () => {
    for (const a of Object.values(C.assets)) {
      expect(a.license.length).toBeGreaterThan(5);
      if (a.kind === "image") {
        expect(a.src, a.id).toMatch(/^\//);
        expect(fs.existsSync(path.join(process.cwd(), "public", a.src!)), a.src).toBe(true);
      }
    }
  });

  it("refuses to resolve an id that is not in the manifest", () => {
    expect(() => getAsset("nope")).toThrow(/manifest/);
  });
});
