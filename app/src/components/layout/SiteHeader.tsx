"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/Icon";
import { AccountStatus } from "@/features/account/AccountStatus";

const NAV = [
  { href: "/configurator", label: "Create a door" },
  { href: "/designs", label: "My designs" },
] as const;

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2.5 text-lg font-bold tracking-tight", className)} aria-label="Threshold home">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="7" fill="var(--color-brand)" />
        <rect x="9" y="6" width="10" height="16" rx="1.5" fill="#fff" />
        <circle cx="16.8" cy="14.5" r="1.1" fill="var(--color-brand)" />
      </svg>
      Threshold
      <span aria-hidden className="hidden h-5 w-px bg-line sm:block" />
      <span className="hidden text-sm font-medium text-muted sm:block">Entrance builder</span>
    </Link>
  );
}

export function SiteHeader() {
  const path = usePathname();
  // The menu is "open" only for the page it was opened on, so navigating closes it.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === path;

  return (
    <header className="no-print sticky top-0 z-40 h-[var(--header-h)] px-3 pt-3 sm:px-4">
      <div className="glass mx-auto flex h-14 max-w-[1600px] items-center justify-between rounded-full pl-5 pr-3 sm:pl-6 sm:pr-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path.startsWith(n.href) ? "page" : undefined}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold tracking-tight transition-colors hover:bg-black/5",
                path.startsWith(n.href) ? "bg-black/[0.07] text-ink" : "text-ink/80",
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden sm:block"><AccountStatus /></div>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-full hover:bg-black/5 sm:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpenPath(open ? null : path)}
        >
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Main" className="anim-rise glass-strong absolute inset-x-3 top-[calc(100%-4px)] rounded-3xl p-3 sm:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-2xl px-4 py-3.5 text-base font-semibold hover:bg-black/5">
              {n.label}
            </Link>
          ))}
          <div className="px-4 py-3"><AccountStatus /></div>
        </nav>
      )}
    </header>
  );
}
