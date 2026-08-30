# aerobeat-web-renderer

AeroBeat-owned per-game WebGL2 renderer for full-container gameplay and normalized landmark overlays.

## Responsibility

This package owns exact-container/DPR canvas sizing, screen-space gameplay drawing, WebGL2 resources, branding alpha-mask atlas upload, context-loss recovery, capability/degradation truth, and deterministic teardown. One `AeroWebGl2Renderer` belongs to each connected `aero-game`; there is no renderer singleton.

It does not own camera/media, CV, the hidden calibrated athlete grid, input evidence, gameplay judgement/scoring, content loading, UI components, theme precedence, external background acquisition, or assembly policy.

## Public API

- `createAeroWebGl2Renderer()` / `AeroWebGl2Renderer` create independent instances.
- `attach`, `resize`, `detach`, and `destroy` own the canvas lifecycle.
- `renderGameplayFrame` draws Flow, Spatial Grid Boxing, or Semantic Track Boxing from already-resolved serializable targets.
- `renderGameplayCursors` additively draws exactly the semantic nose, left-wrist, and right-wrist gameplay cursors from current calibrated grid-space coordinates. Call it after each gameplay frame; it retains no pose state, filters low-confidence/invalid/repeated roles without invoking accessors, bounds each call to 12 candidates and 12–64 CSS pixels, and renders DPR-invariant black/white/role-layered cursors.
- `renderLandmarkOverlay` preserves normalized pose/hand debug overlays.
- `setTheme`, `setTuning`/`importTuning`, `resetTuning`, `exportTuning`, and `setBackgroundProjection` accept visual data only. Tuning imports are exact `{identity,settings}` records from the public prototype-profile surface.
- `uploadIconAtlas`, `normalizeBrandingIconManifest`, and `rasterizeBrandingIconAtlas` implement the alpha-mask icon path.
- `buildGameplayRenderPlan` exposes deterministic screenshot-free draw commands for tests and diagnostics.
- `getCapabilities` and `describe` expose immutable, serializable state without pixels, screenshots, canvases, textures, or media objects.

The removed `getAeroWebGl2RendererSingleton()` export must not be used by downstream packages.

## Gameplay presentation

Flow and Spatial Grid Boxing share a subtle top-left 4x3 visible playfield. Flow uses the canonical `flow.directional` alpha mask rotated around its center for the exact eight athlete-space directions and the unrotated `flow.directionless` mask for dot notes; no primitive shaft/head overlay remains. Flow masks fade to full alpha in a bounded default 80 ms while staying fully role-colored and fixed at full target size. A same-mask white backing defaults to `1.12x`, and the role-colored approach ring alone contracts to beat center. Hit and miss feedback share a bounded default 350 ms fade; hit adds a 100 ms white pulse and the deterministic `feedback.great` mask scaling from `1` to `1.25`, while miss adds neither. Feedback consumes caller-supplied judgement/progress and owns no timer or score truth. The playfield aspect-fits every container so its cells and icon geometry remain physically square; it is independent of the camera-calibrated athlete-input grid. Semantic Track keeps full-height athlete-left and athlete-right bottom-to-top lanes while compensating target height for viewport aspect so icons remain physically square. Existing Boxing scale/arrival behavior remains intact. Guards span connected cells; standard and crossed guards use distinct branding IDs. Obstacles are exact hatched blocked regions and safe cells have a separate cue. Pause, calibration, tracking-loss dim, and countdown overlays are renderer primitives.

## Branding contract

Approved SVG masters are resolved from `aerobeat-branding/icons/web-gameplay/manifest.json`. DOM consumers use `currentColor`. This package rasterizes those vectors before upload, normalizes RGB to white, preserves the manifest's top-left atlas row mapping, samples only texture alpha, and applies semantic theme color in the fragment shader. WebGL does not parse SVG paths. Rasterization accepts `AbortSignal` so late bitmap completion closes privately without upload. Missing or malformed atlas data is a truthful fallback-shape degradation.

## Container and lifecycle

Assembly passes the exact parent content box and effective DPR to `resize()`. Tuning caps DPR (default 2); portrait, landscape, zero-size, rapid resize, and arbitrary aspect ratios use the same aspect-aware layout. Theme/tuning status exposes active IDs, versions and hashes; renderer-only tuning is live and explicitly reports `tuningRequiresRegeneration: false`. The experimental public `aero.visual.default` and `aero.visual.compact` selections preserve their exact `aerobeat/prototype_tuning_identity` plus bounded `{motionIntensity,roleScale}` settings in status, snapshot and deterministic export telemetry. Imports reject malformed, accessor-bearing, wrong-class, regeneration-required or hash/settings-mismatched records atomically; reset restores the exact default identity. The base bounded renderer tuning hash is `visual-5e8958e4`. The derived renderer tuning hashes are `visual-0c61b03b` for `aero.visual.default` and `visual-38c344f6` for `aero.visual.compact`; the public profile identity hashes and bounded `{motionIntensity,roleScale}` schema remain unchanged. Context restoration rebuilds GPU programs and the private atlas texture. `detach()` releases listeners and GPU objects; `destroy()` is synchronous, terminal, idempotent, and rejects later visual mutation.

## Validation

```bash
npm run check
npm test
npm run test:browser
npm pack --dry-run
```

Unit validation covers deterministic layout, physically square 4x3 cells and Track targets across extreme aspects, exact eight-way Flow rotation, directionless selection, bounded outline/fade/pulse/GREAT tokens, equal hit/miss fade boundaries, connected guards, obstacle/safe cues, instance isolation, zero/rapid resize and DPR, strict 16-entry atlas/viewBox upload and cancellation, theme/tuning narrowing, context restoration, and disposal. Chromium validation renders desktop, 390px portrait, and landscape Flow states; reads framebuffer pixels to prove all eight shader rotations have distinct distributions, directionless differs, white backing and role fill coexist, and hit/GREAT/miss fades reach zero; repeats semantic feedback evidence at requested DPR 1/3 in portrait/landscape; exercises context loss when supported; fails on console noise; and writes ignored evidence under `screenshots/`.

Implementation decisions live under `docs/decisions/`; public product documentation belongs in `aerobeat-web-docs` after integration is accepted.
