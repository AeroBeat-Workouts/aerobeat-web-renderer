// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";
import { createAeroPlayCanvasRenderer, projectEquipmentColliderAnchors } from "../src/renderer-facade.js";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, gloveObbGeometry, saberCapsuleGeometry, resolveSaberColliderParts, resolveGloveColliderParts } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { colliderSettingsDefaults, normalizeColliderSettings, resolveColliderBounds } from "@aerobeat/web-contracts/collider-contracts";

const settings=(colliderVisible,colliderScale=1,colliderDepthForward=1,colliderDepthBackward=1)=>({colliderVisible,colliderScale,colliderDepthForward,colliderDepthBackward});
const boxes=(model)=>model.objects.filter((object)=>object.kind==="collider_volume");
const flowVolume=(model)=>boxes(model)[0];
assert.deepEqual(normalizeColliderSettings(settings(false)),{...settings(false),colliderDepthBackwardAthleteFacing:true,visibleWristObstacleRadius:false,wristBombColliderScale:1},"legacy four-field renderer callers receive both new defaults");
assert.deepEqual(normalizeColliderSettings({...settings(false),visibleWristObstacleRadius:true,wristBombColliderScale:.5}),{...settings(false),colliderDepthBackwardAthleteFacing:true,visibleWristObstacleRadius:true,wristBombColliderScale:.5},"six-field renderer callers preserve explicit wrist settings");
const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,mode,anchor,euler={x:0,y:0,z:0},scale=1)=>({role,mode,anchor,scale,orientation:equipmentEulerDegreesToQuaternion(euler),geometryIdentity:mode==="flow"?saberCapsuleGeometry.identity:gloveObbGeometry.identity,configIdentity});
for(const presentation of ["boxing_collider","boxing_lanes"]){
  const frame={presentation,nowMs:1000,targets:[],timingWindowBeforeMs:120,timingWindowAfterMs:240,colliderSettings:settings(false,1,2,3)};
  const hidden=buildGameplaySceneModel(frame);
  assert.equal(boxes(hidden).length,0);
  assert.equal(hidden.objects.some((object)=>object.kind==="timing"),false,"collider mode removes legacy timing tiles");
  const left=pose("left_wrist","boxing",{x:1.5,y:1.5,z:.45});
  const right=pose("right_wrist","boxing",{x:2.5,y:.6,z:.45},{x:0,y:90,z:0},2);
  const shown=buildGameplaySceneModel({...frame,colliderSettings:settings(true,1,1,0),equipmentColliderPoses:[left,right]});
  assert.equal(boxes(shown).length,2);
  for(const object of boxes(shown)){assert.equal(object.shape,"cylinder");assert.equal(object.alpha,.16);}
  assert.ok(Math.abs(boxes(shown)[0].capsule.start.z-.16)<1e-12&&Math.abs(boxes(shown)[0].capsule.end.z-.84)<1e-12);
  assert.equal(boxes(shown)[0].capsule.start.x,0);assert.equal(boxes(shown)[0].capsule.end.y,1.5);
  assert.equal(boxes(shown)[0].capsule.radius,.34);
  const rotated=boxes(shown)[1];
  assert.deepEqual(rotated.capsule.orientation,{x:0,y:0,z:0,w:1},"rotated glove art leaves Show axis fixed in world Z");
  assert.equal(rotated.capsule.start.x,1);assert.equal(rotated.capsule.end.x,1);
  assert.ok(Math.abs(rotated.capsule.start.z-(-.13))<1e-12);
  assert.ok(Math.abs(rotated.capsule.end.z-1.23)<1e-12);
  assert.equal(rotated.capsule.radius,.68);
  assert.deepEqual(rotated,boxes(buildGameplaySceneModel({...frame,colliderSettings:settings(true,1,1,0),equipmentColliderPoses:[left,{...right,orientation:left.orientation}]}))[1],"only glove art orientation changes, not Show volume");
  assert.equal(boxes(buildGameplaySceneModel({...frame,colliderSettings:settings(true),equipmentColliderPoses:[left]})).length,1,"missing right pose does not invent a hand");
  assert.equal(boxes(buildGameplaySceneModel({...frame,colliderSettings:settings(true),equipmentColliderPoses:[]})).length,0,"lost poses hide both cylinders");
  assert.equal(boxes(buildGameplaySceneModel({...frame,colliderSettings:settings(true,0),equipmentColliderPoses:[left,right]})).length,0,"Scale0 hides both cylinders");
  for(const [scale,front,rear] of [[.00001,.00001,0],[9999999,9999999,0],[1,9999999,9999999]]){
    const cylinders=boxes(buildGameplaySceneModel({...frame,colliderSettings:settings(true,scale,front,rear),equipmentColliderPoses:[left]}));
    assert.equal(cylinders.length,1);
    assert.ok([cylinders[0].capsule.radius,...Object.values(cylinders[0].capsule.start),...Object.values(cylinders[0].capsule.end)].every(Number.isFinite));
    assert.equal(cylinders[0].capsule.radius,.34*scale);
  }
  assert.throws(()=>buildGameplaySceneModel({...frame,colliderSettings:settings(true,Number.MAX_VALUE,1,0),equipmentColliderPoses:[pose("left_wrist","boxing",left.anchor,{x:0,y:0,z:0},Number.MAX_VALUE)]}),/glove_cylinder_geometry_nonfinite/);
  assert.throws(()=>buildGameplaySceneModel({...frame,colliderSettings:settings(true),equipmentColliderPoses:[pose("left_wrist","flow",left.anchor)]}),/Equipment collider poses are invalid/);
}

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
assert.throws(()=>buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,Number.MAX_VALUE,1,0),equipmentColliderPoses:[pose("left_wrist","flow",up.anchor,{x:0,y:0,z:90},Number.MAX_VALUE)]}),/(?:saber_collider|collider_part)_geometry_nonfinite/,"unrepresentable derived Flow radius fails rather than clipping");
assert.throws(()=>buildGameplaySceneModel({...flowFrame,colliderSettings:settings(true,1,Number.MAX_VALUE,0),equipmentColliderPoses:[pose("left_wrist","flow",up.anchor,{x:0,y:0,z:90},Number.MAX_VALUE)]}),/(?:saber_collider|collider_part)_geometry_nonfinite/,"unrepresentable derived Flow reach fails rather than clipping");
for(const bad of [null,{left:{x:0,y:1,z:0}},{left:{x:0,y:1,z:NaN},right:null}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[],colliderSettings:settings(true),equipmentColliderAnchors:bad}),/Equipment collider anchors are invalid/);
// Exercise the actual collider material path with two different song palettes and modes.
const renderer=createAeroPlayCanvasRenderer();
const paletteSymbol=Symbol.for("aerobeat.web-renderer.internal-effective-palette");
const material={diffuse:{set(...rgb){this.rgb=rgb;}},emissive:{set(...rgb){this.rgb=rgb;}},update(){}};
const entity={findComponents(){return[{meshInstances:[{material}],layers:[]}];},setPosition(){},setLocalScale(){},setEulerAngles(){},setRotation(){}};
for(const presentation of ["flow","boxing_collider"]){
  const model=buildGameplaySceneModel({presentation,nowMs:1000,targets:[],colliderSettings:settings(true),...(presentation==="flow"?{equipmentColliderPoses:[up,pose("right_wrist","flow",{x:2.5,y:1,z:.45})]}:{equipmentColliderPoses:[pose("left_wrist","boxing",{x:.5,y:1,z:.45}),pose("right_wrist","boxing",{x:2.5,y:1,z:.45})]})});
  for(const [left,right] of [["#AABBCC","#123456"],["#FF0088","#00DD33"]]){
    renderer[paletteSymbol](left,right);
    for(const [index,color] of [left,right].entries()){
      renderer.applyColliderOverlayAppearance(boxes(model)[index],entity);
      const rgb=color.match(/[\dA-F]{2}/g).map((channel)=>parseInt(channel,16)/255);
      assert.deepEqual(material.diffuse.rgb,rgb,`${presentation} ${index===0?"left":"right"} collider follows its equipment color`);
      assert.deepEqual(material.emissive.rgb,rgb);
      assert.equal(material.opacity,.16,"collider transparency stays unchanged");
      assert.equal(material.depthTest,presentation!=="flow","Flow Show composites over the saber; Boxing retains depth testing");
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
// Both settings must draw exactly the shared convex union, never a diagonal bridge.
for(const mode of ["flow","boxing"]){
  for(const euler of [{x:0,y:0,z:0},{x:0,y:90,z:0},{x:0,y:180,z:0},{x:35,y:40,z:25}]){
    const resolved=pose("left_wrist",mode,{x:1.5,y:1,z:.45},euler,1.5);
    const original=structuredClone(resolved);
    const presentation=mode==="flow"?"flow":"boxing_collider";
    const make=(facing,front=1,rear=.7,scale=1)=>boxes(buildGameplaySceneModel({presentation,nowMs:0,targets:[],equipmentColliderPoses:[resolved],colliderSettings:{...settings(true,scale,front,rear),...(facing===undefined?{}:{colliderDepthBackwardAthleteFacing:facing})}}));
    assert.deepEqual(make(undefined),make(mode==="boxing"),"mode default preserves original single-part model");
    assert.equal(make(undefined).length,1);
    for(const facing of [false,true]){
      const drawn=make(facing),parts=(mode==="flow"?resolveSaberColliderParts:resolveGloveColliderParts)(resolved,{scale:1,depthForward:1,depthBackward:.7,depthBackwardAthleteFacing:facing});
      assert.equal(drawn.length,parts.length);
      assert.equal(new Set(drawn.map((object)=>object.id)).size,drawn.length);
      assert.equal(drawn[0].id,"equipment-collider-volume-left");
      if(drawn.length===2)assert.equal(drawn[1].id,"equipment-collider-volume-left-rear-1");
      for(const [index,part] of parts.entries()){
        assert.deepEqual(drawn[index].capsule.start,{...part.start,x:part.start.x-1.5});
        assert.deepEqual(drawn[index].capsule.end,{...part.end,x:part.end.x-1.5});
        assert.equal(drawn[index].capsule.radius,part.radius);
      }
      assert.equal(make(facing,0,0).length,1,"zero reaches retain original sphere/flat-cap part");
      assert.deepEqual(make(facing,0,0)[0].capsule.start,make(facing,0,0)[0].capsule.end);
      assert.equal(make(facing,1,0).length,1,"zero rear needs no extra part");
      assert.deepEqual(make(facing,1,.7,0),[],"Scale0 hides the complete union");
    }
    const bent=make(mode==="flow"),frontOnly=make(mode==="flow",1,0);
    assert.deepEqual(bent[0].capsule,frontOnly[0].capsule,"bending rear preserves complete front part");
    assert.deepEqual(resolved,original,"Show settings never mutate equipment art pose");
    assert.throws(()=>make("true"),/collider_settings_invalid/,"boolean must remain strict");
  }
}
console.log("Oriented Flow/Boxing convex Show unions, default/front/art invariance, zero/lost and visibility passed.");
