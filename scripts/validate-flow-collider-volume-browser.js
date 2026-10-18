// @ts-check
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
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
  const right={...up,role:"right_wrist",anchor:{...up.anchor,x:2.5},orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:-45})};
  const scaled={...up,scale:2};
  const evidenceDirectory=resolve(root,".tmp/renderer-browser-evidence/flow-capsule-before-after");
  await mkdir(evidenceDirectory,{recursive:true});
  const evidence=await page.evaluate(({up,down,diagonal,right,scaled})=>{
    const renderer=globalThis.__AERO_RENDERER_TEST__.renderers[0],canvas=document.querySelector("#primary canvas");
    renderer.resize({widthCssPx:844,heightCssPx:390,devicePixelRatio:1});renderer.setEnvironmentVisible(false);
    renderer.setBackgroundProjection({kind:"solid",colors:["#102030"],angleDeg:180});
    const settings={colliderVisible:true,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:0};
    const frame={presentation:"flow",nowMs:1000,targets:[],colliderSettings:settings,equipmentColliderPoses:[]};
    const pixels=()=>{const buffer=new OffscreenCanvas(canvas.width,canvas.height),context=buffer.getContext("2d",{willReadFrequently:true});context.drawImage(canvas,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data;};
    const compare=(on,off)=>{let changed=0,contrasting=0;for(let offset=0;offset<on.length;offset+=4){const difference=Math.abs(on[offset]-off[offset])+Math.abs(on[offset+1]-off[offset+1])+Math.abs(on[offset+2]-off[offset+2]);if(difference>12)changed++;if(difference>80)contrasting++;}return{changed,contrasting};};
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
    const snapshots={baseline:canvas.toDataURL("image/png")};
    renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,colliderSettings:{...settings,colliderVisible:false}},[],null,[up],null);
    const saberEntries=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")??[],solidModel=saberEntries.find((candidate)=>candidate.name==="equipment-left_wrist-model");
    if(!solidModel?.enabled)throw new Error("No authored solid Flow saber GLB in browser scene");
    const solidRecords=renderer.assetMaterials.get(solidModel)??[];
    for(const record of solidRecords)record.meshInstance.visible=record.name==="mat/saber_blade";
    for(const entry of saberEntries)if(entry.name.includes("glow"))entry.enabled=false;
    renderer.manualTick();
    const solidImage=pixels(),solidPoints=silhouette(solidImage,base).filter((point)=>point.y<205);
    const solidBlade={count:solidPoints.length,box:{minX:Math.min(...solidPoints.map((point)=>point.x)),maxX:Math.max(...solidPoints.map((point)=>point.x)),minY:Math.min(...solidPoints.map((point)=>point.y)),maxY:Math.max(...solidPoints.map((point)=>point.y))}};
    snapshots.solidBlade=canvas.toDataURL("image/png");
    for(const record of solidRecords)record.meshInstance.visible=true;
    // Same-frame blade-only, outline-only, and combined captures share a camera, pose root,
    // and active named collider; do not compare independent staging/pool histories.
    const sameFrame=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[up]},[],null,[up],null).model;
    const liveCollider=sameFrame.objects.find((object)=>object.id==="equipment-collider-volume-left");
    if(!liveCollider)throw new Error("Same-frame left collider missing");
    const liveOverlay=(renderer.flowColliderCapsulePool??[]).find((candidate)=>candidate.enabled&&candidate.name===liveCollider.id);
    if(!liveOverlay)throw new Error("Same-frame active named overlay missing");
    const liveBlade=(renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")??[]).find((candidate)=>candidate.name==="equipment-left_wrist-model");
    if(!liveBlade?.enabled)throw new Error("Same-frame authored GLB missing");
    const bladeRecord=(renderer.assetMaterials.get(liveBlade)??[]).find((record)=>record.name==="mat/saber_blade");
    if(!bladeRecord)throw new Error("Same-frame solid blade material missing");
    const glbWorld=liveBlade.getWorldTransform(),bladeMesh=bladeRecord.meshInstance.mesh,bladeBuffer=bladeMesh.vertexBuffer,bladeElement=bladeBuffer.format.elements.find((element)=>element.name==="POSITION"),bladeView=new DataView(bladeBuffer.lock()),bladeVertices=[];
    for(let index=0;index<bladeBuffer.numVertices;index++){const offset=index*bladeBuffer.format.size+bladeElement.offset;const local=new (liveBlade.getPosition().constructor)(bladeView.getFloat32(offset,true),bladeView.getFloat32(offset+4,true),bladeView.getFloat32(offset+8,true));const point=glbWorld.transformPoint(local);bladeVertices.push({x:point.x,y:point.y,z:point.z});}
    bladeBuffer.unlock();
    const glbAll=(renderer.assetMaterials.get(liveBlade)??[]);for(const record of glbAll)record.meshInstance.visible=record===bladeRecord;
    for(const entry of renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")??[])if(entry.name.includes("glow"))entry.enabled=false;
    const sameCamera=renderer.cameraEntity.camera,vec=(p)=>new (liveBlade.getPosition().constructor)(p.x,p.y,p.z),screen=(p)=>{const value=sameCamera.worldToScreen(vec(p));return{x:value.x,y:value.y};};
    const bounds=(points)=>({count:points.length,minX:Math.min(...points.map((p)=>p.x)),maxX:Math.max(...points.map((p)=>p.x)),minY:Math.min(...points.map((p)=>p.y)),maxY:Math.max(...points.map((p)=>p.y))});
    liveOverlay.enabled=false;renderer.manualTick();const bladeOnly=silhouette(pixels(),base);
    liveOverlay.enabled=true;bladeRecord.meshInstance.visible=false;renderer.manualTick();const overlayOnly=silhouette(pixels(),base);
    bladeRecord.meshInstance.visible=true;renderer.manualTick();const combined=silhouette(pixels(),base);snapshots.sameFrameCombined=canvas.toDataURL("image/png");
    const bladePixels=bladeOnly.filter((p)=>p.y<205),overlayPixels=overlayOnly.filter((p)=>p.y<205),combinedPixels=combined.filter((p)=>p.y<205);
    const combinedSet=new Set(combinedPixels.map((p)=>p.y*canvas.width+p.x));
    const bladeCovered=bladePixels.filter((p)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(combinedSet.has((p.y+dy)*canvas.width+p.x+dx))return true;return false;}).length;
    const sameFrameEvidence={bladePixels:bounds(bladePixels),overlayPixels:bounds(overlayPixels),combinedPixels:bounds(combinedPixels),bladeCovered,bladeMeshWorld:bounds(bladeVertices),bladeMeshProjected:bounds(bladeVertices.map(screen)),overlayMeshProjected:bounds(meshVertices(liveOverlay).map(screen)),scoredStart:screen(liveCollider.capsule.start),scoredEnd:screen(liveCollider.capsule.end),bladeRoot:{position:{...liveBlade.parent.getPosition()},scale:{...liveBlade.parent.getLocalScale()},rotation:{...liveBlade.parent.getRotation()}},bladeChild:{rotation:{...liveBlade.getLocalRotation()}}};
    // Test-style equipment preview: compare Show on/off on the SAME authored
    // GLB frame, not a collider-only scene or a comparison across pose histories.
    const previewCases=[];
    for(const [name,pose] of [["left-up",up],["left-diagonal",diagonal],["right-diagonal",right]]){
      for(const record of glbAll)record.meshInstance.visible=true;
      renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,colliderSettings:{...settings,colliderVisible:false},equipmentColliderPoses:[pose]},[],null,[pose],null);
      const off=pixels();
      renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[pose]},[],null,[pose],null);
      const on=pixels(),outline=(renderer.flowColliderCapsulePool??[]).find((candidate)=>candidate.enabled&&candidate.name===`equipment-collider-volume-${pose.role.replace("_wrist","")}`);
      if(!outline)throw new Error(`Missing active Test preview collider for ${name}`);
      if(name==="left-diagonal"){snapshots.testStyleShowOff=(()=>{renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,colliderSettings:{...settings,colliderVisible:false},equipmentColliderPoses:[pose]},[],null,[pose],null);return canvas.toDataURL("image/png");})();renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[pose]},[],null,[pose],null);snapshots.testStyleShowOn=canvas.toDataURL("image/png");}
      previewCases.push({name,...compare(on,off),edgeMaterial:{opacity:outline.render.meshInstances[1].material.opacity,depthTest:outline.render.meshInstances[1].material.depthTest},edgeMeshVertices:outline.render.meshInstances[1].mesh.vertexBuffer.numVertices});
    }
    const twoHandFrame={...frame,equipmentColliderPoses:[up,right]};
    renderer.renderGameplayFrameWithCursorsAndEquipment({...twoHandFrame,colliderSettings:{...settings,colliderVisible:false}},[],null,[up,right],null);const twoHandOff=pixels();
    renderer.renderGameplayFrameWithCursorsAndEquipment(twoHandFrame,[],null,[up,right],null);const twoHandOn=pixels();
    previewCases.push({name:"both-hands",...compare(twoHandOn,twoHandOff)});
    renderer.renderGameplayFrameWithCursorsAndEquipment({...twoHandFrame,colliderSettings:{...settings,colliderScale:0}},[],null,[up,right],null);const zeroPreview=compare(pixels(),twoHandOff);
    renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[]},[],null,[up,right],null);const lostPreview=compare(pixels(),twoHandOff);
    const preview={cases:previewCases,zeroPreview,lostPreview};
    for(const record of glbAll)record.meshInstance.visible=true;
    renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null);
    for(const [name,pose,other,scale,front,rear] of [["up",up,false,1,1,0],["down",down,false,1,1,0],["diagonal",diagonal,false,1,1,0],["second-slot",right,true,1,1,0],["zero-length",up,false,1,0,0],["scaled",scaled,false,2,1,0],["tiny",up,false,.00001,.00001,0],["huge",up,false,9999999,9999999,0],["huge-both",up,false,1,9999999,9999999]]){
      // Prime a two-capsule pool first, then leave slot 0 disabled while the named right-hand
      // collider occupies slot 1 alongside an independent wrist-bomb overlay entity.
      if(name==="second-slot")renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[up,right]},[],null,[],null);
      const request={...frame,equipmentColliderPoses:[pose],colliderSettings:{...settings,colliderScale:scale,colliderDepthForward:front,colliderDepthBackward:rear,...(other?{visibleWristObstacleRadius:true,wristBombColliderScale:1}:{})},...(other?{equipmentColliderAnchors:{left:null,right:{x:1,y:1,z:.45}}}:{})};
      const model=renderer.renderGameplayFrameWithCursorsAndEquipment(request,[],null,[],null).model;
      const visibleCollider=model.objects.find((object)=>object.kind==="collider_volume"&&object.role===pose.role.replace("_wrist",""));
      const entity=(renderer.flowColliderCapsulePool??[]).find((candidate)=>candidate.enabled&&candidate.name===visibleCollider?.id);
      if(!entity)throw new Error(`No active named capsule for ${name}`);
      const capsule=visibleCollider.capsule,length=Math.hypot(capsule.end.x-capsule.start.x,capsule.end.y-capsule.start.y,capsule.end.z-capsule.start.z);
      const vertices=meshVertices(entity),axis=length===0?{x:0,y:1,z:0}:{x:(capsule.end.x-capsule.start.x)/length,y:(capsule.end.y-capsule.start.y)/length,z:(capsule.end.z-capsule.start.z)/length};
      const coordinate=(point)=>point.x*axis.x+point.y*axis.y+point.z*axis.z;
      const meshAxis=[Math.min(...vertices.map(coordinate)),Math.max(...vertices.map(coordinate))];
      const meshRadius=Math.max(...vertices.map((point)=>{const axial=coordinate(point)-coordinate(capsule.start),center={x:capsule.start.x+axial*axis.x,y:capsule.start.y+axial*axis.y,z:capsule.start.z+axial*axis.z};return Math.hypot(point.x-center.x,point.y-center.y,point.z-center.z);}));
      const image=pixels(),points=silhouette(image,base);
      if(name==="up"||name==="diagonal")snapshots[name]=canvas.toDataURL("image/png");
      const camera=renderer.cameraEntity.camera;
      const project=(point)=>{const p=camera.worldToScreen(new (entity.getPosition().constructor)(point.x,point.y,point.z));return{x:p.x,y:p.y};};
      const near=project(capsule.start),far=project(capsule.end),axisScreen={x:far.x-near.x,y:far.y-near.y},span=Math.hypot(axisScreen.x,axisScreen.y),unit=span===0?{x:0,y:-1}:{x:axisScreen.x/span,y:axisScreen.y/span};
      const projected=points.map((point)=>(point.x-near.x)*unit.x+(point.y-near.y)*unit.y);
      const radiusProbe=project({x:capsule.start.x+capsule.radius,y:capsule.start.y,z:capsule.start.z});
      const screenRadius=Math.hypot(radiusProbe.x-near.x,radiusProbe.y-near.y);
      rows.push({name,scale,front,rear,capsule,entityEnabled:entity.enabled,entityName:entity.name,activeCapsules:(renderer.flowColliderCapsulePool??[]).filter((candidate)=>candidate.enabled).map((candidate)=>candidate.name),otherOverlayEnabled:(renderer.wristBombColliderPool??[]).some((candidate)=>candidate.enabled),material:{depthTest:entity.render.meshInstances[0].material.depthTest,depthWrite:entity.render.meshInstances[0].material.depthWrite,opacity:entity.render.meshInstances[0].material.opacity},pixels:delta(image,base),silhouette:{min:Math.min(...projected),max:Math.max(...projected),span,radius:screenRadius,count:points.length},meshAxis,expectedMeshAxis:[coordinate(capsule.start)-capsule.radius,coordinate(capsule.end)+capsule.radius],meshRadius,pool:(renderer.flowColliderCapsulePool??[]).length});
    }
    const scaleZero=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,colliderSettings:{...settings,colliderScale:0},equipmentColliderPoses:[up]},[],null,[],null).model.objects.filter((object)=>object.kind==="collider_volume").length;
    const zeroPixels=delta(pixels(),base),zeroEnabled=(renderer.flowColliderCapsulePool??[]).some((entity)=>entity.enabled);
    const held=renderer.renderGameplayFrameWithCursorsAndEquipment({...frame,equipmentColliderPoses:[down]},[],null,[],null).model.objects.find((object)=>object.kind==="collider_volume")?.capsule;
    const missing=renderer.renderGameplayFrameWithCursorsAndEquipment(frame,[],null,[],null).model.objects.filter((object)=>object.kind==="collider_volume").length;
    const lostPixels=delta(pixels(),base),enabled=(renderer.flowColliderCapsulePool??[]).some((entity)=>entity.enabled);
    renderer.destroyColliderOverlayPools();
    return{rows,solidBlade,sameFrameEvidence,preview,scaleZero,zeroPixels,zeroEnabled,held,missing,lostPixels,enabled,poolAfterDestroy:renderer.flowColliderCapsulePool.length,snapshots};
  },{up,down,diagonal,right,scaled});
  assert.deepEqual(noise,[],`browser console: ${JSON.stringify(noise)}`);
  for(const [name,dataUrl] of Object.entries(evidence.snapshots)){
    assert.match(dataUrl,/^data:image\/png;base64,/);
    await writeFile(resolve(evidenceDirectory,`${name}-after.png`),Buffer.from(dataUrl.slice("data:image/png;base64,".length),"base64"));
  }
  const aligned=evidence.sameFrameEvidence,alignmentReport=JSON.stringify(aligned);
  console.log("GLB Test-style Show on/off GPU pixels",JSON.stringify(evidence.preview));
  for(const preview of evidence.preview.cases){
    assert.ok(preview.changed>180&&preview.contrasting>100,`${preview.name} must show high-contrast true-radius edges over real GLB: ${JSON.stringify(preview)}`);
    if(preview.edgeMaterial){assert.equal(preview.edgeMaterial.depthTest,false);assert.equal(preview.edgeMaterial.opacity,.8);assert.equal(preview.edgeMeshVertices,360);}
  }
  assert.deepEqual(evidence.preview.zeroPreview,{changed:0,contrasting:0},"Scale0 removes Show without hiding either GLB");
  assert.deepEqual(evidence.preview.lostPreview,{changed:0,contrasting:0},"lost pose removes Show while GLB equipment preview is still staged");
  console.log("Same-frame solid GLB/overlay projected bounds",alignmentReport);
  const [upRow,downRow,diagonalRow,secondSlotRow,zeroLengthRow,scaledRow,tinyRow,hugeRow,hugeBothRow]=evidence.rows;
  assert.ok(aligned.bladePixels.count>20&&aligned.overlayPixels.count>20&&aligned.combinedPixels.count>20,`same-pose solid blade and active overlay render real pixels: ${alignmentReport}`);
  assert.ok(Math.abs(upRow.capsule.radius-.024)<1e-9,"Scale1 overlay uses same .024 radius as pinned solid GLB blade");
  assert.ok(Math.abs(aligned.bladeRoot.position.x-upRow.capsule.start.x)<1e-6&&Math.abs(aligned.bladeRoot.position.y-upRow.capsule.start.y)<1e-6&&Math.abs(aligned.bladeRoot.position.z-upRow.capsule.start.z)<1e-6,`GLB and scored capsule share the identical pose root: ${alignmentReport}`);
  assert.ok(Math.abs(aligned.bladeMeshWorld.minY-1.18)<1e-5&&Math.abs(aligned.bladeMeshWorld.maxY-1.726)<1e-5,`solid blade is authored hilt-inset and tip-rounded; no artificial renderer axial stretch: ${alignmentReport}`);
  assert.ok(Math.abs(aligned.scoredStart.y-195)<.1&&Math.abs(aligned.scoredEnd.y-122.806)<.1,`scored hilt/tip project to the expected same-frame camera coordinates: ${alignmentReport}`);
  for(const [name,pixel,mesh] of [["solid GLB",aligned.bladePixels,aligned.bladeMeshProjected],["scored overlay",aligned.overlayPixels,aligned.overlayMeshProjected]]){
    assert.ok(Math.abs(pixel.minY-mesh.minY)<=2&&Math.abs(pixel.maxY-mesh.maxY)<=2,`${name} actual framebuffer endpoints follow its own projected GPU mesh, without clipping: ${alignmentReport}`);
    assert.ok(Math.abs(pixel.minX-mesh.minX)<=2&&Math.abs(pixel.maxX-mesh.maxX)<=2,`${name} actual framebuffer cross-section follows its own projected GPU mesh: ${alignmentReport}`);
  }
  assert.ok(aligned.overlayMeshProjected.minY<aligned.bladeMeshProjected.minY&&aligned.overlayMeshProjected.maxY>aligned.bladeMeshProjected.maxY,`scored capsule encloses the authored inset solid blade at both endpoints: ${alignmentReport}`);
  assert.ok(aligned.bladeCovered/aligned.bladePixels.count>.98,`combined same-frame render retains at least 98% of bright solid blade pixels: ${alignmentReport}`);
  assert.ok(Math.abs(aligned.combinedPixels.minY-aligned.overlayPixels.minY)<=1&&Math.abs(aligned.combinedPixels.maxY-aligned.overlayPixels.maxY)<=1,`combined same-frame silhouette retains both scored overlay poles: ${alignmentReport}`);
  for(const row of evidence.rows){assert.equal(row.entityEnabled,true);assert.ok(row.pixels.count>0||row.name==="tiny"||row.name==="huge"||row.name==="huge-both",`${row.name} must render actual browser pixels or truthfully be subpixel/offscreen: ${JSON.stringify(row)}`);assert.equal(row.material.depthTest,false);assert.equal(row.material.depthWrite,false);assert.equal(row.material.opacity,.16);assert.equal(row.pool,2);assert.equal(row.capsule.start.y,1-.75*(row.name==="scaled"?2:1)*row.rear);assert.ok(Math.abs(row.capsule.radius-.024*(row.name==="scaled"?2:1)*row.scale)<1e-6,`${row.name} scored solid blade radius times Flow Scale and pose scale`);}
  assert.equal(secondSlotRow.entityName,"equipment-collider-volume-right");
  assert.deepEqual(secondSlotRow.activeCapsules,[secondSlotRow.entityName],"inactive slot 0 must not substitute for the active right collider");
  assert.equal(secondSlotRow.otherOverlayEnabled,true,"wrist bomb overlay coexists with the named capsule");
  assert.deepEqual(zeroLengthRow.capsule.start,zeroLengthRow.capsule.end,"front0+rear0 keeps scored centerline at the hilt");
  assert.ok(zeroLengthRow.pixels.count>0,"positive-radius zero-length capsule renders a safe sphere");
  assert.ok(scaledRow.meshRadius>upRow.meshRadius*3.9,"Scale2 and pose.scale2 enlarge real mesh cross-section fourfold");
  assert.ok(tinyRow.meshRadius>0&&hugeRow.meshRadius>0&&Number.isFinite(hugeRow.meshAxis[1]),"tiny/huge values retain finite pooled geometry");
  assert.ok(Math.abs(hugeBothRow.capsule.start.y-(1-.75*9999999))<1e-6&&Math.abs(hugeBothRow.capsule.end.y-(1+.75*9999999))<1e-6,"both huge front and rear remain signed around the actual pose hilt");
  assert.ok(Number.isFinite(hugeBothRow.meshAxis[0])&&Number.isFinite(hugeBothRow.meshAxis[1])&&hugeBothRow.meshAxis[0]<0&&hugeBothRow.meshAxis[1]>0&&hugeBothRow.meshRadius>0,"both huge directions preserve finite bounded-size pooled GPU mesh");
  assert.equal(hugeBothRow.pool,2,"both huge directions reuse the same bounded pooled GPU entities");
  assert.equal(evidence.scaleZero,0,"Scale0 has no model volume");
  assert.equal(evidence.zeroEnabled,false,"Scale0 synchronously disables the pooled hit outline");
  assert.equal(evidence.zeroPixels.count,0,"Scale0 restores baseline framebuffer pixels");
  for(const row of evidence.rows){
    const error=Math.max(Math.abs(row.meshAxis[0]-row.expectedMeshAxis[0]),Math.abs(row.meshAxis[1]-row.expectedMeshAxis[1]));
    const vertexTolerance=Math.max(.005,(row.front+row.rear)*.75*row.scale*1e-7,row.capsule.radius*1e-7);
    assert.ok(error<vertexTolerance,`${row.name} actual Float32 PlayCanvas mesh poles must lie at scored centerline ± radius; ${JSON.stringify(row)}`);
    assert.ok(Math.abs(row.meshRadius-row.capsule.radius)<vertexTolerance,`${row.name} real mesh cross-section matches scored radius`);
    if(row.name!=="tiny"&&row.name!=="huge"&&row.name!=="huge-both"){
      const overlayAllowance=row.otherOverlayEnabled?16:9;
      assert.ok(row.silhouette.count>0&&row.silhouette.min>=-row.silhouette.radius-overlayAllowance&&row.silhouette.max<=row.silhouette.span+row.silhouette.radius+overlayAllowance,`${row.name} framebuffer must stay within projected scored capsule endpoints ± radius, accounting for independent wrist overlay; ${JSON.stringify(row)}`);
    }
  }
  assert.ok(upRow.capsule.end.y>1.74&&downRow.capsule.end.y<.26&&diagonalRow.capsule.end.y>1.5,"oriented volume tip follows hand up/down/diagonal");
  assert.ok(upRow.pixels.minY<downRow.pixels.minY-35&&downRow.pixels.maxY>upRow.pixels.maxY+35,`opposite real framebuffer silhouettes: ${JSON.stringify(evidence.rows)}`);
  assert.deepEqual(evidence.held,downRow.capsule,"held pose stays anchored");
  assert.equal(evidence.missing,0,"lost pose emits no volume");
  assert.equal(evidence.enabled,false,"old pooled overlay is disabled synchronously");
  assert.equal(evidence.lostPixels.count,0,"lost pose restores exact baseline pixels, no stale overlay");
  assert.equal(evidence.poolAfterDestroy,0);
  console.log("Flow named active capsule mesh/framebuffer silhouettes for up/down/diagonal and second pooled slot, held/lost absence passed.");
  await page.close();
}finally{await browser.close();await new Promise((done)=>server.close(done));}
