// @ts-check
//
// 0.0.90 (htsg): focused oracle for the boxing obstacle presentation shapes.
// The boxing branch of the scene model must derive the wall's vertical extent
// from the obstacle's gameplay geometry (top-left 4x3 grid):
//   - squat  → top row only, a full-width bar (4 columns x 1 row).
//   - weave  → the FULL TWO-COLUMN LANE on the blocked side (2 columns wide,
//              centered on the lane center ±1.0, full lane height).
// 0.0.92 (u6tc): the weave wall spans the FULL TWO-COLUMN LANE on the blocked
// side, centered at the lane center (left lane cols 0-1 → x=-1.0, right lane
// cols 2-3 → x=+1.0). The blocked side is determined by the authored column:
// geometry.x<2 → left lane, geometry.x>=2 → right lane. This matches the
// presentation-independent collision (which uses the full lane). 0.0.91 (F6b):
// the floor shadow under every boxing obstacle must be present at floor level,
// match the wall's footprint, and carry non-zero alpha.
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";

const CELL = 0.94;
const geometry = (x, y, width, height) => ({ schema: "aerobeat/obstacle_gameplay_geometry", version: 1, coordinateSpace: "aerobeat_top_left_grid", x, y, width, height });
const squat = { id: "squatter", kind: "obstacle", hand: "neutral", family: "squat", cell: null, cells: [0, 1, 2, 3], gameplayGeometry: geometry(0, 0, 4, 1), lane: null, beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };
const weaveLeft = { id: "weave-left", kind: "obstacle", hand: "left", family: "weave", cell: null, cells: [3, 7, 11], gameplayGeometry: geometry(3, 0, 1, 3), lane: "left", beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };
const weaveRight = { id: "weave-right", kind: "obstacle", hand: "right", family: "weave", cell: null, cells: [0, 4, 8], gameplayGeometry: geometry(0, 0, 1, 3), lane: "right", beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };

for (const presentation of ["boxing_lanes", "boxing_collider"]) {
  const walls = (target) => buildGameplaySceneModel({ presentation, nowMs: 1500, timingWindowBeforeMs: 180, timingWindowAfterMs: 180, targets: [target] }).objects.filter((entry) => entry.targetId === target.id && entry.kind === "obstacle");
  const shadows = (target) => buildGameplaySceneModel({ presentation, nowMs: 1500, timingWindowBeforeMs: 180, timingWindowAfterMs: 180, targets: [target] }).objects.filter((entry) => entry.targetId === target.id && entry.kind === "shadow");

  const squatWalls = walls(squat);
  assert.equal(squatWalls.length, 1, `${presentation}: squat renders exactly one bar`);
  assert.deepEqual({ x: squatWalls[0].position.x, y: squatWalls[0].position.y }, { x: 0, y: 2 }, `${presentation}: squat bar is centered on the grid at the top row`);
  assert.ok(Math.abs(squatWalls[0].scale.x - (4 - 0.06) / CELL) < 1e-9, `${presentation}: squat bar spans the full grid width (4 columns)`);
  assert.ok(Math.abs(squatWalls[0].scale.y - (1 - 0.06) / CELL) < 1e-9, `${presentation}: squat bar is exactly one grid row tall`);

  const weaveL = walls(weaveLeft);
  assert.equal(weaveL.length, 1, `${presentation}: weave_left renders exactly one wall`);
  assert.equal(weaveL[0].position.x, 1.0, `${presentation}: weave_left (authored column 3) spans the FULL right lane center x=+1.0`);
  assert.ok(Math.abs(weaveL[0].scale.x - (2 - 0.06) / CELL) < 1e-9, `${presentation}: weave_left spans the full two-column right lane`);
  assert.ok(Math.abs(weaveL[0].scale.y - (3 - 0.06) / CELL) < 1e-9, `${presentation}: weave_left keeps the full lane height (3 rows)`);
  assert.equal(weaveL[0].position.y, 1, `${presentation}: weave_left keeps the lane center Y`);

  const weaveR = walls(weaveRight);
  assert.equal(weaveR.length, 1, `${presentation}: weave_right renders exactly one wall`);
  assert.equal(weaveR[0].position.x, -1.0, `${presentation}: weave_right (authored column 0) spans the FULL left lane center x=-1.0`);
  assert.ok(Math.abs(weaveR[0].scale.x - (2 - 0.06) / CELL) < 1e-9, `${presentation}: weave_right spans the full two-column left lane`);
  assert.ok(Math.abs(weaveR[0].scale.y - (3 - 0.06) / CELL) < 1e-9, `${presentation}: weave_right keeps the full lane height (3 rows)`);
  assert.equal(weaveR[0].position.y, 1, `${presentation}: weave_right keeps the lane center Y`);

  // 0.0.91 (F6b): the floor shadow must exist under every obstacle, sit just
  // above the floor, span the same footprint as its wall (WU), and be visible.
  const floorY = -0.72;
  const assertShadow = (target, expectedX, expectedWidthWU) => {
    const targetShadows = shadows(target);
    assert.equal(targetShadows.length, 1, `${presentation}: ${target.id} renders exactly one floor shadow`);
    assert.equal(targetShadows[0].position.x, expectedX, `${presentation}: ${target.id} shadow is centered under the wall (x=${expectedX})`);
    assert.ok(Math.abs(targetShadows[0].position.y - (floorY + 0.018)) < 1e-9, `${presentation}: ${target.id} shadow sits just above the track floor`);
    assert.ok(Math.abs(targetShadows[0].scale.x - expectedWidthWU) < 1e-9, `${presentation}: ${target.id} shadow spans the wall footprint (${expectedWidthWU} WU)`);
    assert.ok(targetShadows[0].alpha > 0, `${presentation}: ${target.id} shadow has non-zero alpha`);
  };
  assertShadow(squat, 0, 4 - 0.06);
  assertShadow(weaveLeft, 1.0, 2 - 0.06);
  assertShadow(weaveRight, -1.0, 2 - 0.06);
}

console.log("Boxing obstacle shapes: squat top-row full-width bar + weave full-lane walls (unit) passed.");
