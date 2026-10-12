# Security model (Phase 5)

## Assets and who may do what
| Asset | Read | Write |
|---|---|---|
| `projects` row | its owner only | its owner only (RLS, direct from the browser) |
| `project_photos` row | its owner only | **server only** (service role), after validation |
| Storage objects (photos, previews) | its owner only, via short-lived signed URLs | **server only** |
| Anyone not signed in | nothing | nothing |

## Controls
1. **Ownership is never client-supplied.** `owner_id` defaults to `auth.uid()`; RLS requires it to equal `auth.uid()`; a trigger forbids changing it. The client does not send it (asserted by a test).
2. **Row-level security on every table**, privileges granted explicitly (`anon` gets nothing).
3. **Browsers cannot write to storage.** There are no storage insert/update/delete policies. Writes go through `/api/projects/[id]/media`, which: verifies the session with the auth server (`getUser`, not a cookie claim) → checks ownership through the caller's own RLS-scoped session (another user's project is indistinguishable from a missing one) → validates the bytes → then writes with the service role to a path built from the **verified** user id and project id only.
4. **Upload validation** (server side, never trusting the client): JPEG only for photos, PNG only for previews; magic bytes; truncation check; real dimensions parsed from the file; size caps (4 MiB / 2 MiB; also an early `Content-Length` rejection); EXIF/XMP/GPS/comment segments **stripped** (ICC and Adobe segments kept for colour); placement parsed strictly (finite numbers, convex usable quad, bounded brightness, unknown keys dropped). The database independently enforces path ownership, sizes and a structural placement check.
5. **Private bucket** with mime and size limits. Reads use signed URLs that expire.
6. **Service role key** is read only in server-only code (`server-only` import), is absent from the browser bundle (verified by searching the production build), and is not logged. The public anon key is expected to be public.
7. **Open redirect** protection on the sign-in callback (`safeNext`: same-site relative paths only).
8. **Errors** returned to browsers are generic; internals (SQL/stack) are never included (tested).
9. **No caching** of API responses (`Cache-Control: no-store`).
10. Abuse guards: 200 projects per account, bounded JSON sizes.

## How this is tested
* `src/db/__tests__/rls.test.ts` runs the **real migration** on a real Postgres engine (PGlite) with Supabase-style `auth`/`storage` stand-ins: owner/other-user/anon/service-role matrix for every operation, ownership transfer, constraints, cascades, storage folder tricks. I mutation-checked it: deliberately weakening five different policies each made tests fail.
* `src/server/__tests__/media.test.ts`: signed-out, other-user, malformed ids, path construction, invalid/hostile files (text, SVG with script, PNG as photo, truncated, oversized dimensions), metadata removal, no-orphan compensation, generic errors.
* `src/domain/project/__tests__`: strict validators.
* Route tests and a live production-server probe: unauthenticated requests → 401; traversal id → 401/404; oversized upload → 413; unconfigured → 503; callback with `//evil.com` → safe redirect.

## Not covered / known gaps (be aware)
* **Not run against a real Supabase project** (none available). The PGlite environment mimics Supabase but is not Supabase: see SETUP §4 for the smoke tests that close that gap.
* **No rate limiting** in the app (use the platform's), no CAPTCHA, no malware scanning (images are re-validated and metadata-stripped, but not decoded server-side for pixel-level re-encoding, since no image library is installed).
* The server strips metadata but does not re-encode, so a malicious file that is a structurally valid JPEG with hostile entropy data would be stored as-is; browsers decode it in a sandbox. Server-side re-encoding (e.g. `sharp`) is the next hardening step.
* Local development mode has **no access control at all** by design (it is the user's own browser storage).
* Email enumeration: the sign-in form uses generic messages, but Supabase's sign-up behaviour depends on your project's email-confirmation setting.
* Account deletion / data export (GDPR-style) flows are not built.
* Share links remain self-contained URLs (design only, **never photos**); they cannot be revoked. Revocable tokenised links and photo sharing are **not implemented** (they need an explicit opt-in design).


---
## Phase 7 additions
* **Security headers on every response (production):** `Content-Security-Policy` (default-src 'self'; no framing; no plugins; `connect-src`/`img-src` allow only the project's own Supabase origin when cloud mode is configured; `script-src` keeps `'unsafe-inline'` because of Next's inline bootstrap, a documented gap), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geolocation off), `Cross-Origin-Opener-Policy`; `X-Powered-By` removed. Tested as a pure function and on the live production server; the full app (photo, save, export) runs with **zero CSP violations**.
* **Secret audit in the build:** `npm run build` runs `audit:env` and fails if the browser bundle contains a configured secret's value, a Supabase `service_role` JWT, an `sb_secret_` key, or the service-key variable name, or if a client component reads a private variable. Demonstrated by planting a key in a bundle file (the build guard failed) and by tests.
* **Operator verification script** `supabase/verify/verify_security.sql` (15 checks, run after every migration). It is itself tested: it passes on the real migration and each of 8 deliberate weakenings makes it fail.
* **No-store** on every API reply (incl. early refusals); **health endpoint** exposes presence flags only; **post-deploy smoke test** `scripts/smoke.mjs` (12 checks) is safe to run against production.
* **Logging** is structured and redacted; client error reports are validated, size-capped (4 KB), rate-limited and stripped of query strings.

## Security checklist (tick before each release; evidence in RELEASE_CHECKLIST.md)
- [ ] Service key only in Vercel "Sensitive" variable; `audit:env OK` in the build log
- [ ] `verify_security.sql` all true on production
- [ ] Two-account isolation test passes on production data layer
- [ ] Bucket private, 4 MiB, jpeg+png only
- [ ] Auth: email confirmation on, SMTP configured, redirect URLs exact (no wildcards)
- [ ] Security headers present (`smoke.mjs`)
- [ ] Platform rate limiting / firewall rules configured for `/api/*`
- [ ] Backups/PITR on; restore rehearsed
- [ ] Privacy/Terms replaced with approved text
- [ ] Dependencies audited (`npm audit`), lockfile committed
- [ ] Nonce-based CSP considered (hardening backlog)
