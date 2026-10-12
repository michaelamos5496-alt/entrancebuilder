"use client";

import Link from "next/link";
import { getBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "./useAuth";

/** Header indicator. In local development mode it says so plainly; in cloud mode it shows the account. */
export function AccountStatus() {
  const auth = useAuth();
  if (auth.status === "local") {
    return (
      <span title="Projects are saved in this browser only. Add Supabase settings to use accounts and cloud storage." className="rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">
        Local mode
      </span>
    );
  }
  if (auth.status === "loading") return <span className="w-16" aria-hidden />;
  if (auth.status === "signedOut") return <Link href="/login" className="rounded-md px-3 py-2 text-sm font-bold hover:bg-canvas">Sign in</Link>;
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="hidden max-w-[10rem] truncate text-muted lg:inline" title={auth.email}>{auth.email}</span>
      <button type="button" onClick={() => void getBrowserClient().then((c) => c.auth.signOut())} className="rounded-md px-3 py-2 font-bold hover:bg-canvas">Sign out</button>
    </span>
  );
}
