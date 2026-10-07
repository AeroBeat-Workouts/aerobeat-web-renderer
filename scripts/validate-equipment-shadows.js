// @ts-check

import assert from "node:assert/strict";
import { buildGameplaySceneModel, gameplayWorldGrid } from "../src/index.js";

// 0.0.92 im3p: equipment floor shadows. The scene model adds a `kind:"shadow"` object per
// non-null equipment anchor:
//   - Flow (saber): a proper light projection — the blade's XZ axis projected onto the floor,
//     clipped to the playfield bounds. Width = blade diameter (0.36 WU). When the saber points
//     straight up, the shadow degenerates to a small circle at the hilt.
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

// --- Flow: saber shadow is a proper projection of the blade onto the floor. ---
// The blade is 0.75 WU long, 0.18 WU radius. The shadow is a rectangle centered at the
// midpoint of the projected blade axis, with length = projected blade length, width = 0.36 WU.
// The shadow is CLIPPED to the playfield bounds (X ∈ [-2,2], Z ∈ [-1.5,1.5]).
{
  // Saber at (-1.2, 1.1, 0.25) pointing in direction (0.6, 0.8) (normalized: 0.6/1.0, 0.8/1.0).
  // Blade start: (-1.2, 0.25), blade end: (-1.2 + 0.75*0.6, 0.25 + 0.75*0.8) = (-0.75, 0.85).
  // Both points are inside the playfield, so no clipping.
  // Midpoint: (-0.975, 0.55), length: 0.75, rotation: atan2(0.8, 0.6).
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

  // Left saber: direction (0.6, 0.8), normalized to (0.6, 0.8) since |v| = 1.0.
  // Start: (-1.2, 0.25), End: (-1.2 + 0.75*0.6, 0.25 + 0.75*0.8) = (-0.75, 0.85).
  // Midpoint: (-0.975, 0.55), length: 0.75.
  assert.ok(Math.abs(/** @type {any} */(left).position.x - (-0.975)) < 1e-9, "left saber shadow centered at projected midpoint X");
  assert.ok(Math.abs(/** @type {any} */(left).position.z - 0.55) < 1e-9, "left saber shadow centered at projected midpoint Z");
  assert.ok(Math.abs(/** @type {any} */(left).scale.x - 0.75) < 1e-9, "saber shadow length equals blade length (0.75 WU)");
  assert.ok(Math.abs(/** @type {any} */(left).scale.z - 0.36) < 1e-9, "saber shadow width equals blade diameter (0.36 WU)");
  assert.ok(Math.abs(/** @type {any} */(left).rotationZRad - Math.atan2(0.8, 0.6)) < 1e-9, "saber shadow rotates to the floor-projected blade direction");

  // Right saber: direction (1, 0). Start: (0.8, -0.5), End: (0.8 + 0.75, -0.5) = (1.55, -0.5).
  // Midpoint: (1.175, -0.5), length: 0.75, rotation: 0.
  assert.ok(Math.abs(/** @type {any} */(right).position.x - 1.175) < 1e-9, "right saber shadow centered at projected midpoint X");
  assert.ok(Math.abs(/** @type {any} */(right).position.z - (-0.5)) < 1e-9, "right saber shadow centered at projected midpoint Z");
  assert.ok(Math.abs(/** @type {any} */(right).scale.x - 0.75) < 1e-9, "right saber shadow length is 0.75 WU");
  assert.equal(/** @type {any} */(right).rotationZRad, 0, "saber shadow with +X direction is unrotated");
}

// --- Clipping: saber partially off the playfield. ---
// Saber at (1.8, 1.0, 0) pointing +X. Blade end: (1.8 + 0.75, 0) = (2.55, 0).
// Playfield max X is 2.0, so the blade is clipped: start (1.8, 0), end (2.0, 0).
// Midpoint: (1.9, 0), length: 0.2.
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 1.8, y: 1.0, z: 0 }, right: null },
    equipmentShadowDirections: { left: { x: 1, z: 0 }, right: null }
  });
  const shadow = floorShadow(model).find((e) => e.id === "equipment-shadow-left");
  assert.ok(shadow, "clipped saber shadow present");
  assertFloorShadow(/** @type {any} */(shadow), "clipped-left");
  assert.ok(Math.abs(/** @type {any} */(shadow).position.x - 1.9) < 1e-9, "clipped shadow centered at (1.9, 0)");
  assert.ok(Math.abs(/** @type {any} */(shadow).position.z - 0) < 1e-9, "clipped shadow Z is 0");
  assert.ok(Math.abs(/** @type {any} */(shadow).scale.x - 0.2) < 1e-9, "clipped shadow length is 0.2 WU (1.8→2.0)");
  assert.ok(Math.abs(/** @type {any} */(shadow).scale.z - 0.36) < 1e-9, "clipped shadow width is 0.36 WU");
}

// --- Clipping: saber entirely off the playfield → no shadow. ---
// Saber at (3.0, 1.0, 0) pointing +X. Entirely past the playfield (max X = 2.0).
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 3.0, y: 1.0, z: 0 }, right: null },
    equipmentShadowDirections: { left: { x: 1, z: 0 }, right: null }
  });
  const shadows = floorShadow(model);
  assert.equal(shadows.length, 0, "saber entirely off the playfield → no shadow rendered");
}

// --- Saber pointing +Z (forward): shadow elongated in Z. ---
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 0, y: 1.5, z: 0 }, right: null },
    equipmentShadowDirections: { left: { x: 0, z: 1 }, right: null }
  });
  const shadow = floorShadow(model).find((e) => e.id === "equipment-shadow-left");
  assert.ok(shadow, "saber shadow present (forward)");
  // Start: (0, 0), End: (0, 0.75). Midpoint: (0, 0.375), length: 0.75, rotation: atan2(1,0) = π/2.
  assert.ok(Math.abs(/** @type {any} */(shadow).position.x - 0) < 1e-9, "forward saber shadow X is 0");
  assert.ok(Math.abs(/** @type {any} */(shadow).position.z - 0.375) < 1e-9, "forward saber shadow Z is 0.375");
  assert.ok(Math.abs(/** @type {any} */(shadow).scale.x - 0.75) < 1e-9, "forward saber shadow length is 0.75");
  assert.ok(Math.abs(/** @type {any} */(shadow).rotationZRad - Math.PI / 2) < 1e-9, "forward saber shadow rotation is 90°");
}

// --- Saber pointing -X (backward): shadow elongated in -X. ---
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 0, y: 1.5, z: 0 }, right: null },
    equipmentShadowDirections: { left: { x: -1, z: 0 }, right: null }
  });
  const shadow = floorShadow(model).find((e) => e.id === "equipment-shadow-left");
  assert.ok(shadow, "saber shadow present (backward)");
  // Start: (0, 0), End: (-0.75, 0). Midpoint: (-0.375, 0), length: 0.75, rotation: atan2(0,-1) = π.
  assert.ok(Math.abs(/** @type {any} */(shadow).position.x - (-0.375)) < 1e-9, "backward saber shadow X is -0.375");
  assert.ok(Math.abs(/** @type {any} */(shadow).scale.x - 0.75) < 1e-9, "backward saber shadow length is 0.75");
  assert.ok(Math.abs(/** @type {any} */(shadow).rotationZRad - Math.PI) < 1e-9, "backward saber shadow rotation is 180°");
}

// --- Saber below the floor → no shadow. ---
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 0, y: -1.0, z: 0 }, right: null },
    equipmentShadowDirections: { left: { x: 1, z: 0 }, right: null }
  });
  const shadows = floorShadow(model);
  assert.equal(shadows.length, 0, "saber below the floor → no shadow");
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

// --- Clipping at Z boundary: saber pointing +Z from near the Z max boundary. ---
// Saber at (0, 1.0, 1.3) pointing +Z. Blade end: (0, 1.3 + 0.75) = (0, 2.05).
// Playfield max Z is 1.5, so clipped: start (0, 1.3), end (0, 1.5). Length: 0.2.
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: 0, y: 1.0, z: 1.3 }, right: null },
    equipmentShadowDirections: { left: { x: 0, z: 1 }, right: null }
  });
  const shadow = floorShadow(model).find((e) => e.id === "equipment-shadow-left");
  assert.ok(shadow, "Z-clipped saber shadow present");
  assert.ok(Math.abs(/** @type {any} */(shadow).position.z - 1.4) < 1e-9, "Z-clipped shadow centered at Z=1.4");
  assert.ok(Math.abs(/** @type {any} */(shadow).scale.x - 0.2) < 1e-9, "Z-clipped shadow length is 0.2 WU");
}

console.log("Equipment floor shadows: saber projection (clipped to playfield) + glove circle at floor Y, renderOrder 35 / alpha 0.3 (unit) passed.");
