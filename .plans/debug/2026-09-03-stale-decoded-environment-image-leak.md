# Stale decoded environment image retained after replacement

## Exact Observed Failure

Independent assembly audit probed renderer commit `80564a4ea2c206cf36f62572e03f2af5bd8086e1`. While `decodeImage()` was delayed, the environment descriptor was cleared/replaced. After decode completion, public diagnostics correctly returned idle/null, but the owner still retained a staged record and decoded image; `close()` was never called.

Observed probe result:

```json
{"describe":{"id":null,"state":"idle","visible":true,"fallback":false,"hash":null,"count":0,"projection":null},"record":true,"recordHasImage":true,"closed":0}
```

The existing stale-generation test checks only that no photosphere root attached.

## Expected Behavior

Any decoded image produced for a stale, aborted, cleared, replaced, detached, context-lost, or disposed generation must be closed exactly once and must not remain reachable through `owner.record`. No stale GPU/scene resources may attach. The owner must expose no resident record when the selected descriptor is null.

## Execution Path

1. `loadFresh(app)` captures descriptor/generation/controller and validates fetched bytes.
2. It awaits `decodeImage(...)`.
3. While decode is delayed, `setDescriptor(null)` or replacement calls `disposeCurrent()`, aborts, increments generation, and clears the then-current record.
4. Decode eventually resolves despite abort.
5. `loadFresh` creates `staged` and immediately assigns `this.record=staged` before post-decode `assertCurrent(...)`.
6. The post-decode currentness assertion throws an AbortError.
7. The catch block disposes staged only when `this.record !== staged`; here they are equal, so disposal is skipped.
8. Because this generation is stale, the current-generation error branch is also skipped.
9. The stale record and decoded image remain retained and unclosed.

## Most Likely Root Cause

The catch cleanup condition is inverted for a staged record installed by the stale continuation. `this.record===staged` does not imply that staged is current; currentness depends on app/generation/descriptor/state. Assigning staged before post-decode currentness also lets a stale continuation overwrite the authoritative record slot.

## Alternative Hypotheses

1. Abort signal is not propagated to decoder: contributory but not sufficient; asynchronous decoders may legally resolve after abort, so ownership must still close stale results.
2. Descriptor normalization retained old identity: contradicted by diagnostics showing id null and state idle.
3. `disposeCurrent()` failed to close an existing record: not the direct path; no record existed when clear occurred because decode had not completed.

## Why Previous Fixes Failed

Prior stale-generation coverage asserted only `roots.length===0`. It proved no stale scene attachment but did not assert `owner.record===null`, decoded-image closure, or exactly-once disposal. The prior hardening focused proxy/accessor atomicity and did not cover a decoder that resolves after abort.

## Unknowns

- Whether createSphere can similarly return resources after currentness changes through synchronous reentrancy; adversarial tests should preserve checks before and after resource creation.
- Whether replacement (not only clear) could let stale staged state overwrite a newer ready record. A test must cover both clear and replacement races.

## Minimal Reproduction

Use a `decodeImage` promise that ignores abort until explicitly resolved. Start descriptor A attach, clear or replace the descriptor while decode is pending, then resolve A. Assert descriptor diagnostics, internal record, image close count, roots, and resources.

## Proposed Verification

Add owner tests that cover delayed decode followed by clear, replacement, context loss, detach/dispose, and a newer successful load. Each stale decoded image must close exactly once, stale roots must never attach, `record` must remain null or point only to the newest ready generation, and public diagnostics must agree.

## Recommended Fix

Do not install decoded/staged resources into `this.record` until post-decode currentness is confirmed. Ensure every locally owned staged record is disposed on every catch path unless ownership was successfully transferred to the current ready record. Cleanup must never clear or dispose a newer generation's record. Extend executable tests to assert record identity/null and image closure, not only root attachment.

## Debugging Record

```text
Problem: A delayed stale environment decode can retain an image and staged record.
Observed symptom: idle/null diagnostics with owner.record present, image retained, close count 0.
Root cause: stale continuation assigns this.record before currentness check; catch skips cleanup when record===staged.
Evidence: source lines 92-102 and independent delayed-decode probe.
Failed approaches: Existing stale test asserted only zero attached roots.
Corrective action: Validate currentness before record transfer and unconditionally dispose locally owned stale resources without touching newer records.
Verification test: Expanded validate-environment-owner delayed clear/replacement/context-loss/dispose races with exact close/record assertions; full renderer tests/browser.
Related files/components: src/environment-asset-owner.js; scripts/validate-environment-owner.js; renderer facade restore path.
Remaining uncertainty: Reentrant createSphere race coverage.
```
