// @ts-check
import assert from "node:assert/strict";
import { createAeroPlayCanvasRenderer, defaultGameplayCameraPose, gameplayCameraPoseBounds, normalizeGameplayCameraPose } from "../src/index.js";
import { serializeGameplayCameraPose } from "../src/gameplay-camera-pose.js";

assert.equal(gameplayCameraPoseBounds.position.x[1],40,"published camera bounds match the source authority");

const renderer=createAeroPlayCanvasRenderer();
const canonicalBytes=serializeGameplayCameraPose(defaultGameplayCameraPose);
const modes=["flow","boxing_spatial_grid","boxing_lanes"];
const applied=[];
renderer.cameraEntity={setPosition(...args){applied.push(["position",...args]);},setEulerAngles(...args){applied.push(["rotation",...args]);},camera:{},getPosition(){return {x:0,y:0,z:0};}};
renderer.syncEnvironmentAnchor=()=>{};
const pose=(x)=>({...structuredClone(defaultGameplayCameraPose),position:{x,y:2,z:6},rotationEulerDegrees:{xPitch:5,yYaw:35,zRoll:0},projection:{verticalFovDegrees:55,nearClip:.2,farClip:90}});
const snapshots=modes.map((_,i)=>normalizeGameplayCameraPose(pose(i+1)));
for(let i=0;i<modes.length;i++)renderer.setGameplayCameraPose(modes[i],pose(i+1));
for(let i=0;i<modes.length;i++){
  // Production mode is selected by rendering; model-camera identity remains canonical.
  renderer.activeGameplayCameraMode=modes[i];renderer.applyCamera({presentation:modes[i],camera:defaultGameplayCameraPose});
  assert.deepEqual(applied.slice(-2),[["position",i+1,2,6],["rotation",5,35,0]]);
  assert.equal(renderer.cameraEntity.camera.fov,55);
  assert.deepEqual(renderer.gameplayCameraPoses[modes[i]],snapshots[i]);
}
renderer.activeGameplayCameraMode="flow";
const before=renderer.gameplayCameraPoses;
assert.throws(()=>renderer.setGameplayCameraPose("boxing_lanes",{...pose(8),projection:{...pose(8).projection,farClip:NaN}}),/finite/);
assert.throws(()=>renderer.setGameplayCameraPose("boxing",pose(8)),/mode/);
assert.equal(renderer.gameplayCameraPoses,before,"invalid update must be atomic");
renderer.setGameplayCameraPose("flow",null);
renderer.applyCamera({presentation:"flow",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.slice(-2),[["position",.05,1,5],["rotation",0,0,0]]);
assert.equal(renderer.cameraEntity.camera.fov,48);
assert.equal(serializeGameplayCameraPose(defaultGameplayCameraPose),canonicalBytes,"default artifact bytes remain identical");
renderer.activeGameplayCameraMode="boxing_lanes";
renderer.debugEnabled=true;renderer.debugPosition={x:9,y:3,z:7};renderer.debugPitch=0;renderer.debugYaw=0;renderer.debugProjection={...defaultGameplayCameraPose.projection};
renderer.applyCamera({presentation:"boxing_lanes",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",9,3,7],"debug authoring ignores production override");
renderer.debugEnabled=false;
renderer.gameplayVisualExperimentConfig={...renderer.gameplayVisualExperimentConfig,noseCameraParallax:true};
const state=renderer.gameplayCameraPoses.boxing_lanes;
// Filter offset is applied over the selected pose, without changing rotation/projection.
renderer.updateProductionCameraParallax({active:true,xDeflection:1,yDeflection:1});
renderer.activeGameplayCameraMode="boxing_lanes";renderer.applyCamera({presentation:"boxing_lanes",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",state.position.x,state.position.y,state.position.z]);
renderer.resetProductionCameraParallax();
renderer.applyCamera({presentation:"boxing_lanes",camera:defaultGameplayCameraPose});
assert.deepEqual(applied.at(-2),["position",state.position.x,state.position.y,state.position.z],"parallax reset keeps selected base pose");
assert.equal(JSON.stringify(renderer.describe()).includes('"gameplayCameraPoses"'),false,"private poses stay out of diagnostics");
console.log("Mode camera overrides, strict normalization, debug independence, and canonical default bytes passed.");
