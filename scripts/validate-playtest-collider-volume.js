// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";
import { createAeroPlayCanvasRenderer, projectEquipmentColliderAnchors } from "../src/renderer-facade.js";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { colliderSettingsDefaults, resolveColliderBounds } from "@aerobeat/web-contracts/collider-contracts";

const settings=(colliderVisible,colliderScale=1,colliderDepthForward=1,colliderDepthBackward=1)=>({colliderVisible,colliderScale,colliderDepthForward,colliderDepthBackward});
const boxes=(model)=>model.objects.filter((object)=>object.kind==="collider_volume");
for(const presentation of ["flow","boxing_collider","boxing_lanes"]){
  const frame={presentation,nowMs:1000,targets:[],timingWindowBeforeMs:120,timingWindowAfterMs:240,colliderSettings:settings(false,1,2,3)};
  const hidden=buildGameplaySceneModel(frame);
  assert.equal(boxes(hidden).length,0);
  assert.equal(hidden.objects.some((object)=>object.kind==="timing"),false,"collider mode removes legacy timing tiles");
  const shown=buildGameplaySceneModel({...frame,colliderSettings:settings(true,1.5,2,3)});
  assert.deepEqual(boxes(shown).map((object)=>object.position.x),[-1.5,1.5]);
  assert.ok(Math.abs(boxes(shown)[0].scale.x-(presentation==="flow"?1.125:1.35))<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].scale.y-(presentation==="flow"?1.125:1.35))<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].scale.z-5.4)<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].position.z-.54)<1e-12);
  assert.equal(boxes(shown)[0].alpha,.16);
  const anchors={left:{x:-.7,y:2,z:.4},right:{x:1.2,y:.6,z:-.3}};
  const tracked=buildGameplaySceneModel({...frame,colliderSettings:settings(true,1.5,2,3),equipmentColliderAnchors:anchors});
  for(const [index,hand] of ["left","right"].entries()){
    const box=boxes(tracked)[index],center=anchors[hand],halfExtent=presentation==="flow"?.375:.45;
    const expected=resolveColliderBounds({mode:presentation==="flow"?"flow":"boxing",center,halfWidth:halfExtent,halfHeight:halfExtent,settings:settings(true,1.5,2,3)});
    assert.ok(Math.abs(box.position.x-center.x)<1e-12&&Math.abs(box.position.y-center.y)<1e-12&&Math.abs(box.position.z-(expected.minZ+expected.maxZ)/2)<1e-12);
    assert.deepEqual(box.scale,{x:expected.maxX-expected.minX,y:expected.maxY-expected.minY,z:expected.maxZ-expected.minZ});
  }
  const partial=buildGameplaySceneModel({...frame,colliderSettings:settings(true),equipmentColliderAnchors:{left:anchors.left,right:null}});
  assert.equal(boxes(partial)[0].position.x,anchors.left.x);
  assert.equal(boxes(partial)[1].position.x,1.5,"missing right pose falls back independently");
  assert.equal(buildGameplaySceneModel({...frame,colliderSettings:settings(false),equipmentColliderAnchors:anchors}).objects.some((object)=>object.kind==="collider_volume"),false);
}
const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,mode,anchor)=>({role,mode,anchor,scale:1,orientation:equipmentEulerDegreesToQuaternion({x:0,y:0,z:0}),geometryIdentity:mode==="flow"?saberCapsuleGeometry.identity:gloveObbGeometry.identity,configIdentity});
for(const mode of ["flow","boxing"]){
  const anchors=projectEquipmentColliderAnchors([pose("left_wrist",mode,{x:1.5,y:2,z:.45}),pose("right_wrist",mode,{x:2.5,y:0,z:.5})],mode==="flow"?"flow":"boxing_collider");
  assert.deepEqual(anchors,{left:{x:0,y:2,z:.45},right:{x:1,y:0,z:.5}},"collider and staged equipment use identical judge-to-presentation anchors");
  assert.deepEqual(projectEquipmentColliderAnchors([pose("left_wrist",mode,{x:1.5,y:2,z:.45})],mode==="flow"?"flow":"boxing_lanes"),{left:{x:0,y:2,z:.45},right:null},"missing equipment pose falls back only for its hand");
}
assert.equal(colliderSettingsDefaults.flow.colliderDepthForward,1);
for(const bad of [null,settings(true,0),settings(true,1,.9),settings(true,1,Infinity),{...settings(true),extra:1},{...settings(true),colliderVisible:1}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[],colliderSettings:bad}),/collider_settings_invalid/);
for(const bad of [null,{left:{x:0,y:1,z:0}},{left:{x:0,y:1,z:NaN},right:null}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[],colliderSettings:settings(true),equipmentColliderAnchors:bad}),/Equipment collider anchors are invalid/);
// Exercise the actual collider material path with two different song palettes and modes.
const renderer=createAeroPlayCanvasRenderer();
const paletteSymbol=Symbol.for("aerobeat.web-renderer.internal-effective-palette");
const material={diffuse:{set(...rgb){this.rgb=rgb;}},emissive:{set(...rgb){this.rgb=rgb;}},update(){}};
const entity={findComponents(){return[{meshInstances:[{material}],layers:[]}];},setPosition(){},setLocalScale(){},setEulerAngles(){}};
for(const presentation of ["flow","boxing_collider"]){
  const model=buildGameplaySceneModel({presentation,nowMs:1000,targets:[],colliderSettings:settings(true)});
  for(const [left,right] of [["#AABBCC","#123456"],["#FF0088","#00DD33"]]){
    renderer[paletteSymbol](left,right);
    for(const [index,color] of [left,right].entries()){
      renderer.applyColliderOverlayAppearance(boxes(model)[index],entity);
      const rgb=color.match(/[\dA-F]{2}/g).map((channel)=>parseInt(channel,16)/255);
      assert.deepEqual(material.diffuse.rgb,rgb,`${presentation} ${index===0?"left":"right"} collider follows its equipment color`);
      assert.deepEqual(material.emissive.rgb,rgb);
      assert.equal(material.opacity,.16,"collider transparency stays unchanged");
      assert.equal(material.depthTest,true);
      assert.equal(material.depthWrite,false);
    }
  }
}
renderer[paletteSymbol](null,null);
const miss=(id,hand)=>({id,kind:"flow",hand,family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,judgement:"miss",missCommitMs:1181});
for(const nowMs of [1181,1281,1529]){
  const result=buildGameplaySceneModel({presentation:"flow",nowMs,targets:[miss("left","left"),miss("right","right")]});
  assert.deepEqual(result.objects.filter((object)=>object.kind==="feedback").map((object)=>object.position),[{x:-1.5,y:1.5,z:1.5},{x:1.5,y:1.5,z:1.5}]);
  assert.equal(result.objects.filter((object)=>object.kind==="feedback").length,2,"no duplicate moving label");
}
assert.equal(buildGameplaySceneModel({presentation:"flow",nowMs:1531,targets:[miss("left","left")]}).objects.some((object)=>object.kind==="feedback"),false);
console.log("Two tracked/fallback collider volumes, shared bounds, visibility, miss spots, and lifecycle passed.");
