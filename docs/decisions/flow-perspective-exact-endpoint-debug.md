# Flow perspective exact-endpoint debug record

## Exact Observed Failure

Independent QA on implementation `8b9dfca` found that `projectFlowRect(endpoint, 1)` is pixel-equivalent but not strictly identical to the original endpoint. For cell 0 at aspect 4:3, endpoint x/y are `0.06400000000000004` / `0.06399999999999999`, while projected impact x/y are `0.06400000000000002` / `0.06399999999999997`. The deltas are `-2.7755575615628914e-17` / `-1.3877787807814457e-17`. Unit tests passed because they used tolerance-based `assertClose`; framebuffer tests cannot observe a sub-pixel floating-point difference.

## Expected Behavior

Task 1 requires progress 1 to map exactly to the existing 4x3 destination rectangle. Exact means strict object-field equality, not visual or tolerance equivalence. Cue foreground and obstacle-plane impact commands must retain the exact endpoint x/y/width/height values supplied to projection.

## Execution Path

`cellRect()` creates the endpoint. `addTarget()` applies identity default role scale and calls `projectFlowRect(baseRect, progress)`. At impact, `flowApproachProgress()` returns exactly 1. `projectFlowRect()` nevertheless recomputes endpoint center through `lerp(vanishing, endpointCenter, 1)`, then recomputes x/y by subtracting half width/height. Those floating-point arithmetic round trips produce the strict mismatch.

## Most Likely Root Cause

The endpoint boundary is reconstructed unnecessarily instead of preserving the authoritative endpoint values. IEEE-754 subtraction/addition is not algebraically identity-preserving for every representable normalized rectangle. The exact QA deltas and the current center-based implementation directly establish this cause.

## Alternative Hypotheses

1. `cellRect()` is wrong — contradicted: the required values are the exact `cellRect()` output; only the projected copy drifts.
2. Timeline progress is below 1 — contradicted: QA used public `projectFlowRect(endpoint, 1)` directly and impact frames clamp to exactly 1.
3. GPU projection changes coordinates — contradicted: the mismatch exists in the deterministic CPU draw plan before WebGL.

## Why Previous Verification Failed

Owner endpoint tests used `assertClose`, which was appropriate for intermediate interpolation but too weak for the explicit exact-boundary invariant. Browser framebuffer evidence can prove pixels and geometry but cannot distinguish 1e-17 normalized-coordinate drift.

## Unknowns

No root-cause unknown remains. Regression scope is whether an exact boundary fast path changes intermediate projection or Boxing commands; targeted hashes and full tests resolve that.

## Minimal Reproduction

1. Create the default 4:3 playfield.
2. Get `cellRect(0, grid, gridGap)`.
3. Call `projectFlowRect(endpoint, 1)`.
4. Compare with `assert.deepEqual`; implementation `8b9dfca` fails x/y strict identity while tolerance comparison passes.

## Proposed Verification

Add strict deep-equality tests for public projection at progress 1 and clamped values above 1 across all 12 cells and portrait/landscape/extreme aspects. Add strict impact-command tests for Flow cue foreground and every obstacle plane. Retain intermediate equal-delta tests, framebuffer tests, and exact representative Boxing hashes.

## Recommended Fix

After clamping progress, return a frozen exact field copy of the supplied endpoint when `p === 1`. Do not change `lerp`, `cellRect`, intermediate projection, ordering, shader geometry, or Boxing paths. This fixes the authoritative boundary rather than masking it with rounding or tolerance.

## Debugging Record

```text
Problem: Flow projection violates strict endpoint identity at progress 1.
Observed symptom: x/y differ from cellRect output by 1e-17 despite identical pixels.
Root cause: projectFlowRect reconstructs endpoint through center arithmetic at the exact boundary.
Evidence: Independent QA strict comparison and deterministic public-function reproduction.
Failed approaches: Tolerance-based endpoint assertions and framebuffer evidence masked the contract violation.
Corrective action: Return a frozen exact endpoint copy when clamped progress equals 1.
Verification test: Strict deep equality across cells/aspects plus cue/obstacle impact commands, all existing pixels, and Boxing hashes.
Related files/components: src/gameplay-plan.js, scripts/validate-renderer-facade.js.
Remaining uncertainty: None after full regression validation.
```
