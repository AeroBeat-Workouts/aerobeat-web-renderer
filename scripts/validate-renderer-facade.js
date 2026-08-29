// @ts-check

import assert from "node:assert/strict";
import {
  aeroWebGl2RendererServiceId,
  applyNamedEasing,
  buildGameplayRenderPlan,
  cellRect,
  compactRendererVisualProfile,
  createAeroWebGl2Renderer,
  defaultRendererVisualProfile,
  fitPlayfieldGrid,
  gameplayIconIds,
  normalizeBrandingIconManifest,
  normalizeIconAtlasData,
  rasterizeBrandingIconAtlas
} from "../src/index.js";

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
assert.equal(second.gl.drawCalls, 0, "renderer instances must not leak draws");
assert.equal(other.describe().tuningId, "aero.visual.default");
assert.equal(other.describe().themeId, "aero.theme.default");

const theme = { schema: "aerobeat/theme_descriptor", version: 1, id: "theme.qa", themeVersion: "1", tokens: { leftHandColor: "#1122ff", rightHandColor: "#22ff44", guardColor: "#aa44ee", obstacleColor: "#ee3344", receptorColor: "#eeeeee", approachLeadMs: 1200, targetStartScale: 0.3, targetHitScale: 1, approachEasing: "linear", hitEasing: "ease-out", missEasing: "ease-out" }, contentHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: "0".repeat(64) } };
renderer.setTheme(theme);
assert.deepEqual(renderer.exportTuning(), defaultRendererVisualProfile);
const defaultVisualPlan = renderer.renderGameplayFrame({ presentation:"boxing_spatial_grid",nowMs:650,targets:[targetBase] }).plan;
renderer.setTuning(compactRendererVisualProfile);
assert.equal(renderer.describe().themeId, "theme.qa");
assert.equal(renderer.describe().themeVersion, "1");
assert.equal(renderer.describe().themeHash, "0".repeat(64));
assert.deepEqual(renderer.exportTuning(), compactRendererVisualProfile);
assert.deepEqual(renderer.getSnapshot().visualProfileIdentity, compactRendererVisualProfile.identity);
assert.deepEqual(renderer.describe().visualProfileSettings, { motionIntensity:0.8, roleScale:0.86 });
assert.equal(renderer.describe().tuningId, "aero.visual.compact");
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
first.dispatch("webglcontextrestored", {});
assert.equal(renderer.describe().state, "ready");
assert.equal(renderer.describe().iconAtlasReady, true, "context restoration must rebuild private atlas texture");
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
assert.equal(first.listenerCount(), 0);
assert.ok(first.gl.deletedPrograms > 0);
assert.equal(renderer.describe().iconAtlasReady, false);

console.log("Per-game renderer, plan, atlas, resize, context, and disposal validation passed.");

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
