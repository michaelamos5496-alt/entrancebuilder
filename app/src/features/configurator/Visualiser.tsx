"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CORNER_NAMES, type Pt, type Quad } from "@/domain/imaging/types";
import { estimateLighting } from "@/domain/imaging/lighting";
import { clamp, isRectangle, moveCorner, quadAspect, resizeRect, slideInside, toPx, translate } from "@/domain/imaging/quad";
import type { PlacementAction } from "@/domain/imaging/placement";
import { defaultPlacement } from "@/domain/imaging/placement";
import { exportComposite, paintOverlay, type Layer } from "@/services/imaging/compose";
import { rasterSizeFor, svgToRaster } from "@/services/imaging/doorRaster";
import { IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { cutoutAspect } from "@/features/preview/SchematicDoor";
import { useConfigurator } from "./store";

const PAD = { top: 72, x: 16 };
const NUDGE = 0.003;

/** Photo + door overlay + draggable doorway corners. The photograph canvas is never modified. */
export function Visualiser({ onReplace }: { onReplace: () => void }) {
  const c = useConfigurator();
  const toast = useToast();
  const view = c.view;
  const photo = c.photos[view]!;
  const hist = c.placements[view]!;
  const p = hist.present;
  const aspect = cutoutAspect(c.selections);
  const live = hist.gestureBase !== null;

  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 0, h: 0 });
  const [barH, setBarH] = useState(56);
  const markup = c.doorMarkup;
  const [renderError, setRenderError] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [dpr] = useState(() => (typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1)));

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    // the toolbar wraps to two rows on narrow screens: reserve exactly the room it needs, no more
    const bar = barRef.current;
    const rb = bar ? new ResizeObserver(([e]) => setBarH(Math.ceil(e.target.getBoundingClientRect().height))) : null;
    if (bar && rb) rb.observe(bar);
    return () => { ro.disconnect(); rb?.disconnect(); };
  }, []);

  // display box: the whole photo, letterboxed (never cropped), so corners can be placed anywhere in it
  const disp = useMemo(() => {
    const maxW = Math.max(0, avail.w - PAD.x * 2), maxH = Math.max(0, avail.h - PAD.top - barH - 24);
    const s = Math.min(maxW / photo.width, maxH / photo.height);
    return { w: Math.max(0, Math.floor(photo.width * s)), h: Math.max(0, Math.floor(photo.height * s)) };
  }, [avail, barH, photo.width, photo.height]);

  // the photograph itself (static)
  useEffect(() => {
    const cv = baseRef.current;
    if (!cv || !disp.w) return;
    cv.width = Math.round(disp.w * dpr);
    cv.height = Math.round(disp.h * dpr);
    const ctx = cv.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(photo.canvas, 0, 0, cv.width, cv.height);
  }, [photo, disp, dpr]);

  const auto = useMemo(() => estimateLighting(photo.thumb, p.quad), [photo.thumb, p.quad]);

  // the door overlay (re-drawn whenever the door, placement or size changes)
  const renderSeq = useRef(0);
  useEffect(() => {
    const cv = overlayRef.current;
    if (!cv || !disp.w || !markup) return;
    const seq = ++renderSeq.current;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        try {
          const scale = live ? Math.min(dpr, 1) * 0.6 : dpr; // lower resolution while dragging keeps it smooth
          const w = Math.max(8, Math.round(disp.w * scale)), h = Math.max(8, Math.round(disp.h * scale));
          const qh = Math.hypot(p.quad[0].x - p.quad[3].x, (p.quad[0].y - p.quad[3].y) * (disp.h / disp.w)) * disp.w * scale;
          const size = rasterSizeFor(qh, aspect);
          const door = await svgToRaster(markup, size.width, size.height);
          if (seq !== renderSeq.current) return; // a newer render superseded this one
          if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
          paintOverlay(cv, { door, doorAspect: aspect, placement: p, lighting: auto });
          setRenderError(null);
        } catch {
          if (seq === renderSeq.current) setRenderError("The door preview couldn't be drawn. Try changing an option.");
        }
      })();
    });
    return () => cancelAnimationFrame(raf);
  }, [markup, p, disp, dpr, live, aspect, auto]);

  // ---- interaction ----
  const act = useCallback((a: PlacementAction) => c.placeDoor(view, a), [c, view]);
  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const r = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };
  const quadPx = toPx(p.quad, disp.w || 1, disp.h || 1);
  const qAspect = quadAspect(toPx(p.quad, photo.width, photo.height));

  const dragCorner = useRef<number | null>(null);
  const dragBody = useRef<{ start: Pt; quad: Quad } | null>(null);

  function setCorner(i: number, to: Pt): Quad {
    return p.perspective || !isRectangle(p.quad)
      ? moveCorner(p.quad, i, to, photo.width, photo.height)
      : resizeRect(p.quad, i, to, qAspect, photo.width, photo.height);
  }
  function cornerDown(i: number, e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragCorner.current = i;
  }
  function cornerMove(e: PointerEvent) {
    if (dragCorner.current === null) return;
    const q = setCorner(dragCorner.current, rel(e));
    if (q !== p.quad) act({ type: "live", patch: { quad: q } });
  }
  function endDrag() {
    if (dragCorner.current !== null || dragBody.current) act({ type: "end" });
    dragCorner.current = null;
    dragBody.current = null;
  }
  function cornerKey(i: number, e: KeyboardEvent) {
    const step = e.shiftKey ? NUDGE * 6 : NUDGE;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key as "ArrowLeft"];
    if (!d) return;
    e.preventDefault();
    const q = setCorner(i, { x: p.quad[i].x + d[0], y: p.quad[i].y + d[1] });
    if (q !== p.quad) act({ type: "apply", patch: { quad: q } });
  }
  function bodyDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    dragBody.current = { start: rel(e), quad: p.quad };
  }
  function bodyMove(e: PointerEvent) {
    const d = dragBody.current;
    if (!d) return;
    const now = rel(e);
    act({ type: "live", patch: { quad: slideInside(translate(d.quad, now.x - d.start.x, now.y - d.start.y), 0) } });
  }
  function bodyKey(e: KeyboardEvent) {
    const step = e.shiftKey ? NUDGE * 6 : NUDGE;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key as "ArrowLeft"];
    if (d) { e.preventDefault(); act({ type: "nudge", dx: d[0], dy: d[1] }); }
    else if (e.key === "+" || e.key === "=") { e.preventDefault(); act({ type: "scale", factor: 1.04, photoW: photo.width, photoH: photo.height }); }
    else if (e.key === "-") { e.preventDefault(); act({ type: "scale", factor: 1 / 1.04, photoW: photo.width, photoH: photo.height }); }
  }

  async function download() {
    try {
      const qh = Math.hypot(p.quad[0].x - p.quad[3].x, (p.quad[0].y - p.quad[3].y) * (photo.height / photo.width)) * photo.width;
      const size = rasterSizeFor(qh, aspect);
      const door = await svgToRaster(markup, size.width, size.height);
      const layer: Layer = { door, doorAspect: aspect, placement: p, lighting: auto };
      const blob = await exportComposite(photo.canvas, layer);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "door-preview.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000); // keep it alive long enough for slow "save as" prompts
      toast("Image saved. It's marked as an approximate preview.", "success");
    } catch {
      toast("Couldn't create the image. Please try again.", "error");
    }
  }

  const reset = () => act({ type: "reset", to: defaultPlacement(photo.width, photo.height, aspect) });
  const untouched = hist.past.length === 0 && !live;
  // the hint is a one-off nudge: it goes away on the first edit, when dismissed by time, or when the photo changes
  const [hintGone, setHintGone] = useState<string | null>(null);
  useEffect(() => {
    const id = photo.id;
    const t = window.setTimeout(() => setHintGone(id), 9000);
    return () => window.clearTimeout(t);
  }, [photo.id]);
  const showHint = untouched && hintGone !== photo.id;

  return (
    <>
      <div ref={wrap} className="absolute inset-0">
        <div
          ref={box}
          className="absolute overflow-hidden rounded-sm shadow-pop"
          style={{ width: disp.w, height: disp.h, left: (avail.w - disp.w) / 2, top: PAD.top + (avail.h - PAD.top - barH - 24 - disp.h) / 2 }}
        >
          <canvas ref={baseRef} className="absolute inset-0 size-full" role="img" aria-label={`Your photo: ${photo.label}`} />
          <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

          <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white">Approximate preview · illustrative door</span>
          {disp.w > 0 && (
            <svg className="absolute inset-0 size-full overflow-visible" width={disp.w} height={disp.h} aria-hidden={false}>
              <polygon
                points={quadPx.map((q) => `${q.x},${q.y}`).join(" ")}
                fill="transparent"
                stroke="white"
                strokeWidth={2}
                strokeDasharray="6 5"
                style={{ filter: "drop-shadow(0 0 2px rgb(0 0 0 / 0.7))", cursor: "grab", touchAction: "none" }}
                tabIndex={0}
                role="group"
                aria-label="Doorway. Drag to move, arrow keys to nudge, plus and minus to resize."
                onPointerDown={bodyDown}
                onPointerMove={bodyMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onKeyDown={bodyKey}
              />
            </svg>
          )}
          {disp.w > 0 && quadPx.map((q, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${CORNER_NAMES[i]} corner of the doorway. Drag, or use arrow keys.`}
              onPointerDown={(e) => cornerDown(i, e)}
              onPointerMove={cornerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onKeyDown={(e) => cornerKey(i, e)}
              className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 cursor-pointer touch-none place-items-center rounded-full outline-offset-2"
              style={{ left: q.x, top: q.y }}
            >
              <span className={cn("block size-4 rounded-full border-2 border-white bg-brand shadow-[0_0_0_1.5px_rgb(0_0_0/0.55)]", !p.perspective && "rounded-[4px]")} />
            </button>
          ))}
        </div>
      </div>

      {/* guidance (transient) and errors */}
      <div className="pointer-events-none absolute inset-x-0 top-[64px] z-10 flex flex-col items-center gap-1.5 px-3">
        {showHint && (
          <p className="pointer-events-auto rounded-full bg-ink/85 px-4 py-2 text-center text-[11px] font-medium text-white shadow-card sm:text-xs">
            <span className="sm:hidden">Drag the corners onto your doorway.</span>
            <span className="hidden sm:inline">Drag the corners onto the edges of your doorway. Turn on “Perspective” if your photo is taken at an angle.</span>
          </p>
        )}
        {renderError && <p role="alert" className="pointer-events-auto rounded-full bg-danger px-4 py-2 text-xs font-medium text-white shadow-card">{renderError}</p>}
      </div>

      {/* toolbar */}
      <div className="absolute inset-x-0 bottom-3 z-10 flex flex-col items-center gap-2 px-3">
        {adjust && (
          <div className="anim-rise w-full max-w-md space-y-3 rounded-2xl bg-surface p-4 shadow-pop" role="group" aria-label="Lighting and shadow">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span><span className="font-bold">Match photo lighting</span><span className="block text-xs text-muted">Nudges the door toward the photo&apos;s brightness and color cast. An estimate, not a lighting simulation.</span></span>
              <input type="checkbox" role="switch" checked={p.matchLighting} onChange={(e) => act({ type: "apply", patch: { matchLighting: e.target.checked } })} className="size-5 shrink-0 accent-ink" />
            </label>
            <label className="block text-sm">
              <span className="flex justify-between font-bold"><span>Brightness</span><span className="text-xs font-normal text-muted">{p.brightness > 0 ? "+" : ""}{p.brightness}%</span></span>
              <input
                type="range" min={-50} max={50} step={1} value={p.brightness}
                aria-label="Door brightness"
                onChange={(e) => act({ type: "live", patch: { brightness: Number(e.target.value) } })}
                onPointerUp={() => act({ type: "end" })}
                onKeyUp={() => act({ type: "end" })}
                onBlur={() => act({ type: "end" })}
                className="mt-1 h-2 w-full accent-ink"
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span><span className="font-bold">Soft shadow</span><span className="block text-xs text-muted">A blurred shadow on the wall. Off if the photo is already flat or backlit.</span></span>
              <input type="checkbox" role="switch" checked={p.shadow} onChange={(e) => act({ type: "apply", patch: { shadow: e.target.checked } })} className="size-5 shrink-0 accent-ink" />
            </label>
          </div>
        )}
        <div ref={barRef} className="flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-2xl bg-surface p-1.5 shadow-pop [scrollbar-width:none] sm:flex-wrap sm:justify-center sm:overflow-visible">
          <Tooltip text="Undo"><IconButton label="Undo placement" onClick={() => act({ type: "undo" })} disabled={!hist.past.length && !live}><Icon name="undo" /></IconButton></Tooltip>
          <Tooltip text="Redo"><IconButton label="Redo placement" onClick={() => act({ type: "redo" })} disabled={!hist.future.length}><Icon name="redo" /></IconButton></Tooltip>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <Tooltip text="Smaller"><IconButton label="Make door smaller" onClick={() => act({ type: "scale", factor: 1 / 1.06, photoW: photo.width, photoH: photo.height })}><Icon name="minus" /></IconButton></Tooltip>
          <Tooltip text="Larger"><IconButton label="Make door larger" onClick={() => act({ type: "scale", factor: 1.06, photoW: photo.width, photoH: photo.height })}><Icon name="plus" /></IconButton></Tooltip>
          <Tooltip text="Flip door"><IconButton label="Flip door" aria-pressed={p.flip} onClick={() => act({ type: "apply", patch: { flip: !p.flip } })} className={p.flip ? "bg-ink/10" : ""}><Icon name="flip" /></IconButton></Tooltip>
          <button
            type="button"
            aria-pressed={p.perspective}
            onClick={() => act({ type: "setPerspective", on: !p.perspective, photoW: photo.width, photoH: photo.height })}
            className={cn("h-10 shrink-0 rounded-md px-3 text-xs font-bold hover:bg-ink/8", p.perspective && "bg-ink text-white hover:bg-ink")}
          >
            Perspective
          </button>
          <button
            type="button"
            aria-expanded={adjust}
            onClick={() => setAdjust((v) => !v)}
            className={cn("h-10 shrink-0 rounded-md px-3 text-xs font-bold hover:bg-ink/8", adjust && "bg-ink/10")}
          >
            Lighting
          </button>
          <span className="mx-1 h-6 w-px bg-line" aria-hidden />
          <Tooltip text="Reset door position"><IconButton label="Reset door position" onClick={reset}><Icon name="reset" /></IconButton></Tooltip>
          <Tooltip text="Replace photo"><IconButton label="Replace photo" onClick={onReplace}><Icon name="image" /></IconButton></Tooltip>
          <Tooltip text="Download image"><IconButton label="Download image" onClick={() => void download()} disabled={!markup}><Icon name="save" /></IconButton></Tooltip>
          <Tooltip text="Remove photo"><IconButton label="Remove photo" onClick={() => c.setPhoto(view, null)}><Icon name="trash" /></IconButton></Tooltip>
        </div>
      </div>
    </>
  );
}
