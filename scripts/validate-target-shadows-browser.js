// @ts-check
// Project-owned native GLB target shadow oracle. Run from repository root.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile} from "node:fs/promises";
import {extname,join,normalize,resolve} from "node:path";
import {chromium} from "playwright";
import {buildGameplaySceneModel} from "../src/gameplay-scene-model.js";
import {isExpectedReadPixelsWarning} from "./browser-console-policy.js";

const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay"),output=resolve(root,"screenshots");
const views=[
  {name:"top",position:{x:0,y:7,z:3.4},pitch:-64,fov:60},
  {name:"three-quarter",position:{x:0,y:3.6,z:5.7},pitch:-34,fov:56},
  {name:"side",position:{x:0,y:1.15,z:6.7},pitch:-14,fov:50}
];
const geometry={schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:1,y:0,width:1,height:3};
const wall={id:"target-wall",kind:"obstacle",hand:"neutral",family:"obstacle",cell:null,cells:[1,5,9],gameplayGeometry:geometry,lane:null,beatCenterMs:1100,intervalStartMs:1070,intervalEndMs:1250};
const cases=[
  {name:"flow-note",presentation:"flow",target:{id:"target-note",kind:"flow",hand:"left",family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1100,direction:"right"},count:1},
  {name:"boxing-punch",presentation:"boxing_spatial_grid",target:{id:"target-punch",kind:"punch",hand:"left",family:"straight",cell:5,cells:[],lane:"left",beatCenterMs:1100},count:1},
  {name:"boxing-guard",presentation:"boxing_spatial_grid",target:{id:"target-guard",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[5,6],lane:null,beatCenterMs:1100},count:2},
  {name:"flow-bomb",presentation:"flow",target:{id:"target-bomb",kind:"bomb",hand:"neutral",family:"bomb",cell:5,cells:[],lane:null,beatCenterMs:1100},count:1},
  {name:"flow-wall",presentation:"flow",target:wall,count:1},
  {name:"boxing-wall",presentation:"boxing_spatial_grid",target:{...wall,id:"target-boxing-wall",family:"squat"},count:1},
  {name:"boxing-lanes-weave-wall",presentation:"boxing_lanes",target:{...wall,id:"target-lanes-weave-wall",family:"weave",cells:[0,4,8],gameplayGeometry:{...geometry,x:0}},count:1},
  {name:"boxing-lanes-squat-wall",presentation:"boxing_lanes",target:{...wall,id:"target-lanes-squat-wall",family:"squat",cells:[0,1,2,3],gameplayGeometry:{...geometry,x:0,width:4,height:1}},count:1},
  {name:"flow-right-wall",presentation:"flow",target:{...wall,id:"target-right-wall",cells:[3,7,11],gameplayGeometry:{...geometry,x:3}},count:1},
  {name:"flow-paired-walls",presentation:"flow",targets:[{...wall,id:"target-left-wall",cells:[0,4,8],gameplayGeometry:{...geometry,x:0}},{...wall,id:"target-paired-right-wall",cells:[3,7,11],gameplayGeometry:{...geometry,x:3}}],count:2}
];
const server=createServer(async(request,response)=>{try{const pathname=new URL(request.url??"/","http://127.0.0.1").pathname,brandingRelative=pathname.startsWith("/branding/")?pathname.slice(10):null,relative=pathname==="/"?".testbed/demo/index.html":pathname.slice(1),allowed=brandingRelative===null?root:brandingRoot,file=brandingRelative===null?normalize(join(root,relative)):normalize(join(brandingRoot,brandingRelative));if(file!==allowed&&!file.startsWith(`${allowed}/`)){response.writeHead(403).end();return;}const content=await readFile(file),types={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"};response.writeHead(200,{"content-type":types[extname(file)]??"application/octet-stream","cache-control":"no-store"});response.end(content);}catch{response.writeHead(404).end();}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw new Error("Target shadow fixture server failed");const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1}),noise=[];
  page.on("console",message=>{const type=message.type(),text=message.text(),location=message.location();if((type==="warning"||type==="error")&&!isExpectedReadPixelsWarning(type,text,location.url,location.lineNumber,location.columnNumber,url))noise.push(`${type}: ${text}`);});page.on("pageerror",error=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const layout=await page.evaluate(()=>{const primary=document.querySelector("#primary"),canvas=primary?.querySelector("canvas"),secondary=document.querySelector("#secondary"),status=document.querySelector("#status"),main=document.querySelector("main");if(!primary||!canvas||!secondary||!status||!main)throw new Error("Fixture layout incomplete");secondary.style.display="none";status.style.display="none";main.style.cssText="display:block;padding:0;margin:0;width:960px;height:600px";primary.style.cssText="position:absolute;left:0;top:0;width:960px;height:600px;min-width:960px;min-height:600px;max-width:960px;max-height:600px;border:0;border-radius:0;overflow:hidden";canvas.style.cssText="position:absolute;left:0;top:0;width:960px;height:600px;display:block";const rect=canvas.getBoundingClientRect();return{x:rect.x,y:rect.y,width:rect.width,height:rect.height};});assert.deepEqual(layout,{x:0,y:0,width:960,height:600});
  for(const spec of cases){const model=buildGameplaySceneModel({presentation:spec.presentation,nowMs:1000,colliderSettings:{},timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:spec.targets??[spec.target]});const objects=model.objects.filter(object=>(spec.targets??[spec.target]).some(target=>target.id===object.targetId)&&["icon","obstacle"].includes(object.kind));assert.equal(objects.length,spec.count,`${spec.name}: expected actual target GLB instances`);assert.ok(objects.every(object=>typeof object.assetId==="string"),`${spec.name}: expected loaded GLB asset IDs`);}
  await mkdir(output,{recursive:true});
  const rows=[];
  for(const view of views)for(const spec of cases){
    const row=await page.evaluate(async({view,spec})=>{
      const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");if(!(canvas instanceof HTMLCanvasElement))throw new Error("No actual canvas");renderer.resize({widthCssPx:960,heightCssPx:600,devicePixelRatio:1});renderer.setEnvironmentVisible(false);renderer.setBackgroundProjection({kind:"solid",colors:["#080D16"],angleDeg:180});renderer.setDebugCameraEnabled(true);
      await renderer.loadDebugCameraPose({schema:"aerobeat/gameplay_camera_pose",version:1,coordinateSystem:{space:"playcanvas_world",handedness:"right_handed",worldUp:"+Y",cameraForward:"local_-Z",timelineFuture:"world_-Z"},position:view.position,rotationEulerDegrees:{xPitch:view.pitch,yYaw:0,zRoll:0},projection:{verticalFovDegrees:view.fov,nearClip:.1,farClip:80}});
      const frame={presentation:spec.presentation,nowMs:1000,colliderSettings:{},timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:spec.targets??[spec.target]};renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
      const floor=renderer.shadowFloorEntity;if(!floor?.render?.receiveShadows||!floor.enabled)throw new Error("No receiving shadow floor");if(renderer.describe().gameplayAssets.state!=="ready")throw new Error("Gameplay GLBs not ready");const light=renderer.shadowLightEntity?.light;if(!light||light.shadowResolution!==2048||Math.abs(light.shadowIntensity-.4)>1e-5)throw new Error("Shadow light must retain the existing 2048 map and 40% strength");
      const model=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null).model,objects=model.objects.filter(object=>(spec.targets??[spec.target]).some(target=>target.id===object.targetId)&&["icon","obstacle"].includes(object.kind));
      const entities=[...renderer.assetPools.values()].flat().filter(entity=>entity.enabled&&objects.some(object=>object.id===entity.name));const noncasterEntities=[...renderer.aftermathAssetPools.values()].flat().filter(entity=>entity.enabled);
      const meshes=entities.flatMap(entity=>entity.findComponents("render").flatMap(render=>render.meshInstances));
      const track=[...renderer.assetPools.get("track/blue-glass-v1")??[]].flatMap(entity=>entity.findComponents("render").flatMap(render=>render.meshInstances));const noncasterFlags=noncasterEntities.flatMap(entity=>entity.findComponents("render").flatMap(render=>render.meshInstances.map(mesh=>mesh.castShadow)));
      const sample=()=>{const copy=document.createElement("canvas");copy.width=canvas.width;copy.height=canvas.height;const context=copy.getContext("2d",{willReadFrequently:true});context.drawImage(canvas,0,0);return context.getImageData(0,0,copy.width,copy.height).data;};
      const on=sample(),flags=meshes.map(mesh=>mesh.castShadow);for(const mesh of meshes)mesh.castShadow=false;renderer.manualTick();const castOff=sample();for(let i=0;i<meshes.length;i++)meshes[i].castShadow=flags[i];floor.render.receiveShadows=false;renderer.manualTick();const receiverOff=sample();floor.render.receiveShadows=true;renderer.manualTick();
      // An empty frame must leave an unshadowed receiver pixel-identical to no
      // receiver, and the testbed's initial equipment must not remain pooled on.
      const emptyFrame={...frame,targets:[]};renderer.renderGameplayFrameWithCursorsAndEquipment(emptyFrame,[],null,[],null);const empty=sample();floor.enabled=false;renderer.manualTick();const emptyWithoutReceiver=sample();floor.enabled=true;renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
      let emptyDelta=0;for(let i=0;i<empty.length;i+=4)emptyDelta=Math.max(emptyDelta,Math.abs(empty[i]-emptyWithoutReceiver[i]),Math.abs(empty[i+1]-emptyWithoutReceiver[i+1]),Math.abs(empty[i+2]-emptyWithoutReceiver[i+2]));
      // The actual canvas's target-free frame must visibly differ from the
      // target frame; otherwise a valid-sized blank capture could pass.
      let targetPixels=0;for(let i=0;i<on.length;i+=4)if(Math.abs(on[i]-empty[i])+Math.abs(on[i+1]-empty[i+1])+Math.abs(on[i+2]-empty[i+2])>70)targetPixels++;
      // Ignore the translucent wall body and target silhouette: only compare pixels
      // below the subject's projected AABB and inside the known floor footprint.
      const camera=renderer.cameraEntity.camera,project=(point)=>camera.worldToScreen(point),bounds=objects.map(object=>{const p=object.position,s=object.scale;return[-1,1].flatMap(dx=>[-1,1].flatMap(dy=>[-1,1].map(dz=>project({x:p.x+dx*s.x*.47,y:p.y+dy*s.y*.47,z:p.z+dz*s.z*.5}))));});
      const silhouette=bounds.flat(),minX=Math.min(...silhouette.map(p=>p.x)),maxX=Math.max(...silhouette.map(p=>p.x)),minY=Math.min(...silhouette.map(p=>p.y)),maxY=Math.max(...silhouette.map(p=>p.y));
      const floorY=-.87,floorPoints=objects.flatMap(object=>[-1,1].flatMap(dx=>[-1,1].map(dz=>project({x:object.position.x+dx*1.5,y:floorY,z:object.position.z+dz*2.5}))));const left=Math.max(0,Math.floor(Math.min(...floorPoints.map(p=>p.x)))),right=Math.min(canvas.width-1,Math.ceil(Math.max(...floorPoints.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...floorPoints.map(p=>p.y)))),bottom=Math.min(canvas.height-1,Math.ceil(Math.max(...floorPoints.map(p=>p.y))));
      const delta=(against)=>{let changed=0,darkened=0,max=0;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){if(x>=minX-3&&x<=maxX+3&&y>=minY-3&&y<=maxY+3)continue;const i=(y*canvas.width+x)*4,dr=on[i]-against[i],dg=on[i+1]-against[i+1],db=on[i+2]-against[i+2],distance=Math.abs(dr)+Math.abs(dg)+Math.abs(db);max=Math.max(max,Math.abs(dr),Math.abs(dg),Math.abs(db));if(distance>24){changed++;if(dr+dg+db< -24)darkened++;}}return{changed,darkened,max,region:[left,top,right,bottom],silhouette:[minX,minY,maxX,maxY]};};
      const castDelta=delta(castOff),receiverDelta=delta(receiverOff);return{view:view.name,case:spec.name,assetState:renderer.describe().gameplayAssets.state,objects:objects.map(object=>({kind:object.kind,assetId:object.assetId,id:object.id})),fakeCount:model.objects.filter(object=>object.kind==="shadow").length,emptyDelta,targetPixels,flags,meshCount:meshes.length,trackFlags:track.map(mesh=>mesh.castShadow),noncasterFlags,castDelta,receiverDelta,canvas:[canvas.width,canvas.height],shot:canvas.toDataURL("image/png")};
    },{view,spec});
    const {shot,...evidence}=row;const bytes=Buffer.from(shot.split(",")[1],"base64");assert.ok(bytes.length>10000,`${spec.name}/${view.name}: refusing empty screenshot`);await page.evaluate(data=>{const canvas=document.querySelector("#primary canvas");if(!canvas||canvas.width!==data[0]||canvas.height!==data[1])throw new Error("Screenshot does not match actual GL framebuffer");},row.canvas);await page.locator("#primary canvas").screenshot({path:join(output,`target-shadow-${spec.name}-${view.name}.png`)});rows.push(evidence);
    console.log("Target shadow framebuffer",JSON.stringify(evidence));
  }
  assert.deepEqual(noise,[],`Unexpected Chromium console diagnostics: ${noise.join("; ")}`);
  for(const row of rows){assert.deepEqual(row.canvas,[960,600],`${row.case}/${row.view}: real viewport`);assert.equal(row.assetState,"ready",`${row.case}/${row.view}: fallback is not proof`);assert.equal(row.fakeCount,0,`${row.case}/${row.view}: forbidden fake primitive`);assert.equal(row.emptyDelta,0,`${row.case}/${row.view}: empty frame must have no receiver shadow, including residual fixture equipment`);assert.ok(row.targetPixels>80,`${row.case}/${row.view}: target must be visibly present in the captured canvas`);assert.ok(row.meshCount>0&&row.flags.every(Boolean),`${row.case}/${row.view}: every live GLB mesh must cast`);assert.ok(row.trackFlags.length>0&&row.trackFlags.every(flag=>!flag),`${row.case}/${row.view}: glass track must never cast`);assert.ok(row.noncasterFlags.every(flag=>!flag),`${row.case}/${row.view}: aftermath must never cast`);assert.ok(row.castDelta.changed>12&&row.castDelta.darkened>8,`${row.case}/${row.view}: turning off GLB casting must lighten the receiver outside object silhouette: ${JSON.stringify(row.castDelta)}`);assert.ok(row.receiverDelta.changed>12&&row.receiverDelta.darkened>8,`${row.case}/${row.view}: turning off receiving must lighten the receiver outside object silhouette: ${JSON.stringify(row.receiverDelta)}`);}
  for(const view of views){const row=(name)=>rows.find(entry=>entry.case===name&&entry.view===view.name);const left=row("boxing-lanes-weave-wall"),right=row("flow-right-wall"),paired=row("flow-paired-walls");assert.ok(left&&right&&paired&&paired.meshCount>=2&&paired.castDelta.darkened>=(left.castDelta.darkened+right.castDelta.darkened)*.75,`${view.name}: paired walls must cast from BOTH authored sides, not just one`);}
  console.log(`Target GLB shadow assertions passed: ${rows.length} Chromium framebuffer states; screenshots in ${output}`);
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
