# Product Specification (draft v0.1)

Working name: **Threshold** (placeholder; rename freely). Status tags: V/I/U as in REFERENCE_AUDIT.

## 1. Goal
A premium web configurator where a homeowner designs an entrance door, then sees it on a photo of their own home (outside and inside), and saves/shares/exports it.

## 2. Users
- **Homeowner** (primary): anonymous exploration, optional account.
- **Retailer/designer** (secondary): receives shared designs, may comment (reference: share to retailer by email — V).
- **Catalogue admin** (internal): maintains models, options, compatibility, gallery photos, inspiration presets (reference has a "Designer Center" — V strings).

## 3. Scope by release

### MVP (Phases 2–5)
| # | Feature | Ref status | Acceptance (summary) |
|---|---|---|---|
| F1 | Landing page with hero, how-it-works, inspiration gallery | V | Content-managed; filters work; presets open in configurator |
| F2 | 5-step configurator: layout → door → glass → colour → hardware | V | Every step changes the preview; invalid combinations are impossible |
| F3 | Compatibility rules engine | V (data structure) | Changing an upstream choice keeps compatible downstream choices, resets/flags incompatible ones, never silently drops others ("without losing unrelated choices") |
| F4 | Option search | V | Finds options by name across steps; empty state |
| F5 | Live door rendering, exterior and interior | V | Renders all supported combos; <2 s to first render on mid-range laptop; no layout shift |
| F6 | House preview: gallery photo, **upload own photo** | V | JPEG/PNG/HEIC→JPEG, ≤15 MB, EXIF-orientation fixed, stored privately |
| F7 | Door placement on photo: move, scale, flip, reset, replace background | V (labels), U (mechanics) | Touch + mouse; undo; persists with the design |
| F8 | Perspective/corner-pin fit and basic lighting match | I (not verified in reference) | Optional enhancement; decide after screenshots |
| F9 | Save design (name, project), accounts, projects CRUD | V | Real persistence in Postgres; RLS verified by tests |
| F10 | Share by link/email with consent notice; read-only shared view with "Copy door" | V | Unlisted tokens; revoke; photo public only after consent |
| F11 | PDF export (exterior, interior, house previews, spec summary, date) | V | Generated server-side, accessible, <10 s |
| F12 | EN + FR | V | All strings externalised; localised URLs |
| F13 | Cookie consent | V | Granular; analytics gated |

### Later (post-MVP, only if confirmed)
Google Street View capture (V in ref; needs Maps Platform billing + ToS review — see DECISIONS D-07), retailer directory + "send to retailer" (V), admin console (V strings), interior wall/floor scenes, designer-consult request, social share, AR.

### Explicitly not in scope until evidence/approval
Pricing/quotes (no pricing found in reference — V absence in public data), ordering/payments, measurement tools.

## 4. Key user journeys
1. Anonymous: Home → Start → configure → add house photo → adjust → Save (prompt to register) → success.
2. Returning: Login → Projects → open door → edit → save changes ("Confirm changes?").
3. Share: Saved door → Share → consent → link/email → recipient sees read-only view → "Copy door".
4. Inspiration: Home → filter Contemporary → open preset → modify.

## 5. UX principles
- Preview always visible; controls never hide it on mobile (bottom sheet).
- Every choice is reversible (undo/redo, per-step reset).
- Incompatible options are shown disabled **with a reason**, not hidden silently.
- Honest states: loading skeletons, upload progress, error + retry, empty states, success confirmations.
- Illustrative-image disclaimer shown where the reference shows it (V).

## 6. Non-functional requirements
- **Accessibility:** WCAG 2.2 AA; full keyboard operation of steps and option grids; canvas has text alternative and keyboard nudging; colour swatches carry names.
- **Performance:** LCP <2.5 s on 4G for home; configurator JS budget ≤250 KB gz before the 3D chunk; models and textures lazy-loaded, compressed (Draco/Meshopt, KTX2).
- **Responsive:** 360 px → 1920 px; touch gestures.
- **Privacy:** uploaded photos private by default, deletable, never used for training; EXIF GPS stripped; GDPR/PIPEDA/Quebec Law 25 aware (reference targets Quebec/Canada — I).
- **Security:** see ARCHITECTURE §7.
- **Browser support:** last 2 versions of Chrome, Safari (incl. iOS 16+), Firefox, Edge.

## 7. Verified vs. unverified summary
Verified: flow, vocabulary, routes, save/share/PDF/project features, three photo sources, compatibility-data model, i18n, library choices. Unverified: all visuals, motion, placement mechanics, gallery contents, mobile layout, admin tools, any pricing.

## 8. Open questions for the user (blockers marked ⛔)
1. ⛔ **Who owns the catalogue?** Novatech-authorised project (we can request their GLB/PNG assets and naming) vs independent product (we need original or licensed door assets).
2. ⛔ **Door asset strategy** (DECISIONS D-03): procedural parametric 3D (we build) vs licensed GLB models vs pre-rendered layered images.
3. Languages at launch (EN only, or EN+FR as in reference)?
4. Do we need accounts in MVP, or anonymous save-by-link first?
5. Street View: is a Google Maps Platform billing account acceptable?
6. Target market/region (affects privacy law, units — inches vs mm).
7. Supabase and Vercel accounts: existing or to create?
8. Screenshots/recording (REFERENCE_AUDIT §9).


---
## Status update after Phase 4
F6 (upload own photo) and F7 (move/scale/flip/reset/replace) are implemented; F8 (perspective) is implemented as manual four-corner adjustment. F6's "stored privately" is satisfied by *not storing*: photos live in memory only until accounts and private storage exist (Phase 6). Door appearance remains schematic until approved assets exist. See VISUALISATION.md.


---
## Status update after Phase 5
F9 (save, accounts, projects CRUD) is implemented: fully working in local development mode, implemented but not yet run against a real Supabase project in cloud mode. F10 (sharing) remains design-only URL links; tokenised revocable links and photo sharing are deliberately not built. F11 (PDF) is still the browser print dialog. PNG export and saved preview thumbnails are implemented.
