// @ts-check
// Normalized obstacle geometry owns the continuous footprint in both Boxing presentations.
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";

const CELL = 0.94;
const geometry = (x, y, width, height) => ({ schema: "aerobeat/obstacle_gameplay_geometry", version: 1, coordinateSpace: "aerobeat_top_left_grid", x, y, width, height });
const squat = { id: "squatter", kind: "obstacle", hand: "neutral", family: "squat", cell: null, cells: [0, 1, 2, 3], gameplayGeometry: geometry(0, -3, 4, 4.5), lane: null, beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };
const weaveLeft = { id: "weave-left", kind: "obstacle", hand: "left", family: "weave", cell: null, cells: [2, 3, 6, 7, 10, 11], gameplayGeometry: geometry(2, 0, 2, 3), lane: "left", beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };
const weaveRight = { id: "weave-right", kind: "obstacle", hand: "right", family: "weave", cell: null, cells: [0, 1, 4, 5, 8, 9], gameplayGeometry: geometry(0, 0, 2, 3), lane: "right", beatCenterMs: 1200, intervalStartMs: 1200, intervalEndMs: 1800 };

for (const presentation of ["boxing_lanes", "boxing_collider", "boxing_spatial_grid"]) {
  for (const [target, expectedX, expectedY, width, height] of [[squat, 0, 3.25, 4, 4.5], [weaveLeft, 1, 1, 2, 3], [weaveRight, -1, 1, 2, 3]]) {
    const model = buildGameplaySceneModel({ presentation, nowMs: 1500, timingWindowBeforeMs: 180, timingWindowAfterMs: 180, targets: [target] });
    const walls = model.objects.filter((entry) => entry.targetId === target.id && entry.kind === "obstacle");
    assert.equal(walls.length, 1, `${presentation}: ${target.id} must render one continuous GLB wall`);
    const wall = walls[0];
    assert.equal(wall.assetId, "wall/red-glass-v1");
    assert.deepEqual({ x: wall.position.x, y: wall.position.y, z: wall.position.z }, { x: expectedX, y: expectedY, z: 0 }, `${presentation}: ${target.id} geometry center and interval midpoint`);
    assert.ok(Math.abs(wall.scale.x - (width - 0.06) / CELL) < 1e-9, `${presentation}: ${target.id} footprint width ${width}`);
    assert.ok(Math.abs(wall.scale.y - (height - 0.06) / CELL) < 1e-9, `${presentation}: ${target.id} footprint height ${height}`);
    assert.ok(Math.abs(wall.scale.z - 3.6) < 1e-9, `${presentation}: ${target.id} exact 600ms interval depth`);
    assert.deepEqual([wall.intervalStartMs, wall.intervalEndMs], [1200, 1800]);
    assert.equal(model.objects.filter((entry) => entry.targetId === target.id && entry.kind === "shadow").length, 0, `${presentation}: ${target.id} emits no fake shadow`);
  }
}
console.log("Boxing obstacle geometry: squat 4.5 rows and side weaves 2 columns across all Boxing presentations passed.");
