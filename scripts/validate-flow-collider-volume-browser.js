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
  const evidence=await page.evaluate(({up,down})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({kind:"solid",colors:["#102030"],angleDeg:180});
    const settings={colliderVisible:true,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:0};
    const frame={presentation:"flow",nowMs:1000,targets:[],colliderSettings:settings,equipmentColliderPoses:[]};
    const pixels=()=>{const buffer=new OffscreenCanvas(canvas.width,canvas.height),context=buffer.getContext("2d",{willReadFrequently:true});context.drawImage(canvas,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
    const delta=(current,previous)=>{const points=[];for(let pixel=0;pixel<current.length;pixel+=4){const shift=Math.abs(current[pixel]-previous[pixel])+Math.abs(current[pixel+1]-previous[pixel+1])+Math.abs(current[pixel+2]-previous[pixel+2]);if(shift>9)points.push(pixel/4);}const ys=points.map((point)=>Math.floor(point/canvas.width));return{count:points.length,minY:Math.min(...ys),maxY:Math.max(...ys)};};
    renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);const base=pixels(),rows=[];
    for(const [name,pose] of [["up",up],["down",down]]){
      const model=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[pose]},[],null,[],null).model;
      const entity=(renderer.flowColliderCapsulePool??[])[0];
      rows.push({name,capsule:model.objects.find((object)=>object.kind==="collider_volume")?.capsule,entityEnabled:entity?.enabled??false,material:{depthTest:entity?.render?.meshInstances?.[0]?.material?.depthTest,depthWrite:entity?.render?.meshInstances?.[0]?.material?.depthWrite,opacity:entity?.render?.meshInstances?.[0]?.material?.opacity},pixels:delta(pixels(),base),pool:(renderer.flowColliderCapsulePool??[]).length});
    }
    const held=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[down]},[],null,[],null).model.objects.find((object)=>object.kind==="collider_volume")?.capsule;
    const missing=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null).model.objects.filter((object)=>object.kind==="collider_volume").length;
    const lostPixels=delta(pixels(),base),enabled=(renderer.flowColliderCapsulePool??[]).some((entity)=>entity.enabled);
    renderer.destroyColliderOverlayPools();
    return{rows,held,missing,lostPixels,enabled,poolAfterDestroy:renderer.flowColliderCapsulePool.length};
  },{up,down});
  assert.deepEqual(noise,[],`browser console: ${JSON.stringify(noise)}`);
  const [upRow,downRow]=evidence.rows;
  for(const row of evidence.rows){assert.equal(row.entityEnabled,true);assert.ok(row.pixels.count>40,`${row.name} capsule must alter real browser pixels: ${JSON.stringify(row)}`);assert.equal(row.material.depthTest,true);assert.equal(row.material.depthWrite,false);assert.equal(row.material.opacity,.16);assert.equal(row.pool,1);assert.equal(row.capsule.start.y,1);}
  assert.ok(upRow.capsule.end.y>1.74&&downRow.capsule.end.y<.26,"oriented volume tip follows hand up/down");
  assert.ok(upRow.pixels.minY<downRow.pixels.minY-35&&downRow.pixels.maxY>upRow.pixels.maxY+35,`opposite real framebuffer silhouettes: ${JSON.stringify(evidence.rows)}`);
  assert.deepEqual(evidence.held,downRow.capsule,"held pose stays anchored");
  assert.equal(evidence.missing,0,"lost pose emits no volume");
  assert.equal(evidence.enabled,false,"old pooled overlay is disabled synchronously");
  assert.equal(evidence.lostPixels.count,0,"lost pose restores exact baseline pixels, no stale overlay");
  assert.equal(evidence.poolAfterDestroy,0);
  console.log("Flow rotated capped-capsule GLB-context pixels, held/lost absence, material and pool browser check passed.");
  await page.close();
}finally{await browser.close();await new Promise((done)=>server.close(done));}
