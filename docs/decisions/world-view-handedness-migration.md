# World/view handedness migration

- Status: Accepted for Task 2 implementation
- Date: 2026-09-01
- Bead: `aerobeat-web-assembly-aue`

## Exact observed failure

Physical webcam play on audited assembly `0.0.32` shows horizontal athlete motion opposite the expected screen direction. Anatomical left/blue and right/green wrist cursors appear on the opposite visual sides, and nose motion is reversed. The failure is at renderer projection: the current fixed camera is at world Z `-7.8`, looks toward positive world Z, and therefore projects increasing world X toward screen-left.

## Expected behavior

MediaPipe anatomical labels and raw normalized X remain unchanged. The single CSS selfie-video mirror remains unchanged. Input performs the existing single camera-to-athlete transform `athleteX = 1 - rawX`. Assembly forwards athlete values unchanged. Renderer left remains blue and renderer right remains green. World `+X` must project screen-right and world `+Y` must project up while exact scoring, timeline, grid, Flow direction, and role semantics remain unchanged.

## Execution path

1. MediaPipe supplies anatomical `left_wrist`, `right_wrist`, and `nose` raw camera coordinates.
2. Video presentation applies the one approved CSS selfie mirror.
3. Input converts raw camera X to athlete X once with `1 - x`.
4. Assembly publishes calibrated athlete-space cursors without another mirror.
5. Renderer maps normalized cursor/grid X monotonically to world X and assigns blue to left and green to right.
6. PlayCanvas cameras look down camera-local `-Z`. The old fixed camera is behind the origin on world `-Z` and is rotated to face world `+Z`; that view rotation reverses projected world X.

## Most likely root cause

The renderer encoded future timeline depth as world `+Z`, forcing the athlete camera to face world `+Z`. This nonconventional view basis mirrors horizontal projection even though the semantic pipeline and world-X mapping are coherent. The causal proof is a sensitivity test that keeps asymmetric semantic values and role colors fixed while comparing `camera.worldToScreen` and framebuffer color centroids before and after only the world/view-basis migration.

## Alternative hypotheses

1. Swapped MediaPipe anatomical labels: contradicted by raw landmark names and values.
2. Missing or duplicate selfie mirror: contradicted by one CSS video mirror and the existing input `1-x` boundary.
3. Swapped role colors: contradicted by renderer theme and target-role mapping.
4. Assembly negates cursor X: contradicted by staged cursor records reaching the renderer unchanged.
5. Flow source orientation defect: contradicted by canonical directional records and rotation mapping; the camera projection reverses the rendered horizontal result.

## Why previous fixes failed

No Task 2 production fix has been attempted. Earlier debug-camera fixes correctly made a camera at negative Z face positive-Z gameplay and preserved user-relative controls, but they retained the underlying future-`+Z` convention. Existing tests asserted scene visibility, raw world coordinates, and camera-relative movement without asserting world-X screen projection or left/right framebuffer centroids.

## Unknowns

Physical hardware confirmation remains for independent QA after this source correction. Automated source proof now covers fixed/debug camera, all presentations, portrait/landscape DPR 1/3, direct/real cross-origin iframe rendering, lifecycle/reconnect/context recovery, and Flow horizontal/diagonal icons; it does not claim a human webcam PASS.

## Minimal reproduction

Stage raw landmarks `left_wrist.x=.80`, `right_wrist.x=.20`, and `nose.x=.65`. The unchanged input transform yields athlete values `.20`, `.80`, and `.35`. Render world points at equal depth with X `-2.4` and `+2.4`, then render blue-left/green-right targets or cursors. On old source, `camera.worldToScreen(+X).x < camera.worldToScreen(-X).x`, the green/right centroid is left of the blue/left centroid, and athlete-right cursor values project screen-left.

## Proposed verification

First land the new expectation without changing production and capture its old-source failure plus observed coordinates/centroids. Then migrate the basis atomically and rerun the same test. The semantic stage must remain byte-for-byte equal while only screen projection changes. Unit tests additionally lock negative future Z, timing-zone order, far-to-near transparent sorting, duration volume bounds, fixed/debug pose, movement directions, and Flow icon rotations.

## Recommended fix

Use one public mapping `z = -(timestampMs - nowMs) * worldUnitsPerMs`. Put fixed/reset cameras on positive world Z looking along local/world `-Z`. Mirror every renderer-owned depth-sign-dependent datum coherently: timing segments, lanes/floors and cell biases, targets/obstacles, transparent sort depth/order, cursor/landmark overlay biases, debug pose/yaw/bounds and camera-relative movement expectations. Do not negate cursor X, swap labels/colors, add a mirror, or implement the Task 3 camera-pose artifact.

## Implementation and verification result

The inherited replacement work correctly migrated the production timestamp sign, fixed/reset cameras, timing segments, lane depth, cell foreground bias, target/obstacle depth, transparent sort, overlay bias, debug yaw/position/bounds, and camera-relative controls. It was incomplete in tests and docs: the initial focused proof used the wrong top-origin Y assertion, allowed timing-zone color contamination, covered only direct landscape DPR1/Grid, left old obstacle/debug expectations in the main browser suite, emitted `-0` at exact impact time, and left the original renderer decision stale. Those defects were retained as evidence and corrected rather than discarding the valid production changes.

Against detached old source `b50bcb5`, the staged proof recorded camera `[0,3.15,-7.8]` facing world `+Z`; world `-2.4/+2.4` projected to X `556.23/287.77`, and blue-left/green-right cursor centroids were `531.68/311.34`. The new expectation failed at the fixed-camera-basis assertion before production migration. On corrected source, the same landscape DPR1 proof records camera on `+Z` facing `-Z`, world X at `287.77/556.23`, grid framebuffer centroids `284.52/558.48`, lane centroids `348.02/495.24`, and blue-left/nose/green-right cursor centroids `311.34/364.64/531.68`.

The final focused matrix runs direct and real cross-origin iframe pages at portrait/landscape and requested DPR `1/3` (renderer cap `2`). It proves exact raw/anatomical labels and one `1-x` athlete transform, top-origin `worldToScreen` X/Y orientation, Grid cells `0/3`, Boxing lane roles, Flow right/diagonal model rotations and framebuffer principal axes, fixed/debug camera basis, Right→world `+X`, deterministic portrait clipping of extreme staged points, detach/reconnect projection, bounded scalar-only evidence, and zero unexpected console noise. The complete existing Chromium suite independently retains fine/coarse pointer/touch capture, Normal/Boost movement, reset, pause/blur/hidden/detach/destroy cleanup, context loss/restoration, atlas recovery, all modes, DPR sizing, and lifecycle behavior.

## Debugging record

```text
Problem: Athlete/grid horizontal handedness is reversed on screen.
Observed symptom: Nose movement and blue-left/green-right cursors appear on opposite screen sides.
Root cause: Future +Z forces a camera at -Z facing +Z, which projects world +X screen-left.
Evidence: Semantic source/input/assembly mappings are monotonic and role-correct; PlayCanvas local -Z view math predicts and the new sensitivity test measures reversed worldToScreen/framebuffer sides.
Failed approaches: No Task 2 fix attempted; prior camera work retained future +Z and lacked projection-side assertions.
Corrective action: Atomically adopt camera +Z/local-world -Z and future world -Z across all depth-dependent renderer data.
Verification test: Fixed staged values plus worldToScreen and framebuffer color centroids before/after, with all-mode/icon/control/lifecycle matrices.
Related files/components: src/gameplay-scene-model.js, src/renderer-facade.js, renderer unit/Chromium tests, assembly cursor/product-shell tests and docs.
Remaining uncertainty: Physical hardware confirmation after QA.
```
