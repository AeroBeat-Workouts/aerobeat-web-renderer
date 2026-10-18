// @ts-check
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { isExpectedReadPixelsWarning } from "./browser-console-policy.js";

const root=process.cwd(),brandingRoot=resolve(root,"../aerobeat-branding/icons/web-gameplay");
const server=createServer(async(request,response)=>{
  try{
    const pathname=new URL(request.url??"/","http://127.0.0.1").pathname,branded=pathname.startsWith("/branding/");
    const base=branded?brandingRoot:root,file=normalize(join(base,branded?pathname.slice(10):pathname.slice(1)));
    if(file!==base&&!file.startsWith(`${base}/`)){response.writeHead(403).end();return;}
    const data=await readFile(file);
    response.writeHead(200,{"content-type":({".html":"text/html",".js":"text/javascript",".json":"application/json",".svg":"image/svg+xml",".glb":"model/gltf-binary"})[extname(file)]??"application/octet-stream","cache-control":"no-store"}).end(data);
  }catch{response.writeHead(404).end();}
});
await new Promise((done)=>server.listen(0,"127.0.0.1",done));
const address=server.address();if(!address||typeof address==="string")throw new Error("Browser server failed");
const url=`http://127.0.0.1:${address.port}/.testbed/demo/index.html`,browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:844,height:390}}),noise=[];
  page.on("console",(message)=>{const {url:sourceUrl,lineNumber,columnNumber}=message.location(),type=message.type(),text=message.text();if(["warning","error"].includes(type)&&!isExpectedReadPixelsWarning(type,text,sourceUrl,lineNumber,columnNumber,url))noise.push(`${type}: ${text}`);});
  page.on("pageerror",(error)=>noise.push(`pageerror: ${error.message}`));
  await page.goto(url,{waitUntil:"networkidle"});
  await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__?.ready===true&&globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
  const pose=(role,x)=>({role,mode:"boxing",anchor:{x,y:1,z:.45},scale:1,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:0}),geometryIdentity:gloveObbGeometry.identity,configIdentity});
  const result=await page.evaluate(({left,right})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({kind:"solid",colors:["#102030"],angleDeg:180});
    const sample=()=>{const output=new OffscreenCanvas(canvas.width,canvas.height),ctx=output.getContext("2d",{willReadFrequently:true});ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const delta=(a,b)=>{let changed=0,dark=0;for(let i=0;i<a.length;i+=4){const shift=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(shift>12)changed++;if(shift>30&&a[i]+a[i+1]+a[i+2]<b[i]+b[i+1]+b[i+2])dark++;}return{changed,dark};};
    const frame={presentation:"boxing_collider",nowMs:1000,targets:[],colliderSettings:{colliderVisible:true,colliderScale:.5,colliderDepthForward:1,colliderDepthBackward:1},equipmentColliderAnchors:{left:{x:-.7,y:1,z:.45},right:{x:.7,y:1,z:.45}}};
    const render=(request,equipment=[left,right])=>renderer.renderGameplayFrameWithCursorsAndEquipment(request,[],null,equipment,null).model;
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderVisible:false}});const off=sample();
    const model=render(frame),on=sample(),boxes=model.objects.filter((entry)=>entry.kind==="collider_volume"),fill=(renderer.colliderOverlayPrimitivePool??[]).filter((entry)=>entry.enabled&&entry.name.startsWith("equipment-collider-volume-")),wires=(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled);
    if(boxes.length!==2||fill.length!==2||wires.length!==2)throw new Error("Two scored Boxer Show boxes, fills and wires required");
    const layer=renderer.flowColliderOverlayLayer,world=renderer.app.scene.layers.getLayerById(0),composition=renderer.app.scene.layers;
    const edges=wires.map((wire,index)=>{
      const mesh=wire.render.meshInstances[0].mesh,material=wire.render.meshInstances[0].material,buffer=mesh.vertexBuffer,element=buffer.format.elements.find((entry)=>entry.name==="POSITION"),view=new DataView(buffer.lock()),vertices=[];
      for(let vertex=0;vertex<buffer.numVertices;vertex++){const offset=vertex*buffer.format.size+element.offset;vertices.push([view.getFloat32(offset,true),view.getFloat32(offset+4,true),view.getFloat32(offset+8,true)]);}buffer.unlock();
      return{name:wire.name,vertices,indices:mesh.indexBuffer[0].numIndices,primitive:mesh.primitive[0].type,position:{...wire.getPosition()},scale:{...wire.getLocalScale()},boxPosition:boxes[index].position,boxScale:boxes[index].scale,fillLayer:fill[index].render.layers[0],wireLayer:wire.render.layers[0],outlineLayer:layer.id,worldTransparentIndex:composition.getTransparentIndex(world),outlineTransparentIndex:composition.getTransparentIndex(layer),material:{diffuse:[material.diffuse.r,material.diffuse.g,material.diffuse.b],emissive:[material.emissive.r,material.emissive.g,material.emissive.b],opacity:material.opacity,depthTest:material.depthTest,depthWrite:material.depthWrite,useLighting:material.useLighting,blendType:material.blendType},fillOpacity:fill[index].render.meshInstances[0].material.opacity};
    });
    for(const wire of wires)wire.enabled=false;renderer.manualTick();const withoutWire=sample();
    for(const wire of wires)wire.enabled=true;renderer.manualTick();const withWire=sample();
    const preview={show:delta(on,off),wireContrast:delta(withWire,withoutWire)};
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderVisible:false}});const offState={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,pixels:delta(sample(),off)};
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderScale:0}});const zero={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,boxes:renderer.lastModel.objects.filter((entry)=>entry.kind==="collider_volume").length,pixels:delta(sample(),off)};
    render({...frame,equipmentColliderAnchors:{left:null,right:null}},[left,right]);const lost={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,boxes:renderer.lastModel.objects.filter((entry)=>entry.kind==="collider_volume").length,pixels:delta(sample(),off)};
    const large=render({...frame,colliderSettings:{...frame.colliderSettings,colliderScale:5}}),largeBoxes=large.objects.filter((entry)=>entry.kind==="collider_volume");
    const rescaled=(renderer.boxingColliderWirePool??[]).map((wire,index)=>({scale:{...wire.getLocalScale()},boxScale:largeBoxes[index].scale}));
    renderer.onContextLost({preventDefault(){}});
    const contextLost={pool:renderer.boxingColliderWirePool.length,ownedWires:wires.map((wire)=>renderer.ownedMaterials.has(wire.render?.meshInstances?.[0]?.mesh))};
    renderer.onContextRestored();
    return{preview,edges,offState,zero,lost,rescaled,contextLost};
  },{left:pose("left_wrist",1.5),right:pose("right_wrist",2.5)});
  assert.deepEqual(noise,[],`browser console: ${JSON.stringify(noise)}`);
  assert.ok(result.preview.show.changed>100&&result.preview.wireContrast.dark>15,`Boxer wire must add dark framebuffer contrast over retained fill and GLBs: ${JSON.stringify(result.preview)}`);
  assert.deepEqual(result.edges.map((edge)=>edge.name),["boxing-collider-wire-0","boxing-collider-wire-1"],"stable named hand slots are inspectable in the real PlayCanvas scene");
  for(const edge of result.edges){
    assert.equal(edge.vertices.length,8);assert.equal(edge.indices,24);assert.equal(edge.primitive,1,"PlayCanvas wire must use line primitives");
    assert.deepEqual([...edge.vertices].sort((a,b)=>a.join().localeCompare(b.join())),Array.from({length:8},(_,i)=>[i&4?.5:-.5,i&2?.5:-.5,i&1?.5:-.5]).sort((a,b)=>a.join().localeCompare(b.join())));
    for(const axis of ["x","y","z"]){assert.ok(Math.abs(edge.position[axis]-edge.boxPosition[axis])<1e-6);assert.ok(Math.abs(edge.scale[axis]-edge.boxScale[axis])<1e-6);}
    assert.equal(edge.fillOpacity,.16);assert.notEqual(edge.fillLayer,edge.wireLayer);assert.equal(edge.wireLayer,edge.outlineLayer);assert.ok(edge.outlineTransparentIndex>edge.worldTransparentIndex);
    assert.deepEqual(edge.material.diffuse,[.025,.032,.045]);assert.deepEqual(edge.material.emissive,[.025,.032,.045]);assert.equal(edge.material.opacity,.8);assert.equal(edge.material.depthTest,false);assert.equal(edge.material.depthWrite,false);assert.equal(edge.material.useLighting,false);
  }
  for(const state of [result.offState,result.zero,result.lost]){assert.equal(state.wires,0);assert.deepEqual(state.pixels,{changed:0,dark:0});}
  assert.equal(result.zero.boxes,0);assert.equal(result.lost.boxes,0);
  for(const entry of result.rescaled)for(const axis of ["x","y","z"])assert.ok(Math.abs(entry.scale[axis]-entry.boxScale[axis])<1e-5,"retained hand wire follows new scored box scale");
  assert.deepEqual(result.contextLost,{pool:0,ownedWires:[false,false]},"context loss releases both wire meshes");
  await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const restored=await page.evaluate(()=>{const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];const frame={presentation:"boxing_collider",nowMs:1000,targets:[],colliderSettings:{colliderVisible:true,colliderScale:.5,colliderDepthForward:1,colliderDepthBackward:1},equipmentColliderAnchors:{left:{x:-.7,y:1,z:.45},right:{x:.7,y:1,z:.45}}};renderer.renderGameplayFrame(frame);const wires=renderer.boxingColliderWirePool??[];const state={count:wires.length,active:wires.filter((wire)=>wire.enabled).length,meshes:wires.map((wire)=>renderer.ownedMaterials.has(wire.render.meshInstances[0].mesh))};renderer.detach();return{...state,afterDetach:renderer.boxingColliderWirePool.length,remainingMeshes:wires.map((wire)=>renderer.ownedMaterials.has(wire.render?.meshInstances?.[0]?.mesh))};});
  assert.deepEqual(restored,{count:2,active:2,meshes:[true,true],afterDetach:0,remainingMeshes:[false,false]},"context restore rebuilds, detach disposes retained wires");
  console.log("Boxer retained PlayCanvas 12-edge Show wires, post-World contrast, zero/lost/off, rescale, context restore and detach passed.");
}finally{await browser.close();await new Promise((done)=>server.close(done));}
