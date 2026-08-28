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

Flow and Spatial Grid Boxing share a subtle normalized top-left 4x3 visible playfield. It is independent of the camera-calibrated athlete-input grid. Semantic Track uses athlete-left and athlete-right bottom-to-top lanes with a separate defensive layer. Targets support role icon/shape, hand color, grayscale/alpha arrival, depth scale, an approach ring converging at beat center, and hit/miss collapse/dissolve feedback. Guards span connected cells; standard and crossed guards use distinct branding IDs. Obstacles are exact hatched blocked regions and safe cells have a separate cue. Pause, calibration, tracking-loss dim, and countdown overlays are renderer primitives.

## Branding contract

Approved SVG masters are resolved from `aerobeat-branding/icons/web-gameplay/manifest.json`. DOM consumers use `currentColor`. This package rasterizes those vectors before upload, normalizes RGB to white, samples only texture alpha, and applies semantic theme color in the fragment shader. WebGL does not parse SVG paths. Missing atlas data is a truthful fallback-shape degradation.

## Container and lifecycle

Assembly passes the exact parent content box and effective DPR to `resize()`. Tuning caps DPR (default 2); portrait, landscape, and arbitrary aspect ratios use the same normalized layout. Context restoration rebuilds GPU programs and the private atlas texture. `detach()` releases listeners and GPU objects; `destroy()` is synchronous, terminal, and idempotent.

## Validation

```bash
npm run check
npm test
npm run test:browser
npm pack --dry-run
```

Unit validation covers deterministic layout, exact 4x3 cells, Track lanes, animation convergence, guard/obstacle/safe cues, instance isolation, resize/DPR, atlas upload, context restoration, and disposal. Chromium validation renders portrait/landscape instances, resizes them, exercises context loss when supported, fails on console noise, and writes ignored visual evidence to `screenshots/task8-renderer-chromium.png`.

Implementation decisions live under `docs/decisions/`; public product documentation belongs in `aerobeat-web-docs` after integration is accepted.
