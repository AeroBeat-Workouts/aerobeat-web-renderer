# Per-game gameplay renderer

## Decision

Each connected `aero-game` creates its own `AeroWebGl2Renderer`. The retired process-global singleton is not exported. Assembly supplies exact parent content-box dimensions and effective device-pixel ratio through `resize()`; the renderer does not assume viewport orientation or browser-history ownership.

The renderer draws an aspect-fitted screen-space 4x3 playfield for Flow and Spatial Grid Boxing so cells remain physically square in portrait, landscape and extreme containers. Semantic Track keeps separate full-height lanes while aspect-compensating receptor targets so their icon geometry remains physically square. Neither surface is the hidden calibrated athlete-input grid. Gameplay supplies already-resolved targets and judgement feedback; the renderer never scores or interprets camera coordinates.

## Icons and color

`aerobeat-branding/icons/web-gameplay/manifest.json` is the semantic source ledger. SVG masters remain `currentColor` for DOM consumers. Renderer integration calls `rasterizeBrandingIconAtlas()` with approved asset URLs and uploads the returned RGBA atlas. The rasterizer normalizes RGB to white; the icon fragment shader samples alpha only and multiplies it by the semantic role color. WebGL never parses SVG paths.

The atlas bytes are private renderer state retained only to rebuild the GPU texture after context restoration. Upload validates the complete stable semantic set, finite bounded UVs, dimensions, byte length, and white-RGB/alpha-mask contract. Top-left raster rows are uploaded without WebGL Y inversion. Abortable rasterization closes a late bitmap and never exposes it. Status/capability snapshots contain no pixels, screenshots, canvases, textures, or browser-native objects.

## Lifecycle and degradation

Context loss is reported as `context_lost` and restoration recompiles programs and reuploads the private atlas. Missing WebGL2 is explicit. Missing atlas degrades icon commands to geometric shapes and appears as `icon_atlas_unavailable_fallback_shapes`. `detach()` releases GPU objects and listeners; `destroy()` is synchronous, terminal, and idempotent.

## Theme and tuning

Public theme descriptors are narrowed to renderer-supported color and named-easing tokens; invalid external values fall back without retaining a false external identity. Renderer tuning contains visual values only and can be set, hash-verified on import, exported, or reset live. Status reports theme/tuning IDs, versions and hashes plus explicit `tuningRequiresRegeneration: false`. Timing judgement, recipes, reach, calibration, media, and session policy remain outside this package. Background input is an assembly-resolved serializable solid/gradient projection; external media loading remains with content/video owners.
