import { describe, expect, it } from "vitest";
import { canSet, evaluate } from "@/domain/engine/evaluate";
import { reconcile } from "@/domain/engine/reconcile";
import { withFixHints } from "@/domain/engine/unlockRules";
import { COLOR, FINISH } from "@/domain/catalogue/data";
import { C, assertValid, cfg } from "./helpers";

describe("product support", () => {
  it("options a product does not support are unavailable, with a reason naming the product", () => {
    const ev = evaluate(C, cfg("axis"));
    expect(ev.options.layout!["side-left"]).toMatchObject({ available: false, reason: "Not available on Axis." });
    expect(withFixHints(C, cfg("axis"), ev).options.layout!["side-left"].fix).toMatch(/Switches to \w+/); // still selectable: choosing it switches door
    expect(ev.options.layout!["single"].available).toBe(true);
    expect(ev.options.height!["std"].available).toBe(false);
    expect(ev.options.colorDoorExt![COLOR.red].available).toBe(false);
  });

  it("canSet refuses unsupported options and accepts supported ones", () => {
    const c = cfg("heritage");
    expect(canSet(C, c, "layout", "double").available).toBe(false);
    expect(canSet(C, c, "layout", "side-left").available).toBe(true);
    expect(canSet(C, c, "layout", "not-a-layout").available).toBe(false);
  });

  it("every product is offered for selection regardless of the current configuration", () => {
    const ev = evaluate(C, cfg("axis", { layout: "double" }));
    for (const p of C.products) expect(ev.options.product![p.id].available).toBe(true);
  });
});

describe("rules", () => {
  it("locks sidelite groups until the layout has a sidelite, and keeps their stored value", () => {
    let c = cfg("haven", { layout: "side-left", sideliteGlass: "mosaic" });
    expect(evaluate(C, c).groups.sideliteGlass.available).toBe(true);
    c = reconcile(C, { ...c, layout: "single" }).config;
    expect(evaluate(C, c).groups.sideliteGlass).toMatchObject({ available: false });
    expect(c.sideliteGlass).toBe("mosaic"); // preserved
    c = reconcile(C, { ...c, layout: "side-right" }).config;
    expect(c.sideliteGlass).toBe("mosaic"); // restored when unlocked
  });

  it("locks transom glass without a transom and door glass without a lite", () => {
    const c = cfg("haven");
    const ev = evaluate(C, c);
    expect(ev.groups.transomGlass.available).toBe(false);
    expect(ev.groups.glass.available).toBe(false);
    expect(ev.groups.glassFrame.available).toBe(false);
    expect(evaluate(C, cfg("haven", { lite: "half" })).groups.glass.available).toBe(true);
  });

  it("blocks knocker and mail slot on double doors; selecting a double layout resets an existing knocker", () => {
    const c = cfg("haven", { accessory: "knocker" });
    expect(evaluate(C, { ...c, layout: "double" }).options.accessory!.knocker.available).toBe(false);
    const r = reconcile(C, { ...c, layout: "double" });
    expect(r.config.accessory).toBe("none");
    expect(r.changes.filter((x) => x.kind === "reset").map((x) => x.key)).toEqual(["accessory"]);
  });

  it("blocks pull handles on double doors", () => {
    const c = cfg("haven", { handle: "pull" });
    const r = reconcile(C, { ...c, layout: "double" });
    expect(r.config.handle).toBe("lever");
  });

  it("kick plate vs tall + 3/4 lite: the EARLIER choice wins, the later adapts", () => {
    const base = cfg("haven", { accessory: "kick", height: "tall" });
    // choosing 3/4 lite last makes the kick plate invalid -> kick plate (later group) yields
    const r = reconcile(C, { ...base, lite: "three" });
    expect(r.config.lite).toBe("three");
    expect(r.config.accessory).toBe("none");
    // the reverse order cannot be selected directly
    const withLite = cfg("haven", { lite: "three", height: "tall" });
    expect(canSet(C, withLite, "accessory", "kick").available).toBe(false);
    expect(canSet(C, withLite, "accessory", "kick").reason).toMatch(/3\/4 lite/);
  });

  it("frame colors follow the door while 'frame follows door' is on, and are free when off", () => {
    let c = cfg("haven", { colorDoorExt: COLOR.green });
    expect(c.colorFrameExt).toBe(COLOR.green);
    expect(evaluate(C, c).groups.colorFrameExt.available).toBe(false);
    c = reconcile(C, { ...c, matchFrame: false }).config;
    expect(evaluate(C, c).groups.colorFrameExt.available).toBe(true);
    c = reconcile(C, { ...c, colorFrameExt: COLOR.red }).config;
    expect(c.colorFrameExt).toBe(COLOR.red);
    c = reconcile(C, { ...c, matchFrame: true }).config;
    expect(c.colorFrameExt).toBe(c.colorDoorExt);
  });
});

describe("switching products", () => {
  it("resets ONLY the selections the new product cannot support", () => {
    const before = cfg("haven", {
      layout: "side-left", height: "tall", hand: "right", lite: "three", glass: "frame",
      colorDoorExt: COLOR.sage, handle: "pull", handleFinish: FINISH.chrome, accessory: "none",
    });
    const { config: after, changes } = reconcile(C, { ...before, product: "meridian" });
    // Meridian has no 'frame' glass (door lite AND the sidelite, which this layout has). Everything else it supports.
    expect(after.product).toBe("meridian");
    const changed = changes.filter((c) => c.kind === "reset").map((c) => c.key);
    expect(changed).toEqual(["glass", "sideliteGlass"]);
    expect(after.layout).toBe("side-left");
    expect(after.height).toBe("tall");
    expect(after.hand).toBe("right");
    expect(after.lite).toBe("three");
    expect(after.colorDoorExt).toBe(COLOR.sage);
    expect(after.handle).toBe("pull");
    expect(after.handleFinish).toBe(FINISH.chrome);
    expect(after.glass).toBe("linear"); // Meridian's default
  });

  it("moves to the new product's nearest valid values when many things are unsupported (haven -> axis)", () => {
    const before = cfg("haven", { layout: "side-both-transom", height: "std", lite: "half", colorDoorExt: COLOR.red, handle: "knob" });
    const { config, changes } = reconcile(C, { ...before, product: "axis" });
    expect(config.layout).toBe("single");
    expect(config.height).toBe("tall");
    expect(config.colorDoorExt).toBe(COLOR.black);
    expect(config.handle).toBe("bar");
    expect(config.hand).toBe(before.hand); // untouched
    expect(changes.every((c) => c.kind !== "reset" || c.reason.length > 10)).toBe(true);
    assertValid(config);
  });

  it("switching to a product and back does not corrupt the configuration", () => {
    const start = cfg("haven", { layout: "double", lite: "three", colorDoorExt: COLOR.charcoal });
    const there = reconcile(C, { ...start, product: "solstice" }).config;
    const back = reconcile(C, { ...there, product: "haven" }).config;
    assertValid(there);
    assertValid(back);
    expect(back.product).toBe("haven");
  });

  it("a locked group keeps an unsupported stored value until it unlocks, then repairs it", () => {
    // haven with no lite stores glass 'ripple'; Axis does not support 'ripple'
    const start = cfg("haven", { lite: "none", glass: "ripple" });
    const onAxis = reconcile(C, { ...start, product: "axis" }).config;
    // axis defaults lite to... lite 'none' is supported by axis, so it stays none and glass stays locked
    expect(onAxis.lite).toBe("none");
    expect(onAxis.glass).toBe("ripple");
    const unlocked = reconcile(C, { ...onAxis, lite: "three" });
    expect(unlocked.config.glass).toBe("linear");
    expect(unlocked.changes.some((c) => c.key === "glass" && c.kind === "reset")).toBe(true);
  });

  it("reconcile is idempotent for every product pair", () => {
    for (const a of C.products) for (const b of C.products) {
      const once = reconcile(C, { ...cfg(a.id), product: b.id }).config;
      expect(reconcile(C, once).config).toEqual(once);
      assertValid(once, `${a.id}->${b.id}`);
    }
  });

  it("an unknown product falls back to the default product", () => {
    const r = reconcile(C, { ...cfg("haven"), product: "ghost" });
    expect(r.config.product).toBe(C.defaultProductId);
    expect(r.changes[0].key).toBe("product");
  });
});
