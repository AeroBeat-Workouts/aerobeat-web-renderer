# Uniform-wall browser oracle debug

## Exact Observed Failure

`npm run test:browser` fails in `scripts/validate-browser-renderer.js:20` with:

> `TypeError: Cannot read properties of undefined (reading 'order')`

The error occurs while evaluating `wallLayers.find(entry => entry.name.includes("edge")).order` after loading audited gameplay asset `0.0.10`.

## Expected Behavior

Asset `0.0.10` intentionally contains exactly one wall primitive/material, `mat/red_glass` at alpha `.24`, and no edge primitive/material. The browser oracle must retain the track glass/edge ordering check while requiring the wall to expose only its body layer at the wall draw order.

## Execution Path

The browser loads all seven pinned GLBs, renderer clones one material record per wall primitive into `assetMaterials`, the test captures `wallLayers`, then the superseded assertion searches for an edge record and dereferences `.order`.

## Most Likely Root Cause

The runtime correctly reflects the audited single-primitive wall. The independent browser assertion still encodes the immutable `0.0.9` two-primitive body-plus-edge-cage contract. `find("edge")` therefore returns `undefined` by design.

## Alternative Hypotheses

1. Wall GLB failed to parse: contradicted by seven ready resources and the test reaching the material assertion.
2. Material records were lost: contradicted by the preceding wall material/color checks and canonical asset validation.
3. Draw-order setup failed: not established; the failure happens before comparing the one remaining record's order.

## Why Previous Fixes Failed

Provenance, package, GLB structure, and release-version expectations were updated, but this deeply embedded browser assertion was not yet migrated. No prior runtime fix targeted it.

## Unknowns

The rest of the fail-fast browser suite has not executed with this stale assertion removed.

## Minimal Reproduction

Sync asset `0.0.10`, then run `npm run test:browser` in `aerobeat-web-renderer`. It fails after environment evidence at the wall edge lookup.

## Proposed Verification

Assert the track retains glass then edge ordering; independently assert `wallLayers` equals one `mat/red_glass` record at the wall draw order. Rerun the full browser suite.

## Recommended Fix

Replace only the combined legacy edge-cage assertion with separate track and uniform-wall assertions. Do not add a synthetic edge record or loosen the wall contract.

## Debugging Record

```text
Problem: Browser oracle assumes removed wall edge cage.
Observed symptom: Undefined wall edge record is dereferenced for draw order.
Root cause: Stale 0.0.9 two-primitive expectation after intentional 0.0.10 one-primitive asset integration.
Evidence: Canonical validation requires one primitive/material; browser reaches wall material records; edge lookup alone is undefined.
Failed approaches: Updating release/provenance/GLB structural assertions without this embedded browser check.
Corrective action: Keep track edge ordering check; require exactly one wall glass layer at wall draw order.
Verification test: Full renderer browser suite.
Related files/components: scripts/validate-browser-renderer.js, assetMaterials, wall/red-glass-v1 GLB.
Remaining uncertainty: Later fail-fast browser stages.
```
