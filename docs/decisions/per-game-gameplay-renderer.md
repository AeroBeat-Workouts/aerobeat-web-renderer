# Per-game gameplay renderer

## Decision

Each connected `aero-game` creates its own `AeroWebGl2Renderer`. The retired process-global singleton is not exported. Assembly supplies exact parent content-box dimensions and effective device-pixel ratio through `resize()`; the renderer does not assume viewport orientation or browser-history ownership.

The renderer draws an aspect-fitted screen-space 4x3 playfield for Flow and Spatial Grid Boxing so cells remain physically square in portrait, landscape and extreme containers. Flow cues preserve the shared eight-way athlete-space direction contract: cardinal geometry remains stable and diagonal directions use bounded overlapping shaft segments plus a directionally aligned head. Shaft/head commands carry explicit contrast semantics; the renderer chooses black or white from the effective target luminance so the arrow remains non-color-visible under athlete themes. Chromium framebuffer tests compare each direction to a directionless target across desktop/portrait/landscape and lock dark/light theme contrast. Unsupported direction strings are rejected rather than rendered as a misleading cardinal cue. Semantic Track keeps separate full-height lanes while aspect-compensating receptor targets so their icon geometry remains physically square. Neither surface is the hidden calibrated athlete-input grid. Gameplay supplies already-resolved targets and judgement feedback; the renderer never scores or interprets camera coordinates.

## Icons and color

`aerobeat-branding/icons/web-gameplay/manifest.json` is the semantic source ledger. SVG masters remain `currentColor` for DOM consumers. Renderer integration calls `rasterizeBrandingIconAtlas()` with approved asset URLs and uploads the returned RGBA atlas. The rasterizer normalizes RGB to white; the icon fragment shader samples alpha only and multiplies it by the semantic role color. WebGL never parses SVG paths.

The atlas bytes are private renderer state retained only to rebuild the GPU texture after context restoration. Upload validates the complete stable semantic set, finite bounded UVs, dimensions, byte length, and white-RGB/alpha-mask contract. Top-left raster rows are uploaded without WebGL Y inversion. Abortable rasterization closes a late bitmap and never exposes it. Status/capability snapshots contain no pixels, screenshots, canvases, textures, or browser-native objects.

## Lifecycle and degradation

Context loss is reported as `context_lost` and restoration recompiles programs and reuploads the private atlas. Missing WebGL2 is explicit. Missing atlas degrades icon commands to geometric shapes and appears as `icon_atlas_unavailable_fallback_shapes`. `detach()` releases GPU objects and listeners; `destroy()` is synchronous, terminal, and idempotent.

## Theme and tuning

Public theme descriptors are narrowed to renderer-supported color and named-easing tokens; invalid external values fall back without retaining a false external identity. The renderer consumes only an exact `{identity,settings}` projection from the public profile registry and does not depend on gameplay or duplicate its registry. Identity must be `aerobeat/prototype_tuning_identity` v1, `live_visual`, bare lowercase SHA-256, and `regenerationRequired: false`; the only Task 11 presets are the explicitly experimental, content-hashed `aero.visual.default` and `aero.visual.compact`. Exact descriptor-safe narrowing rejects missing/extra/accessor/class/byte/deep/mismatched input before mutation.

`motionIntensity` maps to approach-ring travel/weight and `roleScale` scales target roles around their centers while preserving square geometry. Selection applies to the existing instance immediately, never recreates the renderer or scene, and remains isolated per game. Status/snapshot/export preserve the full identity and settings; reset restores the exact default. Status retains explicit `tuningRequiresRegeneration: false`. Timing judgement, recipes, reach, calibration, media, and session policy remain outside this package. Background input is an assembly-resolved serializable solid/gradient projection; external media loading remains with content/video owners.
