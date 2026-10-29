# Athlete-facing rear depth: renderer

Status: complete; renderer handoff commit contains this plan. Parent verifies signed assembly integration. Owner: renderer coder on current main.
Coordination: ../aerobeat-web-assembly/.plans/2026-10-29-athlete-facing-rear-depth.md; parent owns assembly Bead aerobeat-web-assembly-qrtp (do not close).

## Goal and decision
Render the shared contracts convex collider parts, without changing art, front reach, knee geometry or timing. Flow defaults OFF (old combined capsule); Boxing defaults ON (old world-Z cylinder). Extra rear parts have unique IDs. Native fill and wire follow each part axis, including zero-length parts.

## Tasks
1. Complete: consume resolveSaberColliderParts / resolveGloveColliderParts with short depthBackwardAthleteFacing option; retain existing default IDs/shapes and art. Remove duplicate Flow reach math. Rear Boxing wires have separate slots, preserving default hand slots 0/1.
2. Complete: normal model/native regressions cover toggles, rotated poses, cap/wire directions, zero depths/scale and unchanged default/front/art. Shared helpers became available during implementation.
3. Complete: README/results updated; commit/push main for renderer handoff. Exact SHA/tree and upstream state are reported to parent after push. Parent owns integrated assembly release acceptance and the coordination Bead remains open.

## Debugging record (normal gate, first run)
Observed failure: validate-playtest-collider-volume.js:29 expected identity quaternion `{x:0,y:0,z:0,w:1}`, got x `-0`. Expected default Boxing model byte/shape values unchanged. Path: shared world +Z axis → colliderPartOrientation → cross.x = -axis.y → -0 retained by division → strict deep equality fails. Root cause: presentation quaternion arithmetic does not canonicalize signed zero. Alternatives: changed shared axis or geometric rotation error contradicted by actual identity components and passing native browser direction checks. No prior fixes. Minimal reproduction: default Boxing Show model with any rotated glove. Verification: retain the existing exact identity assertion and rerun normal gate; native browser cap directions remain the adjacent check. Smallest fix: canonicalize zero quaternion components. Unknowns: later gate results until rerun. Problem/evidence/corrective-action record is this paragraph; no geometry or acceptance-policy change.

## Results
- `npm test`: passed all normal type/static/asset/model checks. First run exposed signed-zero default quaternion mismatch, repaired and rerun green.
- `node scripts/validate-boxing-collider-wire-browser.js`: passed actual native PlayCanvas/loaded-GLB testbed, including both bent unions, four independent hand/part fills/wires, cardinal/combined poses, cap-axis parity, unchanged native art transforms, visible framebuffer differences, zero depths/scale, original default wire appearance and lifecycle.
- `node scripts/validate-flow-collider-volume-browser.js`: passed existing native Flow silhouette, caps, Show contrast and off/zero/lost cases.
- `node scripts/validate-knee-visuals-browser.js`: passed unchanged native knee targets/pads/markers/Show and loss/detach.
- `git diff --check`: passed. Full `npm run test:browser` not run; focused affected browser gates above were run. No signed assembly/new-run checkbox acceptance claimed; parent integrates release. No other repo edited.

## Gates and dependencies
Shared helpers are implemented concurrently by contracts/gameplay owner. No alternate API or duplicate reach formulas. Use existing renderer check/type/unit and Flow/Boxing browser gates; add focused regressions to those normal gates. No new UI or fidelity mockup. Renderer browser testbed is source-owner native evidence, not signed assembly acceptance.
