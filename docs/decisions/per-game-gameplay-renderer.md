# Per-game gameplay renderer

## Decision

Each connected `aero-game` creates its own `AeroWebGl2Renderer`. The retired process-global singleton is not exported. Assembly supplies exact parent content-box dimensions and effective device-pixel ratio through `resize()`; the renderer does not assume viewport orientation or browser-history ownership.

The renderer draws a screen-space 4x3 playfield for Flow and Spatial Grid Boxing and a separate two-lane screen-space presentation for Semantic Track Boxing. Neither surface is the hidden calibrated athlete-input grid. Gameplay supplies already-resolved targets and judgement feedback; the renderer never scores or interprets camera coordinates.

## Icons and color

`aerobeat-branding/icons/web-gameplay/manifest.json` is the semantic source ledger. SVG masters remain `currentColor` for DOM consumers. Renderer integration calls `rasterizeBrandingIconAtlas()` with approved asset URLs and uploads the returned RGBA atlas. The rasterizer normalizes RGB to white; the icon fragment shader samples alpha only and multiplies it by the semantic role color. WebGL never parses SVG paths.

The atlas bytes are private renderer state retained only to rebuild the GPU texture after context restoration. Status/capability snapshots contain no pixels, screenshots, canvases, textures, or browser-native objects.

## Lifecycle and degradation

Context loss is reported as `context_lost` and restoration recompiles programs and reuploads the private atlas. Missing WebGL2 is explicit. Missing atlas degrades icon commands to geometric shapes and appears as `icon_atlas_unavailable_fallback_shapes`. `detach()` releases GPU objects and listeners; `destroy()` is synchronous, terminal, and idempotent.

## Theme and tuning

Public theme descriptors are narrowed to the final `aerobeat/theme_descriptor` token shape. Renderer tuning contains visual values only and can be set, exported, or reset live. Timing judgement, recipes, reach, calibration, media, and session policy remain outside this package. Background input is an assembly-resolved serializable solid/gradient projection; external media loading remains with content/video owners.
