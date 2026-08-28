// @ts-check

import assert from "node:assert/strict";
import {
  aeroWebGl2RendererServiceId,
  buildGameplayRenderPlan,
  cellRect,
  createAeroWebGl2Renderer,
  gameplayIconIds,
  normalizeBrandingIconManifest
} from "../src/index.js";

assert.deepEqual(cellRect(0, { x: 0, y: 0, width: 1, height: 1 }, 0), { x: 0, y: 0, width: 0.25, height: 1 / 3 });
assert.deepEqual(cellRect(11, { x: 0, y: 0, width: 1, height: 1 }, 0), { x: 0.75, y: 2 / 3, width: 0.25, height: 1 / 3 });
assert.equal(cellRect(12, { x: 0, y: 0, width: 1, height: 1 }, 0), null);

const targetBase = { id: "target", kind: /** @type {const} */ ("punch"), hand: /** @type {const} */ ("left"), family: /** @type {const} */ ("straight"), cell: 5, cells: [], lane: /** @type {const} */ ("left"), beatCenterMs: 1000 };
const spawn = buildGameplayRenderPlan({ presentation: "boxing_spatial_grid", nowMs: 100, targets: [targetBase] });
const beat = buildGameplayRenderPlan({ presentation: "boxing_spatial_grid", nowMs: 1000, targets: [targetBase] });
assert.equal(spawn.commands.filter((entry) => entry.layer === 0).length, 12);
assert.equal(spawn.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.scale, 0.48);
assert.equal(spawn.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.saturation, 0);
assert.equal(beat.commands.find((entry) => entry.targetId === "target" && entry.kind === "icon")?.scale, 1);
assert.equal(beat.commands.find((entry) => entry.targetId === "target" && entry.kind === "ring")?.scale, 1);

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

const atlasPixels = new Uint8Array(4 * 4 * 4).fill(255);
renderer.uploadIconAtlas({ width: 4, height: 4, pixels: atlasPixels, entries: [{ id: "boxing.straight.left", u0: 0, v0: 0, u1: 1, v1: 1 }] });
assert.equal(renderer.getCapabilities().alphaMaskIcons, true);
const rendered = renderer.renderGameplayFrame({ presentation: "boxing_spatial_grid", nowMs: 1000, targets: [targetBase], blockedCells: [0], safeCells: [11] });
assert.equal(rendered.status.state, "running");
assert.ok(first.gl.drawCalls > 12);
assert.equal(second.gl.drawCalls, 0, "renderer instances must not leak draws");

const theme = { schema: "aerobeat/theme_descriptor", version: 1, id: "theme.qa", themeVersion: "1", tokens: { leftHandColor: "#1122ff", rightHandColor: "#22ff44", guardColor: "#aa44ee", obstacleColor: "#ee3344", receptorColor: "#eeeeee", approachLeadMs: 1200, targetStartScale: 0.3, targetHitScale: 1, approachEasing: "linear", hitEasing: "ease-out", missEasing: "ease-out" }, contentHash: { schema: "aerobeat/content_hash", version: 1, algorithm: "sha256", value: "0".repeat(64) } };
renderer.setTheme(theme);
renderer.setTuning({ id: "visual.compact", version: "2", gridInset: 0.1, gridGap: 0.01, receptorAlpha: 0.3, approachRingScale: 1.7, approachRingWidth: 0.05, laneWidth: 0.18, dprCap: 1.5 });
assert.equal(renderer.describe().themeId, "theme.qa");
assert.equal(renderer.exportTuning().id, "visual.compact");
assert.match(renderer.exportTuning().hash, /^visual-[0-9a-f]{8}$/u);
assert.equal(renderer.resize({ widthCssPx: 100, heightCssPx: 100, devicePixelRatio: 4 }).devicePixelRatio, 1.5);

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
    drawingBufferWidth: 320, drawingBufferHeight: 180, drawCalls: 0, deletedPrograms: 0,
    viewport() {}, clearColor() {}, clear() {}, enable() {}, blendFunc() {}, createShader(type) { return { id: ++objectId, type }; }, shaderSource() {}, compileShader() {}, getShaderParameter() { return true; }, getShaderInfoLog() { return ""; }, deleteShader() {},
    createProgram() { return { id: ++objectId }; }, attachShader() {}, linkProgram() {}, getProgramParameter() { return true; }, getProgramInfoLog() { return ""; }, deleteProgram() { this.deletedPrograms += 1; },
    createBuffer() { return { id: ++objectId }; }, deleteBuffer() {}, getAttribLocation(_program, name) { return name === "a_position" ? 0 : 1; }, getUniformLocation(_program, name) { return { name }; },
    useProgram() {}, bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, uniform4f() {}, uniform1f() {}, uniform1i() {}, drawArrays() { this.drawCalls += 1; },
    createTexture() { return { id: ++objectId }; }, deleteTexture() {}, bindTexture() {}, pixelStorei() {}, texParameteri() {}, texImage2D() {}, activeTexture() {}
  };
}
