# Diagnose Boxing knee pads shifted right of measured knees

## Exact observed failure

Derrick reports that in **Boxing Play** the 3D knee pads track his knees but appear **far to the right**, unlike wrist equipment. His camera frames are not available here. The signed 0.0.144 nonpersonal CPU-Worker Play did show real native pads, but its left pad was often projected around x493–505 in an 844px canvas while the associated knee coordinate was interpreted as a judge-space world X. This identifies a placement defect in code; it does not establish the precise pixel offset in Derrick's personal Glitch camera.

## Expected behavior

The same calibrated athlete-space horizontal coordinate must land at the same **presentation-space X** whether it is a measured wrist or knee. Knee pad, yellow marker and optional *visual* collider volume must coincide with the visible measured knee while the input's full-triple knee scoring geometry, confidence and 150-ms freshness remain untouched. No camera-parallax, mirror or new calibration control is requested.

## Execution path

The CPU Worker supplies measured camera landmarks. Input `body-grid-service.js` passes wrist and knee landmarks through `cameraPreviewToAthlete()` and `normalizeAgainstBounds()`. It puts wrist coordinates in `latestEvidence.anchors` and knee coordinates in separately measured visual/scored leg snapshots. Assembly `rendererFrame()` forwards the latter unchanged as `kneeVisualJoints` / strict `kneeJoints`. Renderer `gameplay-scene-model.js:kneeVisualObjects()` currently places hip/knee/ankle at `x = 4 * normalizedX - 0.5` directly in a **presentation-space** scene object. In contrast, the renderer's `applyResolvedEquipmentPose()` places wrist equipment through `judgeToPresentationPoint(pose.anchor)`; assembly `equipmentColliderAnchors()` likewise computes `judgeX = 4 * normalizedX - 0.5` and then applies `judgeToPresentationPoint`. The shared contract subtracts **1.5 world units** from judge X for presentation. Thus a knee and wrist at identical calibrated X differ by exactly +1.5 world units on screen. The scene camera projects both on the same frame; the pad/marker follow the knee over time but remain translated right.

## Most likely root cause

The knee renderer mistook **judge X** for **presentation X**, bypassing a shared conversion already imported in `gameplay-scene-model.js`. Its unit test at `scripts/validate-knee-visuals.js:10,37,47` explicitly baked in the unconverted right-shifted values (for normalized X=.25 it expects X=.5 rather than X=-1). Existing signed direct/iframe traces show two knees separated by roughly .82 world units / 76px and pads at about x493–571; the fixed 1.5-unit error is approximately 135px at this camera depth. That scale and direction fit Derrick's report. The exact correction is `judgeToPresentationPoint({x:4 * point.x - .5, y:2.5 - 3 * point.y})`, retaining measured Z=.45. This is **visual-only**: changing scored knee input coordinates to mask the shift would corrupt hit detection.

## Alternative hypotheses, ranked

1. **Unconverted judge-to-presentation X (high, demonstrated algebraically)** — both paths start from the same normalized athlete point but only wrists subtract 1.5. Fixed sign and magnitude match the report.
2. **Camera mirror or preview-vs-athlete inversion (lower)** — input applies the same camera-preview transform to wrists and knees; a mistaken mirror would generally reverse sides or vary with X rather than add the same +1.5 world units. Derrick sees overall tracking rather than random direction.
3. **Calibration bounds derived from wrists during upper-body T-pose (possible additional physical offset)** — shared normalization can project a knee outside the calibrated grid, but the same bounds feed wrists and knees. The physical framing could cause further error not measurable from Derrick's camera; correct the deterministic mismatch first.
4. **Camera pose/parallax, GLB pivot or knee pad rotation (lower)** — these can change appearance/depth, but the scene-model yellow marker and pad have the *same* shifted center, before GLB geometry. Wrist equipment already uses the correct presentation conversion. No evidence supports changing camera or art.

## Why previous fixes failed

0.0.144 fixed **eligibility**: a measured hip+knee can draw the wearable when the ankle is missing. Its direct/iframe native-entity and pixel checks proved presence, not parity with the wrist coordinate system. Existing renderer knee assertions encoded the erroneous judge-space X as if it were presentation X. No prior change addressed horizontal alignment; do not re-open the ankle confidence or 150-ms gates.

## Unknowns

The exact knee/wrist pixel delta and GLB pivot on Derrick's own Glitch capture remain unknown; no personal camera trace or screenshot was provided. A connected nonpersonal Worker Play should compare old vs corrected knee center against the **same** calibrated wrist mapping and camera, in direct and cross-origin iframe. If a consistent physical offset remains after conversion, investigate calibration/framing separately rather than inventing a per-user fudge factor.

## Minimal reproduction

Build a Boxing Play scene with a real or test-owned measured leg at normalized knee X=.25 and a wrist at normalized X=.25. Existing knee marker/pad center is X=.5. The existing wrist/equipment-presentation mapping for the identical normalized X is X=-1. The expected difference is zero; the observed code difference is +1.5 world units. No ankle is needed for visual-only reproduction; the scorer must still reject a missing-ankle leg.

## Proposed verification

Before changing code, assert the old scene's knee marker/pad X equals `4*x-.5` and is **not** `judgeToPresentationPoint({x:4*x-.5,y:...}).x`. After the smallest renderer change, require equal X/Y for each side across full and ankle-null legs, marker and pad and optional visual collider. Keep authored knee target positions unchanged. Use the existing owner native knee browser test plus a connected nonpersonal CPU-Worker Boxing Play on configured source or privately signed build to compare measured input knee/wrist presentation and on-screen projection; require real native pixels in direct and cross-origin iframe and unchanged no-ankle scoring/tracking-loss behavior. No personal library or physical Glitch retest.

## Recommended fix

In the renderer owner, project knee joints through the **existing** `judgeToPresentationPoint` contract before assigning presentation-space scene coordinates. Update the existing wrong-X assertions and add a direct parity assertion with the wrist conversion. Keep Y/Z, pad orientation, full-triple scoring data, missing-ankle visual support, camera and fresh-measurement cutoff unchanged. Do not publish or alter the current public 0.0.144 route without separate authorization after real product checks.

## Debugging record

Problem: Boxing knee pads/markers track but sit far right of the measured knees.
Observed symptom: Derrick's physical Glitch report; signed nonpersonal Play shows positive-right projected knee centers.
Root cause: knee renderer leaves calibrated judge-space X unconverted; wrists subtract 1.5 world units via the shared judge-to-presentation contract.
Evidence: input uses shared preview/calibration transforms; knee scene model `x=4*x-.5`; wrist projection `judgeToPresentationPoint` returns `judgeX-1.5`; signed pad model pixels at x493–571 of 844.
Failed approaches: 0.0.144 solved missing-ankle visual eligibility, not placement; existing tests asserted the erroneous X.
Corrective action: use the already imported judge-to-presentation function at knee visual projection only.
Verification test: test-owned same-X knee/wrist scene parity, native pixels/centers in connected nonpersonal Play direct+iframe, unchanged ankle/full-leg scoring and tracking safety.
Related files/components: renderer `src/gameplay-scene-model.js`, `scripts/validate-knee-visuals.js`, native renderer browser test; assembly `src/index.js`; input `src/body-grid-service.js`; shared `src/equipment-contracts.js`.
Remaining uncertainty: Derrick's exact camera framing or further calibration offsets cannot be inferred from nonpersonal fixtures.
