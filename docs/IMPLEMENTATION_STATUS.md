# Implementation Status

Last updated: 2026-10-12

## Phases 6 and 7: QA, accessibility, performance, and production preparation: **READY TO DEPLOY, NOT DEPLOYED**

**There is no deployment.** No Vercel account, domain, or Supabase project was available, and none was invented. What exists is a production build that passes every check that can be run without those services, plus the exact procedure (`DEPLOYMENT.md`), checklist (`RELEASE_CHECKLIST.md`), and a post-deploy smoke test (`app/scripts/smoke.mjs`) to prove a real deployment. **Do not treat the product as launched until the "verify the deployment" steps pass on the real URL.**

| Document | Purpose |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | step-by-step deploy, domain, **rollback**, maintenance |
| [ENVIRONMENT.md](ENVIRONMENT.md) | every variable, visibility, rotation, build-time vs run-time |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | per-release gate list |
| [OPERATIONS.md](OPERATIONS.md) | logging, health, alerting, hardening backlog |
| [SECURITY.md](SECURITY.md) | controls, tests, **security checklist** |
| [QA_REPORT.md](QA_REPORT.md) | prioritised defect list: 7 high fixed, 7 medium/low fixed, open items |
| [SETUP.md](SETUP.md) | Supabase setup and real-service smoke tests |

### Final test results (run on the final production build)
| Check | Result |
|---|---|
| `tsc --noEmit`, `eslint` | clean |
| Unit / integration (`npm test`) | **325 tests, 20 files, all pass** (incl. 49 real-Postgres RLS, limits and verify-script tests and 48 environment, secret-audit, logging and security-header tests) |
| Browser end-to-end (`npm run e2e`, Chrome, production build) | **79 tests, 7 spec files, all pass, run twice with no flakiness**: journey 3, accessibility 18, failures 15, performance 8, responsive 26 (5 viewport sizes), security 5, operations 4 |
| `npm run build` | succeeds; `postbuild` secret audit **OK** (20 browser-delivered files scanned) |
| Cloud-configured production build (placeholder credentials) | builds; server runs; **smoke test 12/12**; service key absent from browser files; a planted key made the build guard **fail**, removing it made it pass |
| Local-mode production server | smoke test 12/12 |
| Accessibility | axe WCAG 2.2 AA + best practice: 0 critical/serious on every page and key state; keyboard-only journeys pass |
| Performance | 205 KB gzip JS per page (budget 215); 0 long tasks while dragging; 7000×5000 photo shown in ≈0.7 s; no canvas/image leaks after 12 photo swaps |

### What changed in these phases
* **Phase 6 fixes (details in QA_REPORT):** edits lost on refresh after a preset/share link; hidden reset notices; focus hidden under sticky bars on phones; cramped photo mode on phones; cookie banner covering controls; invalid summary markup; heading structure; contrast; no-store on all API replies; label covering handles; lazy-loaded Supabase library (−65 KB).
* **Phase 7 additions:** photo cap lowered to 4 MiB to fit the hosting request limit (code, database and bucket kept consistent by a test; browser re-encodes to fit); security headers and CSP; secret audit wired into the build; `supabase/verify/verify_security.sql` (tested, including failure detection); structured redacted logging, server-error capture, client error reporter, `/api/health`; `vercel.json`; `scripts/smoke.mjs`; CI workflow; deployment/ops/release docs.

### Known limitations
* **Not deployed; cloud mode never run against a real Supabase** (see Phase 5 caveat). Everything cloud-side is tested with a real Postgres engine for the security rules and with fakes/placeholders elsewhere.
* Visual fidelity to the reference design **could not be checked** (no reference screenshots). The door image is a schematic stand-in, not product photography; all previews/exports say so.
* Only Chrome was tested (plus mobile-size emulation). Safari, Firefox and real phones are untested.
* No manual screen-reader testing.
* Legal pages are placeholder text. Share links are design-only and cannot be revoked. No PDF generation beyond the browser print dialog. No account-deletion/data-export flow.
* No third-party error tracking or alert rules are configured (documented how).

### Remaining production risks (highest first)
1. **Unverified live integration** with Supabase Auth, Postgres, Storage and Vercel (session cookies, signed URLs, email delivery, CSP against the real Supabase origin, function limits). Mitigation: SETUP §4 + smoke test + two-account test **before** announcing.
2. **Cross-browser/device gaps** (Safari/iOS canvas and touch behaviour especially).
3. **No rate limiting / abuse protection** beyond best-effort in-memory limits: configure the platform firewall.
4. **CSP allows inline scripts** (no nonces yet).
5. **Placeholder legal copy** and no data-export/deletion flow: a compliance risk in regulated regions.
6. **Orphaned storage objects** if users are deleted from the dashboard.
7. **Uploaded images are validated and stripped of metadata but not re-encoded server-side.**
8. **Last-write-wins** if one project is edited on two devices.
9. Backups/PITR are an operator task (not configured here).

### Exact next step
Provide a Vercel account/repository and a Supabase project (or run the steps yourself), follow `DEPLOYMENT.md`, run the smoke test against the real URL and the real-device checks in `RELEASE_CHECKLIST.md`, and send me anything that fails. Separately, still needed from earlier phases: reference screenshots, the catalogue/door-asset decision (D-03).

### Run it
```
cd app
npm install
npm run dev                      # local development mode
npm run typecheck && npm run lint && npm test
npm run build && npm run e2e     # production build + 79 browser tests
node scripts/smoke.mjs <url>     # against any running instance
```

---

## Phase 5 — Persistence, projects and export: **COMPLETE in local development mode; cloud mode is implemented and tested against a real Postgres engine and fakes, but has NOT been run against a real Supabase project**

Exact production setup: **[SETUP.md](SETUP.md)** · security model, controls, tests and gaps: **[SECURITY.md](SECURITY.md)**.

### The caveat (read first)
**No Supabase project, credentials, Docker or local Postgres were available.** So:
- **Local development mode is fully working and verified in a real browser.** It is clearly labelled everywhere ("Local mode" badge, save dialog, projects page, success message): saved in *this browser only*, not an account, not backed up.
- **Cloud mode** (Supabase Auth + Postgres + private Storage) is implemented and its **security rules were executed on a real Postgres engine (PGlite)** using the actual migration file, with Supabase-style `auth`/`storage` stand-ins. The server upload logic and the cloud repository logic were tested with fakes; the real API routes were exercised on a production server build. **What remains unproven is the live integration**: supabase-js query shapes, sign-up emails, session cookies, signed-URL downloads, and differences between PGlite's stand-ins and real Supabase. SETUP.md §4 lists the smoke tests to run once credentials exist. The app never claims "saved to your account" unless the cloud repository actually performed the save.

### Delivered
- **Schema and migration** (`app/supabase/migrations/20261012000001_projects.sql`): `projects` (id, owner, name, versioned configuration `document`, `scene`, preview path, created/updated timestamps), `project_photos`, constraints (name rules, document shape/size, path-ownership, dimensions, structural placement validation), triggers (updated_at, immutable owner, 200 projects per account), RLS on both tables, explicit privilege grants, and a **private** `project-media` bucket with size/type limits and owner-only read policy.
- **Persistence layer** with one interface and two implementations (`services/persistence/`): local development store (localStorage + IndexedDB, atomic with rollback on quota errors, non-destructive import of Phase 2 saves) and cloud store (Supabase). The UI chooses by configuration and never mislabels which one it is using.
- **Saved projects**: save, **reopen** (configuration, photos, door placement), update in place (a stored photo is kept, not re-uploaded), save as new, rename, duplicate (with photos), delete (removes every stored file), unique names, preview thumbnails in the list.
- **Secure image storage**: photos and previews are written only by the server route `/api/projects/[id]/media` after validation (JPEG/PNG magic bytes, truncation, real dimensions, size caps, metadata stripping, strict placement parsing); browsers have no storage write access at all; reads use signed URLs.
- **Authentication** only where the scope requires it: Supabase email/password sign-in and sign-up (inline in the save dialog, on `/login`, header status), email-confirmation callback with open-redirect protection, session refresh in `proxy.ts`. None of it is active in local mode.
- **Exports**: the Phase 4 PNG download (photo + door + honesty caption), plus a saved preview thumbnail generated from what the user sees.
- **Sharing**: unchanged and unchanged in scope. Share links remain self-contained design-only URLs (never photos). Revocable server-side links and photo sharing are **not implemented** (they need an explicit opt-in flow).

### Verification
| Check | Result |
|---|---|
| `npm test` | **276 tests, 15 files, all pass** (≈4 s). New this phase: 34 database/RLS, 33 server-side media + placement validation, 28 upload-handler (ownership), 32 repository (local 16 / cloud 16), 14 environment/redirect, 6 route-guard |
| `tsc --noEmit`, `eslint`, `next build` | pass, 0 warnings (also builds in cloud configuration) |
| **RLS on a real Postgres engine** | owner/other user/anon/service-role for every operation; ownership transfer blocked; constraints; cascades; storage folder tricks; browsers cannot write storage. **Mutation-checked**: weakening five different policies (client-trusted owner, leaky select, anon grant, storage write policy, ignored folder check) each made tests fail. |
| Real-browser persistence run (local mode, 33 checks) | save with photo → full reload → list shows preview + “1 photo” → reopen restores product, colours, perspective, flip and **all four door corners exactly**; composited door pixel count identical (48166 → 48166); update keeps the photo file; duplicate/taken names refused with the dialog and work intact; **simulated full storage → clear error, nothing claimed saved, no orphaned files**; rename/duplicate/delete; deleting leaves zero stored files; console clean |
| Export content check (analysed the downloaded PNG) | same size/aspect as the photo; door drawn inside the doorway (red-dominant, differs strongly from the photo there); rest of the photo preserved (mean abs diff 7.4 of 765 per pixel against a resampled copy of the original, 2.6% of pixels differing >30, partly resampling and JPEG noise); caption band present |
| Live production server (cloud config, placeholder credentials) | no session → 401 on every API route; traversal id rejected; 11 MB upload → 413; sign-in callback with a bad code and with `next=//evil.com` → safe redirect to `/login`; public settings present but no server key → 503 (this was a crash before; fixed) |
| Secrets in the browser bundle | the service key value is absent from `.next/static`; the public anon value is present, as intended |
| Earlier suites re-run after the refactor | Phase 3 flow, Phase 4 real-photo / failure / lighting / mobile suites all still pass |

### Defects found and fixed in this phase
1. Media routes crashed with an unexplained 500 when the public settings existed but the server key did not → clear 503 (+ tests).
2. Toasts I had moved to the side panel could intercept clicks on options → now click-through.
3. The privileged-key helper sat in a file shipped to browsers → moved to a `server-only` file.
4. Test-side: a hung run (a stray `cat` waiting for stdin), a wrong-project rename, an over-strict DB timestamp comparison, and (as before) one download check that is unreliable inside the long interaction script but passes in isolation.

### Honest limits / not verified
- **Cloud mode never ran against real Supabase** (see the caveat). Treat it as untested integration until SETUP §4 is done.
- No rate limiting, CAPTCHA or malware scanning in the app; the server strips metadata but does not re-encode images (no image library installed): see SECURITY.md.
- Deleting a user in the Supabase dashboard leaves their storage objects behind (cascade covers rows only).
- No account deletion/data export flow. No two-device sync in local mode (by definition).
- Photos are saved as JPEG ≤3000 px; uploaded originals are not kept.
- Local-mode access control is none (it is the user's own browser).
- The exported PNG and previews are generated in the browser (not server-rendered), so they depend on the user's browser canvas.
- Concurrent edits of one project from two devices: last write wins (no conflict detection).

### Still open from earlier phases
⛔ Reference screenshots, catalogue ownership and door-asset strategy (D-03). Door visuals remain schematic.

### Exact next step
1. Provide Supabase credentials (or create a free project), follow **SETUP.md**, run the smoke tests in §4, and send me anything that fails; I can then fix integration differences and add real-Supabase automated checks (Supabase CLI + Docker, or a test project).
2. Then decide D-03 (door assets) to move toward photographic realism, and whether revocable share links / photo sharing are wanted.

### Run it
```
cd app
npm install
npm run dev        # local development mode, no setup needed
npm test           # 276 tests (includes the real-Postgres RLS tests)
npm run typecheck && npm run lint && npm run build
# cloud mode: copy .env.example to .env.local, fill it in, apply the migration (docs/SETUP.md)
```

---

## Phase 4 — Photo upload and door visualisation (compositing MVP): **COMPLETE and verified, with one fundamental caveat**

Full technical write-up, approach comparison and limitations list: **[VISUALISATION.md](VISUALISATION.md)**.

### The caveat
**There are no approved product assets**, so the door placed on the photo is the app's own schematic rendering of the selected configuration, not a product photograph. Placement geometry is exact; the door's *appearance* is illustrative, and every on-screen preview and every exported image says so. The five door models are fictional samples and the product picker now says that too. Nothing fictional is presented as a genuine catalogue product. Real imagery plugs in at one point (`services/imaging/doorRaster.ts`).

### Delivered
- **A. Upload:** JPEG / PNG / WebP validated by *content* (not name/MIME); size limit 25 MB; real progress bar (reading → opening → preparing) with Cancel; specific errors for empty, oversize, wrong type, HEIC, SVG/text in disguise, cut-off files, tiny and absurdly large images; replacing a photo keeps the current one if the new one fails; EXIF orientation applied (verified); large photos downscaled to ≤3000 px; re-drawing strips all metadata incl. GPS (verified); nothing is uploaded or stored.
- **B. Placement:** four draggable doorway corners (mouse, touch and keyboard) over the *whole* uncropped photo; Rectangle mode (keeps aspect) and Perspective mode (free corners, invalid/folded quads refused); body drag, ± size, flip, reset, undo/redo (one drag = one step); per-photo placement and history; door fitted inside the doorway without distortion; the photo canvas is never modified; transparency and thin hardware lines preserved by premultiplied bilinear sampling.
- **C. Live configuration:** the composite re-renders when product, colours, glass pattern, lite, handle etc. change (browser-verified for each); unrelated choices persist; switching photos does not touch the door configuration and restores each photo's own placement.
- **D. Visual quality:** implemented only what the pipeline can support: perspective warp, ~1 px edge anti-aliasing, lighting estimate (+ manual brightness), soft shadow, honest labels, PNG export at photo resolution. Evaluated and **not** done: masking/occlusion, automatic doorway detection, AI replacement, WebGL.
- Replaced Phase 2's flat sticker-style overlay and its percent-based placement.

### Verification
| Check | Result |
|---|---|
| `npm test` | **129 tests pass** (63 new for imaging: homography, warp, quad rules, lighting, validation, EXIF parsing, truncation detection, placement history) |
| `tsc --noEmit`, `eslint`, `next build` | pass, 0 warnings |
| Mutation checks on the warp | flip ignored, perspective dropped to affine, pixels outside the quad painted: each made tests fail. The third initially **survived**; I strengthened the test (diamond quad, checks every pixel against the true shape) and it is now caught. |
| Real-photo browser run, 13 inputs (7 real photographs + panorama 3:1, square, dark, bright, PNG, WebP, PNG-named JPEG, PNG with alpha) | all displayed whole at the correct aspect, door drawn, photo fully opaque; console clean |
| Interaction run (~28 checks) | corner drag changes doorway and render but never the photo; rectangle stays rectangle; perspective makes a trapezoid; fold-over refused; keyboard nudge; undo/redo/reset; flip; colour/model/glass/handle changes alter the composited pixels (colour verified to be actually red); photo switching preserves config and restores per-photo placement |
| Failure run (~22 checks) | not-an-image, SVG-with-script, HEIC, 26 MB, 12 px, cut-off JPEG rejected with clear messages and the app/current photo unaffected; 9000×6000 loads in ≈0.9 s on this machine with a visible progress bar; Cancel works; EXIF-rotated file displays upright; GPS gone |
| Lighting | with matching on the same door renders at luminance ≈95 on a dark photo vs ≈159 on a bright one; with it off both are identical; brightness slider works |
| Interior | separate photo slot; sample room loads; exterior photo preserved |
| Mobile 390 px | no horizontal scroll; corners draggable by touch (CDP touch events); 36 px targets |
| Export | 1920×1440 PNG with the honesty caption, verified visually; downloads verified in five separate scenarios (plain, perspective, colour change, after replacing photos, changed configuration) |

### Defects found and fixed in this phase
1. Toasts covered the photo toolbar on desktop → moved to the side panel.
2. A **truncated JPEG was accepted** and shown half-grey (browsers decode partial JPEGs) → format-specific completeness check + tests.
3. Photo was tiny on phones (fixed padding for a two-row toolbar) → toolbar height measured; preview taller when a photo is shown; label moved into the photo corner; hint shortened and auto-dismissing.
4. Export blob URL was revoked after 2 s (could break slow “save as” prompts) → 60 s.
5. Test-side: wrong DOM selector (matched a glass-reflection polygon), canvas read-back switching Chrome to software rendering (changes soft-shadow pixels slightly), unreliable download check in one long script. These were not app bugs; noted so the results are read correctly.

### Honest limits / not verified
- **Not tested on real iPhone/Android hardware or Safari/Firefox** (Chrome desktop + Chrome mobile-size emulation only). Safari canvas shadow/`createImageBitmap` behaviour is unverified.
- The browser walkthrough scripts are kept outside the repo (not CI). One check in the long interaction script (download) is unreliable *inside that script*; the same action passes in isolation.
- Visual quality: see VISUALISATION §5 (no occlusion, schematic door, generic lighting/shadow, planar perspective only, no lens correction).
- HEIC unsupported. Photos exist only in memory: **not saved with a design and not shareable** (by design, for privacy).
- Product-asset realism, true door proportions and doorway real-world scale are unknown until real assets and measurements exist.
- Large-image performance beyond 3000 px and very old devices unmeasured.

### Still open from earlier phases
⛔ Reference screenshots, catalogue ownership and door-asset strategy (D-03). Without approved assets Phase 4 cannot reach photographic realism.

### Exact next step
Provide approved product imagery (layered PNG/WebP with transparency per option, or 3D models) or decide D-03. Then: swap the door source in `doorRaster.ts`, add per-option layers (glass, handle, colour) so “correct corresponding assets” means real product layers, and consider an erase/mask brush for occlusion.

### Run it
```
cd app
npm install
npm run dev        # http://localhost:3000  -> Create a door -> House -> Choose a photo
npm test           # 129 tests
npm run typecheck && npm run lint && npm run build
```

---

## Phase 3 — Product data and configuration engine: **COMPLETE and verified**

Details of the model, rules and policy: **[CATALOGUE_AND_RULES.md](CATALOGUE_AND_RULES.md)**.

### Delivered
- Typed product model (`Product`, `Catalogue`, `Rule`, `AssetEntry`) with a **small sample catalogue: 5 fictional products**, an option registry, declarative rules and an **asset manifest** (`app/src/domain/`).
- Pure engine: `evaluate` (what is locked/available + reasons), `reconcile` (repair with minimal change, idempotent, earlier choices win), `engineReducer` (set / undo / redo / reset / load), `serialize` / `deserialize` (versioned, validated, migrating), `validateCatalogue`.
- **Door model is now a real product**: Door step has a product picker (style filter, cards with schematic previews, “Switching will change: …” preview); the active product is shown on every step and in the summary. The old free “Style” option became a property of the product.
- All option controls (choice, glass, swatches, product) are driven by the engine's evaluation: unsupported options disabled with a reason; locked groups explain why.
- User is told when a change resets something (toast); undo/redo/reset work and are tested.
- Configuration serialises and restores (share links, saved designs, draft) with **migration of Phase 2 data**.
- Asset manifest is the only way assets are referenced (gallery now resolves through it).

### Requirement checklist
| Requirement | Evidence |
|---|---|
| 1 Selecting a door updates the active product | reducer test; consistency test; browser check |
| 2 Option change updates state immediately | reducer + consistency tests |
| 3 Incompatible options disabled/handled per documented rules | `rules.test.ts`, CATALOGUE_AND_RULES §3, browser checks |
| 4 Switching products resets only incompatible selections | `rules.test.ts` (“resets ONLY…”), consistency test, browser check (toast lists exactly the resets) |
| 5 Undo / reset | reducer tests; browser undo restores a reset knocker |
| 6 Serialise and restore | `serialize.test.ts` (every product/preset, random sequences, untrusted input, schema-1 migration); browser: share link, saved design, draft |
| 7 Assets via manifest | `catalogue.test.ts` (ids resolve, files exist, licences present, unknown id throws) |
| 8 No option claims to exist unless in the dataset | `validateCatalogue` + tests proving it detects bad data |

### Verification run (all after the final code change)
| Check | Result |
|---|---|
| `npm test` (Vitest) | **66 tests, 5 files, all pass** (≈3 s) |
| `tsc --noEmit` | pass |
| `eslint` | pass, 0 warnings |
| `next build` | pass |
| Browser walkthrough (Puppeteer + Chrome, 20 checks; script not committed) | all pass, console clean |
| Mutation check | deliberately breaking `reconcile` / the reducer made 19, 2 and 1 tests fail respectively; restored → all green. So the tests are not vacuous. |
| Randomised state test | 6 seeds × 1,500 actions: after every action the configuration is valid, a reconcile fixed point, history is capped and valid; replaying a sequence is deterministic |

Test files: `domain/__tests__/{catalogue,rules,reducer,serialize}.test.ts`, `features/configurator/__tests__/consistency.test.tsx` (jsdom: panel, product picker, summary and preview render from the same state).

### Defects found while building this phase
- Test-only: an over-slow history assertion (218 s) and three wrong expectations about preserved colours / hidden locked rows — fixed in the tests; product behaviour was correct (a user's valid navy door is *kept* when switching to Meridian, which also supports navy).
- No product bugs surfaced in the browser run.

### Honest limits
- The five products, their support lists and the eight rules are **invented samples** to exercise the engine. They are not real manufacturer data; real constraints need the product owner (⛔ question 1 still open).
- Product images are schematic placeholders, not approved product photography.
- Accessories on locked groups: values are preserved while locked (by design), so the saved JSON can contain a value not shown in the summary. Documented in CATALOGUE_AND_RULES §3.3.
- “Door style” is derived from the product; there is no way to pick style independently (deliberate).
- Colours must come from the palette (arbitrary hex values are repaired on restore).
- No browser-run automated E2E suite is committed yet (jsdom integration tests are); Playwright is still planned.

### Still open from earlier phases
- ⛔ Reference screenshots / recording and the catalogue-ownership + door-asset-strategy questions (Phase 1). Visual fidelity to the reference remains unverified.
- No accounts, database, real PDF or Street View (later phases by plan).

### Exact next step
Answer the ⛔ questions and send the reference screenshots → reconcile the UI visuals against them. In parallel the next engineering phase can start: **Phase 4** (door renderer behind `DoorPreviewProps`, driven by the same `Selections`). Decision D-03 (procedural 3D vs licensed models) must be made first.

### Run it
```
cd app
npm install
npm run dev                 # http://localhost:3000
npm test                    # 66 tests
npm run typecheck && npm run lint && npm run build
```

---

## Phase 1 — Audit, spec, architecture: complete (see other docs)

## Phase 2 — Frontend: **BUILT and verified, with one important caveat**

### The caveat (read first)
Phase 2 asked to match **verified reference measurements** from screenshots/recordings. **None were supplied** (and headless Chrome could not render the reference's configurator), so:
- **Structure, flow, wording and behaviours** follow the verified audit (steps, options, search, undo, house-photo sources and controls, save/share/PDF flows, cookie banner, footer links).
- **All visual values are provisional** (spacing, colours, card styles, header, hero, motion). Only the Roboto font and the slate/dark footer colours come from the reference. They live in `app/src/app/globals.css` tokens so they can be replaced in one place once screenshots arrive.
- I do **not** claim pixel fidelity to the reference.

### What exists (`app/`, Next.js 16 + React 19 + strict TypeScript + Tailwind 4)
| Area | Files | Notes |
|---|---|---|
| Shell, nav, footer, cookie banner, skip link | `components/layout/*`, `app/layout.tsx` | Mobile menu is a real disclosure; consent choice is stored (nothing is gated yet because no tracking exists). |
| Design system primitives | `components/ui/*` | Button, IconButton, Modal (native `<dialog>`), Tooltip, Toast, SegmentedControl, skeleton/empty/error states, Icon set. |
| Domain (no UI) | `domain/catalogue/data.ts`, `domain/design/*` | Sample catalogue (original names), `Selections` type, interim availability rules + reconcile, URL codec with validation of untrusted input, presets. |
| Configurator | `features/configurator/*` | 5 steps + Summary; option grids (roving arrow-key focus), glass family filter, swatches, "frame follows door" toggle, option search with empty state, undo/redo/reset, disabled-with-reason options, reconcile toasts, draft autosave. |
| Preview workspace | `features/configurator/PreviewWorkspace.tsx`, `PhotoModal.tsx` | Door / House modes, Outside / Inside, gallery + upload (type/size/decode validation, drag-drop), drag / keyboard-move / resize / flip / reset / replace / remove. |
| Save / share / print | `SaveModal`, `ShareModal`, `SummaryPanel`, print sheet | Save → this browser; share → encoded link with consent + copy / email; PDF → browser print dialog with print-only sheet. |
| My designs | `features/designs/DesignsList.tsx`, `services/designRepository.ts` | List, edit, rename, duplicate, copy share link, delete with confirm; unique names; loading / empty / error states. |
| Home | `app/page.tsx`, `features/home/Inspiration.tsx` | Hero, how-it-works, inspiration grid with filters and "See more". |
| Legal | `app/legal/[doc]` | **Placeholder copy**, labelled as such. |
| Original gallery art | `public/gallery/*.svg` | Created for this project; no third-party licence. |

### Integration points for later phases (kept thin on purpose)
- `features/preview/SchematicDoor.tsx` — `DoorPreviewProps` contract + flat 2D **stand-in**. Phase 4 replaces the renderer. Not final visual quality.
- `services/designRepository.ts` — `DesignRepository` interface; `localDesignRepository` to be replaced by Supabase (Phase 6).
- `services/gallery.ts` — placeholder gallery to be replaced by database photos.
- `domain/design/availability.ts` — interim rules; Phase 3 swaps in the declarative rules engine behind the same functions.

### Honest limits of this phase
- Persistence is **localStorage only** (labelled as such in the UI). Uploaded photos are held in memory only and are **not** saved or shared; the UI says so.
- No accounts, no email sending (share-by-email opens the user's mail app), no real PDF generation (print dialog), no Street View, no FR translation, no retailer features. These are per-spec later phases, not dead buttons: none are shown.
- Interim availability rules are a handful of examples, not the full compatibility model.
- Tooltips are CSS hover/focus only.

### Verification performed
| Check | Result |
|---|---|
| `tsc --noEmit` (strict) | pass |
| `eslint` (next core-web-vitals + typescript, React 19 hooks rules) | pass, 0 warnings |
| `next build` (production) | pass; 9 pages |
| Dev server starts (`npm run dev`) | pass (Next 16.4 Turbopack) |
| Browser console on every route | clean (no errors/warnings) in the scripted run |
| Automated browser walkthrough (Puppeteer + Chrome, script kept outside the repo) | **40 checks pass**: cookie choice persists; layout/height/colour/glass/view changes update the preview; options disabled with reason; locked groups explain why; glass family filter; undo/redo; search results + empty state + jump-to-step; house photo placement by pointer drag, keyboard nudge, flip, reset; per-side photo slots; summary; save success; duplicate-name rejection; share needs consent, link round-trips the design; invalid share link handled; My designs rename/duplicate/edit/delete; home filters and See more; preset opens in configurator |
| Viewed screenshots | desktop 1440, tablet 820, mobile 390 for configurator; desktop home; designs; modals |
| Horizontal overflow | none at 390 / 820 / 1440 |

### Defects found and fixed during this phase
1. Preview control bar hidden behind the header on desktop (positioning anchor lost) — fixed.
2. Door floated off its floor strip — fixed.
3. **Modal focus landed on the Close button, so pressing Space while typing a name closed the dialog** — fixed with `data-autofocus` handling in `Modal`.
4. Designs card actions wrapped onto two lines — compacted to icon buttons with tooltips.
5. Several React 19 lint violations (state-in-effect, ref-in-render) — restructured.

### Not verified / outstanding
- **No automated test suite committed yet** (Vitest/Playwright arrive with Phase 3; the walkthrough above was a manual-style script, not part of CI).
- Real touch devices and iOS Safari not tested (only Chrome headless at mobile width). Pinch-to-zoom of the door is not implemented (slider/buttons/keys are).
- Accessibility: keyboard paths exercised and focus styles present, but **no axe/screen-reader audit yet** (Phase 7).
- Colour contrast of muted text not formally measured.
- `next.config.ts` keeps the scaffold's `cacheComponents` / `partialPrefetching` flags; accepted for now (see DECISIONS D-13).

### Risks
1. Visuals may need rework when real reference screenshots arrive (tokens are centralised to limit this).
2. ⛔ D-03 (door asset strategy) still open; it gates Phase 4.
3. Photo/door compositing realism (Phase 5) is unproven.

### Exact next step
1. User provides reference screenshots/recording (REFERENCE_AUDIT §9) and answers the ⛔ questions → I reconcile the UI against them (tokens first) and record measured values in REFERENCE_AUDIT.
2. Then **Phase 3**: Vitest + Playwright in CI, declarative rules engine behind `availability.ts`, database-shaped catalogue loader and Zod schemas.

### Run it
```
cd app
npm install
npm run dev        # http://localhost:3000
npm run typecheck && npm run lint && npm run build
```
