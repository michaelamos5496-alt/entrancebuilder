import { defaultQuad, isRectangle, isUsableQuad, scaleAboutBase, slideInside, toRectangle, translate } from "./quad";
import type { Placement, Quad } from "./types";

export const MIN_SCALE_STEP = 0.02;

export function defaultPlacement(photoW: number, photoH: number, doorAspect: number): Placement {
  return {
    quad: defaultQuad(photoW, photoH, doorAspect),
    flip: false,
    perspective: false,
    matchLighting: true,
    brightness: 0,
    shadow: true,
  };
}

export interface PlacementHistory {
  present: Placement;
  past: readonly Placement[];
  future: readonly Placement[];
  /** the value before the current drag started; committed to history when the drag ends */
  gestureBase: Placement | null;
}

export const HISTORY_LIMIT = 100;

export type PlacementAction =
  /** one undoable edit (button click, slider step, key press) */
  | { type: "apply"; patch: Partial<Placement> }
  /** a continuous gesture: many `live` updates, then one `end` = a single undo step */
  | { type: "live"; patch: Partial<Placement> }
  | { type: "end" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; to: Placement }
  | { type: "scale"; factor: number; photoW: number; photoH: number }
  | { type: "nudge"; dx: number; dy: number }
  | { type: "setPerspective"; on: boolean; photoW: number; photoH: number }
  /** replace everything (switching photos): history belongs to the photo being shown */
  | { type: "load"; to: PlacementHistory };

export function newHistory(p: Placement): PlacementHistory {
  return { present: p, past: [], future: [], gestureBase: null };
}

const same = (a: Placement, b: Placement) =>
  a.flip === b.flip && a.perspective === b.perspective && a.matchLighting === b.matchLighting && a.brightness === b.brightness && a.shadow === b.shadow &&
  a.quad.every((p, i) => p.x === b.quad[i].x && p.y === b.quad[i].y);

const push = (past: readonly Placement[], p: Placement) => [...past, p].slice(-HISTORY_LIMIT);

/** Pure placement state machine (undo / redo / reset / gestures). A rejected or no-op action returns the same object. */
export function placementReducer(s: PlacementHistory, a: PlacementAction): PlacementHistory {
  switch (a.type) {
    case "apply": {
      const next = { ...s.present, ...a.patch };
      if (same(next, s.present)) return s;
      return { present: next, past: push(s.past, s.gestureBase ?? s.present), future: [], gestureBase: null };
    }
    case "live": {
      const next = { ...s.present, ...a.patch };
      if (same(next, s.present)) return s;
      return { ...s, present: next, gestureBase: s.gestureBase ?? s.present };
    }
    case "end": {
      if (!s.gestureBase) return s;
      if (same(s.gestureBase, s.present)) return { ...s, gestureBase: null };
      return { present: s.present, past: push(s.past, s.gestureBase), future: [], gestureBase: null };
    }
    case "undo": {
      const base = s.gestureBase;
      if (base) return { present: base, past: s.past, future: s.future, gestureBase: null }; // cancel an in-progress gesture first
      if (!s.past.length) return s;
      return { present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future], gestureBase: null };
    }
    case "redo": {
      if (!s.future.length) return s;
      const [n, ...rest] = s.future;
      return { present: n, past: push(s.past, s.present), future: rest, gestureBase: null };
    }
    case "reset": {
      if (same(a.to, s.present)) return s;
      return { present: a.to, past: push(s.past, s.present), future: [], gestureBase: null };
    }
    case "scale": {
      const q = slideInside(scaleAboutBase(s.present.quad, a.factor, a.photoW, a.photoH));
      return isUsableQuad(q, a.photoW, a.photoH) ? placementReducer(s, { type: "apply", patch: { quad: q } }) : s;
    }
    case "nudge": {
      const q = slideInside(translate(s.present.quad, a.dx, a.dy), 0);
      return placementReducer(s, { type: "apply", patch: { quad: q } });
    }
    case "setPerspective": {
      if (s.present.perspective === a.on) return s;
      // leaving perspective mode snaps to a rectangle so rectangle-resizing is valid again
      const quad: Quad = a.on || isRectangle(s.present.quad) ? s.present.quad : toRectangle(s.present.quad, a.photoW, a.photoH);
      return placementReducer(s, { type: "apply", patch: { perspective: a.on, quad } });
    }
    case "load":
      return a.to;
  }
}
