"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ViewSide } from "@/domain/design/types";
import { IMAGE_LIMITS, UploadError } from "@/domain/imaging/validate";
import { galleryFor } from "@/services/gallery";
import { decodePhotoFile, decodeTrustedUrl, type PhotoAsset, type Progress } from "@/services/imaging/decodePhoto";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cn } from "@/lib/cn";

type Tab = "gallery" | "upload";

interface Props {
  open: boolean;
  onClose: () => void;
  view: ViewSide;
  current: PhotoAsset | null;
  onPick: (photo: PhotoAsset) => void;
}

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
const STAGE_TEXT = { reading: "Reading your photo", decoding: "Opening the image", preparing: "Preparing it for the preview" } as const;

interface Job {
  label: string;
  progress: Progress | null;
}

/** Photo picker with real progress, cancellation and readable errors. Photos are processed in this browser only. */
export function PhotoModal({ open, onClose, view, current, onPick }: Props) {
  const [tab, setTab] = useState<Tab>("gallery");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const inputId = useId();
  const gallery = galleryFor(view);

  // never leave a decode running after the dialog is gone
  useEffect(() => () => abort.current?.abort(), []);

  async function run(label: string, task: (signal: AbortSignal, onProgress: (p: Progress) => void) => Promise<PhotoAsset>) {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setError(null);
    setJob({ label, progress: null });
    try {
      const asset = await task(ctl.signal, (progress) => setJob({ label, progress }));
      if (ctl.signal.aborted) return;
      onPick(asset);
      setJob(null);
      onClose();
    } catch (e) {
      setJob(null);
      if (e instanceof UploadError && e.code === "CANCELLED") return;
      setError(e instanceof UploadError ? e.message : "Something went wrong while opening that image. Please try a different one.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const handleFile = (file: File | undefined) => {
    if (file) void run(file.name, (signal, onProgress) => decodePhotoFile(file, { signal, onProgress }));
  };

  function close() {
    abort.current?.abort();
    setJob(null);
    setError(null);
    onClose();
  }

  const pct = job?.progress ? Math.round(job.progress.fraction * 100) : 0;
  const busy = job !== null;

  return (
    <Modal
      open={open}
      onClose={close}
      title={`${view === "exterior" ? "House" : "Room"} photo`}
      description="Choose a sample or use your own. Your photo stays on this device."
      variant="sheet"
    >
      {busy ? (
        <div role="status" aria-live="polite" className="py-6 text-center">
          <p className="text-sm font-bold">{job.progress ? STAGE_TEXT[job.progress.stage] : "Starting…"}</p>
          <p className="mt-1 truncate text-xs text-muted">{job.label}</p>
          <div
            role="progressbar"
            aria-label="Photo progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            className="mx-auto mt-4 h-2 w-full max-w-xs overflow-hidden rounded-full bg-canvas"
          >
            <div className="h-full bg-brand transition-all duration-150" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">{pct}%</p>
          <div className="mt-5"><Button variant="secondary" onClick={() => abort.current?.abort()}>Cancel</Button></div>
        </div>
      ) : (
        <>
          <div role="tablist" aria-label="Photo source" className="mb-4 flex gap-1 rounded-full bg-canvas p-1">
            {(["gallery", "upload"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => { setTab(t); setError(null); }}
                className={cn("flex-1 rounded-full px-4 py-2 text-sm font-bold", tab === t ? "bg-surface shadow-card" : "text-muted")}
              >
                {t === "gallery" ? "Sample gallery" : "Upload a picture"}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="mb-4 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{error}</p>}

          {tab === "gallery" ? (
            <ul className="grid grid-cols-2 gap-3">
              {gallery.map((g) => {
                const sel = current?.source === "gallery" && current.id === g.id;
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      aria-pressed={sel}
                      onClick={() => void run(g.label, (signal) => decodeTrustedUrl(g.url, g.id, g.label, signal))}
                      className={cn("group block w-full overflow-hidden rounded-md border-2 text-left", sel ? "border-ink" : "border-transparent hover:border-line")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG illustration */}
                      <img src={g.url} alt="" className="aspect-[3/2] w-full object-cover" />
                      <span className="block bg-canvas px-3 py-2 text-sm font-medium">{g.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div>
              <label
                htmlFor={inputId}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
                  drag ? "border-brand bg-brand-soft" : "border-line hover:border-ink",
                )}
              >
                <Icon name="upload" size={28} />
                <span className="font-bold">{current?.source === "upload" ? "Replace with another picture" : "Choose a picture or drop it here"}</span>
                <span className="text-xs text-muted">JPEG, PNG or WebP · up to {mb(IMAGE_LIMITS.maxBytes)}</span>
              </label>
              <input
                ref={input}
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <ul className="mt-4 space-y-1.5 text-xs text-muted">
                <li>Private by default: the photo is opened in your browser and is not uploaded or saved anywhere.</li>
                <li>Large photos are reduced to {IMAGE_LIMITS.workingEdge}px on the long side. Location and camera details are removed.</li>
                <li>Your door design is unchanged when you swap photos, and each photo remembers where you placed the door.</li>
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
