# D5 signed side-piece diagnosis — 2026-10-11

## Exact observed failure
Unchanged renderer `0be921c` fails `node scripts/validate-w1c-facade-pixels.js` line 668: `massSplitDelta=1482 (measured 1053 ± 200)`. Existing real-GLB captures show byte-identical frames for authored `up` and `right` despite distinct scene-model axes. The older September 22 numerical anchor is not approval of the rendering geometry.

## Expected behavior
Derrick explicitly selected TWO SIDE PIECES with the cut beginning at the actual blade crossing. The earlier B10 DOWN-arrow specification (quoted in original `src/renderer-facade.js`: the cut runs from the horizontal middle DOWN to the bottom) identifies the seam's direction in world space for a DOWN arrow. The pinned arrow GLB points local +Y; a DOWN rotation maps local +Y to world down. Thus the B10 seam runs from local Y≈0 toward the tip (+Y), not toward the tail. For a D5 crossing c=(sliceT−.5)×glyph length, extend that same side seam from local Y=c toward the **tip**. The signed masks are positive X≥0 OR Y<c; negative X<0 AND Y≥c. The still-uncut tail belongs to positive, with exactly two pieces, no interior overlap, and no gap. This is the contract-based interpretation, not an independently approved new seam-direction choice. Absent sliceT retains the full-length left/right X split. Arrow corpse direction is composed before tumble; world-X separation is independent of local clipping.

## Execution path
Assembly passes direction and sliceT in the aftermath entry. `aftermathObjects` builds two sign-specific objects and `aftermathSceneObject` records `sliceAxisX/Y`, without composing `directionRotation(entry.direction)` into scene rotation. `renderGameplayFrame` stages each GLB entity with this model rotation; `applyAftermathAppearance` instead recomputes `aftermathSliceAxis(object)` on the scene object, which has neither shape nor direction, and obtains fallback (1,0). `installSliceClipBlocks` currently discards on sign×(dot(localXY,axis)−c), yielding one transverse/shifted plane rather than a blade-origin side seam.

## Most likely root cause
The later D5 shader changed the original B10 side split into a signed half-plane offset; no one-plane formula with X normal can put the cut's *endpoint* at local Y=c while assigning the pre-cut area to one of two pieces. The facade additionally loses authored axis, and the model never rotates a corpse by its authored glyph direction. Source and captures independently support these facts.

## Alternative hypotheses
1. Historical track/camera changes explain the exact 1053→1482 mass drift but do not explain missing direction or wrong seam. 2. Rasterization variance cannot explain identical up/right capture hashes. 3. Merely forwarding model axis produces different pixels but still uses wrong coordinate space (world-derived normal passed into local shader), so does not fulfill the side-piece requirement.

## Why previous fixes failed
Disposable `direction:up` and `direction:right` fixture edits left actual frames unchanged; both still used facade fallback. A proposed local-Y normal would make top/bottom pieces, contrary to Derrick's chosen two sides. Widening mass tolerance or adopting old Sep22 number without new genuine captures conceals rather than repairs this behavior.

## Provenance correction and remaining unknown
The direct choice was only two side pieces beginning at the blade crossing; Derrick did **not** explicitly choose tail→crossing versus crossing→tip. A later review cited `assembly/src/gameplay-frame-effects.js:479–485` as stating the athlete's swing direction, but those lines classify authored note shape and direction; they contain no stroke-direction rule. The earlier renderer code quoted a B10 DOWN-arrow cut from center to bottom, which maps to local +Y (tip) after authored rotation. Therefore crossing→tip follows the only identified explicit seam direction. Physical motion beyond that source quote remains an inference, not user approval. The prior tail→crossing captured pixel numbers (negative 189→409→773 for .25→.5→.75) document an **intermediate rejected geometry**, not proof of this final implementation. The later full-gate crossing→tip capture and normal gates are recorded below.

## Minimal reproduction
At historical renderer commit `0be921c`, `node scripts/validate-w1c-facade-pixels.js` failed at the old D5 mass oracle. Parent-owned probes for that unfixed commit showed matching up/right pixels; these historical captures are preserved separately in the recoverable 0.0.128 intake backup, not asserted to be current-source proof.

## Proposed verification
At cut time (no time-based half tumble), capture real GLB arrows in `up`, `down`, `right`, `up-right` for sliceT .25/.5/.75/absent. Attribute each half against the same framebuffer background, project occupied pixels into authored local X/Y, check both signs, seam begins at c, still-uncut TAIL ownership, legacy full side split, .16 legacy/.76 cut TOTAL world separation, and +.30 WU outward for EACH side relative to its pair midpoint. Show old-source RED, fixed-source GREEN and fix-removed failure with the tests unchanged.

## Recommended fix
Use local glyph coordinates only: sign+ keeps X≥0 || Y<c, sign− keeps X<0 && Y≥c; absent sliceT uses X sign for full height. Compose `directionRotation` into arrow corpse rotations before tumble; raise the scored-cut total separation from .46 to .76 while retaining the legacy .16. Replace historical mass oracle with geometry-specific signed occupancy assertions based on genuine framebuffer captures rather than altering its tolerance.

## Validation and retained evidence

- Final crossing→tip source with **approved D5 +.30 WU outward EACH**: `npm test` GREEN and full `npm run test:browser` GREEN; W1C is in the normal browser gate. One selected explicit-output capture has 16 true GLB PNG states (DOWN, UP, RIGHT, up-right × absent/.25/.5/.75) and per-half signed occupancy at `scripts/evidence/0.0.63-d5-slice/d5-sliceT-2026-10-11-03-07-48/`. Pixel tests assert cut tip, uncut tail, endpoint neighborhoods, monotone shortening from .25→.5→.75, authored direction, exactly two pieces, and exact .16 legacy / .76 present TOTAL world separation. At first contact DOWN negative-piece counts 1213→828→263 and positive 1674→2046→2596 as crossing moves toward tip; a later start correctly yields a shorter cut. Each half's projected offset **relative to its pair midpoint** increases by 22.27 px (equivalent to .30 WU at measured 74.23 px/WU); total pixel spread grows 44.54 px. The shared seed jitter itself also changes with spread, so individual absolute positions are not asserted to move exactly .30 WU relative to the note's origin. No Sep22 mass tolerance change.
- Fix-removed proof: reverting only production wider-total `.76→.46` while keeping current tests unchanged yields RED `down t=0.25: exact .76 WU total world-X separation (.30 outward EACH)`; restoration yields GREEN. The earlier seam-direction-only mutation `>=c→<=c` yielded RED `D5 crossing→tip .25→.5 must shorten ... 189→409`; restored GREEN. Crossing-predicate constant `true` yielded RED `diffPx=0` against >200; restored GREEN. Earlier authored-rotation removal yielded RED `down: authored rotation precedes bounded tumble`; restored GREEN with unchanged rotation. Tail→crossing `.../02-25-22/` and old-spread `.46` `.../02-35-12/` captures are **rejected interim**, not current-source proof.
- Tuning identity: correcting the total spread changes renderer default tuning from v6 (`visual-3fed1dee`) to v7 (`visual-99cb8c71`). The new hash is the actual normalized value; v7 round-trips exactly. Persisted historical v6 default identity migrates to v7 rather than restoring the wrong .46. Independently content-hashed custom v6 records remain independently tunable; a forged hash fails closed. Normalized v5 records missing the optional wider key inherit the corrected default. Targeted tuning identity tests and full `npm test` pass.
- A whole-HEAD facade swap timed out before GLB ready with a changed scene model and was correctly excluded as a counterfactual.
- Strict release fingerprint integration: ordinary W1C and white-flash browser runs write captures under Git-ignored `.tmp/renderer-browser-evidence/`. An explicit `AEROBEAT_RENDERER_EVIDENCE_ROOT=/absolute/output` redirects either harness to `<output>/0.0.63-d5-slice/` or `<output>/0.0.62-white-flash/`, without changing assertions. The selected final v7 D5 capture `.../03-07-48/` was generated by explicit output for independent QA and deliberate staging; earlier pre-v7 and `.46` captures are **obsolete** even when their pixels happen to match. Pre/post full `npm run test:browser` Git status snapshots are identical; repeating the gate adds only ignored `.tmp` files. Parent-owned current/right probes and all other iterations are preserved, not presumed tracked. The report's transverse proposal remains rejected.

## Debugging record
```text
Problem: D5 shifted a half-plane instead of starting the two-side seam at the blade crossing.
Observed symptom: W1C massSplitDelta=1482 versus unapproved Sep22 1053±200; up/right old PNGs identical.
Root cause: local shader lacks piecewise X/Y mask; model omits direction rotation; facade recomputes axis on directionless scene object.
Evidence: model/facade code and parent-owned real-GLB direction captures.
Failed approaches: fixture-only direction, world-axis pass-through, proposed local-Y transverse cut, mass-tolerance widening.
Corrective action: tip-directed two-piece masks (positive X≥0 OR Y<c; negative X<0 AND Y≥c), authored rotation, and signed .30 WU additional outward EACH (.16→.76 total); absent sliceT retains .16/full-X split.
Verification test: real-GLB signed per-half occupancy and seam endpoints across directions/sliceT, old red/fixed green/fix-removed red.
Related files/components: src/gameplay-scene-model.js, src/renderer-facade.js, scripts/validate-w1c-facade-pixels.js.
Remaining uncertainty: Derrick did not explicitly approve seam direction for D5; crossing→tip derives from B10 DOWN center→bottom. Independent visual/art QA should verify this interpretation, not treat earlier rejected captures as acceptance.
```
