import { describe, expect, it } from "vitest";
import { PRESETS } from "@/domain/design/defaults";
import { createConfig } from "@/domain/engine/reconcile";
import { decodeConfig, deserialize, encodeConfig, serialize, SCHEMA_VERSION } from "@/domain/engine/serialize";
import { engineReducer, initialEngineState } from "@/domain/engine/reducer";
import { C, assertValid, cfg, randomAction, rng } from "./helpers";

describe("serialisation", () => {
  it("round-trips every product default and every preset exactly", () => {
    const all = [...C.products.map((p) => createConfig(C, p.id).config), ...PRESETS.map((p) => createConfig(C, p.product, p.overrides).config)];
    for (const c of all) {
      const json = JSON.parse(JSON.stringify(serialize(C, c)));
      const r = deserialize(C, json);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.config).toEqual(c);
        expect(r.repairs).toEqual([]);
      }
      const t = decodeConfig(C, encodeConfig(C, c));
      expect(t.ok && t.config).toEqual(c);
    }
  });

  it("round-trips configurations reached by random editing (including locked, preserved values)", () => {
    const rand = rng(31337);
    let s = initialEngineState(C);
    for (let i = 0; i < 300; i++) {
      s = engineReducer(C, s, randomAction(rand));
      const r = decodeConfig(C, encodeConfig(C, s.config));
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.config).toEqual(s.config);
        expect(r.repairs).toEqual([]);
      }
    }
  });

  it("includes schema and catalogue versions", () => {
    const out = serialize(C, cfg());
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(out.catalogueVersion).toBe(C.version);
  });

  it("is plain JSON (survives structuredClone/JSON)", () => {
    const o = serialize(C, cfg("solstice"));
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });
});

describe("restoring untrusted input", () => {
  it("rejects non-objects and garbage tokens without throwing", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) expect(deserialize(C, bad).ok).toBe(false);
    expect(decodeConfig(C, "!!!not-base64!!!").ok).toBe(false);
    expect(decodeConfig(C, "garbage").ok).toBe(false);
    expect(decodeConfig(C, "").ok).toBe(false);
  });

  it("rejects designs from a newer schema", () => {
    const r = deserialize(C, { ...serialize(C, cfg()), schemaVersion: 99 });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/newer/) });
  });

  it("repairs invalid individual values and reports them", () => {
    const r = deserialize(C, { ...serialize(C, cfg("haven")), glass: "laser", handleFinish: "#zzzzzz", hand: 7, evil: "<script>" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    assertValid(r.config);
    expect(r.repairs.map((x) => x.key).sort()).toEqual(["glass", "hand", "handleFinish"]);
    expect("evil" in r.config).toBe(false);
  });

  it("repairs values valid in the catalogue but unsupported by the product", () => {
    const r = deserialize(C, { ...serialize(C, cfg("meridian")), product: "axis", layout: "side-left", colorDoorExt: "#9b3d30" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.layout).toBe("single");
    expect(r.config.colorDoorExt).not.toBe("#9b3d30");
    expect(r.repairs.length).toBeGreaterThan(0);
    assertValid(r.config);
  });

  it("falls back to the default product for an unknown product id", () => {
    const r = deserialize(C, { ...serialize(C, cfg()), product: "ghost" });
    expect(r.ok && r.config.product).toBe(C.defaultProductId);
    expect(r.ok && r.repairs.some((x) => x.key === "product")).toBe(true);
  });

  it("fills missing fields from the product's defaults", () => {
    const r = deserialize(C, { schemaVersion: 2, product: "axis" });
    expect(r.ok && r.config).toEqual(createConfig(C, "axis").config);
  });
});

describe("migration from schema 1 (Phase 2 saved designs and links)", () => {
  const v1 = {
    layout: "side-left", height: "std", hand: "right", style: "contemporary", lite: "half", accessory: "none", sideliteStyle: "match",
    glass: "frosted", glassFrame: "slim", sideliteGlass: "frosted", transomGlass: "frosted", matchFrame: true,
    colorDoorExt: "#3a3d42", colorFrameExt: "#3a3d42", colorDoorInt: "#f4f3ef", colorFrameInt: "#f4f3ef", colorSill: "#a9a9a7",
    handle: "bar", handleFinish: "#b4b7ba",
  };

  it("maps style to a product and keeps the user's other choices", () => {
    const r = deserialize(C, v1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe(1);
    expect(r.config.product).toBe("meridian");
    expect(r.config.layout).toBe("side-left");
    expect(r.config.hand).toBe("right");
    expect(r.config.glass).toBe("frosted");
    expect(r.config.colorDoorExt).toBe("#3a3d42");
    assertValid(r.config);
  });

  it("maps classic to Haven", () => {
    const r = deserialize(C, { ...v1, style: "classic" });
    expect(r.ok && r.config.product).toBe("haven");
  });

  it("is repaired, not rejected, when a v1 value is no longer supported", () => {
    const r = deserialize(C, { ...v1, handle: "knob", layout: "side-both-transom" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.product).toBe("meridian");
      expect(r.config.handle).toBe("bar"); // Meridian has no knob
      assertValid(r.config);
    }
  });
});
