# Threshold: entrance-door configurator

Docs live in `../docs/`. Start with `IMPLEMENTATION_STATUS.md`. Deploying: `DEPLOYMENT.md`, `ENVIRONMENT.md`, `RELEASE_CHECKLIST.md`.

```
npm install
npm run dev                  # local development mode: no setup, projects saved in this browser only
npm run typecheck && npm run lint
npm test                     # 325 tests, incl. row-level-security tests on a real Postgres engine (PGlite)
npm run build                # production build + automatic secret audit of the browser bundle
npm run e2e                  # 79 browser tests (Chrome) against the production build
node scripts/smoke.mjs URL   # post-deploy smoke test for any running instance
```

For accounts and cloud storage copy `.env.example` to `.env.local`, fill it in and apply `supabase/migrations/*.sql` (see `../docs/SETUP.md`).
