# Architecture (proposed, v0.1)

## 1. Stack (per brief, with assessment)

| Layer | Choice | Assessment |
|---|---|---|
| Framework | Next.js (App Router), React, TypeScript `strict` | Good fit: SSR/ISR for marketing pages + SEO, route handlers for PDF/share, i18n routing. |
| Styling | Tailwind CSS + CSS variables for design tokens | Fine; tokens defined once, components consume them. |
| Data/auth/storage | Supabase (Postgres + RLS, Auth, Storage) | Fits accounts, projects, private photo storage with signed URLs. Alternative not needed. |
| Rendering | **three.js via react-three-fiber** for the door; 2D canvas/WebGL compositing for the photo | See §3. The reference itself uses three.js + GLB (V), which supports this. |
| State | Zustand (configurator) + TanStack Query (server state) | Small, typed, devtools; rules engine is pure functions outside React. |
| Validation | Zod schemas shared by client/server | One source for design-document validation. |
| i18n | `next-intl` | Localised path segments (`/en/viewer` ↔ `/fr/generateur`). |
| PDF | Server route using headless Chromium (or `@react-pdf/renderer`) | Decide in Phase 6 by output-quality spike. |
| Deploy | Vercel + Supabase cloud | Matches brief. |
| Tests | Vitest (unit), Playwright (e2e + visual + a11y via axe), pgTAP/SQL tests for RLS | |

Rejected for now: separate backend service, microservices, a CMS product (use Supabase tables + simple admin later).

## 2. Module layout (target)

```
src/
  app/[locale]/(marketing)/…        home, legal
  app/[locale]/configurator/…      the app shell
  app/[locale]/(account)/…         login, profile, projects
  app/s/[token]/…                  public shared view
  app/api/…                        share, pdf, upload-sign
  domain/
    catalogue/                     types, loaders (typed, Zod-validated)
    rules/                         compatibility engine (pure, 100% unit-tested)
    design/                        DesignDocument schema, migrations, serialise
  features/
    steps/                         step UI, option grids, search
    preview3d/                     r3f scene, door builder, materials
    scene/                         photo compositing, placement controls, perspective
    projects/ share/ pdf/ auth/
  components/ui/                   design-system primitives
  lib/                             supabase clients, env, analytics
docs/ …
supabase/migrations/ …
```

## 3. Rendering strategy (the main technical risk)

Two concerns, kept separate:

**A. Door visual.** Data-driven *door builder*: a `DesignDocument` → scene graph (frame, leaf/leaves, sidelites, transom, glass, handle, sill) with PBR materials. Three asset strategies (decision D-03):
1. **Procedural parametric** (original, no licence issues, fully ours; needs careful modelling for premium look).
2. **Licensed GLB library** (best fidelity, needs a rights holder; the reference does this with ~3,258 pre-baked combos — V).
3. **Layered pre-rendered images** (cheapest realism, huge asset count).
The builder interface is `buildDoor(design, catalogue) → Object3D`, so (1) can ship first and (2) can replace it per-model.

**B. Photo composite.** Render the door to a transparent canvas, then place into the photo with a homography (4-corner pin, user-adjustable) so doors fit slightly angled facades; adjust brightness/colour temperature from the photo's door-area sample. Mechanics in the reference are unverified (U); we implement move/scale/flip/reset first (V labels), perspective as F8.

Performance: lazy-load the 3D chunk, `OffscreenCanvas` where supported, Draco/Meshopt + KTX2, texture atlases, cap devicePixelRatio, dispose on unmount, WebGL context-loss recovery, 2D static fallback image when WebGL is unavailable.

## 4. Rules engine
Pure TypeScript. Input: current selections + catalogue constraints. Output: for each step, allowed option IDs plus reasons for disabled ones; and a *reconciliation* result when an upstream choice changes (keep compatible, mark incompatible, propose nearest). Catalogue constraints are authored as normalised rules (DATA_MODEL §3) rather than the reference's exploded combination table.

## 5. Persistence flow
Anonymous design lives in IndexedDB + URL-safe state; Save → account required → row in `designs` (versioned JSON document validated by Zod). Photos → private Storage bucket, signed URLs, EXIF stripped client-side and re-checked server-side.

## 6. Sharing
`shares` table with unguessable token, expiry/revoke, explicit `photo_public` consent flag recorded with timestamp. Public route reads via a Postgres function (security definer) that returns only the shared design — never open table access.

## 7. Security
- RLS on every table; tests prove cross-user denial.
- Secrets only in server env; no keys in client bundles except public anon key and restricted Maps key (HTTP-referrer restricted).
- Upload validation by magic bytes, size/dimension limits, re-encode image; no SVG uploads.
- Rate limiting on share/email/auth routes; CAPTCHA (Turnstile) on public email-sending; email header-injection safe templates.
- CSP, strict `Content-Security-Policy`, `Referrer-Policy`, CSRF-safe route handlers, dependency audit in CI, Dependabot.
- Share consent notice mirrors the reference's public-link disclosure (V).

## 8. Observability and quality gates (CI)
`tsc --noEmit`, ESLint (strict), Vitest, Playwright + axe, Lighthouse CI budgets, `npm audit`, bundle-size budget, Supabase migration lint.

## 9. Phase plan

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 1 | Audit, spec, architecture (this) | Docs reviewed; open questions ⛔ answered |
| 2 | Scaffold, tokens, CI, DB schema + RLS, seed catalogue (original placeholder data) | Type check/lint/tests green; RLS tests pass |
| 3 | Domain: catalogue loader, rules engine, DesignDocument, step UI without 3D | Rules 100% unit-covered; every step operable by keyboard |
| 4 | Door renderer (D-03 outcome) exterior + interior | All catalogue combos render; perf budget met |
| 5 | House preview: upload, gallery, placement, flip/reset, perspective | Photo flows tested on iOS Safari/Android Chrome |
| 6 | Accounts, projects, save, share, PDF, email | e2e journeys 1–3 pass; RLS tests |
| 7 | Hardening: a11y audit, i18n FR, perf, security review, deploy | Lighthouse ≥90, axe 0 serious, pen-test checklist |


---
## Phase 5 note
Persistence is behind `ProjectRepository` (`services/persistence`): `localRepository` (dev) / `cloudRepository` over `supabaseCloudApi`. Server code: `server/media.ts` (pure handlers with injected dependencies), `server/supabaseDeps.ts` (real wiring), `app/api/projects/**` (routes), `proxy.ts` (session refresh), `lib/supabase/{browser,server}.ts`, `lib/serverEnv.ts` (service key, `server-only`). Details: SETUP.md and SECURITY.md.
