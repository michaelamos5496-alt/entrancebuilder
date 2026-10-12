# Test Plan (v0.1, applies from Phase 2)

| Level | Tool | Scope | Gate |
|---|---|---|---|
| Static | `tsc --noEmit` (strict), ESLint, Prettier | all code | zero errors |
| Unit | Vitest | rules engine (property-based tests with fast-check: no reachable invalid state), DesignDocument parse/migrate, placement math, homography | rules 100% branch coverage |
| Component | Vitest + Testing Library | option grids, steps, modals, forms | no dead controls: every interactive element has a test asserting an effect |
| Database | pgTAP / SQL tests | RLS (user A cannot read/write user B; anon cannot list shares), cascade deletes, unique constraints | all pass |
| E2E | Playwright (Chromium, WebKit, Firefox; mobile viewports) | journeys: anonymous design→save→register; edit saved door; upload photo→place→flip→reset; share→open as stranger→copy; PDF download; FR locale | all pass in CI |
| Visual | Playwright screenshots | step panels, dialogs, shared view; 3D scene tolerance-based | reviewed diffs |
| Accessibility | axe-core in Playwright + manual keyboard/screen-reader pass | every page/state | 0 serious/critical |
| Performance | Lighthouse CI, WebGL frame-time probe | home, configurator | LCP <2.5 s, CLS <0.1, ≥30 fps on mid laptop |
| Security | `npm audit`, secret scan, upload fuzz (polyglots, huge dims, SVG, EXIF GPS), authz tests on every route handler | | no high findings |
| Manual device | iPhone Safari, mid Android Chrome | photo upload (HEIC), pinch/drag door | checklist signed |

## Phase 1 acceptance (this phase)
- [x] Repository inspected (empty folder; no prior project to preserve).
- [x] Reference audit with explicit V/I/U status.
- [x] Product spec with open questions.
- [x] Architecture, data model, test plan, decisions, status docs.
- [ ] **Open ⛔ questions answered and screenshots supplied — required before Phase 2 visual work.**
- Type checks/lint/tests: not applicable (no code written).


---
## Status after Phase 3
Implemented: Vitest unit tests for catalogue integrity, rules, reducer/state transitions (incl. seeded randomised sequences and mutation-checked), serialisation/migration; jsdom integration test that panel, product picker, summary and preview agree. Commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
Not yet implemented from this plan: Playwright E2E in CI, axe accessibility checks, Lighthouse budgets, RLS/database tests (no database yet), visual regression.


---
## Status after Phase 4
Added: 63 pure imaging tests (homography, warp incl. transparency/perspective/flip/AA/outside-quad, quad geometry and fit, lighting, file/EXIF/truncation validation, placement history). Mutation-checked.
Browser verification (Puppeteer + Chrome, scripts outside the repo): 7 real photographs plus 20+ generated edge cases (aspect ratios 3:1 to 2:3, dark/bright/night, 9000×6000, EXIF, GPS, bad files), interaction, lighting, interior, mobile touch, export.
Still to do: committed Playwright E2E, real-device and Safari/Firefox runs, performance budgets for large photos, visual-regression of the composite.


---
## Status after Phase 5
Added: real-Postgres RLS tests (PGlite) incl. mutation checks; server upload/ownership tests with a backend fake; strict media/placement validators; local and cloud repository tests (fake-indexeddb, failure injection); route-guard tests; environment/redirect tests. 276 tests total.
Browser verification (outside the repo): save/reopen/update/duplicate/rename/delete with photos, storage-full failure, export content analysis, production-server API probes, bundle secret scan.
Still to do: tests against a real Supabase (CLI + Docker or a test project), committed Playwright E2E, load/abuse testing of the upload route, real-device checks.


---
## Status after Phases 6-7
Committed browser tests (`npm run e2e`, 79): journey, accessibility (axe + keyboard), failures, performance (payload budget, leak detection, long tasks), responsive (5 viewports + states), security headers/CSP, operations endpoints + the post-deploy smoke script. Unit/integration: 325. Gate order for a release: typecheck → lint → unit → build (secret audit) → e2e → deploy → `smoke.mjs` → manual real-device checks (RELEASE_CHECKLIST).
Not covered: Safari/Firefox/real devices, screen readers, load testing, real Supabase integration tests, visual regression against the reference.
