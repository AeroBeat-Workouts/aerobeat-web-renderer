// @ts-check

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const brandingRoot = resolve(root, "../aerobeat-branding/icons/web-gameplay");
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const brandingRelative = pathname.startsWith("/branding/") ? pathname.slice("/branding/".length) : null;
    const relative = pathname === "/" ? ".testbed/demo/index.html" : pathname.slice(1);
    const file = brandingRelative === null ? normalize(join(root, relative)) : normalize(join(brandingRoot, brandingRelative === "manifest.json" ? "manifest.json" : brandingRelative));
    const allowedRoot = brandingRelative === null ? root : brandingRoot;
    if (!file.startsWith(allowedRoot)) { response.writeHead(403).end(); return; }
    const content = await readFile(file);
    const types = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".svg":"image/svg+xml" };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "cache-control":"no-store" }); response.end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Browser test server failed");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 760 }, deviceScaleFactor: 1.5 });
  const noise = [];
  page.on("console", (message) => {
    const text = message.text();
    const chromiumDriverNoise = message.type() === "warning" && text.includes("GL Driver Message") && text.includes("GPU stall due to ReadPixels");
    if (!chromiumDriverNoise && (message.type() === "warning" || message.type() === "error")) noise.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => noise.push(`pageerror: ${error.message}`));
  await page.goto(`http://127.0.0.1:${address.port}/.testbed/demo/index.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => globalThis.__AERO_RENDERER_TEST__?.ready === true);
  const initial = await page.evaluate(() => ({
    test: globalThis.__AERO_RENDERER_TEST__,
    sizes: [...document.querySelectorAll("canvas")].map((entry) => ({ width: entry.width, height: entry.height, cssWidth: entry.style.width, cssHeight: entry.style.height }))
  }));
  assert.equal(initial.test.primary.state, "running"); assert.equal(initial.test.secondary.state, "running");
  assert.equal(initial.test.primary.iconAtlasReady, true); assert.equal(initial.test.secondary.iconAtlasReady, true);
  assert.ok(initial.test.primaryCommands >= 20); assert.ok(initial.test.secondaryCommands >= 8);
  assert.notEqual(initial.sizes[0].width, initial.sizes[1].width);
  const evidence = [
    ["desktop", 1180, 760],
    ["phone-390", 390, 844],
    ["landscape", 844, 390]
  ];
  await mkdir(join(root, "screenshots"), { recursive: true });
  for (const [name, width, height] of evidence) {
    if (name === "phone-390") {
      const liveProfile = await page.evaluate(() => {
        const test = globalThis.__AERO_RENDERER_TEST__;
        const renderer = test.renderers[0];
        const canvas = document.querySelector("canvas");
        const beforeFrames = renderer.describe().frameCount;
        renderer.importTuning(test.compactRendererVisualProfile);
        test.resize();
        return { sameCanvas:canvas === document.querySelector("canvas"), beforeFrames, status:renderer.describe(), exported:renderer.exportTuning() };
      });
      assert.equal(liveProfile.sameCanvas, true);
      assert.ok(liveProfile.status.frameCount > liveProfile.beforeFrames);
      assert.equal(liveProfile.status.visualProfileIdentity.profileId, "aero.visual.compact");
      assert.deepEqual(liveProfile.exported.settings, { motionIntensity:0.8, roleScale:0.86 });
    }
    await page.setViewportSize({ width, height });
    const metrics = await page.evaluate(() => {
      globalThis.__AERO_RENDERER_TEST__.resize();
      const test = globalThis.__AERO_RENDERER_TEST__;
      const grid = test.primaryGrid;
      const cellWidth = grid.width * test.primary.widthCssPx / 4;
      const cellHeight = grid.height * test.primary.heightCssPx / 3;
      const track = test.secondaryTargetRect;
      const viewport = { width:innerWidth, height:innerHeight };
      const surfaces = [...document.querySelectorAll(".surface")].map((entry) => rect(entry.getBoundingClientRect()));
      const canvases = [...document.querySelectorAll("canvas")].map((entry) => rect(entry.getBoundingClientRect()));
      const targetBoxes = [test.primaryTargetRects, test.secondaryTargetRects].flatMap((entries, index) => entries.map((target) => ({ canvasIndex:index, left:canvases[index].left + target.x * canvases[index].width, top:canvases[index].top + target.y * canvases[index].height, right:canvases[index].left + (target.x + target.width) * canvases[index].width, bottom:canvases[index].top + (target.y + target.height) * canvases[index].height })));
      return { cellWidth, cellHeight, trackWidth:track.width * test.secondary.widthCssPx, trackHeight:track.height * test.secondary.heightCssPx, viewport, surfaces, canvases, targetBoxes, horizontalOverflow:document.documentElement.scrollWidth - innerWidth };
      function rect(value) { return { left:value.left, top:value.top, right:value.right, bottom:value.bottom, width:value.width, height:value.height }; }
    });
    assert.ok(Math.abs(metrics.cellWidth - metrics.cellHeight) < 0.02, `${name} spatial cells must remain physically square`);
    assert.ok(Math.abs(metrics.trackWidth - metrics.trackHeight) < 0.02, `${name} Track icons must remain physically square`);
    assert.ok(metrics.horizontalOverflow <= 0, `${name} evidence must not overflow horizontally; overflow=${metrics.horizontalOverflow}`);
    for (const [index, rect] of metrics.surfaces.entries()) assertWithinViewport(rect, metrics.viewport, `${name} surface ${index}`);
    for (const [index, rect] of metrics.canvases.entries()) assertWithinViewport(rect, metrics.viewport, `${name} canvas ${index}`);
    for (const [index, rect] of metrics.targetBoxes.entries()) { assertWithinViewport(rect, metrics.viewport, `${name} target ${index}`); assertWithinBounds(rect, metrics.canvases[rect.canvasIndex], `${name} target ${index} inside canvas ${rect.canvasIndex}`); }
    await page.screenshot({ path: join(root, `screenshots/task11-renderer-profile-${name}.png`) });
  }
  const flowResult = await page.evaluate(() => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const result = renderer.renderGameplayFrame({ presentation:"flow", nowMs:1000, blockedCells:[3], safeCells:[8], overlay:"none", targets:[
      { id:"flow-up",kind:"flow",hand:"neutral",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,direction:"up",judgement:"hit",feedbackProgress:0.35 },
      { id:"flow-right",kind:"flow",hand:"neutral",family:"flow",cell:6,cells:[],lane:null,beatCenterMs:1000,direction:"right",judgement:"miss",feedbackProgress:0.35 }
    ] });
    return { commands:result.plan.commands.length, directions:result.plan.commands.filter((entry) => entry.kind === "line").length };
  });
  assert.ok(flowResult.commands >= 18); assert.equal(flowResult.directions, 2);
  await page.screenshot({ path:join(root, "screenshots/task8-renderer-flow.png"), fullPage:true });
  await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.resize());
  const resized = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((entry) => ({ width: entry.width, height: entry.height })));
  assert.notEqual(resized[0].width, initial.sizes[0].width);
  const contextResult = await page.evaluate(async () => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2"); const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) return { supported:false, state:renderer.describe().state };
    extension.loseContext(); await new Promise((resolve) => setTimeout(resolve, 40)); const lost = renderer.describe().state;
    extension.restoreContext(); await new Promise((resolve) => setTimeout(resolve, 100)); return { supported:true,lost,restored:renderer.describe().state,atlas:renderer.describe().iconAtlasReady };
  });
  if (contextResult.supported) { assert.equal(contextResult.lost, "context_lost"); assert.equal(contextResult.restored, "ready"); assert.equal(contextResult.atlas, true); }
  await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.resize());
  assert.deepEqual(noise, []);
  console.log(`Chromium renderer visual/resize/context/multi-instance validation passed at http://127.0.0.1:${address.port}/.testbed/demo/index.html`);
  console.log(`Visual evidence: ${[...evidence.map(([name]) => join(root, `screenshots/task11-renderer-profile-${name}.png`)), join(root, "screenshots/task8-renderer-flow.png")].join(", ")}`);
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }

/** @param {{left:number,top:number,right:number,bottom:number}} rect @param {{width:number,height:number}} viewport @param {string} label */
function assertWithinViewport(rect, viewport, label) {
  assertWithinBounds(rect, { left:0, top:0, right:viewport.width, bottom:viewport.height }, label);
}

/** @param {{left:number,top:number,right:number,bottom:number}} rect @param {{left:number,top:number,right:number,bottom:number}} bounds @param {string} label */
function assertWithinBounds(rect, bounds, label) {
  const tolerance = 0.5;
  assert.ok(rect.left >= bounds.left - tolerance && rect.top >= bounds.top - tolerance && rect.right <= bounds.right + tolerance && rect.bottom <= bounds.bottom + tolerance, `${label} must be fully contained; rect=${JSON.stringify(rect)} bounds=${JSON.stringify(bounds)}`);
}
