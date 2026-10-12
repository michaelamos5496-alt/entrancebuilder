# Release checklist

Copy this list into the release ticket and tick it for **every** release. Items marked ★ are blockers.

## A. Before merging (automated; also run by `.github/workflows/ci.yml`)
- [ ] ★ `npm run typecheck`, `npm run lint`: clean
- [ ] ★ `npm test` (unit + real-Postgres RLS tests): all pass
- [ ] ★ `npm run build`: succeeds **and** prints `audit:env OK`
- [ ] ★ `npm run e2e` (production build, Chrome): all pass
- [ ] No new `npm audit` high/critical advisories (or each is assessed and recorded)
- [ ] If the schema changed: new migration file (never an edited one) **and** `verify_security.sql` + RLS tests updated

## B. Configuration
- [ ] ★ Vercel Production has all three variables (`ENVIRONMENT.md`); service key marked Sensitive
- [ ] Preview uses a **separate** Supabase project (or has no cloud variables)
- [ ] Supabase: Site URL and redirect URLs match the domain; SMTP configured; email confirmation setting decided
- [ ] ★ Migrations applied to production; ★ `verify_security.sql`: every row `ok = true`
- [ ] Backups/PITR enabled; a restore has been rehearsed at least once
- [ ] Privacy and Terms pages contain **approved legal text** (currently placeholders)

## C. Deploy and verify (record the evidence)
- [ ] ★ `node app/scripts/smoke.mjs https://<domain> --expect=cloud`: all pass → paste output
- [ ] ★ Two-account isolation test (`SETUP.md` §4.4) passes
- [ ] ★ Sign-up → confirm email → sign in → save with photo → open on a **second device** → restored
- [ ] Private bucket check: public URL of an object fails
- [ ] Browser network tab: the service key never appears
- [ ] Export PNG downloads and contains the door and caption
- [ ] Failure paths on the live site: invalid file, offline save, expired session (sign out in another tab, then save)
- [ ] **Mobile on real devices**: iPhone Safari and Android Chrome: upload a camera photo, place the door by touch, save, reopen
- [ ] Safari and Firefox desktop pass over the main journey (not covered by automated tests)
- [ ] Screen-reader pass (VoiceOver or NVDA) of: option selection, save dialog, photo placement by keyboard

## D. After release
- [ ] Uptime monitor on `/api/health` green; log review for 24 h (`OPERATIONS.md`)
- [ ] Note the deployment URL/commit and how to roll back (`DEPLOYMENT.md` §6)
