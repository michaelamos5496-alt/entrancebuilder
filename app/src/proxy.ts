import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "@/lib/env";

/**
 * Keeps the Supabase session fresh (refreshes expiring tokens and re-sets the cookie).
 * Does nothing when cloud mode is not configured. It never blocks a request: access control is enforced by
 * row-level security and by the route handlers, not by this file.
 */
export async function proxy(request: NextRequest) {
  const cfg = publicSupabaseConfig();
  if (!cfg) return NextResponse.next();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|gallery/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
