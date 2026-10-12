import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * A real Postgres (PGlite, WASM) with a minimal stand-in for the parts of Supabase our migration touches:
 * the `auth` schema (users + auth.uid() reading the JWT claim exactly as PostgREST sets it), the three API roles,
 * and the `storage` schema (buckets, objects with RLS, storage.foldername).
 * The migration under test is the REAL file from supabase/migrations.
 */
const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
grant select on storage.buckets to authenticated, service_role;
`;

export const USER_A = "11111111-1111-4111-8111-111111111111";
export const USER_B = "22222222-2222-4222-8222-222222222222";

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SHIM);
  const dir = path.join(process.cwd(), "supabase", "migrations");
  for (const f of fs.readdirSync(dir).sort()) await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  await db.exec(`insert into auth.users (id, email) values ('${USER_A}', 'a@example.com'), ('${USER_B}', 'b@example.com');`);
  return db;
}

/** Run `fn` as an API role the way PostgREST does: SET ROLE + JWT claim. Always resets afterwards. */
export async function as<T>(db: PGlite, who: "anon" | "service_role" | { user: string }, fn: () => Promise<T>): Promise<T> {
  const role = typeof who === "string" ? who : "authenticated";
  const sub = typeof who === "string" ? "" : who.user;
  await db.exec(`select set_config('request.jwt.claim.sub', '${sub}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

export const DOC = { schemaVersion: 2, product: "haven", layout: "single" };
export const PLACEMENT = {
  quad: [{ x: 0.3, y: 0.2 }, { x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }, { x: 0.3, y: 0.8 }],
  flip: false, perspective: false, matchLighting: true, brightness: 0, shadow: true,
};
