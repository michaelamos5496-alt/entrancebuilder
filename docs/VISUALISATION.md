# Photo visualisation (Phase 4)

Code: `app/src/domain/imaging/` (pure maths, tested in Node), `app/src/services/imaging/` (browser: decode, rasterise, compose), `app/src/features/configurator/{Visualiser,PhotoModal}.tsx` (UI).

## 1. Read this first: what is and isn't "accurate"

| | Status |
|---|---|
| **The photo** | The user's own pixels, upright, downscaled to ≤3000 px. Never altered after loading; the door is drawn on a separate transparent layer. |
| **Placement** (position, size, perspective) | Accurate to the corners the user sets. Pure projective geometry, exact. |
| **The door image** | **Not a product photograph.** No approved product assets exist yet. The door is the app's own 2D schematic renderer, rasterised. It reflects the *selected configuration* (layout, glass pattern, colours, handle) but not real materials, depth, reflections or true proportions of any manufacturer's door. |
| **Lighting, shadow** | **Approximate.** A brightness/colour-cast estimate and a soft drop shadow. Not a lighting simulation. |
| **The five door models** | Fictional samples (see CATALOGUE_AND_RULES). The UI says so, and every preview and export is labelled “Approximate preview · illustrative door”. |

When real product imagery arrives, the only change needed is the source of the door raster (`services/imaging/doorRaster.ts` / `DoorSvgSource`): everything downstream (placement, warp, lighting, shadow, export) takes any RGBA image with transparency.

## 2. Approaches evaluated

| Approach | Verdict | Why |
|---|---|---|
| **CSS `matrix3d` on a DOM element** | Rejected for the pipeline | Fast and crisp for live display, but the export would need a second, different implementation; the two could disagree. |
| **Canvas triangle-mesh warp** | Rejected | Subdividing into affine triangles shows visible seams/shearing under strong perspective unless the mesh is very dense. |
| **WebGL fragment shader** | Deferred | Best performance, but harder to test, context-loss handling, no Node tests. Revisit if 4K photos feel slow. |
| **Per-pixel inverse homography on a canvas (chosen)** | **Implemented** | Exact perspective. One code path for preview and export. Pure TypeScript on typed arrays, so it is unit-tested in Node (including mutation checks). Bilinear sampling with premultiplied alpha keeps transparency and thin hardware lines. Cost is proportional to the doorway's pixel area (fast enough to drag at ~full resolution; a 0.6× quality mode is used while dragging). |
| **Automatic doorway detection** | Not attempted | Unreliable on real photographs (porches, glare, multiple doors). Manual corners first, as required. |
| **Generative AI / inpainting** | Not used, not needed | The brief asks for a working compositor first. It would also introduce privacy (uploading photos), cost and fidelity risks (it would invent a door rather than show the chosen one). |

## 3. Pipeline

1. **Upload** (`decodePhotoFile`): validate size → sniff the first bytes (JPEG/PNG/WebP; the extension and browser MIME type are ignored; HEIC, SVG, text and other types get specific errors) → read with real progress → reject cut-off files (JPEG end-of-image, PNG IEND, WebP declared size) → decode → reject <200 px or >150 MP → apply EXIF orientation (platform does it; we verify quarter-turns by size and rotate ourselves if the browser did not) → step-halve down to ≤3000 px long edge → draw onto a canvas filled white (flattens transparency) → keep a 96 px thumbnail for lighting. **Re-drawing removes all metadata, including GPS.**
2. **Door raster** (`DoorSvgSource` + `svgToRaster`): the real preview component renders off-screen; its SVG is rasterised at a size matched to how large the door appears (cached).
3. **Placement** (`placement.ts`): four corners in **photo-normalised** coordinates (so they are independent of screen size). Rectangle mode resizes keeping the doorway's aspect; Perspective mode moves corners freely but refuses any move that makes the quad concave, self-intersecting, collapsed or tiny. One drag = one undo step; undo / redo / reset; each photo keeps its own placement and history.
4. **Fit** (`fitRect`): the door is fitted *inside* the doorway without distortion (centred, standing on the bottom edge). Changing layout or height therefore never stretches the door.
5. **Warp** (`warpOver`): inverse homography per destination pixel, bilinear premultiplied sampling, ~1 px anti-aliased edges, source-over blending; nothing outside the quad is written.
6. **Lighting** (`estimateLighting`): measures the ring of photo around (not inside) the doorway in the thumbnail → gain (clamped 0.55–1.35, applied at 60% strength) and a mild colour cast. Manual brightness ±50%. Toggleable.
7. **Shadow** (`paintOverlay`): blurred silhouette offset down-right (upper-left light), drawn with the canvas shadow API so it works without `ctx.filter`.
8. **Export** (`exportComposite`): photo at its working resolution + door + caption “Approximate preview — illustrative door, not a photograph of the product”, as PNG.

## 4. Privacy
Photos are read and processed entirely in the browser; there is no network request for them. They are held in memory only: not saved with designs, not in share links, not in storage. Closing the tab discards them. Sharing a photo is not implemented (so it cannot happen accidentally); when it is, it must be an explicit opt-in (Phase 6, see PRODUCT_SPEC F10).

## 5. Known visual limitations (honest list)
1. The door is schematic and flat: no wood grain, glass reflections of the scene, depth, or true frame profile.
2. **No occlusion.** Railings, plants, porch posts or people in front of the doorway are painted over: there is no masking. A future "erase" brush is the natural next feature.
3. Lighting is a global estimate: no directional light, no sun/shade split across the door, no reflections of the sky in glass.
4. The shadow is generic (fixed light direction); wrong for sunsets or backlit photos (toggle it off).
5. Perspective models a *plane*: it cannot show a recessed door, an opened door, or lens distortion (wide-angle phone photos bend straight lines).
6. The doorway's real-world size is unknown, so scale is whatever the user draws; the app does not check that a "tall 96 in" door matches the photo.
7. Orientations 2–4 (mirror/180°) cannot be verified from size and rely on the browser; quarter-turn orientations are verified.
8. Photos are capped at 3000 px, so exports are at most 3000 px on the long side.
9. HEIC (iPhone default in some settings) is not supported; the user is told to export JPEG.
10. Transitional visual differences between GPU and software canvas can change the soft shadow by a few pixels.
11. No automatic doorway detection.

## 6. Test material
Seven real photographs from Wikimedia Commons (CC BY / CC BY-SA; used only as local test inputs, **not stored in the repository or redistributed**): a street scene in Cape Town (3:2, daylight), a doorway in Funchal (portrait 5:8), the Grover-Chambers House in Galveston (shaded, heavy foliage), the Meigs House in Marietta, a shopfront entrance photographed at night (mixed artificial light), the Frank Hower House in Amherst, and a front door in Wuppertal (portrait 2:3). Plus generated cases: 3:1 panorama, square, very dark, over-exposed, 9000×6000 (12 MB), EXIF-rotated, embedded-GPS, PNG with alpha, WebP, a PNG-named JPEG, HEIC header, SVG-with-script disguised as .jpg, plain text as .jpg, truncated JPEG, 12×12 px, 21 MB and 26 MB files.
