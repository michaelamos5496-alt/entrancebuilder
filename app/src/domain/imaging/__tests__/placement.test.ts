import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, defaultPlacement, newHistory, placementReducer, type PlacementAction } from "../placement";
import { isUsableQuad, quadAspect, toPx } from "../quad";

const W = 3000, H = 2000;
const fresh = () => newHistory(defaultPlacement(W, H, 0.45));
const run = (s = fresh(), ...a: PlacementAction[]) => a.reduce(placementReducer, s);
const move = (dx: number) => (s = fresh()) => ({ type: "apply", patch: { quad: s.present.quad.map((p) => ({ x: p.x + dx, y: p.y })) as never } }) as PlacementAction;

describe("placement history", () => {
  it("starts valid with the door's aspect ratio", () => {
    const p = fresh().present;
    expect(isUsableQuad(p.quad, W, H)).toBe(true);
    expect(quadAspect(toPx(p.quad, W, H))).toBeCloseTo(0.45, 6);
  });
  it("one gesture = one undo step", () => {
    let s = fresh();
    const base = s.present;
    for (let i = 1; i <= 20; i++) s = placementReducer(s, { type: "live", patch: { quad: base.quad.map((p) => ({ x: p.x + i * 0.001, y: p.y })) as never } });
    expect(s.past).toHaveLength(0);
    s = placementReducer(s, { type: "end" });
    expect(s.past).toHaveLength(1);
    s = placementReducer(s, { type: "undo" });
    expect(s.present).toEqual(base);
  });
  it("a gesture that ends where it started adds no history", () => {
    let s = fresh();
    s = placementReducer(s, { type: "live", patch: { flip: true } });
    s = placementReducer(s, { type: "live", patch: { flip: false } });
    s = placementReducer(s, { type: "end" });
    expect(s.past).toHaveLength(0);
  });
  it("undo during a gesture cancels the gesture", () => {
    let s = fresh();
    const base = s.present;
    s = placementReducer(s, { type: "live", patch: { flip: true } });
    s = placementReducer(s, { type: "undo" });
    expect(s.present).toEqual(base);
    expect(s.gestureBase).toBeNull();
  });
  it("apply / undo / redo / reset behave and return the same object for no-ops", () => {
    const s0 = fresh();
    expect(placementReducer(s0, { type: "undo" })).toBe(s0);
    expect(placementReducer(s0, { type: "redo" })).toBe(s0);
    expect(placementReducer(s0, { type: "apply", patch: { flip: false } })).toBe(s0);
    const s1 = run(s0, { type: "apply", patch: { flip: true } }, { type: "apply", patch: { shadow: false } });
    expect(s1.past).toHaveLength(2);
    const s2 = run(s1, { type: "undo" }, { type: "undo" });
    expect(s2.present).toEqual(s0.present);
    const s3 = run(s2, { type: "redo" });
    expect(s3.present.flip).toBe(true);
    const s4 = run(s3, { type: "reset", to: s0.present });
    expect(s4.present).toEqual(s0.present);
    expect(run(s4, { type: "undo" }).present.flip).toBe(true); // reset is undoable
    expect(placementReducer(s0, { type: "reset", to: s0.present })).toBe(s0);
  });
  it("a new edit clears redo", () => {
    const s = run(fresh(), { type: "apply", patch: { flip: true } }, { type: "undo" }, { type: "apply", patch: { shadow: false } });
    expect(s.future).toHaveLength(0);
  });
  it("scaling keeps the door usable and refuses to shrink it to nothing", () => {
    let s = fresh();
    for (let i = 0; i < 40; i++) s = placementReducer(s, { type: "scale", factor: 0.8, photoW: W, photoH: H });
    expect(isUsableQuad(s.present.quad, W, H)).toBe(true);
    let b = fresh();
    for (let i = 0; i < 40; i++) b = placementReducer(b, { type: "scale", factor: 1.3, photoW: W, photoH: H });
    expect(isUsableQuad(b.present.quad, W, H)).toBe(true);
  });
  it("nudging cannot push the door out of the photo", () => {
    let s = fresh();
    for (let i = 0; i < 200; i++) s = placementReducer(s, { type: "nudge", dx: 0.01, dy: -0.01 });
    expect(s.present.quad.every((p) => p.x <= 1 && p.y >= 0)).toBe(true);
  });
  it("turning perspective off snaps back to a rectangle; on keeps the quad", () => {
    let s = fresh();
    const warped = s.present.quad.map((p, i) => (i === 0 ? { x: p.x - 0.03, y: p.y + 0.02 } : p)) as never;
    s = run(s, { type: "setPerspective", on: true, photoW: W, photoH: H }, { type: "apply", patch: { quad: warped } });
    expect(s.present.perspective).toBe(true);
    s = placementReducer(s, { type: "setPerspective", on: false, photoW: W, photoH: H });
    expect(s.present.quad[0].y).toBeCloseTo(s.present.quad[1].y, 9);
    expect(s.present.quad[0].x).toBeCloseTo(s.present.quad[3].x, 9);
  });
  it("history is capped", () => {
    let s = fresh();
    for (let i = 0; i < HISTORY_LIMIT + 30; i++) s = placementReducer(s, { type: "apply", patch: { brightness: (i % 100) - 50 } });
    expect(s.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
  it("loading another photo's placement does not carry history across", () => {
    const a = run(fresh(), { type: "apply", patch: { flip: true } });
    const b = placementReducer(a, { type: "load", to: newHistory(defaultPlacement(1000, 1500, 0.45)) });
    expect(b.past).toHaveLength(0);
    expect(b.present.flip).toBe(false);
  });
  it("is unaffected by helper-built actions", () => {
    expect(move(0.01)().type).toBe("apply");
  });
});
