# aerobeat-web-renderer

AeroBeat-owned WebGL2 renderer facade for shared browser rendering and normalized landmark overlays.

## Responsibility

This package owns the durable WebGL2 rendering path for AeroBeat web. The first scaffold exposes a singleton-shaped renderer facade that attaches to an `HTMLCanvasElement`, acquires a `WebGL2RenderingContext`, reports capability/status snapshots, clears or renders smoke frames, and draws normalized pose/hand landmarks as WebGL2 points and lines over fitted media content rectangles.

It does not own camera permission, video playback lifecycle, CV inference, input routing, gameplay scoring, UI components, content loading, or product assembly wiring.

Temporary 2D canvas overlays may exist in proving tools while seams are still moving, but this repo owns the final shared overlay renderer for browser gameplay and debug visuals.

## Public API Surface

- `src/renderer-facade.js` exports `createAeroWebGl2Renderer()`, `getAeroWebGl2RendererSingleton()`, and the `aero.renderer.webgl2` service ID.
- `src/landmark-mapping.js` exports mapping utilities for fitted media rectangles and normalized landmark conversion to viewport or WebGL clip space.
- `src/index.js` exports the public package surface for `@aerobeat/web-renderer`.

## Overlay Mapping

Renderer overlay calls accept normalized landmark objects with public `id`, `x`, `y`, `z`, and `v` fields. Surface descriptors accept viewport size, optional intrinsic media size, `fitMode` (`contain`, `cover`, or `stretch`), `mirrored`, and an optional explicit `contentRect`.

The mapping helpers are intentionally compatible with public metadata from `@aerobeat/web-video`: the renderer consumes media surface descriptors but does not control media playback or import video internals.

## Adjacent Repos

- `aerobeat-web-video` owns browser media lifecycle and media surface descriptors.
- `aerobeat-web-cv` owns pose-frame production.
- `aerobeat-web-input` owns gameplay-facing input routing.
- `aerobeat-web-ui` owns visible UI components and screens.
- `aerobeat-web-assembly` wires concrete services into the product shell.

## Source Boundary

Runtime code lives under `src/` and is exposed through `package.json` `exports`. Tests, demos, scenes, debug data, screenshots, traces, and Playwright harnesses live under `.testbed/`.

## Public Imports

This scaffold has no runtime package imports. Future code may import only declared public exports from other `@aerobeat/web-*` packages. Do not import sibling repo internals, private testbed files, unexported source paths, or vendor-native shapes across domain boundaries.

## JavaScript Posture

- Use JavaScript, native ES modules, `// @ts-check`, and JSDoc.
- Every exported value, public structure, service shape, event payload, and typedef needs JSDoc.
- Do not use `any`, star-shaped JSDoc escapes, or undocumented escape hatches.
- Unknown external values must be narrowed into documented shapes before use.

## Validation

Run these commands before handoff:

```bash
npm run check
npm test
npm run test:browser
```

The current checks are no-dependency scaffold validators for strict JSDoc/no-escape posture, public import boundaries, component-only screen/scene composition, Playwright console-warning/error posture, and renderer facade/mapping smoke behavior.

When a browser-visible package needs mobile or remote validation, add `npm run testbed:serve`. It must state the host, port, cache-busting/version display, QR/link output, served roots, and HTTPS or secure-context path for Tailscale devices.

## Docs Handoff

Keep repo-local implementation notes and accepted decisions under `docs/`. Public contributor/user docs belong in `aerobeat-web-docs`; mirror cross-repo decisions there after they are accepted.
