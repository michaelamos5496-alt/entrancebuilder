# Product Catalogue and Configuration Engine (Phase 3)

Code: `app/src/domain/` (no React, no browser APIs). UI only reads it through `features/configurator/store.tsx`.

## 1. Layers (kept separate)

| Layer | Where | Contains |
|---|---|---|
| Product data | `domain/catalogue/{data,products,assets}.ts` | option registry, 5 sample products, asset manifest |
| Business rules | `domain/catalogue/rules.ts` | declarative, serialisable rules |
| Engine | `domain/engine/*` | `evaluate`, `reconcile`, `engineReducer`, `serialize`, `validateCatalogue` — pure functions |
| State (React) | `features/configurator/store.tsx` | wraps the engine reducer + scene state (view, photos, step) |
| Visual components | `features/configurator/*`, `features/preview/*` | read `selections` + `evaluation`; never decide compatibility |

## 2. Data model

```ts
Selections            // the whole configuration, flat; `product` is the active door
Product { id, name, blurb, style, assetId,
          supports: Partial<Record<SupportKey, string[]>>,   // allowed values per group
          defaults: Partial<Selections> }                    // preferred values
Group   { key, step, title, kind: choice|glass|color|toggle|product, options|palette }
Rule    = groupLockedWhen | optionBlockedWhen | follow       // predicates are plain JSON
AssetEntry { id, kind: schematic|image, src?, alt, license }
Catalogue { version, groups, products, rules, assets, baseDefaults, defaultProductId }
```

**Single source of truth for "does this option exist":** the group's option registry. A product can only *restrict* it (`supports`); `validateCatalogue` fails if a product, default or rule names a value that is not in the registry, so an option cannot be claimed without being in the dataset.

### Sample catalogue (deliberately small, fictional)
| Product | Style | Layouts | Heights | Lites | Notable |
|---|---|---|---|---|---|
| Haven | classic | all 9 | std, tall | none, ½, ¾ | widest choice |
| Heritage | classic | 6 (no double, no single-side+transom) | std | none, ½ | stained-glass families, lever/knob |
| Meridian | contemporary | single, side-left, side-right, transom, double | std, tall | none, ½, ¾ | bar/pull handles |
| Axis | contemporary | single, double | **tall only** | none, ¾ | 4 colors, no sidelites |
| Solstice | contemporary | single, transom, side-both, side-both+transom | std, tall | **½, ¾ only** (always glazed) | most handles |

Sizes = layout + height. Finishes/colours = per-product color lists and handle finishes. Glass/decorative = per-product glass list (door, sidelite and transom share it). Hardware = handle model + finish; accessories per product.

### Assets
`domain/catalogue/assets.ts` is the only place visuals are declared. Products reference `assetId`; gallery photos reference `gallery.*` ids; `getAsset(id)` **throws** for an unknown id. Tests check every id resolves, every image file exists in `public/`, and every entry carries a licence note. Current assets are all original (generated schematic thumbnails + illustrations drawn for this project). **Approved product imagery does not exist yet**; when it does, it is added to the manifest with its licence.

## 3. Compatibility policy (documented behaviour)

1. **The product is the root.** Selecting one replaces *only* values it does not support (with its default, else the first allowed value). Everything else is kept (hand, layout, colour, handle… if still valid).
2. **Earlier groups win.** For any other conflict the later group adapts. The order is the order of `GROUPS`: layout, height, hand → product → lite, sidelite style, accessory → glass… → colours → handle. A rule may only depend on groups *before* the one it restricts (enforced by `validateCatalogue`).
3. **Locked groups keep their value.** If a group is unavailable (e.g. sidelite glass without a sidelite) the stored value is preserved and comes back when the lock lifts; it is repaired only once unlocked.
4. **Blocked options cannot be selected.** If a change makes the *current* value invalid, it is replaced with a default and the user is told (toast: “Accessories: Knocker → None. Not available with double doors.”).
5. Unavailable options are **shown disabled with the reason**, not hidden. The product cards preview “Switching will change: …”.
6. Undo/redo restore exact earlier configurations (capped at 100). Reset returns to the default product and is undoable.
7. Setting a value that is unavailable, locked, unknown, wrongly typed, or identical is a **no-op that returns the same state object** (no history entry, no re-render).

### Current rules
| Id | Effect |
|---|---|
| sidelite-groups-need-sidelite | locks sidelite style + glass unless layout has a sidelite |
| transom-glass-needs-transom | locks transom glass unless layout has a transom |
| door-glass-needs-lite | locks door glass + frame profile when lite = solid |
| frame-colors-follow-door (+2 follow rules) | locks frame colours and keeps them equal to the door colours while “Frame follows door” is on |
| no-knocker-or-mail-on-double | blocks knocker, mail slot on double doors |
| no-kick-plate-tall-three-quarter-lite | blocks kick plate when height = tall and lite = ¾ |
| no-pull-handle-on-double | blocks pull handle on double doors |

These rules encode illustrative constraints chosen to exercise the engine, **not verified manufacturer rules**. Real rules come from the product owner (open question ⛔ 1).

## 4. Serialisation
`serialize(config)` → plain JSON `{ schemaVersion: 2, catalogueVersion, …selections }`. URL form: base64url of that JSON (`encodeConfig` / `decodeConfig`).
`deserialize(untrusted)` never throws and:
- rejects non-objects and newer schema versions;
- **migrates schema 1** (Phase 2 saves/links/drafts: `style` → Haven/Meridian) and keeps the user's other choices;
- replaces invalid or unknown values with defaults, reports each as a `repair`, drops unknown fields;
- always returns a configuration that passes `reconcile`.
Saved designs and the working draft in this browser are read through it, so Phase 2 data keeps working.

## 5. How to add a product
Add an entry to `PRODUCTS` (values must exist in the registry) and its `assetId` is generated automatically; run `npm test`. `validateCatalogue` and the “every product builds a valid default with no silent changes” test tell you if defaults are inconsistent.
