"use client";

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { AuthForm } from "@/features/account/AuthForm";
import { useAuth } from "@/features/account/useAuth";
import { buildPreviewPng, photoToJpeg } from "@/services/imaging/preview";
import { getRepository, ProjectError, type PhotoSave, type SaveInput, type SaveResult } from "@/services/persistence";
import { savedPhotoId } from "@/services/persistence/restore";
import { useConfigurator } from "./store";

type Phase = "form" | "saving" | "done";
const VIEWS = ["exterior", "interior"] as const;

/** Mounted only while open, so every opening starts from fresh form state. */
export function SaveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <SaveDialog onClose={onClose} /> : null;
}

function SaveDialog({ onClose }: { onClose: () => void }) {
  const c = useConfigurator();
  const auth = useAuth();
  const repo = useMemo(() => getRepository(), []);
  const fieldId = useId();
  const [name, setName] = useState(c.savedName ?? "My door");
  const [asNew, setAsNew] = useState(false);
  const [withPhotos, setWithPhotos] = useState(true);
  const [phase, setPhase] = useState<Phase>("form");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const open = true;
  const editing = c.savedId !== null && !asNew;
  const shown = VIEWS.filter((v) => c.photos[v] && c.placements[v]);
  const needsSignIn = repo.mode === "cloud" && auth.status !== "signedIn";
  const cloud = repo.mode === "cloud";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase("saving");
    try {
      const photos: Partial<Record<(typeof VIEWS)[number], PhotoSave>> = {};
      if (withPhotos) {
        setProgress("Preparing your photos…");
        for (const v of shown) {
          const asset = c.photos[v]!, placement = c.placements[v]!.present;
          if (asset.source === "gallery") photos[v] = { kind: "gallery", galleryId: asset.id, width: asset.width, height: asset.height, placement };
          else {
            const unchanged = editing && c.savedId !== null && asset.id === savedPhotoId(c.savedId, v);
            photos[v] = { kind: "upload", blob: unchanged ? null : await photoToJpeg(asset), width: asset.width, height: asset.height, placement };
          }
        }
      }
      let preview: Blob | null = null;
      if (c.doorMarkup) {
        setProgress("Creating the preview image…");
        try {
          preview = await buildPreviewPng({ markup: c.doorMarkup, selections: c.selections, view: c.view, photo: c.photos[c.view], placement: c.placements[c.view]?.present ?? null });
        } catch { /* the preview is optional */ }
      }
      setProgress(cloud ? "Saving to your account…" : "Saving in this browser…");
      const input: SaveInput = { id: editing ? c.savedId : null, name, config: c.selections, photos, preview };
      const r = await repo.save(input);
      c.markSaved(r.project.id, r.project.name);
      setResult(r);
      setPhase("done");
    } catch (err) {
      setPhase("form");
      const pe = err instanceof ProjectError ? err : new ProjectError("SERVER", "Something went wrong. Nothing was saved. Please try again.");
      setError({ message: pe.message, code: pe.code });
    }
  }

  if (phase === "done" && result) {
    return (
      <Modal open={open} onClose={onClose} title={cloud ? "Saved to your account" : "Saved in this browser"}
        description={cloud ? `“${result.project.name}” is stored privately in your account.` : `“${result.project.name}” is kept in this browser only (local development mode: not an account, not backed up).`}
        footer={<><Button variant="secondary" onClick={onClose}>Continue</Button><ButtonLink href="/designs">Visit my projects</ButtonLink></>}>
        <p className="flex items-center gap-3 rounded-md bg-success/10 px-4 py-3 text-sm font-medium text-success"><Icon name="check" /> Saved. You can reopen and edit it any time from My designs.</p>
        {result.warnings.length > 0 && (
          <ul role="status" className="mt-4 space-y-2">
            {result.warnings.map((w) => <li key={w} className="flex items-start gap-2 rounded-md bg-brand-soft px-3 py-2 text-sm"><Icon name="alert" size={16} className="mt-0.5 shrink-0" />{w}</li>)}
          </ul>
        )}
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? "Save changes" : "Save project"}
      description={cloud ? "Stored privately in your account." : "Local development mode: stored in this browser only. Not an account, not backed up, not available on other devices."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={phase === "saving"}>Cancel</Button>
          {!needsSignIn && <Button type="submit" form={`${fieldId}-form`} loading={phase === "saving"}>{editing ? "Save changes" : "Save project"}</Button>}
        </>
      }>
      {needsSignIn ? (
        auth.status === "loading" ? <p role="status" className="text-sm text-muted">Checking your account…</p> : (
          <div>
            <p className="mb-4 text-sm">Sign in to save this project to your account. Your design stays as it is while you sign in.</p>
            <AuthForm next="/configurator" />
          </div>
        )
      ) : (
        <form id={`${fieldId}-form`} onSubmit={submit} noValidate aria-busy={phase === "saving"}>
          <label htmlFor={fieldId} className="text-sm font-bold">Project name</label>
          <input
            id={fieldId} value={name} onChange={(e) => setName(e.target.value)} disabled={phase === "saving"}
            aria-invalid={error?.code === "NAME_TAKEN" || error?.code === "INVALID" ? true : undefined}
            aria-describedby={error ? `${fieldId}-err` : undefined}
            autoComplete="off" data-autofocus onFocus={(e) => e.currentTarget.select()}
            className="mt-1.5 h-11 w-full rounded-md border border-line px-3 text-sm aria-[invalid=true]:border-danger"
          />
          {c.savedId && (
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={asNew} disabled={phase === "saving"} onChange={(e) => setAsNew(e.target.checked)} className="size-4 accent-ink" />
              Save as a new project instead of replacing “{c.savedName}”
            </label>
          )}
          {shown.length > 0 && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={withPhotos} disabled={phase === "saving"} onChange={(e) => setWithPhotos(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-ink" />
              <span>
                Also save my {shown.length > 1 ? "photos" : "photo"} with this project
                <span className="block text-xs text-muted">
                  {cloud ? "Kept private to your account. Never shared or public. You can remove them any time." : "Kept in this browser only."} Unticking removes any photo already stored with this project.
                </span>
              </span>
            </label>
          )}
          {phase === "saving" && <p role="status" className="mt-4 flex items-center gap-2 text-sm text-muted"><span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />{progress}</p>}
          {error && (
            <div id={`${fieldId}-err`} role="alert" className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">
              {error.message}
              {error.code === "AUTH_REQUIRED" && <> <Link href="/login?next=/configurator" className="underline">Sign in</Link></>}
              <span className="mt-1 block text-xs font-normal">Nothing has been lost: your design is still here.</span>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">Share links don&apos;t include photos. See <Link href="/legal/privacy" className="underline">privacy</Link>.</p>
        </form>
      )}
    </Modal>
  );
}
