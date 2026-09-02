# Decision 0002: PlayCanvas world gameplay renderer

- Status: Accepted
- Date: 2026-08-31

## Context

The previous custom WebGL2 gameplay path rendered normalized 2D and perspective-styled 2.5D plans. It could not communicate genuine world depth clearly, and maintaining separate visual paths for Flow, Boxing Spatial Grid, and Boxing Lanes would duplicate lifecycle, sizing, material, and testing work.

Gameplay/content remain authoritative for the row-major top-left 4x3 grid, event intervals, song time, eligibility, judgements, score, variants, and conversions. Assembly already owns the display loop and must not acquire a second animation clock.

## Decision

Use PlayCanvas Engine 2.21.4 as the sole production gameplay renderer. Keep DOM components for accessible transport, HUD, menus, calibration, status, and debug help.

Expose only:

- `AeroPlayCanvasRenderer`
- `createAeroPlayCanvasRenderer`
- `aero.renderer.playcanvas`
- `buildGameplaySceneModel`

Delete the legacy gameplay plan and do not provide aliases, fallbacks, or a feature flag.

Use one PlayCanvas `Application` and graphics device per attached canvas. Assembly remains the only cadence owner. The facade suppresses PlayCanvas RAF scheduling and manually activates/ticks the owning application from caller render requests. Every `Entity` is bound explicitly to its owning application to preserve multi-instance isolation.

Project authoritative grid/time data into world space:

- four columns become fixed X coordinates;
- three top-left rows become fixed Y coordinates;
- absolute time delta becomes Z depth;
- a fixed perspective athlete camera sits on world `+Z` and looks along camera-local/world `-Z`, as superseded and detailed by `world-view-handedness-migration.md`;
- late/active/early timing windows are colored floor segments;
- Flow intervals become translucent duration volumes;
- Flow, Boxing Spatial Grid, and Boxing Lanes share the application/material/pooling lifecycle.

Transparent geometry uses depth testing, disabled depth writes, and deterministic far-to-near ordering. The renderer does not infer score, hits, source cells, or song time.

Visual Test may enable a presentation-only free-fly camera with right-mouse pointer lock, mouse look, `WASD`, `Q`/`E`, Shift boost, and reset. Lifecycle boundaries must disable it and release all listeners and pointer lock.

## Consequences

- The renderer dependency and browser bundle grow by PlayCanvas.
- Custom gameplay shaders and 2D draw-plan maintenance disappear.
- Multiple applications require explicit application ownership and manual tick activation because PlayCanvas retains process-global application state internally.
- Context recovery must remove the atlas texture at loss and recreate it on the next caller-owned render to avoid stale extension state.
- Renderer tests must sample the displayed canvas rather than assuming the currently bound raw WebGL framebuffer represents PlayCanvas output.
- DOM and PlayCanvas form the production rendering architecture; neither owns the other's responsibilities.
