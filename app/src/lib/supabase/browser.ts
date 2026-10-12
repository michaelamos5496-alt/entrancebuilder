"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "@/lib/env";

let client: Promise<SupabaseClient> | null = null;

/**
 * Browser client using the public anon key; every query is subject to row-level security.
 * Loaded on demand (dynamic import) so visitors in local development mode never download the Supabase library.
 */
export function getBrowserClient(): Promise<SupabaseClient> {
  const cfg = publicSupabaseConfig();
  if (!cfg) return Promise.reject(new Error("Supabase is not configured."));
  client ??= import("@supabase/ssr").then(({ createBrowserClient }) => createBrowserClient(cfg.url, cfg.anonKey));
  return client;
}
