import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "@/lib/env";
import { serviceRoleKey } from "@/lib/serverEnv";

/** Acts as the signed-in user (reads the session cookie). Row-level security applies. */
export async function createUserClient(): Promise<SupabaseClient> {
  const cfg = publicSupabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a context that cannot set cookies; the proxy refreshes sessions */
        }
      },
    },
  });
}

/** Privileged client. Bypasses row-level security: use only AFTER the caller's ownership has been verified. Server only. */
export function createAdminClient(): SupabaseClient {
  const cfg = publicSupabaseConfig();
  if (!cfg) throw new Error("Supabase is not configured.");
  return createClient(cfg.url, serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
