# Decision 0004: Assembly-owned photosphere lifecycle

- Status: Accepted
- Date: 2026-09-03

## Context

Assembly owns the selected environment catalog, payload provenance, package emission, labels, defaults, and per-id configuration. The renderer owns only its PlayCanvas application, one generic verified photosphere, transform application, scene graph/GPU lifecycle, and bounded diagnostics. Environment selection remains private Visual Test assembly wiring rather than an AeroBeat host/public contract.

## Decision

Keep private facade methods `setEnvironmentAsset(descriptor|null)` and `setEnvironmentVisible(boolean)`, and add private `setEnvironmentTransform(transform)`. Do not export the environment owner or its normalizers from the package index.

A descriptor is an exact plain own-data record with keys `id`, `url`, `mimeType`, `bytes`, `sha256`, `projection`, `dimensions`, `centerForward`, and `worldUp`. It rejects symbols, accessors, arrays/other prototypes, missing/extra keys, and malformed values. The generic id is lowercase kebab case with length `1…96`; the URL string is bounded to 2,048 characters; MIME is `image/jpeg`; bytes are a safe integer in `1…16,777,216`; SHA-256 is 64 lowercase hexadecimal characters; projection is `equirectangular`; dimensions are exactly `[4096,2048]`; center is `−Z`; and up is `+Y`. Mutable orientation is deliberately absent from the descriptor. Renderer production source owns no catalog id, payload byte count, payload hash, or environment payload.

Resolve the URL against browser location and reject non-HTTP(S), credentialed, fragmented, redirected, or cross-origin requests before fetch or resident-resource mutation. Require response URL, MIME type, byte length, and SHA-256 to remain exact. Decode only the already-verified local JPEG bytes through `createImageBitmap`; decoding performs no secondary request, and decoded dimensions must equal the descriptor.

The transform is a separate exact plain own-data record `{position:{x,y,z},rotationDegrees:{xPitch,yYaw,zRoll},scale}`. Every number is finite and canonicalized to six decimals with negative zero removed. Position axes are bounded to `[-30,30]`, rotations to `[-180,180]`, and uniform scale to `[0.25,4]`. The additional invariant `hypot(position) <= 30 * scale - 0.5` keeps the camera safely inside the radius-30 sphere. Invalid descriptors and transforms reject atomically without clamping or mutation. A transform can be retained before descriptor selection/attachment, applies immediately to a ready root without fetch/decode/recreation, and survives replacement and context restoration.

Each renderer/application creates one radius-30 procedural UV sphere with 16 latitude bands, 32 longitude bands, and exactly 1,024 triangles. Geometry and UVs encode source center `−Z`, `+X` at the right quarter, `−X` at the left quarter, seam `+Z`, and `+Y` at the top without horizontal mirroring. The outward-wound mesh uses front-face culling so its interior is visible, with frustum culling disabled. Its renderer-owned material is opaque and unlit/emissive, with depth test/write disabled, and occupies only PlayCanvas's built-in Skybox layer before gameplay. Track, targets, transparent walls, and feedback remain visible throughout world `z=0…−72`; gameplay lighting, coordinates, camera rotation, and projection remain unchanged.

On every camera-pose application and caller-owned render tick, the photosphere root world position becomes active camera world position plus configured position. It does not inherit camera rotation. Root Euler rotation maps pitch to PlayCanvas X, yaw to Y, and roll to Z; local scale is truthfully `(scale,scale,scale)`. At centered position scale changes radius but not angular zoom.

Descriptor replacement normalizes first. An equal descriptor is a no-op. A different descriptor or `null` synchronously aborts the old generation, increments generation, destroys root/material/texture/mesh/decoded image, and clears the resident record before a fresh verified request. At most one environment root and texture are resident. Replacement loading/error leaves the gradient and gameplay visible and never continues displaying the prior/wrong asset. Visibility only enables/disables a ready root and never fetches or mutates selection/transform. Browser HTTP caching with `force-cache` is allowed, but selecting an earlier descriptor still issues a verified request.

Context loss, detach, and destroy abort and dispose current work/resources. Context restoration starts a fresh generation for the latest descriptor and reapplies the latest transform. Stale fetch/decode completion closes staged resources and cannot attach. Reconnect and separate renderer instances own independent generations and resources. No engine animation frame, autonomous timer, environment cache, or PlayCanvas asset-registry entry is added.

`describe().environment` remains bounded to `id`, `state`, requested `visible`, `fallback`, expected `hash`, instantiated-sphere `count`, and `projection`. It excludes URL, bytes, transform, dimensions, pixels, media, and resource handles; assembly already owns authoring input state. Public telemetry continues to strip the complete environment object.

## Consequences

- Assembly packages and serves its catalog JPEGs at same-origin URLs; this renderer package contains no environment JPEG, catalog, owned id/hash constants, or other environment payload.
- Tests may inject an assembly-owned JPEG as a local fixture while validating generic descriptor identities and replacement.
- Computed Camera mode calls `setEnvironmentVisible(false)`; the ready texture/root remain resident and reappear byte-identically without a request.
- Future splat configuration may reuse position/rotation/scale concepts, but this renderer accepts only the current equirectangular JPEG descriptor contract.
