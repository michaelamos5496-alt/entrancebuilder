# Setup: from local development to production

## 0. Two modes (chosen automatically)

| Mode | When | Where projects live | Accounts |
|---|---|---|---|
| **Local development** | `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` empty | This browser only (localStorage + IndexedDB). Not an account, not backed up, not on other devices. The UI says so in the header badge, the save dialog and the projects page. | none |
| **Cloud** | both public values set | Your Supabase project: Postgres + private Storage bucket | Supabase Auth (email + password) |

`npm install && npm run dev` works with no configuration (local mode).

## 1. Create the Supabase project
1. Create a project at supabase.com (pick a region close to your users). Note the **Project URL**, the **anon (publishable) key** and the **service_role key** (Settings → API).
2. **Apply the schema.** Either paste `app/supabase/migrations/20261012000001_projects.sql` into the SQL editor and run it, or with the CLI: `supabase link --project-ref <ref>` then `supabase db push`.
   It creates `projects`, `project_photos`, row-level-security policies, privilege grants, triggers/constraints, and the **private** `project-media` bucket with its policies.
3. **Authentication → URL configuration**: set *Site URL* to your production URL and add *Redirect URLs*: `https://<your-domain>/auth/callback` (and `http://localhost:3000/auth/callback` for development).
4. **Authentication → Providers → Email**: enable. Decide whether to require email confirmation (recommended). Configure **SMTP** (Supabase's built-in mailer is rate-limited and only for testing).
5. **Authentication → Rate limits / Attack protection**: keep the defaults at least; consider CAPTCHA (Turnstile) for sign-up.

## 2. Configure the app
Set these in `app/.env.local` (development) and in your host's environment (production). See `app/.env.example`.

| Variable | Public? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://…supabase.co` (plain `http` is refused except for localhost) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | designed to be public; data is protected by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | **NO. server only** | used only by `/api/projects/**` after ownership is verified. The file uses the `server-only` guard so importing it from client code is meant to be a build error (that guard was not separately tested). Verified absent from the browser bundle by searching the production build. |

`NEXT_PUBLIC_*` values are inlined **at build time**: rebuild after changing them. If the public values are set but the service key is missing, the media routes answer `503 "Cloud storage is not configured on this server"` instead of failing mysteriously.

## 3. Deploy (Vercel)
Add the three variables for Production (and Preview if wanted), mark the service key as a secret (not exposed to the browser), deploy. The `proxy.ts` file refreshes sessions; no other infrastructure is needed.

## 4. Smoke tests to run once against the real project (NOT yet run: no project was available)
These cannot be proven by the automated tests, which use a local Postgres engine and fakes. Run them after setup:

1. **Sign-up / sign-in / sign-out** work; the confirmation email link lands on `/auth/callback` and signs you in.
2. **Save**: build a door with an uploaded photo → Save → the dialog says “Saved to your account”. In the dashboard: one row in `projects`, one in `project_photos`, objects under `project-media/<your user id>/<project id>/`.
3. **Reopen** on another browser/device: project, colours, photo and door placement come back.
4. **Isolation** (needs two accounts A and B). As B, in the SQL editor with B's JWT or via the API, try:
   `select * from projects` → only B's rows; `update projects set name='x' where id='<A's id>'` → 0 rows; open `/configurator?open=<A's id>` signed in as B → “That project no longer exists”.
   Storage: as B request a signed URL for A's object path → denied. `curl -X POST /api/projects/<A's id>/media` with B's session → 404.
5. **Anonymous**: `curl https://<ref>.supabase.co/rest/v1/projects -H "apikey: <anon>"` → `[]` or permission denied, never data.
6. **Private bucket**: opening `https://<ref>.supabase.co/storage/v1/object/public/project-media/<path>` → 400/404 (not public).
7. **Delete** a project in the UI → its files disappear from the bucket.
8. Confirm the browser dev-tools network tab never shows the service key.

## 5. Operating notes
* **Backups / PITR**: enable in Supabase (paid plans).
* **Deleting a user** from the Supabase dashboard cascades their rows but **not their storage objects** (storage is separate). Delete projects through the app first, or run a periodic cleanup of objects whose folder user no longer exists.
* **Rate limiting** of `/api/projects/**` is **not implemented** in the app. Use your host's firewall / rate limiting (e.g. Vercel Firewall) in production.
* Project count is capped at 200 per account by a database trigger; photos ≤ **4 MiB** (the hosting platform rejects request bodies over ~4.5 MB; the browser re-encodes to fit), JPEG only, ≤ 3200 px (bucket limits + server validation + table constraints). Previews are PNG ≤ 2 MiB.
