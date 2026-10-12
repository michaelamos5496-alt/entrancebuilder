# Data Model (proposed, v0.1)

## 1. What the reference does (V)
- `steps` (24 nodes, tree via `parentID`; some carry `stepCategoryID` and a description).
- `categories`: step categories (Family, Tint) and property categories (All, Stained Glass, Silkscreen, … plus colour families with hex).
- `properties` (528): selectable options `{ID, title(i18n key), imgURL|colorCode, categoryID, stepID, active}`.
- `objects` (3,258): pre-exploded combinations, each with `objects3D[]` `{categoryTitle (doorSystem, door, glass, glassFrame, knob, lateralL/R, lateralGlassL/R, imposte, colorDoorExt…), URL(.glb), double, reverse, offsetX/Y}` and `IDDependencies[] {stepID, propertiesID[]}` listing which property IDs make that object valid.

Weakness: combinatorial explosion, hard to maintain. We will model constraints instead.

## 2. Catalogue (Postgres, read-mostly, i18n via JSONB `{en,fr}`)

```
steps(id, key, parent_id, position, kind, title i18n, description i18n)
option_groups(id, step_id, key, title i18n, filter_kind)       -- e.g. glass family, tint
options(id, step_id, group_id, key, title i18n, image_path, color_hex, active, sort)
components(id, kind, asset_path, params jsonb)                  -- door leaf, glass, handle, frame…
option_components(option_id, component_id, role)               -- what an option contributes to the scene
rules(id, kind, when jsonb, then jsonb, reason i18n)           -- requires / excludes / defaults
presets(id, slug, title i18n, tags[], design jsonb, hero_image) -- "Get inspired", highlights
gallery_photos(id, kind, path, corners jsonb, tags)            -- house photos with default door placement
```

`rules.kind`: `requires` (option A needs one of B…), `excludes`, `restrictsStep` (layout X → only these heights), `default` (when A chosen preselect B).

## 3. User data (RLS: owner only unless noted)

```
profiles(id → auth.users, first_name, last_name, locale, created_at)
projects(id, owner_id, name, created_at)                 UNIQUE(owner_id, lower(name))
designs(id, owner_id, project_id, name, document jsonb, schema_version, thumb_path, created_at, updated_at)
                                                         UNIQUE(project_id, lower(name))
design_photos(id, design_id, owner_id, storage_path, width, height, placement jsonb, source enum('upload','gallery','streetview'))
shares(id, design_id, token, created_by, expires_at, revoked_at, photo_public_consent_at, recipient_email?)
audit_events(id, actor, action, subject, at)
```

## 4. DesignDocument (versioned JSON, Zod-validated)

```ts
type DesignDocument = {
  schemaVersion: 1
  selections: {
    layout: OptionKey; height: OptionKey; hand: OptionKey
    style: OptionKey; doorModel: OptionKey; accessories: OptionKey[]; sideliteStyle?: OptionKey
    glass?: OptionKey; glassFrame?: OptionKey; sideliteGlass?: OptionKey; transomGlass?: OptionKey
    colors: { doorExt: ColorRef; frameExt: ColorRef; doorInt: ColorRef; frameInt: ColorRef; sill: ColorRef }
    handle: { model: OptionKey; color: ColorRef }
  }
  scene?: { view: 'exterior'|'interior'; photoId?: string; placement: {x:number;y:number;scale:number;flip:boolean;corners?:[Pt,Pt,Pt,Pt]} }
}
```

Unknown/removed options on load → mapped via `migrations/` or flagged, never crash.

## 5. Storage buckets
`photos-private` (owner path prefix, signed URLs), `catalogue-public` (option images, gallery), `thumbs` (generated).

## 6. Indexes & integrity
FK with `ON DELETE CASCADE` (project → designs → photos/shares) — matches reference warning "doors in this project will also be deleted" (V). Unique constraints above reproduce "already exists" errors (V). Share token: 128-bit random, unique index.

## 7. Seed data (Phase 2)
Original, generic catalogue (no Novatech names/assets) sufficient to exercise every rule type and every step.


---
## Phase 3 note — what is actually implemented
The product/option/rule model is implemented in code (`app/src/domain`) and documented in **CATALOGUE_AND_RULES.md**. It differs from the proposed tables above in one respect: the sample catalogue lives in TypeScript data files, not the database, and rules are JSON predicates (`Rule` union) rather than the `rules(kind, when, then)` row sketched in §2. The shapes were chosen so they map 1:1 onto those tables in Phase 6. The persisted design document is the versioned `SerializedConfig` (schema 2) described there.


---
## Phase 5 note: what is actually in the database
Implemented in `app/supabase/migrations/20261012000001_projects.sql`: **`projects`** (owner, name, `document` = versioned configuration, `scene` = sample-gallery photo + placement, `preview_path`, timestamps) and **`project_photos`** (one stored photo per view with size, bytes, validated `placement`), plus the private `project-media` bucket. The proposed `shares`, `gallery_photos`, `presets`, `audit_events` tables and the catalogue tables are **not** created (catalogue stays in code; sharing is not backed by the database). Projects are flat (no separate projects/designs hierarchy).
