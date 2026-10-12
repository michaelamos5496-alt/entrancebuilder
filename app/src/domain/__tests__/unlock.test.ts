import { describe, expect, it } from "vitest";
import { valuesOf } from "@/domain/engine/evaluate";
import { engineReducer, initialEngineState, type EngineAction, type EngineState } from "@/domain/engine/reducer";
import type { SelectionKey } from "@/domain/design/types";
import { C, assertValid, cfg } from "./helpers";

const from = (product: string, o: Parameters<typeof cfg>[1] = {}): EngineState => initialEngineState(C, cfg(product, o));
const run = (s: EngineState, ...a: EngineAction[]) => a.reduce((st, act) => engineReducer(C, st, act), s);
const set = (key: SelectionKey, value: string | boolean): EngineAction => ({ type: "set", key, value });

describe("nothing is a dead end: choosing a restricted option makes what it needs happen", () => {
  it("a sidelite style on a layout without sidelites adds one (keeping what you had)", () => {
    const s = run(from("haven", { layout: "transom" }), set("sideliteStyle", "full"));
    expect(s.config.layout).toBe("side-right-transom");
    expect(s.config.sideliteStyle).toBe("full");
    expect(s.changes.some((c) => c.kind === "adjust" && c.key === "layout")).toBe(true);
    assertValid(s.config);
  });

  it("transom glass adds a transom and keeps existing sidelites", () => {
    const s = run(from("haven", { layout: "side-left" }), set("transomGlass", "clear"));
    expect(s.config.layout).toBe("side-left-transom");
    expect(s.config.transomGlass).toBe("clear");
  });

  it("door glass on a solid door gives it a lite", () => {
    const s = run(from("haven", { lite: "none" }), set("glass", "frosted"));
    expect(s.config.lite).not.toBe("none");
    expect(s.config.glass).toBe("frosted");
  });

  it("a frame color turns off 'frame follows door'", () => {
    const base = from("haven", { matchFrame: true });
    const s = run(base, set("colorFrameExt", "#a9a9a7"));
    expect(s.config.matchFrame).toBe(false);
    expect(s.config.colorFrameExt).toBe("#a9a9a7");
  });

  it("a knocker, a mail slot or a pull handle on double doors switches to a single door", () => {
    for (const [key, value] of [["accessory", "knocker"], ["accessory", "mail"], ["handle", "pull"]] as const) {
      const s = run(from("haven", { layout: "double" }), set(key, value));
      expect(s.config.layout, `${key}=${value}`).toBe("single");
      expect(s.config[key]).toBe(value);
    }
  });

  it("a kick plate on a tall door with a 3/4 lite changes the lite", () => {
    const s = run(from("haven", { height: "tall", lite: "three" }), set("accessory", "kick"));
    expect(s.config.accessory).toBe("kick");
    expect(s.config.lite).not.toBe("three");
  });

  it("an option the door model does not offer switches the model", () => {
    const s = run(from("axis"), set("layout", "side-left"));
    expect(s.config.layout).toBe("side-left");
    expect(s.config.product).not.toBe("axis");
    expect(s.changes.some((c) => c.kind === "adjust" && c.key === "product")).toBe(true);
  });

  it("the whole thing is one undo step", () => {
    const s0 = from("haven", { layout: "single" });
    const s1 = run(s0, set("sideliteStyle", "full"));
    expect(s1.past).toHaveLength(1);
    expect(run(s1, { type: "undo" }).config).toEqual(s0.config);
  });
});

describe("exhaustive: every option from every door model either sticks cleanly or is refused untouched", () => {
  it("never produces an invalid configuration, never silently drops the chosen value", () => {
    let stuck = 0;
    const refused: string[] = [];
    for (const p of C.products) {
      const start = from(p.id);
      for (const g of C.groups) {
        for (const v of valuesOf(C, g.key)) {
          if (start.config[g.key] === v) continue; // already chosen: a no-op by design
          const next = engineReducer(C, start, set(g.key, v));
          if (next === start) { refused.push(`${p.id}: ${g.key}=${String(v)}`); continue; }
          assertValid(next.config, `${p.id} ${g.key}=${String(v)}`);
          if (!(g.key === "product")) expect(next.config[g.key], `${p.id} ${g.key}=${String(v)}`).toBe(v);
          stuck++;
        }
      }
    }
    expect(stuck).toBeGreaterThan(100);
    // every option has a route; if one ever has none, this names it
    expect(refused).toEqual([]);
  });
});
