// @ts-check
// Normal-gate, real-GLB first-cut oracle. Observe the actual WebGL linkProgram call on
// the renderer's canvas, not material clones or installed PlayCanvas's _shaderStats.linked.
// The local semver-resolved engine is 2.23.2 (package constraint ^2.21.4); the
// WebGL API calls are the oracle, not an assumed internal stats counter/version.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const root = process.cwd();
const brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay");
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const branding = pathname.startsWith("/branding/");
    const allowed = branding ? brandingRoot : root;
    const file = resolve(allowed, branding ? pathname.slice(10) : pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1));
    if (file !== allowed && !file.startsWith(`${allowed}/`)) return void response.writeHead(403).end();
    const content = await readFile(file);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".jpg": "image/jpeg" };
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const address = server.address();
if (!address || typeof address === "string") throw new Error("First-cut browser server failed");
const pageUrl = `http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const noise = [];
  page.on("console", (message) => {
    const type = message.type(), location = message.location();
    if (["warning", "error"].includes(type) && !isExpectedReadPixelsWarning(type, message.text(), location.url, location.lineNumber, location.columnNumber, pageUrl))
      noise.push(`${type}: ${message.text()} [${location.url}]`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(pageUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true);
  const evidence = await page.evaluate(async () => {
    const Renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0].constructor;
    const assets = ["directional-arrow/rounded-outline-v1", "any-note/outlined-circle-v1"];
    // Match the proven W1-C 844×390, DPR 1 canvas/scene framing; unlike its
    // previously used primary renderer this canvas has never seen a scored cut.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "display:block;width:844px;height:390px";
    document.body.append(canvas);
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, depth: true, stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    if (!gl) throw new Error("Real WebGL2 context required");
    const original = { shaderSource: gl.shaderSource, attachShader: gl.attachShader, linkProgram: gl.linkProgram,
      bindFramebuffer: gl.bindFramebuffer, clear: gl.clear, drawElements: gl.drawElements, drawArrays: gl.drawArrays,
      drawElementsInstanced: gl.drawElementsInstanced, drawArraysInstanced: gl.drawArraysInstanced, blitFramebuffer: gl.blitFramebuffer };
    const source = new WeakMap(), attached = new WeakMap(), links = [];
    const warmupGl = { active: false, backFramebuffer: null, events: [], draws: 0, clears: 0, backbufferWrites: 0 };
    let assetReadyWarmup = null, firstFlowWarmupCalls = 0;
    const tickGl = { active: false, backFramebuffer: null, resolveFramebuffer: null, events: [], draws: 0, clears: 0, backbufferWrites: 0, blits: 0, resolvedBlits: 0 };
    const shaderSummary = (text) => ({
      lines: text.split("\n").length,
      defines: text.split("\n").filter((line) => /^\s*#define\s+(?:LIGHT|SHADOW|FORWARD|GAMMA|TONEMAP|STD_|COLOR_ATTACHMENT|FOG)/.test(line)).map((line) => line.trim()).sort(),
      signature: text.includes("vAeroSliceLocalX < 0.0") ? "negative" : text.includes("vAeroSliceLocalX >= 0.0") ? "positive" : "none"
    });
    const compareProgram = (prior, current) => {
      const changed = (first, second) => {
        const a = first.split("\n"), b = second.split("\n");
        const added = b.filter((line) => !a.includes(line)).map((line) => line.trim()).filter(Boolean);
        const removed = a.filter((line) => !b.includes(line)).map((line) => line.trim()).filter(Boolean);
        return { added: added.slice(0, 12), removed: removed.slice(0, 12), addedCount: added.length, removedCount: removed.length };
      };
      return { sign: current.sign, vs: { pre: shaderSummary(prior.vertex), cut: shaderSummary(current.vertex), changes: changed(prior.vertex, current.vertex) }, fs: { pre: shaderSummary(prior.fragment), cut: shaderSummary(current.fragment), changes: changed(prior.fragment, current.fragment) } };
    };
    let generation = 0;
    const signed = (fragment) => fragment.includes("vAeroSliceLocalX < 0.0") ? -1 : fragment.includes("vAeroSliceLocalX >= 0.0") ? 1 : null;
    // Capture *before* Application creation. A program is recorded only when WebGL really links it.
    gl.shaderSource = function (shader, text) { source.set(shader, text); return original.shaderSource.call(this, shader, text); };
    gl.attachShader = function (program, shader) { const shaders = attached.get(program) ?? []; shaders.push(shader); attached.set(program, shaders); return original.attachShader.call(this, program, shader); };
    gl.linkProgram = function (program) {
      const result = original.linkProgram.call(this, program);
      const shaders = attached.get(program) ?? [];
      const fragment = shaders.filter((shader) => this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER).map((shader) => source.get(shader) ?? "").join("\n");
      const vertex = shaders.filter((shader) => this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER).map((shader) => source.get(shader) ?? "").join("\n");
      const sign = signed(fragment);
      if (sign !== null) links.push({ program, generation, sign, vertex, fragment, success: Boolean(this.getProgramParameter(program, this.LINK_STATUS)) });
      return result;
    };
    gl.bindFramebuffer = function (target, framebuffer) {
      if (warmupGl.active) {
        warmupGl.events.push({ kind: "bind", target, privateTarget: framebuffer !== warmupGl.backFramebuffer });
      }
      return original.bindFramebuffer.call(this, target, framebuffer);
    };
    const recordWrite = (kind) => {
      for (const scope of [warmupGl, tickGl]) {
        if (!scope.active) continue;
        // PlayCanvas 2.23.2 can use a NON-null MSAA backbuffer FBO.
        const privateTarget = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== scope.backFramebuffer;
        if (kind === "clear") scope.clears++; else scope.draws++;
        if (!privateTarget) scope.backbufferWrites++;
        scope.events.push({ kind, privateTarget });
      }
    };
    gl.blitFramebuffer = function (...args) {
      if (tickGl.active) {
        tickGl.blits++;
        const destination = this.getParameter(this.DRAW_FRAMEBUFFER_BINDING);
        if (destination === tickGl.resolveFramebuffer && (args[8] & this.COLOR_BUFFER_BIT)) tickGl.resolvedBlits++;
      }
      return original.blitFramebuffer.apply(this, args);
    };
    gl.clear = function (...args) { recordWrite("clear"); return original.clear.apply(this, args); };
    for (const name of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced"]) {
      gl[name] = function (...args) { recordWrite(name); return original[name].apply(this, args); };
    }
    if (gl.linkProgram === original.linkProgram || gl.clear === original.clear || gl.drawElements === original.drawElements) throw new Error("WebGL instrumentation unavailable");
    const renderer = new Renderer();
    const liveTarget = { id: "live-flow", kind: "flow", hand: "left", family: "flow", cell: 5, cells: [], lane: null, beatCenterMs: 1900, direction: "up", appearanceColor: "#D42F81" };
    const idle = { presentation: "flow", nowMs: 1300, targets: [liveTarget], aftermath: [] };
    // Read the browser-resolved canvas (not PlayCanvas's possibly non-null MSAA
    // backBuffer FBO) with preserveDrawingBuffer in the same caller task.
    // Restore exactly the prior read binding/buffer; compare production's state
    // to its own backBuffer identity, never to a universal null assumption.
    const sample = () => {
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      const previousFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      const previousReadBuffer = gl.getParameter(gl.READ_BUFFER);
      let bindError, selectError, readError, restoreError;
      try {
        gl.getError(); // Separate any pre-existing engine error from capture.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        bindError = gl.getError();
        gl.readBuffer(gl.BACK);
        selectError = gl.getError();
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        readError = gl.getError();
      } finally {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousFramebuffer);
        gl.readBuffer(previousReadBuffer);
        restoreError = gl.getError();
      }
      if (bindError || selectError || readError || restoreError) throw new Error(`Invalid capture: resolved canvas readback errors ${JSON.stringify({ bindError, selectError, readError, restoreError })}`);
      return pixels;
    };
    const nonzero = (pixels) => { let count = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) count++; return count; };
    const difference = (a, b) => { let count = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) count++; return count; };
    // W1-C's per-half attribution: compare the SAME corpse frame with each
    // dedicated pooled half disabled/enabled and require an authored GLB mesh.
    // This cannot be satisfied by a generic frame delta, a metadata-only half,
    // or the other half being painted twice.
    const attributedHalves = (shape, objects) => {
      const asset = shape === "arrow" ? assets[0] : assets[1];
      const pool = renderer.aftermathAssetPools.get(asset) ?? [];
      const results = [];
      for (const object of objects) {
        const sign = object.aftermath.sliceSign;
        const slot = pool.find((entity) => String(entity.name).includes(sign === 1 ? "half+" : "half-"));
        if (!slot) { results.push({ sign, meshes: 0, ownPixels: 0 }); continue; }
        const meshes = slot.findComponents("render").reduce((sum, component) => sum + component.meshInstances.length, 0);
        slot.enabled = false; renderer.manualTick(); const without = sample();
        slot.enabled = true; renderer.manualTick(); const withIt = sample();
        results.push({ sign, meshes, ownPixels: difference(withIt, without) });
      }
      return results;
    };
    const snapshot = () => {
      const pool = Object.fromEntries(assets.map((asset) => [asset, (renderer.aftermathAssetPools.get(asset) ?? []).map((entity) => ({
        name: entity.name, enabled: entity.enabled, records: (renderer.assetMaterials.get(entity) ?? []).map((record) => ({
          name: record.name, signed: record.meshInstance.material.shaderChunks.glsl.get("litUserMainStartPS") ?? "",
          program: record.meshInstance.material.variants ? [...record.meshInstance.material.variants.values()].map((shader) => shader.impl?.glProgram) : []
        }))
      }))]));
      const linked = links.filter((link) => link.generation === generation && link.success);
      const signedShaders = assets.flatMap((asset) => (renderer.aftermathAssetPools.get(asset) ?? []).flatMap((entity) =>
        (renderer.assetMaterials.get(entity) ?? []).flatMap((record) => [...record.meshInstance.material.variants.values()])))
        .filter((shader) => shader?.impl?.glProgram);
      return { generation, assetGeneration: renderer.gameplayAssetLoader.describe().generation, frameCount: renderer.frameCount, context: renderer.app?.graphicsDevice?.gl === gl,
        linked: linked.map((link) => link.sign), pool, programs: linked.map((link) => link.program), totalSignedLinks: links.length,
        shaderReadyCount: signedShaders.filter((shader) => shader.ready && !shader.failed && gl.isProgram(shader.impl.glProgram) && gl.getProgramParameter(shader.impl.glProgram, gl.LINK_STATUS)).length,
        shaderProgramCount: signedShaders.length };
    };
    const entry = (shape, direction = "up") => ({ targetId: `first-${shape}-${direction}`, hitCommitMs: 1300, family: "flow", hand: "left", mode: "slice", spawn: { x: 0, y: 1, z: 0 }, seed: 42, shape, direction, sliceT: .5, appearanceColor: "#3B82C4" });
    const runGeneration = async (label) => {
      await renderer.gameplayAssetLoadPromise;
      if (renderer.gameplayAssetLoader.describe().state !== "ready") throw new Error(`${label}: real GLBs not ready`);
      renderer.setEnvironmentVisible(false);
      renderer.setBackgroundProjection({ kind: "solid", colors: ["#102030"], angleDeg: 180 });
      const start = renderer.frameCount;
      // The asset-ready callback did the real warmup before gameplay. Observe
      // any redundant first-Flow warmup separately from the normal caller tick.
      const firstNoContact = label === "initial";
      let preTickCanvasPaint = null, warmupWrites = null, tickWrites = null;
      const framegraph = () => ({ renderActions: renderer.app.scene.layers._renderActions?.length ?? renderer.app.scene.layers.renderActions?.length ?? null,
        layers: renderer.app.scene.layers.layerList.length, cameraLayers: [...renderer.cameraEntity.camera.layers],
        cameraTargetIsNull: renderer.cameraEntity.camera.renderTarget === null,
        cameraTargetIsBackBuffer: renderer.cameraEntity.camera.renderTarget === renderer.app.graphicsDevice.backBuffer });
      let framegraphBefore = null, framegraphAfterWarmup = null, framegraphAfterTick = null;
      if (firstNoContact) {
        const oldTick = renderer.manualTick, oldWarmup = renderer.warmFlowSlicePrograms;
        renderer.warmFlowSlicePrograms = function (...args) {
          firstFlowWarmupCalls++;
          framegraphBefore = framegraph();
          const beforeDraws = warmupGl.draws, beforeClears = warmupGl.clears, beforeBackbufferWrites = warmupGl.backbufferWrites;
          const beforeEvents = warmupGl.events.length;
          warmupGl.backFramebuffer = this.app.graphicsDevice.backBuffer.impl._glFrameBuffer;
          warmupGl.active = true;
          try { return oldWarmup.apply(this, args); }
          finally {
            warmupGl.active = false;
            framegraphAfterWarmup = framegraph();
            warmupWrites = { draws: warmupGl.draws - beforeDraws, clears: warmupGl.clears - beforeClears,
              backbufferWrites: warmupGl.backbufferWrites - beforeBackbufferWrites,
              privateWrites: warmupGl.events.slice(beforeEvents).filter((event) => event.kind !== "bind" && event.privateTarget).length };
          }
        };
        renderer.manualTick = function () {
          const copy = new OffscreenCanvas(canvas.width, canvas.height), ctx = copy.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(canvas, 0, 0);
          preTickCanvasPaint = nonzero(ctx.getImageData(0, 0, copy.width, copy.height).data);
          tickGl.backFramebuffer = this.app.graphicsDevice.backBuffer.impl._glFrameBuffer;
          tickGl.resolveFramebuffer = this.app.graphicsDevice.backBuffer.impl._glResolveFrameBuffer;
          tickGl.active = true;
          try { return oldTick.call(this); }
          finally {
            tickGl.active = false;
            framegraphAfterTick = framegraph();
            tickWrites = { draws: tickGl.draws, clears: tickGl.clears, backbufferWrites: tickGl.backbufferWrites,
              privateWrites: tickGl.events.filter((event) => event.privateTarget).length, blits: tickGl.blits,
              resolvedBlits: tickGl.resolvedBlits, resolveIsNull: tickGl.resolveFramebuffer === null };
          }
        };
        try { renderer.renderGameplayFrame(idle); }
        finally { renderer.manualTick = oldTick; renderer.warmFlowSlicePrograms = oldWarmup; }
      } else renderer.renderGameplayFrame(idle);
      const before = snapshot(), idleModelCount = renderer.lastModel.objects.filter((object) => object.kind === "aftermath").length;
      // Keep the interval result available even when the subsequent canvas
      // capture is invalid; do not fabricate pixels from the offscreen target.
      if (firstNoContact && warmupWrites && (warmupWrites.backbufferWrites !== 0 || (warmupWrites.draws > 0 && warmupWrites.privateWrites === 0)))
        throw new Error(`Warmup framebuffer isolation failed: ${JSON.stringify(warmupWrites)}`);
      const backFramebuffer = renderer.app.graphicsDevice.backBuffer.impl._glFrameBuffer;
      const drawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
      const readFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
      const activeFramebuffer = renderer.app.graphicsDevice.activeFramebuffer;
      const framebufferMatchesBackbuffer = drawFramebuffer === backFramebuffer && readFramebuffer === backFramebuffer && activeFramebuffer === backFramebuffer;
      const readBuffer = gl.getParameter(gl.READ_BUFFER);
      let blank;
      try { blank = sample(); }
      catch (error) { throw new Error(`${String(error)}; warmup interval=${JSON.stringify(warmupWrites)}; pre-tick canvas alpha=${preTickCanvasPaint}; framebufferMatchesBackbuffer=${framebufferMatchesBackbuffer}`); }
      const w1cCopy = new OffscreenCanvas(canvas.width, canvas.height), w1cContext = w1cCopy.getContext("2d", { willReadFrequently: true });
      w1cContext.drawImage(canvas, 0, 0);
      const w1cCapturePixels = nonzero(w1cContext.getImageData(0, 0, canvas.width, canvas.height).data);
      const debug = { width: canvas.width, height: canvas.height, liveBaselinePixels: nonzero(blank), w1cCapturePixels, preTickCanvasPaint, firstFlowWarmupCalls, warmupWrites, tickWrites, framegraphBefore, framegraphAfterWarmup, framegraphAfterTick, framebufferMatchesBackbuffer, backbufferIsNonNull: backFramebuffer !== null, readBuffer, glError: gl.getError() };
      // The offscreen warmup must never flush an invisible or stale production scene
      // onto the on-screen canvas; the first no-contact tick must paint this canvas.
      const cutProgramDiffs = [];
      const states = [];
      for (const [shape, direction] of [["arrow", "up"], ["arrow", "right"], ["arrow", "up-right"], ["arrow", "down"], ["orb", "up"]]) {
        const prior = snapshot();
        renderer.renderGameplayFrame({ ...idle, aftermath: [entry(shape, direction)] });
        const current = snapshot(), objects = renderer.lastModel.objects.filter((object) => object.kind === "aftermath");
        if (shape === "arrow" && direction === "up") {
          const pre = links.filter((link) => link.generation === generation && link.success).slice(0, prior.linked.length);
          const newLinks = links.filter((link) => link.generation === generation && link.success).slice(prior.linked.length);
          for (const cut of newLinks) {
            const warm = pre.find((link) => link.sign === cut.sign);
            if (warm) cutProgramDiffs.push(compareProgram(warm, cut));
          }
        }
        const pixels = difference(blank, sample());
        const halves = attributedHalves(shape, objects);
        states.push({ shape, direction, priorLinks: prior.linked.length, newLinks: current.linked.length - prior.linked.length, signs: objects.map((object) => object.aftermath.sliceSign), pixels, halves, frames: current.frameCount - prior.frameCount, context: current.context, assetGeneration: current.assetGeneration });
      }
      renderer.renderGameplayFrame(idle);
      const end = snapshot();
      return { label, before: { ...before, pool: before.pool }, debug, cutProgramDiffs, start, idleModelCount, idleObjects: renderer.lastModel.objects.filter((object) => object.kind === "aftermath").length, idlePixelDifference: difference(blank, sample()), states, end: { frameCount: end.frameCount, context: end.context, assetGeneration: end.assetGeneration, linked: end.linked.length } };
    };
    let first, reattached, restored = null;
    let scoredFirst = null, fixtureControl = null;
    const beforeAttachWarmup = renderer.warmFlowSlicePrograms;
    renderer.warmFlowSlicePrograms = function (...args) {
      if (!this.app?.graphicsDevice) throw new Error("Asset-ready warmup ran without graphics device");
      const beforeFrames = this.frameCount;
      const beforePixels = (() => { const copy = new OffscreenCanvas(canvas.width, canvas.height), ctx = copy.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0); return nonzero(ctx.getImageData(0, 0, copy.width, copy.height).data); })();
      warmupGl.backFramebuffer = this.app.graphicsDevice.backBuffer.impl._glFrameBuffer;
      warmupGl.active = true;
      try { return beforeAttachWarmup.apply(this, args); }
      finally {
        warmupGl.active = false;
        const copy = new OffscreenCanvas(canvas.width, canvas.height), ctx = copy.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(canvas, 0, 0);
        assetReadyWarmup = { beforeFrames, afterFrames: this.frameCount, beforePixels,
          afterPixels: nonzero(ctx.getImageData(0, 0, copy.width, copy.height).data),
          draws: warmupGl.draws, clears: warmupGl.clears, backbufferWrites: warmupGl.backbufferWrites,
          privateDraws: warmupGl.events.filter((event) => event.kind.startsWith("draw") && event.privateTarget).length,
          privateClears: warmupGl.events.filter((event) => event.kind === "clear" && event.privateTarget).length,
          privateWrites: warmupGl.events.filter((event) => event.kind !== "bind" && event.privateTarget).length };
      }
    };
    try {
      renderer.attach(canvas, { alpha: true, antialias: false, depth: true, stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
      renderer.resize({ widthCssPx: 844, heightCssPx: 390, deviceScaleFactor: 1 });
      await renderer.gameplayAssetLoadPromise;
      renderer.warmFlowSlicePrograms = beforeAttachWarmup;
      first = await runGeneration("initial");
      renderer.detach();
      generation++;
      renderer.attach(canvas, { alpha: true, antialias: false, depth: true, stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
      renderer.resize({ widthCssPx: 844, heightCssPx: 390, deviceScaleFactor: 1 });
      reattached = await runGeneration("reattached");
      const extension = gl.getExtension("WEBGL_lose_context");
      if (extension) {
        const oldGeneration = renderer.gameplayAssetLoader.describe().generation;
        extension.loseContext();
        const deadline = performance.now() + 5000;
        while (!renderer.describe().contextLost && performance.now() < deadline) await new Promise((done) => setTimeout(done, 10));
        if (!renderer.describe().contextLost) throw new Error("Context loss was not observed");
        generation++; // Relinking occurs asynchronously DURING restoration, before GLBs report ready.
        const linkWrapperBeforeRestore = gl.linkProgram;
        extension.restoreContext();
        while ((renderer.describe().contextLost || renderer.gameplayAssetLoader.describe().state !== "ready") && performance.now() < deadline + 5000) await new Promise((done) => setTimeout(done, 20));
        if (renderer.describe().contextLost || renderer.gameplayAssetLoader.describe().generation <= oldGeneration) throw new Error("Context restoration did not renew GLB generation");
        restored = await runGeneration("restored");
        restored.restoreDiagnostic = { totalSignedLinks: links.length, beforeSignedLinks: restored.before.linked.length,
          wrapperPreserved: gl.linkProgram === linkWrapperBeforeRestore, deviceContextPreserved: renderer.app.graphicsDevice.gl === gl,
          shaderReadyCount: restored.before.shaderReadyCount, shaderProgramCount: restored.before.shaderProgramCount,
          beforeSlotPrograms: Object.values(restored.before.pool).flatMap((slots) => slots.flatMap((slot) => slot.records.flatMap((record) => record.program))).length,
          recordSigns: links.map((link) => ({ generation: link.generation, sign: link.sign, success: link.success })) };
      }
      // Compare W1-C's established primary canvas to this new 844×390 canvas.
      // The context options must match PlayCanvas's own device initialization;
      // changing antialias/stencil during test setup produced invalid captures.
      const provenCanvas = document.querySelector("#primary canvas");
      fixtureControl = { existingCanvasPixels: globalThis.__AERO_RENDERER_TEST__.initialDisplayedAlpha[0],
        freshRendererReadPixels: first.debug.liveBaselinePixels, freshRendererW1cCapture: first.debug.w1cCapturePixels,
        existingContext: provenCanvas.getContext("webgl2")?.getContextAttributes(), freshContext: gl.getContextAttributes() };
      // Independent fresh attachment: the FIRST caller frame already carries a
      // scored corpse. Asset-ready must have linked both signs BEFORE this call;
      // a warmup inside renderGameplayFrame is too late for this lifecycle case.
      const directCanvas = document.createElement("canvas");
      directCanvas.style.cssText = "display:block;width:844px;height:390px";
      document.body.append(directCanvas);
      const directGl = directCanvas.getContext("webgl2", { alpha: true, antialias: false, depth: true, stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
      if (!directGl) throw new Error("Scored-first WebGL2 context unavailable");
      const rawSource = directGl.shaderSource, rawAttach = directGl.attachShader, rawLink = directGl.linkProgram;
      const directSources = new WeakMap(), directAttached = new WeakMap(), directLinks = [];
      directGl.shaderSource = function (shader, text) { directSources.set(shader, text); return rawSource.call(this, shader, text); };
      directGl.attachShader = function (program, shader) { const list = directAttached.get(program) ?? []; list.push(shader); directAttached.set(program, list); return rawAttach.call(this, program, shader); };
      directGl.linkProgram = function (program) {
        const result = rawLink.call(this, program);
        const fragment = (directAttached.get(program) ?? []).filter((shader) => this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER).map((shader) => directSources.get(shader) ?? "").join("\n");
        const sign = signed(fragment);
        if (sign !== null) directLinks.push({ sign, success: Boolean(this.getProgramParameter(program, this.LINK_STATUS)) });
        return result;
      };
      const direct = new Renderer();
      try {
        direct.attach(directCanvas, { alpha: true, antialias: false, depth: true, stencil: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
        direct.resize({ widthCssPx: 844, heightCssPx: 390, deviceScaleFactor: 1 });
        await direct.gameplayAssetLoadPromise;
        if (direct.gameplayAssetLoader.describe().state !== "ready") throw new Error("Scored-first real GLBs not ready");
        direct.setEnvironmentVisible(false);
        direct.setBackgroundProjection({ kind: "solid", colors: ["#102030"], angleDeg: 180 });
        const beforeCount = direct.frameCount, beforeLinks = directLinks.filter((link) => link.success).map((link) => link.sign), beforeGeneration = direct.gameplayAssetLoader.describe().generation;
        const poolSizes = [2, 4];
        const pools = () => assets.map((asset, assetIndex) => (direct.aftermathAssetPools.get(asset) ?? []).slice(0, poolSizes[assetIndex]));
        const readyPools = pools();
        const readyRecords = readyPools.map((slots) => slots.map((entity) => direct.assetMaterials.get(entity) ?? []));
        const readyMaterials = readyRecords.map((slots) => slots.map((records) => records.map((record) => record.meshInstance.material)));
        const readyVariants = new Map(direct.sliceVariantMaterials);
        const readyVariantCount = readyVariants.size;
        const readyPoolGeneration = direct.assetPoolGeneration;
        const concurrentAny = [
          { ...entry("orb", "up"), targetId: "first-any-a", spawn: { x: -.5, y: 1, z: 0 } },
          { ...entry("orb", "up"), targetId: "first-any-b", spawn: { x: .5, y: 1, z: 0 }, seed: 43 }
        ];
        direct.renderGameplayFrame({ ...idle, aftermath: concurrentAny });
        const afterLinks = directLinks.filter((link) => link.success).map((link) => link.sign);
        const afterPools = pools();
        const poolIdentityPreserved = readyPools.every((slots, assetIndex) => slots.length === poolSizes[assetIndex] && slots.every((entity, slotIndex) => entity === afterPools[assetIndex][slotIndex]));
        const materialIdentityPreserved = readyRecords.every((slots, assetIndex) => slots.every((records, slotIndex) => records.length >= 3 &&
          records.every((record, partIndex) => record === direct.assetMaterials.get(afterPools[assetIndex][slotIndex])?.[partIndex] &&
            readyMaterials[assetIndex][slotIndex][partIndex] === record.meshInstance.material)));
        const afterVariantCount = direct.sliceVariantMaterials.size;
        const variantIdentityPreserved = readyVariants.size === afterVariantCount && [...readyVariants].every(([key, material]) =>
          direct.sliceVariantMaterials.get(key) === material);
        const backFramebuffer = direct.app.graphicsDevice.backBuffer.impl._glFrameBuffer;
        const framebufferMatchesBackbuffer = directGl.getParameter(directGl.DRAW_FRAMEBUFFER_BINDING) === backFramebuffer &&
          directGl.getParameter(directGl.READ_FRAMEBUFFER_BINDING) === backFramebuffer && direct.app.graphicsDevice.activeFramebuffer === backFramebuffer;
        const previousRead = directGl.getParameter(directGl.READ_FRAMEBUFFER_BINDING), previousBuffer = directGl.getParameter(directGl.READ_BUFFER);
        const pixels = new Uint8Array(directCanvas.width * directCanvas.height * 4);
        let captureError;
        try {
          directGl.getError();
          directGl.bindFramebuffer(directGl.READ_FRAMEBUFFER, null); directGl.readBuffer(directGl.BACK);
          directGl.readPixels(0, 0, directCanvas.width, directCanvas.height, directGl.RGBA, directGl.UNSIGNED_BYTE, pixels);
          captureError = directGl.getError();
        } finally { directGl.bindFramebuffer(directGl.READ_FRAMEBUFFER, previousRead); directGl.readBuffer(previousBuffer); }
        scoredFirst = { beforeCount, afterCount: direct.frameCount, beforeLinks, newLinks: afterLinks.length - beforeLinks.length, beforeGeneration,
          readyPoolGeneration, afterPoolGeneration: direct.assetPoolGeneration, readyPoolSizes: readyPools.map((slots) => slots.length),
          afterPoolSizes: assets.map((asset) => (direct.aftermathAssetPools.get(asset) ?? []).length),
          enabledAnySlots: (direct.aftermathAssetPools.get(assets[1]) ?? []).map((entity, index) => entity.enabled ? index : -1).filter((index) => index >= 0),
          readyVariantCount, afterVariantCount, poolIdentityPreserved, materialIdentityPreserved, variantIdentityPreserved,
          afterGeneration: direct.gameplayAssetLoader.describe().generation, sameContext: direct.app.graphicsDevice.gl === directGl,
          signs: direct.lastModel.objects.filter((object) => object.kind === "aftermath").map((object) => object.aftermath.sliceSign),
          pixels: nonzero(pixels), captureError, framebufferMatchesBackbuffer, backbufferIsNonNull: backFramebuffer !== null };
      } finally {
        direct.destroy(); directGl.shaderSource = rawSource; directGl.attachShader = rawAttach; directGl.linkProgram = rawLink; directCanvas.remove();
      }
    } finally {
      renderer.warmFlowSlicePrograms = beforeAttachWarmup;
      renderer.destroy();
      gl.shaderSource = original.shaderSource;
      gl.attachShader = original.attachShader;
      gl.linkProgram = original.linkProgram;
      gl.bindFramebuffer = original.bindFramebuffer;
      gl.clear = original.clear;
      gl.drawElements = original.drawElements;
      gl.drawArrays = original.drawArrays;
      gl.drawElementsInstanced = original.drawElementsInstanced;
      gl.drawArraysInstanced = original.drawArraysInstanced;
      gl.blitFramebuffer = original.blitFramebuffer;
      canvas.remove();
    }
    return { first, reattached, restored, scoredFirst, fixtureControl, assetReadyWarmup };
  });
  console.log("Asset-ready private warmup GL interval", JSON.stringify(evidence.assetReadyWarmup));
  assert.ok(evidence.assetReadyWarmup?.draws >= 18 && evidence.assetReadyWarmup?.privateDraws >= 18,
    "GLB-ready warmup must issue at least eighteen real private-framebuffer mesh draws before first gameplay frame");
  assert.ok(evidence.assetReadyWarmup.clears >= 1 && evidence.assetReadyWarmup.privateClears >= 1,
    "GLB-ready warmup must clear its private framebuffer, not merely prepare materials");
  assert.equal(evidence.assetReadyWarmup.privateWrites, evidence.assetReadyWarmup.draws + evidence.assetReadyWarmup.clears,
    "every ready-phase warmup draw and clear must target the private framebuffer");
  assert.equal(evidence.assetReadyWarmup.backbufferWrites, 0, "asset-ready warmup must never draw/clear the gameplay backbuffer");
  assert.equal(evidence.assetReadyWarmup.beforeFrames, 0);
  assert.equal(evidence.assetReadyWarmup.afterFrames, 0, "asset-ready warmup cannot advance gameplay frames");
  assert.equal(evidence.assetReadyWarmup.beforePixels, 0);
  assert.equal(evidence.assetReadyWarmup.afterPixels, 0, "asset-ready private warmup cannot visibly flush the canvas");
  console.log("W1-C existing versus fresh canvas fixture", JSON.stringify(evidence.fixtureControl));
  console.log("Fresh scored-first Flow lifecycle", JSON.stringify(evidence.scoredFirst));
  console.log("Initial no-contact warmup versus normal tick", JSON.stringify(evidence.first.debug));
  console.log("Restored signed program diagnostic", JSON.stringify(evidence.restored?.restoreDiagnostic));
  const direct = evidence.scoredFirst;
  assert.ok(direct, "fresh scored-first renderer evidence must exist");
  assert.equal(direct.beforeCount, 0, "no Flow frame may precede the first scored cut");
  for (const sign of [-1, 1]) assert.ok(direct.beforeLinks.includes(sign), `fresh GLB-ready attachment lacks pre-frame signed GPU program ${sign}`);
  assert.deepEqual(direct.readyPoolSizes, [2, 4], "GLB-ready pools must prebuild two arrow and four Any corpse halves");
  assert.deepEqual(direct.afterPoolSizes, [2, 4], "two simultaneous Any hits must not append a corpse slot on their first scored frame");
  assert.deepEqual(direct.enabledAnySlots, [0, 1, 2, 3], "two simultaneous Any hits must consume exactly four ready-made halves");
  assert.equal(direct.readyPoolGeneration, direct.beforeGeneration, "GLB-ready corpse pool generation must match loaded assets before any scored frame");
  assert.equal(direct.poolIdentityPreserved, true, "first scored cut must reuse exact GLB-ready arrow and Any corpse entities");
  assert.equal(direct.materialIdentityPreserved, true, "first scored cut must reuse exact GLB-ready mesh material identities");
  assert.equal(direct.readyVariantCount, 18, "GLB-ready pool must have exactly eighteen bounded three-part material variants");
  assert.equal(direct.afterVariantCount, direct.readyVariantCount, "first scored cut must not insert/reclone complementary material variants");
  assert.equal(direct.variantIdentityPreserved, true, "first scored cut must preserve every complementary variant key and material object identity");
  assert.equal(direct.afterPoolGeneration, direct.beforeGeneration, "first scored cut must not rebuild asset generation");
  assert.equal(direct.newLinks, 0, "first scored Flow frame must not link a cut-specific program");
  assert.equal(direct.afterCount, 1, "two concurrent scored Any hits use exactly one caller-owned gameplay tick");
  assert.equal(direct.afterGeneration, direct.beforeGeneration, "scored-first GLB generation must remain stable");
  assert.equal(direct.sameContext, true);
  assert.deepEqual([...direct.signs].sort((a, b) => a - b), [-1, -1, 1, 1], "two simultaneous Any hits must stage four complementary GLB halves");
  assert.equal(direct.captureError, 0, "scored-first default framebuffer capture must be valid");
  assert.ok(direct.pixels > 400, "scored-first live scene and corpse must paint real canvas pixels");
  assert.equal(direct.framebufferMatchesBackbuffer, true, "scored-first frame must return to PlayCanvas's backBuffer framebuffer");
  for (const lifecycle of [evidence.first, evidence.reattached, evidence.restored].filter(Boolean)) {
    if (lifecycle.cutProgramDiffs.length) console.log(`First-hit signed VS/FS differences (${lifecycle.label})`, JSON.stringify(lifecycle.cutProgramDiffs));
    console.log(`First-cut ${lifecycle.label} default framebuffer evidence`, JSON.stringify({ ...lifecycle.debug, firstCut: lifecycle.states[0] }));
    assert.equal(lifecycle.before.context, true, `${lifecycle.label}: links must belong to renderer graphics context`);
    assert.equal(lifecycle.before.shaderReadyCount, lifecycle.before.shaderProgramCount,
      `${lifecycle.label}: all signed material shader programs must be linked, valid on this context, and ready before cut`);
    assert.ok(lifecycle.before.shaderReadyCount >= 18, `${lifecycle.label}: no missing signed mesh shader programs`);
    if (lifecycle.label === "restored") {
      assert.equal(lifecycle.restoreDiagnostic.wrapperPreserved, true, "WebGL linkProgram instrumentation must survive context restoration");
      assert.equal(lifecycle.restoreDiagnostic.deviceContextPreserved, true, "restored shader programs must belong to the same WebGL context");
    }
    assert.equal(lifecycle.before.frameCount, lifecycle.start + 1, `${lifecycle.label}: idle request makes exactly one gameplay frame`);
    assert.equal(lifecycle.idleModelCount, 0, `${lifecycle.label}: pre-contact idle has no corpse`);
    if (lifecycle.label === "initial") {
      assert.ok(lifecycle.before.linked.length >= 2, "asset-ready warmup must have already linked signed programs");
      if (lifecycle.debug.firstFlowWarmupCalls > 0) {
        assert.equal(lifecycle.debug.warmupWrites.draws, 0, "first idle Flow call must not repeat asset-ready warmup draws");
        assert.equal(lifecycle.debug.warmupWrites.clears, 0, "first idle Flow call must not repeat asset-ready warmup clears");
        assert.equal(lifecycle.debug.warmupWrites.backbufferWrites, 0,
          "first idle Flow warmup must not clear/draw PlayCanvas's backbuffer");
      }
      assert.equal(lifecycle.debug.preTickCanvasPaint, 0,
        "private warmup must not visibly flush the production scene before the first caller tick");
    }
    // This assertion MUST be RED on the unmodified production path, which lazily creates
    // signed shaders only when the first corpse is staged for rendering.
    for (const sign of [-1, 1]) assert.ok(lifecycle.before.linked.includes(sign), `${lifecycle.label}: missing pre-cut signed GPU program ${sign}; real-GLB warmup did not linkProgram before scored cut`);
    assert.equal(lifecycle.debug.glError, 0, `${lifecycle.label}: canvas capture must not report a WebGL error`);
    assert.ok(lifecycle.debug.liveBaselinePixels > 400, `${lifecycle.label}: live-note canvas must be visibly nonblank before half assertions (invalid capture otherwise)`);
    assert.equal(lifecycle.debug.framebufferMatchesBackbuffer, true, `${lifecycle.label}: production render must leave GL draw/read and device active framebuffer on PlayCanvas's backBuffer`);
    assert.equal(lifecycle.idleObjects, 0, `${lifecycle.label}: return to idle has no corpse`);
    assert.ok(lifecycle.idlePixelDifference < 20, `${lifecycle.label}: no corpse flash/ghost on idle framebuffer`);
    for (const asset of ["directional-arrow/rounded-outline-v1", "any-note/outlined-circle-v1"]) {
      const slots = lifecycle.before.pool[asset] ?? [];
      assert.equal(slots.length, asset === "any-note/outlined-circle-v1" ? 4 : 2, `${lifecycle.label}: missing bounded prebuilt GLB halves for ${asset}`);
      assert.ok(slots.every((slot) => slot.records.length >= 3 && slot.records.every((record) => record.signed.includes("vAeroSliceLocalX"))), `${lifecycle.label}: ${asset} has missing signed real-GLB material parts`);
      assert.ok(slots.every((slot) => slot.records.every((record) => record.program.some((program) => lifecycle.before.programs.includes(program)))), `${lifecycle.label}: ${asset} has material parts without actual linked WebGL programs`);
      assert.ok(slots.every((slot) => !slot.enabled), `${lifecycle.label}: warmup leaves no visible corpse`);
    }
    assert.equal(lifecycle.states.length, 5);
    for (const state of lifecycle.states) {
      assert.deepEqual([...state.signs].sort((a, b) => a - b), [-1, 1], `${lifecycle.label}: ${state.shape}/${state.direction} has complementary halves`);
      assert.ok(state.pixels > 400, `${lifecycle.label}: ${state.shape}/${state.direction} must visibly paint real GLB halves`);
      assert.deepEqual(state.halves.map((half) => half.sign).sort((a, b) => a - b), [-1, 1]);
      assert.ok(state.halves.every((half) => half.meshes >= 3 && half.ownPixels > (state.shape === "orb" ? 800 : 900)),
        `${lifecycle.label}: ${state.shape}/${state.direction} each signed three-part GLB half must own visible framebuffer pixels: ${JSON.stringify(state.halves)}`);
      assert.equal(state.newLinks, 0, `${lifecycle.label}: first ${state.shape}/${state.direction} linked new cut-specific GPU programs`);
      assert.equal(state.frames, 1, `${lifecycle.label}: each scored cut makes exactly one gameplay frame`);
      assert.equal(state.context, true, `${lifecycle.label}: same graphics context throughout cut`);
      assert.equal(state.assetGeneration, lifecycle.before.assetGeneration, `${lifecycle.label}: asset generation changed during cut`);
    }
    assert.equal(lifecycle.end.frameCount, lifecycle.start + 7, `${lifecycle.label}: no extra scored gameplay frame from warmup`);
    assert.equal(lifecycle.end.context, true);
  }
  assert.deepEqual(noise.filter((entry) => !entry.includes("/branding/manifest.json") || !entry.includes("404 (Not Found)")), [], `unexpected browser noise: ${JSON.stringify(noise)}`);
  console.log("First-cut real-GLB signed GPU link readiness, visible arrow/Any cuts, idle, and graphics-generation checks passed.");
} finally {
  if (browser) await browser.close();
  await new Promise((done) => server.close(done));
}
