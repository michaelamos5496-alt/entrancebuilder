import { describe, expect, it } from "vitest";
import { COLOR } from "@/domain/catalogue/data";
import { createConfig } from "@/domain/engine/reconcile";
import { HISTORY_LIMIT, engineReducer, initialEngineState, type EngineAction, type EngineState } from "@/domain/engine/reducer";
import { C, assertValid, cfg, randomAction, rng } from "./helpers";

const run = (s: EngineState, ...a: EngineAction[]) => a.reduce((st, act) => engineReducer(C, st, act), s);
const start = () => initialEngineState(C);

describe("state transitions", () => {
  it("starts on the default product with a valid configuration and empty history", () => {
    const s = start();
    expect(s.config.product).toBe(C.defaultProductId);
    expect(s.past).toEqual([]);
    expect(s.future).toEqual([]);
    assertValid(s.config);
  });

  it("selecting a door updates the active product immediately", () => {
    const s = run(start(), { type: "set", key: "product", value: "meridian" });
    expect(s.config.product).toBe("meridian");
    expect(s.past).toHaveLength(1);
    assertValid(s.config);
  });

  it("changing an option updates the configuration immediately and records history", () => {
    const s = run(start(), { type: "set", key: "hand", value: "right" });
    expect(s.config.hand).toBe("right");
    expect(s.past[0].hand).toBe("left");
  });

  it("product switch reports only the values it reset (and not the user's own change)", () => {
    const s0 = run(start(), { type: "set", key: "colorDoorExt", value: COLOR.red });
    const s1 = engineReducer(C, s0, { type: "set", key: "product", value: "axis" });
    const keys = s1.changes.map((c) => c.key);
    expect(keys).toContain("colorDoorExt");
    expect(keys).not.toContain("product");
    expect(s1.changes.every((c) => c.kind === "reset")).toBe(true);
  });

  it("returns the SAME state object for a no-op (same value)", () => {
    const s = start();
    expect(engineReducer(C, s, { type: "set", key: "hand", value: s.config.hand })).toBe(s);
  });

  it("returns the SAME state object for a change that can never work (unknown value, wrong type)", () => {
    const s = run(start(), { type: "set", key: "product", value: "axis" });
    expect(engineReducer(C, s, { type: "set", key: "handle", value: "nonsense" })).toBe(s); // unknown
    expect(engineReducer(C, s, { type: "set", key: "matchFrame", value: "yes" as never })).toBe(s); // wrong type
    expect(engineReducer(C, s, { type: "set", key: "layout", value: "not-a-layout" })).toBe(s);
  });

  it("does not mutate previous states", () => {
    const s0 = start();
    const snapshot = JSON.stringify(s0);
    run(s0, { type: "set", key: "product", value: "solstice" }, { type: "set", key: "layout", value: "side-both" }, { type: "undo" });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe("undo / redo / reset / load", () => {
  it("undo and redo restore exact configurations", () => {
    const s0 = start();
    const s1 = run(s0, { type: "set", key: "product", value: "heritage" }, { type: "set", key: "hand", value: "right" });
    const u = run(s1, { type: "undo" });
    expect(u.config.hand).toBe("left");
    expect(u.config.product).toBe("heritage");
    const u2 = run(u, { type: "undo" });
    expect(u2.config).toEqual(s0.config);
    const r = run(u2, { type: "redo", }, { type: "redo" });
    expect(r.config).toEqual(s1.config);
  });

  it("a new change after undo clears the redo stack", () => {
    const s = run(start(), { type: "set", key: "hand", value: "right" }, { type: "undo" }, { type: "set", key: "height", value: "tall" });
    expect(s.future).toEqual([]);
  });

  it("undo/redo with nothing to do is a no-op", () => {
    const s = start();
    expect(engineReducer(C, s, { type: "undo" })).toBe(s);
    expect(engineReducer(C, s, { type: "redo" })).toBe(s);
  });

  it("reset returns to the default product configuration and can be undone", () => {
    const changed = run(start(), { type: "set", key: "product", value: "axis" }, { type: "set", key: "colorDoorExt", value: COLOR.white });
    const r = run(changed, { type: "reset" });
    expect(r.config).toEqual(createConfig(C).config);
    expect(run(r, { type: "undo" }).config).toEqual(changed.config);
  });

  it("reset on an already-default configuration is a no-op", () => {
    const s = start();
    expect(engineReducer(C, s, { type: "reset" })).toBe(s);
  });

  it("history is capped", () => {
    let s = start();
    for (let i = 0; i < HISTORY_LIMIT + 40; i++) s = engineReducer(C, s, { type: "set", key: "hand", value: i % 2 ? "left" : "right" });
    expect(s.past.length).toBe(HISTORY_LIMIT);
  });

  it("load replaces the configuration, repairs it, and clears history", () => {
    const dirty = { ...cfg("haven"), product: "axis", layout: "side-left" as const };
    const s = engineReducer(C, run(start(), { type: "set", key: "hand", value: "right" }), { type: "load", config: dirty });
    expect(s.config.product).toBe("axis");
    expect(s.config.layout).toBe("single");
    expect(s.past).toEqual([]);
    assertValid(s.config);
  });
});

describe("repeated changes never corrupt state", () => {
  it.each([1, 2, 3, 7, 42, 2024])("random action sequence (seed %i): every state satisfies the invariants", (seed) => {
    const rand = rng(seed);
    let s = start();
    for (let i = 0; i < 1500; i++) {
      const before = s;
      s = engineReducer(C, s, randomAction(rand));
      if (s === before) continue;
      assertValid(s.config, `seed ${seed} step ${i}`);
      expect(s.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
      // history entries are valid too (only the newest needs checking: older ones were checked when current)
      if (s.past.length) {
        assertValid(s.past[s.past.length - 1], `seed ${seed} history ${i}`);
        expect(s.past[s.past.length - 1]).not.toBe(s.config);
      }
      if (s.future.length) assertValid(s.future[0], `seed ${seed} future ${i}`);
    }
  }, 30_000);

  it("undoing everything returns to the first state; redoing everything returns to the last", () => {
    const rand = rng(99);
    let s = start();
    const first = s.config;
    for (let i = 0; i < 60; i++) s = engineReducer(C, s, { ...randomAction(rand), ...{} } as EngineAction);
    // only 'set' actions mattered for history; drop undo/redo noise by replaying from scratch
    let t = start();
    for (let i = 0; i < 80; i++) {
      const a = randomAction(rand);
      if (a.type === "undo" || a.type === "redo" || a.type === "reset") continue;
      t = engineReducer(C, t, a);
    }
    const last = t.config;
    const n = t.past.length;
    for (let i = 0; i < n; i++) t = engineReducer(C, t, { type: "undo" });
    expect(t.config).toEqual(first);
    for (let i = 0; i < n; i++) t = engineReducer(C, t, { type: "redo" });
    expect(t.config).toEqual(last);
  });

  it("applying the same sequence twice gives identical results (deterministic)", () => {
    const play = () => {
      const rand = rng(5);
      let s = start();
      for (let i = 0; i < 400; i++) s = engineReducer(C, s, randomAction(rand));
      return s.config;
    };
    expect(play()).toEqual(play());
  });
});
