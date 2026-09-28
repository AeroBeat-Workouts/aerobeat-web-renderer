// @ts-check
import assert from "node:assert/strict";
import { createAeroPlayCanvasRenderer, defaultGameplayCameraPose, gameplayCameraPoseBounds, normalizeGameplayCameraPose } from "../src/index.js";
import { serializeGameplayCameraPose } from "../src/gameplay-camera-pose.js";

assert.equal(gameplayCameraPoseBounds.position.x[1],40,"published camera bounds match the source authority");

const renderer=createAeroPlayCanvasRenderer();
const canonicalBytes=serializeGameplayCameraPose(defaultGameplayCameraPose);
const boxingPresentations=["boxing_collider","boxing_spatial_grid","boxing_lanes"];
const applied=[];
renderer.cameraEntity={setPosition(...args){applied.push(["position",...args]);},setEulerAngles(...args){applied.push(["rotation",...args]);},camera:{},getPosition(){return {x:0,y:0,z:0};}};
renderer.syncEnvironmentAnchor=()=>{};
const pose=(x)=>({...structuredClone(defaultGameplayCameraPose),position:{x,y:2,z:6},rotationEulerDegrees:{xPitch:5,yYaw:35,zRoll:0},projection:{verticalFovDegrees:55,nearClip:.2,farClip:90}});
const flowPose=normalizeGameplayCameraPose(pose(1)),boxingPose=normalizeGameplayCameraPose(pose(2));
renderer.setGameplayCameraPose("flow",pose(1));renderer.setGameplayCameraPose("boxing",pose(2));
assert.deepEqual(renderer.gameplayCameraPoses.flow,flowPose);
assert.deepEqual(renderer.gameplayCameraPoses.boxing,boxingPose);
for(const presentation of ["flow",...boxingPresentations]){
  // Production mode is selected by rendering; model-camera identity remains canonical.
  renderer.activeGameplayCameraMode=presentation;renderer.applyCamera({presentation,camera:defaultGameplayCameraPose});
  assert.deepEqual(applied.slice(-2),[["position",presentation==="flow"?1:2,2,6],["rotation",5,35,0]]);
  assert.equal(renderer.cameraEntity.camera.fov,55);
}
renderer.activeGameplayCameraMode="boxing_collider";
renderer.setGameplayCameraPose("boxing",pose(3));
assert.deepEqual(applied.at(-2),["position",3,2,6],"active collider camera updates immediately");
renderer.setGameplayCameraPose("boxing",pose(2));
renderer.activeGameplayCameraMode="flow";
const before=renderer.gameplayCameraPoses;
assert.throws(()=>renderer.setGameplayCameraPose("boxing",{...pose(8),projection:{...pose(8).projection,farClip:NaN}}),/finite/);
assert.throws(()=>renderer.setGameplayCameraPose("boxing_lanes",pose(8)),/mode/);
assert.equal(renderer.gameplayCameraPoses,before,"invalid update must be atomic");
renderer.setGameplayCameraPose("flow",null);
assert.equal(renderer.gameplayCameraPoses.flow,undefined);
renderer.applyCamera({presentation:"flow",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.slice(-2),[["position",.05,1,5],["rotation",0,0,0]]);
assert.equal(renderer.cameraEntity.camera.fov,48);
assert.equal(serializeGameplayCameraPose(defaultGameplayCameraPose),canonicalBytes,"default artifact bytes remain identical");
renderer.activeGameplayCameraMode="boxing_collider";
renderer.debugEnabled=true;renderer.debugPosition={x:9,y:3,z:7};renderer.debugPitch=0;renderer.debugYaw=0;renderer.debugProjection={...defaultGameplayCameraPose.projection};
renderer.applyCamera({presentation:"boxing_collider",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",9,3,7],"debug authoring ignores production override");
renderer.debugEnabled=false;
renderer.gameplayVisualExperimentConfig={...renderer.gameplayVisualExperimentConfig,noseCameraParallax:true};
const state=renderer.gameplayCameraPoses.boxing;
// Filter offset is applied over the selected pose, without changing rotation/projection.
renderer.updateProductionCameraParallax({active:true,xDeflection:1,yDeflection:1});
renderer.activeGameplayCameraMode="boxing_collider";renderer.applyCamera({presentation:"boxing_collider",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",state.position.x,state.position.y,state.position.z]);
renderer.resetProductionCameraParallax();
renderer.applyCamera({presentation:"boxing_collider",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",state.position.x,state.position.y,state.position.z],"parallax reset keeps selected base pose");
assert.equal(JSON.stringify(renderer.describe()).includes('"gameplayCameraPoses"'),false,"private poses stay out of diagnostics");
const rendered=createAeroPlayCanvasRenderer();
const realModel=rendered.renderGameplayFrame({presentation:"boxing_collider",nowMs:0,targets:[]}).model;
assert.equal(realModel.presentation,"boxing_collider","collider must be an actual model presentation");
rendered.setGameplayCameraPose("boxing",pose(2));
assert.equal(rendered.activeGameplayCameraMode,"boxing_collider","frame selects the collider presentation");
assert.deepEqual(rendered.gameplayCameraPoses.boxing,boxingPose,"logical boxing pose binds the rendered collider");
console.log("Mode camera overrides, strict normalization, debug independence, and canonical default bytes passed.");
