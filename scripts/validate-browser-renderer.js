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
  assert.equal(initial.test.atlasWidth,1024); assert.equal(initial.test.atlasHeight,1024); assert.equal(initial.test.atlasCellSize,256,"canonical SVG alpha masks must rasterize at the bounded crisp minimum cell size");
  assert.ok(initial.test.primaryCommands >= 20); assert.ok(initial.test.secondaryCommands >= 5);
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
      const render = (direction) => renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[{ ...baseTarget,direction }] });
      renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[] });
      const baseline = readPixels();
      const baselinePlan = render("right").plan;
      const target = baselinePlan.commands.find((entry) => entry.targetId === "pixel-flow" && entry.layer === 5 && entry.sequence === 0);
      if (!target) throw new Error("Pixel-probe Flow target is missing");
      const x0 = Math.max(0, Math.floor(target.rect.x * gl.drawingBufferWidth));
      const x1 = Math.min(gl.drawingBufferWidth, Math.ceil((target.rect.x + target.rect.width) * gl.drawingBufferWidth));
      const y0 = Math.max(0, Math.floor((1 - target.rect.y - target.rect.height) * gl.drawingBufferHeight));
      const y1 = Math.min(gl.drawingBufferHeight, Math.ceil((1 - target.rect.y) * gl.drawingBufferHeight));
      let rightPixels;
      const results = directions.map((direction) => {
        render(direction);
        const actual = readPixels();
        if (direction === "right") rightPixels = actual;
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
      render(undefined); const directionlessPixels=readPixels(); let directionlessDelta=0;
      for(let index=0;index<directionlessPixels.length;index+=4) if(Math.max(Math.abs(directionlessPixels[index]-rightPixels[index]),Math.abs(directionlessPixels[index+1]-rightPixels[index+1]),Math.abs(directionlessPixels[index+2]-rightPixels[index+2]))>3) directionlessDelta+=1;
      renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:directions.map((direction,index) => ({ ...baseTarget,id:`flow-${direction}`,cell:index,hand:index%2===0?"left":"right",direction })) });
      return { drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,results,directionlessDelta };
      function readPixels() { const output = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output); return output; }
    });
    assertDirectionPixels(pixels.results, name);
    assert.ok(pixels.directionlessDelta >= 100, `${name} directionless mask must differ visibly from the directional mask`);
    flowPixelEvidence.push({ name, ...pixels });
    await page.locator(".surface").first().screenshot({ path:join(root, `screenshots/task12-renderer-flow-direction-${name}.png`) });
  }
  assert.equal(flowPixelEvidence.length, 3);
  const outlineEvidence = await page.evaluate(() => {
    const test=globalThis.__AERO_RENDERER_TEST__; const renderer=test.renderers[0]; const canvas=document.querySelector("canvas"); const gl=canvas.getContext("webgl2"); renderer.setTheme(null);
    const target={ id:"outline-flow",kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,direction:"right",judgement:"pending",feedbackProgress:0 };
    const result=renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[target] }); const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const outline=result.plan.commands.find((entry)=>entry.targetId==="outline-flow"&&entry.layer===5&&entry.sequence===0); const foreground=result.plan.commands.find((entry)=>entry.targetId==="outline-flow"&&entry.layer===5&&entry.sequence===1); if(!outline||!foreground) throw new Error("Flow outline commands are missing");
    let white=0; let role=0; const x0=Math.floor(outline.rect.x*gl.drawingBufferWidth); const x1=Math.ceil((outline.rect.x+outline.rect.width)*gl.drawingBufferWidth); const y0=Math.floor((1-outline.rect.y-outline.rect.height)*gl.drawingBufferHeight); const y1=Math.ceil((1-outline.rect.y)*gl.drawingBufferHeight);
    for(let y=y0;y<y1;y+=1) for(let x=x0;x<x1;x+=1){const offset=(y*gl.drawingBufferWidth+x)*4;const r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];if(r>235&&g>235&&b>235)white+=1;if(r<90&&g>105&&g<205&&b>210)role+=1;}
    return { white,role,outlineScale:outline.scale,foregroundScale:foreground.scale,outlineWidth:outline.rect.width,foregroundWidth:foreground.rect.width,foregroundSaturation:foreground.saturation };
  });
  assert.ok(outlineEvidence.white>=30&&outlineEvidence.role>=100,`Flow must expose white backing and role fill pixels: ${JSON.stringify(outlineEvidence)}`);
  assert.equal(outlineEvidence.outlineScale,1.12); assert.equal(outlineEvidence.foregroundScale,1); assert.ok(outlineEvidence.outlineWidth>outlineEvidence.foregroundWidth); assert.equal(outlineEvidence.foregroundSaturation,1);

  const perspectivePixelEvidence=[];
  for(const [viewport,width,height] of [["portrait",390,844],["landscape",844,390]]) for(const requestedDpr of [1,3]){
    const perspective=await page.evaluate(({width,height,requestedDpr})=>{
      const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];const canvas=document.querySelector("canvas");renderer.resetTuning();renderer.setTheme(null);renderer.resize({widthCssPx:width,heightCssPx:height,devicePixelRatio:requestedDpr});const gl=canvas.getContext("webgl2");
      const nowMs=1000;const flowBase={kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,approachLeadMs:undefined,direction:"right",judgement:"pending",feedbackProgress:0};
      renderer.renderGameplayFrame({presentation:"flow",nowMs,overlay:"none",targets:[]});const baseline=read();
      const sameTargets=[
        {...flowBase,id:"depth-near",beatCenterMs:1500},
        {...flowBase,id:"depth-far",beatCenterMs:3400},
        {...flowBase,id:"depth-middle",beatCenterMs:2500}
      ];
      const same=renderer.renderGameplayFrame({presentation:"flow",nowMs,overlay:"none",targets:sameTargets});const samePixels=read();const fills=same.plan.commands.filter((entry)=>entry.layer===5&&entry.sequence===1);const outlines=same.plan.commands.filter((entry)=>entry.layer===5&&entry.sequence===0);const rings=same.plan.commands.filter((entry)=>entry.kind==="ring");
      const cuePixels=fills.map((fill)=>{let exclusive=0;forEachPixel(fill.rect,(_x,_y,offset,nx,ny)=>{const covered=outlines.some((other)=>other.targetId!==fill.targetId&&nx>=other.rect.x&&nx<=other.rect.x+other.rect.width&&ny>=other.rect.y&&ny<=other.rect.y+other.rect.height);if(!covered&&delta(baseline,samePixels,offset)>3)exclusive+=1;});return{id:fill.targetId,changed:changedInRect(fill.rect,baseline,samePixels),exclusive,rect:fill.rect,depth:fill.depth,scale:fill.scale};});
      const middleOutline=same.plan.commands.find((entry)=>entry.targetId==="depth-middle"&&entry.layer===5&&entry.sequence===0);const middleRing=rings.find((entry)=>entry.targetId==="depth-middle");if(!middleOutline||!middleRing)throw new Error("Perspective ring probe commands are missing");
      let ringOnlyChanged=0;forEachPixel(middleRing.rect,(x,y,offset,nx,ny)=>{if(nx>=middleOutline.rect.x&&nx<=middleOutline.rect.x+middleOutline.rect.width&&ny>=middleOutline.rect.y&&ny<=middleOutline.rect.y+middleOutline.rect.height)return;if(delta(baseline,samePixels,offset)>3)ringOnlyChanged+=1;});
      const obstacle={id:"flow-plane",kind:"obstacle",hand:"neutral",family:"obstacle",cell:null,cells:[0,5],lane:null,beatCenterMs:2000,endMs:2600};
      const obstacleApproach=renderer.renderGameplayFrame({presentation:"flow",nowMs,overlay:"none",targets:[obstacle]});const obstacleApproachPixels=read();const approachPlanes=obstacleApproach.plan.commands.filter((entry)=>entry.targetId==="flow-plane"&&entry.kind==="plane");
      const obstacleImpact=renderer.renderGameplayFrame({presentation:"flow",nowMs:2000,overlay:"none",targets:[obstacle]});const obstacleImpactPixels=read();const impactPlanes=obstacleImpact.plan.commands.filter((entry)=>entry.targetId==="flow-plane"&&entry.kind==="plane");
      const obstaclePixels=approachPlanes.map((plane)=>changedInRect(plane.rect,baseline,obstacleApproachPixels));const impactPixels=impactPlanes.map((plane)=>changedInRect(plane.rect,baseline,obstacleImpactPixels));
      const crisp=renderer.renderGameplayFrame({presentation:"flow",nowMs,overlay:"none",targets:[{...flowBase,id:"crisp-flow",beatCenterMs:nowMs}]});const crispPixels=read();const crispOutline=crisp.plan.commands.find((entry)=>entry.targetId==="crisp-flow"&&entry.sequence===0);const crispFill=crisp.plan.commands.find((entry)=>entry.targetId==="crisp-flow"&&entry.sequence===1);if(!crispOutline||!crispFill)throw new Error("Crisp Flow probe commands are missing");
      let white=0,role=0,strongNeighborEdges=0,maxNeighborDelta=0;forEachPixel(crispOutline.rect,(x,y,offset)=>{const r=crispPixels[offset],g=crispPixels[offset+1],b=crispPixels[offset+2];if(r>235&&g>235&&b>235)white+=1;if(r<90&&g>105&&g<205&&b>210)role+=1;if(x+1<gl.drawingBufferWidth){const next=offset+4;const difference=delta(crispPixels,crispPixels,next,offset);maxNeighborDelta=Math.max(maxNeighborDelta,difference);if(difference>45)strongNeighborEdges+=1;}});
      return{effectiveDpr:renderer.describe().devicePixelRatio,atlasCellSize:globalThis.__AERO_RENDERER_TEST__.atlasCellSize,fillOrder:fills.map((entry)=>entry.targetId),cuePixels,rings:rings.map((entry)=>({id:entry.targetId,rect:entry.rect,depth:entry.depth,scale:entry.scale})),ringOnlyChanged,approachPlanes,impactPlanes,obstaclePixels,impactPixels,crisp:{white,role,strongNeighborEdges,maxNeighborDelta,outline:crispOutline.rect,fill:crispFill.rect},grid:same.plan.grid};
      function read(){const output=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output);return output;}
      function delta(first,second,firstOffset,secondOffset=firstOffset){return Math.max(Math.abs(first[firstOffset]-second[secondOffset]),Math.abs(first[firstOffset+1]-second[secondOffset+1]),Math.abs(first[firstOffset+2]-second[secondOffset+2]));}
      function changedInRect(rect,before,after){let changed=0;forEachPixel(rect,(_x,_y,offset)=>{if(delta(before,after,offset)>3)changed+=1;});return changed;}
      function forEachPixel(rect,callback){const x0=Math.max(0,Math.floor(rect.x*gl.drawingBufferWidth)),x1=Math.min(gl.drawingBufferWidth,Math.ceil((rect.x+rect.width)*gl.drawingBufferWidth));const y0=Math.max(0,Math.floor((1-rect.y-rect.height)*gl.drawingBufferHeight)),y1=Math.min(gl.drawingBufferHeight,Math.ceil((1-rect.y)*gl.drawingBufferHeight));for(let y=y0;y<y1;y+=1)for(let x=x0;x<x1;x+=1){const nx=(x+.5)/gl.drawingBufferWidth,ny=1-(y+.5)/gl.drawingBufferHeight;callback(x,y,(y*gl.drawingBufferWidth+x)*4,nx,ny);}}
    },{width,height,requestedDpr});
    assert.equal(perspective.effectiveDpr,Math.min(requestedDpr,2));assert.equal(perspective.atlasCellSize,256);assert.deepEqual(perspective.fillOrder,["depth-far","depth-middle","depth-near"],`${viewport} DPR${requestedDpr} perspective cues must draw far-first`);assert.equal(new Set(perspective.cuePixels.map((entry)=>JSON.stringify(entry.rect))).size,3,`${viewport} DPR${requestedDpr} same-cell cues must use separate projected rectangles`);for(const cue of perspective.cuePixels){assert.ok(cue.changed>8,`${viewport} DPR${requestedDpr} ${cue.id} must contribute framebuffer pixels: ${JSON.stringify(cue)}`);assert.ok(cue.exclusive>2,`${viewport} DPR${requestedDpr} ${cue.id} must retain pixels not covered by another same-cell cue: ${JSON.stringify(cue)}`);}assert.ok(perspective.ringOnlyChanged>8,`${viewport} DPR${requestedDpr} destination-centered ring must remain visible outside moving cue`);
    for(const ring of perspective.rings){const centerX=ring.rect.x+ring.rect.width/2,centerY=ring.rect.y+ring.rect.height/2;const endpointX=perspective.grid.x+perspective.grid.width*(1.5/4),endpointY=perspective.grid.y+perspective.grid.height*(1.5/3);assert.ok(Math.abs(centerX-endpointX)<1e-12&&Math.abs(centerY-endpointY)<1e-12,`${viewport} DPR${requestedDpr} ${ring.id} ring must stay destination-centered`);}
    assert.equal(perspective.approachPlanes.length,2);assert.equal(perspective.impactPlanes.length,2);assert.ok(perspective.approachPlanes.every((entry)=>entry.alpha===.58&&entry.intervalStartMs===2000&&entry.intervalEndMs===2600));assert.ok(perspective.obstaclePixels.every((count)=>count>20)&&perspective.impactPixels.every((count)=>count>20),`${viewport} DPR${requestedDpr} obstacle planes must be visible`);assert.ok(perspective.crisp.white>20&&perspective.crisp.role>60&&perspective.crisp.strongNeighborEdges>10&&perspective.crisp.maxNeighborDelta>70,`${viewport} DPR${requestedDpr} 256px alpha mask arrow/outline edges must remain crisp: ${JSON.stringify(perspective.crisp)}`);
    perspectivePixelEvidence.push({viewport,requestedDpr,...perspective});
  }
  assert.equal(perspectivePixelEvidence.length,4);
  console.log("Perspective Flow same-cell depth, destination ring, obstacle plane, and 256px crisp-mask framebuffer validation passed for requested DPR1/3 portrait/landscape.");

  const flowResult = await page.evaluate(() => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const directions = ["up","up-right","right","down-right","down","down-left","left","up-left"];
    const result = renderer.renderGameplayFrame({ presentation:"flow", nowMs:1000, blockedCells:[3], safeCells:[8], overlay:"none", targets:directions.map((direction,index) => ({ id:`flow-${direction}`,kind:"flow",hand:index%2===0?"left":"right",family:"flow",cell:index,cells:[],lane:null,beatCenterMs:1000,direction,judgement:"hit",feedbackProgress:0 })) });
    const counts = Object.fromEntries(directions.map((direction) => [direction,result.plan.commands.filter((entry) => entry.targetId === `flow-${direction}` && entry.layer === 5 && entry.sequence === 1).length]));
    const bounded = directions.every((direction) => {
      const outline = result.plan.commands.find((entry) => entry.targetId === `flow-${direction}` && entry.layer === 5 && entry.sequence === 0);
      const target = result.plan.commands.find((entry) => entry.targetId === `flow-${direction}` && entry.layer === 5 && entry.sequence === 1);
      return outline && target && target.rect.x >= outline.rect.x && target.rect.y >= outline.rect.y && target.rect.x + target.rect.width <= outline.rect.x + outline.rect.width + Number.EPSILON * 64 && target.rect.y + target.rect.height <= outline.rect.y + outline.rect.height + Number.EPSILON * 64;
    });
    return { commands:result.plan.commands.length, primitiveFlowCues:result.plan.commands.filter((entry) => entry.targetId?.startsWith("flow-") && (entry.kind === "line" || entry.kind === "circle")).length, counts, bounded,great:result.plan.commands.filter((entry)=>entry.iconId==="feedback.great").length };
  });
  assert.equal(flowResult.commands, 38); assert.equal(flowResult.primitiveFlowCues, 0); assert.deepEqual(flowResult.counts, { up:1,"up-right":1,right:1,"down-right":1,down:1,"down-left":1,left:1,"up-left":1 }); assert.equal(flowResult.bounded, true); assert.equal(flowResult.great,8);

  const feedbackPixelEvidence=[];
  for(const [viewport,width,height] of [["portrait",390,844],["landscape",844,390]]) for(const requestedDpr of [1,3]){
    const feedback=await page.evaluate(({width,height,requestedDpr})=>{
      const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0]; const canvas=document.querySelector("canvas"); renderer.resize({widthCssPx:width,heightCssPx:height,devicePixelRatio:requestedDpr}); const gl=canvas.getContext("webgl2");
      const base={id:"feedback-flow",kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,direction:"right"};
      renderer.renderGameplayFrame({presentation:"flow",nowMs:1000,overlay:"none",targets:[]}); const baseline=read();
      const probe=(target)=>{const result=renderer.renderGameplayFrame({presentation:"flow",nowMs:1000,overlay:"none",targets:[target]});const pixels=read();let changed=0,energy=0;for(let index=0;index<pixels.length;index+=4){const delta=Math.max(Math.abs(pixels[index]-baseline[index]),Math.abs(pixels[index+1]-baseline[index+1]),Math.abs(pixels[index+2]-baseline[index+2]));energy+=delta;if(delta>3)changed+=1;}return{changed,energy,commands:result.plan.commands.filter((entry)=>entry.targetId==="feedback-flow")};};
      const pending=probe({...base,judgement:"pending",feedbackProgress:0}); const directionless=probe({...base,direction:null,judgement:"pending",feedbackProgress:0}); const hitStart=probe({...base,judgement:"hit",feedbackProgress:0}); const hitMiddle=probe({...base,judgement:"hit",feedbackProgress:.5}); const missMiddle=probe({...base,judgement:"miss",feedbackProgress:.5}); const hitEnd=probe({...base,judgement:"hit",feedbackProgress:1}); const missEnd=probe({...base,judgement:"miss",feedbackProgress:1});
      return{effectiveDpr:renderer.describe().devicePixelRatio,pending,directionless,hitStart,hitMiddle,missMiddle,hitEnd,missEnd};
      function read(){const output=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output);return output;}
    },{width,height,requestedDpr});
    const startForeground=feedback.hitStart.commands.find((entry)=>entry.layer===5&&entry.sequence===1); const startGreat=feedback.hitStart.commands.find((entry)=>entry.iconId==="feedback.great"); const middleForeground=feedback.hitMiddle.commands.find((entry)=>entry.layer===5&&entry.sequence===1); const middleGreat=feedback.hitMiddle.commands.find((entry)=>entry.iconId==="feedback.great"); const missForeground=feedback.missMiddle.commands.find((entry)=>entry.layer===5&&entry.sequence===1);
    assert.ok(feedback.pending.changed>100&&feedback.directionless.changed>100,`${viewport} DPR${requestedDpr} directional/directionless masks must be visible`);
    assert.ok(startForeground&&startGreat&&middleForeground&&middleGreat&&missForeground,`${viewport} DPR${requestedDpr} feedback commands must be complete`);
    assert.equal(startForeground.whiten,1); assert.equal(startGreat.scale,1); assert.ok(middleGreat.scale>1&&middleGreat.scale<1.25); assert.equal(middleGreat.alpha,middleForeground.alpha); assert.equal(missForeground.alpha,middleForeground.alpha); assert.equal(feedback.missMiddle.commands.some((entry)=>entry.iconId==="feedback.great"),false);
    assert.ok(feedback.hitStart.energy>feedback.hitMiddle.energy&&feedback.hitMiddle.energy>0&&feedback.missMiddle.energy>0,`${viewport} DPR${requestedDpr} hit/miss fades must reduce framebuffer energy`); assert.equal(feedback.hitEnd.energy,0); assert.equal(feedback.missEnd.energy,0);
    feedbackPixelEvidence.push({viewport,requestedDpr,effectiveDpr:feedback.effectiveDpr,hitStart:feedback.hitStart.changed,hitMiddle:feedback.hitMiddle.changed,missMiddle:feedback.missMiddle.changed});
  }
  assert.equal(feedbackPixelEvidence.length,4);
  console.log("Flow semantic icon/outline/ring/GREAT/miss framebuffer validation passed for requested DPR1/3 portrait/landscape.");

  const lanePixelEvidence=[];
  for(const [viewport,width,height] of [["portrait",390,844],["landscape",844,390]]) for(const requestedDpr of [1,3]){
    const lanes=await page.evaluate(({width,height,requestedDpr})=>{
      const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];const canvas=document.querySelector("canvas");renderer.resetTuning();renderer.setTheme(null);renderer.resize({widthCssPx:width,heightCssPx:height,devicePixelRatio:requestedDpr});const gl=canvas.getContext("webgl2");
      const frame={presentation:"boxing_lanes",nowMs:1000,overlay:"none",timingWindowBeforeMs:180,timingWindowAfterMs:180,targets:[]};
      renderer.renderGameplayFrame({...frame,timingWindowBeforeMs:0,timingWindowAfterMs:0});const noBand=read();
      const bandResult=renderer.renderGameplayFrame(frame);const bandPixels=read();const band=bandResult.plan.commands.find((entry)=>entry.targetId===null&&entry.role==="neutral"&&entry.layer===1);if(!band)throw new Error("Boxing Lanes band is missing");
      const xSamples=[band.rect.x+band.rect.width*.1,band.rect.x+band.rect.width*.5,band.rect.x+band.rect.width*.9];const bandScans=xSamples.map((normalizedX)=>scanColumn(normalizedX,noBand,bandPixels));
      const cue={id:"lane-punch",kind:"punch",hand:"left",family:"straight",cell:null,cells:[],lane:"left",beatCenterMs:1000,judgement:"pending",feedbackProgress:0};
      const cueProbes=[
        cue,
        {...cue,id:"lane-squat",kind:"obstacle",hand:"neutral",family:"squat",lane:null},
        {...cue,id:"lane-weave-left",kind:"obstacle",hand:"neutral",family:"weave",lane:"left"},
        {...cue,id:"lane-weave-right",kind:"obstacle",hand:"neutral",family:"weave",lane:"right"}
      ].map(probeCue);
      const flow=renderer.renderGameplayFrame({presentation:"flow",nowMs:1000,targets:[{...cue,id:"flow-regression",kind:"flow",family:"flow",cell:5,lane:null,direction:"right"}]});
      const grid=renderer.renderGameplayFrame({presentation:"boxing_spatial_grid",nowMs:1000,blockedCells:[0],safeCells:[11],targets:[{...cue,id:"grid-regression",cell:5}]});
      const gridObstacle=renderer.renderGameplayFrame({presentation:"boxing_spatial_grid",nowMs:1000,targets:[{...cue,id:"grid-squat",kind:"obstacle",hand:"neutral",family:"squat",cell:null,cells:[5],lane:null}]});
      return{effectiveDpr:renderer.describe().devicePixelRatio,band,bandScans,backgrounds:bandResult.plan.commands.filter((entry)=>entry.layer===0).length,lines:bandResult.plan.commands.filter((entry)=>entry.kind==="line").length,cueProbes,flowRings:flow.plan.commands.filter((entry)=>entry.kind==="ring").length,gridReceptors:grid.plan.commands.filter((entry)=>entry.layer===0).length,gridRings:grid.plan.commands.filter((entry)=>entry.kind==="ring").length,gridHatches:grid.plan.commands.filter((entry)=>entry.kind==="hatch").length,gridObstacleKinds:gridObstacle.plan.commands.filter((entry)=>entry.targetId==="grid-squat").map((entry)=>({kind:entry.kind,hatch:entry.hatch})),drawingBufferHeight:gl.drawingBufferHeight};
      function probeCue(target){const result=renderer.renderGameplayFrame({...frame,targets:[target]});const pixels=read();const icons=result.plan.commands.filter((entry)=>entry.targetId===target.id&&entry.kind==="icon");if(icons.length===0)throw new Error(`Boxing Lanes ${target.id} icon is missing`);let iconChanged=0,outsideIconChanged=0,sumX=0,sumY=0;for(let y=0;y<gl.drawingBufferHeight;y+=1)for(let x=0;x<gl.drawingBufferWidth;x+=1){const offset=(y*gl.drawingBufferWidth+x)*4;if(delta(pixels,bandPixels,offset)<=3)continue;const nx=(x+.5)/gl.drawingBufferWidth;const ny=1-(y+.5)/gl.drawingBufferHeight;if(icons.some((icon)=>nx>=icon.rect.x&&nx<=icon.rect.x+icon.rect.width&&ny>=icon.rect.y&&ny<=icon.rect.y+icon.rect.height)){iconChanged+=1;sumX+=nx;sumY+=ny;}else outsideIconChanged+=1;}return{id:target.id,icons,iconChanged,outsideIconChanged,iconCentroidX:iconChanged?sumX/iconChanged:null,iconCentroidY:iconChanged?sumY/iconChanged:null,rings:result.plan.commands.filter((entry)=>entry.kind==="ring").length,hatches:result.plan.commands.filter((entry)=>entry.kind==="hatch"||entry.hatch).length};}
      function read(){const output=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output);return output;}
      function delta(a,b,offset){return Math.max(Math.abs(a[offset]-b[offset]),Math.abs(a[offset+1]-b[offset+1]),Math.abs(a[offset+2]-b[offset+2]));}
      function scanColumn(normalizedX,before,after){const x=Math.max(0,Math.min(gl.drawingBufferWidth-1,Math.floor(normalizedX*gl.drawingBufferWidth)));let count=0,minTop=Infinity,maxTop=-Infinity,sumTop=0,maxDelta=0;for(let y=0;y<gl.drawingBufferHeight;y+=1){const offset=(y*gl.drawingBufferWidth+x)*4;const difference=delta(before,after,offset);if(difference<=3)continue;const top=1-(y+.5)/gl.drawingBufferHeight;count+=1;minTop=Math.min(minTop,top);maxTop=Math.max(maxTop,top);sumTop+=top;maxDelta=Math.max(maxDelta,difference);}return{count,minTop,maxTop,centroidTop:count?sumTop/count:null,maxDelta};}
    },{width,height,requestedDpr});
    const firstLaneIcon=lanes.cueProbes[0].icons[0];assert.equal(lanes.effectiveDpr,Math.min(requestedDpr,2));assert.equal(lanes.backgrounds,2);assert.equal(lanes.lines,0);assert.equal(lanes.band.alpha,.22);assert.ok(lanes.band.rect.width>firstLaneIcon.rect.width*2,`${viewport} DPR${requestedDpr} band must span both lanes and gap`);
    for(const scan of lanes.bandScans){assert.ok(scan.count>0&&scan.maxDelta>3&&scan.maxDelta<100,`${viewport} DPR${requestedDpr} shared band must be visibly semi-transparent: ${JSON.stringify(scan)}`);assert.ok(Math.abs(scan.centroidTop-(lanes.band.rect.y+lanes.band.rect.height/2))*lanes.drawingBufferHeight<1.5,`${viewport} DPR${requestedDpr} band centroid mismatch`);assert.ok(scan.maxTop<=lanes.band.rect.y+lanes.band.rect.height+2/lanes.drawingBufferHeight&&scan.minTop>=lanes.band.rect.y-2/lanes.drawingBufferHeight,`${viewport} DPR${requestedDpr} band bounds mismatch`);}
    const expectedLanePixels={"lane-punch":["boxing.straight.left"],"lane-squat":["boxing.squat","boxing.squat"],"lane-weave-left":["boxing.weave.left"],"lane-weave-right":["boxing.weave.right"]};
    for(const probe of lanes.cueProbes){assert.deepEqual(probe.icons.map((entry)=>entry.iconId),expectedLanePixels[probe.id],`${viewport} DPR${requestedDpr} ${probe.id} canonical icons`);assert.ok(probe.icons.every((entry)=>entry.kind==="icon"&&entry.hatch===false));assert.ok(probe.iconChanged>20,`${viewport} DPR${requestedDpr} ${probe.id} canonical icon must draw`);assert.equal(probe.outsideIconChanged,0,`${viewport} DPR${requestedDpr} ${probe.id} must emit no approach-ring/hatch pixels`);assert.equal(probe.rings,0);assert.equal(probe.hatches,0);const minX=Math.min(...probe.icons.map((entry)=>entry.rect.x)),maxX=Math.max(...probe.icons.map((entry)=>entry.rect.x+entry.rect.width)),minY=Math.min(...probe.icons.map((entry)=>entry.rect.y)),maxY=Math.max(...probe.icons.map((entry)=>entry.rect.y+entry.rect.height));assert.ok(probe.iconCentroidX>=minX&&probe.iconCentroidX<=maxX&&probe.iconCentroidY>=minY&&probe.iconCentroidY<=maxY);}
    assert.equal(lanes.flowRings,1,`${viewport} DPR${requestedDpr} Flow ring regression`);assert.equal(lanes.gridReceptors,12);assert.equal(lanes.gridRings,1);assert.equal(lanes.gridHatches,2,`${viewport} DPR${requestedDpr} Boxing Grid hatches regression`);assert.deepEqual(lanes.gridObstacleKinds,[{kind:"hatch",hatch:true},{kind:"ring",hatch:false}],`${viewport} DPR${requestedDpr} Boxing Grid obstacle retains its hatch and approach ring`);lanePixelEvidence.push({viewport,requestedDpr,...lanes});
  }
  assert.equal(lanePixelEvidence.length,4);
  console.log("Boxing Lanes shared band/punch/squat/weave icon/no-ring/no-hatch framebuffer validation passed for DPR1/3 portrait/landscape; Flow/Grid regressions retained.");

  const cursorPixelEvidence = [];
  for (const [viewport,width,height] of [["portrait",390,844],["landscape",844,390]]) for (const requestedDpr of [1,3]) {
    const cursorPixels = await page.evaluate(({ width,height,requestedDpr }) => {
      const test = globalThis.__AERO_RENDERER_TEST__; const renderer = test.renderers[0]; const canvas = document.querySelector("canvas");
      renderer.resize({ widthCssPx:width,heightCssPx:height,devicePixelRatio:requestedDpr });
      const gl = canvas.getContext("webgl2");
      const plan = renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[] }).plan;
      const grid = plan.grid;
      const cursors = [
        { role:"nose",x:0.5,y:0.22,confidence:0.95 },
        { role:"left_wrist",x:0.2,y:0.72,confidence:0.9 },
        { role:"right_wrist",x:0.8,y:0.72,confidence:0.9 }
      ];
      const backgrounds = [[0,0,0,1],[1,1,1,1]].map((background) => {
        renderer.clear({ color:background }); const baseline = readPixels();
        renderer.clear({ color:background }); const result = renderer.renderGameplayCursors(cursors, { grid,sizeCssPx:18,minConfidence:0.5 }); const actual = readPixels();
        return { background:background[0] === 0 ? "black" : "white",cursorCount:result.cursorCount,roles:result.roles,probes:cursors.map((cursor) => probeCursor(cursor,baseline,actual,grid,renderer.describe().devicePixelRatio)) };
      });
      renderer.clear({ color:[0,0,0,1] }); const lowBaseline = readPixels();
      const lowResult = renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:0.49 }], { grid,minConfidence:0.5 }); const lowActual = readPixels();
      const lowChanged = changedCount(lowBaseline,lowActual);
      const gameplay = renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[] });
      const centerX = Math.round((gameplay.plan.grid.x + gameplay.plan.grid.width * 0.5) * gl.drawingBufferWidth);
      const centerY = Math.round((1 - gameplay.plan.grid.y - gameplay.plan.grid.height * 0.5) * gl.drawingBufferHeight);
      const beforeTopmost = sample(centerX,centerY);
      renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:gameplay.plan.grid });
      const afterTopmost = sample(centerX,centerY);
      renderer.clear({ color:[0,0,0,1] }); const movementBaseline = readPixels();
      renderer.clear({ color:[0,0,0,1] }); renderer.renderGameplayCursors([{ role:"nose",x:0.2,y:0.5,confidence:1 }], { grid }); const movementLeft = probeCursor({ role:"nose",x:0.2,y:0.5,confidence:1 },movementBaseline,readPixels(),grid,renderer.describe().devicePixelRatio);
      renderer.clear({ color:[0,0,0,1] }); renderer.renderGameplayCursors([{ role:"nose",x:0.8,y:0.5,confidence:1 }], { grid }); const movementRight = probeCursor({ role:"nose",x:0.8,y:0.5,confidence:1 },movementBaseline,readPixels(),grid,renderer.describe().devicePixelRatio);
      const firstDefault = renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[] }); const firstDefaultPixels = readPixels();
      const secondDefault = renderer.renderGameplayFrame({ presentation:"flow",nowMs:1000,overlay:"none",targets:[] }); const secondDefaultPixels = readPixels();
      return { requestedDpr,effectiveDpr:renderer.describe().devicePixelRatio,drawingBufferWidth:gl.drawingBufferWidth,drawingBufferHeight:gl.drawingBufferHeight,backgrounds,lowCursorCount:lowResult.cursorCount,lowChanged,topmostDelta:maxChannelDelta(beforeTopmost,afterTopmost),topmostCenter:afterTopmost,movementLeft,movementRight,defaultStable:changedCount(firstDefaultPixels,secondDefaultPixels) === 0,defaultDrawDelta:secondDefault.status.drawCount-firstDefault.status.drawCount,defaultExpectedDraws:secondDefault.plan.commands.length };
      function readPixels(){ const output=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4); gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,output); return output; }
      function sample(x,y){ const output=new Uint8Array(4); gl.readPixels(Math.max(0,Math.min(gl.drawingBufferWidth-1,x)),Math.max(0,Math.min(gl.drawingBufferHeight-1,y)),1,1,gl.RGBA,gl.UNSIGNED_BYTE,output); return [...output]; }
      function changedCount(before,after){ let count=0; for(let offset=0;offset<before.length;offset+=4) if(maxChannelDelta(before.subarray(offset,offset+3),after.subarray(offset,offset+3))>3) count+=1; return count; }
      function maxChannelDelta(before,after){ return Math.max(Math.abs(before[0]-after[0]),Math.abs(before[1]-after[1]),Math.abs(before[2]-after[2])); }
      function probeCursor(cursor,before,after,cursorGrid,effectiveDpr){
        const expectedX=(cursorGrid.x+cursor.x*cursorGrid.width)*gl.drawingBufferWidth; const expectedY=(1-cursorGrid.y-cursor.y*cursorGrid.height)*gl.drawingBufferHeight; const radius=Math.ceil(11*effectiveDpr);
        let count=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,sumX=0,sumY=0,maxLuminanceDelta=0;
        for(let y=Math.max(0,Math.floor(expectedY-radius));y<=Math.min(gl.drawingBufferHeight-1,Math.ceil(expectedY+radius));y+=1) for(let x=Math.max(0,Math.floor(expectedX-radius));x<=Math.min(gl.drawingBufferWidth-1,Math.ceil(expectedX+radius));x+=1){
          const offset=(y*gl.drawingBufferWidth+x)*4; const difference=maxChannelDelta(before.subarray(offset,offset+3),after.subarray(offset,offset+3)); if(difference<=3) continue;
          const beforeLuminance=before[offset]*0.2126+before[offset+1]*0.7152+before[offset+2]*0.0722; const afterLuminance=after[offset]*0.2126+after[offset+1]*0.7152+after[offset+2]*0.0722;
          count+=1;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sumX+=x+0.5;sumY+=y+0.5;maxLuminanceDelta=Math.max(maxLuminanceDelta,Math.abs(afterLuminance-beforeLuminance));
        }
        return { role:cursor.role,count,widthCss:count?(maxX-minX+1)/effectiveDpr:0,heightCss:count?(maxY-minY+1)/effectiveDpr:0,centroidX:count?sumX/count:null,centroidY:count?sumY/count:null,expectedX,expectedY,maxLuminanceDelta,center:sample(Math.round(expectedX),Math.round(expectedY)) };
      }
    }, { width,height,requestedDpr });
    assert.equal(cursorPixels.requestedDpr, requestedDpr);
    assert.equal(cursorPixels.effectiveDpr, Math.min(requestedDpr,2), `${viewport} renderer DPR cap must remain truthful`);
    assert.equal(cursorPixels.lowCursorCount, 0); assert.equal(cursorPixels.lowChanged, 0, `${viewport} DPR${requestedDpr} low confidence must draw no pixels`);
    assert.ok(cursorPixels.topmostDelta > 80, `${viewport} DPR${requestedDpr} cursors must be topmost over gameplay: ${JSON.stringify(cursorPixels)}`);
    assert.equal(cursorPixels.defaultStable, true, `${viewport} DPR${requestedDpr} default gameplay must remain byte-stable without cursor call`);
    assert.equal(cursorPixels.defaultDrawDelta, cursorPixels.defaultExpectedDraws, `${viewport} DPR${requestedDpr} cursor draws must retain no default gameplay state`);
    assert.ok(Math.abs((cursorPixels.movementRight.centroidX-cursorPixels.movementLeft.centroidX)-(cursorPixels.movementRight.expectedX-cursorPixels.movementLeft.expectedX))/cursorPixels.effectiveDpr < 1, `${viewport} DPR${requestedDpr} cursor movement must follow supplied grid X`);
    for (const background of cursorPixels.backgrounds) {
      assert.equal(background.cursorCount, 3); assert.deepEqual(background.roles, ["nose","left_wrist","right_wrist"]);
      assert.equal(new Set(background.probes.map((probe) => probe.center.slice(0,3).join(","))).size, 3, `${viewport} DPR${requestedDpr} ${background.background} role centers must remain distinct`);
      for (const probe of background.probes) {
        assert.ok(probe.widthCss >= 12 && probe.heightCss >= 12, `${viewport} DPR${requestedDpr} ${background.background} ${probe.role} must remain >=12 CSS px: ${JSON.stringify(probe)}`);
        assert.ok(probe.count / (cursorPixels.effectiveDpr ** 2) >= 70, `${viewport} DPR${requestedDpr} ${background.background} ${probe.role} visible area too small: ${JSON.stringify(probe)}`);
        assert.ok(Math.abs(probe.centroidX-probe.expectedX)/cursorPixels.effectiveDpr < 1 && Math.abs(probe.centroidY-probe.expectedY)/cursorPixels.effectiveDpr < 1, `${viewport} DPR${requestedDpr} ${background.background} ${probe.role} centroid drifted: ${JSON.stringify(probe)}`);
        assert.ok(probe.maxLuminanceDelta > 90, `${viewport} DPR${requestedDpr} ${background.background} ${probe.role} lacks contrast: ${JSON.stringify(probe)}`);
      }
    }
    cursorPixelEvidence.push({ viewport,...cursorPixels });
  }
  assert.equal(cursorPixelEvidence.length, 4);
  console.log("Gameplay cursor framebuffer validation passed for DPR1/3 portrait/landscape over black/white backgrounds.");
  await page.screenshot({ path:join(root, "screenshots/task8-renderer-flow.png"), fullPage:true });
  await page.evaluate(() => globalThis.__AERO_RENDERER_TEST__.resize());
  const resized = await page.evaluate(() => [...document.querySelectorAll("canvas")].map((entry) => ({ width: entry.width, height: entry.height })));
  assert.notEqual(resized[0].width, initial.sizes[0].width);
  const contextResult = await page.evaluate(async () => {
    const renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0];
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2"); const extension = gl.getExtension("WEBGL_lose_context");
    if (!extension) return { supported:false, state:renderer.describe().state };
    const cursor = [{ role:"nose",x:0.5,y:0.5,confidence:1 }]; const options = { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } };
    extension.loseContext(); await new Promise((resolve) => setTimeout(resolve, 40)); const lost = renderer.describe().state; const lostCursorCount = renderer.renderGameplayCursors(cursor,options).cursorCount;
    extension.restoreContext(); await new Promise((resolve) => setTimeout(resolve, 100)); const restoredCursorCount = renderer.renderGameplayCursors(cursor,options).cursorCount; return { supported:true,lost,lostCursorCount,restored:renderer.describe().state,restoredCursorCount,atlas:renderer.describe().iconAtlasReady };
  });
  if (contextResult.supported) { assert.equal(contextResult.lost, "context_lost"); assert.equal(contextResult.lostCursorCount, 0); assert.equal(contextResult.restored, "running"); assert.equal(contextResult.restoredCursorCount, 1); assert.equal(contextResult.atlas, true); }
  const terminalCursor = await page.evaluate(() => {
    const Renderer = globalThis.__AERO_RENDERER_TEST__.renderers[0].constructor; const canvas = document.createElement("canvas"); const renderer = new Renderer(); renderer.attach(canvas); renderer.resize({ widthCssPx:100,heightCssPx:100,devicePixelRatio:1 });
    const before = renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } }).cursorCount; renderer.destroy(); const after = renderer.renderGameplayCursors([{ role:"nose",x:0.5,y:0.5,confidence:1 }], { grid:{ x:0.1,y:0.1,width:0.8,height:0.8 } }).cursorCount; return { before,after,state:renderer.describe().state,attached:renderer.describe().attached };
  });
  assert.deepEqual(terminalCursor, { before:1,after:0,state:"destroyed",attached:false });
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
  }
  const signatures = results.map((entry) => `${entry.count}:${Math.round(Number(entry.centroidX) * 10000)}:${Math.round(Number(entry.centroidY) * 10000)}`);
  assert.equal(new Set(signatures).size, 8, `${viewport} each shader rotation must have a distinct pixel distribution: ${JSON.stringify(signatures)}`);
  const oppositePairs = [["up","down"],["up-right","down-left"],["right","left"],["down-right","up-left"]];
  for(const [first,second] of oppositePairs) assert.notEqual(signatures[results.findIndex((entry)=>entry.direction===first)],signatures[results.findIndex((entry)=>entry.direction===second)],`${viewport} ${first}/${second} rotations must differ`);
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
