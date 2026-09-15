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
  hazardWallContactIntensity,
  hazardWallContactActiveIntensity,
  hazardWallContactReleasedIntensity,
  hazardVignetteParamsForFrame,
  COLLIDER_OVERLAY_CAM_OFFSET_WU,
  toleranceConeGeometry,
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

// --- 0.0.54 W1-C: collider overlays ride the beat (z-anchored + camera-side offset) ---

// Tuning block gained the five vignette params; version/hash bumped to v5.
assert.equal(T.hazardVignetteIntensity, 0.6, "default hazardVignetteIntensity is 0.6");
assert.equal(T.hazardVignettePulseHz, 2, "default hazardVignettePulseHz is 2");
assert.equal(T.hazardVignettePulseDepth, 0.35, "default hazardVignettePulseDepth is 0.35");
assert.equal(T.hazardVignetteRampMs, 150, "default hazardVignetteRampMs is 150");
assert.equal(T.hazardVignetteDecayMs, 400, "default hazardVignetteDecayMs is 400");
assert.equal(T.version, "5", "tuning version bumped to 5");
assert.equal(T.hash, "visual-playcanvas-v5", "tuning hash bumped to v5");
assert.equal(COLLIDER_OVERLAY_CAM_OFFSET_WU, 0.03, "camera-side overlay offset is +0.03 WU");

// Overlays anchor at (p.x, p.y, p.z + camOffset) exactly at sampled travel depths.
// cell 5 → (-0.5, 1); pending target z = -(beatCenterMs-nowMs)*0.006 (future beats ride −Z toward the Z=0 hit plane).
{
  const base = { presentation: "flow", nowMs: 1000, visibleToleranceRange: true, visibleColliderRadius: true };
  const cases = [
    { beatCenterMs: 2000, z: -6 },
    { beatCenterMs: 1500, z: -3 },
    { beatCenterMs: 1166.666667, z: -1 },
    { beatCenterMs: 1016.666667, z: -0.1 },
    { beatCenterMs: 1000, z: 0 }
  ];
  for (const { beatCenterMs, z } of cases) {
    const model = buildGameplaySceneModel({ ...base, targets: [{ id: "n", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs, direction: "up" }] });
    const square = model.objects.find((o) => o.id === "n:collider:0");
    const cone = model.objects.find((o) => o.id === "n:tolerance:0");
    const marker = model.objects.find((o) => o.id === "n:target-point:0");
    assert.ok(square && cone && marker, `sample z=${z}: all three overlays present`);
    for (const object of [square, cone, marker]) {
      assert.equal(object.position.x, -0.5, `z=${z}: overlay x = target x`);
      assert.equal(object.position.y, 1, `z=${z}: overlay y = target y`);
      assert.ok(Math.abs(object.position.z - (z + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, `z=${z}: overlay anchored at p.z + camOffset (${object.position.z})`);
    }
    // The cone fan vertices themselves ride the beat: every vertex z equals p.z + camOffset.
    for (let i = 2; i < cone.aftermath.positions.length; i += 3) {
      assert.ok(Math.abs(cone.aftermath.positions[i] - (z + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, `z=${z}: cone vertex z rides the beat`);
    }
    // The square still encompasses the arrow glyph (half-extent = TARGET_HALF_EXTENT + colliderRadius).
    assert.ok(Math.abs(square.aftermath.halfExtent - (0.375 + 0.12)) < 1e-9, "square half-extent unchanged");
  }
}

// Render orders 45/46/47, layer assignment, and alphas are unchanged by the z anchoring.
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 1000, visibleToleranceRange: true, visibleColliderRadius: true, targets: [{ id: "n", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 1300, direction: "up" }] });
  const square = model.objects.find((o) => o.id === "n:collider:0");
  const cone = model.objects.find((o) => o.id === "n:tolerance:0");
  const marker = model.objects.find((o) => o.id === "n:target-point:0");
  assert.equal(square.renderOrder, 45, "square render order 45");
  assert.equal(cone.renderOrder, 46, "cone render order 46");
  assert.equal(marker.renderOrder, 47, "marker render order 47");
  assert.ok(square.transparent && cone.transparent && marker.transparent, "overlays stay transparent");
  assert.equal(square.appearanceColor, "#9a67ea", "square color unchanged");
  assert.equal(cone.appearanceColor, "#39c96b", "cone color unchanged");
  assert.equal(marker.appearanceColor, "#ffffff", "marker color unchanged");
}

// toleranceConeGeometry honors the explicit z plane for every vertex.
{
  const geometry = toleranceConeGeometry(0.5, 1, { x: 0, y: 1 }, 45, 1.1, undefined, 0.77);
  assert.ok(geometry.positions.length === (24 + 2) * 3, "vertex count unchanged");
  for (let i = 0; i < geometry.positions.length; i += 3) {
    assert.ok(Math.abs(geometry.positions[i + 2] - 0.77) < 1e-6, "every cone vertex carries the explicit z plane (float32)");
  }
  const defaultGeometry = toleranceConeGeometry(0, 0, { x: 0, y: 1 }, 45, 1.1);
  assert.ok(defaultGeometry.positions.every((_, i) => i % 3 !== 2 || defaultGeometry.positions[i] === 0), "default z plane stays 0");
}

// --- 0.0.54 W1-C: state-driven pulsing hazard vignette (pure intensity fn) ---

const wallParams = T; // default params: I0=0.6, Hz=2, depth=0.35, ramp=150, decay=400

// Idle (no state) is exactly 0; absent frame fields stay backward compatible.
assert.equal(hazardWallContactIntensity(500, undefined), 0, "no state → exactly 0");
assert.equal(hazardWallContactIntensity(500, null), 0, "null state → exactly 0");
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 1000, targets: [] });
  assert.equal(model.hazardGlow.intensity, 0, "absent new frame fields keep zero glow");
  assert.ok(!model.objects.some((o) => o.kind === "hazard_glow"), "absent fields render no glow object");
}

// Active ramp: linear 0→I0 over rampMs; mid-ramp ≈ I0/2; full at ramp end.
assert.equal(hazardWallContactIntensity(0, { active: true, sinceMs: 0, releasedAtMs: null }), 0, "zero at contact instant");
assert.ok(Math.abs(hazardWallContactIntensity(75, { active: true, sinceMs: 0, releasedAtMs: null }) - 0.3) < 1e-9, "mid-ramp is I0/2");
assert.ok(Math.abs(hazardWallContactIntensity(150, { active: true, sinceMs: 0, releasedAtMs: null }) - 0.6) < 1e-9, "full I0 at ramp end (pulse starts at max)");

// Pulse after the ramp: bounded in [I0*(1-depth), I0] and crosses BOTH bounds over one period.
{
  const state = { active: true, sinceMs: 0, releasedAtMs: null };
  let min = Infinity, max = -Infinity;
  for (let t = 150; t <= 150 + 500; t += 5) {
    const v = hazardWallContactIntensity(t, state);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const floor = 0.6 * (1 - 0.35);
  assert.ok(max > 0.6 - 1e-9 && max <= 0.6 + 1e-9, `pulse peaks at I0: ${max}`);
  assert.ok(min < floor + 1e-9 && min >= floor - 1e-9, `pulse troughs at I0*(1-depth): ${min}`);
  // Continuous at the ramp boundary (≤ epsilon jump from the ramp-in line).
  const atRamp = hazardWallContactIntensity(150, state);
  assert.ok(Math.abs(atRamp - 0.6) < 1e-9, "value at ramp boundary equals ramp-in value");
  assert.ok(Math.abs(hazardWallContactIntensity(149, state) - atRamp) < 0.02, "no jump at the ramp boundary");
}

// Released decay: starts at I_release (the active-formula value at releasedAtMs), decays linearly
// to 0 by releasedAtMs+decayMs, then stays 0. Stateless: the release-moment phase is a pure
// function of (sinceMs, releasedAtMs, params).
{
  const state = { active: false, sinceMs: 100, releasedAtMs: 600 };
  const iRelease = hazardWallContactActiveIntensity(600, { active: true, sinceMs: 100, releasedAtMs: null });
  const atRelease = hazardWallContactReleasedIntensity(600, state);
  assert.ok(Math.abs(atRelease - iRelease) < 1e-9, "decay starts at the release-moment intensity");
  assert.ok(Math.abs(hazardWallContactReleasedIntensity(850, state) - (iRelease * (1 - 250 / 400))) < 1e-9, "mid-decay (350 ms in) is the linear tail");
  assert.equal(hazardWallContactIntensity(1000, state), 0, "decay reaches exactly 0 at release+decayMs");
  assert.equal(hazardWallContactIntensity(1500, state), 0, "stays 0 after the decay window");
  assert.equal(hazardWallContactReleasedIntensity(599, state), 0, "no decay before the release instant");
  assert.ok(hazardWallContactIntensity(601, state) > hazardWallContactIntensity(900, state), "decay is monotonically decreasing");
}

// Frame params override tuning; absent frame params fall back to tuning defaults.
assert.deepEqual(hazardVignetteParamsForFrame(undefined), { intensity: 0.6, pulseHz: 2, pulseDepth: 0.35, rampMs: 150, decayMs: 400 }, "absent params → tuning defaults");
assert.deepEqual(hazardVignetteParamsForFrame({ intensity: 0.8, pulseHz: 1, pulseDepth: 0.5, rampMs: 100, decayMs: 200 }), { intensity: 0.8, pulseHz: 1, pulseDepth: 0.5, rampMs: 100, decayMs: 200 }, "frame params override");
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 700, targets: [], hazardContactActive: { active: true, sinceMs: 600, releasedAtMs: null }, hazardVignetteParams: { intensity: 1, pulseHz: 0, pulseDepth: 0, rampMs: 0, decayMs: 400 } });
  assert.ok(Math.abs(model.hazardGlow.intensity - 1) < 1e-9, "frame params override tuning in the model glow");
}

// Strict-when-present: malformed state/params records are rejected, not silently dropped.
for (const badState of [
  { active: "yes", sinceMs: 0, releasedAtMs: null },
  { active: true, sinceMs: null, releasedAtMs: null },
  { active: false, sinceMs: null, releasedAtMs: null },
  { active: false, sinceMs: 10, releasedAtMs: 5 },
  { active: true, sinceMs: 0 },
  { active: true, sinceMs: 0, releasedAtMs: null, extra: 1 },
  { active: true, sinceMs: -1, releasedAtMs: null },
  { active: true, sinceMs: 9e7, releasedAtMs: null },
  null,
  "nope"
]) {
  assert.throws(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 0, targets: [], hazardContactActive: badState }), /hazard contact active/u, `rejects malformed active state ${JSON.stringify(badState)}`);
}
for (const badParams of [
  { intensity: 1.5, pulseHz: 0, pulseDepth: 0, rampMs: 0, decayMs: 0 },
  { intensity: 0, pulseHz: 5.5, pulseDepth: 0, rampMs: 0, decayMs: 0 },
  { intensity: 0, pulseHz: 0, pulseDepth: 1.5, rampMs: 0, decayMs: 0 },
  { intensity: 0, pulseHz: 0, pulseDepth: 0, rampMs: 1001, decayMs: 0 },
  { intensity: 0, pulseHz: 0, pulseDepth: 0, rampMs: 0, decayMs: 3001 },
  { intensity: 0, pulseHz: 0, pulseDepth: 0, rampMs: 0 },
  null,
  "nope"
]) {
  assert.throws(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 0, targets: [], hazardVignetteParams: badParams }), /hazard vignette params/u, `rejects malformed params ${JSON.stringify(badParams)}`);
}

// MAX blend with the retained bomb-flash envelope: wall pulse + bomb event → max of the two.
{
  const model = buildGameplaySceneModel({ presentation: "flow", nowMs: 1100, targets: [], hazardContacts: [{ eventId: "bomb", atMs: 1000 }], hazardContactActive: { active: true, sinceMs: 900, releasedAtMs: null } });
  const bombIntensity = hazardContactEnvelopeIntensity(100);
  const wallIntensity = hazardWallContactIntensity(1100, { active: true, sinceMs: 900, releasedAtMs: null });
  assert.ok(Math.abs(model.hazardGlow.intensity - Math.max(bombIntensity, wallIntensity)) < 1e-9, "glow is the MAX of wall state and bomb envelope");
  assert.equal(model.hazardGlow.activeCount, Math.max(1, wallIntensity > 0 ? 1 : 0), "active count reflects the MAX source");
}

// Bomb-flash envelope unchanged (regression): event-only frames behave exactly as 0.0.52.
{
  const bombOnly = buildGameplaySceneModel({ presentation: "flow", nowMs: 100, targets: [], hazardContacts: [{ eventId: "h1", atMs: 50 }] });
  const expected = hazardContactEnvelopeIntensity(50);
  assert.ok(Math.abs(bombOnly.hazardGlow.intensity - expected) < 1e-9, "bomb-only envelope is unchanged");
  assert.equal(bombOnly.hazardGlow.activeCount, 1, "bomb-only active count unchanged");
}

console.log("0.0.52/0.0.54 W1-C unit oracles: boxing reach rows, aftermath closed-form, hazard bomb envelope (regression), z-anchored collider overlays, state-driven pulsing vignette (ramp/pulse/decay/idle/strict/MAX) all passed.");
