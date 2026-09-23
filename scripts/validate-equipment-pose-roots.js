// @ts-check

import assert from "node:assert/strict";
import * as pc from "playcanvas";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { createAeroPlayCanvasRenderer } from "../src/index.js";

const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,mode,anchor,scale,orientation)=>({role,mode,anchor,scale,orientation,geometryIdentity:mode==="flow"?saberCapsuleGeometry.identity:gloveObbGeometry.identity,configIdentity});
const identity=equipmentEulerDegreesToQuaternion({x:0,y:0,z:0});
const approx=(actual,expected,message,epsilon=1e-6)=>assert.ok(Math.abs(actual-expected)<=epsilon,`${message}: ${actual} != ${expected}`);
const vec=(value)=>[value.x,value.y,value.z];
const approxVec=(actual,expected,message)=>actual.forEach((value,index)=>approx(value,expected[index],`${message}[${index}]`));

function isolatedRenderer(loaderMode="fallback"){
  const renderer=createAeroPlayCanvasRenderer();
  const root=new pc.Entity("test-root");root._enabledInHierarchy=true;
  renderer.app={root};
  renderer.createEquipmentPoseRoot=(assetId)=>{const role=assetId.endsWith(":left_wrist")?"left_wrist":"right_wrist";let entity=renderer.equipmentPoseRoots.get(role);if(!entity){entity=new pc.Entity(`equipment-${role}-pose-root`);entity.enabled=false;root.addChild(entity);renderer.equipmentPoseRoots.set(role,entity);}return entity;};
  renderer.makeDetachedEntity=(name,type)=>{const entity=new pc.Entity(name);entity.type=type;return entity;};
  renderer.updateEquipmentMaterial=()=>{};
  renderer.applyEquipmentGlbAppearance=()=>{};
  renderer.gameplayAssetLoader.describe=()=>({state:loaderMode});
  if(loaderMode==="ready")renderer.gameplayAssetLoader.resourceFor=()=>({instantiateRenderEntity:()=>{const entity=new pc.Entity("shipped-glb");entity.findComponents=()=>[];return entity;}});
  return renderer;
}

for(const scale of[1,2]){
  const renderer=isolatedRenderer();
  const record=pose("left_wrist","flow",{x:1.5,y:1,z:.45},scale,identity);
  const result=renderer.stageGameplayEquipment([record],null,true);
  assert.deepEqual(result,{equipmentCount:1,roles:["left_wrist"]});
  const entries=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist"),[root,hilt,blade,glow]=entries;
  assert.equal(entries.length,4,"fallback saber owns one root and exactly three bounded children");
  assert.equal(hilt.parent,root);assert.equal(blade.parent,root);assert.equal(glow.parent,root,"model/core/glow must share one ancestry root");
  approxVec(vec(root.getPosition()),[0,1,.45],"judge anchor projects to presentation world once at the root");
  approxVec(vec(root.getLocalScale()),[scale,scale,scale],"root owns positive uniform scale");
  approxVec(vec(hilt.getLocalPosition()),[.09,0,0],"hilt local midpoint");approxVec(vec(blade.getLocalPosition()),[.465,0,0],"blade local midpoint");approxVec(vec(glow.getLocalPosition()),[.48,0,0],"glow local midpoint");
  approxVec(vec(hilt.getLocalScale()),[.06,.18,.06],"PlayCanvas cylinder dimensions are [diameter,length,diameter]");
  approxVec(vec(blade.getLocalScale()),[.048,.57,.048],"blade local dimensions");approxVec(vec(glow.getLocalScale()),[.09,.60,.09],"glow local dimensions");
  const bladeWorld=blade.getPosition(),glowWorld=glow.getPosition();
  approx(bladeWorld.x,.465*scale,"blade midpoint inherits root scale");approx(glowWorld.x,.48*scale,"glow midpoint inherits root scale");
  renderer.stageGameplayEquipment([record],null,true);
  assert.equal(renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist").length,4,"repeated staging cannot grow the pool");
  renderer.stageGameplayEquipment([],null,true);assert.equal(root.enabled,false,"empty staging disables the complete pose root");
}

{
  const renderer=isolatedRenderer();
  const combined=equipmentEulerDegreesToQuaternion({x:35,y:-20,z:70});
  renderer.stageGameplayEquipment([
    pose("left_wrist","flow",{x:.5,y:2,z:.45},1,combined),
    pose("right_wrist","flow",{x:2.5,y:0,z:.45},2,equipmentEulerDegreesToQuaternion({x:0,y:0,z:90}))
  ],null,true);
  const left=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist"),right=renderer.equipmentPools.get("equipment/flow-saber-v1:right_wrist");
  assert.notEqual(left[0],right[0],"roles own isolated roots");assert.notEqual(left[3],right[3],"roles own isolated glow children");
  const actual=left[0].getLocalRotation();approx(actual.x,combined.x,"combined quaternion x");approx(actual.y,combined.y,"combined quaternion y");approx(actual.z,combined.z,"combined quaternion z");approx(actual.w,combined.w,"combined quaternion w");
  approxVec(vec(right[0].getLocalScale()),[2,2,2],"right scale 2");
}

{
  const renderer=isolatedRenderer(),record=pose("left_wrist","flow",{x:1.5,y:1,z:.45},1,identity);
  renderer.stageGameplayEquipment([record],null,true);const before=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist"),root=before[0];
  renderer.gameplayAssetLoader.describe=()=>({state:"ready"});renderer.gameplayAssetLoader.resourceFor=()=>({instantiateRenderEntity:()=>{const entity=new pc.Entity("transition-glb");entity.findComponents=()=>[];return entity;}});
  renderer.stageGameplayEquipment([record],null,true);const ready=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist"),model=renderer.equipmentGlbEntities.get("equipment/flow-saber-v1:left_wrist");
  assert.equal(ready[0],root);assert.equal(ready.length,5,"fallback-to-GLB transition remains bounded to root + fallback pair + glow + model");assert.equal(model.parent,root);assert.ok(before.slice(1,3).every((entity)=>entity.enabled===false));
  renderer.gameplayAssetLoader.describe=()=>({state:"fallback"});renderer.stageGameplayEquipment([record],null,true);assert.equal(model.enabled,false);assert.equal(renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist").length,5,"mode transitions do not grow pools");assert.equal(renderer.equipmentDiagnostics.assetMode,"primitive","disabled resident GLB cannot falsify active fallback diagnostics");
}

{
  const renderer=isolatedRenderer();
  renderer.stageGameplayEquipment([pose("left_wrist","flow",{x:1.5,y:1,z:.45},1,identity)],null,true);const flowRoot=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")[0];
  renderer.stageGameplayEquipment([pose("left_wrist","boxing",{x:1.5,y:1,z:.45},.75,identity)],null,true);const boxingRoot=renderer.equipmentPools.get("equipment/boxing-glove-v1:left_wrist")[0];
  assert.deepEqual(renderer.equipmentDiagnostics.modes,["left_wrist:boxing"],"shared root diagnostics derive mode from enabled children");
  assert.equal(flowRoot,boxingRoot,"one role owns exactly one pose root across equipment modes");assert.equal(renderer.equipmentPoseRoots.size,1);
  assert.ok(renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist").slice(1).every((entity)=>entity.enabled===false),"mode switch disables prior mode children");
}

{
  const renderer=isolatedRenderer("ready");
  renderer.stageGameplayEquipment([pose("left_wrist","flow",{x:1.5,y:1,z:.45},1,identity)],null,true);
  const [root,model,glow]=renderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist");
  assert.equal(model.parent,root);assert.equal(glow.parent,root,"GLB and shared glow must inherit the same root");
  const axis=model.getLocalRotation().transformVector(new pc.Vec3(0,0,-1));
  approx(axis.x,1,"shipped GLB local -Z is corrected to pose-local +X");approx(axis.y,0,"GLB axis correction y");approx(axis.z,0,"GLB axis correction z");
}

{
  const renderer=isolatedRenderer("ready");
  const combined=equipmentEulerDegreesToQuaternion({x:-25,y:40,z:15});
  renderer.stageGameplayEquipment([
    pose("left_wrist","boxing",{x:1,y:1,z:.45},.75,combined),
    pose("right_wrist","boxing",{x:2,y:1,z:.45},.75,combined)
  ],null,true);
  const left=renderer.equipmentPools.get("equipment/boxing-glove-v1:left_wrist"),right=renderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist");
  approxVec(vec(left[0].getLocalScale()),[.75,.75,.75],"left boxing scale");approxVec(vec(right[0].getLocalScale()),[.75,.75,.75],"right boxing scale");
  assert.ok(left[0].getLocalScale().x>0&&right[0].getLocalScale().x>0,"pose roots never mirror with negative scale");
  approxVec(vec(left[1].getLocalScale()),[1,1,1],"left glove child scale");approxVec(vec(right[1].getLocalScale()),[-1,1,1],"right glove mirrors on the visual child only");
  approxVec(vec(left[1].getLocalPosition()),[0,0,.05],"glove child offset");
}

{
  const renderer=isolatedRenderer(),calls=[];renderer.updateEquipmentMaterial=(entity,colorToken)=>calls.push({name:entity.name,colorToken});
  const combined=equipmentEulerDegreesToQuaternion({x:15,y:30,z:-40});
  renderer.stageGameplayEquipment([
    pose("left_wrist","boxing",{x:1,y:1,z:.45},.75,combined),
    pose("right_wrist","boxing",{x:2,y:1,z:.45},.75,combined)
  ],null,true);
  const left=renderer.equipmentPools.get("equipment/boxing-glove-v1:left_wrist"),right=renderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist");
  assert.equal(left[1].parent,left[0]);assert.equal(left[2].parent,left[0]);assert.notEqual(left[0],right[0]);
  approxVec(vec(left[0].getLocalScale()),[.75,.75,.75],"fallback glove root scale");approxVec(vec(right[0].getLocalScale()),[.75,.75,.75],"fallback mirrored glove root scale");
  const actual=left[0].getLocalRotation();approx(actual.x,combined.x,"fallback glove quaternion x");approx(actual.y,combined.y,"fallback glove quaternion y");approx(actual.z,combined.z,"fallback glove quaternion z");approx(actual.w,combined.w,"fallback glove quaternion w");
  assert.ok(left[0].getLocalScale().x>0&&right[0].getLocalScale().x>0);assert.ok(right[1].getLocalScale().x<0,"fallback right mirror remains child-local");
  assert.ok(calls.some((entry)=>entry.name==="equipment-left_wrist-body"&&entry.colorToken==="#2693ff"));assert.ok(calls.some((entry)=>entry.name==="equipment-right_wrist-body"&&entry.colorToken==="#39c96b"),"fallback preserves per-role colors");
}

{
  const renderer=isolatedRenderer();
  const valid=pose("left_wrist","flow",{x:1.5,y:1,z:.45},1,identity);
  for(const invalid of[
    {...valid,direction:{x:1,y:0}},
    {...valid,rotationZDeg:0},
    {...valid,scale:0},
    {...valid,orientation:{x:0,y:0,z:0,w:.9}},
    {...valid,geometryIdentity:gloveObbGeometry.identity}
  ])assert.equal(renderer.stageGameplayEquipment([invalid],null,true).equipmentCount,0,"strict pose adapter rejects aliases or invalid authority");
}

console.log("Resolved equipment pose-root validation passed.");
