"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet" docks to the bottom on small screens */
  variant?: "dialog" | "sheet";
}

/**
 * Accessible modal on the native <dialog>: focus trap, Esc to close and focus restore come from the platform.
 * Mark the element that should receive initial focus with `data-autofocus`.
 */
export function Modal({ open, onClose, title, description, children, footer, variant = "dialog" }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // The platform focuses the first focusable element (the close button). Prefer the field the user is about to use.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(520px,calc(100vw-24px))] max-h-[min(88svh,760px)] glass-strong overflow-hidden rounded-[28px] p-0 text-ink shadow-pop",
        "open:flex open:flex-col",
        variant === "sheet" && "max-sm:m-0 max-sm:mt-auto max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:rounded-t-[28px] max-sm:anim-sheet",
      )}
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-4 px-6 pt-6">
            <div>
              <h2 id={titleId} className="text-xl font-bold tracking-tight">{title}</h2>
              {description && <p id={descId} className="mt-1 text-sm text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 grid size-10 shrink-0 place-items-center rounded-full hover:bg-black/8"
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
