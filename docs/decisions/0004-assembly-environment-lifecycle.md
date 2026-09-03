# Decision 0004: Assembly-owned photosphere lifecycle

- Status: Accepted
- Date: 2026-09-03

## Context

The earlier environment candidate parsed an alien-moon GLB whose embedded provenance proved third-party and incompatible with the approved ownership boundary. That payload and container path are rejected. Assembly instead owns the pinned `luminious-ice-cave-photosphere` JPEG derived from the purchased, AeroBeat-controlled splat at environment commit `2a3072ff21236ee3d47c3ff3eb813d85eb1ef6c2`. The renderer owns its PlayCanvas application, scene graph, GPU resources, fixed gameplay camera, and teardown, while assembly owns packaging and selection.

## Decision

Keep only the private facade methods `setEnvironmentAsset(descriptor|null)` and `setEnvironmentVisible(boolean)`. The exact descriptor has `id`, same-origin package-local `url`, `mimeType`, `bytes`, `sha256`, `projection`, `dimensions`, zero `orientation`, `centerForward`, and `worldUp`. It accepts only `luminious-ice-cave-photosphere`, `image/jpeg`, `2,210,289` bytes, SHA-256 `ff142b3ce3d3509ab3cfafcfc6a8cc2d3b0ff737852072d3a7aea8075478eed5`, `equirectangular`, `[4096,2048]`, zero yaw/pitch/roll, center `−Z`, and up `+Y`. Unknown keys or drift fail closed.

Resolve the URL against browser location and reject non-HTTP(S), credentialed, fragmented, redirected, or cross-origin requests. Require the response URL, MIME type, byte length, and SHA-256 to remain exact. Decode only the already-verified local JPEG bytes through `createImageBitmap`; decoding performs no secondary network request, and decoded dimensions must equal the descriptor.

Each renderer/application creates one radius-30 procedural UV sphere with 16 latitude bands, 32 longitude bands, and exactly 1,024 triangles. Geometry and UVs encode the source convention directly: source center `−Z`, `+X` at the right quarter, `−X` at the left quarter, seam at `+Z`, and `+Y` at the top, without horizontal mirroring. The fixed gameplay camera is at the sphere center. The outward-wound mesh uses front-face culling so its interior is visible, with frustum culling disabled. Its cloned renderer-owned material is opaque and unlit/emissive, with depth test and depth write disabled, and occupies only PlayCanvas's built-in Skybox layer before gameplay. Track, targets, transparent walls, and feedback therefore remain visible throughout world `z=0…−72`; gameplay lighting, coordinates, camera transform, and projection remain unchanged.

Loading and errors leave the existing gradient fallback and gameplay visible. Visibility only enables or disables the ready root; it never unloads, decodes, or refetches. Replacement, context loss, detach, and destroy abort first, increment generation, then destroy the root, material, texture, mesh, and decoded image. No container asset or environment geometry payload enters the PlayCanvas asset registry. Stale fetch/decode completion cannot attach. Context restoration starts a fresh generation. Each renderer owns independent resources. No animation frame or autonomous rendering is added.

`describe().environment` is bounded to `id`, `state`, requested `visible`, `fallback`, expected `hash`, instantiated-sphere `count`, and `projection`. It never includes URL, bytes, pixels, media, dimensions, resource handles, or private identifiers. This seam remains renderer-private assembly wiring and does not extend AeroBeat host/public contracts.

## Consequences

- Assembly packages and serves the pinned JPEG at a same-origin URL; the renderer npm package contains no environment JPEG, GLB, or other environment payload.
- Actual Chromium tests inject the real owned JPEG from its environment checkout only as a local test route, verify cardinal orientation and center-forward pixels, and do not track a copied fixture.
- Computed Camera mode calls `setEnvironmentVisible(false)`; the ready texture and sphere remain resident and reappear byte-identically without a request.
- Fresh GPU capture reproducibility remains limited as documented by the owning manifest; runtime verification concerns the pinned JPEG bytes, not regeneration of the purchased splat capture.
