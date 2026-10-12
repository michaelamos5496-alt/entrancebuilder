"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { STEPS } from "@/domain/catalogue/data";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/States";
import { Tooltip } from "@/components/ui/Tooltip";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { OptionPanel } from "./OptionPanel";
import { PreviewWorkspace } from "./PreviewWorkspace";
import { SaveModal } from "./SaveModal";
import { ShareModal } from "./ShareModal";
import { SummaryPanel, specRows } from "./SummaryPanel";
import { ConfiguratorProvider, useConfigurator } from "./store";
import { getRepository, ProjectError } from "@/services/persistence";
import { restorePhotos } from "@/services/persistence/restore";
import { DoorSvgSource } from "./DoorSvgSource";
import { useToast } from "@/components/ui/Toast";

function StepNav() {
  const c = useConfigurator();
  return (
    <nav aria-label="Configuration steps" className="border-b border-line bg-surface">
      <ol className="flex">
        {STEPS.map((s, i) => {
          const current = i === c.step;
          return (
            <li key={s.id} className="min-w-0 flex-1">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => c.goStep(i)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 px-1 pb-2.5 pt-3 text-[11px] font-bold transition-colors sm:text-xs",
                  current ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "grid size-7 place-items-center rounded-full text-xs transition-colors",
                    current ? "bg-brand text-white" : i < c.step ? "bg-ink text-white" : "bg-canvas",
                  )}
                >
                  {i < c.step ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className="truncate">{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="h-0.5 bg-line" aria-hidden>
        <div className="h-full bg-brand transition-all duration-300" style={{ width: `${((c.step + 1) / STEPS.length) * 100}%` }} />
      </div>
    </nav>
  );
}

function PrintSheet() {
  const c = useConfigurator();
  const rows = specRows(c.selections, c.evaluation);
  return (
    <div className="hidden print:block">
      <h1 className="text-2xl font-bold">{c.savedName ?? "My door design"}</h1>
      <p className="text-sm" suppressHydrationWarning>Creation date: {new Date().toLocaleDateString()}</p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        <figure><SchematicDoor selections={c.selections} view="exterior" className="h-96 w-full" /><figcaption className="text-center text-sm">Exterior door</figcaption></figure>
        <figure><SchematicDoor selections={c.selections} view="interior" className="h-96 w-full" /><figcaption className="text-center text-sm">Interior door</figcaption></figure>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
        {rows.map((r) => (<div key={r.group.key} className="flex justify-between border-b border-black/20 py-1"><dt>{r.group.title}</dt><dd className="font-bold">{r.label}</dd></div>))}
      </dl>
      <p className="mt-6 text-xs">Images are illustrative only and do not constitute a contractual offer.</p>
    </div>
  );
}

function Shell() {
  const c = useConfigurator();
  const toast = useToast();
  const [saveOpen, setSaveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const last = c.step === STEPS.length - 1;
  const params = useSearchParams();
  const open = params.get("open");

  // Open a saved project (from "My designs"): configuration, then its photos with their placements.
  const { loadProject } = c;
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      try {
        const loaded = await getRepository().load(open);
        const { photos, warnings } = await restorePhotos(loaded);
        if (!alive) return;
        loadProject({ id: loaded.id, name: loaded.name, config: loaded.config, photos });
        if (Object.keys(photos).length) c.setMode("house");
        warnings.forEach((w) => toast(w, "info"));
      } catch (e) {
        if (alive) toast(e instanceof ProjectError ? e.message : "That project couldn't be opened.", "error");
      }
    })();
    return () => { alive = false; };
    // only the URL parameter should trigger a (re)load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <h1 className="sr-only">Create a door</h1>
      <div className="no-print flex flex-col lg:h-[calc(100svh-var(--header-h))] lg:flex-row">
        <PreviewWorkspace className={cn("sticky top-[var(--header-h)] z-10 min-h-[320px] shrink-0 lg:relative lg:top-0 lg:h-auto lg:min-h-0 lg:flex-1", c.mode === "house" && c.photos[c.view] ? "h-[52svh]" : "h-[46svh]")} />

        <aside aria-label="Configuration" className="flex min-h-0 flex-1 flex-col bg-surface lg:w-[460px] lg:flex-none lg:border-l lg:border-line">
          <StepNav />
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-28 pt-4 lg:pb-6">
            {!c.ready ? (
              <div className="space-y-4 pt-4">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : last ? (
              <SummaryPanel onSave={() => setSaveOpen(true)} onShare={() => setShareOpen(true)} />
            ) : (
              <OptionPanel />
            )}
          </div>

          <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:static lg:bg-surface">
            <div className="flex items-center sm:hidden">
              <Tooltip text="Undo"><IconButton label="Undo" onClick={c.undo} disabled={!c.canUndo}><Icon name="undo" /></IconButton></Tooltip>
              <Tooltip text="Redo"><IconButton label="Redo" onClick={c.redo} disabled={!c.canRedo}><Icon name="redo" /></IconButton></Tooltip>
            </div>
            <Tooltip text="Reset the whole design">
              <IconButton label="Reset design" onClick={() => { c.resetDesign(); toast("Design reset. You can undo this.", "info"); }}><Icon name="reset" /></IconButton>
            </Tooltip>
            <Button variant="secondary" className="ml-auto" onClick={() => c.goStep(c.step - 1)} disabled={c.step === 0}>Previous</Button>
            {last ? (
              <Button onClick={() => setSaveOpen(true)}><Icon name="save" size={18} /> Save</Button>
            ) : (
              <Button onClick={() => c.goStep(c.step + 1)}>{c.step === STEPS.length - 2 ? "Summary" : "Next"}</Button>
            )}
          </div>
        </aside>
      </div>

      <DoorSvgSource />
      <PrintSheet />
      <SaveModal open={saveOpen} onClose={() => setSaveOpen(false)} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  );
}

function WithSource() {
  const params = useSearchParams();
  return (
    <ConfiguratorProvider source={{ d: params.get("d"), preset: params.get("preset") }}>
      <Shell />
    </ConfiguratorProvider>
  );
}

export function ConfiguratorApp() {
  return (
    <Suspense fallback={<div className="grid h-[60svh] place-items-center"><Skeleton className="h-40 w-72" /></div>}>
      <WithSource />
    </Suspense>
  );
}
