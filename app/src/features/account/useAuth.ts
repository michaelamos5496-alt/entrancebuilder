"use client";

import { useEffect, useState } from "react";
import { isCloudConfigured } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/browser";

export type AuthState =
  | { status: "local" } // cloud not configured: there are no accounts in this mode
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; email: string };

/** Tracks the signed-in user in cloud mode. The server still verifies every request; this only drives the UI. */
export function useAuth(): AuthState {
  const cloud = isCloudConfigured();
  const [state, setState] = useState<AuthState>(cloud ? { status: "loading" } : { status: "local" });

  useEffect(() => {
    if (!cloud) return;
    let alive = true;
    let unsubscribe = () => {};
    const apply = (email: string | null | undefined) => alive && setState(email ? { status: "signedIn", email } : { status: "signedOut" });
    getBrowserClient().then(
      (client) => {
        if (!alive) return;
        void client.auth.getUser().then(({ data }) => apply(data.user?.email ?? (data.user ? "account" : null)), () => apply(null));
        const { data } = client.auth.onAuthStateChange((_e, session) => apply(session?.user ? (session.user.email ?? "account") : null));
        unsubscribe = () => data.subscription.unsubscribe();
      },
      () => apply(null),
    );
    return () => { alive = false; unsubscribe(); };
  }, [cloud]);

  return state;
}
