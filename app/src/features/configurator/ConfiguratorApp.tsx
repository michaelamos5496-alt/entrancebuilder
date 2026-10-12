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

function StepNav({ className }: { className?: string }) {
  const c = useConfigurator();
  return (
    <nav aria-label="Configuration steps" className={cn("glass mx-3 mt-3 rounded-full p-1.5 lg:mx-auto lg:mt-0 lg:w-full lg:max-w-3xl", className)}>
      <ol className="flex gap-1">
        {STEPS.map((s, i) => {
          const current = i === c.step;
          const done = i < c.step;
          return (
            <li key={s.id} className={cn("min-w-0 flex-1", current && "max-sm:flex-[2.2]")}>
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => c.goStep(i)}
                className={cn(
                  "flex h-10 w-full items-center justify-center gap-2 rounded-full px-2 text-sm font-semibold tracking-tight transition-all sm:px-3",
                  current ? "bg-slate text-white shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)]" : "text-ink/70 hover:bg-black/5 hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs",
                    current ? "bg-white/20 text-white" : done ? "bg-accent text-white" : "bg-black/[0.07] text-ink/70",
                  )}
                >
                  {done ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className={cn("truncate", !current && "max-sm:sr-only")}>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
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
      <div className="no-print flex flex-col lg:grid lg:h-[calc(100svh-var(--header-h))] lg:grid-cols-[minmax(360px,440px)_1fr] lg:grid-rows-[auto_minmax(0,1fr)] lg:gap-4 lg:px-4 lg:pb-4">
        <StepNav className="lg:col-span-2" />
        <PreviewWorkspace className={cn("sticky top-[var(--header-h)] z-10 order-first min-h-[320px] shrink-0 lg:relative lg:top-0 lg:order-none lg:col-start-2 lg:row-start-2 lg:h-auto lg:min-h-0 lg:rounded-[28px] lg:border lg:border-white/70 lg:shadow-[var(--shadow-glass)]", c.mode === "house" && c.photos[c.view] ? "h-[52svh]" : "h-[46svh]")} />

        <aside aria-label="Configuration" className="glass-strong mx-3 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] lg:col-start-1 lg:row-start-2 lg:m-0">
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

          <div className="glass-strong fixed inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-full px-3 py-2 lg:static lg:rounded-none lg:border-x-0 lg:border-b-0 lg:border-t-black/5 lg:bg-transparent lg:px-4 lg:py-3 lg:shadow-none lg:backdrop-blur-0">
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
