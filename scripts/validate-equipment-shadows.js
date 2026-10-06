// @ts-check

import assert from "node:assert/strict";
import { buildGameplaySceneModel, gameplayWorldGrid } from "../src/index.js";

// 0.0.92 im3p: equipment floor shadows. The scene model adds a `kind:"shadow"` object per
// non-null equipment anchor:
//   - Flow (saber): a floor rectangle following the blade's projected direction
//     (footprint 0.9 WU long × 0.36 WU wide), rotated to the floor-plane blade direction.
//   - Boxing (glove): a circular floor blob (footprint 0.4 WU).
// Both sit at floorY + 0.018, renderOrder 35, alpha 0.3, color #11141a, transparent — the same
// visual treatment as the per-note and obstacle floor shadows. Deterministic and per-frame.

const floorShadowY = gameplayWorldGrid.floorY + 0.018;
const floorShadow = (model) => model.objects.filter((entry) => entry.kind === "shadow" && entry.id.startsWith("equipment-shadow"));
const assertFloorShadow = (entry, label) => {
  assert.ok(Math.abs(entry.position.y - floorShadowY) < 1e-9, `${label}: shadow sits just above the track floor (y=${entry.position.y})`);
  assert.equal(entry.renderOrder, 35, `${label}: shadow renderOrder is 35`);
  assert.equal(entry.alpha, 0.3, `${label}: shadow alpha is SHADOW_ALPHA (0.3)`);
  assert.equal(entry.appearanceColor, "#11141a", `${label}: shadow color is SHADOW_COLOR`);
  assert.equal(entry.transparent, true, `${label}: shadow is transparent`);
};

// --- Flow: saber shadows track both anchors; the blade direction drives the rectangle rotation. ---
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: -1.2, y: 1.1, z: 0.25 }, right: { x: 0.8, y: 0.6, z: -0.5 } },
    equipmentShadowDirections: { left: { x: 0.6, z: 0.8 }, right: { x: 1, z: 0 } }
  });
  const shadows = floorShadow(model);
  assert.equal(shadows.length, 2, "flow frame with two anchors renders two saber shadows");
  const left = shadows.find((entry) => entry.id === "equipment-shadow-left");
  const right = shadows.find((entry) => entry.id === "equipment-shadow-right");
  assert.ok(left && right, "both hand saber shadows are present");
  assertFloorShadow(/** @type {any} */(left), "flow-left");
  assertFloorShadow(/** @type {any} */(right), "flow-right");
  assert.equal(/** @type {any} */(left).position.x, -1.2, "left saber shadow tracks the anchor X");
  assert.equal(/** @type {any} */(left).position.z, 0.25, "left saber shadow tracks the anchor Z");
  assert.equal(/** @type {any} */(right).position.x, 0.8, "right saber shadow tracks the anchor X");
  assert.equal(/** @type {any} */(right).position.z, -0.5, "right saber shadow tracks the anchor Z");
  assert.ok(Math.abs(/** @type {any} */(left).scale.x - 0.9) < 1e-9, "saber shadow length is 0.9 WU");
  assert.ok(Math.abs(/** @type {any} */(left).scale.z - 0.36) < 1e-9, "saber shadow width is 0.36 WU");
  assert.ok(Math.abs(/** @type {any} */(left).rotationZRad - Math.atan2(0.8, 0.6) * 180 / Math.PI) < 1e-9, "saber shadow rotates to the projected blade direction");
  assert.equal(/** @type {any} */(right).rotationZRad, 0, "saber shadow with +X direction is unrotated");
}

// --- Boxing: glove shadows are circular blobs at the anchors. ---
{
  const model = buildGameplaySceneModel({
    presentation: "boxing_collider", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: -1.5, y: 1.0, z: 0 }, right: null }
  });
  const shadows = floorShadow(model);
  assert.equal(shadows.length, 1, "boxing frame with one anchor renders one glove shadow");
  const glove = shadows[0];
  assertFloorShadow(/** @type {any} */(glove), "boxing-left");
  assert.equal(/** @type {any} */(glove).position.x, -1.5, "glove shadow tracks the anchor X");
  assert.ok(Math.abs(/** @type {any} */(glove).scale.x - 0.4) < 1e-9, "glove shadow diameter is 0.4 WU");
  assert.ok(Math.abs(/** @type {any} */(glove).scale.z - 0.4) < 1e-9, "glove shadow is a circular blob");
  assert.equal(/** @type {any} */(glove).rotationZRad, 0, "glove shadow is unrotated");
}

// --- No anchors → no equipment shadows (and existing note/obstacle shadows are untouched). ---
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 0, targets: [] });
  assert.equal(floorShadow(model).length, 0, "no equipment anchors → no equipment shadows");
}

// --- Determinism: identical frames produce identical shadow objects. ---
{
  const frame = {
    presentation: "flow", nowMs: 100, targets: [],
    equipmentColliderAnchors: { left: { x: -0.5, y: 1, z: 0.1 }, right: { x: 0.5, y: 0.9, z: -0.2 } },
    equipmentShadowDirections: { left: { x: -1, z: 0.3 }, right: { x: 0, z: 1 } }
  };
  const a = buildGameplaySceneModel(frame).objects.filter((entry) => entry.id.startsWith("equipment-shadow"));
  const b = buildGameplaySceneModel(frame).objects.filter((entry) => entry.id.startsWith("equipment-shadow"));
  assert.deepEqual(a, b, "equipment shadows are deterministic per frame");
}

console.log("Equipment floor shadows: saber rect (blade-aligned) + glove circle at floor Y, renderOrder 35 / alpha 0.3 (unit) passed.");
