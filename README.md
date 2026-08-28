# aerobeat-web-renderer

AeroBeat-owned per-game WebGL2 renderer for full-container gameplay and normalized landmark overlays.

## Responsibility

This package owns exact-container/DPR canvas sizing, screen-space gameplay drawing, WebGL2 resources, branding alpha-mask atlas upload, context-loss recovery, capability/degradation truth, and deterministic teardown. One `AeroWebGl2Renderer` belongs to each connected `aero-game`; there is no renderer singleton.

It does not own camera/media, CV, the hidden calibrated athlete grid, input evidence, gameplay judgement/scoring, content loading, UI components, theme precedence, external background acquisition, or assembly policy.

## Public API

- `createAeroWebGl2Renderer()` / `AeroWebGl2Renderer` create independent instances.
- `attach`, `resize`, `detach`, and `destroy` own the canvas lifecycle.
- `renderGameplayFrame` draws Flow, Spatial Grid Boxing, or Semantic Track Boxing from already-resolved serializable targets.
- `renderLandmarkOverlay` preserves normalized pose/hand debug overlays.
- `setTheme`, `setTuning`, `resetTuning`, `exportTuning`, and `setBackgroundProjection` accept visual data only.
- `uploadIconAtlas`, `normalizeBrandingIconManifest`, and `rasterizeBrandingIconAtlas` implement the alpha-mask icon path.
- `buildGameplayRenderPlan` exposes deterministic screenshot-free draw commands for tests and diagnostics.
- `getCapabilities` and `describe` expose immutable, serializable state without pixels, screenshots, canvases, textures, or media objects.

The removed `getAeroWebGl2RendererSingleton()` export must not be used by downstream packages.

## Gameplay presentation

Flow and Spatial Grid Boxing share a subtle top-left 4x3 visible playfield. The playfield aspect-fits every container so its cells and icon geometry remain physically square; it is independent of the camera-calibrated athlete-input grid. Semantic Track keeps full-height athlete-left and athlete-right bottom-to-top lanes while compensating target height for viewport aspect so icons remain physically square. Targets support role icon/shape, hand color, grayscale/alpha arrival, depth scale, named easing, an approach ring converging at beat center, and hit/miss collapse/dissolve feedback. Guards span connected cells; standard and crossed guards use distinct branding IDs. Obstacles are exact hatched blocked regions and safe cells have a separate cue. Pause, calibration, tracking-loss dim, and countdown overlays are renderer primitives.

## Branding contract

Approved SVG masters are resolved from `aerobeat-branding/icons/web-gameplay/manifest.json`. DOM consumers use `currentColor`. This package rasterizes those vectors before upload, normalizes RGB to white, preserves the manifest's top-left atlas row mapping, samples only texture alpha, and applies semantic theme color in the fragment shader. WebGL does not parse SVG paths. Rasterization accepts `AbortSignal` so late bitmap completion closes privately without upload. Missing or malformed atlas data is a truthful fallback-shape degradation.

## Container and lifecycle

Assembly passes the exact parent content box and effective DPR to `resize()`. Tuning caps DPR (default 2); portrait, landscape, zero-size, rapid resize, and arbitrary aspect ratios use the same aspect-aware layout. Theme/tuning status exposes active IDs, versions and hashes; renderer-only tuning is live and explicitly reports `tuningRequiresRegeneration: false`. Imported tuning hashes are verified. Context restoration rebuilds GPU programs and the private atlas texture. `detach()` releases listeners and GPU objects; `destroy()` is synchronous, terminal, idempotent, and rejects later visual mutation.

## Validation

```bash
npm run check
npm test
npm run test:browser
npm pack --dry-run
```

Unit validation covers deterministic layout, physically square 4x3 cells and Track targets across extreme aspects, named easing and feedback, connected guards, obstacle/safe cues, instance isolation, zero/rapid resize and DPR, strict atlas upload/cancellation, theme/tuning narrowing, context restoration, and disposal. Chromium validation renders desktop, 390px portrait, landscape and Flow states, exercises context loss when supported, fails on console noise, and writes ignored visual evidence under `screenshots/task8-renderer-*.png`.

Implementation decisions live under `docs/decisions/`; public product documentation belongs in `aerobeat-web-docs` after integration is accepted.
