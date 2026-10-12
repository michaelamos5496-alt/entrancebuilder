import { cloneElement, useId, type ReactElement } from "react";

/** CSS-only tooltip: appears on hover and keyboard focus, described to assistive tech via aria-describedby. */
export function Tooltip({
  text, children, side = "top",
}: { text: string; children: ReactElement<{ "aria-describedby"?: string }>; side?: "top" | "bottom" | "left" }) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex">
      {cloneElement(children, { "aria-describedby": id })}
      <span
        id={id}
        role="tooltip"
        className={
          "pointer-events-none absolute z-30 whitespace-nowrap rounded-sm bg-ink px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-card transition-opacity duration-150 " +
          "group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 " +
          (side === "top" ? "bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2" : side === "bottom" ? "top-[calc(100%+6px)] left-1/2 -translate-x-1/2" : "right-[calc(100%+8px)] top-1/2 -translate-y-1/2")
        }
      >
        {text}
      </span>
    </span>
  );
}
