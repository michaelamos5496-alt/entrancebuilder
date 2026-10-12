# Environment variables

All configuration is through environment variables. **No credential is stored in the repository.** `app/.env.example` documents them; `app/.env.local` (git-ignored) holds your own values in development.

| Variable | Required | Browser-visible? | Where to get it | What it does |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for cloud mode | **yes** | Supabase → Project Settings → API → Project URL | Switches the app from local development mode to cloud mode (together with the next variable). Must be `https://` (plain `http` accepted only for `localhost`). Also whitelisted in the Content-Security-Policy. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for cloud mode | **yes** (by design) | same page → anon / publishable key | Lets browsers talk to Supabase **as the signed-in user**. It has no power of its own: row-level security decides what is visible. |
| `SUPABASE_SERVICE_ROLE_KEY` | for cloud mode | **NO. server only** | same page → service_role key | Used only by `/api/projects/**` to write photos/previews after the caller's ownership has been verified. **Bypasses row-level security.** Mark it "Sensitive" in Vercel; never prefix with `NEXT_PUBLIC_`. |
| `VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA` | automatic | no | provided by Vercel | Reported (version only) by `/api/health` and logs. |
| `NODE_ENV` | automatic | n/a | set by Next | production vs development behaviour (CSP/HSTS only in production). |

**Modes**
* Both public values empty → **local development mode** (projects in the browser only; labelled in the UI).
* Both set → **cloud mode**. If the service key is missing the project APIs answer `503`, and `/api/health` shows `serviceKeyConfigured: false`.

**Build-time vs run-time:** `NEXT_PUBLIC_*` values are baked into the browser bundle **at build time**. Changing them requires a new build/deployment. `SUPABASE_SERVICE_ROLE_KEY` is read at run time on the server.

**Guards**
* `npm run audit:env` (also runs automatically after every `npm run build`) fails the build if: the app reads an undeclared variable; a client component reads a private variable; a `NEXT_PUBLIC_` name looks like a secret; or the browser bundle contains the value of a configured secret, a Supabase `service_role` JWT, an `sb_secret_…` key, or the service-key variable name.
* The privileged key lives in `src/lib/serverEnv.ts`, which imports `server-only`.

**Rotation:** to rotate the service key, create the new key in Supabase, update the Vercel variable, redeploy, then revoke the old key. To rotate the anon key, update the variable and **rebuild** (it is inlined).
