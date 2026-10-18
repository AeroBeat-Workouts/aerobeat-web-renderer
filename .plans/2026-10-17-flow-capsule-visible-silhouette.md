# Flow collider must match visible saber silhouette

**Status:** Renderer cap fix and real Chromium mesh/framebuffer regression complete; signed assembly/public replacement remains pending. **Owner:** renderer source, coder `8a08ae1e-824b-4f22-b390-380755f2410b`; parent owns integration. **Linked Bead:** `aerobeat-web-assembly-1eeg` (in progress). **Derrick's width decision:** keep forgiving hits. The corrected overlay must show the **true wider scored hit area**, not artificially match the narrow bright artwork; do not narrow scoring or merge Collider Scale into the saber. **Public boundary:** assembly's signed HTTPS443 game; preserve the current signed build and older rollback until a corrected candidate passes. **Next acceptance check:** reproduce the too-long silhouette in the existing PlayCanvas browser pixel test, then verify both caps end at scored capsule endpoint ± radius at rear 0/front 1, for upright and diagonal blades.

## Exact observed failure

Derrick reports that the new Flow Show collider volume looks like a cylinder/sphere stretched along the saber and does **not** match the saber. That is a physical-phone observation, not a claim inferred from source tests. Existing `validate-flow-collider-volume-browser.js` passed because it asserts only that pixels appear, move up/down and disappear; it never compares silhouette endpoints or width against the scored capsule and equipment blade.

## Expected behavior

The renderer should depict the **scored saber capsule**, not an elongated proxy. For capsule centerline endpoints `start` and `end` separated by length `L`, radius `r`, the axis extrema must be `start−r` and `end+r` and cross-section radius must be `r` in every orientation. At Flow rear 0/front 1, the scored centerline starts at the hilt and ends at the visible tip. Gameplay target-box Collider Scale remains independent from saber thickness per Derrick's explicit decision. Boxing is unchanged.

## Execution path

Assembly resolves the same `AeroResolvedEquipmentPose` for visible equipment and `frame.equipmentColliderPoses`. `gameplay-scene-model.js` builds `object.capsule` with hilt/tip centerline and radius. `renderer-facade.js:686–700` constructs a retained unit +X mesh; `applyColliderOverlayAppearance:763–769` positions it at the midpoint, scales local X by the full centerline length `L`, Y/Z by radius `r`, then applies the pose quaternion. `createUnitFlowCapsuleMesh:1008–1031` currently creates cylinder-axis endpoints ±0.5 but its endcap pole coordinates are ±1.5 (sin term of magnitude 1). Thus the actual rendered axis extrema are midpoint ±1.5L, whereas the scored capsule extrema are midpoint ±(0.5L+r). With rear0/front1, pose.scale1, `L=.75` and `r=.18`, the visible mesh reaches ±1.125 from midpoint rather than the intended ±.555; each cap is elongated `.75` instead of `.18`. The prior browser test only asserted directional pixel movement, allowing that shape.

## Most likely root cause

The unit mesh treats the radius **along X** as one unit, then scales X by centerline length, while radial Y/Z are independently scaled by radius. This anisotropically stretches both hemispherical endcaps into long ellipsoids. The calculation explains precisely Derrick's observed stretched sphere/cylinder. The model capsule endpoints can be correct while the actual GPU vertices are wrong.

## Alternative hypotheses

1. The GLB saber geometry is inconsistent with the scorer: possible residual discrepancy after fixing the clear mesh error; compare actual signed-game saber/collider pixels on the same pose. This does not explain the provable cap scaling error.
2. Camera perspective or alpha causes apparent extra size: may influence perception, but cannot change vertex-space cap extent from `.18` to `.75`.
3. Collider Scale is a thickness knob: explicitly contradicted by Derrick's choice to keep scale separate from visible saber. No gameplay scoring change is justified here.

## Why prior fixes failed

The earlier release checked scene-model centerline/radius and scoring, not the generated render mesh's cap geometry. The renderer's existing browser pixel test requires only >40 changed pixels and different vertical silhouettes; a stretched capsule satisfies both. Independent QA exercised the same semantic endpoint assertions, not actual visible-axis bounds.

## Unknowns and minimal reproduction

Old renderer browser test passes with the bug. Renderer coder reproduced real Chromium RED for up pose: mesh world axial poles `[0.25,2.5]` versus scorer `[0.82,1.93]`, and a visible framebuffer silhouette grossly exceeds expected scored projection. Separately parent extended the **signed public bundle's actual scored Play** browser test to inspect the active named GPU mesh. Old 0.0.129 candidate fails at `early-hilt`: meshScale `{x:1.5,y:.36,z:.36}`, actual axial extent `4.5` versus scored capsule `1.5+2×.36=2.22`; radial extents `.72` match. The correct active entity must be selected by `enabled` and model object id, not blindly pool index0 (which can be a stale disabled slot). Extend the renderer test to assert actual vertex extrema and framebuffer silhouette at the same pose. The smallest fixture is one Flow pose at scale1, rear0/front1, Show collider volume on, empty target scene. The bug is independent of source chart, CV tracking or Boxer mode. Whether a corrected scored capsule also looks exactly like the artistic GLB blade on a physical phone remains Derrick's acceptance check.

## Proposed verification and recommended fix

First add a RED assertion to the existing renderer-owned PlayCanvas browser test measuring the actual mesh's axis and radial extrema, plus framebuffer silhouette around the scored start/end radius; assert upright and diagonally rotated cases, hidden/lost baseline and Boxer isolation. Then correct the cap mesh so its X cap radius is `r/L` in unit-centerline space (or equivalent world-space geometry), rebuilding cached vertices only when the ratio changes. Do not scale the entire sphere longitudinally by `L`. Repeat renderer unit/browser tests and assembly's signed representative Play test on a new candidate. Only replace public HTTPS443 after real-pixel QA and rollback-ready signed validation; do not claim physical-phone parity until Derrick tests it.

## Renderer results and visual evidence

Renderer production fix `595d913` corrects endcap geometry while retaining the same scored capsule centerline and radius. Browser regression follow-up `cfc78a8` selects the active named pool entry even when left is disabled and right is slot1 alongside wrist-bomb; screenshot harness `6c7de63` captures real 844×390 Chromium before/after images. Parent inspected `up-before.png`, `up-after.png`, `diagonal-before.png`, and `diagonal-after.png` under ignored `.tmp/renderer-browser-evidence/flow-capsule-before-after/`. Upright and diagonal caps are visibly shorter and rounded after the fix, not the old elongated ellipses. These isolated screenshots do not stage the artistic saber GLB; they prove the hit-volume GPU silhouette only. `node scripts/validate-flow-collider-volume-browser.js`, renderer `npm run check`, and the full `npm run test:browser` passed on owner source. Assembly's separate signed Play mesh test was RED on the old public 0.0.129 build and remains to be rerun against a newly signed integrated candidate. Derrick explicitly chose to keep the wider forgiving scored volume and show it accurately rather than narrowing hits to the bright artwork.

## Debugging record

Problem: Flow collider appears like a stretched sphere/cylinder, unlike the saber.
Observed symptom: Derrick physical 0.0.129 report; prior browser pixel oracle passes without shape agreement.
Root cause: unit mesh cap poles ±1.5 get multiplied by centerline `L` instead of cap radius `r`.
Evidence: `renderer-facade.js:763–769,1008–1031`; scored geometry `gameplay-scene-model.js:189–200`; with L=.75/r=.18, rendered poles ±1.125 versus expected ±.555.
Failed approaches: matching model endpoints and counting pixel movement, neither tested actual GPU silhouette.
Corrective action: radius-aware endcap vertex geometry with independent axial/radial scale.
Verification test: RED/GREEN real framebuffer and mesh extents for rear0/front1 up/down/diagonal, source plus freshly signed browser candidate.
Related files/components: renderer facade, Flow overlay browser test, assembly signed scored Play.
Remaining uncertainty: final physical-phone visual alignment with the authored saber art.

## Execution

1. Renderer owner: add a focused failing real-browser silhouette assertion to the existing browser script and fix only Flow overlay mesh; run `npm run check`, focused PlayCanvas pixel test, and relevant browser suite. Commit and push renderer source.
2. Assembly owner: pin renderer commit/tree, run signed direct/iframe scored Play, renderer/assembly checks, preserve rollback; document changed visible behavior, commit/push assembly and build new immutable signed snapshot.
3. Independent QA: inspect real candidate pixels for blade/collider alignment at hand up/down and diagonal; distinguish exact scored capsule bounds from artistic GLB silhouette. Then update only the existing public backend if accepted, verify both HTTPS relays, and ask Derrick for phone verdict. Keep prior signed snapshots.
