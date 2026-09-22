// @ts-check
import assert from "node:assert/strict";
import {
  buildGameplaySceneModel,
  defaultRendererTuning,
  gameplayWorldGrid,
  aftermathPose,
  aftermathLaunchVelocity,
  aftermathSliceGlyphLengthWU,
  aftermathSliceOffsetX,
  hazardContactEnvelopeIntensity,
  hazardContactIntensity,
  hazardWallContactIntensity,
  hazardWallContactActiveIntensity,
  hazardWallContactReleasedIntensity,
  hazardVignetteParamsForFrame,
  iconRenderPosition,
  COLLIDER_OVERLAY_CAM_OFFSET_WU,
  defaultTestPresentationConfig,
  createTestPresentationConfig,
  testPresentationBounceOffsetY,
  toleranceConeGeometry,
} from "../src/index.js";
import { boxingColliderRowY } from "@aerobeat/web-contracts/gameplay-contracts";

// 0.0.55 W3: bounce-test config — skyMode off (isolate the bounce offset from the 50 WU sky
// prelude) AND a 12 WU normal spawn distance (2000 ms lead) so the future-cull gate (10000 ms)
// lets the full bounce window render: with the default 50 WU distance the spawn lead is 8333 ms
// and a sub-8333 ms bounce window would be culled before it ever becomes visible.
const BOUNCE_TEST = createTestPresentationConfig(2, 0.4, 0.4, "out_quad", "in_quad", 12, "off", 0, 1000, "in_out_sine", 1.8);

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

// 0.0.54 P2 (Derrick playtest item 7 follow-up): the REAL assembly punch target shape
// (session-render-projection: kind "punch", `cell` set, `cells: []`, lane = hand) must emit
// an icon at its reach-row position. The pre-fix cell branch mapped `target.cells` only,
// yielding zero positions — punches rendered as empty grid positions in boxing_collider.
{
  const punch = { id: "pp", kind: "punch", hand: "left", family: "straight", cell: 5, cells: [], lane: "left", beatCenterMs: 1500, direction: null };
  const model = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [punch], rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 } });
  const icon = model.objects.find((o) => o.targetId === "pp" && o.kind === "icon");
  assert(icon, "real-shape boxing_collider punch (cell set, cells []) must emit an icon object");
  assert.equal(icon.position.y, 1.0, "cell 5 (row 1 = shoulder anchor) icon Y must be 1.0 at 0.25/0.25 reach");
  assert.equal(icon.position.x, -0.5, "cell 5 (column 1) icon X must be -0.5");
  assert.equal(icon.assetId, "any-note/outlined-circle-v1", "directionless straight punch renders the any-note glyph");
  // Directional punch (hook with entry direction) keeps the directional arrow glyph.
  const hook = { ...punch, id: "ph", family: "hook", direction: "up" };
  const modelHook = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [hook], rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 } });
  const iconHook = modelHook.objects.find((o) => o.targetId === "ph" && o.kind === "icon");
  assert(iconHook && iconHook.assetId === "directional-arrow/rounded-outline-v1", "directional boxing punch keeps the arrow glyph");
  // Legacy cells-populated shape still works (regression guard for the {1,1} identity targets above).
  const legacyShape = { id: "pl", kind: "punch", hand: "right", family: "hook", cell: 6, cells: [6], lane: "right", beatCenterMs: 1500, direction: "up" };
  const modelLegacy = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [legacyShape], rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 } });
  assert.equal(modelLegacy.objects.filter((o) => o.targetId === "pl" && o.kind === "icon").length, 1, "cells-populated punch shape still emits exactly one icon");
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

// 0.0.59 B14: no below-track floor — every family's y is ONE parabola (brief launch arc, then a
// monotonic fall) that crosses BELOW the track surface (y = −0.80) and keeps going off-screen.
{
  const trackY = -0.80;
  for (const [family, hand, mode] of [["punch", "left", "straight"], ["punch", "right", "hook"], ["punch", "left", "uppercut"], ["guard", "both", "bonk"], ["flow", "neutral", "slice"]]) {
    const entry = { targetId: "t", hitCommitMs: 0, family, hand, mode, spawn: { x: 0, y: 1, z: 0 }, seed: 42 };
    let sawBelowTrack = false, descending = false, prevY = 0;
    for (let t = 0; t <= 3000; t += 5) {
      const p = aftermathPose(entry, t);
      if (!p) { // faded after going off-screen — must only happen once already below the track
        assert.ok(sawBelowTrack, `${family}/${mode} faded before ever crossing the track surface`);
        break;
      }
      if (!descending) {
        if (p.y < prevY) descending = true;
        assert.ok(p.y >= trackY, `${family}/${mode} rose above the track? t=${t}`);
      } else {
        assert.ok(p.y <= prevY + 1e-9, `${family}/${mode} y rose after starting to fall (no bounce): t=${t}, ${prevY} → ${p.y}`);
        if (p.y < trackY) sawBelowTrack = true;
      }
      prevY = p.y;
    }
    assert.ok(sawBelowTrack, `${family}/${mode} must fall below the track surface (y < ${trackY}) during its fall`);
  }
}

// 0.0.59 B14: finite off-screen crossing time ("settleMs" is now that crossing), and the pose
// keeps falling (no rest) right after it — the "settled" flag is gone: one flight phase.
{
  const entry = { targetId: "t", hitCommitMs: 0, family: "punch", hand: "left", mode: "straight", spawn: { x: 0, y: 1, z: 0 }, seed: 42 };
  const pose = aftermathPose(entry, 0);
  assert.ok(Number.isFinite(pose.settleMs) && pose.settleMs > 0, "off-screen crossing time finite and positive");
  assert.equal(pose.settled, false, "B14: no settled phase — the whole fall is one flight phase");
  const atCrossing = aftermathPose(entry, pose.settleMs + 1);
  assert.ok(atCrossing, "pose still exists just after the off-screen crossing (fade tail in progress)");
  assert.equal(atCrossing.settled, false, "B14: no settled flag at/after the crossing");
  assert.ok(atCrossing.y < -1.5, `B14: y is below the off-screen line at the crossing (got ${atCrossing.y.toFixed(4)})`);
  assert.ok(atCrossing.alpha < 1, `B14: fade tail has begun after the crossing (alpha=${atCrossing.alpha.toFixed(3)})`);
  // The pose fades to null shortly after the crossing (within aftermathEvictedFadeMs).
  const gone = aftermathPose(entry, pose.settleMs + T.aftermathEvictedFadeMs + 1);
  assert.equal(gone, null, "B14: pose is null once the off-screen fade completes");
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

// 0.0.63 D5: wider half separation (blade-cut entries only).
{
  const tuning = defaultRendererTuning;
  // A saber-cut flow/slice entry carries `sliceT` → the WIDER per-half spread.
  const cut = { targetId: "w1", hitCommitMs: 0, family: "flow", hand: "left", mode: "slice", spawn: { x: 0, y: 1, z: 0 }, seed: 11, shape: "arrow", sliceT: 0.5 };
  assert.ok(Math.abs(aftermathSliceOffsetX(cut, 1) - aftermathSliceOffsetX(cut, -1)) > tuning.aftermathSliceSeparationWU * 0.99, "a sliceT-present slice corpse spreads WIDER than the legacy base total (.16)");
  assert.ok(Math.abs(aftermathSliceOffsetX(cut, 1) - aftermathSliceOffsetX(cut, -1)) <= tuning.aftermathSliceWiderSeparationWU + 1e-9, "wider spread caps at aftermathSliceWiderSeparationWU + jitter bound");
  // Legacy / non-slice entries keep the exact .16-based offset (backward compatible).
  const legacy = { targetId: "w2", hitCommitMs: 0, family: "flow", hand: "left", mode: "single", spawn: { x: 0, y: 1, z: 0 }, seed: 11 };
  const baseSpread = tuning.aftermathSliceSeparationWU;
  // The two legacy halves' total spread stays on the legacy base scale (never the wider one).
  const legacyTotal = Math.abs(aftermathSliceOffsetX(legacy, 1) - aftermathSliceOffsetX(legacy, -1));
  const cutTotal = Math.abs(aftermathSliceOffsetX(cut, 1) - aftermathSliceOffsetX(cut, -1));
  assert.ok(legacyTotal < cutTotal, "legacy (no sliceT) halves stay narrower than a blade-cut corpse (cut=${cutTotal.toFixed(4)} vs legacy=${legacyTotal.toFixed(4)})");
  assert.ok(legacyTotal <= baseSpread + 1e-9, "legacy spread never exceeds the .16 base total");
  // Glyph long-axis length per shape (authored GLB local extents).
  assert.equal(aftermathSliceGlyphLengthWU({ shape: "arrow" }), 0.78, "arrow glyph long axis = 0.78 WU (authored Y extent)");
  assert.equal(aftermathSliceGlyphLengthWU({ shape: "orb" }), 0.7, "orb glyph long axis = 0.70 WU (authored Y extent)");
  assert.equal(aftermathSliceGlyphLengthWU({}), 0.7, "absent shape defaults to the orb extent");
}

// 0.0.63 D5: sliceT rides the scene visual for slice halves ONLY.
{
  const mkEntry = (sliceT, mode = "slice") => Object.freeze({ targetId: "s", hitCommitMs: 0, family: "flow", hand: "left", mode, spawn: Object.freeze({ x: 0, y: 1, z: 0 }), seed: 5, ...(sliceT === undefined ? {} : { sliceT }) });
  // sliceT present on a slice → both halves carry it in their aftermath visual.
  const modelCut = buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [mkEntry(0.3)] });
  const cutHalves = modelCut.objects.filter((o) => o.kind === "aftermath");
  assert.equal(cutHalves.length, 2, "slice produces two halves");
  assert.ok(cutHalves.every((h) => h.aftermath.sliceT === 0.3), "both halves ride sliceT in the visual");
  assert.ok(cutHalves.every((h) => Number.isFinite(h.aftermath.offsetXWU)), "each half keeps its lateral offset");
  // Absent sliceT (legacy) → no sliceT key on the visual (byte-identical to pre-D5 shape).
  const modelLegacy = buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [mkEntry(undefined)] });
  assert.ok(modelLegacy.objects.every((o) => !(o.aftermath && Object.hasOwn(o.aftermath, "sliceT"))), "legacy slice halves omit sliceT from the visual");
  // Non-slice aftermath (whole) never carries sliceT even if the field is present… 
  // (it's only honored on flow/slice entries; validator still admits it but the
  //  scene builder omits it from whole-corpse visuals by construction.)
  const singleEntry = Object.freeze({ targetId: "ss", hitCommitMs: 0, family: "flow", hand: "left", mode: "single", spawn: Object.freeze({ x: 0, y: 1, z: 0 }), seed: 5 });
  const modelSingle = buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [singleEntry] });
  const whole = modelSingle.objects.find((o) => o.kind === "aftermath");
  assert.ok(!Object.hasOwn(whole.aftermath, "sliceT"), "whole (non-slice) aftermath never carries sliceT");
  // Scene-model admission: out-of-range sliceT is REJECTED by frame validation.
  assert.throws(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [{ ...mkEntry(), sliceT: 1.4 }] }), TypeError);
  assert.throws(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [{ ...mkEntry(), sliceT: -0.1 }] }), TypeError);
  assert.throws(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [{ ...mkEntry(), sliceT: Number.NaN }] }), TypeError);
  // Boundaries 0 and 1 are ADMITTED (tail / head cuts).
  assert.doesNotThrow(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [mkEntry(0)] }));
  assert.doesNotThrow(() => buildGameplaySceneModel({ presentation: "flow", nowMs: 50, targets: [], aftermath: [mkEntry(1)] }));
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
assert.equal(T.version, "6", "0.0.63 D5: tuning version bumped to 6 (wider slice separation)");
assert.equal(T.hash, "visual-3fed1dee", "0.0.63 D5: tuning hash bumped to v6 (aftermathSliceWiderSeparationWU added)");
assert.equal(T.aftermathSliceWiderSeparationWU, 0.46, "0.0.63 D5: wider slice separation = .46 WU total spread (.16 base + .30 per-half target)");
assert.ok(T.aftermathSliceWiderSeparationWU > T.aftermathSliceSeparationWU, "wider separation exceeds the legacy base");
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

// --- 0.0.55 W3: overlays anchor at the note icon's ACTUAL rendered position ---
// Derrick's playtest bugs 1-4: the tolerance triangle + target point + collider square did not
// follow the note — (a) triangle disconnected from the point, (b) no follow during the bounce
// up/down, (c) the triangle "shot forward / re-aligned" on a miss, (d) no follow during the sky
// prelude until the note snapped into position. Root cause: the overlays anchored at the base
// targetPositions (no bounce/sky Y offset) while the icon rendered at base + totalOffset. Fix:
// both now share `iconRenderPosition` as the single source of truth.

const BOUNCES = {
  // Bouncing note (BOUNCE_TEST config: 12 WU spawn = 2000 ms lead): beat center 3000,
  // normal spawn 1000, bounce window [1000, 3000) with apex at 1800 (q=0.4). The 10000 ms
  // future-cull gate un-culls the note at nowMs = -5333, so every sampled moment is visible.
  apexNowMs: 1800,
  midNowMs: 1600,
  landingNowMs: 3000,
  // Trajectory fields (same on all bouncing notes below).
  beatCenterMs: 3000,
  bounceStartMs: 1000,
  normalSpawnMs: 1000,
  skyPreludeStartMs: 1000,
};
const bouncingNote = (id) => ({ id, kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: BOUNCES.beatCenterMs, direction: "up", bounceStartMs: BOUNCES.bounceStartMs, normalSpawnMs: BOUNCES.normalSpawnMs, skyPreludeStartMs: BOUNCES.skyPreludeStartMs });
// Bounce-isolated oracles pass BOUNCE_TEST to buildGameplaySceneModel as the presentationConfig
// argument; the sky-prelude oracle (5) keeps the default config (skyMode "prelude").
const overlayFrame = (target, nowMs) => ({ presentation: "flow", nowMs, targets: [target], visibleToleranceRange: true, visibleColliderRadius: true });
const overlayTriple = (model) => ({
  square: model.objects.find((o) => o.id === "n3:collider:0"),
  cone: model.objects.find((o) => o.id === "n3:tolerance:0"),
  marker: model.objects.find((o) => o.id === "n3:target-point:0"),
});

// (1) Bounce apex: offset > 0 → icon Y = base + offset, ALL three overlays share it (triangle
// connected to the point AND to the square), and all differ from the base Y (they ride the bounce).
{
  const target = bouncingNote("n3");
  const nowMs = BOUNCES.apexNowMs;
  const model = buildGameplaySceneModel(overlayFrame(target, nowMs), undefined, undefined, BOUNCE_TEST);
  const icon = model.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  assert(icon, "bouncing note icon rendered at apex");
  const baseY = 1.0; // cell 5 → column 1, row 1
  const expectedOffset = testPresentationBounceOffsetY(nowMs, BOUNCES.bounceStartMs, BOUNCES.beatCenterMs, defaultTestPresentationConfig);
  const expectedY = baseY + expectedOffset;
  assert.ok(expectedOffset > 0.1, `bounce offset must be nonzero at apex (got ${expectedOffset})`);
  const iconY = icon.position.y;
  assert.ok(Math.abs(iconY - expectedY) < 1e-9, `icon Y at apex = base + offset (${iconY} vs ${expectedY})`);
  assert.ok(Math.abs(iconY - baseY) > 1e-6, `icon Y at apex differs from base Y (${iconY} vs ${baseY})`);
  const { square, cone, marker } = overlayTriple(model);
  assert(square && cone && marker, "all three overlays present at apex");
  for (const [label, o] of [["square", square], ["cone", cone], ["marker", marker]]) {
    assert.ok(Math.abs(o.position.y - expectedY) < 1e-6, `${label} Y at apex == icon Y == base + offset (${o.position.y})`);
    assert.ok(Math.abs(o.position.y - baseY) > 1e-6, `${label} Y at apex differs from base Y (overlay follows the bounce)`);
    assert.ok(Math.abs(o.position.x - icon.position.x) < 1e-9, `${label} X at apex == icon X`);
  }
}

// (2) Mid-bounce (nonzero, non-apex offset): overlays still track the icon exactly.
{
  const target = bouncingNote("n3");
  const nowMs = BOUNCES.midNowMs;
  const model = buildGameplaySceneModel(overlayFrame(target, nowMs), undefined, undefined, BOUNCE_TEST);
  const icon = model.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  const offset = testPresentationBounceOffsetY(nowMs, BOUNCES.bounceStartMs, BOUNCES.beatCenterMs, defaultTestPresentationConfig);
  assert.ok(offset > 0 && Math.abs(offset - 0.4) > 1e-3, `mid-bounce offset nonzero and not apex (got ${offset})`);
  const { square, cone, marker } = overlayTriple(model);
  for (const [label, o] of [["square", square], ["cone", cone], ["marker", marker]]) {
    assert.ok(Math.abs(o.position.y - icon.position.y) < 1e-6, `${label} Y mid-bounce == icon Y`);
  }
  // Icon Z at this moment: pending travel z = -(beat-now)*0.006 (future beats are farther toward −Z).
  const expectedZ = (BOUNCES.beatCenterMs - nowMs) * -0.006; // (3000-1600)*-0.006 = -8.4
  assert.ok(Math.abs(expectedZ - (-8.4)) < 1e-9, "mid-bounce pending Z is -8.4 (sanity)");
  assert.ok(Math.abs(icon.position.z - expectedZ) < 1e-9, "icon Z is pending travel Z");
  for (const o of [square, cone, marker]) {
    assert.ok(Math.abs(o.position.z - (expectedZ + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, "overlay Z mid-bounce == icon Z + camOffset");
  }
  // Cone fan vertices ride the same plane.
  for (let i = 2; i < cone.aftermath.positions.length; i += 3) {
    assert.ok(Math.abs(cone.aftermath.positions[i] - (expectedZ + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, "cone vertex z mid-bounce rides the icon");
  }
}

// (3) At the hit plane (beat center, z=0, no offset): overlay Y == icon Y == base Y, overlay Z == icon Z (0) + camOffset.
{
  const target = bouncingNote("n3");
  const nowMs = BOUNCES.landingNowMs;
  const model = buildGameplaySceneModel(overlayFrame(target, nowMs), undefined, undefined, BOUNCE_TEST);
  const icon = model.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  const { square, cone, marker } = overlayTriple(model);
  assert.ok(Math.abs(icon.position.y - 1.0) < 1e-9, "icon Y at landing == base Y (offset 0)");
  assert.ok(Math.abs(icon.position.z) < 1e-9, "icon Z at landing == 0 (hit plane)");
  for (const [label, o] of [["square", square], ["cone", cone], ["marker", marker]]) {
    assert.ok(Math.abs(o.position.y - 1.0) < 1e-6, `${label} Y at landing == icon Y == base Y`);
    assert.ok(Math.abs(o.position.z - COLLIDER_OVERLAY_CAM_OFFSET_WU) < 1e-6, `${label} Z at landing == icon Z (0) + camOffset`);
  }
}

// (4) Overlay Z == icon Z (state Z) at pending, hit, and miss moments.
{
  // Pending: icon Z is the timestamp→Z travel; overlays add only the camOffset.
  const pending = bouncingNote("n3");
  const pendingNow = 2800; // beat 3000 → z = -(3000-2800)*0.006 = -1.2
  const pm = buildGameplaySceneModel(overlayFrame(pending, pendingNow), undefined, undefined, BOUNCE_TEST);
  const pIcon = pm.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  const pT = overlayTriple(pm);
  assert.ok(Math.abs(pIcon.position.z - (-1.2)) < 1e-9, "pending icon Z = -1.2");
  for (const o of [pT.square, pT.cone, pT.marker]) {
    assert.ok(Math.abs(o.position.z - (pIcon.position.z + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, "pending overlay Z == icon Z + camOffset");
  }
  // 0.0.56 W1 (B2): the overlay DISAPPEARS the moment the beat resolves. A `hit` target has
  // state `hit` → `colliderOverlayObjects` skips it, so NO overlay objects (square/cone/marker)
  // are emitted for it — the live-targeting aid deactivates on resolve. The icon itself is still
  // rendered (within its 80 ms removal window), proving the gate is on the overlay, not the icon.
  const hit = { id: "n3", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 2000, direction: "up", judgement: "hit", feedbackProgress: 0 };
  const hm = buildGameplaySceneModel(overlayFrame(hit, 2000), undefined, undefined, BOUNCE_TEST);
  const hIcon = hm.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  assert.ok(hIcon && Math.abs(hIcon.position.z) < 1e-9, "hit icon Z pinned at 0 (icon still renders during removal)");
  assert.equal(overlayTriple(hm).square, undefined, "B2: hit target has NO collider_square (overlay deactivated on resolve)");
  assert.equal(overlayTriple(hm).cone, undefined, "B2: hit target has NO tolerance_cone fan (overlay deactivated on resolve)");
  assert.equal(overlayTriple(hm).marker, undefined, "B2: hit target has NO target-point marker (overlay deactivated on resolve)");
  // Miss: state `miss` → also skipped. The icon still renders (within its 350 ms expiry) but the
  // overlay is gone — the tolerance range no longer lingers over the missed beat.
  const miss = { id: "n3", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 2000, direction: "up", judgement: "miss", missCommitMs: 2000 };
  const missNow = 2050;
  const mm = buildGameplaySceneModel(overlayFrame(miss, missNow), undefined, undefined, BOUNCE_TEST);
  const mIcon = mm.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  const expectedMissZ = (missNow - 2000) * 0.006; // 0.3
  assert.ok(mIcon && Math.abs(mIcon.position.z - expectedMissZ) < 1e-9, `miss icon Z continues +Z (got ${mIcon?.position.z}, want ${expectedMissZ})`);
  assert.equal(overlayTriple(mm).square, undefined, "B2: miss target has NO collider_square (overlay deactivated on resolve)");
  assert.equal(overlayTriple(mm).cone, undefined, "B2: miss target has NO tolerance_cone fan (overlay deactivated on resolve)");
  assert.equal(overlayTriple(mm).marker, undefined, "B2: miss target has NO target-point marker (overlay deactivated on resolve)");
  // Spent (past the timing window, no judgement) is also deactivated: a beat well past its center
  // with no judgement is state `spent` → no overlay (the live-targeting aid is gone once resolved).
  const spent = bouncingNote("n3");
  const spentNow = 3000 + 180 + 600; // center 3000 + afterMs 180 + spentCull 600 → past the window
  const sm = buildGameplaySceneModel(overlayFrame(spent, spentNow), undefined, undefined, BOUNCE_TEST);
  const sT = overlayTriple(sm);
  assert.equal(sT.square, undefined, "B2: spent target has NO collider_square");
  assert.equal(sT.cone, undefined, "B2: spent target has NO tolerance_cone fan");
  assert.equal(sT.marker, undefined, "B2: spent target has NO target-point marker");
}

// (5) Sky prelude: the overlay tracks the elevated icon through the prelude (bug d — previously
// the overlay stayed at base Y until the note "snapped" into position at the lane join).
{
  // Pure sky-prelude note (no bounce at the sampled moment — bounce window [4000, 6000) starts
  // after nowMs): sky window 1000→4000 (skyPreludeStartMs=1000, lane join = normalSpawnMs=4000),
  // beat 6000 (hit plane). All three trajectory fields set so hasTrajectory activates the sky
  // offset. At nowMs 2000 (q=0.5, in_out_sine → half height): the icon is 25 WU above the base
  // and still 24 WU in front of the hit plane.
  const preludeNote = (id) => ({ id, kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 6000, direction: "up", bounceStartMs: 4000, normalSpawnMs: 4000, skyPreludeStartMs: 1000 });
  const target = preludeNote("n3");
  const nowMs = 2000;
  const model = buildGameplaySceneModel(overlayFrame(target, nowMs));
  const icon = model.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  assert(icon, "sky-prelude note icon rendered");
  assert.ok(icon.position.y > 1.0 + 1, `sky-prelude icon is elevated above base (got ${icon.position.y})`);
  const { square, cone, marker } = overlayTriple(model);
  for (const [label, o] of [["square", square], ["cone", cone], ["marker", marker]]) {
    assert.ok(Math.abs(o.position.y - icon.position.y) < 1e-6, `${label} Y tracks the elevated sky-prelude icon (${o.position.y})`);
    assert.ok(Math.abs(o.position.z - (icon.position.z + COLLIDER_OVERLAY_CAM_OFFSET_WU)) < 1e-6, `${label} Z == icon Z + camOffset in the prelude`);
  }
}

// (6) `iconRenderPosition` is the shared source of truth: it equals the rendered icon position for
// every state sampled above (behavior-preserving refactor guard).
{
  const reach = { topRowReachWU: 1, bottomRowReachWU: 1 };
  const states = [
    { target: bouncingNote("n3"), nowMs: BOUNCES.midNowMs, config: BOUNCE_TEST },
    { target: bouncingNote("n3"), nowMs: BOUNCES.apexNowMs, config: BOUNCE_TEST },
    { target: bouncingNote("n3"), nowMs: BOUNCES.landingNowMs, config: BOUNCE_TEST },
    { target: { id: "n3", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 6000, direction: "up", bounceStartMs: 4000, normalSpawnMs: 4000, skyPreludeStartMs: 1000 }, nowMs: 2000, config: defaultTestPresentationConfig }, // sky prelude (default config)
    { target: { id: "n3", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 2000, direction: "up", judgement: "hit", feedbackProgress: 0 }, nowMs: 2000, config: BOUNCE_TEST },
    { target: { id: "n3", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [5], lane: null, beatCenterMs: 2000, direction: "up", judgement: "miss", missCommitMs: 2000 }, nowMs: 2050, config: BOUNCE_TEST },
  ];
  for (const { target, nowMs, config } of states) {
    const model = buildGameplaySceneModel(overlayFrame(target, nowMs), undefined, undefined, config);
    const icon = model.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
    assert(icon, "icon present for iconRenderPosition guard");
    const anchor = iconRenderPosition({ presentation: "flow", nowMs, targets: [target] }, target, defaultRendererTuning, config, reach);
    assert.ok(Math.abs(anchor.x - icon.position.x) < 1e-9, "helper X == icon X");
    assert.ok(Math.abs(anchor.y - icon.position.y) < 1e-9, "helper Y == icon Y");
    assert.ok(Math.abs(anchor.z - icon.position.z) < 1e-9, "helper Z == icon Z");
  }
  // Boxing collider reach row: helper honors the presentation row-reach base Y (first/base position).
  const punch = { id: "n3", kind: "punch", hand: "left", family: "straight", cell: 5, cells: [], lane: "left", beatCenterMs: 1500, direction: null };
  const bModel = buildGameplaySceneModel({ presentation: "boxing_collider", nowMs: 1000, targets: [punch], rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 }, visibleToleranceRange: false, visibleColliderRadius: true });
  const bIcon = bModel.objects.find((o) => o.targetId === "n3" && o.kind === "icon");
  const bAnchor = iconRenderPosition({ presentation: "boxing_collider", nowMs: 1000, targets: [punch], rowReach: { topRowReachWU: 0.25, bottomRowReachWU: 0.25 } }, punch, defaultRendererTuning, defaultTestPresentationConfig, { topRowReachWU: 0.25, bottomRowReachWU: 0.25 });
  assert.ok(Math.abs(bAnchor.y - bIcon.position.y) < 1e-9, "helper honors the boxing_collider reach-row base Y");
  assert.ok(Math.abs(bAnchor.y - 1.0) < 1e-9, "reach-row base Y is 1.0 at 0.25/0.25");
}

console.log("0.0.52/0.0.54 W1-C unit oracles: boxing reach rows, aftermath closed-form, hazard bomb envelope (regression), z-anchored collider overlays, state-driven pulsing vignette (ramp/pulse/decay/idle/strict/MAX) all passed.");
console.log("0.0.55 W3 unit oracles: overlays anchor at the note icon's rendered position (bounce apex/mid/landing Y, pending/hit/miss state Z, sky-prelude tracking, shared iconRenderPosition source of truth) all passed.");
