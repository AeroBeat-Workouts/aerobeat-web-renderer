// @ts-check
//
// 0.0.90 (htsg): focused oracle for the boxing obstacle presentation shapes.
// The boxing branch of the scene model must derive the wall's vertical extent
// from the obstacle's gameplay geometry (top-left 4x3 grid):
//   - squat  → top row only, a full-width bar (4 columns x 1 row).
//   - weave  → the whole lane on the blocked side (full lane height).
// The previous behavior rendered every boxing obstacle as a full-height lane
// wall, which the browser L-F8 oracle used to enshrine; that oracle was
// rebaselined in validate-browser-renderer.js with the same shapes.
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
  assert.equal(weaveL[0].position.x, 1.5, `${presentation}: weave_left blocked column 3 renders at columnX[3]=+1.5`);
  assert.ok(Math.abs(weaveL[0].scale.x - (1 - 0.06) / CELL) < 1e-9, `${presentation}: weave_left spans exactly the authored single column`);
  assert.ok(Math.abs(weaveL[0].scale.y - (3 - 0.06) / CELL) < 1e-9, `${presentation}: weave_left keeps the full lane height (3 rows)`);

  const weaveR = walls(weaveRight);
  assert.equal(weaveR.length, 1, `${presentation}: weave_right renders exactly one wall`);
  assert.equal(weaveR[0].position.x, -1.5, `${presentation}: weave_right blocked column 0 renders at columnX[0]=-1.5`);
  assert.ok(Math.abs(weaveR[0].scale.y - (3 - 0.06) / CELL) < 1e-9, `${presentation}: weave_right keeps the full lane height (3 rows)`);

  // The floor shadow always spans the blocked columns at the track surface.
  const squatShadow = shadows(squat);
  assert.equal(squatShadow.length, 1, `${presentation}: squat shadow follows the bar`);
  assert.equal(squatShadow[0].position.x, 0, `${presentation}: squat shadow is centered on the grid`);
  assert.ok(Math.abs(squatShadow[0].scale.x - (4 - 0.06)) < 1e-9, `${presentation}: squat shadow spans the full grid width (WU)`);
}

console.log("Boxing obstacle shapes: squat top-row full-width bar + weave full-lane walls (unit) passed.");
