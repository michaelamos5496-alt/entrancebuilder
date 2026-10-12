"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { CATALOGUE } from "@/domain/catalogue";
import { encodeConfig } from "@/domain/engine/serialize";
import { getRepository, ProjectError, type PhotoSave, type ProjectSummary } from "@/services/persistence";
import { AuthForm } from "@/features/account/AuthForm";
import { useAuth } from "@/features/account/useAuth";
import { SchematicDoor } from "@/features/preview/SchematicDoor";

type Load = { status: "loading" } | { status: "error"; message: string; signIn: boolean } | { status: "ready"; rows: ProjectSummary[] };
type Dialog = { kind: "rename" | "delete"; row: ProjectSummary } | null;

const revoke = (rows: ProjectSummary[]) => rows.forEach((r) => r.previewUrl?.startsWith("blob:") && URL.revokeObjectURL(r.previewUrl));

export function DesignsList() {
  const repo = useMemo(() => getRepository(), []);
  const auth = useAuth();
  const [loaded, setLoad] = useState<Load>({ status: "loading" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const toast = useToast();
  const shown = useRef<ProjectSummary[]>([]);
  // In cloud mode the signed-in state decides what to show; derived here instead of being copied into state.
  const load: Load =
    repo.mode === "cloud" && auth.status === "signedOut" ? { status: "error", message: "Sign in to see your projects.", signIn: true }
    : repo.mode === "cloud" && auth.status === "loading" ? { status: "loading" }
    : loaded;

  const errorState = (e: unknown): Load => {
    const pe = e instanceof ProjectError ? e : null;
    return { status: "error", message: pe?.message ?? "We couldn't read your projects.", signIn: pe?.code === "AUTH_REQUIRED" };
  };
  const refresh = useCallback(async () => {
    try {
      const rows = await repo.list();
      revoke(shown.current);
      shown.current = rows;
      setLoad({ status: "ready", rows });
    } catch (e) {
      setLoad(errorState(e));
    }
  }, [repo]);

  useEffect(() => {
    if (repo.mode === "cloud" && auth.status !== "signedIn") return; // wait for / need a session
    let alive = true;
    repo.list().then(
      (rows) => { if (!alive) return; revoke(shown.current); shown.current = rows; setLoad({ status: "ready", rows }); },
      (e) => { if (alive) setLoad(errorState(e)); },
    );
    return () => { alive = false; };
  }, [repo, auth.status]);
  useEffect(() => () => revoke(shown.current), []);

  async function duplicate(row: ProjectSummary) {
    try {
      const loaded = await repo.load(row.id);
      const photos: Partial<Record<"exterior" | "interior", PhotoSave>> = {};
      for (const [v, p] of Object.entries(loaded.photos) as ["exterior" | "interior", NonNullable<(typeof loaded.photos)["exterior"]>][]) {
        photos[v] = p.kind === "gallery" ? { kind: "gallery", galleryId: p.galleryId, width: p.width, height: p.height, placement: p.placement } : { kind: "upload", blob: p.blob, width: p.width, height: p.height, placement: p.placement };
      }
      let preview: Blob | null = null;
      if (row.previewUrl) try { preview = await (await fetch(row.previewUrl)).blob(); } catch { /* cosmetic */ }
      const taken = load.status === "ready" ? load.rows.map((r) => r.name.toLowerCase()) : [];
      let n = 2;
      while (taken.includes(`${row.name} (${n})`.toLowerCase())) n++;
      await repo.save({ name: `${row.name} (${n})`, config: loaded.config, photos, preview });
      toast("Project duplicated.", "success");
      await refresh();
    } catch (e) {
      toast(e instanceof ProjectError ? e.message : "Couldn't duplicate that project.", "error");
    }
  }

  const banner = (
    <p role="note" className="mb-6 rounded-md bg-surface px-4 py-3 text-sm shadow-card">
      {repo.mode === "cloud" ? (
        auth.status === "signedIn" ? <>Signed in as <strong>{auth.email}</strong>. Projects are stored privately in your account.</> : <>Projects are stored privately in your account.</>
      ) : (
        <><strong>Local development mode.</strong> Projects are kept in this browser only: not an account, not backed up, not available on other devices.</>
      )}
    </p>
  );

  if (load.status === "loading") {
    return <>{banner}<ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading your projects">{[0, 1, 2].map((i) => <li key={i}><Skeleton className="h-72 w-full" /></li>)}</ul></>;
  }
  if (load.status === "error") {
    return (
      <>{banner}
        <ErrorState title={load.signIn ? "Sign in to continue" : "We couldn't load your projects"} action={load.signIn ? undefined : <Button onClick={() => void refresh()}>Try again</Button>}>{load.message}</ErrorState>
        {load.signIn && <div className="mx-auto mt-6 max-w-md rounded-lg bg-surface p-6 shadow-card"><AuthForm next="/designs" /></div>}
      </>
    );
  }
  if (load.rows.length === 0) {
    return (
      <>{banner}
        <EmptyState icon="door" title="No projects yet" action={<ButtonLink href="/configurator">Create a door</ButtonLink>}>
          Create a door and press Save to see it here.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {banner}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {load.rows.map((row) => (
          <li key={row.id} className="overflow-hidden rounded-lg bg-surface shadow-card">
            <Link href={`/configurator?open=${row.id}`} className="block aspect-[4/3] bg-[#dfe3e6]" aria-label={`Edit ${row.name}`}>
              {row.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user preview (object or signed URL)
                <img src={row.previewUrl} alt={`Preview of ${row.name}`} className="size-full object-contain" />
              ) : (
                <SchematicDoor selections={row.config} view="exterior" className="size-full" />
              )}
            </Link>
            <div className="p-4">
              <h3 className="truncate font-bold">{row.name}</h3>
              <p className="text-xs text-muted">
                Updated {new Date(row.updatedAt).toLocaleDateString()}
                {row.photoViews.length > 0 && <> · {row.photoViews.length} photo{row.photoViews.length > 1 ? "s" : ""}</>}
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <ButtonLink href={`/configurator?open=${row.id}`} size="sm"><Icon name="edit" size={16} /> Edit</ButtonLink>
                <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: "rename", row })}>Rename</Button>
                <span className="ml-auto flex items-center">
                  <Tooltip text="Duplicate"><IconButton label={`Duplicate ${row.name}`} className="size-9" onClick={() => void duplicate(row)}><Icon name="copy" size={18} /></IconButton></Tooltip>
                  <Tooltip text="Copy share link">
                    <IconButton label={`Copy share link for ${row.name}`} className="size-9" onClick={async () => {
                      try { await navigator.clipboard.writeText(`${window.location.origin}/configurator?d=${encodeConfig(CATALOGUE, row.config)}`); toast("Share link copied. It contains the design only, never photos.", "success"); }
                      catch { toast("Couldn't copy the link.", "error"); }
                    }}><Icon name="link" size={18} /></IconButton>
                  </Tooltip>
                  <Tooltip text="Delete"><IconButton label={`Delete ${row.name}`} className="size-9 text-danger" onClick={() => setDialog({ kind: "delete", row })}><Icon name="trash" size={18} /></IconButton></Tooltip>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {dialog?.kind === "rename" && <RenameDialog row={dialog.row} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh(); toast("Project renamed.", "success"); }} />}
      <DeleteDialog row={dialog?.kind === "delete" ? dialog.row : null} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void refresh(); toast("Project deleted.", "success"); }} />
    </>
  );
}

function DeleteDialog({ row, onClose, onDone }: { row: ProjectSummary | null; onClose: () => void; onDone: () => void }) {
  const repo = useMemo(() => getRepository(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={row !== null} onClose={() => { setError(null); onClose(); }} title="Delete project"
      description="This permanently deletes the project and any photos stored with it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={async () => {
            if (!row) return;
            setBusy(true); setError(null);
            try { await repo.remove(row.id); onDone(); }
            catch (e) { setError(e instanceof ProjectError ? e.message : "Couldn't delete the project. Nothing was removed."); }
            finally { setBusy(false); }
          }}>Delete</Button>
        </>
      }>
      <p>Do you really want to delete “{row?.name}”?</p>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </Modal>
  );
}

function RenameDialog({ row, onClose, onDone }: { row: ProjectSummary; onClose: () => void; onDone: () => void }) {
  const repo = useMemo(() => getRepository(), []);
  const id = useId();
  const [name, setName] = useState(row.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await repo.rename(row.id, name);
      onDone();
    } catch (err) {
      setBusy(false);
      setError(err instanceof ProjectError ? err.message : "Couldn't rename the project.");
    }
  }

  return (
    <Modal open onClose={onClose} title="Rename project" description="Choose a new name for this project."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form={`${id}-f`} loading={busy}>Rename</Button></>}>
      <form id={`${id}-f`} onSubmit={submit} noValidate>
        <label htmlFor={id} className="text-sm font-bold">Project name</label>
        <input id={id} value={name} onChange={(e) => setName(e.target.value)} data-autofocus onFocus={(e) => e.currentTarget.select()} aria-invalid={error ? true : undefined}
          className="mt-1.5 h-11 w-full rounded-md border border-line px-3 text-sm aria-[invalid=true]:border-danger" />
        {error && <p role="alert" className="mt-2 text-sm font-medium text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
