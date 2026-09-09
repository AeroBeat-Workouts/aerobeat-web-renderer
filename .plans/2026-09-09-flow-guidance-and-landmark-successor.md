# Flow Guidance and Landmark Successor

**Status:** APPROVED / CODER IN PROGRESS
**Date:** 2026-09-09
**Owning repo:** `/home/derrick/.dsh/projects/aerobeat/aerobeat-web-renderer`
**Bead:** `aerobeat-web-renderer-ac0`
**Role:** coder

## Goal

Implement the renderer-owned combined successor approved by Derrick: exact marker tint, complete removal of arrival-number/attention-halo runtime, strict exclusive repeated guidance bands, continuous pending-note motion through the goal, and the shared `flow`/hidden-grid presentation contract. Preserve renderer-only semantics, privacy, bounded resources, material-state caching, canonical gameplay assets, and lifecycle behavior.

## References

- Renderer `README.md`
- Assembly design `/home/derrick/.dsh/projects/aerobeat/aerobeat-web-assembly/.plans/design/2026-09-09-flow-colliders-and-physical-feedback.md`
- Landmark debug record `/home/derrick/.dsh/projects/aerobeat/aerobeat-web-assembly/docs/task12-physical-gameplay-cadence-landmarks-countdown-debug.md`
- Bead `aerobeat-web-renderer-ac0`

## Approved boundaries

- Do not modify gameplay asset `0.0.10`; stop rather than author an asset if exact-tint evidence remains uncertain.
- Do not edit assembly, build raw releases, publish, serve, or claim physical PASS.
- Commit/push source, docs, tests, and this plan; exclude `.beads/interactions.jsonl`.
- Leave `ac0` open for independent QA.

## Tasks

### 1. Ground and diagnose

- [x] Read README, design, and landmark debug report.
- [x] Inspect Git state and protect pre-existing `.beads/interactions.jsonl`.
- [x] Claim `aerobeat-web-renderer-ac0`.
- [x] Trace current marker tint, cue schema/model/runtime pools, pending-note clamp, grid default, and tests.

### 2. Implement successor

- [x] Apply exact 1.0× resolved wrist colors and fixed nose yellow only to marker `mat/tint_base`, preserving structural materials, maps, opaque/depth/cull/unlit state and material cache.
- [x] Replace visual experiment config with strict branded/frozen exclusive `guidanceBandMode` (`off`, `song_beat_grid`, `target_arrivals`) while retaining camera-parallax controls.
- [x] Remove arrival ordinals, number/halo scene kinds, layers, pools, materials, texture cache, diagnostics, and runtime strings.
- [x] Render bounded full-lane guidance bands from caller-authoritative beat timestamps or unresolved actionable target arrival identities/times, suppressing the active timing core.
- [x] Continue unresolved note motion past Z=0; preserve committed same-ID gray miss motion/label behavior.
- [x] Default the neutral Flow/Boxing Spatial Grid floor hidden; keep safe/blocked/timing/track/targets visible.

### 3. Tests and docs

- [x] Replace 0.68 marker expectations with exact parity plus framebuffer color-dominance evidence.
- [x] Add direct-model tests for schema strictness, exclusive modes, authority/caps/culling, hazard exclusion, cleanup/privacy, motion, and grid defaults.
- [x] Update live Chromium/context/lifecycle/material-cache tests for bands and removal of legacy resources/strings.
- [x] Update README public/world/timing/marker/validation contracts.

### 4. Validation and handoff

- [x] Run `npm test`.
- [x] Run `npm run test:browser`.
- [x] Run `npm pack --dry-run --json`.
- [x] Audit diff for no asset mutation, no assembly changes, no `.beads/interactions.jsonl` inclusion, and no dormant cue runtime.
- [ ] Commit and push current branch; leave `ac0` in progress for QA.
- [ ] Record exact commit/tree and API changes for assembly pinning.

## Results

- `npm test`: PASS.
- `npm run test:browser`: PASS, including direct/real-cross-origin DPR matrix, guidance-band framebuffer/lifecycle checks, exact marker material parity and final-composite color dominance, material-cache stability, context restore, grid/target layering, and secure/insecure asset hashes.
- `npm pack --dry-run --json`: PASS, exactly 42 package entries.
- Gameplay assets remain byte/working-tree unchanged at pinned `0.0.10`; no exact-tint A/B geometry failure occurred, so no asset authoring was attempted.
- No assembly, release/raw, publication, serving, or physical-review state was changed.
- `.beads/interactions.jsonl` remains intentionally excluded from the source/docs/tests commit.
- Bead `ac0` remains `in_progress` for independent QA.
