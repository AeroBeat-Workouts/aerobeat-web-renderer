# Fundamentally-2D Flow perspective projection

## Decision

Flow remains a WebGL2 screen-space renderer. It does not introduce a perspective camera, Z buffer, 3D meshes, scoring truth, or source-coordinate interpretation. Each caller-resolved Flow target is projected from a bounded normalized vanishing point to the existing aspect-fitted 4x3 endpoint rectangle.

For timeline `t`, impact `C`, and approach lead `L`, normalized depth is exactly `clamp(1 - (C - t) / L, 0, 1)`. Position and physical size interpolate linearly. Depth `0` is centered at `(0.5,0.42)` at `0.16x`; depth `1` is byte-for-byte the existing endpoint rectangle. The default Flow lead is 2500 ms to cover assembly's complete published future horizon. A caller may provide bounded `approachLeadMs` when content authority supplies a different horizon.

This normalized depth seam is intentionally independent of the draw implementation. A later approved full-3D experiment can consume the same timeline-derived progress without moving coordinate conversion, source placement, timing, or scoring into this package.

## Visibility and ordering

Flow approach commands carry renderer-only normalized `depth` and per-target `sequence` metadata. Commands at the same draw layer sort by depth ascending, target ID, then within-target sequence. Far cues therefore draw first and near cues last independent of source-array ordering. White backing precedes role fill for each cue. Boxing commands do not receive this metadata, and representative Boxing Lanes/Grid plans remain byte-identical.

The procedural timing ring is not projected with the cue. It remains centered on the destination rectangle and contracts linearly from the existing approach scale to exactly `1x` at impact. Hit, miss, pulse, and GREAT visuals snap to the endpoint and retain the caller-owned 350 ms feedback projection.

## Obstacles

A Flow target with `kind:"obstacle"`, `family:"obstacle"`, and caller-resolved occupied `cells` emits one translucent screen-space plane per occupied cell. Planes use the same linear projection and land exactly on the corresponding existing cell rectangles. They emit no direction icon or timing ring.

`beatCenterMs` is the default obstacle interval start. Optional `endMs` keeps the endpoint plane visible through that bounded timestamp and removes it afterward. Exact `intervalStartMs`/`intervalEndMs` aliases are accepted for callers that already carry both bounds; conflicting end values and invalid/reversed/out-of-day bounds are rejected. The renderer does not infer cell coverage or duration from source formats.

## Icon resolution

Canonical currentColor SVG masters still rasterize privately into a white-RGB alpha-mask atlas and are semantically recolored in the fragment shader. Atlas cells are now bounded to 256–512 px, defaulting to 256 px instead of 64 px. The 16-icon canonical set therefore defaults to a 1024x1024 atlas. Cancellation, top-left UV mapping, private context-restore bytes, semantic recolor, linear texture filtering, and fallback-shape degradation remain unchanged.

## Rejected alternatives

- Reversing stationary target order only changes which same-cell cue is hidden and does not expose future timing.
- Full 3D is premature while cues and obstacles are fundamentally planar and physical testing has not justified camera/mesh/Z-buffer complexity.
- Moving the timing ring with the cue makes the exact destination ambiguous and changes the established 2D timing affordance.
- Keeping a 900 ms default Flow lead collapses assembly's published +2500 ms future cues at the vanishing point.

## Verification

Deterministic plan tests lock progress endpoints, equal timeline deltas, +2500 ms horizon separation, source-order-independent far-first sorting, three distinct same-cell rectangles, exact endpoint rings, obstacle approach/impact/persistence, invalid intervals, and unchanged representative Boxing hashes. Chromium framebuffer tests repeat same-cell depth, destination ring, obstacle plane, and crisp arrow/outline evidence in portrait and landscape at requested DPR 1 and 3 while retaining all Boxing, context-loss, semantic recolor, cursor, resize, and lifecycle gates.
