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
  const flowPixelEvidence = [];
  for (const [name, width, height] of evidence) {
    await page.setViewportSize({ width, height });
    const pixels = await page.evaluate(() => {
      const test = globalThis.__AERO_RENDERER_TEST__;
      test.resize();
      const renderer = test.renderers[0];
      const canvas = document.querySelector("canvas");
      const gl = canvas.getContext("webgl2");
      const directions = ["up","up-right","right","down-right","down","down-left","left","up-left"];
      const baseTarget = { id:"pixel-flow",kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,judgement:"hit",feedbackProgress:0 };
      const render = (direction) => renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[direction ? { ...baseTarget,direction } : baseTarget] });
      const baselinePlan = render(null).plan;
      const baseline = readPixels();
      const target = baselinePlan.commands.find((entry) => entry.targetId === "pixel-flow" && entry.layer === 4);
      if (!target) throw new Error("Pixel-probe Flow target is missing");
      const x0 = Math.max(0, Math.floor(target.rect.x * gl.drawingBufferWidth));
      const x1 = Math.min(gl.drawingBufferWidth, Math.ceil((target.rect.x + target.rect.width) * gl.drawingBufferWidth));
      const y0 = Math.max(0, Math.floor((1 - target.rect.y - target.rect.height) * gl.drawingBufferHeight));
      const y1 = Math.min(gl.drawingBufferHeight, Math.ceil((1 - target.rect.y) * gl.drawingBufferHeight));
      const results = directions.map((direction) => {
        render(direction);
        const actual = readPixels();
        let count = 0; let luminanceDelta = 0; let maxLuminanceDelta = 0; let sumX = 0; let sumY = 0;
        for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
          const offset = (y * gl.drawingBufferWidth + x) * 4;
          const difference = Math.max(Math.abs(actual[offset] - baseline[offset]), Math.abs(actual[offset + 1] - baseline[offset + 1]), Math.abs(actual[offset + 2] - baseline[offset + 2]));
          if (difference <= 3) continue;
          const baselineLuminance = baseline[offset] * 0.2126 + baseline[offset + 1] * 0.7152 + baseline[offset + 2] * 0.0722;
          const actualLuminance = actual[offset] * 0.2126 + actual[offset + 1] * 0.7152 + actual[offset + 2] * 0.0722;
          const delta = Math.abs(actualLuminance - baselineLuminance);
          count += 1; luminanceDelta += delta; maxLuminanceDelta = Math.max(maxLuminanceDelta, delta);
          sumX += ((x + 0.5) / gl.drawingBufferWidth - target.rect.x) / target.rect.width;
          const topY = 1 - (y + 0.5) / gl.drawingBufferHeight;
          sumY += (topY - target.rect.y) / target.rect.height;
        }
        return { direction, count, targetPixels:(x1-x0)*(y1-y0), meanLuminanceDelta:count ? luminanceDelta/count : 0, maxLuminanceDelta, centroidX:count ? sumX/count : null, centroidY:count ? sumY/count : null };
      });
      renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:directions.map((direction,index) => ({ ...baseTarget,id:`flow-${direction}`,cell:index,hand:index%2===0?"left":"right",direction })) });
      return { drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,results };
      function readPixels() { const output = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output); return output; }
    });
    assertDirectionPixels(pixels.results, name);
    flowPixelEvidence.push({ name, ...pixels });
    await page.locator(".surface").first().screenshot({ path:join(root, `screenshots/task12-renderer-flow-direction-${name}.png`) });
  }
  assert.equal(flowPixelEvidence.length, 3);
  const themeContrast = await page.evaluate(() => {
    const test = globalThis.__AERO_RENDERER_TEST__; const renderer = test.renderers[0]; const canvas = document.querySelector("canvas"); const gl = canvas.getContext("webgl2");
    const target = { id:"theme-flow",kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,judgement:"hit",feedbackProgress:0 };
    const tokens = { leftHandColor:"#000000",rightHandColor:"#39c96b",guardColor:"#9a67ea",obstacleColor:"#e5484d",receptorColor:"#d9f5ff",approachLeadMs:900,targetStartScale:0.48,targetHitScale:1,approachEasing:"linear",hitEasing:"ease-out",missEasing:"ease-out" };
    const results = ["#050505","#fafafa"].map((leftHandColor,index) => {
      renderer.setTheme({ schema:"aerobeat/theme_descriptor",version:1,id:`theme.contrast.${index}`,themeVersion:"1",tokens:{ ...tokens,leftHandColor },contentHash:{ schema:"aerobeat/content_hash",version:1,algorithm:"sha256",value:String(index).repeat(64) } });
      renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[target] });
      const baselinePlan = renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[{ ...target,direction:"right" }] }).plan;
      const head = baselinePlan.commands.find((entry) => entry.targetId === "theme-flow" && entry.layer === 5 && entry.kind === "circle");
      if (!head) throw new Error("Theme contrast head is missing");
      const x = Math.min(gl.drawingBufferWidth-1,Math.max(0,Math.floor((head.rect.x+head.rect.width/2)*gl.drawingBufferWidth)));
      const y = Math.min(gl.drawingBufferHeight-1,Math.max(0,Math.floor((1-head.rect.y-head.rect.height/2)*gl.drawingBufferHeight)));
      const directional = sample(x,y);
      renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[target] });
      const baseline = sample(x,y);
      return { leftHandColor,directional,baseline,directionalLuminance:luminance(directional),baselineLuminance:luminance(baseline) };
    });
    renderer.setTheme(null);
    return results;
    function sample(x,y){ const output=new Uint8Array(4); gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,output); return [...output]; }
    function luminance(pixel){ return pixel[0]*0.2126+pixel[1]*0.7152+pixel[2]*0.0722; }
  });
  assert.ok(themeContrast[0].directionalLuminance - themeContrast[0].baselineLuminance > 180, `dark theme cue must choose white: ${JSON.stringify(themeContrast[0])}`);
  assert.ok(themeContrast[1].baselineLuminance - themeContrast[1].directionalLuminance > 180, `light theme cue must choose black: ${JSON.stringify(themeContrast[1])}`);

  const flowResult = await page.evaluate(() => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const directions = ["up","up-right","right","down-right","down","down-left","left","up-left"];
    const result = renderer.renderGameplayFrame({ presentation:"flow", nowMs:1000, blockedCells:[3], safeCells:[8], overlay:"none", targets:directions.map((direction,index) => ({ id:`flow-${direction}`,kind:"flow",hand:index%2===0?"left":"right",family:"flow",cell:index,cells:[],lane:null,beatCenterMs:1000,direction,judgement:"hit",feedbackProgress:0 })) });
    const counts = Object.fromEntries(directions.map((direction) => [direction,result.plan.commands.filter((entry) => entry.targetId === `flow-${direction}` && entry.layer === 5).length]));
    const bounded = directions.every((direction) => {
      const target = result.plan.commands.find((entry) => entry.targetId === `flow-${direction}` && entry.layer === 4);
      return target && result.plan.commands.filter((entry) => entry.targetId === `flow-${direction}` && entry.layer === 5).every((entry) => entry.rect.x >= target.rect.x && entry.rect.y >= target.rect.y && entry.rect.x + entry.rect.width <= target.rect.x + target.rect.width + Number.EPSILON * 64 && entry.rect.y + entry.rect.height <= target.rect.y + target.rect.height + Number.EPSILON * 64);
    });
    return { commands:result.plan.commands.length, lines:result.plan.commands.filter((entry) => entry.kind === "line").length, counts, bounded };
  });
  assert.equal(flowResult.commands, 62); assert.equal(flowResult.lines, 32); assert.deepEqual(flowResult.counts, { up:2,"up-right":8,right:2,"down-right":8,down:2,"down-left":8,left:2,"up-left":8 }); assert.equal(flowResult.bounded, true);
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

/** @param {readonly {direction:string,count:number,targetPixels:number,meanLuminanceDelta:number,maxLuminanceDelta:number,centroidX:number|null,centroidY:number|null}[]} results @param {string} viewport */
function assertDirectionPixels(results, viewport) {
  const byDirection = new Map(results.map((entry) => [entry.direction, entry]));
  assert.equal(byDirection.size, 8, `${viewport} must capture all eight directions`);
  for (const entry of results) {
    assert.ok(entry.count >= Math.max(12, entry.targetPixels * 0.012), `${viewport} ${entry.direction} must differ from a directionless target; ${JSON.stringify(entry)}`);
    assert.ok(entry.meanLuminanceDelta >= 35, `${viewport} ${entry.direction} cue must have mean luminance contrast; ${JSON.stringify(entry)}`);
    assert.ok(entry.maxLuminanceDelta >= 80, `${viewport} ${entry.direction} cue must have peak luminance contrast; ${JSON.stringify(entry)}`);
    assert.equal(typeof entry.centroidX, "number"); assert.equal(typeof entry.centroidY, "number");
    if (entry.direction.includes("left")) assert.ok(entry.centroidX < 0.47, `${viewport} ${entry.direction} pixel centroid must point left`);
    if (entry.direction.includes("right")) assert.ok(entry.centroidX > 0.53, `${viewport} ${entry.direction} pixel centroid must point right`);
    if (entry.direction.startsWith("up")) assert.ok(entry.centroidY < 0.47, `${viewport} ${entry.direction} pixel centroid must point up`);
    if (entry.direction.startsWith("down")) assert.ok(entry.centroidY > 0.53, `${viewport} ${entry.direction} pixel centroid must point down`);
  }
  const signatures = results.map((entry) => `${Math.round(Number(entry.centroidX) * 100)}:${Math.round(Number(entry.centroidY) * 100)}`);
  assert.equal(new Set(signatures).size, 8, `${viewport} each direction must have a distinct pixel distribution: ${JSON.stringify(signatures)}`);
}

/** @param {{left:number,top:number,right:number,bottom:number}} rect @param {{width:number,height:number}} viewport @param {string} label */
function assertWithinViewport(rect, viewport, label) {
  assertWithinBounds(rect, { left:0, top:0, right:viewport.width, bottom:viewport.height }, label);
}

/** @param {{left:number,top:number,right:number,bottom:number}} rect @param {{left:number,top:number,right:number,bottom:number}} bounds @param {string} label */
function assertWithinBounds(rect, bounds, label) {
  const tolerance = 0.5;
  assert.ok(rect.left >= bounds.left - tolerance && rect.top >= bounds.top - tolerance && rect.right <= bounds.right + tolerance && rect.bottom <= bounds.bottom + tolerance, `${label} must be fully contained; rect=${JSON.stringify(rect)} bounds=${JSON.stringify(bounds)}`);
}
