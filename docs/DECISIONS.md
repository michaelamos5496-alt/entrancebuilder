# Decision Log

| ID | Decision | Status | Rationale / alternatives |
|---|---|---|---|
| D-01 | Next.js App Router + strict TypeScript + Tailwind | Proposed | Per brief; no reason found to deviate. |
| D-02 | Supabase for DB/auth/storage; Vercel hosting | Proposed | Per brief; RLS fits per-user projects and private photos. |
| D-03 | **Door asset strategy** — (1) procedural 3D, (2) licensed GLB, (3) layered images | **OPEN ⛔ (user)** | Reference uses ~3,258 proprietary pre-built GLB combos (V). We may not reuse them. Recommendation: build `buildDoor()` interface, ship procedural first, allow per-model GLB overrides. Depends on answer to "who owns the catalogue". |
| D-04 | Rules as declarative constraints, not exploded combinations | Proposed | Reference's table is hard to maintain; constraints are testable and scale. |
| D-05 | three.js via react-three-fiber for door; canvas compositing for photo scene | Proposed | Reference also uses three.js (V). |
| D-06 | next-intl with localised path segments, EN+FR | Proposed (confirm scope) | Reference localises both (V). |
| D-07 | Street View capture deferred to post-MVP | Proposed | Needs Google Maps Platform billing, ToS review for storing imagery; reference has it (V). |
| D-08 | Perspective corner-pin treated as enhancement (F8) | Proposed | Reference mechanism unverified (U). Decide after screenshots. |
| D-09 | No pricing/quote feature | Proposed | None found in public reference data (V absence). |
| D-10 | Never use reference keys, assets, names or code | Final | IP and security. Reference exposes secrets in a public config; we do not use them. |
| D-11 | Server-side PDF; technique chosen by spike in Phase 6 | Open | Chromium vs react-pdf trade-off. |
| D-12 | Anonymous design persisted locally; account only for Save | Proposed | Mirrors reference flow (V). |
| D-13 | Keep scaffold's `cacheComponents` + `partialPrefetching` Next flags | Accepted (Phase 2) | Build and routes work with them; `useSearchParams` consumers are wrapped in `<Suspense>`. Revisit if they complicate Phase 6 data fetching. |
| D-14 | Phase 2 persists only to localStorage behind a `DesignRepository` interface | Accepted | Real, honest persistence without building auth/DB early; UI states where data lives. |
| D-15 | Schematic 2D door is a stand-in behind `DoorPreviewProps` | Accepted | Lets every control visibly work now; Phase 4 replaces renderer without UI changes. |
| D-16 | Share links encode the validated design in the URL (no photo) | Accepted (Phase 2) | Works with no backend; untrusted input validated against the catalogue. Replaced by tokenised shares in Phase 6. |
| D-17 | English only in Phase 2 | Accepted | Strings are inline; i18n extraction is a Phase 7 task unless the user wants FR earlier. |
| D-18 | Door model is a first-class `Product`; style is derived from it | Accepted (Phase 3) | Matches "selecting a door updates the active product"; removes impossible style/model combinations. |
| D-19 | Compatibility policy: product is root; earlier groups win; locked groups keep values; blocked current values reset with a notice | Accepted | Predictable and testable; documented in CATALOGUE_AND_RULES §3. Enforced by `validateCatalogue`. |
| D-20 | Rules are declarative JSON predicates, not code | Accepted | Can move to the database in Phase 6 and be edited by non-developers. |
| D-21 | Schema-versioned serialisation with migration of Phase 2 data | Accepted | Users' saved designs/links/drafts keep working. |
| D-22 | Vitest (+ jsdom, Testing Library) for unit/integration tests; Playwright still planned | Accepted | Fast pure-domain tests; browser E2E added later. |
| D-23 | Door is composited by per-pixel inverse homography on canvas (not CSS 3D, mesh warp or WebGL) | Accepted (Phase 4) | Exact perspective, one code path for preview and export, fully unit-testable in Node. See VISUALISATION §2. |
| D-24 | No generative AI in the compositing path | Accepted | Not needed; would require uploading photos and invent rather than show the chosen door. |
| D-25 | Manual four-corner doorway selection; no automatic detection | Accepted | Detection is unreliable on real photos; manual first as required. |
| D-26 | Photos are in-memory only and are never saved or shared in this phase | Accepted | Privacy by default. Sharing a photo must be an explicit opt-in (Phase 6). |
| D-27 | Normalise every upload: validate by content, orient, downscale to 3000 px, re-draw (strips metadata) | Accepted | Safety, memory, privacy (GPS removal). |
| D-28 | The door is fitted inside the doorway without distortion | Accepted | Layout/height changes never stretch the door. |
| D-29 | Door pixels come from the app's schematic renderer until approved product assets exist; all previews/exports are labelled approximate | Accepted | Honest about fidelity; swap point is `doorRaster.ts`. |
| D-30 | One `ProjectRepository` interface; local-dev implementation when Supabase is not configured, cloud implementation otherwise; UI shows which | Accepted (Phase 5) | Whole flow works without credentials, and the UI cannot claim "saved to your account" in local mode. |
| D-31 | DB term "project" = UI term "design/project" (saved record with a door configuration, optional photos, preview) | Accepted | Keeps the brief's vocabulary in the schema; UI keeps the friendlier word. |
| D-32 | Browsers cannot write storage or `project_photos`; a server route validates and writes with the service role after an RLS-scoped ownership check | Accepted | Content validation cannot be enforced client-side; keeps the privileged key on the server only. |
| D-33 | Sample-gallery photos persist as a reference + placement in `projects.scene`; only uploaded photos use storage | Accepted | No file to store; validated by a SQL function. |
| D-34 | Revocable tokenised share links and photo sharing are NOT built | Accepted (explicit non-goal this phase) | "Only if explicitly supported": needs a consent/opt-in design; existing design-only URL links remain. |
| D-35 | RLS verified with PGlite (real Postgres in Node) and Supabase-style stand-ins | Accepted | No Docker/Supabase available; catches policy mistakes. Real-Supabase smoke tests documented in SETUP §4. |
| D-36 | Supabase Auth email + password only | Accepted (provisional) | Smallest scope; open question 4 (accounts in MVP?) still unanswered. |
| D-37 | `proxy.ts` only refreshes sessions; it never blocks requests | Accepted | Access control lives in RLS and the route handlers (Next docs advise against relying on proxy alone). |
| D-38 | Photo cap 4 MiB everywhere; browser re-encodes to fit | Accepted (Phase 7) | Hosting platform request-body limit (~4.5 MB) would otherwise make large uploads fail only in production. A test ties code, DB and bucket numbers together. |
| D-39 | Supabase client library loaded on demand | Accepted | −65 KB gzip for every local-mode visitor; budget enforced by a test. |
| D-40 | Scroll padding reserves space for sticky bars on small screens | Accepted | WCAG 2.2 Focus Not Obscured. |
| D-41 | One consolidated notice per action | Accepted | Capped separate notices hid resets from users. |
| D-42 | Secret audit runs as `postbuild` and fails the build | Accepted | A leaked key must never ship silently. |
| D-43 | Logging is structured JSON to stdout with redaction; no third-party monitoring integrated | Accepted | No account to integrate with; forward path documented. |
| D-44 | CSP keeps `script-src 'unsafe-inline'` for now | Accepted (known gap) | Nonce setup deferred; documented as hardening backlog. |
| D-45 | Playwright on installed Chrome for committed e2e tests | Accepted | No browser download; matches earlier manual runs. |

## D-46 Layout aligned to the reference (2026-10-12)
**Decision:** adopt the reference's information layout: full-width step bar under the header, options panel on the left (two-column bordered tiles with a tick badge), canvas on the right with floating tools, split hero on the home page. **Why:** the user asked for an interface "easier and closer" to the reference, and a render of the reference's home page and first configurator step finally became available (REFERENCE_AUDIT §8a). **Boundaries:** layout and interaction only; colours of our own palette except a generic slate and mint, our own logo, line-art icons and photos (CC0). No Novatech assets, text or code.


## D-47 Own visual identity: glass, not a clone (2026-10-12)
**Decision:** move away from the reference's look (supersedes the styling part of D-46; the information architecture stays). Light gradient-mesh background with frosted-glass surfaces (floating header, pill step bar, options panel, preview card, dialogs, footer), Inter typeface, graphite primary buttons, one blue accent for selection, large radii, soft layered shadows. **Why:** the user said the previous UI read as a clone and asked for something easier to navigate, more premium, with Apple-style glassmorphism. **Safeguards:** surfaces are 72-84 % opaque so text contrast holds (axe passes); fallbacks for browsers without backdrop-filter and for `prefers-reduced-transparency`; blur is limited to chrome, never over the photo-placement canvas.
