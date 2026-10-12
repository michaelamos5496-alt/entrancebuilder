"use client";

import { useId, useMemo, useState } from "react";
import { CATALOGUE } from "@/domain/catalogue";
import { encodeConfig } from "@/domain/engine/serialize";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { useToast } from "@/components/ui/Toast";
import { useConfigurator } from "./store";

/** Mounted only while open, so the consent checkbox always starts unticked. */
export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <ShareDialog onClose={onClose} /> : null;
}

function ShareDialog({ onClose }: { onClose: () => void }) {
  const open = true;
  const c = useConfigurator();
  const toast = useToast();
  const checkId = useId();
  const [consent, setConsent] = useState(false);
  const [origin] = useState(() => (typeof window === "undefined" ? "" : window.location.origin));

  const link = useMemo(() => (origin ? `${origin}/configurator?d=${encodeConfig(CATALOGUE, c.selections)}` : ""), [origin, c.selections]);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const title = c.savedName ?? "My door design";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied to your clipboard.", "success");
    } catch {
      toast("Couldn't copy automatically. Select the link and copy it manually.", "error");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share my door"
      description="Anyone with the link can open this exact design."
      variant="sheet"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <p className="rounded-md bg-canvas px-4 py-3 text-xs text-muted">
        The link contains your door&apos;s configuration, so it is visible to anyone who has it. Your house photo is never part of the link.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm">
        <input id={checkId} data-autofocus type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-ink" />
        I understand that anyone with the link will be able to see my design.
      </label>

      <label htmlFor={`${checkId}-link`} className="mt-5 block text-sm font-bold">Link</label>
      <input
        id={`${checkId}-link`}
        readOnly
        value={consent ? link : ""}
        placeholder="Tick the box above to create the link"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1.5 h-11 w-full rounded-md border border-line bg-canvas px-3 text-xs"
      />

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button disabled={!consent} onClick={copy}><Icon name="link" size={18} /> Copy link</Button>
        <a
          aria-disabled={!consent}
          href={consent ? `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`Take a look at my door design:\n\n${link}`)}` : undefined}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-surface px-5 text-sm font-bold hover:border-ink aria-disabled:pointer-events-none aria-disabled:opacity-40"
        >
          <Icon name="mail" size={18} /> Share by email
        </a>
        {canNativeShare && (
          <Button
            variant="secondary"
            className="sm:col-span-2"
            disabled={!consent}
            onClick={() => void navigator.share({ title, url: link }).catch(() => {})}
          >
            <Icon name="share" size={18} /> More ways to share…
          </Button>
        )}
      </div>
    </Modal>
  );
}
