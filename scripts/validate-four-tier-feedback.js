// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel, defaultRendererTuning } from "../src/index.js";

const CENTER_MS = 1000;
const COMMIT_MS = 1181;
const APPEARANCE = "#2468AC";
const targetFor = (judgement, tier) => ({
  id: "tier-test", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [],
  lane: "left", beatCenterMs: CENTER_MS, direction: "right",
  appearanceColor: APPEARANCE, judgement, tier,
  ...(judgement === "hit" ? { feedbackProgress: 0 } : { missCommitMs: COMMIT_MS }),
});
const frame = (nowMs, target) => ({
  presentation: "flow", nowMs, timingWindowBeforeMs: 180,
  timingWindowAfterMs: 180, targets: [target],
});
const parts = (model) => ({
  label: model.objects.find((entry) => entry.kind === "feedback" && entry.targetId === "tier-test"),
  icon: model.objects.find((entry) => entry.kind === "icon" && entry.targetId === "tier-test"),
});

// A finalized qualifying near miss retains its intact note and authoritative miss state.
for (const tier of ["almost"]) {
  for (const nowMs of [COMMIT_MS, COMMIT_MS + 50, COMMIT_MS + 179]) {
    const { label, icon } = parts(buildGameplaySceneModel(frame(nowMs, targetFor("miss", tier)), undefined, defaultRendererTuning));
    assert.equal(label?.feedback?.text, "Almost", `${tier} near contact spells Almost`);
    assert.equal(label?.feedback?.faceColor, "#facc15", `${tier} near contact is yellow`);
    assert.equal(label?.feedback?.apparentHeightCssPx, 44);
    assert.equal(label?.feedback?.animation, "bounce");
    assert.equal(label?.feedback?.depthBias, .5, "near label clears the GLB face without disabling depth testing");
    assert.deepEqual(label?.position, { x: -.5, y: 1, z: 0 }, "Almost stays over the target crossing");
    assert.equal(icon?.state, "miss", "judgement remains miss");
    assert.equal(icon?.appearanceColor, APPEARANCE, "near icon keeps its authored fill");
    assert.equal(icon?.position.z, (nowMs - CENTER_MS) * .006, "near icon retains committed miss motion");
    assert.equal(icon?.removal, null, "near miss cannot start hit removal or fake slice");
  }
}
// Boxing's genuine miss/good remains blue Good, with the same intact tinted icon and crossing anchor.
const boxer = { ...targetFor("miss", "good"), kind: "punch", family: "straight" };
const boxingFrame = { ...frame(COMMIT_MS + 50, boxer), presentation: "boxing_spatial_grid" };
const boxing = parts(buildGameplaySceneModel(boxingFrame, undefined, defaultRendererTuning));
assert.equal(boxing.label?.feedback?.text, "Good", "Boxing miss/good retains Good, not Flow Almost");
assert.equal(boxing.label?.feedback?.faceColor, "#6ec6ff", "Boxing miss/good remains blue");
assert.deepEqual(boxing.label?.position, { x: -.5, y: 1, z: 0 }, "Boxing near label stays at target crossing");
assert.equal(boxing.label?.feedback?.depthBias, .5);
assert.equal(boxing.icon?.state, "miss");
assert.equal(boxing.icon?.appearanceColor, APPEARANCE, "Boxing near icon keeps authored color");
assert.equal(boxing.icon?.removal, null, "Boxing miss/good cannot fabricate hit removal");
const great = parts(buildGameplaySceneModel(frame(CENTER_MS, targetFor("hit", "great")), undefined, defaultRendererTuning));
assert.equal(great.label?.feedback?.text, "Great");
assert.equal(great.label?.feedback?.faceColor, "#ffffff");
assert.deepEqual(great.label?.position, { x: -.5, y: 1, z: 0 });
assert.equal(great.icon?.state, "hit");
const miss = parts(buildGameplaySceneModel(frame(COMMIT_MS + 50, targetFor("miss", "miss")), undefined, defaultRendererTuning));
assert.equal(miss.label?.feedback?.text, "Miss");
assert.equal(miss.label?.feedback?.faceColor, "#e5484d");
assert.equal(miss.label?.feedback?.animation, "shake");
assert.deepEqual(miss.label?.position, { x: -1.5, y: 1.5, z: 1.5 });
assert.equal(miss.icon?.appearanceColor, "#2a3038");
assert.equal(miss.icon?.state, "miss");
const contradictory = parts(buildGameplaySceneModel(frame(COMMIT_MS, targetFor("miss", "great")), undefined, defaultRendererTuning));
assert.equal(contradictory.label?.feedback?.text, "Miss", "a raw miss cannot become Great from its tier");
assert.equal(contradictory.icon?.appearanceColor, "#2a3038");
for (const tier of ["good", "almost"]) {
  const hit = parts(buildGameplaySceneModel(frame(CENTER_MS, targetFor("hit", tier)), undefined, defaultRendererTuning));
  assert.equal(hit.label?.feedback?.text, "Good", `${tier} hit compatibility displays Good, never yellow Almost`);
  assert.equal(hit.label?.feedback?.faceColor, "#6ec6ff");
}
const defaultHit = targetFor("hit", "great");
delete defaultHit.tier;
assert.equal(parts(buildGameplaySceneModel(frame(CENTER_MS, defaultHit))).label?.feedback?.text, "Great");
const guard = { id: "tier-test", kind: "guard", hand: "both", family: "guard", cell: null,
  cells: [4, 7], lane: null, beatCenterMs: CENTER_MS, judgement: "miss", tier: "good", missCommitMs: COMMIT_MS };
assert.deepEqual(parts(buildGameplaySceneModel(frame(COMMIT_MS, guard))).label?.position, { x: 0, y: 1, z: 0 }, "dual guard near label uses shared crossing midpoint");
assert.throws(() => buildGameplaySceneModel(frame(CENTER_MS, targetFor("hit", "perfect"))), /tier is invalid/);
console.log("Feedback validation passed: finalized Almost yellow, Boxing miss/good blue, true Great white, far Miss red/gray, hit Good unchanged.");
