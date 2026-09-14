// @ts-check
import assert from "node:assert/strict";
import {
  buildGameplaySceneModel,
  defaultRendererTuning,
  gameplayWorldGrid,
  aftermathPose,
  aftermathLaunchVelocity,
  aftermathSliceOffsetX,
  hazardContactEnvelopeIntensity,
  hazardContactIntensity,
} from "../src/index.js";
import { boxingColliderRowY } from "@aerobeat/web-contracts/gameplay-contracts";

const T = defaultRendererTuning;

// --- z2tx: Boxing reach-row presentation ---

// Unit oracle: at {1,1}, the mapping equals the legacy full-grid mapping (rows 2,1,0).
for (const row of [0, 1, 2]) {
  const { worldY } = boxingColliderRowY(row, { topRowReachWU: 1, bottomRowReachWU: 1 });
  assert.equal(worldY, [2, 1, 0][row], `row ${row} at {1,1} must equal legacy ${[2,1,0][row]}`);
}

// Unit oracle: at default {0.25, 0.25}, rows are 1.25, 1.0, 0.75.
for (const [row, expected] of [[0, 1.25], [1, 1], [2, 0.75]]) {
  const { worldY } = boxingColliderRowY(row, { topRowReachWU: 0.25, bottomRowReachWU: 0.25 });
  assert.ok(Math.abs(worldY - expected) < 1e-12, `row ${row} at {0.25,0.25} must be ${expected}, got ${worldY}`);
}

// Browser/model oracle: grid tiles render only the three reach rows when grid is on.
{
  const frame = { presentation: "boxing_collider", nowMs: 0, targets: [], showGameplayGrid: true, rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 } };
  const model = buildGameplaySceneModel(frame);
  const cells = model.objects.filter((o) => o.kind === "cell" && o.id.startsWith("cell-row"));
  assert.equal(cells.length, 12, "boxing_collider grid must have 12 tiles (3 rows x 4 cols)");
  const ys = [...new Set(cells.map((c) => c.position.y))].sort((a, b) => b - a);
  assert.deepEqual(ys, [1.25, 1.0, 0.75], "reach rows must be 1.25/1.0/0.75 at {0.25,0.25}");
}

// Byte-identity: Flow/Lanes/Grid presentations unchanged at {1,1} (no rowReach passed).
{
  const flowFrame = { presentation: "flow", nowMs: 1000, targets: [{ id: "t1", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [], lane: null, beatCenterMs: 1500, direction: null }] };
  const m1 = buildGameplaySceneModel(flowFrame);
  const m2 = buildGameplaySceneModel({ ...flowFrame, rowReach: { topRowReachWU: 1, bottomRowReachWU: 1 } });
  assert.deepEqual(m1.objects, m2.objects, "flow at {1,1} with explicit rowReach must be byte-identical to absent");
}

// {1,1} identity for boxing_collider: icon Y equals the legacy full-grid row Y.
{
  // Cell 5 = column 1, row 1 → legacy worldY = 1.0. At {1,1}, reach row 1 = 1.0.
  const target = { id: "p", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 1500 };
  const model = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [target], rowReach: { topRowReachWU: 1, bottomRowReachWU: 1 } });
  const icon = model.objects.find((o) => o.targetId === "p" && o.kind === "icon");
  assert.equal(icon.position.y, 1.0, "cell 5 (row 1) icon Y must be 1.0 at {1,1}");
  // Cell 0 = column 0, row 0 → legacy worldY = 2.0. At {1,1}, reach row 0 = 1+1 = 2.0.
  const target0 = { ...target, id: "p0", cell: 0, cells: [0] };
  const model0 = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [target0], rowReach: { topRowReachWU: 1, bottomRowReachWU: 1 } });
  const icon0 = model0.objects.find((o) => o.targetId === "p0" && o.kind === "icon");
  assert.equal(icon0.position.y, 2.0, "cell 0 (row 0) icon Y must be 2.0 at {1,1}");
}

// --- p5pr: hit-success aftermath engine ---

// Per-family launch direction (incl. hook sign per hand).
{
  const mk = (family, hand, mode) => ({ targetId: "x", hitCommitMs: 0, family, hand, mode, spawn: { x: 0, y: 1, z: 0 }, seed: 1 });
  assert.deepEqual(aftermathLaunchVelocity(mk("punch", "left", "hook")), { x: 1.2, y: 0.3, z: -3 }, "left hook +X");
  assert.deepEqual(aftermathLaunchVelocity(mk("punch", "right", "hook")), { x: -1.2, y: 0.3, z: -3 }, "right hook -X");
  assert.deepEqual(aftermathLaunchVelocity(mk("punch", "left", "straight")), { x: 0, y: 0.5, z: -4 }, "straight");
  assert.deepEqual(aftermathLaunchVelocity(mk("punch", "left", "uppercut")), { x: 0, y: 2.2, z: -2.5 }, "uppercut up");
  assert.deepEqual(aftermathLaunchVelocity(mk("guard", "both", "bonk")), { x: 0, y: 0.2, z: -0.5 }, "guard bonk tiny");
  assert.deepEqual(aftermathLaunchVelocity(mk("flow", "neutral", "slice")), { x: 0, y: 0.4, z: -2 }, "flow note neutral");
}

// Y never below floor (floorY − halfHeight).
{
  const floorY = gameplayWorldGrid.floorY - 0.45;
  for (const [family, hand, mode] of [["punch", "left", "straight"], ["punch", "right", "hook"], ["punch", "left", "uppercut"], ["guard", "both", "bonk"], ["flow", "neutral", "slice"]]) {
    const entry = { targetId: "t", hitCommitMs: 0, family, hand, mode, spawn: { x: 0, y: 1, z: 0 }, seed: 42 };
    for (let t = 0; t <= 3000; t += 5) {
      const p = aftermathPose(entry, t);
      if (!p) continue;
      assert.ok(p.y >= floorY - 1e-9, `${family}/${mode} y=${p.y.toFixed(6)} below floor ${floorY} at t=${t}`);
    }
  }
}

// Finite settle time.
{
  const entry = { targetId: "t", hitCommitMs: 0, family: "punch", hand: "left", mode: "straight", spawn: { x: 0, y: 1, z: 0 }, seed: 42 };
  const pose = aftermathPose(entry, 0);
  assert.ok(Number.isFinite(pose.settleMs) && pose.settleMs > 0, "settle time finite and positive");
  const settledPose = aftermathPose(entry, pose.settleMs + 1);
  assert.equal(settledPose?.settled, true, "settled flag set after settle time");
}

// Determinism at sampled times (same input → identical poses).
{
  const entry = { targetId: "t", hitCommitMs: 100, family: "punch", hand: "left", mode: "hook", spawn: { x: 0.5, y: 1.2, z: -0.3 }, seed: 99 };
  for (const t of [0, 50, 120, 250, 500, 800]) {
    const a = aftermathPose(entry, t);
    const b = aftermathPose(entry, t);
    assert.deepEqual(a, b, `deterministic at t=${t}`);
  }
}

// Zero-aftermath-entries identity.
{
  const base = { presentation: "flow", nowMs: 0, targets: [{ id: "t1", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [], lane: null, beatCenterMs: 500, direction: null }] };
  const m1 = buildGameplaySceneModel(base);
  const m2 = buildGameplaySceneModel({ ...base, aftermath: [] });
  assert.deepEqual(m1.objects, m2.objects, "zero aftermath entries = zero visual change");
}

// Aftermath handoff: hit target with aftermath entry does not double-render its icon.
{
  const target = { id: "hit1", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [], lane: null, beatCenterMs: 1000, judgement: "hit", feedbackProgress: 0.5 };
  const entry = { targetId: "hit1", hitCommitMs: 1000, family: "flow", hand: "neutral", mode: "single", spawn: { x: -0.5, y: 1, z: 0 }, seed: 3 };
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 1100, targets: [target], aftermath: [entry] });
  const icons = model.objects.filter((o) => o.targetId === "hit1" && o.kind === "icon");
  const aftermaths = model.objects.filter((o) => o.targetId === "hit1" && o.kind === "aftermath");
  assert.equal(icons.length, 0, "hit icon handed off to aftermath (no double-render)");
  assert.ok(aftermaths.length >= 1, "aftermath object present");
}

// Flow slice: two halves with distinct offsets.
{
  const entry = { targetId: "fs", hitCommitMs: 0, family: "flow", hand: "neutral", mode: "slice", spawn: { x: 0, y: 1, z: 0 }, seed: 55 };
  const objs = [];
  // Rebuild via model to get both halves
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 100, targets: [], aftermath: [entry] });
  const halves = model.objects.filter((o) => o.targetId === "fs" && o.kind === "aftermath");
  assert.equal(halves.length, 2, "flow slice produces two halves");
  const offsets = halves.map((h) => h.aftermath.offsetXWU);
  assert.notEqual(offsets[0], offsets[1], "halves have distinct horizontal offsets");
  assert.ok(halves.every((h) => Number.isInteger(h.aftermath.sliceSign)), "each half has integer sliceSign ±1");
}

// Evicted fade: evictedAtMs starts a short fade tail.
{
  const entry = { targetId: "ev", hitCommitMs: 0, family: "punch", hand: "left", mode: "straight", spawn: { x: 0, y: 1, z: 0 }, seed: 8, evictedAtMs: 200 };
  const beforeEvict = aftermathPose(entry, 190);
  const afterEvict = aftermathPose(entry, 210);
  assert.ok(beforeEvict.alpha > afterEvict.alpha, "alpha decreases after eviction mark");
}

// Slice offset determinism.
{
  const entry = { targetId: "so", hitCommitMs: 0, family: "flow", hand: "neutral", mode: "slice", spawn: { x: 0, y: 1, z: 0 }, seed: 77 };
  assert.equal(aftermathSliceOffsetX(entry, 1), aftermathSliceOffsetX(entry, 1), "slice offset deterministic (+)");
  assert.equal(aftermathSliceOffsetX(entry, -1), aftermathSliceOffsetX(entry, -1), "slice offset deterministic (-)");
  assert.notEqual(aftermathSliceOffsetX(entry, 1), aftermathSliceOffsetX(entry, -1), "opposite signs differ");
}

// --- dntq: hazard-contact red glow vignette ---

// Envelope timing: ramp to full over rampMs, decay to zero over decayMs.
{
  assert.equal(hazardContactEnvelopeIntensity(0), 0, "zero at idle");
  assert.equal(hazardContactEnvelopeIntensity(-10), 0, "negative elapsed is zero");
  assert.ok(Math.abs(hazardContactEnvelopeIntensity(T.hazardGlowRampMs / 2) - 0.5) < 1e-9, "mid-ramp is 0.5");
  assert.equal(hazardContactEnvelopeIntensity(T.hazardGlowRampMs), 1, "peak at ramp end");
  const totalMs = T.hazardGlowRampMs + T.hazardGlowDecayMs;
  assert.equal(hazardContactEnvelopeIntensity(totalMs), 0, "zero at ramp+decay end");
  assert.ok(hazardContactEnvelopeIntensity(totalMs - 1) > 0, "just before end still active");
}

// MAX-blend on overlap.
{
  // Two overlapping events: intensity is the max, not the sum.
  const result = hazardContactIntensity([100, 150]);
  assert.equal(result.intensity, Math.max(hazardContactEnvelopeIntensity(100), hazardContactEnvelopeIntensity(150)), "MAX blend");
  assert.ok(result.intensity <= 1, "intensity never exceeds 1");
}

// Zero at idle (empty list).
{
  assert.deepEqual(hazardContactIntensity([]), { intensity: 0, activeCount: 0 }, "empty events = zero glow");
}

// Pure/deterministic.
{
  const a = hazardContactIntensity([50, 200, 400]);
  const b = hazardContactIntensity([50, 200, 400]);
  assert.deepEqual(a, b, "envelope is pure and deterministic");
}

// Model exposes hazardGlow as bounded count/hash (no coordinates).
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 100, targets: [], hazardContacts: [{ eventId: "h1", atMs: 50 }] });
  assert.equal(model.hazardGlow.present, true, "glow present after event");
  assert.equal(model.hazardGlow.activeCount, 1, "activeCount is a bounded count");
  assert.ok(model.hazardGlow.intensity > 0 && model.hazardGlow.intensity <= 1, "intensity in (0,1]");
  const serialized = JSON.stringify(model.hazardGlow);
  assert.ok(!serialized.includes("eventId") && !serialized.includes("atMs"), "hazardGlow must not expose event internals");
}

// No glow object with empty event list.
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 100, targets: [], hazardContacts: [] });
  assert.equal(model.hazardGlow.present, false, "absent with no events");
  assert.ok(!model.objects.some((o) => o.kind === "hazard_glow"), "no glow object rendered when idle");
}

console.log("0.0.52 W1-C unit oracles: boxing reach rows, aftermath closed-form (launch/floor/settle/determinism/handoff/slice/eviction), hazard envelope (timing/MAX/idle/purity) all passed.");
