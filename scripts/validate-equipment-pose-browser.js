// @ts-check
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize,resolve} from "node:path";
import {chromium} from "playwright";
import {createEquipmentConfigIdentity,createResolvedEquipmentPose,equipmentEulerDegreesToQuaternion,saberCapsuleGeometry} from "@aerobeat/web-contracts/equipment-pose-contracts";
import {isExpectedReadPixelsWarning} from "./browser-console-policy.js";

const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const poseCases=[[1,{x:0,y:0,z:0}],[2,{x:0,y:0,z:90}],[.75,{x:25,y:-20,z:35}]].map(([scale,rotationEulerDeg])=>createResolvedEquipmentPose({role:"left_wrist",mode:"flow",anchor:{x:1.5,y:1,z:.45},scale,orientation:equipmentEulerDegreesToQuaternion(rotationEulerDeg),geometryIdentity:saberCapsuleGeometry.identity,configIdentity}));
const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay");
const server=createServer(async(request,response)=>{try{const pathname=new URL(request.url??"/","http://127.0.0.1").pathname,brandingRelative=pathname.startsWith("/branding/")?pathname.slice(10):null,relative=pathname==="/"?".testbed/demo/index.html":pathname.slice(1),file=brandingRelative===null?normalize(join(root,relative)):normalize(join(brandingRoot,brandingRelative)),allowed=brandingRelative===null?root:brandingRoot;if(file!==allowed&&!file.startsWith(`${allowed}/`)){response.writeHead(403).end();return;}const content=await readFile(file),types={".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"};response.writeHead(200,{"content-type":types[extname(file)]??"application/octet-stream","cache-control":"no-store"});response.end(content);}catch{response.writeHead(404).end();}});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));const address=server.address();if(!address||typeof address==="string")throw new Error("browser server failed");const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`,browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),noise=[];page.on("console",(message)=>{const location=message.location(),type=message.type(),text=message.text();if((type==="warning"||type==="error")&&!isExpectedReadPixelsWarning(type,text,location.url,location.lineNumber,location.columnNumber,url))noise.push(`${type}: ${text}`);});page.on("pageerror",(error)=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const evidence=await page.evaluate((poseCases)=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas"),frame={presentation:"flow",nowMs:1000,targets:[]};
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);renderer.setBackgroundProjection({kind:"solid",colors:["#02040A"],angleDeg:180});
    const sample=()=>{const out=new OffscreenCanvas(canvas.width,canvas.height),context=out.getContext("2d",{willReadFrequently:true});context.drawImage(canvas,0,0);return context.getImageData(0,0,out.width,out.height).data;};
    renderer.renderGameplayFrame(frame);const baseline=sample();
    const mask=(pixels)=>{const points=[];for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-baseline[i])+Math.abs(pixels[i+1]-baseline[i+1])+Math.abs(pixels[i+2]-baseline[i+2])>18)points.push(i/4);return points;};
    const metrics=(points)=>{let sx=0,sy=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const index of points){const x=index%canvas.width,y=Math.floor(index/canvas.width);sx+=x;sy+=y;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}return{count:points.length,centroid:{x:sx/points.length,y:sy/points.length},box:[minX,minY,maxX,maxY]};};
    const overlap=(core,glow)=>{const glowSet=new Set(glow),width=canvas.width;let inside=0;for(const index of core){const x=index%width,y=Math.floor(index/width);let hit=false;for(let dy=-1;dy<=1&&!hit;dy++)for(let dx=-1;dx<=1;dx++)if(glowSet.has((y+dy)*width+x+dx)){hit=true;break;}if(hit)inside++;}return inside/Math.max(1,core.length);};
    const rows=[];
    for(const pose of poseCases){
      renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[pose],null);const entries=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist"),root=entries[0],model=entries.find((e)=>e.name==="equipment-left_wrist-model"),glow=entries.find((e)=>e.name==="equipment-left_wrist-glow"),records=renderer.assetMaterials.get(model)??[];
      for(const record of records)record.meshInstance.visible=record.name==="mat/saber_blade";model.enabled=true;glow.enabled=false;renderer.manualTick();const core=mask(sample());model.enabled=false;glow.enabled=true;renderer.manualTick();const halo=mask(sample());model.enabled=true;glow.enabled=true;for(const record of records)record.meshInstance.visible=true;renderer.manualTick();
      const rootScale=root.getLocalScale(),rootRotation=root.getLocalRotation();rows.push({scale:pose.scale,orientation:pose.orientation,rootScale:[rootScale.x,rootScale.y,rootScale.z],rootRotation:[rootRotation.x,rootRotation.y,rootRotation.z,rootRotation.w],shared:model.parent===root&&glow.parent===root,core:metrics(core),glow:metrics(halo),overlap:overlap(core,halo),poolCount:entries.length});
    }
    renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);const disabled=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")[0].enabled===false;
    return{rows,disabled,poolSize:renderer.equipmentPools.size};
  },poseCases);
  assert.deepEqual(noise,[]);assert.equal(evidence.disabled,true);assert.equal(evidence.poolSize,1,"one role/mode pool remains bounded");
  for(const row of evidence.rows){assert.equal(row.shared,true,"GLB blade and glow share one pose root");assert.ok(row.core.count>20&&row.glow.count>20,`isolated masks must be nontrivial: ${JSON.stringify(row)}`);assert.ok(row.overlap>=.96,`blade mask must be enclosed by one-pixel-dilated glow: ${JSON.stringify(row)}`);assert.ok(Math.hypot(row.core.centroid.x-row.glow.centroid.x,row.core.centroid.y-row.glow.centroid.y)<=5,`isolated centroids must remain aligned: ${JSON.stringify(row)}`);assert.deepEqual(row.rootScale,[row.scale,row.scale,row.scale]);assert.equal(row.poolCount,3,"GLB pool stays one root + model + glow");}
  console.log("Equipment pose framebuffer masks",JSON.stringify(evidence.rows));console.log("Component-isolated GLB/glow pose-root browser validation passed.");
  await page.close();
}finally{await browser.close();await new Promise((done)=>server.close(done));}
