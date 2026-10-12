"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Tooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/States";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { PhotoModal } from "./PhotoModal";
import { Visualiser } from "./Visualiser";
import { useConfigurator } from "./store";


export function PreviewWorkspace({ className }: { className?: string }) {
  const c = useConfigurator();
  const [photoOpen, setPhotoOpen] = useState(false);
  const photo = c.photos[c.view];

  return (
    <section
      id="preview-stage"
      aria-label="Door preview"
      className={cn("relative isolate overflow-hidden", c.view === "exterior" ? "bg-stage" : "bg-[#eee8dc]", className)}
    >
      {!c.ready ? (
        <Skeleton className="absolute inset-0 rounded-none" />
      ) : c.mode === "door" || !photo ? (
        <>
          {c.mode === "door" && (
            <>
              <div aria-hidden className={cn("absolute inset-x-0 bottom-0 h-[9%] min-h-9", c.view === "exterior" ? "bg-[#b9bbb9]" : "bg-[#a98a63]")} />
              <div className="absolute inset-x-0 bottom-[9%] top-20 grid place-items-center px-6 max-lg:bottom-9">
                <SchematicDoor selections={c.selections} view={c.view} className="h-full w-full max-w-[560px]" />
              </div>
            </>
          )}
          {c.mode === "house" && (
            <div className="absolute inset-0 grid place-items-center px-6 pb-4 pt-20">
              <HouseEmpty view={c.view} onChoose={() => setPhotoOpen(true)} />
            </div>
          )}
        </>
      ) : (
        <Visualiser onReplace={() => setPhotoOpen(true)} />
      )}

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
        <SegmentedControl
          label="Preview mode"
          value={c.mode}
          onChange={c.setMode}
          items={[{ value: "door", label: "Door" }, { value: "house", label: "House" }]}
        />
        <div className="flex items-center gap-2">
          <SegmentedControl
            label="Side"
            value={c.view}
            onChange={c.setView}
            items={[{ value: "exterior", label: "Outside" }, { value: "interior", label: "Inside" }]}
          />
        </div>
      </div>

      <div className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3 sm:flex sm:right-4">
        <Tooltip text="Undo" side="left"><IconButton label="Undo" onClick={c.undo} disabled={!c.canUndo} className="size-14 rounded-md bg-surface shadow-card"><Icon name="undo" size={26} /></IconButton></Tooltip>
        <Tooltip text="Redo" side="left"><IconButton label="Redo" onClick={c.redo} disabled={!c.canRedo} className="size-14 rounded-md bg-surface shadow-card"><Icon name="redo" size={26} /></IconButton></Tooltip>
      </div>

      {c.mode === "door" && c.ready && (
        <p className="absolute bottom-2 left-0 right-0 z-10 px-4 text-center text-[11px] font-semibold text-ink">
          Schematic preview — realistic rendering arrives in a later phase.
        </p>
      )}

      <PhotoModal
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        view={c.view}
        current={photo}
        onPick={(p) => c.setPhoto(c.view, p)}
      />
    </section>
  );
}

function HouseEmpty({ view, onChoose }: { view: "exterior" | "interior"; onChoose: () => void }) {
  return (
    <div className="grid max-w-sm place-items-center gap-3 rounded-lg bg-surface/90 px-8 py-10 text-center shadow-card backdrop-blur">
      <span className="grid size-14 place-items-center rounded-full bg-canvas"><Icon name="home" size={28} /></span>
      <h3 className="text-lg font-bold">See it on your {view === "exterior" ? "home" : "room"}</h3>
      <p className="text-sm text-muted">Choose a sample photo or upload your own, then drag the door into place.</p>
      <Button onClick={onChoose}><Icon name="image" size={18} /> Choose a photo</Button>
    </div>
  );
}
