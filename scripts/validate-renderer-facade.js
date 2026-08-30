// @ts-check

import assert from "node:assert/strict";
import {
  aeroWebGl2RendererServiceId,
  applyNamedEasing,
  buildGameplayRenderPlan,
  cellRect,
  compactRendererVisualProfile,
  createAeroWebGl2Renderer,
  defaultRendererTuning,
  defaultRendererVisualProfile,
  fitPlayfieldGrid,
  gameplayIconIds,
  normalizeBrandingIconManifest,
  normalizeIconAtlasData,
  rasterizeBrandingIconAtlas
} from "../src/index.js";
import { rendererTuningFromVisualProfile } from "../src/visual-profiles.js";

assert.deepEqual(cellRect(0, { x: 0, y: 0, width: 1, height: 1 }, 0), { x: 0, y: 0, width: 0.25, height: 1 / 3 });
assert.deepEqual(cellRect(11, { x: 0, y: 0, width: 1, height: 1 }, 0), { x: 0.75, y: 2 / 3, width: 0.25, height: 1 / 3 });
assert.equal(cellRect(12, { x: 0, y: 0, width: 1, height: 1 }, 0), null);
for (const [width, height] of [[390, 844], [844, 390], [240, 1200], [1600, 300]]) {
  const fitted = fitPlayfieldGrid(0.055, width / height);
  const physicalCellWidth = fitted.width * width / 4;
  const physicalCellHeight = fitted.height * height / 3;
  assert.ok(Math.abs(physicalCellWidth - physicalCellHeight) < 1e-9, `4x3 cells must remain physically square at ${width}x${height}`);
  assert.ok(fitted.x >= 0 && fitted.y >= 0 && fitted.x + fitted.width <= 1 && fitted.y + fitted.height <= 1);
}
const trackProbeTarget = { id:"track-probe",kind:/** @type {const} */("punch"),hand:/** @type {const} */("left"),family:/** @type {const} */("straight"),cell:null,cells:[],lane:/** @type {const} */("left"),beatCenterMs:0 };
for (const [width, height] of [[240,1200],[1600,300]]) {
  const command = buildGameplayRenderPlan({ presentation:"boxing_semantic_track",nowMs:0,targets:[trackProbeTarget],viewportAspect:width/height }).commands.find((entry) => entry.targetId === "track-probe" && entry.kind === "icon");
  assert.ok(command && Math.abs(command.rect.width * width - command.rect.height * height) < 1e-9, `Track icon must remain physically square at ${width}x${height}`);
}
assert.equal(applyNamedEasing(0.5, "linear"), 0.5);
assert.equal(applyNamedEasing(0.5, "ease-in"), 0.25);
assert.equal(applyNamedEasing(0.5, "ease-out"), 0.75);

const mappedDefaultTuning = rendererTuningFromVisualProfile(defaultRendererVisualProfile);
const mappedCompactTuning = rendererTuningFromVisualProfile(compactRendererVisualProfile);
assert.equal(mappedDefaultTuning.id, "aero.visual.default");
assert.equal(mappedDefaultTuning.hash, "visual-a3e8d245");
assert.equal(mappedDefaultTuning.roleScale, 1);
for (const key of ["gridInset", "gridGap", "receptorAlpha", "approachRingScale", "approachRingWidth", "laneWidth", "roleScale", "dprCap"]) assert.equal(mappedDefaultTuning[key], defaultRendererTuning[key], `default profile must preserve legacy renderer tuning ${key}`);
assert.equal(mappedCompactTuning.id, "aero.visual.compact");
assert.equal(mappedCompactTuning.hash, "visual-99e2444c");
assert.equal(mappedCompactTuning.roleScale, 0.86);
assert.ok(mappedCompactTuning.approachRingScale < mappedDefaultTuning.approachRingScale);
assert.ok(mappedCompactTuning.approachRingWidth < mappedDefaultTuning.approachRingWidth);

const targetBase = { id: "target", kind: /** @type {const} */ ("punch"), hand: /** @type {const} */ ("left"), family: /** @type {const} */ ("straight"), cell: 5, cells: [], lane: /** @type {const} */ ("left"), beatCenterMs: 1000 };
const spawn = buildGameplayRenderPlan({ presentation: "boxing_spatial_grid", nowMs: 100, targets: [targetBase] });
const beat = buildGameplayRenderPlan({ presentation: "boxing_spatial_grid", nowMs: 1000, targets: [targetBase] });
assert.equal(spawn.commands.filter((entry) => entry.layer === 0).length, 12);
assert.equal(spawn.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.scale, 0.48);
assert.equal(spawn.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.saturation, 0);
assert.equal(beat.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.scale, 1);
assert.equal(beat.commands.find((entry) => entry.targetId === "target" && entry.kind === "ring")?.scale, 1);
const easeTheme = { .../** @type {import("../src/gameplay-plan.js").AeroRendererThemeTokens} */ ({ leftHandColor:"#2693ff",rightHandColor:"#39c96b",guardColor:"#9a67ea",obstacleColor:"#e5484d",receptorColor:"#d9f5ff",approachLeadMs:1000,targetStartScale:0.1,targetHitScale:1,approachEasing:"ease-in",hitEasing:"ease-out",missEasing:"ease-in" }) };
const eased = buildGameplayRenderPlan({ presentation:"boxing_spatial_grid", nowMs:500, targets:[targetBase] }, easeTheme);
assert.equal(eased.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.scale, 0.325);
const pendingCommand = beat.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon");
const hitCommand = buildGameplayRenderPlan({ presentation:"boxing_spatial_grid",nowMs:1000,targets:[{ ...targetBase,judgement:"hit",feedbackProgress:0.5 }] }).commands.find((entry) => entry.targetId === "target" && entry.kind === "icon");
const missCommand = buildGameplayRenderPlan({ presentation:"boxing_spatial_grid",nowMs:1000,targets:[{ ...targetBase,judgement:"miss",feedbackProgress:0.5 }] }).commands.find((entry) => entry.targetId === "target" && entry.kind === "icon");
assert.ok(hitCommand && pendingCommand && hitCommand.scale < pendingCommand.scale && hitCommand.alpha < pendingCommand.alpha);
assert.ok(missCommand && pendingCommand && missCommand.scale > pendingCommand.scale && missCommand.alpha < pendingCommand.alpha);

const guardPlan = buildGameplayRenderPlan({ presentation: "boxing_spatial_grid", nowMs: 1000, targets: [{ ...targetBase, id: "guard", kind: "guard", hand: "both", family: "crossed_guard", cell: null, cells: [5, 6], lane: null }] });
const guard = guardPlan.commands.find((entry) => entry.iconId === "boxing.guard.crossed");
assert.ok(guard && guard.rect.width > guard.rect.height);
const trackPlan = buildGameplayRenderPlan({ presentation: "boxing_semantic_track", nowMs: 1000, blockedCells: [1], targets: [{ ...targetBase, lane: "right", hand: "right", family: "hook" }], overlay: "paused", countdown: 3 });
assert.equal(trackPlan.commands.filter((entry) => entry.layer === 0).length, 2);
assert.equal(trackPlan.overlay.dim, 0.62);
assert.equal(trackPlan.overlay.countdown, 3);
const obstaclePlan = buildGameplayRenderPlan({ presentation: "flow", nowMs: 1000, blockedCells: [0], safeCells: [11], targets: [{ ...targetBase, id: "flow-up", kind: "flow", family: "flow", hand: "neutral", direction: "up" }] });
assert.equal(obstaclePlan.commands.some((entry) => entry.targetId === "flow-up" && entry.kind === "line"), true);
assert.equal(obstaclePlan.commands.some((entry) => entry.role === "obstacle" && entry.hatch), true);
assert.equal(obstaclePlan.commands.some((entry) => entry.role === "safe" && entry.hatch), true);

const allDirections = /** @type {const} */ (["up", "up-right", "right", "down-right", "down", "down-left", "left", "up-left"]);
for (const direction of allDirections) {
  const id = `flow-${direction}`;
  const plan = buildGameplayRenderPlan({ presentation:"flow", nowMs:1000, targets:[{ ...targetBase, id, kind:"flow", family:"flow", hand:"neutral", direction, judgement:"hit", feedbackProgress:0 }] });
  const target = plan.commands.find((entry) => entry.targetId === id && entry.layer === 4);
  const cues = plan.commands.filter((entry) => entry.targetId === id && entry.layer === 5);
  assert.ok(target, `${direction} target must render`);
  assert.equal(target.contrast, false, `${direction} target keeps role color`);
  assert.equal(cues.length, direction.includes("-") ? 8 : 2, `${direction} cue command count`);
  for (const cue of cues) {
    assert.equal(cue.contrast, true, `${direction} cue must request theme-derived contrast`);
    assertRectWithin(cue.rect, target.rect, `${direction} cue`);
  }
  if (!direction.includes("-")) {
    assert.deepEqual(cues.map((entry) => ({ kind:entry.kind,rect:entry.rect })), legacyCardinalCues(target.rect, direction), `${direction} cardinal geometry must remain byte-identical`);
  } else {
    const lines = cues.filter((entry) => entry.kind === "line");
    const head = cues.find((entry) => entry.kind === "circle");
    assert.equal(lines.length, 7);
    assert.ok(head);
    const xCenters = lines.map((entry) => (entry.rect.x + entry.rect.width / 2 - target.rect.x) / target.rect.width);
    const yCenters = lines.map((entry) => (entry.rect.y + entry.rect.height / 2 - target.rect.y) / target.rect.height);
    const expectedX = direction.endsWith("right") ? [0.3, 11/30, 13/30, 0.5, 17/30, 19/30, 0.7] : [0.7, 19/30, 17/30, 0.5, 13/30, 11/30, 0.3];
    const expectedY = direction.startsWith("down") ? [0.3, 11/30, 13/30, 0.5, 17/30, 19/30, 0.7] : [0.7, 19/30, 17/30, 0.5, 13/30, 11/30, 0.3];
    assertCoordinates(xCenters, expectedX, `${direction} shaft X centers`);
    assertCoordinates(yCenters, expectedY, `${direction} shaft Y centers`);
    const headX = (head.rect.x + head.rect.width / 2 - target.rect.x) / target.rect.width;
    const headY = (head.rect.y + head.rect.height / 2 - target.rect.y) / target.rect.height;
    assert.ok(Math.abs(headX - (direction.endsWith("right") ? 0.8 : 0.2)) < 1e-12, `${direction} head X`);
    assert.ok(Math.abs(headY - (direction.startsWith("down") ? 0.8 : 0.2)) < 1e-12, `${direction} head Y`);
  }
}
assert.throws(() => buildGameplayRenderPlan({ presentation:"flow", nowMs:1000, targets:[/** @type {import("../src/gameplay-plan.js").AeroRenderableTarget} */ ({ ...targetBase, kind:"flow", family:"flow", hand:"neutral", direction:"north" })] }), /Flow direction cue is unsupported/u);

const manifest = normalizeBrandingIconManifest({ schemaId: "aerobeat.branding.web-gameplay-icons.v1", schemaVersion: 1, colorContract: "currentColor", webglContract: "alpha-mask-atlas-input", assets: gameplayIconIds.map((id) => ({ id, file: `${id.replaceAll(".", "-")}.svg`, viewBox: id.includes("guard") ? "0 0 48 24" : "0 0 64 64" })) });
assert.equal(manifest.assets.length, 13);
assert.throws(() => normalizeBrandingIconManifest({ ...manifest, assets: manifest.assets.slice(1) }));
const completeAtlasEntries = gameplayIconIds.map((id) => ({ id, u0: 0, v0: 0, u1: 1, v1: 1 }));
assert.equal(normalizeIconAtlasData({ width:1, height:1, pixels:new Uint8Array([255,255,255,255]), entries:completeAtlasEntries }).entries.length, 13);
assert.throws(() => normalizeIconAtlasData({ width:1, height:1, pixels:new Uint8Array([255,0,0,255]), entries:completeAtlasEntries }), /normalized white/u);
assert.throws(() => normalizeIconAtlasData({ width:1, height:1, pixels:new Uint8Array([255,255,255,255]), entries:[{ id:"bogus",u0:0,v0:0,u1:1,v1:1 }] }), /entry/u);
const abortController = new AbortController();
let resolveBitmap;
let markBitmapRequested;
let bitmapClosed = false;
const bitmapPromise = new Promise((resolve) => { resolveBitmap = resolve; });
const bitmapRequested = new Promise((resolve) => { markBitmapRequested = resolve; });
const lateRaster = rasterizeBrandingIconAtlas(manifest, {
  signal:abortController.signal,
  resolveUrl:() => "https://assets.invalid/icon.svg",
  fetch:async () => new Response(new Blob(["<svg/>"]), { status:200 }),
  createCanvas:() => /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ ({ getContext:() => ({ clearRect(){}, drawImage(){}, getImageData(){ return { data:new Uint8ClampedArray(4 * 64 * 64 * 4) }; } }) })),
  createBitmap:async () => { markBitmapRequested?.(); return bitmapPromise; }
});
await bitmapRequested;
abortController.abort();
resolveBitmap?.({ close(){ bitmapClosed = true; } });
await assert.rejects(lateRaster, (error) => error instanceof DOMException && error.name === "AbortError");
assert.equal(bitmapClosed, true, "late decoded bitmap must close after cancellation");

const first = createHarness();
const second = createHarness();
const renderer = createAeroWebGl2Renderer();
const other = createAeroWebGl2Renderer();
assert.notEqual(renderer, other);
assert.equal(renderer.attach(first.canvas).serviceId, aeroWebGl2RendererServiceId);
assert.equal(other.attach(second.canvas).state, "ready");
renderer.resize({ widthCssPx: 390, heightCssPx: 844, devicePixelRatio: 3 });
other.resize({ widthCssPx: 1200, heightCssPx: 500, devicePixelRatio: 1.25 });
assert.equal(first.canvas.width, 780);
assert.equal(first.canvas.height, 1688);
assert.equal(second.canvas.width, 1500);
assert.equal(second.canvas.height, 625);
assert.equal(renderer.describe().devicePixelRatio, 2);
assert.equal(other.describe().devicePixelRatio, 1.25);
renderer.resize({ widthCssPx:0, heightCssPx:0, devicePixelRatio:4 });
assert.equal(first.canvas.width, 1); assert.equal(first.canvas.height, 1);
for (const [width, height] of [[1,999],[1600,240],[390,844]]) renderer.resize({ widthCssPx:width, heightCssPx:height, devicePixelRatio:3 });
assert.equal(first.canvas.width, 780); assert.equal(first.canvas.height, 1688);

const atlasPixels = new Uint8Array(4 * 4 * 4).fill(255);
renderer.uploadIconAtlas({ width: 4, height: 4, pixels: atlasPixels, entries: completeAtlasEntries });
assert.equal(renderer.getCapabilities().alphaMaskIcons, true);
assert.equal(first.gl.unpackFlipY, 0, "top-left atlas UV rows must not be vertically inverted");
renderer.uploadIconAtlas({ width: 1, height: 1, pixels: new Uint8Array([255, 0, 0, 255]), entries: completeAtlasEntries });
assert.equal(renderer.describe().iconAtlasReady, false);
assert.match(renderer.describe().iconAtlasError ?? "", /normalized white/u);
assert.ok(renderer.getCapabilities().degradations.includes("icon_atlas_invalid_fallback_shapes"));
renderer.uploadIconAtlas({ width: 4, height: 4, pixels: atlasPixels, entries: completeAtlasEntries });
const rendered = renderer.renderGameplayFrame({ presentation: "boxing_spatial_grid", nowMs: 1000, targets: [targetBase], blockedCells: [0], safeCells: [11] });
assert.equal(rendered.status.state, "running");
assert.ok(first.gl.drawCalls > 12);
const drawsBeforeCursors = first.gl.drawCalls;
const cursorResult = renderer.renderGameplayCursors([
  { role:"right_wrist",x:0.8,y:0.7,confidence:0.9 },
  { role:"nose",x:0.5,y:0.2,confidence:0.95 },
  { role:"left_wrist",x:0.2,y:0.7,confidence:0.49 },
  { role:"left_wrist",x:0.25,y:0.72,confidence:0.91 }
], { grid:rendered.plan.grid,sizeCssPx:8 });
assert.equal(cursorResult.cursorCount, 3);
assert.deepEqual(cursorResult.roles, ["nose","left_wrist","right_wrist"], "semantic cursors must use canonical topmost draw order");
assert.equal(first.gl.drawCalls - drawsBeforeCursors, 9, "each cursor must use black, white, and role-color layers");
const lowConfidenceDraws = first.gl.drawCalls;
const lowConfidenceResult = renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.2,confidence:0.49 }], { grid:rendered.plan.grid });
assert.equal(lowConfidenceResult.cursorCount, 0);
assert.equal(first.gl.drawCalls, lowConfidenceDraws, "low-confidence cursors must not draw");
let cursorAccessorInvoked = false;
const accessorCursor = {};
Object.defineProperty(accessorCursor, "role", { enumerable:true,get(){ cursorAccessorInvoked = true; return "nose"; } });
for (const [key,value] of [["x",0.5],["y",0.5],["confidence",1]]) Object.defineProperty(accessorCursor,key,{ enumerable:true,value });
const boundedDraws = first.gl.drawCalls;
const boundedResult = renderer.renderGameplayCursors([
  accessorCursor,
  { role:"unknown",x:0.5,y:0.5,confidence:1 },
  { role:"nose",x:0.4,y:0.4,confidence:1,extra:true },
  { role:"nose",x:0.45,y:0.45,confidence:1 },
  { role:"nose",x:0.55,y:0.55,confidence:1 }
], { grid:rendered.plan.grid,sizeCssPx:Number.MAX_VALUE });
assert.equal(cursorAccessorInvoked, false, "cursor validation must not invoke accessors");
assert.deepEqual(boundedResult.roles, ["nose"], "invalid, unknown, and repeated semantic candidates must be omitted");
assert.equal(first.gl.drawCalls-boundedDraws, 3, "only the first valid canonical role may draw");
assert.throws(() => renderer.renderGameplayCursors(Array.from({ length:13 }, () => ({ role:"nose",x:0.5,y:0.5,confidence:1 })), { grid:rendered.plan.grid }), /cannot exceed 12/u);
let optionsAccessorInvoked = false;
const accessorOptions = {};
Object.defineProperty(accessorOptions,"grid",{ enumerable:true,get(){ optionsAccessorInvoked = true; return rendered.plan.grid; } });
assert.throws(() => renderer.renderGameplayCursors([], /** @type {never} */ (accessorOptions)), /grid/u);
assert.equal(optionsAccessorInvoked, false, "cursor option validation must not invoke accessors");
let gridAccessorInvoked = false;
const accessorGrid = { y:0.1,width:0.8,height:0.8 };
Object.defineProperty(accessorGrid,"x",{ enumerable:true,get(){ gridAccessorInvoked = true; return 0.1; } });
assert.throws(() => renderer.renderGameplayCursors([], /** @type {never} */ ({ grid:accessorGrid })), /grid/u);
assert.equal(gridAccessorInvoked, false, "cursor grid validation must not invoke accessors");
assert.throws(() => renderer.renderGameplayCursors([], /** @type {never} */ ({})), /grid/u);
assert.equal(second.gl.drawCalls, 0, "renderer instances must not leak draws");
assert.equal(other.describe().tuningId, "aero.visual.default");
assert.equal(other.describe().themeId, "aero.theme.default");

const theme = { schema: "aerobeat/theme_descriptor", version: 1, id: "theme.qa", themeVersion: "1", tokens: { leftHandColor: "#1122ff", rightHandColor: "#22ff44", guardColor: "#aa44ee", obstacleColor: "#ee3344", receptorColor: "#eeeeee", approachLeadMs: 1200, targetStartScale: 0.3, targetHitScale: 1, approachEasing: "linear", hitEasing: "ease-out", missEasing: "ease-out" }, contentHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: "0".repeat(64) } };
renderer.setTheme(theme);
assert.deepEqual(renderer.exportTuning(), defaultRendererVisualProfile);
assert.deepEqual(renderer.describe().visualProfile, defaultRendererVisualProfile);
assert.equal(renderer.describe().tuningHash, "visual-a3e8d245");
const defaultVisualPlan = renderer.renderGameplayFrame({ presentation:"boxing_spatial_grid",nowMs:650,targets:[targetBase] }).plan;
renderer.setTuning(compactRendererVisualProfile);
assert.equal(renderer.describe().themeId, "theme.qa");
assert.equal(renderer.describe().themeVersion, "1");
assert.equal(renderer.describe().themeHash, "0".repeat(64));
assert.deepEqual(renderer.exportTuning(), compactRendererVisualProfile);
assert.deepEqual(renderer.getSnapshot().visualProfileIdentity, compactRendererVisualProfile.identity);
assert.deepEqual(renderer.describe().visualProfileSettings, { motionIntensity:0.8, roleScale:0.86 });
assert.equal(renderer.describe().tuningId, "aero.visual.compact");
assert.equal(renderer.describe().tuningHash, "visual-99e2444c");
assert.equal(renderer.describe().tuningVersion, "1.0.0");
assert.equal(renderer.describe().tuningRequiresRegeneration, false);
assert.equal(renderer.describe().experimental, true);
const compactVisualPlan = renderer.renderGameplayFrame({ presentation:"boxing_spatial_grid",nowMs:650,targets:[targetBase] }).plan;
const defaultIcon = defaultVisualPlan.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon");
const compactIcon = compactVisualPlan.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon");
const defaultRing = defaultVisualPlan.commands.find((entry) => entry.targetId === "target" && entry.kind === "ring");
const compactRing = compactVisualPlan.commands.find((entry) => entry.targetId === "target" && entry.kind === "ring");
assert.ok(defaultIcon && compactIcon && compactIcon.rect.width < defaultIcon.rect.width && compactIcon.rect.height < defaultIcon.rect.height, "compact roleScale must apply live without recreating the renderer");
assert.ok(defaultRing && compactRing && compactRing.scale < defaultRing.scale, "compact motionIntensity must reduce ring travel");
assert.deepEqual(other.exportTuning(), defaultRendererVisualProfile, "visual selections must remain instance-local");
const exportedTuning = renderer.exportTuning();
renderer.resetTuning();
assert.deepEqual(renderer.exportTuning(), defaultRendererVisualProfile);
renderer.importTuning(exportedTuning);
assert.deepEqual(renderer.exportTuning(), exportedTuning);
const acceptedBeforeInvalid = renderer.exportTuning();
let getterInvoked = false;
const accessorSelection = {};
Object.defineProperty(accessorSelection, "identity", { enumerable:true, get(){ getterInvoked = true; return compactRendererVisualProfile.identity; } });
Object.defineProperty(accessorSelection, "settings", { enumerable:true, value:compactRendererVisualProfile.settings });
const malformedSelections = [
  accessorSelection,
  { identity:{ ...compactRendererVisualProfile.identity, class:"between_run_ruleset" },settings:compactRendererVisualProfile.settings },
  { identity:{ ...compactRendererVisualProfile.identity, class:"converter_regeneration",regenerationRequired:true },settings:compactRendererVisualProfile.settings },
  { identity:{ ...compactRendererVisualProfile.identity, contentHash:"0".repeat(64) },settings:compactRendererVisualProfile.settings },
  { identity:{ ...compactRendererVisualProfile.identity, profileId:"x".repeat(129) },settings:compactRendererVisualProfile.settings },
  { identity:compactRendererVisualProfile.identity,settings:{ motionIntensity:0.8 } },
  { identity:compactRendererVisualProfile.identity,settings:{ ...compactRendererVisualProfile.settings, extra:true } },
  { identity:compactRendererVisualProfile.identity,settings:{ motionIntensity:3,roleScale:0.86 } },
  { identity:compactRendererVisualProfile.identity,settings:new Uint8Array([1,2]) },
  { identity:compactRendererVisualProfile.identity,settings:{ motionIntensity:{ nested:{ too:{ deep:true } } },roleScale:0.86 } },
  Object.assign(Object.create({}), compactRendererVisualProfile),
  { identity:compactRendererVisualProfile.identity,settings:compactRendererVisualProfile.settings,extra:true }
];
for (const malformed of malformedSelections) {
  assert.throws(() => renderer.importTuning(malformed), TypeError);
  assert.deepEqual(renderer.exportTuning(), acceptedBeforeInvalid, "rejected tuning imports must be atomic");
}
assert.equal(getterInvoked, false, "visual tuning validation must not invoke accessors");
const invalidTheme = { ...theme, id:"theme.invalid", tokens:{ ...theme.tokens, leftHandColor:"not-a-renderer-color", approachEasing:"spring" } };
renderer.setTheme(invalidTheme);
assert.equal(renderer.describe().themeId, "aero.theme.default", "unsupported external theme tokens must not retain external identity");
renderer.setTheme(theme);
assert.equal(renderer.resize({ widthCssPx: 100, heightCssPx: 100, devicePixelRatio: 4 }).devicePixelRatio, 2);

first.dispatch("webglcontextlost", { preventDefault() {} });
assert.equal(renderer.describe().state, "context_lost");
assert.equal(renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } }).cursorCount, 0, "context loss must reject cursor draws without retaining them");
first.dispatch("webglcontextrestored", {});
assert.equal(renderer.describe().state, "ready");
assert.equal(renderer.describe().iconAtlasReady, true, "context restoration must rebuild private atlas texture");
assert.equal(renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } }).cursorCount, 1, "context restoration must rebuild cursor GPU resources on demand");
renderer.renderGameplayFrame({ presentation: "flow", nowMs: 1000, targets: [] });
renderer.detach();
assert.equal(first.listenerCount(), 0);
renderer.attach(first.canvas);
renderer.destroy();
renderer.destroy();
const terminalTuning = renderer.describe().tuningId;
renderer.setTuning({ id:"forbidden-after-destroy",version:"1",gridInset:0.1,gridGap:0.01,receptorAlpha:0.2,approachRingScale:1.5,approachRingWidth:0.1,laneWidth:0.2,dprCap:2 });
renderer.setTheme(theme);
assert.equal(renderer.describe().tuningId, terminalTuning);
assert.equal(renderer.describe().state, "destroyed");
assert.equal(renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } }).cursorCount, 0, "destroyed renderers must remain terminal for cursor draws");
assert.equal(first.listenerCount(), 0);
assert.ok(first.gl.deletedPrograms > 0);
assert.equal(renderer.describe().iconAtlasReady, false);

console.log("Per-game renderer, plan, atlas, resize, context, and disposal validation passed.");

/** @param {{x:number,y:number,width:number,height:number}} rect @param {"up"|"right"|"down"|"left"} direction */
function legacyCardinalCues(rect, direction) {
  const thickness = Math.min(rect.width, rect.height) * 0.09;
  const horizontal = direction === "left" || direction === "right";
  const shaft = horizontal
    ? { x: rect.x + rect.width * 0.25, y: rect.y + rect.height * 0.5 - thickness / 2, width: rect.width * 0.5, height: thickness }
    : { x: rect.x + rect.width * 0.5 - thickness / 2, y: rect.y + rect.height * 0.25, width: thickness, height: rect.height * 0.5 };
  const size = thickness * 2.5;
  const headX = direction === "left" ? rect.x + rect.width * 0.2 : direction === "right" ? rect.x + rect.width * 0.8 : rect.x + rect.width * 0.5;
  const headY = direction === "up" ? rect.y + rect.height * 0.2 : direction === "down" ? rect.y + rect.height * 0.8 : rect.y + rect.height * 0.5;
  return [{ kind:"line",rect:shaft },{ kind:"circle",rect:{ x:headX-size/2,y:headY-size/2,width:size,height:size } }];
}

/** @param {{x:number,y:number,width:number,height:number}} inner @param {{x:number,y:number,width:number,height:number}} outer @param {string} label */
function assertRectWithin(inner, outer, label) {
  const tolerance = Number.EPSILON * 64;
  assert.ok(inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance && inner.x + inner.width <= outer.x + outer.width + tolerance && inner.y + inner.height <= outer.y + outer.height + tolerance, `${label} must remain inside target`);
}

/** @param {number[]} actual @param {number[]} expected @param {string} label */
function assertCoordinates(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < actual.length; index += 1) assert.ok(Math.abs(actual[index] - expected[index]) < 1e-12, `${label}[${index}] expected ${expected[index]} got ${actual[index]}`);
}

function createHarness() {
  const listeners = new Map();
  const gl = createFakeGl();
  const canvas = {
    width: 320, height: 180, style: { width: "", height: "" },
    getContext(type) { assert.equal(type, "webgl2"); return gl; },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); }
  };
  return {
    canvas: /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (canvas)), gl,
    dispatch(type, event) { listeners.get(type)?.(event); }, listenerCount() { return listeners.size; }
  };
}

function createFakeGl() {
  let objectId = 0;
  return {
    COLOR_BUFFER_BIT: 0x4000, ARRAY_BUFFER: 0x8892, STREAM_DRAW: 0x88e0, FLOAT: 0x1406, LINES: 1, POINTS: 0, TRIANGLES: 4, BLEND: 0x0be2, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
    VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30, COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1, TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601, CLAMP_TO_EDGE: 0x812f, RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_FLIP_Y_WEBGL: 0x9240, TEXTURE0: 0x84c0,
    drawingBufferWidth: 320, drawingBufferHeight: 180, drawCalls: 0, deletedPrograms: 0, unpackFlipY: -1,
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {}, createShader(type) { return { id: ++objectId, type }; }, shaderSource() {}, compileShader() {}, getShaderParameter() { return true; }, getShaderInfoLog() { return ""; }, deleteShader() {},
    createProgram() { return { id: ++objectId }; }, attachShader() {}, linkProgram() {}, getProgramParameter() { return true; }, getProgramInfoLog() { return ""; }, deleteProgram() { this.deletedPrograms += 1; },
    createBuffer() { return { id: ++objectId }; }, deleteBuffer() {}, getAttribLocation(_program, name) { return name === "a_position" ? 0 : 1; }, getUniformLocation(_program, name) { return { name }; },
    useProgram() {}, bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniform4f() {}, uniform1f() {}, uniform1i() {}, drawArrays() { this.drawCalls += 1; },
    createTexture() { return { id: ++objectId }; }, deleteTexture() {}, bindTexture() {}, pixelStorei(name, value) { if (name === this.UNPACK_FLIP_Y_WEBGL) this.unpackFlipY = value; }, texParameteri() {}, texImage2D() {}, activeTexture() {}
  };
}
