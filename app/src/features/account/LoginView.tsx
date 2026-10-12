"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/env";
import { AuthForm } from "./AuthForm";
import { useAuth } from "./useAuth";
import { Button } from "@/components/ui/Button";
import { getBrowserClient } from "@/lib/supabase/browser";

export function LoginView() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const auth = useAuth();

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-black tracking-tight">Your account</h1>
      <p className="mt-2 text-muted">Sign in to save projects to your account and open them on any device.</p>
      {params.get("error") === "callback" && (
        <p role="alert" className="mt-4 rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">That sign-in link didn&apos;t work or has expired. Please sign in again.</p>
      )}
      <div className="mt-6 rounded-lg bg-surface p-6 shadow-card">
        {auth.status === "signedIn" ? (
          <div>
            <p className="text-sm">Signed in as <strong>{auth.email}</strong>.</p>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => router.push(next)}>Continue</Button>
              <Button variant="secondary" onClick={() => void getBrowserClient().then((c) => c.auth.signOut())}>Sign out</Button>
            </div>
          </div>
        ) : (
          <AuthForm next={next} onSignedIn={() => router.push(next)} />
        )}
      </div>
    </div>
  );
}
