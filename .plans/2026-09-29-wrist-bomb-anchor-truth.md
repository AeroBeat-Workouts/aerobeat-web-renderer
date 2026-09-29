# Wrist bomb overlay anchor truth

Status: Complete
Owner: aerobeat-web-renderer
Approval: Direct user request; renderer-only follow-up. No push or version bump.
Bead: unavailable (`bd ready --json` reports no Beads database in this repo).

## Goal
Draw the green wrist bomb radius sphere only where a measured/projected wrist anchor exists. Keep its center exactly at that anchor and its default radius equal to gameplay's 0.12 world units.

## References
- AeroBeat polyrepo and renderer READMEs.
- Assembly `src/equipment-collider-anchors.js` supplies projected per-hand wrist centers or null.
- Gameplay `src/flow-collider-collision.js` declares `WRIST_BOMB_RADIUS_WU = 0.12` and scales it by `wristBombColliderScale`.

## Tasks
1. [Complete] Remove invented wrist sphere positions without changing legacy equipment-volume fallback. Focused model checks cover no/partial anchors, exact centers, 0.12 radius at scale one, and zero-scale hiding.
2. [Complete] Node syntax checks, focused renderer test, and `git diff --check` pass. `npm test` stops at sibling contracts TypeScript TS2345 in equipment-pose-contracts.js:385. Fallback `npm run check:renderer` stops at an existing collider-bounds failure in validate-playtest-collider-volume.js:26 before reaching this focused test; direct execution passes.
3. [Complete] Reviewed diff and whitespace; commit renderer-only change, verify clean tree, report without pushing.

## Results
Renderer model skips each missing wrist anchor instead of drawing a fabricated sphere. For measured anchors, sphere center is exactly the supplied world-space point; diameter is `2 * 0.12 * wristBombColliderScale`, matching gameplay's 0.12 WU radius at scale one. The independent legacy collider-volume fallback is unchanged.
