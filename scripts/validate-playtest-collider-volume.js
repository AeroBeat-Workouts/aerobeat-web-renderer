// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";
import { createAeroPlayCanvasRenderer, projectEquipmentColliderAnchors } from "../src/renderer-facade.js";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { colliderSettingsDefaults, normalizeColliderSettings, resolveColliderBounds } from "@aerobeat/web-contracts/collider-contracts";

const settings=(colliderVisible,colliderScale=1,colliderDepthForward=1,colliderDepthBackward=1)=>({colliderVisible,colliderScale,colliderDepthForward,colliderDepthBackward});
const boxes=(model)=>model.objects.filter((object)=>object.kind==="collider_volume");
const flowVolume=(model)=>boxes(model)[0];
assert.deepEqual(normalizeColliderSettings(settings(false)),{...settings(false),visibleWristObstacleRadius:false,wristBombColliderScale:1},"legacy four-field renderer callers receive both new defaults");
assert.deepEqual(normalizeColliderSettings({...settings(false),visibleWristObstacleRadius:true,wristBombColliderScale:.5}),{...settings(false),visibleWristObstacleRadius:true,wristBombColliderScale:.5},"six-field renderer callers preserve explicit wrist settings");
for(const presentation of ["boxing_collider","boxing_lanes"]){
  const frame={presentation,nowMs:1000,targets:[],timingWindowBeforeMs:120,timingWindowAfterMs:240,colliderSettings:settings(false,1,2,3)};
  const hidden=buildGameplaySceneModel(frame);
  assert.equal(boxes(hidden).length,0);
  assert.equal(hidden.objects.some((object)=>object.kind==="timing"),false,"collider mode removes legacy timing tiles");
  const shown=buildGameplaySceneModel({...frame,colliderSettings:settings(true,1.5,2,3),equipmentColliderAnchors:{left:{x:-1.5,y:1.5,z:0},right:{x:1.5,y:1.5,z:0}}});
  assert.deepEqual(boxes(shown).map((object)=>object.position.x),[-1.5,1.5]);
  assert.ok(Math.abs(boxes(shown)[0].scale.x-1.35)<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].scale.y-1.35)<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].scale.z-5.4)<1e-12);
  assert.ok(Math.abs(boxes(shown)[0].position.z-.54)<1e-12);
  assert.equal(boxes(shown)[0].alpha,.16);
  const anchors={left:{x:-.7,y:2,z:.4},right:{x:1.2,y:.6,z:-.3}};
  const tracked=buildGameplaySceneModel({...frame,colliderSettings:settings(true,1.5,2,3),equipmentColliderAnchors:anchors});
  for(const [index,hand] of ["left","right"].entries()){
    const box=boxes(tracked)[index],center=anchors[hand],halfExtent=.45;
    const expected=resolveColliderBounds({mode:presentation==="flow"?"flow":"boxing",center,halfWidth:halfExtent,halfHeight:halfExtent,settings:normalizeColliderSettings(settings(true,1.5,2,3))});
    assert.ok(Math.abs(box.position.x-center.x)<1e-12&&Math.abs(box.position.y-center.y)<1e-12&&Math.abs(box.position.z-(expected.minZ+expected.maxZ)/2)<1e-12);
    assert.deepEqual(box.scale,{x:expected.maxX-expected.minX,y:expected.maxY-expected.minY,z:expected.maxZ-expected.minZ});
  }
  const partial=buildGameplaySceneModel({...frame,colliderSettings:settings(true),equipmentColliderAnchors:{left:anchors.left,right:null}});
  assert.equal(boxes(partial)[0].position.x,anchors.left.x);
  assert.equal(boxes(partial).length,1,"missing right pose does not invent a hand");
  assert.equal(buildGameplaySceneModel({...frame,colliderSettings:settings(false),equipmentColliderAnchors:anchors}).objects.some((object)=>object.kind==="collider_volume"),false);
}
const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,mode,anchor,euler={x:0,y:0,z:0},scale=1)=>({role,mode,anchor,scale,orientation:equipmentEulerDegreesToQuaternion(euler),geometryIdentity:mode==="flow"?saberCapsuleGeometry.identity:gloveObbGeometry.identity,configIdentity});
const down=pose("left_wrist","flow",{x:1.5,y:1,z:.45},{x:0,y:0,z:-90},2);
const up=pose("left_wrist","flow",{x:1.5,y:1,z:.45},{x:0,y:0,z:90},2);
const flowFrame={presentation:"flow",nowMs:1000,targets:[],colliderSettings:settings(true,1,1,0)};
assert.deepEqual(boxes(buildGameplaySceneModel(flowFrame)),[],"absent Flow poses never create fallback colliders");
// Flow rear/front settings move only the blade capsule; timing retains the caller's base window.
const flowTimingFrame={...flowFrame,timingWindowBeforeMs:120,timingWindowAfterMs:240};
const flowBaseTiming=buildGameplaySceneModel({...flowTimingFrame,colliderSettings:settings(false,1,1,1)}).timingZone;
for(const [front,rear] of [[1,0],[2,.5],[3,2]]){
  for(const visible of [false,true]){
    const model=buildGameplaySceneModel({...flowTimingFrame,colliderSettings:settings(visible,1,front,rear),equipmentColliderPoses:visible?[up]:[]});
    assert.deepEqual(model.timingZone,flowBaseTiming,"Flow reach controls do not change independent note timing or zone segments");
    assert.equal(model.timingZone.startZ,1.44);
    assert.equal(model.timingZone.endZ,-.72);
    assert.ok(model.timingZone.segments.every((segment)=>segment.startZ<=segment.endZ&&segment.startZ>=model.timingZone.endZ&&segment.endZ<=model.timingZone.startZ),"all timing segments remain within their canonical bounds");
    assert.equal(model.objects.some((object)=>object.kind==="timing"),false,"configured Flow still renders no legacy timing tiles");
  }
}
const boxingTimingFrame={presentation:"boxing_collider",nowMs:1000,targets:[],timingWindowBeforeMs:120,timingWindowAfterMs:240,colliderSettings:settings(false,1,2,3)};
const boxingTiming=buildGameplaySceneModel(boxingTimingFrame).timingZone;
assert.equal(boxingTiming.startZ,4.32,"Boxing rear factor retains timing depth");
assert.equal(boxingTiming.endZ,-1.44,"Boxing front factor retains timing depth");
assert.notDeepEqual(boxingTiming,buildGameplaySceneModel({...boxingTimingFrame,colliderSettings:settings(false,1,1,1)}).timingZone,"Boxing depth settings still affect timing segments");
for(const [resolved,sign] of [[down,-1],[up,1]]){
  const model=buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:[resolved]});
  assert.equal(boxes(model).length,1,"only tracked Flow hands have a volume");
  assert.equal(flowVolume(model).shape,"capsule");
  assert.deepEqual(flowVolume(model).capsule.start,{x:0,y:1,z:.45},"rear zero begins at hilt");
  assert.ok(Math.abs(flowVolume(model).capsule.end.y-(1+sign*1.5))<1e-12,"front one ends at rotated visible tip");
  assert.ok(Math.abs(flowVolume(model).capsule.radius-.024*resolved.scale)<1e-12,"Scale1 follows the solid GLB blade radius and resolved pose scale");
  const held=buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:[resolved]});
  assert.deepEqual(flowVolume(held).capsule,flowVolume(model).capsule,"valid held pose retains exact position");
}
const rear=flowVolume(buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,1,1,.5),equipmentColliderPoses:[up]}));
assert.ok(Math.abs(rear.capsule.start.y-.25)<1e-12,"positive rear extends behind hilt on rotated axis");
const scaledTarget=flowVolume(buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,1.5,1,0),equipmentColliderPoses:[up]}));
assert.equal(scaledTarget.capsule.radius,.024*up.scale*1.5,"Flow Scale resizes the scored saber and debug capsule, not target boxes");
assert.equal(boxes(buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,0,1,0),equipmentColliderPoses:[up]})).length,0,"Scale0 draws no scored Flow hit volume");
for(const [scale,front,rear] of [[.00001,.00001,0],[1,0,0],[9999999,9999999,0],[1,9999999,9999999]]){
  const model=buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,scale,front,rear),equipmentColliderPoses:[up]});
  assert.equal(boxes(model).length,1,"finite nonnegative Flow settings retain a valid posed volume");
  const capsule=flowVolume(model).capsule;
  assert.ok(Number.isFinite(capsule.radius)&&Object.values(capsule.start).every(Number.isFinite)&&Object.values(capsule.end).every(Number.isFinite),"extreme Flow geometry must remain finite");
  assert.ok(Math.abs(capsule.radius-.024*up.scale*scale)<1e-7,"Flow radius follows shared solid blade and Scale");
  assert.ok(Math.abs(capsule.start.y-(1-.75*up.scale*rear))<1e-7&&Math.abs(capsule.end.y-(1+.75*up.scale*front))<1e-7,"finite huge front and rear preserve signed rotated centerline endpoints");
}
assert.deepEqual(scaledTarget.capsule.start,flowVolume(buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:[up]})).capsule.start);
assert.deepEqual(scaledTarget.capsule.end,flowVolume(buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:[up]})).capsule.end);
assert.deepEqual(boxes(buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:[]})),[],"lost pose hides previous volume");
for(const invalid of [null,{},[pose("left_wrist","boxing",{x:0,y:0,z:0})],[{...up,scale:0}],[up,up]])assert.throws(()=>buildGameplaySceneModel({...flowFrame,equipmentColliderPoses:invalid}),/Equipment collider poses are invalid/);
for(const mode of ["flow","boxing"]){
  const anchors=projectEquipmentColliderAnchors([pose("left_wrist",mode,{x:1.5,y:2,z:.45}),pose("right_wrist",mode,{x:2.5,y:0,z:.5})],mode==="flow"?"flow":"boxing_collider");
  assert.deepEqual(anchors,{left:{x:0,y:2,z:.45},right:{x:1,y:0,z:.5}},"collider and staged equipment use identical judge-to-presentation anchors");
  assert.deepEqual(projectEquipmentColliderAnchors([pose("left_wrist",mode,{x:1.5,y:2,z:.45})],mode==="flow"?"flow":"boxing_lanes"),{left:{x:0,y:2,z:.45},right:null},"missing equipment pose falls back only for its hand");
}
assert.equal(colliderSettingsDefaults.flow.colliderDepthForward,1);
for(const bad of [null,settings(true,-1),settings(true,1,-.9),settings(true,1,Infinity),{...settings(true),extra:1},{...settings(true),colliderVisible:1}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[],colliderSettings:bad}),/flow_collider_settings_invalid/);
assert.throws(()=>buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,Number.MAX_VALUE,1,0),equipmentColliderPoses:[pose("left_wrist","flow",up.anchor,{x:0,y:0,z:90},Number.MAX_VALUE)]}),/Flow collider geometry is nonfinite/,"unrepresentable derived Flow radius fails rather than clipping");
assert.throws(()=>buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,1,Number.MAX_VALUE,0),equipmentColliderPoses:[pose("left_wrist","flow",up.anchor,{x:0,y:0,z:90},Number.MAX_VALUE)]}),/Flow collider geometry is nonfinite/,"unrepresentable derived Flow reach fails rather than clipping");
for(const bad of [null,{left:{x:0,y:1,z:0}},{left:{x:0,y:1,z:NaN},right:null}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[],colliderSettings:settings(true),equipmentColliderAnchors:bad}),/Equipment collider anchors are invalid/);
// Exercise the actual collider material path with two different song palettes and modes.
const renderer=createAeroPlayCanvasRenderer();
const paletteSymbol=Symbol.for("aerobeat.web-renderer.internal-effective-palette");
const material={diffuse:{set(...rgb){this.rgb=rgb;}},emissive:{set(...rgb){this.rgb=rgb;}},update(){}};
const entity={findComponents(){return[{meshInstances:[{material}],layers:[]}];},setPosition(){},setLocalScale(){},setEulerAngles(){},setRotation(){}};
for(const presentation of ["flow","boxing_collider"]){
  const model=buildGameplaySceneModel({presentation,nowMs:1000,targets:[],colliderSettings:settings(true),...(presentation==="flow"?{equipmentColliderPoses:[up,pose("right_wrist","flow",{x:2.5,y:1,z:.45})]}:{equipmentColliderAnchors:{left:{x:-1,y:1,z:.45},right:{x:1,y:1,z:.45}}})});
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
console.log("Oriented Flow saber volumes, no missing-pose fallback, tracked Boxing boxes, visibility and miss spots passed.");
