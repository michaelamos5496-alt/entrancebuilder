# Reference Audit — design.novatechgroup.com

Audit date: 2026-10-12. Phase 1.

## 1. Method and limits (read first)

| Evidence source | Used | Notes |
|---|---|---|
| Served HTML shell, JS/CSS bundle file names | Yes | Angular single-page app (hashed `main`, `runtime`, `polyfills`, `styles` bundles). |
| Public config/data files the app downloads at runtime (`assets/i18n/en.json`, `assets/json/{steps,categories,properties,objects}.json`) | Yes | Primary source for flow, vocabulary and data structure. |
| Application route table and library usage in the main bundle | Yes | Read as text only. Nothing from it is copied into our code. |
| **Rendered screens (visual layout, spacing, typography, motion)** | **NO** | Headless Chrome rendered only the footer and cookie banner of `/en/viewer`; the app body stayed blank. **No screenshot of the real UI exists in this audit.** |

Consequence: everything under "Visual design" and "Interaction details" below is **UNVERIFIED** until the user supplies screenshots or a screen recording (list in §9). We will not claim pixel-faithful reproduction before then.

Status legend: **V** = verified from evidence, **I** = inferred (reasonable but not observed), **U** = unverified / needs inspection.

## 2. Technology of the reference (V)

- Angular SPA, `ngx-translate` for i18n, lazy-loaded `ViewerModule`.
- Three.js (WebGLRenderer, GLTFLoader, OrbitControls present) loading `.glb` door models; `OffscreenCanvas` present.
- `html2canvas` and `jsPDF` present (screenshot of the scene and PDF export).
- Google Maps JS API with `places` library loaded in the shell (Street View photo capture).
- reCAPTCHA configured; REST backend at a separate API host; JWT-style auth guard on profile/projects routes.
- Cookie-consent banner (accept all / reject all / dismiss, privacy link).

**Security note:** the reference ships API keys and a reCAPTCHA *secret key* in a publicly downloadable config file. We do not use or reproduce any of these. Our keys will be server-side env vars.

## 3. Routes and pages (V — from route table)

Language prefix `/:lang` (`en`, `fr`). Paths are localised (FR/EN aliases for the same page).

| Page | EN path | FR path | Auth |
|---|---|---|---|
| Home | `/en` | `/fr` | no |
| Configurator ("viewer") | `/en/viewer` | `/fr/generateur` | no (save requires account) |
| Login / register / forgotten password / register confirmation | `/en/login`, … | `/fr/auth`, … | no |
| Profile | `/en/profile` | `/fr/profil` | yes |
| Projects list | `/en/projects` | `/fr/projets` | yes |
| Project details | `/projects/:uuid` | equivalent | yes |
| Door details | route exists (`view-door-details`) | | yes |
| Shared door view (read-only, "Copy Door" CTA) | route exists (`view-share`) | | no (link) |
| Terms and conditions | `/en/terms-and-conditions` | | no |
| Admin console ("Designer Center") | strings only; separate app likely | | role-based |

## 4. Home page content (V text, U layout)

Sections in order of the i18n keys: hero ("Create your door", CTA "START CREATING"); "How it works?" (3 steps: configure → save project/login → share/my projects); "Get inspired" (curated configurations, filters All / Contemporary / Classic / Trends, "See more"); "Need help? Consult our designer"; two "NEW!" product highlights deep-linking to preset configurations by UUID; "#MyNovatech" social block; footer (Career, Showroom, FAQ, Brochures, Contact, legal links, social links).

## 5. Configurator flow (V)

Top-level steps (from `steps.json`, 24 nodes, parent/child):

1. **Configuration** — layout (single, double, single + left/right/both sidelites, with/without transom: 8 variants), door height (Standard / 8 ft), opening direction (left/right hand).
2. **Door** — style (Classic / Contemporary), door model (grouped by lite size: none, 1/2, 3/4, with named designs), accessories, sidelite style.
3. **Doorglass** — glass model (families: Stained glass, Silkscreen, V-Groove, Grilles, Textured, Venting units, Integrated blinds), options, glass frame profile, sidelite glazing, transom glazing. Filter by "Family" and "Tint".
4. **Colors** — door exterior, frame exterior, door interior, frame interior, sill. Palette categories (Black, Gray, Beige, Blue, Green, Red, Yellow, White, Brown). Disclaimer: suggested colours are guidance only.
5. **Handle** — model, colour.

Other verified behaviours:
- Search within options ("Search", "No result found for").
- Next / Previous buttons; a "House" ↔ "Door configuration" switch; "Summary"; "Modify".
- Start-up message: "Welcome to Novatech's Entrance Builder, choose an option to change your door".
- Property cards show an image, a title or a colour swatch; steps can carry a description string (the colour disclaimer).
- **Compatibility is enforced:** each of 3,258 "object" records lists, per step, the property IDs allowed with that door system (`IDDependencies`). Choosing a layout/height/direction narrows what later steps offer.

## 6. House-preview ("scenario") (V strings, U mechanics)

- Three photo sources: **Novatech photo gallery**, **Upload a picture**, **Google Street View**.
- Canvas controls: **Flip door**, **Reset door position**, **Replace background**. Tooltips: "Use photo from gallery", "Upload a photo from your own house", "Capture a photo from Street View".
- Preview exists for **exterior and interior** ("House Preview – Exterior/Interior").
- *Unverified:* how the door is placed (drag? scale handles? perspective correction?), whether lighting is matched, photo size limits, gallery contents, mobile gestures.

## 7. Accounts, projects, sharing, output (V)

- Register / login / forgotten password (3-step: initiate, validate code, finalize) / email confirmation / "remember me".
- Anonymous users can design; **Save** opens a modal: choose door name → choose or create project → login/register inline → success with options (visit projects, edit door, new door, continue). Warning when saving with no changes.
- Projects: create, rename, delete (cascades to doors), list; doors: add, rename, move between projects, print, delete, "See details", edit.
- Share: modal with friend name + email + consent checkbox (design and any uploaded photo become public to anyone with the link); share by email; **send to a retailer** (3-step instructions + "Find a retailer"); social links. Sharing requires a saved door.
- PDF: creation date, exterior door, interior door, house preview exterior/interior; error page for a missing shared door with CTA to create one. A "door summary" / technical details view exists.
- Account page: personal info editing.
- Legal: product images are illustrative; "scenario … does not constitute a contractual offer".

## 8. Visual design and interaction details (U)

Everything visual is unverified: grid, header/step-bar layout, typography (Roboto 400/700/900 is requested in the HTML — V), colour palette, card styles, transitions, 3D camera behaviour (orbit?), loading states, mobile layout. The only verified visual facts: Roboto font, a dark slate nav bar and dark footer (seen in the partial render), a blurred exterior/interior background image pair, a house gallery image, and "how-to" images on the home page.

### 8a. Observed 2026-10-12 (V, desktop 1440×900 render; phone and later steps still unobserved)

A second headless render (SwiftShader WebGL, 35 s wait) succeeded for the home page and the configurator's first step.

- **Header:** full-width white bar, logo + "Entrance builder" on the left, small letter-spaced uppercase links (Create a door, Login, FR) on the right.
- **Home hero:** two columns. Warm off-white text panel (~35 %) with "Create your door", a paragraph and an outlined, square-cornered "→ START CREATING" button; a full-bleed photograph fills the rest.
- **Configurator:** a full-width slate step bar (numbered circles, mint highlight on the active step, Summary last) sits under the header. Below it, a ~480 px left panel (step title with back/next arrows, rounded search field, two-column grid of square bordered option tiles with a tick badge on the selected one) and a large light-grey canvas on the right with a mint dismissible welcome banner and a vertical stack of white square tool buttons (home, flip, rotate, zoom). A slate footer bar carries the copyright.
- Still unobserved: steps 2–5 and Summary, the house-preview step, modals, projects, phone layout.

Our UI follows this layout with original branding, icons and assets (see DECISIONS D-46).

## 9. Material we need from the user to finish the audit

1. Screenshots (desktop 1440 px and phone 390 px) of: home (full scroll), configurator on each of the 5 steps, house-preview step with each of the 3 photo sources, interior preview, summary, save modal, share modal, projects list, project details, PDF output.
2. A 30–60 s screen recording of: changing layout → door → glass → colour; dragging/resizing the door on a photo; flipping it.
3. Confirmation of intent (see PRODUCT_SPEC §8): is this a product for Novatech/its retailers (then their licensed models are available) or an independent product (then we need our own catalogue)?

## 10. Intellectual-property boundaries

Novatech's 3D models, door images, logo, product names (e.g. "Vitral Équation", "Chanelle") and text are theirs. We reproduce **interaction model and information architecture only**, with original branding and licensed or self-made assets. Product/option naming will be generic unless licensed.
