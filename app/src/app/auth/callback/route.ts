import { NextResponse } from "next/server";
import { safeNext } from "@/lib/env";
import { createUserClient } from "@/lib/supabase/server";

/** Completes email-confirmation / magic-link sign-in: exchanges the one-time code for a session cookie. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));
  if (code) {
    try {
      const supabase = await createUserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL(next, url.origin));
    } catch {
      /* fall through to the error redirect */
    }
  }
  return NextResponse.redirect(new URL("/login?error=callback", url.origin));
}
