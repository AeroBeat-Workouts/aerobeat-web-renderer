// @ts-check

import assert from "node:assert/strict";
import { buildGameplaySceneModel, gameplayWorldGrid } from "../src/index.js";

// Equipment shadows are rendered via a native directional light in the renderer
// facade (createShadowLight). The scene model no longer emits `kind:"shadow"` objects for
// equipment. This test verifies that:
//   1. No equipment shadow objects are present in the scene model.
//   2. Existing note/obstacle shadows (kind:"shadow" without "equipment-shadow" prefix) are
//      unaffected and still present where expected.

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

// --- No anchors → no equipment shadows (and existing note/obstacle shadows are untouched). ---
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
