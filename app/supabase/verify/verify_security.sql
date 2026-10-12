-- Run in the Supabase SQL editor AFTER applying the migration (and again after every migration).
-- Every row must show ok = true. Any false means the database does not match the security model in docs/SECURITY.md.
with checks(name, ok, detail) as (
  select 'RLS enabled on public.projects',
         coalesce((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), false), null
  union all select 'RLS enabled on public.project_photos',
         coalesce((select relrowsecurity from pg_class where oid = 'public.project_photos'::regclass), false), null
  union all select 'projects: owner-only select/insert/update/delete policies exist',
         (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'projects' and 'authenticated' = any(roles)), null
  union all select 'projects: no policy applies to anon or public',
         not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('projects', 'project_photos') and (roles && array['anon', 'public']::name[])), null
  union all select 'project_photos: ONLY a select policy exists (browsers cannot write)',
         (select count(*) = 1 and bool_and(cmd = 'SELECT') from pg_policies where schemaname = 'public' and tablename = 'project_photos'), null
  union all select 'anon has no privileges on projects / project_photos',
         not has_table_privilege('anon', 'public.projects', 'select') and not has_table_privilege('anon', 'public.project_photos', 'select'), null
  union all select 'authenticated cannot write project_photos',
         not has_table_privilege('authenticated', 'public.project_photos', 'insert, update, delete'), null
  union all select 'authenticated can read/write projects',
         has_table_privilege('authenticated', 'public.projects', 'select, insert, update, delete'), null
  union all select 'bucket project-media exists and is PRIVATE',
         exists (select 1 from storage.buckets where id = 'project-media' and public = false), null
  union all select 'bucket limits: 4 MiB, jpeg+png only',
         exists (select 1 from storage.buckets where id = 'project-media' and file_size_limit = 4194304 and allowed_mime_types @> array['image/jpeg', 'image/png'] and cardinality(allowed_mime_types) = 2), null
  union all select 'storage.objects: no insert/update/delete policy mentions project-media (browsers cannot write files)',
         not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%project-media%'), null
  union all select 'storage.objects: read policy for project-media is owner-folder scoped',
         exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and qual ilike '%project-media%' and qual ilike '%foldername%' and qual ilike '%auth.uid()%'), null
  union all select 'owner_id cannot be changed (trigger present)',
         exists (select 1 from pg_trigger where tgrelid = 'public.projects'::regclass and tgname = 'projects_protect_owner' and not tgisinternal), null
  union all select 'per-account project limit trigger present',
         exists (select 1 from pg_trigger where tgrelid = 'public.projects'::regclass and tgname = 'projects_limit' and not tgisinternal), null
  union all select 'path-ownership constraints present',
         (select count(*) = 2 from pg_constraint where conname in ('project_photos_path_owned', 'projects_preview_path_owned')), null
)
select name, ok, detail from checks order by ok, name;
