# Flow Test scored collider edge

**Status:** Flow correction `4be6bb3` pushed; follow-up P1 Boxer compositing regression reproduced, Flow layer split implemented, renderer tests green, assembly gates await clean renderer pin. **Owner:** renderer on main. **Beads:** Flow `aerobeat-web-assembly-glx4` closed; Boxer `aerobeat-web-assembly-ca24` claimed. Parent assembly plan `.plans/2026-10-18-flow-test-collider-visibility.md`. **Next acceptance:** Restore legacy Boxer layer order while isolating Flow's late wire, then run unchanged assembly Boxer/Flow gates and renderer suites before commit/push. Assembly owns signed Test/public acceptance; no service or snapshot changes here.

## Goal and diagnosis

Derrick saw a visible Flow saber with no discernible Show collider in public signed 0.0.131 Test. The signed same-frame GPU Show on/off differed by only 151 pixels because a same-radius, same-hand-color translucent volume was drawn before World transparency and depth-tested against the solid blade. Runtime-only post-World/depth-off comparison established compositing as the cause, but did not create a contrasting scored edge. Derrick explicitly chose a thin high-contrast edge at the true scored radius/endpoints, not a brighter same-hue tint or wider hit region. Full pre-edit causal report is in the parent assembly plan.

## Implementation and verification

1. Render the Flow-only capsule on a late transparent layer after World and the shadow receiver; keep Boxing overlays' original material/depth behavior. Keep the exact shared scored radius and endpoints, original translucent fill, authored solid GLB and same fixed-size per-hand pool. A bounded line mesh draws sparse charcoal longitudes and cap rims at that **same** capsule surface. Lines are 1 hardware pixel; there is no geometry inflation, regardless of rotation, Scale, or zero-length sphere.
2. Extend the existing actual Chromium PlayCanvas browser test: stage the pinned solid GLB with equipment-preview-style Flow poses; compare Show on/off on the same active frame for up, diagonal, right, and both hands; assert high-contrast pixels, active second line mesh and its no-depth-write material, plus Scale0 and missing-pose off. Preserve existing model/mesh vertex, tiny/huge, zero-length and pooled-slot checks. Write paired `testStyleShowOn-after.png` and `testStyleShowOff-after.png` under ignored `.tmp/renderer-browser-evidence/flow-capsule-before-after/`.
3. Update README; run `npm test`, focused `node scripts/validate-flow-collider-volume-browser.js`, and `npm run test:browser`; commit and push renderer only. Documentation outside renderer and signed/public run deliberately deferred to assembly owner.

**Observed boundary (844×390 Chromium, genuine PlayCanvas/pinned saber GLB):** Flow Show on/off 454/480/487 pixels differ for left up/left diagonal/right diagonal and 941 for both hands; >300 high-contrast pixels for each individual pose. Scale0 and lost collider pose differ by zero pixels from the same GLB Show-off frame. Actual screenshot on shows thin charcoal/dark contour and glowing blade retained; the dark wire uses fixed 1-pixel lines and intentionally differs from hand color. This is renderer-boundary evidence, not signed Test or physical-phone acceptance.

**Design tradeoff:** High contrast wins on a bright blade without widening hit geometry, but 1-pixel lines and coincident radius are less pronounced at small/mobile viewports, and post-World depth-off shows diagnostic outlines through intervening art. This is deliberate Test/Show diagnostic presentation; Boxing remains depth-tested. Parent will judge signed Test appearance.

## P1 Boxing follow-up — pre-edit debugging report

**Exact observed failure:** The unchanged assembly scored Boxing browser oracle at `direct:844x390` reports default-near 11903 visible on/off pixels and backward 11914: delta +11 fails the existing `>12` test at line 184, though the boundary moves two pixels. The parent reproduced it twice; the renderer coder repeated the exact command and got +11. Previously renderer `5c1fcbe` gave 11121→11137 (+16). The current code change moved a shared overlay layer after World transparency.

**Expected:** Boxing remains on its former depth-tested transparent overlay layer *before* World; its unchanged scored preview gate passes. Flow alone has a post-World depth-off true-size edge.

**Execution path:** Assembly scored Play takes its native Boxing settings to `rendererFrame` → `buildGameplaySceneModel` emits `collider_volume` box → `updateSceneObjects` acquires a primitive → `applyColliderOverlayAppearance` assigns the shared `gameplayColliderOverlayLayer` → PlayCanvas composites its transparent layer. `4be6bb3` moved that shared layer, so Boxer's mesh color/area is composited differently despite unchanged model geometry.

**Leading cause and alternatives:** The shared-layer move is supported by exact source diff and repeatable +11 versus known old +16 at the same bounds. A software raster boundary fluctuation was plausible for a two-pixel shortfall, but deterministic repetitions weaken it. Changed gameplay scoring/settings are contradicted by no corresponding source edit. Why prior fix failed: it solved Flow's saber occlusion by relocating a layer that also owns Boxing and other target overlays; the renderer-only GLB test did not exercise assembly's scored Boxing pixel gate.

**Unknowns/minimal reproduction:** Full Boxer viewport/iframe matrix and signed candidate remain untested. Repro: run `AEROBEAT_COLLIDER_CONTEXT='direct:844x390' node scripts/validate-scored-boxing-collider-volume-pixels.js` from assembly against renderer `4be6bb3`. It fails +11. Earlier `5c1fcbe` passed +16.

**Verification before fix:** Split the layers without changing the Boxer test; expect Boxer measured delta to return above 12, source native Flow Test to retain ≥130 strong pixels and ≥75 axial columns per hand, and renderer browser mesh/GLB checks to pass. A pin drift from assembly's release-provenance guard after the new renderer commit must be reported to parent, not worked around or edited in assembly.

**Recommended correction:** Keep the old collider overlay and hazard order before World for every non-Flow-capsule overlay. Assign only the Flow capsule's fill and wire to a second transparent layer after World. Both meshes live in the same entity so Show off/zero/lost pose disable them together. No scored geometry, GLB, Boxer material, or assembly changes.

```text
Problem: Boxing scored Show pixel regression after Flow visual fix.
Observed symptom: 11903→11914 (+11) versus unchanged required >12, repeatable.
Root cause: Shared overlay layer moved after World to serve Flow; Boxer used it too.
Evidence: identical direct browser result twice plus prior renderer pass and layer diff.
Failed approaches: Flow-only renderer validation missed actual scored Boxer boundary.
Corrective action: separate late Flow-only layer and restore original shared order.
Verification test: unchanged assembly Boxer direct/full contexts; native source Flow Test; renderer unit/browser.
Related files/components: renderer-facade.js layers/appearance, assembly scored Boxing/Flow Test browser oracles.
Remaining uncertainty: matrix and signed Test until real runs.
```

**Renderer result before assembly pin:** `npm test`, focused `node scripts/validate-flow-collider-volume-browser.js`, and full `npm run test:browser` pass. The unchanged assembly Boxer direct command cannot build while renderer source is dirty: `Release dependency worktree is dirty for @aerobeat/web-renderer`; after renderer commit, assembly provenance must pin that exact new commit/tree before the real Boxer and Flow source gates can run. No bypass or assembly edits are allowed in this renderer lane. The split preserves the two shared-overlay and receiver relative positions from `5c1fcbe`, putting only Flow capsules after World. Source-only green does not establish Boxing acceptance.
