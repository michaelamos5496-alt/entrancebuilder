/**
 * Environment access in one place.
 *  - NEXT_PUBLIC_* values are safe to ship to the browser (the anon key is designed to be public; row-level security protects data).
 *  - The privileged service key is NOT here: it lives in serverEnv.ts so it can never be bundled for the browser.
 */
export interface SupabasePublicConfig {
  url: string;
  anonKey: string;
}

export function publicSupabaseConfig(): SupabasePublicConfig | null {
  // each reference must be written out so Next can inline it into the browser bundle
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null; // never send credentials over plain http to a remote host
  } catch {
    return null;
  }
  return { url, anonKey };
}

export const isCloudConfigured = (): boolean => publicSupabaseConfig() !== null;

/** Only allow same-site relative redirects (prevents open redirects after sign-in). */
export function safeNext(next: string | null | undefined, fallback = "/designs"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
