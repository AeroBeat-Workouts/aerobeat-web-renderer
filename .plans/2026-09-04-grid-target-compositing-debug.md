# Grid/target compositing diagnosis

## Exact Observed Failure

A pending opaque directional arrow at world `z = -1.5` changes across every one of its 1,381 sampled pixels when the transparent grid at `z = 0` is enabled. Mean RGB shift is 114.08 while sampled alpha remains 255. Live arrow materials are opacity 1, `BLEND_NONE`, `depthTest = true`, and `depthWrite = true`.

## Expected Behavior

Approaching semantic targets must remain visually opaque and must not receive a transparent grid/cell color wash. Canonical grid X/Y positions, blocked/safe colors, target depth testing/writes, transparent wall/track behavior, markers, and feedback must remain intact. Only the intentional bounded 80 ms resolved-target fade may change target alpha/depth-write behavior.

## Execution Path

`renderGameplayFrame()` builds the scene model, updates timing-zone primitives, then `updateSceneObjects()` instantiates grid cells and gameplay GLBs. All render components currently use PlayCanvas's World layer. Opaque target meshes render in the World opaque sublayer. Grid/timing materials use normal blending and no depth writes, so they render later in the World transparent sublayer. Because the grid is camera-nearer (`z = 0`) than a pending arrow (`z = -1.5`), the transparent grid fragments pass depth testing and composite over the already-rendered opaque target.

## Most Likely Root Cause

The grid and targets share one layer whose fixed opaque-before-transparent sublayer order matches generic transparency rendering but violates the semantic requirement that the HUD-like calibrated grid must not tint approaching targets. Evidence is the all-pixel grid-on/off difference despite fully opaque, depth-writing target materials and the exact world positions above.

## Alternative Hypotheses

1. **Asset alpha/blending metadata** — contradicted by live opacity 1, `BLEND_NONE`, and alpha-255 pixel evidence.
2. **Target depth disabled** — contradicted by live `depthTest`/`depthWrite` truth.
3. **Renderer Y flip needed** — unrelated to the grid wash and risks direction handedness.
4. **Simple drawOrder values** — insufficient because PlayCanvas drawOrder sorts within a sublayer; it cannot move an opaque mesh after the World transparent sublayer.

## Why Previous Fixes Failed

Release 0.0.3 made already-implicit opaque metadata explicit but did not change the renderer's layer composition, so the transparent grid still rendered after opaque targets. Nominal per-mesh drawOrder checks tested only ordering inside existing sublayers and could not detect cross-sublayer compositing.

## Unknowns

The corrected 0.0.4 asset's exact commit, inventory/proof hashes, and GLB identities remain external until its concurrent source/release task lands. Runtime pixel thresholds must be measured after that exact release is pinned.

## Minimal Reproduction

Render one pending arrow at `z = -1.5` in Flow or Boxing Spatial Grid, capture pixels with grid surfaces enabled, then capture the same arrow/camera/background with grid surfaces disabled. The defect does not materially reproduce at the same scale once the arrow front reaches/passes `z = 0`, because most target fragments then win depth.

## Proposed Verification

Create a dedicated gameplay-grid layer followed by a dedicated semantic-target layer between the existing Skybox and World-transparent passes. Place only timing/grid/lane surfaces in Grid and only semantic note/guard/bomb assets in Targets. Preserve the existing depth buffer so opaque World markers/geometry and target-target depth remain physical. Compare grid-on/off arrow pixels at `z = -1.5`; unchanged arrow-interior pixels and preserved surrounding grid/red blocked pixels distinguish the layer cause from asset-alpha or coordinate hypotheses. Also check all directions/presentations/free-fly, bright-background contrast, target material depth state, and explicit 0/40/79/80 ms removal alpha.

## Recommended Fix

Add renderer-owned `Aero Gameplay Grid` and `Aero Gameplay Targets` layers between the existing Skybox and World-transparent passes. Assign timing zones and cell/lane primitives only to Grid; assign note/guard/bomb assets only to Targets. Do not clear depth at either boundary: targets overwrite grid color where their fragments land while still depth-testing/writing normally against one another and prior opaque World geometry. Track and wall assets remain in World transparent after Targets, while feedback and markers keep their existing World behavior. Remove both custom layers during detach.

Tradeoff: the semantic target pass intentionally wins color compositing over the calibrated grid even when an approaching target is physically behind `z = 0`. This is the required readability exception. Preserving depth prevents targets from globally overriding opaque markers/world geometry; leaving track/walls in the later World-transparent pass preserves their intended compositing. Only semantic target assets move.

## Debugging Record

```text
Problem: Transparent grid/cell faces wash out approaching opaque targets.
Observed symptom: Grid-on changes 1,381/1,381 sampled arrow pixels; mean RGB shift 114.08; alpha remains 255.
Root cause: Grid and target share World; World transparent necessarily renders after World opaque.
Evidence: Live opaque/depth material state, z=-1.5 target behind z=0 grid, all-pixel RGB change.
Failed approaches: Reasserting OPAQUE metadata and nominal drawOrder; neither changes cross-sublayer order.
Corrective action: Dedicated Grid then semantic Targets layers after Skybox and before World transparent, without depth clears.
Verification test: Grid-on/off target-interior pixels, preserved grid/red cells, all modes/directions/free-fly, bright background, removal fade.
Related files/components: src/renderer-facade.js, scripts/validate-renderer-facade.js, scripts/validate-browser-renderer.js.
Remaining uncertainty: Exact corrected 0.0.4 asset identities and measured post-pin pixel thresholds.
```
