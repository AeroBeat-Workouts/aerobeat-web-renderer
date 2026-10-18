// @ts-check
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay");
const server=createServer(async(request,response)=>{
  try{
    const pathname=new URL(request.url??"/","http://127.0.0.1").pathname;
    const branded=pathname.startsWith("/branding/");
    const base=branded?brandingRoot:root;
    const relative=branded?pathname.slice(10):pathname.slice(1);
    const file=normalize(join(base,relative));
    if(file!==base&&!file.startsWith(`${base}/`)){response.writeHead(403).end();return;}
    const data=await readFile(file);
    response.writeHead(200,{"content-type":({".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"})[extname(file)]??"application/octet-stream","cache-control":"no-store"});response.end(data);
  }catch{response.writeHead(404).end();}
});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));
const address=server.address();if(!address||typeof address==="string")throw new Error("Browser server failed");
const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`;
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),noise=[];
  page.on("console",(message)=>{const {url:sourceUrl,lineNumber,columnNumber}=message.location(),type=message.type(),text=message.text();if(["warning","error"].includes(type)&&!isExpectedReadPixelsWarning(type,text,sourceUrl,lineNumber,columnNumber,url))noise.push(`${type}: ${text}`);});
  page.on("pageerror",(error)=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
  const up={role:"left_wrist",mode:"flow",anchor:{x:1.5,y:1,z:.45},scale:1,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:90}),geometryIdentity:saberCapsuleGeometry.identity,configIdentity};
  const down={...up,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:-90})};
  const diagonal={...up,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:45})};
  const evidence=await page.evaluate(({up,down,diagonal})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({kind:"solid",colors:["#102030"],angleDeg:180});
    const settings={colliderVisible:true,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:0};
    const frame={presentation:"flow",nowMs:1000,targets:[],colliderSettings:settings,equipmentColliderPoses:[]};
    const pixels=()=>{const buffer=new OffscreenCanvas(canvas.width,canvas.height),context=buffer.getContext("2d",{willReadFrequently:true});context.drawImage(canvas,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
    const delta=(current,previous)=>{const points=[];for(let pixel=0;pixel<current.length;pixel+=4){const shift=Math.abs(current[pixel]-previous[pixel])+Math.abs(current[pixel+1]-previous[pixel+1])+Math.abs(current[pixel+2]-previous[pixel+2]);if(shift>9)points.push(pixel/4);}const ys=points.map((point)=>Math.floor(point/canvas.width));return{count:points.length,minY:Math.min(...ys),maxY:Math.max(...ys)};};
    const silhouette=(current,previous)=>{
      const points=[];
      for(let offset=0;offset<current.length;offset+=4){
        const difference=Math.abs(current[offset]-previous[offset])+Math.abs(current[offset+1]-previous[offset+1])+Math.abs(current[offset+2]-previous[offset+2]);
        if(difference>12)points.push({x:(offset/4)%canvas.width,y:Math.floor(offset/4/canvas.width)});
      }
      return points;
    };
    const meshVertices=(entity)=>{
      const mesh=entity.render.meshInstances[0].mesh,buffer=mesh.vertexBuffer;
      const element=buffer.format.elements.find((element)=>element.name==="POSITION");
      const view=new DataView(buffer.lock()),stride=buffer.format.size,vertices=[];
      for(let index=0;index<buffer.numVertices;index++){
        const offset=index*stride+element.offset;
        const local={x:view.getFloat32(offset,true),y:view.getFloat32(offset+4,true),z:view.getFloat32(offset+8,true)};
        const world=entity.getWorldTransform().transformPoint(new (entity.getPosition().constructor)(local.x,local.y,local.z));
        vertices.push({x:world.x,y:world.y,z:world.z});
      }
      buffer.unlock();return vertices;
    };
    renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);const base=pixels(),rows=[];
    for(const [name,pose] of [["up",up],["down",down],["diagonal",diagonal]]){
      const model=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[pose]},[],null,[],null).model;
      const entity=(renderer.flowColliderCapsulePool??[])[0];
      const capsule=model.objects.find((object)=>object.kind==="collider_volume")?.capsule;
      const vertices=meshVertices(entity),axis={x:(capsule.end.x-capsule.start.x)/.75,y:(capsule.end.y-capsule.start.y)/.75,z:(capsule.end.z-capsule.start.z)/.75};
      const coordinate=(point)=>point.x*axis.x+point.y*axis.y+point.z*axis.z;
      const meshAxis=[Math.min(...vertices.map(coordinate)),Math.max(...vertices.map(coordinate))];
      const meshRadius=Math.max(...vertices.map((point)=>{const axial=coordinate(point)-coordinate(capsule.start),center={x:capsule.start.x+axial*axis.x,y:capsule.start.y+axial*axis.y,z:capsule.start.z+axial*axis.z};return Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z);}));
      const image=pixels(),points=silhouette(image,base);
      const camera=renderer.cameraEntity.camera;
      const project=(point)=>{const p=camera.worldToScreen(new (entity.getPosition().constructor)(point.x,point.y,point.z));return{x:p.x,y:p.y};};
      const near=project(capsule.start),far=project(capsule.end),axisScreen={x:far.x-near.x,y:far.y-near.y},span=Math.hypot(axisScreen.x,axisScreen.y),unit={x:axisScreen.x/span,y:axisScreen.y/span};
      const projected=points.map((point)=>(point.x-near.x)*unit.x+(point.y-near.y)*unit.y);
      const radiusProbe=project({x:capsule.start.x+capsule.radius,y:capsule.start.y,z:capsule.start.z});
      const screenRadius=Math.hypot(radiusProbe.x-near.x,radiusProbe.y-near.y);
      rows.push({name,capsule,entityEnabled:entity?.enabled??false,material:{depthTest:entity?.render?.meshInstances?.[0]?.material?.depthTest,depthWrite:entity?.render?.meshInstances?.[0]?.material?.depthWrite,opacity:entity?.render?.meshInstances?.[0]?.material?.opacity},pixels:delta(image,base),silhouette:{min:Math.min(...projected),max:Math.max(...projected),span,radius:screenRadius,count:points.length},meshAxis,expectedMeshAxis:[coordinate(capsule.start)-capsule.radius,coordinate(capsule.end)+capsule.radius],meshRadius,pool:(renderer.flowColliderCapsulePool??[]).length});
    }
    const held=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[down]},[],null,[],null).model.objects.find((object)=>object.kind==="collider_volume")?.capsule;
    const missing=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null).model.objects.filter((object)=>object.kind==="collider_volume").length;
    const lostPixels=delta(pixels(),base),enabled=(renderer.flowColliderCapsulePool??[]).some((entity)=>entity.enabled);
    renderer.destroyColliderOverlayPools();
    return{rows,held,missing,lostPixels,enabled,poolAfterDestroy:renderer.flowColliderCapsulePool.length};
  },{up,down,diagonal});
  assert.deepEqual(noise,[],`browser console: ${JSON.stringify(noise)}`);
  const [upRow,downRow,diagonalRow]=evidence.rows;
  for(const row of evidence.rows){assert.equal(row.entityEnabled,true);assert.ok(row.pixels.count>40,`${row.name} capsule must alter real browser pixels: ${JSON.stringify(row)}`);assert.equal(row.material.depthTest,true);assert.equal(row.material.depthWrite,false);assert.equal(row.material.opacity,.16);assert.equal(row.pool,1);assert.equal(row.capsule.start.y,1);}
  for(const row of evidence.rows){
    const error=Math.max(Math.abs(row.meshAxis[0]-row.expectedMeshAxis[0]),Math.abs(row.meshAxis[1]-row.expectedMeshAxis[1]));
    assert.ok(error<.005,`${row.name} actual PlayCanvas world mesh poles must lie at scored centerline ± radius; ${JSON.stringify(row)}`);
    assert.ok(Math.abs(row.meshRadius-row.capsule.radius)<.005,`${row.name} real mesh cross-section matches scored radius`);
    assert.ok(row.silhouette.count>40&&row.silhouette.min>=-row.silhouette.radius-9&&row.silhouette.max<=row.silhouette.span+row.silhouette.radius+9,`${row.name} framebuffer must stay within projected scored capsule endpoints ± radius; ${JSON.stringify(row)}`);
  }
  assert.ok(upRow.capsule.end.y>1.74&&downRow.capsule.end.y<.26&&diagonalRow.capsule.end.y>1.5,"oriented volume tip follows hand up/down/diagonal");
  assert.ok(upRow.pixels.minY<downRow.pixels.minY-35&&downRow.pixels.maxY>upRow.pixels.maxY+35,`opposite real framebuffer silhouettes: ${JSON.stringify(evidence.rows)}`);
  assert.deepEqual(evidence.held,downRow.capsule,"held pose stays anchored");
  assert.equal(evidence.missing,0,"lost pose emits no volume");
  assert.equal(evidence.enabled,false,"old pooled overlay is disabled synchronously");
  assert.equal(evidence.lostPixels.count,0,"lost pose restores exact baseline pixels, no stale overlay");
  assert.equal(evidence.poolAfterDestroy,0);
  console.log("Flow scored-cap real mesh/framebuffer silhouettes for up/down/diagonal, held/lost absence, material and pool passed.");
  await page.close();
}finally{await browser.close();await new Promise((done)=>server.close(done));}
