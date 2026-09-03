# Environment transform and visibility successful-return reentrancy

## Exact Observed Failure

Fresh cumulative QA FAIL comment `01a067b1-72f1-7624-847c-b0574d0f7f53` independently exercised the uncommitted renderer candidate atop `80564a4ea2c206cf36f62572e03f2af5bd8086e1` after the addChild repair.

When `root.setPosition(...)` synchronously called `owner.setDescriptor(null)` and returned successfully, QA observed:

```json
{"describe":{"id":null,"state":"ready","visible":true,"fallback":false,"hash":null,"count":0,"projection":null},"record":null,"controller":false,"setterCalls":["position","rotation","scale"],"rootEnabled":true,"counts":[1,1,1,1],"closed":1}
```

When the `root.enabled` setter synchronously called `owner.setDescriptor(null)` and returned successfully, QA observed:

```json
{"describe":{"id":null,"state":"ready","visible":true,"fallback":false,"hash":null,"count":0,"projection":null},"record":null,"controller":null,"enabledWrites":1,"closed":1}
```

Directly observed: the reentrant clear invalidated the generation, nulled descriptor/record/controller, and disposed root/material/texture/mesh/image exactly once. The stale `loadFresh` frame nevertheless continued rotation and scale after position reentry, reached the enabled write, and/or overwrote truthful idle state with `ready`. The failure occurs in the post-transfer initialization sequence after the new post-`addChild` guard has passed.

## Expected Behavior

After staged ownership transfers to `owner.record`, every synchronous engine callback boundary must be followed by an authority check before another stale root mutation or lifecycle commit. This includes after `addChild`, after each of position, rotation, and scale, after the enabled assignment, and immediately before setting `state="ready"` and clearing the controller.

A reentrant clear must remain exact idle/null with no subsequent stale setters or enabled writes. A reentrant replacement must preserve only the newer controller/state/record/root. Every stale resource and decoded image must be disposed exactly once, while newer resources remain live until their own disposal.

Normal later `setTransform` and `setCameraPosition` behavior must remain synchronous and unchanged when authority remains current. If one of their root setters reenters lifecycle invalidation, they must also stop before invoking follow-on setters on the disposed stale root. Later `setVisible` has only one root engine write and no stale lifecycle commit after it; its returned diagnostics are freshly computed, so it needs no additional follow-on root guard beyond the initial-load post-enabled authority check.

## Execution Path

1. `loadFresh(app)` captures descriptor, app, generation, and controller, verifies and decodes the JPEG, creates sphere resources, and transfers staged ownership to `this.record`.
2. `app.root.addChild(root)` returns; the f12 repair checks full load authority successfully.
3. `applyTransform()` captures the current transform/camera and invokes `root.setPosition(...)`.
4. The injected engine setter synchronously calls `setDescriptor(null)` or replacement.
5. Reentrant lifecycle handling aborts the old controller, increments generation, clears the old record, destroys/closes all transferred resources once, and establishes idle or newer loading state.
6. The setter returns to the old `applyTransform` frame.
7. Current code has no record/generation check between setters, so it invokes `setEulerAngles` and `setLocalScale` on the disposed stale root.
8. Control returns to `loadFresh`, which writes `root.enabled`; that write is itself another synchronous reentrancy boundary.
9. Current code then unconditionally writes `state="ready"` and `controller=null`, corrupting idle diagnostics or a replacement generation's state/controller.

## Most Likely Root Cause

The implementation treats one post-`addChild` currentness assertion as authority for the entire transform/visibility/commit sequence. That assumption is false because every PlayCanvas root setter and the enabled property write are injectable synchronous engine calls and can reenter owner lifecycle methods before returning. `applyTransform` also has no record/generation identity guard between its three root calls, so the same defect exists for later transform/camera updates: lifecycle invalidation during position or rotation can cause follow-on calls on a destroyed root.

Evidence is the exact QA setter call sequence (`position`, `rotation`, `scale`) after position-triggered disposal, exact stale `ready` diagnostics after enabled-triggered disposal, and exact-once destruction/closure counts proving cleanup itself worked.

## Alternative Hypotheses

1. **The post-addChild repair is incorrect.** Low likelihood and contradicted by independent addChild clear/replacement probes, which preserve idle or newer loading/ready state before transform begins.
2. **Resource disposal is incomplete or repeated.** Contradicted by all root/material/texture/mesh destruction counts and image close count being exactly one.
3. **Abort propagation is late.** Not causal here: the defect is entirely synchronous after ownership transfer, and generation/controller invalidation occurs during the setter callback.
4. **Only initial load is affected.** Contradicted for follow-on root calls: public/private later `setTransform` and `setCameraPosition` use the same unguarded `applyTransform`. Later `setVisible` has a single engine mutation and then only computes diagnostics, so it cannot call another stale root setter or overwrite lifecycle state.
5. **A single guard after all transform calls is sufficient.** Contradicted by the observed continued rotation/scale mutations on the already disposed root; authority must be checked between calls, not only before lifecycle commit.

## Why Previous Fixes Failed

The 7r4 repair correctly retained staged ownership until post-decode/post-createSphere currentness and added exact cleanup for stale decoded resources. It did not address synchronous reentrancy after transfer.

The f12 repair correctly added a currentness assertion immediately after `addChild` and executable reentrancy at that boundary. Its tests intentionally made transform and visibility unreachable after addChild invalidation, so they could not detect reentrancy originating inside transform setters or the enabled setter. The repair guarded the start of a sequence rather than every external callback boundary within it.

## Unknowns

- Whether current PlayCanvas implementations invoke application callbacks from these setters in normal production execution is unknown. The owner accepts an engine object and correctness cannot rely on undocumented non-reentrancy.
- Whether a setter can reenter only transform state without changing record/generation is not covered by the reported failure. A record/generation authority guard addresses lifecycle invalidation and disposed-root safety; it is not intended to serialize arbitrary nested transform updates.
- Whether a future lifecycle-sensitive engine call will be added after enabled assignment is unknown. The verification should pin a final load-currentness check immediately before lifecycle commit.

## Minimal Reproduction

Create an owner with deterministic fetch/decode/sphere fakes. For the first case, make the fake root's `setPosition` append `position`, synchronously call `owner.setDescriptor(null)`, and return; make rotation, scale, and enabled writes append their names. Attach descriptor A. The unfixed candidate calls all three setters and writes ready despite idle/null ownership.

For the second case, make only the fake root's `enabled` setter synchronously clear and return. Attach descriptor A. The unfixed candidate disposes once but then writes ready.

A stronger replacement case triggers descriptor B from one of these boundaries, holds B's decode, and proves the stale A frame cannot clear B's controller/loading state or later overwrite B's ready record/root.

## Proposed Verification

Add executable owner tests that:

- trigger clear from `setPosition`, assert exact idle/null diagnostics, null record/controller, call sequence exactly `position` with no rotation/scale/enabled follow-on writes, and all stale resource/image disposal counts exactly one before and after idempotent dispose;
- trigger clear from the enabled setter, assert exact idle/null diagnostics, no stale ready/controller commit, and exact-once disposal;
- trigger replacement from a transform boundary, hold the newer decode, assert exact newer loading diagnostics/current controller and no stale follow-on calls, then release it and assert exact newer ready diagnostics/current record, exactly one live root, old counts all one, and new counts zero until final disposal then one;
- preserve delayed decode clear/replacement/context restore/reattach/dispose, createSphere reentrancy, addChild clear/replacement/throw, normal transform/camera behavior, one-resident replacement, and multi-instance isolation.

These cases distinguish comprehensive authority sequencing from disposal, abort, or addChild-only fixes.

## Recommended Fix

Use a small private record/generation authority check while applying a transform. Capture the authoritative record and generation, call position, verify the same record/generation/app still owns the root, call rotation, verify again, call scale, and verify again. Stop without another stale root call when lifecycle reentrancy invalidates authority. Keep `applyTransform` as the normal path for later transform/camera updates so their behavior is unchanged when current and hardened when a setter invalidates ownership.

In initial `loadFresh`, retain the full captured app/generation/signal/descriptor assertion after `addChild`, call the guarded transform path, assert full load currentness again, write enabled, assert full load currentness again, and only then commit `ready`/clear the controller. Keep existing staged ownership transfer and catch cleanup semantics so throws dispose exactly once and stale continuations never touch a newer record.

## Debugging Record

```text
Problem: Post-transfer environment transform and enabled callbacks can synchronously invalidate ownership while loadFresh continues.
Observed symptom: descriptor/record become null and resources dispose once, but stale rotation/scale/enabled calls continue and state returns to ready.
Root cause: One post-addChild assertion incorrectly authorizes multiple later synchronous engine callbacks with no intervening record/generation/load checks.
Evidence: QA FAIL 01a067b1-72f1-7624-847c-b0574d0f7f53 exact position and enabled probes; setter sequence and exact-once counts.
Failed approaches: 7r4 guarded pre-transfer ownership; f12 guarded addChild only; neither exercised reentrancy inside transform/enabled callbacks.
Corrective action: Guard record/generation between transform setters and full load authority after transform and enabled, before lifecycle commit.
Verification test: Executable position-clear, enabled-clear, and transform-boundary replacement with exact diagnostics/call suppression/current identity/exact-once disposal.
Related files/components: src/environment-asset-owner.js; scripts/validate-environment-owner.js; PlayCanvasEnvironmentAssetOwner.loadFresh/applyTransform/setTransform/setCameraPosition/setVisible.
Remaining uncertainty: Non-lifecycle nested transform reentry is outside the reported disposed-root defect; future engine callbacks must remain explicitly guarded.
```
