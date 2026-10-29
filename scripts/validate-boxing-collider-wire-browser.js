// @ts-check
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { chromium } from "playwright";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
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
  const pose=(role,x,euler={x:0,y:0,z:0},scale=1)=>({role,mode:"boxing",anchor:{x,y:1,z:.45},scale,orientation:equipmentEulerDegreesToQuaternion(euler),geometryIdentity:gloveObbGeometry.identity,configIdentity});
  const result=await page.evaluate(({left,right,quaternions,flowGeometryIdentity})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({kind:"solid",colors:["#102030"],angleDeg:180});
    const sample=()=>{const output=new OffscreenCanvas(canvas.width,canvas.height),ctx=output.getContext("2d",{willReadFrequently:true});ctx.drawImage(canvas,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
    const delta=(a,b)=>{let changed=0,dark=0;for(let i=0;i<a.length;i+=4){const shift=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(shift>12)changed++;if(shift>30&&a[i]+a[i+1]+a[i+2]<b[i]+b[i+1]+b[i+2])dark++;}return{changed,dark};};
    const frame={presentation:"boxing_collider",nowMs:1000,targets:[],colliderSettings:{colliderVisible:true,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:0},equipmentColliderPoses:[left,right]};
    const render=(request,equipment=[left,right])=>renderer.renderGameplayFrameWithCursorsAndEquipment(request,[],null,equipment,null).model;
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderVisible:false}});const off=sample();
    const model=render(frame),on=sample(),boxes=model.objects.filter((entry)=>entry.kind==="collider_volume"),fill=(renderer.boxingColliderCylinderPool??[]).filter((entry)=>entry.enabled&&entry.name.startsWith("equipment-collider-volume-")),wires=(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled);
    if(boxes.length!==2||fill.length!==2||wires.length!==2)throw new Error("Two scored Boxer Show cylinders, fills and wires required");
    const layer=renderer.gameplayColliderOverlayLayer,world=renderer.app.scene.layers.getLayerById(0),composition=renderer.app.scene.layers;
    const edges=wires.map((wire,index)=>{
      const mesh=wire.render.meshInstances[0].mesh,material=wire.render.meshInstances[0].material,buffer=mesh.vertexBuffer,element=buffer.format.elements.find((entry)=>entry.name==="POSITION"),view=new DataView(buffer.lock()),vertices=[];
      for(let vertex=0;vertex<buffer.numVertices;vertex++){const offset=vertex*buffer.format.size+element.offset;vertices.push([view.getFloat32(offset,true),view.getFloat32(offset+4,true),view.getFloat32(offset+8,true)]);}buffer.unlock();
      return{name:wire.name,vertices,indices:mesh.indexBuffer[0].numIndices,primitive:mesh.primitive[0].type,position:{...wire.getPosition()},scale:{...wire.getLocalScale()},boxPosition:boxes[index].position,boxScale:boxes[index].scale,shape:boxes[index].shape,radius:boxes[index].capsule.radius,start:boxes[index].capsule.start,end:boxes[index].capsule.end,rotation:{...wire.getRotation()},fillRotation:{...fill[index].getRotation()},fillLayer:fill[index].render.layers[0],wireLayer:wire.render.layers[0],outlineLayer:layer.id,worldTransparentIndex:composition.getTransparentIndex(world),outlineTransparentIndex:composition.getTransparentIndex(layer),material:{diffuse:[material.diffuse.r,material.diffuse.g,material.diffuse.b],emissive:[material.emissive.r,material.emissive.g,material.emissive.b],opacity:material.opacity,depthTest:material.depthTest,depthWrite:material.depthWrite,useLighting:material.useLighting,blendType:material.blendType},fillOpacity:fill[index].render.meshInstances[0].material.opacity};
    });
    for(const wire of wires)wire.enabled=false;renderer.manualTick();const withoutWire=sample();
    for(const wire of wires)wire.enabled=true;renderer.manualTick();const withWire=sample();
    const preview={show:delta(on,off),wireContrast:delta(withWire,withoutWire)};
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderVisible:false}});const offState={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,fill:(renderer.boxingColliderCylinderPool??[]).filter((entry)=>entry.enabled).length,pixels:delta(sample(),off)};
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderScale:0}});const zero={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,fill:(renderer.boxingColliderCylinderPool??[]).filter((entry)=>entry.enabled).length,boxes:renderer.lastModel.objects.filter((entry)=>entry.kind==="collider_volume").length,pixels:delta(sample(),off)};
    render({...frame,equipmentColliderPoses:[]},[]);const lost={wires:(renderer.boxingColliderWirePool??[]).filter((entry)=>entry.enabled).length,fill:(renderer.boxingColliderCylinderPool??[]).filter((entry)=>entry.enabled).length,boxes:renderer.lastModel.objects.filter((entry)=>entry.kind==="collider_volume").length};
    render({...frame,colliderSettings:{...frame.colliderSettings,colliderVisible:false}},[]);const bare=sample();
    const large=render({...frame,colliderSettings:{...frame.colliderSettings,colliderScale:5}}),largeBoxes=large.objects.filter((entry)=>entry.kind==="collider_volume");
    const rescaled=(renderer.boxingColliderWirePool??[]).map((wire,index)=>({scale:{...wire.getLocalScale()},boxScale:largeBoxes[index].scale}));
    const rotations=[];
    for(const euler of [{x:90,y:0,z:0},{x:0,y:90,z:0},{x:0,y:0,z:90},{x:35,y:40,z:25}]){
      const rotated={...left,orientation:quaternions[rotations.length]};
      const entry=render({...frame,equipmentColliderPoses:[rotated]},[rotated]).objects.find((object)=>object.kind==="collider_volume");
      const wire=renderer.boxingColliderWirePool[0],filler=renderer.boxingColliderCylinderPool[0];
      rotations.push({euler,position:entry.position,start:entry.capsule.start,end:entry.capsule.end,wireRotation:{...wire.getRotation()},fillRotation:{...filler.getRotation()},artRotation:{...renderer.equipmentPoseRoots.get("left_wrist").getRotation()}});
    }
    const unions=[];
    for(const mode of ["flow","boxing"]){
      for(const orientation of quaternions){
        const equipment=[left,right].map((entry)=>({...entry,mode,orientation,geometryIdentity:mode==="flow"?flowGeometryIdentity:entry.geometryIdentity}));
        const request={...frame,presentation:mode==="flow"?"flow":"boxing_collider",equipmentColliderPoses:equipment,colliderSettings:{...frame.colliderSettings,colliderDepthBackward:.8}};
        const native=()=>[...(mode==="flow"?renderer.flowColliderCapsulePool:renderer.boxingColliderCylinderPool)??[]].filter((entry)=>entry.enabled);
        const art=()=>equipment.map((entry)=>{const root=renderer.equipmentPoseRoots.get(entry.role);return{position:{...root.getPosition()},rotation:{...root.getRotation()},scale:{...root.getLocalScale()}};});
        render({...request,colliderSettings:{...request.colliderSettings,colliderDepthBackwardAthleteFacing:mode==="boxing"}},equipment);
        const originalArt=art(),defaultCount=native().length;
        const bentRequest={...request,colliderSettings:{...request.colliderSettings,colliderDepthBackwardAthleteFacing:mode==="flow"}};
        const bent=render(bentRequest,equipment),objects=bent.objects.filter((entry)=>entry.kind==="collider_volume"),entities=native();
        const nativeParts=objects.map((object)=>{
          const entity=entities.find((entry)=>entry.name===object.id);
          const wire=mode==="flow"?entity:renderer.boxingColliderWirePool[(object.id.includes("-rear-")?2:0)+(object.role==="left"?0:1)];
          const length=Math.hypot(object.capsule.end.x-object.capsule.start.x,object.capsule.end.y-object.capsule.start.y,object.capsule.end.z-object.capsule.start.z);
          const axis=entity.getPosition().clone().set(mode==="flow"?1:0,0,mode==="flow"?0:1);
          const direction=entity.getRotation().transformVector(axis);
          const endpointError=Math.max(...["x","y","z"].map((key)=>Math.abs(direction[key]-(object.capsule.end[key]-object.capsule.start[key])/length)));
          return{id:object.id,endpointError,rotation:{...entity.getRotation()},wireRotation:{...wire.getRotation()},wireEnabled:wire.enabled,wirePosition:{...wire.getPosition()},position:{...entity.getPosition()},wireScale:{...wire.getLocalScale()},scale:{...entity.getLocalScale()},meshCount:entity.render.meshInstances.length};
        });
        const shown=sample();for(const entity of entities)entity.enabled=false;for(const wire of renderer.boxingColliderWirePool??[])wire.enabled=false;renderer.manualTick();const hidden=sample();
        unions.push({mode,defaultCount,count:objects.length,nativeParts,originalArt,bentArt:art(),pixels:delta(shown,hidden)});
        render({...bentRequest,colliderSettings:{...bentRequest.colliderSettings,colliderDepthForward:0,colliderDepthBackward:0}},equipment);
        if(native().length!==2)throw new Error("Zero reaches must retain one part per hand");
        render({...bentRequest,colliderSettings:{...bentRequest.colliderSettings,colliderScale:0}},equipment);
        if(native().length!==0||(renderer.boxingColliderWirePool??[]).some((wire)=>wire.enabled))throw new Error("Scale0 must disable all parts and wires");
      }
    }
    // Restore original two-wire state for the established lifecycle assertions below.
    render(frame);
    renderer.onContextLost({preventDefault(){}});
    const contextLost={pool:renderer.boxingColliderWirePool.length,ownedWires:wires.map((wire)=>renderer.ownedMaterials.has(wire.render?.meshInstances?.[0]?.mesh))};
    renderer.onContextRestored();
    return{preview,edges,offState,zero,lost,bareDelta:delta(bare,off),rescaled,rotations,contextLost,unions};
  },{flowGeometryIdentity:saberCapsuleGeometry.identity,left:pose("left_wrist",1.5),right:pose("right_wrist",2.5),quaternions:[{x:90,y:0,z:0},{x:0,y:90,z:0},{x:0,y:0,z:90},{x:35,y:40,z:25}].map(equipmentEulerDegreesToQuaternion)});
  assert.deepEqual(noise,[],`browser console: ${JSON.stringify(noise)}`);
  assert.ok(result.preview.show.changed>100&&result.preview.wireContrast.dark>15,`Boxer wire must add dark framebuffer contrast over retained fill and GLBs: ${JSON.stringify(result.preview)}`);
  assert.deepEqual(result.edges.map((edge)=>edge.name),["boxing-collider-wire-0","boxing-collider-wire-1"],"stable named hand slots are inspectable in the real PlayCanvas scene");
  for(const edge of result.edges){
    assert.equal(edge.vertices.length,48);assert.equal(edge.indices,104);assert.equal(edge.shape,"cylinder");assert.equal(edge.radius,.34);assert.equal(edge.primitive,1,"PlayCanvas wire must use line primitives");
    assert.ok(edge.vertices.every(([x,y,z])=>Math.abs(Math.hypot(x,y)-.5)<1e-6&&Math.abs(z)===.5),"cap polygons sit on scored surface");
    assert.deepEqual(edge.rotation,edge.fillRotation,"fill and wire share fixed world-Z orientation");assert.deepEqual(edge.rotation,{x:0,y:0,z:0,w:1},"Show remains world-Z under glove art rotation");
    for(const axis of ["x","y","z"]){assert.ok(Math.abs(edge.position[axis]-edge.boxPosition[axis])<1e-6);assert.ok(Math.abs(edge.scale[axis]-edge.boxScale[axis])<1e-6);}
    assert.equal(edge.fillOpacity,.16);assert.equal(edge.fillLayer,edge.wireLayer);assert.equal(edge.wireLayer,edge.outlineLayer);assert.ok(edge.outlineTransparentIndex<edge.worldTransparentIndex,'Boxer wire must not overpaint World beats');
    assert.deepEqual(edge.material.diffuse,[.025,.032,.045]);assert.deepEqual(edge.material.emissive,[.025,.032,.045]);assert.equal(edge.material.opacity,.8);assert.equal(edge.material.depthTest,false);assert.equal(edge.material.depthWrite,false);assert.equal(edge.material.useLighting,false);
  }
  for(const state of [result.offState,result.zero,result.lost]){assert.equal(state.wires,0);assert.equal(state.fill,0);}
  for(const state of [result.offState,result.zero])assert.deepEqual(state.pixels,{changed:0,dark:0},"Show off and Scale0 retain identical real-GLB framebuffer");
  assert.equal(result.zero.boxes,0);assert.equal(result.lost.boxes,0);assert.ok(result.bareDelta.changed>100,"lost pose correctly removes actual glove GLBs as well");
  for(const entry of result.rescaled)for(const axis of ["x","y","z"])assert.ok(Math.abs(entry.scale[axis]-entry.boxScale[axis])<1e-5,"retained hand wire follows new scored cylinder scale");
  for(const entry of result.rotations){
    for(const axis of ["x","y","z"])assert.ok(Math.abs(entry.position[axis]-(entry.start[axis]+entry.end[axis])/2)<1e-6);
    assert.deepEqual(entry.wireRotation,{x:0,y:0,z:0,w:1},"rotating glove art does not rotate native Show wire");assert.notDeepEqual(entry.artRotation,entry.wireRotation,"the wearable glove retains its independent rotation");
    assert.deepEqual(entry.wireRotation,entry.fillRotation,"rotated fill and outline remain aligned");
  }
  for(const entry of result.rotations){assert.equal(entry.start.x,0);assert.equal(entry.end.x,0);assert.equal(entry.start.y,1);assert.equal(entry.end.y,1);assert.ok(entry.start.z<entry.end.z,"incoming −Z front and athlete-facing +Z back remain fixed under glove art rotation");}
  assert.deepEqual(result.rotations.map(({start,end})=>({start,end})),Array(4).fill({start:result.rotations[0].start,end:result.rotations[0].end}),"cardinal and combined glove art rotations retain identical Show endpoints");
  for(const union of result.unions){
    assert.equal(union.defaultCount,2);assert.equal(union.count,4,"each hand needs independent front and rear parts");
    assert.deepEqual(union.bentArt,union.originalArt,"rear direction changes no native wearable transform");
    assert.ok(union.pixels.changed>100,"both unions must reach the real framebuffer");
    for(const part of union.nativeParts){
      assert.ok(part.endpointError<1e-5,`${union.mode} native cap axis follows shared endpoints: ${part.endpointError}`);
      assert.equal(part.wireEnabled,true);assert.deepEqual(part.rotation,part.wireRotation,"fill and wire face the same part direction");
      assert.deepEqual(part.position,part.wirePosition);assert.deepEqual(part.scale,part.wireScale);
      if(union.mode==="flow")assert.equal(part.meshCount,2,"capsule fill and hemispherical wire share native transform");
    }
  }
  assert.deepEqual(result.contextLost,{pool:0,ownedWires:[false,false]},"context loss releases both wire meshes");
  await page.waitForFunction(()=>globalThis.__AERO_RENDERER_TEST__.renderers[0].describe().gameplayAssets.state==="ready");
  const restored=await page.evaluate(({left,right})=>{const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0];const frame={presentation:"boxing_collider",nowMs:1000,targets:[],colliderSettings:{colliderVisible:true,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:0},equipmentColliderPoses:[left,right]};renderer.renderGameplayFrame(frame);const wires=renderer.boxingColliderWirePool??[];const state={count:wires.length,active:wires.filter((wire)=>wire.enabled).length,meshes:wires.map((wire)=>renderer.ownedMaterials.has(wire.render.meshInstances[0].mesh))};renderer.detach();return{...state,afterDetach:renderer.boxingColliderWirePool.length,remainingMeshes:wires.map((wire)=>renderer.ownedMaterials.has(wire.render?.meshInstances?.[0]?.mesh))};},{left:pose("left_wrist",1.5),right:pose("right_wrist",2.5)});
  assert.deepEqual(restored,{count:2,active:2,meshes:[true,true],afterDetach:0,remainingMeshes:[false,false]},"context restore rebuilds, detach disposes retained wires");
  console.log("Boxer retained PlayCanvas polygon Show wires, pre-World beat priority, zero/lost/off, rescale, context restore and detach passed.");
}finally{await browser.close();await new Promise((done)=>server.close(done));}
