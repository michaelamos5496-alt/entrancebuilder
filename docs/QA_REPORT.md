# QA report (Phase 6): prioritised defect list

**Scope and honesty.** The brief asks to compare screenshots with the approved reference. **No reference screenshots or recordings exist**, so no comparison against the reference was possible; the visual audit below checks our own design for objective defects (overflow, overlap, contrast, states, alignment) at five viewport sizes. Everything else (functional, accessibility, performance, memory, failure paths) was tested for real. Findings were fixed, not just recorded; what remains is listed at the end.

**How:** 79 committed browser tests (Playwright on the installed Chrome, against a production build, run twice for flakiness), 325 unit/integration tests, axe-core (WCAG 2.2 AA + best practice) on every page and key state, keyboard-only flows, offline/blocked-storage/failed-request injection, Chrome DevTools heap queries after forced garbage collection, long-task and payload measurements, and review of screenshots at 1440, 1024, 820, 390 and 320 px.

## Fixed: critical / high
| # | Defect (user impact) | Found by | Fix |
|---|---|---|---|
| H1 | Opening a preset or share link and then **refreshing silently threw away the user's edits** (the link was re-applied) | e2e journey | A link seeds the design once and is removed from the address bar; the saved draft then wins on refresh. Test added. |
| H2 | A product switch that reset more than 3 things showed only the last 3 notices: **the user was not told about some resets** | e2e journey | One action = one notice listing every change. |
| H3 | On phones/tablets, keyboard focus and scrolled-to controls could land **underneath the sticky preview or bottom bar** (WCAG 2.4.11 Focus Not Obscured), and "Save" could be unreachable by scrolling in photo mode | responsive e2e | `scroll-padding` reserves those areas; preview 52 % (was 58 %) in photo mode; toolbar becomes one scrollable row on small screens, giving the photo more room. |
| H4 | The cookie banner (centered, wide) **covered the panel's bottom controls** for first-time visitors | e2e | Compact card, bottom-left (still overlaps the left end of the photo toolbar until dismissed: see open items). |
| H5 | The summary list was **invalid markup** (a button inside a definition-list row): serious axe violation, confusing for screen readers | axe | Restructured so the button lives inside the `<dd>`. |
| H6 | **Production-only upload failure:** hosting platforms reject request bodies over ~4.5 MB but the photo limit was 10 MB | Phase 7 review | Photo cap 4 MiB everywhere (code, database, bucket), browser re-encodes to fit, and a test keeps the numbers consistent. |
| H7 | A 68 KB (gzip) auth library was **downloaded by every visitor in local mode** that never uses it | payload measurement | Loaded on demand. Payload 270 → 205 KB gzip per page; budget test added. |

## Fixed: medium / low
| # | Defect | Fix |
|---|---|---|
| M1 | Footnote text 4.34:1 contrast on the floor strip (needs 4.5:1) | Darker, semibold text |
| M2 | Configurator and 404 pages had no `<h1>`; empty states skipped a heading level | Added `h1`; headings configurable |
| M3 | Some API error replies lacked `Cache-Control: no-store` (found by the new smoke test) | One reply helper for every response; unit + smoke tests |
| M4 | "Approximate preview" label covered the bottom corner handles on phones | Moved to the top of the photo |
| M5 | Notices could intercept clicks on the controls beneath them | Click-through |
| M6 | Media routes crashed with an unexplained 500 when only part of the cloud configuration existed | Clear 503 (Phase 5) |
| M7 | Privacy text claimed photos are never uploaded, untrue in cloud mode | Text depends on mode; error-report disclosure added |

## Verified, no defect
* **Keyboard:** skip link; visible focus indicator on every focusable element; arrow keys inside option groups; Enter/Space select; dialogs move focus in, trap it, close on Escape and return focus to the trigger; the doorway and each corner move with arrow keys; the whole save flow works without a mouse.
* **Accessibility scans:** home, designs, login, privacy, terms, 404, all six configurator steps, search results and empty search, photo/save/share dialogs (including error state), photo stage, lighting panel, cookie banner, mobile layout and menu: **0 critical/serious** violations.
* **States:** hover, focus, disabled (dimmed, `not-allowed`, reason shown) and error (`aria-invalid`, alert) are visibly different and tested.
* **Failure paths:** text/SVG/HEIC/empty/cut-off/tiny/oversized uploads; failed sample-photo request; offline mid-session (designing, saving, exporting still work); corrupt or write-refusing browser storage; damaged share link; missing project; unknown page. In every case the user keeps a working app and any previous photo.
* **Memory:** 12 photo swaps + garbage collection leave canvases at 3 → 5 and images at 0 → 0; page navigation does not accumulate canvases.
* **Responsiveness/performance:** no horizontal scroll at 320–1440 px on any page; dragging a doorway corner produced 0 long tasks; a 7000×5000 photo is shown in ≈0.7 s.
* **Full journey at 5 viewport sizes:** choose door → photo → place → save → reopen.

## Open items (not fixed; assess before launch)
| Priority | Item |
|---|---|
| **High (process)** | **No comparison with the reference design was possible** (no screenshots). Visual fidelity to the reference remains unverified. |
| **High (risk)** | **Safari, Firefox and real phones were not tested** (Chrome only, with mobile-size emulation). Canvas shadow rendering, `createImageBitmap`, touch gestures and `100svh` behaviour can differ. |
| Medium | No manual screen-reader testing (automation cannot judge announcement quality or reading order). |
| Medium | Reloading a URL with `?open=<id>` re-opens the **saved** version, discarding unsaved edits; the draft is not tied to the open project. Photos are never part of the draft (memory only). |
| Low | Two undo concepts (design undo in the header area, placement undo in the photo toolbar) may confuse. |
| Low | On a first visit the cookie banner overlaps the left end of the photo toolbar until dismissed; on phones, multi-line notices cover options for a few seconds (click-through). |
| Low | Door visuals remain a schematic stand-in (no approved product assets). |
| Info | Exact download timing in the long Phase-4 puppeteer script was unreliable; downloads are verified by Playwright's download events instead. |
