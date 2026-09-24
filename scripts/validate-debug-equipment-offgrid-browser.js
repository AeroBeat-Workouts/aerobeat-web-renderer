// @ts-check
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize,resolve} from "node:path";
import {chromium} from "playwright";
import {isExpectedReadPixelsWarning} from "./browser-console-policy.js";

const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay");
const server=createServer(async(request,response)=>{try{const pathname=new URL(request.url??"/","http://127.0.0.1").pathname,brandingRelative=pathname.startsWith("/branding/")?pathname.slice(10):null,relative=pathname==="/"?".testbed/demo/index.html":pathname.slice(1),file=brandingRelative===null?normalize(join(root,relative)):normalize(join(brandingRoot,brandingRelative)),allowed=brandingRelative===null?root:brandingRoot;if(file!==allowed&&!file.startsWith(`${allowed}/`)){response.writeHead(403).end();return;}const content=await readFile(file),types={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"};response.writeHead(200,{"content-type":types[extname(file)]??"application/octet-stream","cache-control":"no-store"});response.end(content);}catch{response.writeHead(404).end();}});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw new Error("Browser server failed");const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`,browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),noise=[];page.on("console",(message)=>{const type=message.type(),text=message.text(),location=message.location();if((type==="warning"||type==="error")&&!isExpectedReadPixelsWarning(type,text,location.url,location.lineNumber,location.columnNumber,url))noise.push(`${type}: ${text}`);});page.on("pageerror",(error)=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const evidence=await page.evaluate(async()=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas"),frame={presentation:"flow",nowMs:1000,targets:[]};if(!(canvas instanceof HTMLCanvasElement))throw new Error("Primary canvas missing");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setDebugCameraEnabled(true);renderer.renderGameplayFrame(frame);
    const camera=renderer.cameraEntity.camera,box=canvas.getBoundingClientRect(),device=renderer.app.graphicsDevice.clientRect;
    const toClient=(world)=>{const screen=camera.worldToScreen(world);return{x:box.left+screen.x/device.width*box.width,y:box.top+screen.y/device.height*box.height};};
    const project=(name,normalized)=>{const world={x:-2+4*normalized.x,y:2.5-3*normalized.y,z:.45},client=toClient(world),result=renderer.projectDebugEquipmentAnchor(client.x,client.y);return{name,normalized,world,client,result,inside:client.x>=box.left&&client.x<=box.right&&client.y>=box.top&&client.y<=box.bottom,immutable:Boolean(result&&Object.isFrozen(result))};};
    const defaultCenter=project("default-center",{x:.5,y:.5});
    await renderer.loadDebugCameraPose({schema:"aerobeat/gameplay_camera_pose",version:1,coordinateSystem:{space:"playcanvas_world",handedness:"right_handed",worldUp:"+Y",cameraForward:"local_-Z",timelineFuture:"world_-Z"},position:{x:.35,y:1.2,z:10},rotationEulerDegrees:{xPitch:-3,yYaw:5,zRoll:0},projection:{verticalFovDegrees:70,nearClip:.2,farClip:50}});renderer.renderGameplayFrame(frame);
    const cases=[project("left",{x:-.25,y:.5}),project("right",{x:1.25,y:.5}),project("top",{x:.5,y:-.25}),project("bottom",{x:.5,y:1.25}),project("top-left",{x:-.25,y:-.25}),project("top-right",{x:1.25,y:-.25}),project("bottom-left",{x:-.25,y:1.25}),project("bottom-right",{x:1.25,y:1.25})];
    const invalid={nonFinite:renderer.projectDebugEquipmentAnchor(NaN,box.top+box.height/2),outsideCanvas:renderer.projectDebugEquipmentAnchor(box.left-1,box.top+box.height/2),contextLost:null,inactive:null,outsideViewport:null,parallel:null,behind:null};
    renderer.contextLost=true;invalid.contextLost=renderer.projectDebugEquipmentAnchor(box.left+box.width/2,box.top+box.height/2);renderer.contextLost=false;renderer.state="error";invalid.inactive=renderer.projectDebugEquipmentAnchor(box.left+box.width/2,box.top+box.height/2);renderer.state="running";
    const Rect=camera.rect.constructor;camera.rect=new Rect(.2,.2,.6,.6);invalid.outsideViewport=renderer.projectDebugEquipmentAnchor(box.left+box.width*.1,box.top+box.height*.5);camera.rect=new Rect(0,0,1,1);
    const original=camera.screenToWorld;camera.screenToWorld=(x,y,d,out)=>out.set(0,1,d===camera.nearClip?1:1+1e-9);invalid.parallel=renderer.projectDebugEquipmentAnchor(box.left+box.width/2,box.top+box.height/2);camera.screenToWorld=(x,y,d,out)=>out.set(0,1,d===camera.nearClip?5:6);invalid.behind=renderer.projectDebugEquipmentAnchor(box.left+box.width/2,box.top+box.height/2);camera.screenToWorld=original;
    return{defaultCenter,cases,invalid};
  });
  assert.deepEqual(noise,[]);assert.ok(evidence.defaultCenter.result&&Math.abs(evidence.defaultCenter.result.x-.5)<1e-5&&Math.abs(evidence.defaultCenter.result.y-.5)<1e-5,"default camera center round-trip must remain exact");
  for(const row of evidence.cases){assert.equal(row.inside,true,`${row.name} test ray must originate inside the canvas viewport`);assert.ok(row.result,`${row.name} finite off-grid projection must be preserved`);assert.ok(Math.abs(row.result.x-row.normalized.x)<1e-5&&Math.abs(row.result.y-row.normalized.y)<1e-5,`${row.name} projection must remain exact and unclamped: ${JSON.stringify(row)}`);assert.equal(row.immutable,true);}
  assert.deepEqual(evidence.invalid,{nonFinite:null,outsideCanvas:null,contextLost:null,inactive:null,outsideViewport:null,parallel:null,behind:null});
  console.log("Off-grid debug equipment projection evidence",JSON.stringify(evidence));console.log("Moved-camera four-side/corner and invalid projection browser validation passed.");
}finally{await browser.close();await new Promise((done)=>server.close(done));}
