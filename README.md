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

Flow and Spatial Grid Boxing share a subtle top-left 4x3 visible playfield. Flow arrow cues render all eight athlete-space directions, including deterministic bounded diagonal shafts, while dot notes remain directionless. Direction shafts and heads select theme-derived black-or-white luminance contrast against the effective target color, so direction remains visible through shape rather than hand color alone. The playfield aspect-fits every container so its cells and icon geometry remain physically square; it is independent of the camera-calibrated athlete-input grid. Semantic Track keeps full-height athlete-left and athlete-right bottom-to-top lanes while compensating target height for viewport aspect so icons remain physically square. Targets support role icon/shape, hand color, grayscale/alpha arrival, depth scale, named easing, an approach ring converging at beat center, and hit/miss collapse/dissolve feedback. Guards span connected cells; standard and crossed guards use distinct branding IDs. Obstacles are exact hatched blocked regions and safe cells have a separate cue. Pause, calibration, tracking-loss dim, and countdown overlays are renderer primitives.

## Branding contract

Approved SVG masters are resolved from `aerobeat-branding/icons/web-gameplay/manifest.json`. DOM consumers use `currentColor`. This package rasterizes those vectors before upload, normalizes RGB to white, preserves the manifest's top-left atlas row mapping, samples only texture alpha, and applies semantic theme color in the fragment shader. WebGL does not parse SVG paths. Rasterization accepts `AbortSignal` so late bitmap completion closes privately without upload. Missing or malformed atlas data is a truthful fallback-shape degradation.

## Container and lifecycle

Assembly passes the exact parent content box and effective DPR to `resize()`. Tuning caps DPR (default 2); portrait, landscape, zero-size, rapid resize, and arbitrary aspect ratios use the same aspect-aware layout. Theme/tuning status exposes active IDs, versions and hashes; renderer-only tuning is live and explicitly reports `tuningRequiresRegeneration: false`. The experimental public `aero.visual.default` and `aero.visual.compact` selections preserve their exact `aerobeat/prototype_tuning_identity` plus bounded `{motionIntensity,roleScale}` settings in status, snapshot and deterministic export telemetry. Imports reject malformed, accessor-bearing, wrong-class, regeneration-required or hash/settings-mismatched records atomically; reset restores the exact default identity. Context restoration rebuilds GPU programs and the private atlas texture. `detach()` releases listeners and GPU objects; `destroy()` is synchronous, terminal, idempotent, and rejects later visual mutation.

## Validation

```bash
npm run check
npm test
npm run test:browser
npm pack --dry-run
```

Unit validation covers deterministic layout, physically square 4x3 cells and Track targets across extreme aspects, named easing and feedback, connected guards, obstacle/safe cues, instance isolation, zero/rapid resize and DPR, strict atlas upload/cancellation, theme/tuning narrowing, context restoration, and disposal. Chromium validation renders desktop, 390px portrait, landscape and Flow states, asserts every evidence surface, canvas and target is fully contained in the captured viewport with no horizontal overflow, reads framebuffer pixels to prove every arrow differs from a directionless target with deterministic luminance contrast and distinct opposite-direction distributions under default/dark/light themes, exercises context loss when supported, fails on console noise, and writes ignored baseline evidence under `screenshots/task8-renderer-*.png` and live-profile desktop/390px/landscape evidence under `screenshots/task11-renderer-profile-*.png`.

Implementation decisions live under `docs/decisions/`; public product documentation belongs in `aerobeat-web-docs` after integration is accepted.
