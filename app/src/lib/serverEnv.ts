import "server-only";

/** Privileged credential. Imported only by server code (route handlers). The `server-only` import makes the build fail if a client component ever imports this file. */
export function serviceRoleKey(): string {
  if (typeof window !== "undefined") throw new Error("The service role key must never be read in the browser.");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set on the server.");
  return key;
}
