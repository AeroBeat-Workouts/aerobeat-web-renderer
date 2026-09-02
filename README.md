# aerobeat-web-renderer

AeroBeat-owned PlayCanvas gameplay renderer for world-space gameplay and normalized landmark overlays.

## Responsibility

This package owns one PlayCanvas `Application` and graphics device per attached gameplay canvas, exact container/DPR sizing, deterministic world-scene projection, branding alpha-mask atlas upload, context recovery, visual-only debug camera controls, bounded resource pooling, capability truth, and deterministic teardown.

It does not own media, CV, the calibrated athlete grid, gameplay input, score or judgement decisions, content loading, song time, transport, DOM presenters, or assembly policy. Every frame is derived from caller-owned absolute `nowMs` and resolved target records.

## Public API

- `createAeroPlayCanvasRenderer()` / `AeroPlayCanvasRenderer` create independent renderer instances with service identity `aero.renderer.playcanvas`.
- `attach`, `resize`, `detach`, and `destroy` own the canvas lifecycle.
- `renderGameplayFrame` renders `flow`, `boxing_spatial_grid`, or `boxing_lanes` through the same PlayCanvas application.
- `renderGameplayCursors` and `renderLandmarkOverlay` retain calibrated cursor and debug-landmark presentation without retaining pose state.
- `setDebugCameraEnabled` and `resetDebugCamera` provide Test-only free-fly presentation controls. Right-click toggles pointer capture (with bounded fallback when pointer lock is unavailable); Escape, pointer-lock loss, or a second right-click exits. Actual pointer-lock exit keeps the compatible capture mode private until `pointerlockchange` confirms release, then restores the exact pre-capture/default canvas cursor; a late lock from a legacy undefined-return request is immediately released even after fallback already exited logically, while document-global pointer-lock errors cannot alter an instance whose canvas still owns the lock. A two-finger tap toggles touch capture and captured one-finger drag looks. Held `WASD`, `Q`/`E`, and Shift integrate camera-relative movement only on caller-owned render frames.
- `releaseDebugCameraAuthoringInput`, `loadDebugCameraPose`, and `exportDebugCameraPoseArtifact` form the private Visual Test authoring seam. The shared Flow/Lanes/Grid default is Derrick's reviewed canonical pose: position `{x:0.05,y:1,z:5}`, zero Euler rotation, FOV `48`, near `0.1`, and far `80`. Load strictly normalizes unknown v1 data, releases capture and movement, waits for confirmed pointer-lock release, rejects stale/inactive renderer state, and applies only the live debug camera; loaded projection remains intact through further movement/look tuning. Export is accepted only for an attached, active, already-rendered debug camera with no capture or movement state. It reapplies six-decimal canonical values before returning deeply immutable local data, UTF-8 bytes, fixed-order two-space JSON with LF/trailing newline, filename `aerobeat-gameplay-camera-pose.v1.json`, and MIME `application/json`; neither loading nor export enters `describe()` or telemetry.
- `setDebugCameraMovementIntent(intent, active)` accepts only `forward`, `back`, `left`, `right`, `down`, or `up` for accessible DOM hold controls. `setDebugCameraSpeedMode(mode)` accepts only `normal` or `boost`. Disabling, visibility loss, blur, detaching, or destroying uses the same idempotent confirmed-release path and clears all capture, cursor policy, keys, DOM holds, touches, movement timing, listeners, and pointer lock.
- `setTheme`, `setTuning`/`importTuning`, `resetTuning`, `exportTuning`, and `setBackgroundProjection` accept visual data only.
- `uploadIconAtlas`, `normalizeBrandingIconManifest`, and `rasterizeBrandingIconAtlas` implement the canonical alpha-mask icon path.
- `buildGameplaySceneModel` exposes the deterministic screenshot-free world model used by tests and diagnostics.
- `getCapabilities` and `describe` expose immutable, serializable state without pixels, screenshots, canvases, textures, or media objects.

The legacy `AeroWebGl2Renderer`, `createAeroWebGl2Renderer`, `aero.renderer.webgl2`, `buildGameplayRenderPlan`, and 2D/2.5D gameplay plan are removed rather than aliased.

## World and timing contract

The authoritative body grid is row-major from top-left: four columns map to X `[-2.4, -0.8, 0.8, 2.4]`, and three rows map to Y `[2.4, 1.2, 0]`. Time maps only to world Z with `z = -(timestampMs - nowMs) * worldUnitsPerMs`: future events are farther toward world `-Z` and approach zero. The fixed athlete camera sits on world `+Z`, looks along camera-local/world `-Z`, and therefore projects world `+X` screen-right. Source scoring cells, timestamps, judgements, variants, and conversion records are never rewritten by the renderer.

One canonical `aerobeat/gameplay_camera_pose` v1 record owns fixed play, debug initialization, Reset, and projection. Its conventions are `playcanvas_world`, `right_handed`, world up `+Y`, camera forward `local_-Z`, and timeline future `world_-Z`; roll is exactly zero. Authoring bounds are position X `[-40,40]`, Y `[-8,32]`, Z `[-72,32]`; pitch `[-77.349303,77.349303]` degrees; finite yaw input `[-360000,360000]` normalized to `[-180,180)`; vertical FOV `[1,179]`; near clip `[0.001,10]`; far clip `[1,10000]`; and near must remain below far. The current migrated canonical default remains `(0,3.15,7.8)`, Euler `(-7.448451,0,0)`, projection `(48,0.1,80)` until a separately reviewed authored artifact explicitly replaces it.

The floor displays separate late, active, and early timing-window segments. It replaces timing rings/circles. Transparent targets and obstacles use depth testing with disabled depth writes and deterministic far-to-near ordering.

Flow uses canonical directional/directionless atlas masks on world-space targets. Duration obstacles use caller-owned `intervalStartMs`/`intervalEndMs` (or normalized equivalent) to create one translucent 3D volume per occupied cell. Volumes retain truthful Z duration and disappear only after their interval and spent-cull contract.

Boxing Spatial Grid maps its exact 4x3 cells, blocked/safe cells, punches, guards, and obstacles into the same world. Boxing Lanes maps left/right lane cues and authoritative asymmetric timing windows into that world without changing semantic target records.

## Manual PlayCanvas lifecycle

Assembly owns the display cadence. The facade never starts an engine RAF and never advances gameplay time. PlayCanvas 2.21.4 still requires its per-application activation/update path, so each facade disables `Application.requestAnimationFrame` and invokes bounded manual ticks only from caller render requests. Initial framegraph/application activation is bootstrapped synchronously. Entities are constructed with their explicit owning application so multiple `<aero-game>` instances remain isolated.

Context loss removes the private atlas texture from PlayCanvas resource tracking. The next caller-owned render after restoration recreates it, avoiding stale extension state and autonomous recovery timers. `detach()` and synchronous idempotent `destroy()` release listeners, entities, materials, textures, the application, and pointer lock.

## Branding contract

Approved SVG masters are resolved from `aerobeat-branding/icons/web-gameplay/manifest.json`. This package rasterizes the complete semantic set into a bounded white RGB/alpha atlas, preserves top-left manifest mapping, and applies semantic role color through PlayCanvas materials. Missing or malformed data truthfully degrades to fallback geometry. Rasterization accepts `AbortSignal` and closes late bitmap work privately.

## Validation

```bash
npm test
npm run test:browser
npm pack --dry-run --json
```

Unit checks cover exact 4x3 coordinates, absolute timestamp-to-Z projection, timing segment equations, all three presentations, deterministic transparent order, duration obstacle volume bounds, spent/cull states, icon selection/rotation, bounded targets, strict atlas normalization, tuning, and rejection of removed exports.

Chromium validation covers two independent PlayCanvas applications, zero engine RAF, one context per canvas, displayed alpha-composed pixels, portrait/landscape DPR 1/3 sizing, Flow depth and duration volumes, timing-zone colors, Boxing Grid and Lanes, cursors, normalized landmarks, debug-camera input and cleanup, transparent clearing, detach/reconnect, idempotent destroy, context loss/restoration, atlas recreation, and zero console noise.

Implementation decisions live under `docs/decisions/`; product documentation belongs in `aerobeat-web-docs` after integration is accepted.
