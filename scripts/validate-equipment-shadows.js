// @ts-check

import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";

// Equipment shadows are rendered via a native directional light in the renderer
// facade (createShadowLight). The scene model no longer emits `kind:"shadow"` objects for
// equipment. This test verifies that:
//   1. No equipment shadow objects are present in the scene model.
//   2. Only continuous obstacles retain their fake ground-shadow objects.

const floorShadow = (model) => model.objects.filter((entry) => entry.kind === "shadow" && entry.id.startsWith("equipment-shadow"));

// --- No equipment shadow objects in the scene model (flow). ---
{
  const model = buildGameplaySceneModel({
    presentation: "flow", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: -1.2, y: 1.1, z: 0.25 }, right: { x: 0.8, y: 0.6, z: -0.5 } },
    equipmentShadowDirections: { left: { x: 0.6, z: 0.8 }, right: { x: 1, z: 0 } }
  });
  assert.equal(floorShadow(model).length, 0, "no equipment shadow objects in the scene model (flow)");
}

// --- No equipment shadow objects in the scene model (boxing). ---
{
  const model = buildGameplaySceneModel({
    presentation: "boxing_collider", nowMs: 0, targets: [],
    equipmentColliderAnchors: { left: { x: -1.5, y: 1.0, z: 0 }, right: null }
  });
  assert.equal(floorShadow(model).length, 0, "no equipment shadow objects in the scene model (boxing)");
}

// --- No anchors → no equipment shadow meshes. ---
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 0, targets: [] });
  assert.equal(floorShadow(model).length, 0, "no equipment anchors → no equipment shadows");
}

// --- Determinism: identical frames produce identical object lists (no equipment shadows). ---
{
  const frame = {
    presentation: "flow", nowMs: 100, targets: [],
    equipmentColliderAnchors: { left: { x: -0.5, y: 1, z: 0.1 }, right: { x: 0.5, y: 0.9, z: -0.2 } },
    equipmentShadowDirections: { left: { x: -1, z: 0.3 }, right: { x: 0, z: 1 } }
  };
  const a = buildGameplaySceneModel(frame).objects.filter((entry) => entry.id.startsWith("equipment-shadow"));
  const b = buildGameplaySceneModel(frame).objects.filter((entry) => entry.id.startsWith("equipment-shadow"));
  assert.deepEqual(a, b, "equipment shadow objects are deterministic (empty) per frame");
}

// --- Target fake shadows are absent while a continuous obstacle retains its shadow. ---
{
  const target = (id, kind, family, cell = 5) => ({ id, kind, family, hand: "left", cell, cells: [], lane: "left", beatCenterMs: 1000 });
  const obstacle = { ...target("wall", "obstacle", "obstacle", null), cells: [0], gameplayGeometry: { schema: "aerobeat/obstacle_gameplay_geometry", version: 1, coordinateSpace: "aerobeat_top_left_grid", x: 0, y: 0, width: 1, height: 1 }, intervalStartMs: 1000, intervalEndMs: 1200 };
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 1000, targets: [target("note", "flow", "flow"), target("bomb", "bomb", "bomb"), target("safe", "safe", "safe"), obstacle] });
  assert.deepEqual(model.objects.filter((entry) => entry.kind === "shadow").map((entry) => entry.targetId), ["wall"], "only the wall retains a fake ground shadow");
  assert.deepEqual(model.objects.filter((entry) => entry.kind === "icon").map((entry) => entry.targetId).sort(), ["bomb", "note", "safe"], "removing fake shadows does not remove target icons");
}

// --- Verify the renderer facade exposes the shadow light entity (smoke check via source). ---
// This is a lightweight source-level assertion: the renderer-facade.js must contain
// createShadowLight and reference the actual PlayCanvas directional shadow mode.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const facadePath = resolve(dirname(fileURLToPath(import.meta.url)), "../src/renderer-facade.js");
const facadeSource = readFileSync(facadePath, "utf8");
assert.ok(facadeSource.includes("createShadowLight"), "renderer-facade.js defines createShadowLight");
assert.ok(facadeSource.includes('type:"directional"'), "shadow light uses directional type");
assert.ok(facadeSource.includes("pc.SHADOW_PCF3_32F"), "shadow light uses PCF3 32F shadow mapping");
assert.ok(facadeSource.includes("castShadows:true"), "shadow light has castShadows enabled");
assert.ok(facadeSource.includes("shadowLightEntity"), "renderer-facade.js tracks shadowLightEntity");

console.log("Equipment shadows: native PCF3 directional light (no fake mesh objects in model) passed.");
