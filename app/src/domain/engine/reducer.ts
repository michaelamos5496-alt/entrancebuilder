import type { SelectionKey, Selections } from "@/domain/design/types";
import { canSet, type Value } from "./evaluate";
import { createConfig, reconcile } from "./reconcile";
import { planSet } from "./unlock";
import type { Catalogue, Change } from "./types";

export const HISTORY_LIMIT = 100;

export interface EngineState {
  config: Selections;
  past: readonly Selections[];
  future: readonly Selections[];
  /** what the last action changed besides the user's own choice (empty after undo/redo/load) */
  changes: readonly Change[];
}

export type EngineAction =
  | { type: "set"; key: SelectionKey; value: Value }
  | { type: "reset" }
  | { type: "undo" }
  | { type: "redo" }
  /** replace the configuration (restore / open a saved design); history is cleared */
  | { type: "load"; config: Selections };

export function initialEngineState(c: Catalogue, config?: Selections): EngineState {
  return { config: config ?? createConfig(c).config, past: [], future: [], changes: [] };
}

const same = (a: Selections, b: Selections) => (Object.keys(a) as SelectionKey[]).every((k) => a[k] === b[k]);

function pushHistory(past: readonly Selections[], cur: Selections): Selections[] {
  const next = [...past, cur];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

/**
 * Pure state transitions. Guarantees:
 *  - a rejected or no-op action returns the SAME state object (no re-render, no history entry);
 *  - every config that enters history or becomes current has passed `reconcile`;
 *  - undo/redo restore exact earlier configurations.
 */
export function engineReducer(c: Catalogue, state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "set": {
      if (state.config[action.key] === action.value) return state;
      if (!canSet(c, state.config, action.key, action.value).available) {
        // Not selectable as things stand: make whatever it needs happen first (add a sidelite, switch model...), or refuse.
        const plan = planSet(c, state.config, action.key, action.value);
        if (!plan || same(plan.config, state.config)) return state;
        const adjusted = new Set(plan.adjustments.map((a) => a.key));
        return {
          config: plan.config,
          past: pushHistory(state.past, state.config),
          future: [],
          changes: [...plan.adjustments, ...plan.resets.filter((ch) => ch.key !== action.key && !adjusted.has(ch.key))],
        };
      }
      const { config, changes } = reconcile(c, { ...state.config, [action.key]: action.value });
      if (same(config, state.config)) return state;
      return {
        config,
        past: pushHistory(state.past, state.config),
        future: [],
        // the user's own change is not reported back to them
        changes: changes.filter((ch) => ch.kind === "reset" && ch.key !== action.key),
      };
    }
    case "reset": {
      const { config } = createConfig(c);
      if (same(config, state.config)) return state;
      return { config, past: pushHistory(state.past, state.config), future: [], changes: [] };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return { config: prev, past: state.past.slice(0, -1), future: [state.config, ...state.future], changes: [] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      return { config: next, past: pushHistory(state.past, state.config), future: rest, changes: [] };
    }
    case "load": {
      const { config } = reconcile(c, action.config);
      return { config, past: [], future: [], changes: [] };
    }
  }
}
