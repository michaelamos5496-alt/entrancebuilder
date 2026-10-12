-- Threshold: saved projects, project photos, private storage.
-- Target: Supabase (Postgres 15+). Run with `supabase db push` or paste into the SQL editor.
--
-- Security model
--   * Row Level Security is ON for every table. A user can only ever see and change their own rows.
--   * Ownership is never taken from the client: `owner_id` defaults to auth.uid() and RLS requires it to equal auth.uid().
--   * `owner_id` cannot be changed after creation (trigger).
--   * Clients can create/update/delete `projects` directly (RLS enforced).
--   * Clients can only READ `project_photos` and storage objects. Photo/preview bytes are written by the
--     server route (`/api/projects/[id]/media`) after content validation, using the service role key.
--     That key never reaches the browser.
--   * Anonymous visitors have no access to anything.

-- Structural validation of a placement document (defence in depth; the server validates geometry too).
create or replace function public.is_valid_placement(p jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'quad') = 'array' and jsonb_array_length(p -> 'quad') = 4
     and not exists (
       select 1 from jsonb_array_elements(p -> 'quad') q
       where jsonb_typeof(q) <> 'object'
          or jsonb_typeof(q -> 'x') <> 'number' or jsonb_typeof(q -> 'y') <> 'number'
          or (q ->> 'x')::numeric not between -0.2 and 1.2 or (q ->> 'y')::numeric not between -0.2 and 1.2
     )
     and jsonb_typeof(p -> 'flip') = 'boolean' and jsonb_typeof(p -> 'perspective') = 'boolean'
     and jsonb_typeof(p -> 'matchLighting') = 'boolean' and jsonb_typeof(p -> 'shadow') = 'boolean'
     and jsonb_typeof(p -> 'brightness') = 'number' and (p ->> 'brightness')::numeric between -50 and 50
$$;

-- `scene` holds non-file scene data: which sample-gallery photo is shown and where the door sits on it.
-- Uploaded photos are NOT here; they live in project_photos + private storage.
create or replace function public.is_valid_scene(s jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(s) = 'object'
     and not exists (select 1 from jsonb_object_keys(s) k where k not in ('exterior', 'interior'))
     and not exists (
       select 1 from jsonb_each(s) e
       where jsonb_typeof(e.value) <> 'object'
          or e.value ->> 'kind' is distinct from 'gallery'
          or coalesce(e.value ->> 'galleryId', '') !~ '^[a-z0-9-]{1,40}$'
          or not public.is_valid_placement(e.value -> 'placement')
     )
$$;

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  document         jsonb not null,
  schema_version   smallint not null default 2,
  catalogue_version text not null,
  scene            jsonb not null default '{}'::jsonb,
  preview_path     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint projects_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint projects_document_shape check (
    jsonb_typeof(document) = 'object' and document ? 'product' and document ? 'schemaVersion'
  ),
  constraint projects_document_size check (pg_column_size(document) <= 16384),
  constraint projects_scene_valid check (public.is_valid_scene(scene) and pg_column_size(scene) <= 4096),
  constraint projects_preview_path_owned check (
    preview_path is null or preview_path like owner_id::text || '/' || id::text || '/%'
  )
);

-- one name per owner, case-insensitive (matches what the UI enforces)
create unique index projects_owner_name_key on public.projects (owner_id, lower(btrim(name)));
create index projects_owner_updated_idx on public.projects (owner_id, updated_at desc);

create table public.project_photos (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  owner_id     uuid not null references auth.users (id) on delete cascade,
  view         text not null,
  storage_path text not null,
  width        integer not null,
  height       integer not null,
  bytes        integer not null,
  placement    jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint project_photos_view check (view in ('exterior', 'interior')),
  constraint project_photos_size check (width between 200 and 3200 and height between 200 and 3200),
  constraint project_photos_bytes check (bytes between 1 and 4194304), -- 4 MiB: keeps uploads under the ~4.5 MB serverless request limit
  -- a file can only live inside its owner's own project folder
  constraint project_photos_path_owned check (storage_path like owner_id::text || '/' || project_id::text || '/%'),
  constraint project_photos_placement check (public.is_valid_placement(placement)),
  constraint project_photos_one_per_view unique (project_id, view)
);

-- ---------------------------------------------------------------- triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.protect_owner() returns trigger language plpgsql as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

-- abuse guard: a bounded number of projects per account
create or replace function public.limit_projects_per_owner() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.projects where owner_id = new.owner_id) >= 200 then
    raise exception 'project limit reached' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger projects_protect_owner before update on public.projects for each row execute function public.protect_owner();
create trigger projects_limit before insert on public.projects for each row execute function public.limit_projects_per_owner();
create trigger project_photos_touch before update on public.project_photos for each row execute function public.touch_updated_at();
create trigger project_photos_protect_owner before update on public.project_photos for each row execute function public.protect_owner();

-- ---------------------------------------------------------------- row level security
alter table public.projects enable row level security;
alter table public.project_photos enable row level security;

create policy projects_select_own on public.projects for select to authenticated using (owner_id = auth.uid());
create policy projects_insert_own on public.projects for insert to authenticated with check (owner_id = auth.uid());
create policy projects_update_own on public.projects for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy projects_delete_own on public.projects for delete to authenticated using (owner_id = auth.uid());

-- photos: read-only for the owner. Writes happen server-side (service role) after validating the file.
create policy project_photos_select_own on public.project_photos for select to authenticated using (owner_id = auth.uid());

-- ---------------------------------------------------------------- privileges (explicit; do not rely on defaults)
revoke all on public.projects, public.project_photos from anon, authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select on public.project_photos to authenticated;
grant all on public.projects, public.project_photos to service_role;

-- ---------------------------------------------------------------- storage (private bucket)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', false, 4194304, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A signed-in user may read objects under their own folder only: <owner uuid>/<project uuid>/<file>.
-- There are deliberately NO insert/update/delete policies: browsers cannot write to storage at all.
create policy project_media_select_own on storage.objects for select to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text);
