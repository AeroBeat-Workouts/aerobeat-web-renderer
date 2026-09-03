# Environment addChild successful-return reentrancy

## Exact Observed Failure

Final independent auditor comment `01a067a7-9356-77ac-85ff-674c9b3673ef` reports this exact result when `app.root.addChild(...)` synchronously clears the selected environment and then returns successfully:

```json
{"describe":{"id":null,"state":"ready","visible":true,"fallback":false,"hash":null,"count":0,"projection":null},"record":null,"closeCount":1,"rootDestroy":1,"materialDestroy":1,"textureDestroy":1,"meshDestroy":1}
```

Directly observed: the reentrant clear disposes the root, material, texture, mesh, and decoded image exactly once and leaves `descriptor` and `record` null, but the suspended `loadFresh` continuation overwrites the authoritative idle state with `ready`. The failure occurs after `app.root.addChild(sphere.root)` returns in `PlayCanvasEnvironmentAssetOwner.loadFresh`.

## Expected Behavior

Every continuation that can invoke caller/engine code must revalidate the captured application, generation, abort signal, descriptor identity, and `loading` state before applying transforms, mutating root visibility, writing lifecycle state, or clearing the controller. A successful-return reentrant clear must remain exact idle/null diagnostics with exactly-once disposal. A reentrant replacement or restore must retain its newer loading/ready state and authoritative record; the older continuation must not clobber either.

## Execution Path

1. `loadFresh(app)` captures the current descriptor, generation, and abort controller and enters `loading`.
2. Fetch, byte/hash validation, decode, and `createSphere` complete with currentness checks.
3. The staged record is transferred to `this.record`; `ownsStaged` becomes false.
4. `app.root.addChild(sphere.root)` invokes synchronous external/engine code.
5. That callback reenters owner lifecycle code such as `setDescriptor(null)`, replacement, or `restore(app)`.
6. Reentrant disposal aborts the old controller, increments generation, clears/disposes the old authoritative record exactly once, and establishes idle or newer loading/ready state.
7. `addChild` returns normally to the old `loadFresh` frame.
8. The old frame currently performs `applyTransform`, writes `sphere.root.enabled`, sets `state="ready"`, and clears `controller` without another currentness check.
9. Those stale writes corrupt truthful diagnostics and can clobber a newer controller/state even though resource disposal itself was correct.

## Root Cause

`loadFresh` treats the pre-`addChild` currentness check as sufficient across `app.root.addChild`, but `addChild` is a synchronous reentrancy boundary. Ownership transfer before that call is valid for throw cleanup, yet it does not authorize post-call mutation after lifecycle reentrancy changed the generation, signal, descriptor, application, or loading state. The missing post-`addChild` `assertCurrent(app,generation,controller.signal,descriptor)` permits the stale continuation.

## Alternatives

1. **`disposeCurrent` fails to invalidate the old generation.** Contradicted: the probe shows null record and exact-once destruction; source increments `generation` and aborts the controller.
2. **Ownership transfer itself is necessarily too early.** Less likely: transferring before `addChild` lets the authoritative current-generation catch route dispose resources exactly once when `addChild` throws. The defect is use of that transfer as implicit continuing authority.
3. **`applyTransform` alone recreates stale state.** Contradicted as the complete cause: with record null it is a no-op; the explicit stale `state="ready"` and `controller=null` writes create the observed diagnostic corruption and could damage a newer load.
4. **Only descriptor clear is affected.** Contradicted by the shared path: replacement and restore also invalidate generation/controller and can establish newer loading/ready state that the stale continuation would overwrite.

## Why Prior Coverage Missed It

The createSphere reentrancy test reenters before ownership transfer and the following currentness assertion catches it. The existing `addChild` test only throws, so it exercises current-generation catch cleanup rather than a callback that returns successfully after changing ownership. Delayed decode tests cover asynchronous abort/stale completion, not synchronous reentrancy after record transfer. They therefore never execute the vulnerable post-`addChild` continuation with invalidated authority.

## Unknowns

- Whether real PlayCanvas `addChild` currently triggers owner callbacks is unknown; correctness cannot depend on its present implementation because the injected app boundary is executable and lifecycle methods are synchronously reentrant.
- Whether every future operation after `addChild` remains non-reentrant is unknown. Verification should pin the required invariant immediately after this boundary and before all subsequent mutations.
- The exact ordering chosen by a replacement callback may leave the newer load `loading` or `ready` when the old `addChild` returns; tests must cover and preserve the state actually established by that callback.

## Minimal Reproduction

Create an owner with deterministic fetch/decode/sphere fakes. Override `app.root.addChild` so it marks the root attached, calls `owner.setDescriptor(null)`, and returns normally. Attach descriptor A and await its load. The unfixed code yields descriptor null, record null, all resources disposed once, but `state:"ready"` and `count:0`.

A replacement variant starts descriptor B from inside A's `addChild`, optionally completes B before returning, then lets A continue. The unfixed A continuation can overwrite B's loading/ready state and clear B's controller.

## Proposed Verification

Add executable owner cases at the successful-return `addChild` boundary:

- Clear: assert exact idle/null diagnostics, null record/controller, stale root not enabled or transformed after disposal, and root/material/texture/mesh/image destruction/close counts exactly one even after later dispose.
- Replacement: make A's `addChild` synchronously replace with B and allow B to attach without recursive replacement. Assert B remains the sole ready/current record and root, A is disposed exactly once, B is not destroyed/closed until owner disposal, and A cannot change B diagnostics/controller.
- Preserve the throwing `addChild`, delayed decode clear/replacement/restore/detach/dispose, proxy/accessor atomicity, one-resident, and multi-instance tests.

These cases distinguish the missing post-boundary authority check from cleanup or abort defects.

## Recommended Fix

Immediately after `app.root.addChild(sphere.root)` returns, call `assertCurrent(app,generation,controller.signal,descriptor)` before `applyTransform`, root `enabled`, `state`, or `controller` mutations. Keep the transferred record authoritative so a thrown `addChild` still uses existing current-generation cleanup exactly once. If reentrancy invalidates the generation, the assertion throws `AbortError`; the stale catch neither disposes already-disposed/newer resources nor mutates newer state.

## Debugging Record

```text
Problem: A successful-return app.root.addChild callback can invalidate environment ownership while loadFresh is suspended.
Observed symptom: descriptor/record are null and resources disposed once, but stale continuation reports state ready/count 0.
Root cause: No app/generation/signal/descriptor/loading currentness check after the synchronous addChild reentrancy boundary.
Evidence: Auditor comment 01a067a7-9356-77ac-85ff-674c9b3673ef, exact probe output, and loadFresh post-addChild unconditional writes.
Failed approaches: createSphere reentrancy and throwing-addChild tests cover different ownership boundaries; delayed races do not exercise successful synchronous return.
Corrective action: Assert full currentness immediately after addChild returns and before transform/visibility/state/controller mutation.
Verification test: Executable addChild clear and newer replacement cases with exact diagnostics, record/root identity, and exact-once destruction/close counts.
Related files/components: src/environment-asset-owner.js; scripts/validate-environment-owner.js; PlayCanvasEnvironmentAssetOwner.loadFresh/disposeCurrent.
Remaining uncertainty: Whether real PlayCanvas currently reenters is irrelevant to the required ownership invariant; future post-addChild operations must remain behind the guard.
```
