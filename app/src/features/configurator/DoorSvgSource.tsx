"use client";

import { useLayoutEffect, useRef } from "react";
import { SchematicDoor } from "@/features/preview/SchematicDoor";
import { useConfigurator } from "./store";

/**
 * Renders the real door component off-screen and publishes its SVG, so photos, previews and exports
 * rasterise exactly what the door preview shows. Always mounted with the configurator.
 */
export function DoorSvgSource() {
  const c = useConfigurator();
  const ref = useRef<HTMLDivElement>(null);
  const { setDoorMarkup } = c;
  useLayoutEffect(() => {
    const svg = ref.current?.querySelector("svg");
    if (svg) setDoorMarkup(svg.outerHTML);
  }, [c.selections, c.view, setDoorMarkup]);
  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-hidden">
      <SchematicDoor selections={c.selections} view={c.view} mode="cutout" />
    </div>
  );
}
