# Deployment (Vercel + Supabase)

> **Status: not deployed.** No Vercel account, domain or Supabase project was available while building this, so nothing below has been executed against real services. The build, the production server, the smoke test and the security checks were all run locally against a production build (including a cloud-configured one with placeholder credentials). Do the steps, then run the verification section and record the results in `RELEASE_CHECKLIST.md`.

## 1. Prerequisites
* A Supabase project (see `SETUP.md` §1: URL, anon key, service-role key, email/SMTP settings, redirect URLs).
* A Vercel account and a Git repository containing the `app/` folder (a monorepo root is fine: set **Root Directory = `app`**).
* Node 20.19+ (Vercel's default is fine; `engines` is declared).

## 2. Database and storage (once, then per release)
1. Apply `app/supabase/migrations/*.sql` (SQL editor, or `supabase link` + `supabase db push`).
2. Run `app/supabase/verify/verify_security.sql` in the SQL editor: **every row must be `ok = true`.**
3. Migrations are forward-only. Never edit an applied migration; add a new file with a later timestamp.

## 3. Create the Vercel project
1. Import the repository. Framework preset: **Next.js** (`vercel.json` also sets it). Root Directory: `app`.
2. Add environment variables (Settings → Environment Variables) for **Production** and, if you want preview deployments to work, **Preview**: the three in `ENVIRONMENT.md`. Mark `SUPABASE_SERVICE_ROLE_KEY` **Sensitive**. Prefer a **separate Supabase project for Preview** so previews never touch production data.
3. Deploy. The build runs `npm run build`, which includes the secret audit; a leak fails the build.

## 4. Domain and Supabase URLs
1. Vercel → Project → Settings → Domains → add your domain. Use **exactly the DNS records Vercel shows** for your domain (apex vs `www`); do not copy values from other guides, they can change. HTTPS certificates are issued automatically once DNS resolves.
2. Supabase → Authentication → URL Configuration: **Site URL** = `https://<your-domain>`; **Redirect URLs** include `https://<your-domain>/auth/callback` (and the Vercel preview pattern only if you really use previews with auth).
3. Redeploy if you changed any `NEXT_PUBLIC_*` value (they are build-time).

## 5. Verify the deployment (do not skip)
```
node app/scripts/smoke.mjs https://<your-domain> --expect=cloud
```
All 12 checks must pass. Then complete `SETUP.md` §4 (two-account isolation test, private bucket, upload/reopen on a second device, no service key in the browser network tab) and the mobile pass in `RELEASE_CHECKLIST.md`. **Only after these pass is the deployment considered verified.**

## 6. Rollback
| Problem | Action |
|---|---|
| Bad release, database unchanged | Vercel → Deployments → previous good deployment → **Promote to Production** (instant rollback; no rebuild). Note `NEXT_PUBLIC_*` values are those of that deployment's build. |
| Bad release that included a migration | Roll the app back first. Migrations are additive and forward-only, so the previous app version normally still works with the new schema. If it does not, ship a **new** corrective migration; do not edit history. |
| Data damage | Restore from Supabase backup / point-in-time recovery (enable PITR on a paid plan *before* launch). |
| Leaked service key | Rotate immediately (`ENVIRONMENT.md`), redeploy, review storage and `project_photos` for unexpected changes, review logs. |
| Outage of this app only | `/api/health` for liveness; check Vercel deployment status and function logs. |

## 7. Routine maintenance
* **Weekly:** review logs for `server_error` / `client_error` / `api` events with 4xx/5xx (`OPERATIONS.md`).
* **Monthly:** `npm audit`, update dependencies (run the full CI, the e2e suite and `verify_security.sql` after each upgrade); check Supabase usage/limits; check backups exist and a restore has been rehearsed at least once.
* **After each Supabase or Next major upgrade:** re-run `SETUP.md` §4.
* **Storage hygiene:** deleting a user in the Supabase dashboard does **not** remove their files. Delete their projects through the app first, or periodically remove objects whose owner folder no longer exists.
* **Keys:** rotate the service-role key at least yearly and whenever someone with access leaves.
* **Legal text:** the privacy and terms pages are **placeholders** and must be replaced with approved text before launch.
