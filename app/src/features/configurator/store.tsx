"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { CATALOGUE } from "@/domain/catalogue";
import { STEPS } from "@/domain/catalogue/data";
import { presetConfig } from "@/domain/design/defaults";
import type { SelectionKey, Selections, ViewSide } from "@/domain/design/types";
import { defaultPlacement, newHistory, placementReducer, type PlacementAction, type PlacementHistory } from "@/domain/imaging/placement";
import type { Placement } from "@/domain/imaging/types";
import { cutoutAspect } from "@/features/preview/SchematicDoor";
import type { PhotoAsset } from "@/services/imaging/decodePhoto";
import { evaluate, type Value } from "@/domain/engine/evaluate";
import { engineReducer, initialEngineState, type EngineAction, type EngineState } from "@/domain/engine/reducer";
import { decodeConfig, deserialize, serialize } from "@/domain/engine/serialize";
import type { Change, Evaluation } from "@/domain/engine/types";
import { useToast } from "@/components/ui/Toast";

export type Mode = "door" | "house";

/** Everything that is NOT the door configuration: where the user is and what they are looking at. */
interface Scene {
  ready: boolean;
  /** id/name of the saved design being edited, when opened from "My designs" */
  savedId: string | null;
  savedName: string | null;
  view: ViewSide;
  mode: Mode;
  /** the photo shown behind the door, per side (kept in memory only; never uploaded) */
  photos: Record<ViewSide, PhotoAsset | null>;
  /** undoable placement of the door on that photo */
  placements: Record<ViewSide, PlacementHistory | null>;
  step: number;
  /** SVG markup of the door as currently shown (set by the off-screen door renderer; used to rasterise for photos and previews) */
  doorMarkup: string;
}

type SceneAction =
  | { type: "ready"; savedId?: string | null; savedName?: string | null }
  | { type: "view"; view: ViewSide }
  | { type: "mode"; mode: Mode }
  | { type: "photo"; view: ViewSide; photo: PhotoAsset | null; history: PlacementHistory | null }
  | { type: "placement"; view: ViewSide; action: PlacementAction }
  | { type: "step"; step: number }
  | { type: "saved"; id: string; name: string }
  | { type: "markup"; markup: string }
  | { type: "project"; savedId: string; savedName: string; photos: Record<ViewSide, PhotoAsset | null>; placements: Record<ViewSide, PlacementHistory | null> };

const initialScene: Scene = {
  ready: false,
  savedId: null,
  savedName: null,
  view: "exterior",
  mode: "door",
  photos: { exterior: null, interior: null },
  placements: { exterior: null, interior: null },
  step: 0,
  doorMarkup: "",
};

function sceneReducer(s: Scene, a: SceneAction): Scene {
  switch (a.type) {
    case "ready":
      return { ...s, ready: true, savedId: a.savedId ?? null, savedName: a.savedName ?? null };
    case "view":
      return { ...s, view: a.view };
    case "mode":
      return { ...s, mode: a.mode };
    case "photo":
      return {
        ...s,
        photos: { ...s.photos, [a.view]: a.photo },
        placements: { ...s.placements, [a.view]: a.history },
      };
    case "placement": {
      const cur = s.placements[a.view];
      if (!cur) return s;
      const next = placementReducer(cur, a.action);
      return next === cur ? s : { ...s, placements: { ...s.placements, [a.view]: next } };
    }
    case "step":
      return { ...s, step: Math.max(0, Math.min(STEPS.length - 1, a.step)) };
    case "saved":
      return { ...s, savedId: a.id, savedName: a.name };
    case "markup":
      return s.doorMarkup === a.markup ? s : { ...s, doorMarkup: a.markup };
    case "project":
      return { ...s, ready: true, savedId: a.savedId, savedName: a.savedName, photos: a.photos, placements: a.placements };
  }
}

export interface ConfiguratorApi extends Scene {
  /** the one active configuration every component reads */
  selections: Selections;
  /** which groups are locked and which options are available for that configuration */
  evaluation: Evaluation;
  select: <K extends SelectionKey>(key: K, value: Selections[K]) => void;
  /** replace the whole configuration (open a saved design, restore) */
  loadDesign: (s: Selections, saved?: { id: string; name: string }) => void;
  /** open a saved project: configuration, name and its photos (with placements), replacing whatever is showing */
  loadProject: (p: { id: string; name: string; config: Selections; photos: Partial<Record<ViewSide, { asset: PhotoAsset; placement: Placement }>> }) => void;
  setDoorMarkup: (markup: string) => void;
  resetDesign: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  setView: (v: ViewSide) => void;
  setMode: (m: Mode) => void;
  /** show a photo (restoring its earlier placement if it was used before), or remove it with null */
  setPhoto: (view: ViewSide, photo: PhotoAsset | null) => void;
  /** change the door's placement on the current photo (undoable) */
  placeDoor: (view: ViewSide, action: PlacementAction) => void;
  goStep: (n: number) => void;
  markSaved: (id: string, name: string) => void;
}

const Ctx = createContext<ConfiguratorApi | null>(null);

export function useConfigurator(): ConfiguratorApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConfigurator must be used inside <ConfiguratorProvider>");
  return v;
}

const DRAFT_KEY = "threshold.draft.v1";

export interface StartSource {
  /** encoded design from a share link */
  d?: string | null;
  preset?: string | null;
}

const engine = (s: EngineState, a: EngineAction) => engineReducer(CATALOGUE, s, a);

/** Human sentence for a reset the user did not ask for. */
export function describeChange(ch: Change): string {
  return ch.reason;
}

export function ConfiguratorProvider({ source, children }: { source: StartSource; children: ReactNode }) {
  const [eng, dispatchEngine] = useReducer(engine, undefined, () => initialEngineState(CATALOGUE));
  const [scene, dispatchScene] = useReducer(sceneReducer, initialScene);
  const toast = useToast();

  // Resolve the starting design on the client: share link > preset > last draft > defaults.
  // A link only SEEDS the design. Once applied it is removed from the address bar, so refreshing keeps the user's own
  // edits (the saved draft) instead of re-applying the link and throwing them away.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${source.d ?? ""}|${source.preset ?? ""}`;
    if (seededFor.current !== null && (key === "|" || key === seededFor.current)) return; // already initialised; ignore the cleanup of the URL
    seededFor.current = key;
    let config: Selections | null = null;
    let notice: string | null = null;
    if (source.d) {
      const r = decodeConfig(CATALOGUE, source.d);
      if (r.ok) {
        config = r.config;
        if (r.repairs.length) notice = "Some options in that link aren't available anymore, so we adjusted them.";
      } else {
        notice = "That share link couldn't be read, so we started a new design.";
      }
    }
    if (!config && source.preset) config = presetConfig(source.preset);
    if (!config && !source.d) {
      try {
        const raw = window.localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const r = deserialize(CATALOGUE, JSON.parse(raw));
          if (r.ok) config = r.config;
        }
      } catch { /* unreadable draft: ignore */ }
    }
    dispatchEngine({ type: "load", config: config ?? initialEngineState(CATALOGUE).config });
    dispatchScene({ type: "ready" });
    if (notice) toast(notice, source.d && config ? "info" : "error");
    if (source.d || source.preset) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [source.d, source.preset, toast]);

  // Keep the working design so a refresh doesn't lose it.
  useEffect(() => {
    if (!scene.ready) return;
    try { window.localStorage.setItem(DRAFT_KEY, JSON.stringify(serialize(CATALOGUE, eng.config))); } catch { /* storage full/blocked */ }
  }, [scene.ready, eng.config]);

  // Tell the user when a change reset something they had chosen.
  // One action = one notice listing EVERY change (separate notices would be capped and could hide some).
  useEffect(() => {
    const list = eng.changes;
    if (list.length === 0) return;
    toast(list.length === 1 ? describeChange(list[0]) : `${list.length} choices were reset because they aren't available here:\n${list.map((c) => `• ${describeChange(c)}`).join("\n")}`, "info");
  }, [eng.changes, toast]);

  // Remember each photo's placement so switching photos back and forth never loses (or mixes up) placements.
  const placementCache = useRef(new Map<string, PlacementHistory>());
  useEffect(() => {
    (["exterior", "interior"] as const).forEach((v) => {
      const photo = scene.photos[v], h = scene.placements[v];
      if (photo && h) placementCache.current.set(`${v}:${photo.id}`, h);
    });
  }, [scene.photos, scene.placements]);

  const select = useCallback<ConfiguratorApi["select"]>((key, value) => {
    dispatchEngine({ type: "set", key, value: value as Value });
  }, []);

  const setDoorMarkup = useCallback((markup: string) => dispatchScene({ type: "markup", markup }), []);
  const evaluation = useMemo(() => evaluate(CATALOGUE, eng.config), [eng.config]);

  const api = useMemo<ConfiguratorApi>(() => ({
    ...scene,
    selections: eng.config,
    evaluation,
    select,
    loadDesign: (config, saved) => {
      dispatchEngine({ type: "load", config });
      dispatchScene({ type: "ready", savedId: saved?.id, savedName: saved?.name });
    },
    resetDesign: () => dispatchEngine({ type: "reset" }),
    undo: () => dispatchEngine({ type: "undo" }),
    redo: () => dispatchEngine({ type: "redo" }),
    canUndo: eng.past.length > 0,
    canRedo: eng.future.length > 0,
    setView: (view) => dispatchScene({ type: "view", view }),
    setMode: (mode) => dispatchScene({ type: "mode", mode }),
    loadProject: (p) => {
      dispatchEngine({ type: "load", config: p.config });
      const photos: Record<ViewSide, PhotoAsset | null> = { exterior: null, interior: null };
      const placements: Record<ViewSide, PlacementHistory | null> = { exterior: null, interior: null };
      for (const v of ["exterior", "interior"] as const) {
        const r = p.photos[v];
        if (r) { photos[v] = r.asset; placements[v] = newHistory(r.placement); }
      }
      dispatchScene({ type: "project", savedId: p.id, savedName: p.name, photos, placements });
    },
    setDoorMarkup,
    setPhoto: (view, photo) => {
      if (!photo) return dispatchScene({ type: "photo", view, photo: null, history: null });
      const cached = placementCache.current.get(`${view}:${photo.id}`);
      const history = cached ? { ...cached, gestureBase: null } : newHistory(defaultPlacement(photo.width, photo.height, cutoutAspect(eng.config)));
      dispatchScene({ type: "photo", view, photo, history });
    },
    placeDoor: (view, action) => dispatchScene({ type: "placement", view, action }),
    goStep: (step) => dispatchScene({ type: "step", step }),
    markSaved: (id, name) => dispatchScene({ type: "saved", id, name }),
  }), [scene, eng, evaluation, select, setDoorMarkup]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
