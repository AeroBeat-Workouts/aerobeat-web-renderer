# Renderer owner: live Boxer target height

Status: renderer slice complete (Derrick, 2026-10-25). Parent: assembly `.plans/2026-10-25-live-boxing-height-offsets.md`. Base: clean main `5401f992`. Renderer has no Beads database (`bd ready --json` reports no database); this scoped plan and Git track this owner slice, without initializing or changing assembly's ledger.

## Decision and next acceptance

Consume an optional finite `heightWorldY` on private render targets for `boxing_collider` punches, guards, and knees only. Keep cell/lane X, type, additive trajectory, feedback and target overlay behavior; absent height retains legacy projections. Reject a malformed present value. Next check: model and native Chromium same-ID rerender at two heights with a guard pair and knee, then renderer checks and push. Assembly owns its projection, scoring, aftermath source coordinates and genuine Play acceptance.

## Tasks

- [x] Implement target typedef/validation and per-frame final Y projection in the renderer model. Owner: renderer. Keep Flow and other presentations unchanged.
- [x] Add focused model and native browser regression for already-visible same ID, five families/representatives, guard pair and knee, overlay/feedback parity and Flow legacy behavior. Owner: renderer.
- [x] Update README, run targeted and existing checks, commit and push renderer only. Owner: renderer.

## References and exclusions

Parent assembly plan above defines five shoulder-relative offsets; renderer receives only resolved world Y and does not calculate shoulder position or offsets. No scoring, gameplay, input, contracts, assembly files, production UI, personal media, public route or server changes. No new calibration authority. No production Play claim from renderer testbed.

## Results

Model maps only Boxing Collider punch/guard/knee Y from the optional value and validates all targets' present value before staging. Focused model and native PlayCanvas/Chromium same-ID tests pass; `npm test` and `npm run test:browser` both pass. Native browser observes pooled real GLB roots at two successive heights and unchanged Flow; assembly's genuine configured Play/scoring/aftermath remains pending parent integration. Renderer Beads database unavailable, left uninitialized. Commit and push recorded in Git.
