// @ts-check
// Run from package root: node scripts/validate-shadow-receiver-browser.js
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile} from "node:fs/promises";
import {extname,join,normalize,resolve} from "node:path";
import {chromium} from "playwright";
import {createEquipmentConfigIdentity,createResolvedEquipmentPose,equipmentEulerDegreesToQuaternion,gloveObbGeometry,saberCapsuleGeometry} from "@aerobeat/web-contracts/equipment-pose-contracts";
import {isExpectedReadPixelsWarning} from "./browser-console-policy.js";

const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay"),output=resolve(root,"screenshots");
const aligned=(bounds)=>Math.abs(bounds.min.x+2)<1e-5&&Math.abs(bounds.max.x-2)<1e-5&&Math.abs(bounds.min.z+1.5)<1e-5&&Math.abs(bounds.max.z-1.5)<1e-5&&Math.abs(bounds.max.y-(-.87))<1e-5;
const identity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const equipment=(mode)=>createResolvedEquipmentPose({role:"left_wrist",mode,anchor:{x:1.5,y:.8,z:.35},scale:mode==="flow"?1.7:2.2,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:0}),geometryIdentity:mode==="flow"?saberCapsuleGeometry.identity:gloveObbGeometry.identity,configIdentity:identity});
// All three views aim at the floor center; negative PlayCanvas X pitch points downward.
const views=[
  {name:"top",position:{x:0,y:7,z:3.4},pitch:-64,fov:60},
  {name:"three-quarter",position:{x:0,y:3.6,z:5.7},pitch:-34,fov:56},
  {name:"side",position:{x:0,y:1.15,z:6.7},pitch:-14,fov:50}
];
const server=createServer(async(request,response)=>{try{const pathname=new URL(request.url??"/","http://127.0.0.1").pathname,brandingRelative=pathname.startsWith("/branding/")?pathname.slice(10):null,relative=pathname==="/"?".testbed/demo/index.html":pathname.slice(1),file=brandingRelative===null?normalize(join(root,relative)):normalize(join(brandingRoot,brandingRelative)),allowed=brandingRelative===null?root:brandingRoot;if(file!==allowed&&!file.startsWith(`${allowed}/`)){response.writeHead(403).end();return;}const content=await readFile(file),types={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"};response.writeHead(200,{"content-type":types[extname(file)]??"application/octet-stream","cache-control":"no-store"});response.end(content);}catch{response.writeHead(404).end();}});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw new Error("Browser fixture server failed");const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1}),noise=[];
  page.on("console",message=>{const type=message.type(),text=message.text(),location=message.location();if((type==="warning"||type==="error")&&!isExpectedReadPixelsWarning(type,text,location.url,location.lineNumber,location.columnNumber,url))noise.push(`${type}: ${text}`);});page.on("pageerror",error=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  // Keep fixture CSS and WebGL backing store in lockstep. A canvas element screenshot
  // composites underlying DOM if its backing pixels are transparent or CSS-clipped.
  const layout=await page.evaluate(()=>{const primary=document.querySelector("#primary"),canvas=primary?.querySelector("canvas"),secondary=document.querySelector("#secondary"),status=document.querySelector("#status"),main=document.querySelector("main");if(!primary||!canvas||!secondary||!status||!main)throw new Error("Fixture layout incomplete");secondary.style.display="none";status.style.display="none";main.style.cssText="display:block;padding:0;margin:0;width:960px;height:600px";primary.style.cssText="position:absolute;left:0;top:0;width:960px;height:600px;min-width:960px;min-height:600px;max-width:960px;max-height:600px;border:0;border-radius:0;overflow:hidden";canvas.style.cssText="position:absolute;left:0;top:0;width:960px;height:600px;display:block";const surface=primary.getBoundingClientRect(),rect=canvas.getBoundingClientRect();return{surface:{x:surface.x,y:surface.y,width:surface.width,height:surface.height},canvas:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},secondaryHidden:getComputedStyle(secondary).display==="none",statusHidden:getComputedStyle(status).display==="none"};});
  assert.deepEqual(layout,{surface:{x:0,y:0,width:960,height:600},canvas:{x:0,y:0,width:960,height:600},secondaryHidden:true,statusHidden:true},`Fixture CSS must expose precisely one complete canvas: ${JSON.stringify(layout)}`);
  await mkdir(output,{recursive:true});
  const result=await page.evaluate(async({views,flow,boxing})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");if(!(canvas instanceof HTMLCanvasElement))throw new Error("Renderer canvas absent");
    renderer.resize({widthCssPx:960,heightCssPx:600,devicePixelRatio:1});renderer.setEnvironmentVisible(false);renderer.setBackgroundProjection({kind:"solid",colors:["#080D16"],angleDeg:180});renderer.setDebugCameraEnabled(true);
    const floor=renderer.shadowFloorEntity;if(!floor?.render?.receiveShadows||!floor.enabled)throw new Error("Live receiving floor absent");
    const half=(v)=>({x:v.x/2,y:v.y/2,z:v.z/2}),position=floor.getPosition(),scale=floor.getLocalScale(),h=half(scale);
    const bounds={min:{x:position.x-h.x,y:position.y-h.y,z:position.z-h.z},max:{x:position.x+h.x,y:position.y+h.y,z:position.z+h.z}};
    floor.setLocalScale(scale.x,scale.y,2);const mutatedScale=floor.getLocalScale(),negativeBounds={min:{x:position.x-mutatedScale.x/2,y:position.y-mutatedScale.y/2,z:position.z-mutatedScale.z/2},max:{x:position.x+mutatedScale.x/2,y:position.y+mutatedScale.y/2,z:position.z+mutatedScale.z/2}};floor.setLocalScale(scale.x,scale.y,scale.z);
    const sample=()=>{const context=document.createElement("canvas");context.width=canvas.width;context.height=canvas.height;const ctx=context.getContext("2d",{willReadFrequently:true});ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const poseRecord=(view)=>({schema:"aerobeat/gameplay_camera_pose",version:1,coordinateSystem:{space:"playcanvas_world",handedness:"right_handed",worldUp:"+Y",cameraForward:"local_-Z",timelineFuture:"world_-Z"},position:view.position,rotationEulerDegrees:{xPitch:view.pitch,yYaw:0,zRoll:0},projection:{verticalFovDegrees:view.fov,nearClip:.1,farClip:80}});
    const rows=[];
    for(const view of views){await renderer.loadDebugCameraPose(poseRecord(view));
      const frame={presentation:"flow",nowMs:1000,targets:[],colliderSettings:{}};renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);const empty=sample();
      renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[flow],null);const saber=sample();floor.render.receiveShadows=false;renderer.manualTick();const saberWithoutShadow=sample();floor.render.receiveShadows=true;renderer.manualTick();
      renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,presentation:"boxing_spatial_grid"},[],null,[],null);const boxingEmpty=sample();
      renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,presentation:"boxing_spatial_grid"},[],null,[boxing],null);const glove=sample();floor.render.receiveShadows=false;renderer.manualTick();const gloveWithoutShadow=sample();floor.render.receiveShadows=true;renderer.manualTick();
      const camera=renderer.cameraEntity.camera,project=(world)=>{const p=camera.worldToScreen(world);return{x:p.x,y:p.y}},corners=[[-2,-1.5],[-2,1.5],[2,-1.5],[2,1.5]].map(([x,z])=>project({x,y:bounds.max.y,z}));
      const floorCenter=project({x:0,y:bounds.max.y,z:0}),near=project({x:0,y:bounds.max.y,z:1.5}),far=project({x:0,y:bounds.max.y,z:-1.5});
      const region=(image,base)=>{let changed=0,brightened=0,darkened=0,blue=0;const x0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.x)))),x1=Math.min(canvas.width-1,Math.ceil(Math.max(...corners.map(p=>p.x)))),y0=Math.max(0,Math.floor(Math.min(...corners.map(p=>p.y)))),y1=Math.min(canvas.height-1,Math.ceil(Math.max(...corners.map(p=>p.y))));for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=(y*canvas.width+x)*4,delta=(image[i]-base[i])+(image[i+1]-base[i+1])+(image[i+2]-base[i+2]);if(Math.abs(image[i]-base[i])+Math.abs(image[i+1]-base[i+1])+Math.abs(image[i+2]-base[i+2])>45){changed++;if(delta>25)brightened++;if(delta< -25)darkened++;}if(base[i+2]>base[i]+10&&base[i+2]>base[i+1]+3&&base[i+2]>35)blue++;}return{changed,brightened,darkened,blue,box:[x0,y0,x1,y1]};};
      const background=new Uint8Array(empty.length); // capture floor visibility against its actual background by temporarily hiding it
      floor.enabled=false;renderer.manualTick();background.set(sample());floor.enabled=true;renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
      rows.push({view:view.name,corners,floorCenter,near,far,floor:region(empty,background),saber:region(saber,empty),glove:region(glove,boxingEmpty),saberShadow:region(saber,saberWithoutShadow),gloveShadow:region(glove,gloveWithoutShadow),canvas:[canvas.width,canvas.height]});
    }
    return{bounds,negativeBounds,reference:{x:[-2,2],z:[-1.5,1.5],floorY:-.72},rows};
  },{views,flow:equipment("flow"),boxing:equipment("boxing")});
  console.log("Shadow receiver runtime geometry and framebuffer evidence",JSON.stringify(result));
  const {bounds,negativeBounds,rows}=result;assert.equal(aligned(negativeBounds),false,"Z=2 runtime mutation must fail the same full-playfield alignment oracle");assert.equal(negativeBounds.min.z,-1,"negative control must fail specifically because receiver Z stops at -1 rather than -1.5");assert.equal(aligned(bounds),true,"restored live receiver must cover canonical X/Z and sit below the glass track");
  for(const row of rows){assert.ok(row.corners.every(p=>p.x>4&&p.x<row.canvas[0]-4&&p.y>4&&p.y<row.canvas[1]-4),`${row.view}: all four floor corners must be inside canvas`);assert.ok(Math.abs(row.near.y-row.far.y)>8,`${row.view}: floor must occupy meaningful depth on screen`);assert.ok(row.floor.changed>120&&row.floor.blue>120,`${row.view}: rendered receiver must have real visible blue-toned pixels`);assert.ok(row.saberShadow.changed>100&&row.saberShadow.darkened>100&&row.gloveShadow.changed>1000&&row.gloveShadow.darkened>1000,`${row.view}: disabling receiver shadows must remove real saber and glove floor silhouettes`);}
  assert.deepEqual(noise,[],`Unexpected Chromium console diagnostics: ${noise.join("; ")}`);
  // Canvas-only capture rather than a screenshot of the surrounding testbed UI.
  for(const view of views)for(const mode of ["flow","boxing"]){await page.evaluate(async({view,mode,pose})=>{const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];await renderer.loadDebugCameraPose({schema:"aerobeat/gameplay_camera_pose",version:1,coordinateSystem:{space:"playcanvas_world",handedness:"right_handed",worldUp:"+Y",cameraForward:"local_-Z",timelineFuture:"world_-Z"},position:view.position,rotationEulerDegrees:{xPitch:view.pitch,yYaw:0,zRoll:0},projection:{verticalFovDegrees:view.fov,nearClip:.1,farClip:80}});renderer.renderGameplayFrameWithCursorsAndEquipment({presentation:mode==="flow"?"flow":"boxing_spatial_grid",nowMs:1000,targets:[],colliderSettings:{}},[],null,[pose],null);},{view,mode,pose:equipment(mode)});await page.locator("#primary canvas").screenshot({path:join(output,`shadow-receiver-${mode}-${view.name}.png`)});}
  console.log("Shadow receiver browser assertions passed; screenshots in",output);
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
