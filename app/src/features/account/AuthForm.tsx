"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { isCloudConfigured } from "@/lib/env";
import { getBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/cn";

type Mode = "signin" | "signup";

/** Map auth-server errors to messages that help without revealing whether an account exists. */
function friendly(message: string, mode: Mode): string {
  if (/fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  if (/invalid login|invalid credentials/i.test(message)) return "That email and password don't match.";
  if (/password/i.test(message) && mode === "signup") return "Choose a stronger password (at least 8 characters).";
  if (/rate|too many/i.test(message)) return "Too many attempts. Please wait a minute and try again.";
  if (/email/i.test(message) && /valid/i.test(message)) return "Enter a valid email address.";
  return mode === "signin" ? "We couldn't sign you in. Please try again." : "We couldn't create the account. Please try again.";
}

export function AuthForm({ next = "/designs", onSignedIn }: { next?: string; onSignedIn?: () => void }) {
  const id = useId();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isCloudConfigured()) {
    return (
      <p role="status" className="rounded-md bg-canvas px-4 py-3 text-sm text-muted">
        Accounts are off in local development mode. Add your Supabase settings to turn them on (see docs/SETUP.md).
      </p>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Your password needs at least 8 characters.");
    setBusy(true);
    try {
      const client = await getBrowserClient();
      if (mode === "signin") {
        const { error: err } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (err) return setError(friendly(err.message, mode));
        onSignedIn?.();
      } else {
        const { data, error: err } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (err) return setError(friendly(err.message, mode));
        if (data.session) onSignedIn?.();
        else setNotice("Almost done: check your email and follow the link to confirm your account, then come back and sign in.");
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = "mt-1.5 h-11 w-full rounded-md border border-line px-3 text-sm";
  return (
    <form onSubmit={submit} noValidate aria-label={mode === "signin" ? "Sign in" : "Create an account"}>
      <div role="tablist" aria-label="Account" className="mb-4 flex gap-1 rounded-full bg-canvas p-1">
        {(["signin", "signup"] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); setNotice(null); }}
            className={cn("flex-1 rounded-full px-4 py-2 text-sm font-bold", mode === m ? "bg-surface shadow-card" : "text-muted")}>
            {m === "signin" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-e`} className="text-sm font-bold">Email</label>
      <input id={`${id}-e`} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
      <label htmlFor={`${id}-p`} className="mt-4 block text-sm font-bold">Password</label>
      <input id={`${id}-p`} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm font-medium text-success">{notice}</p>}
      <Button type="submit" className="mt-5 w-full" loading={busy}>{mode === "signin" ? "Sign in" : "Create account"}</Button>
    </form>
  );
}
