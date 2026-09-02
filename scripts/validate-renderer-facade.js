// @ts-check

import assert from "node:assert/strict";
import * as pc from "playcanvas";
import { defaultGameplayCameraPose } from "../src/gameplay-camera-pose.js";
import {
  aeroPlayCanvasRendererServiceId,buildGameplaySceneModel,compactRendererVisualProfile,createAeroPlayCanvasRenderer,defaultRendererTuning,gameplayIconIds,
  gameplayWorldGrid,normalizeBrandingIconManifest,normalizeIconAtlasData,rasterizeBrandingIconAtlas,timestampToWorldZ,worldPositionForCell
} from "../src/index.js";

assert.equal(aeroPlayCanvasRendererServiceId,"aero.renderer.playcanvas");
const debugRenderer=createAeroPlayCanvasRenderer();debugRenderer.resetDebugCamera();const debugRotation=new pc.Quat().setFromEulerAngles(debugRenderer.debugPitch*180/Math.PI,debugRenderer.debugYaw*180/Math.PI,0),debugForward=debugRotation.transformVector(new pc.Vec3(0,0,-1));assert.ok(debugForward.z<-.99,"reset debug camera must face negative-Z gameplay");assert.ok(Math.abs(debugForward.y)<1e-12,"reset debug camera must use Derrick-reviewed level pitch");assert.equal(debugRenderer.debugYaw,0);
const motionFrame=Object.freeze({presentation:"flow",nowMs:0,targets:[]});
const approximate=(actual,expected,message,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} != ${expected}`);
const makeMotionRenderer=(yaw=0)=>{let now=0;const renderer=createAeroPlayCanvasRenderer({now:()=>now});renderer.debugEnabled=true;renderer.debugYaw=yaw;return{renderer,advance(milliseconds){now+=milliseconds;renderer.renderGameplayFrame(motionFrame);}};};
{
  const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);const start={...renderer.debugPosition};advance(10000);assert.deepEqual(renderer.debugPosition,start,"first debug frame must establish time without movement");advance(50);approximate(renderer.debugPosition.z,start.z-0.175,"held forward must integrate gradually toward world -Z");advance(50);approximate(renderer.debugPosition.z,start.z-0.35,"held forward must continue once per frame toward world -Z");assert.equal(renderer.describe().debugActiveIntentCount,1);renderer.setDebugCameraMovementIntent("forward",false);assert.equal(renderer.describe().debugActiveIntentCount,0);
}
{
  const run=(steps)=>{const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);advance(0);for(const step of steps)advance(step);return renderer.debugPosition.z;};approximate(run([10,10,10,10,10,10,10,10,10,10]),run([50,50]),"movement must be frame-rate independent");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);advance(0);advance(1000);approximate(renderer.debugPosition.z,4.65,"movement delta must clamp to 100 ms");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);renderer.setDebugCameraMovementIntent("right",true);advance(0);advance(100);approximate(renderer.debugPosition.x,0.05+0.35/Math.sqrt(2),"reset-camera right must move world positive X");approximate(renderer.debugPosition.z,5-0.35/Math.sqrt(2),"planar diagonal must normalize");
}
{
  const {renderer,advance}=makeMotionRenderer(Math.PI/2);renderer.setDebugCameraMovementIntent("forward",true);advance(0);advance(100);approximate(renderer.debugPosition.x,0.05-0.35,"rotated forward must use camera-relative planar basis");approximate(renderer.debugPosition.z,5,"rotated forward must not leak into orthogonal axis");
}
{
  const {renderer,advance}=makeMotionRenderer();for(const intent of["forward","back","left","right","up","down"])renderer.setDebugCameraMovementIntent(intent,true);advance(0);advance(100);assert.deepEqual(renderer.debugPosition,{x:0.05,y:1,z:5},"opposite intents must cancel exactly");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);renderer.setDebugCameraMovementIntent("up",true);advance(0);advance(100);const distance=Math.hypot(renderer.debugPosition.y-1,renderer.debugPosition.z-5);approximate(distance,0.35,"vertical plus planar movement must remain bounded");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.setDebugCameraMovementIntent("forward",true);renderer.setDebugCameraSpeedMode("boost");advance(0);advance(100);approximate(renderer.debugPosition.z,3.8,"GUI boost must use units-per-second speed");assert.equal(renderer.describe().debugCameraSpeedMode,"boost");assert.equal(renderer.describe().debugCameraBoostActive,true);renderer.debugShiftActive=false;renderer.setDebugCameraSpeedMode("normal");renderer.debugShiftActive=true;renderer.resetDebugCamera();advance(0);advance(100);approximate(renderer.debugPosition.z,3.8,"held Shift must temporarily boost normal GUI speed");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.debugPosition.z=-71.9;renderer.setDebugCameraMovementIntent("forward",true);renderer.setDebugCameraSpeedMode("boost");advance(0);advance(100);assert.equal(renderer.debugPosition.z,-72,"forward movement must clamp at migrated world -Z bound");
}
{
  const {renderer,advance}=makeMotionRenderer();renderer.debugPosition.z=31.9;renderer.setDebugCameraMovementIntent("back",true);renderer.setDebugCameraSpeedMode("boost");advance(0);advance(100);assert.equal(renderer.debugPosition.z,32,"back movement must clamp at migrated world +Z bound");
}
assert.throws(()=>debugRenderer.setDebugCameraMovementIntent("north",true),/Unknown debug camera movement intent/);assert.throws(()=>debugRenderer.setDebugCameraMovementIntent("forward",1),/active state must be boolean/);assert.throws(()=>debugRenderer.setDebugCameraSpeedMode("turbo"),/Unknown debug camera speed mode/);
assert.equal(timestampToWorldZ(1500,1000),-3);assert.equal(timestampToWorldZ(500,1000),3);
assert.deepEqual(worldPositionForCell(0),{x:-2.4,y:2.4});assert.deepEqual(worldPositionForCell(3),{x:2.4,y:2.4});assert.deepEqual(worldPositionForCell(8),{x:-2.4,y:0});assert.deepEqual(worldPositionForCell(11),{x:2.4,y:0});assert.equal(worldPositionForCell(12),null);
assert.deepEqual(gameplayWorldGrid.columnX,[-2.4,-0.8,0.8,2.4]);assert.deepEqual(gameplayWorldGrid.rowY,[2.4,1.2,0]);
const target=(id,cell,beatCenterMs=1000)=>({id,kind:/** @type {const} */("flow"),hand:/** @type {const} */("left"),family:/** @type {const} */("flow"),cell,cells:[],lane:null,beatCenterMs,direction:/** @type {const} */("right"),judgement:/** @type {const} */("pending")});
const flow=buildGameplaySceneModel({presentation:"flow",nowMs:1000,timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:[target("near",5,1100),target("far",5,1700),target("active",0,1000)]});
assert.equal(flow.camera,defaultGameplayCameraPose);assert.deepEqual(flow.camera.position,{x:0.05,y:1,z:5});assert.deepEqual(flow.camera.rotationEulerDegrees,{xPitch:0,yYaw:0,zRoll:0});assert.equal(flow.camera.projection.verticalFovDegrees,48);assert.ok(flow.camera.position.z>0&&flow.camera.rotationEulerDegrees.yYaw===0,"fixed athlete camera must use the canonical conventional negative-Z pose");
for(const presentation of["flow","boxing_spatial_grid","boxing_lanes"])assert.equal(buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation,nowMs:0,targets:[],timingWindowBeforeMs:180,timingWindowAfterMs:180})).camera,defaultGameplayCameraPose,`${presentation} must share the one canonical camera default`);
assert.equal(flow.timingZone.startZ,1.44);assert.equal(flow.timingZone.endZ,-.72);assert.deepEqual(flow.timingZone.segments.map((entry)=>entry.name),["late","active","early"]);assert.equal(flow.timingZone.segments[0].endZ,flow.timingZone.startZ);assert.equal(flow.timingZone.segments[2].startZ,flow.timingZone.endZ);
const flowTargets=flow.objects.filter((entry)=>entry.targetId);assert.deepEqual(flowTargets.map((entry)=>entry.targetId),["far","near","active"],"transparent targets must be deterministic far-near");assert.deepEqual(flowTargets.map((entry)=>entry.position.z),[-4.2,-.6,0]);assert.ok(flowTargets.every((entry)=>entry.transparent));
assert.equal(flowTargets.find((entry)=>entry.targetId==="active")?.state,"active");
const spent=buildGameplaySceneModel({presentation:"flow",nowMs:1201,timingWindowBeforeMs:120,timingWindowAfterMs:200,targets:[target("spent",5,1000)]});assert.equal(spent.objects.find((entry)=>entry.targetId==="spent")?.state,"spent");
const culled=buildGameplaySceneModel({presentation:"flow",nowMs:1801,timingWindowBeforeMs:120,timingWindowAfterMs:200,targets:[target("culled",5,1000)]});assert.deepEqual(culled.culledTargetIds,["culled"]);assert.equal(culled.objects.some((entry)=>entry.targetId==="culled"),false);
const obstacle={id:"wall",kind:/** @type {const} */("obstacle"),hand:/** @type {const} */("neutral"),family:/** @type {const} */("obstacle"),cell:null,cells:[0,4],lane:null,beatCenterMs:1500,intervalStartMs:1400,intervalEndMs:1900};
const obstacleModel=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[obstacle]});const volumes=obstacleModel.objects.filter((entry)=>entry.targetId==="wall");assert.equal(volumes.length,2);assert.ok(volumes.every((entry)=>entry.kind==="obstacle"&&entry.intervalStartMs===1400&&entry.intervalEndMs===1900&&Math.abs(entry.scale.z-3)<1e-12&&entry.scale.y===1.05));assert.deepEqual(volumes.map((entry)=>({x:entry.position.x,y:entry.position.y})),[{x:-2.4,y:2.4},{x:-2.4,y:1.2}],"same-column obstacle cells must preserve distinct authoritative rows");assert.ok(volumes.every((entry)=>Math.abs(entry.position.z+3.9)<1e-12),"future obstacle duration must occupy world -Z");assert.ok(volumes.every((entry)=>entry.iconId===null&&entry.transparent));
assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[{...obstacle,intervalEndMs:1300}]}),/interval/u);
const directions=["up","up-right","right","down-right","down","down-left","left","up-left"];
const directionModel=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:directions.map((direction,index)=>({...target(`d${index}`,index),direction}))});assert.deepEqual(directionModel.objects.filter((entry)=>entry.targetId).map((entry)=>entry.rotationZRad).sort((a,b)=>a-b),[-Math.PI*3/4,-Math.PI/2,-Math.PI/4,0,Math.PI/4,Math.PI/2,Math.PI*3/4,Math.PI].sort((a,b)=>a-b));
const directionless=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{...target("dot",5),direction:null}]}).objects.find((entry)=>entry.targetId==="dot");assert.equal(directionless?.iconId,"flow.directionless");
for(const unsupported of ["bomb","arc","burst"])assert.equal(directionModel.objects.some((entry)=>entry.iconId?.includes(unsupported)),false);
const gridTargets=[
  {id:"punch",kind:"punch",hand:"left",family:"straight",cell:1,cells:[],lane:"left",beatCenterMs:1000},
  {id:"guard",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[5,6],lane:null,beatCenterMs:1000},
  {id:"squat",kind:"obstacle",hand:"neutral",family:"squat",cell:null,cells:[9],lane:null,beatCenterMs:1000}
];
const grid=buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation:"boxing_spatial_grid",nowMs:1000,blockedCells:[0,4],safeCells:[7,11],targets:gridTargets}));const gridCells=grid.objects.filter((entry)=>entry.id.startsWith("cell-"));assert.equal(grid.objects.filter((entry)=>entry.kind==="cell").length,16);assert.equal(new Set(gridCells.map((entry)=>`${entry.position.x},${entry.position.y}`)).size,12,"all authoritative 4x3 cells must have distinct row/column positions");assert.deepEqual(gridCells.filter((entry)=>["cell-0","cell-4","cell-8","cell-11"].includes(entry.id)).sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5))).map((entry)=>({id:entry.id,position:entry.position})),[{id:"cell-0",position:{x:-2.4,y:2.4,z:0}},{id:"cell-4",position:{x:-2.4,y:1.2,z:0}},{id:"cell-8",position:{x:-2.4,y:0,z:0}},{id:"cell-11",position:{x:2.4,y:0,z:0}}]);assert.deepEqual(grid.objects.filter((entry)=>entry.id.startsWith("obstacle-")).map((entry)=>entry.position.y),[2.4,1.2]);assert.deepEqual(grid.objects.filter((entry)=>entry.id.startsWith("safe-")).sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5))).map((entry)=>entry.position.y),[1.2,0]);assert.deepEqual(grid.objects.filter((entry)=>entry.targetId).map((entry)=>entry.iconId).sort(),["boxing.guard.crossed","boxing.squat","boxing.straight.left"]);
const laneTargets=[
  {id:"straight",kind:"punch",hand:"left",family:"straight",cell:null,cells:[],lane:"left",beatCenterMs:1000},
  {id:"hook",kind:"punch",hand:"right",family:"hook",cell:null,cells:[],lane:"right",beatCenterMs:1000},
  {id:"upper",kind:"punch",hand:"left",family:"uppercut",cell:null,cells:[],lane:"left",beatCenterMs:1000},
  {id:"guard",kind:"guard",hand:"both",family:"guard",cell:null,cells:[],lane:null,beatCenterMs:1000},
  {id:"cross",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[],lane:null,beatCenterMs:1000},
  {id:"squat",kind:"obstacle",hand:"neutral",family:"squat",cell:null,cells:[],lane:null,beatCenterMs:1000},
  {id:"wl",kind:"obstacle",hand:"neutral",family:"weave",cell:null,cells:[],lane:"left",beatCenterMs:1000},
  {id:"wr",kind:"obstacle",hand:"neutral",family:"weave",cell:null,cells:[],lane:"right",beatCenterMs:1000}
];
const lanes=buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation:"boxing_lanes",nowMs:1000,timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:laneTargets}));assert.equal(lanes.objects.filter((entry)=>entry.kind==="lane").length,2);assert.equal(lanes.objects.filter((entry)=>entry.targetId==="guard").length,2);assert.equal(lanes.objects.filter((entry)=>entry.targetId==="squat").length,2);assert.deepEqual(new Set(lanes.objects.filter((entry)=>entry.targetId).map((entry)=>entry.iconId)),new Set(["boxing.straight.left","boxing.hook.right","boxing.uppercut.left","boxing.guard.standard","boxing.guard.crossed","boxing.squat","boxing.weave.left","boxing.weave.right"]));
assert.throws(()=>buildGameplaySceneModel({presentation:"boxing_lanes",nowMs:0,targets:[]}),/timing window/u);
assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:Array.from({length:129},(_,index)=>target(String(index),0))}),/128/u);
assert.equal(flow.objects.some((entry)=>entry.kind==="ring"),false,"timing rings must not exist in world truth");
assert.equal(defaultRendererTuning.feedbackDurationMs,350);assert.equal(compactRendererVisualProfile.identity.profileId,"aero.visual.compact");

const manifest=normalizeBrandingIconManifest({schemaId:"aerobeat.branding.web-gameplay-icons.v1",schemaVersion:1,colorContract:"currentColor",webglContract:"alpha-mask-atlas-input",assets:gameplayIconIds.map((id)=>({id,file:`${id.replaceAll(".","-")}.svg`,viewBox:id==="feedback.great"?"0 0 128 32":id.includes("guard")?"0 0 48 24":"0 0 64 64"}))});assert.equal(manifest.assets.length,16);
const entries=gameplayIconIds.map((id)=>({id,u0:0,v0:0,u1:1,v1:1}));assert.equal(normalizeIconAtlasData({width:1,height:1,pixels:new Uint8Array([255,255,255,255]),entries}).entries.length,16);
let canvasSize={width:0,height:0};const atlas=await rasterizeBrandingIconAtlas(manifest,{resolveUrl:()=>"https://assets.invalid/a.svg",fetch:async()=>new Response(new Blob(["<svg/>"])),createCanvas:(width,height)=>{canvasSize={width,height};return /** @type {HTMLCanvasElement} */(/** @type {unknown} */({getContext:()=>({clearRect(){},drawImage(){},getImageData(){return{data:new Uint8ClampedArray(width*height*4)};}})}));},createBitmap:async()=>({close(){}})});assert.deepEqual(canvasSize,{width:1024,height:1024});assert.equal(atlas.width,1024);
console.log("PlayCanvas world model, all presentations, atlas, timing, spent/cull, and bounded-target validation passed.");
