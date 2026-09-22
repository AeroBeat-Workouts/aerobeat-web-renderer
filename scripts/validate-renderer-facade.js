// @ts-check

import assert from "node:assert/strict";
import * as pc from "playcanvas";
import { defaultGameplayCameraPose } from "../src/gameplay-camera-pose.js";
import {
  aeroPlayCanvasRendererServiceId,buildGameplaySceneModel,compactRendererVisualProfile,createAeroPlayCanvasRenderer,CURSOR_LOST_DIM_ALPHA,defaultRendererTuning,gameplayIconIds,
  gameplayWorldGrid,normalizeBrandingIconManifest,normalizeIconAtlasData,rasterizeBrandingIconAtlas,timestampToWorldZ,worldPositionForCell
} from "../src/index.js";
import { gloveGeometry, judgeToPresentationPoint, saberGeometry } from "@aerobeat/web-contracts/equipment-contracts";

assert.equal(aeroPlayCanvasRendererServiceId,"aero.renderer.playcanvas");
const debugRenderer=createAeroPlayCanvasRenderer();const effectivePaletteSymbol=Symbol.for("aerobeat.web-renderer.internal-effective-palette"),effectivePaletteDescriptor=Object.getOwnPropertyDescriptor(debugRenderer,effectivePaletteSymbol);assert.deepEqual({enumerable:effectivePaletteDescriptor?.enumerable,writable:effectivePaletteDescriptor?.writable,configurable:effectivePaletteDescriptor?.configurable},{enumerable:false,writable:false,configurable:false},"effective marker palette seam is private and immutable");assert.throws(()=>debugRenderer[effectivePaletteSymbol]("#aabbcc","#DDEEFF"),/palette is invalid/u);debugRenderer[effectivePaletteSymbol]("#AABBCC","#DDEEFF");assert.equal(Object.keys(debugRenderer).some((key)=>key.toLowerCase().includes("palette")),false);assert.equal(JSON.stringify(debugRenderer.describe()).includes("#AABBCC")||JSON.stringify(debugRenderer.describe()).includes("#DDEEFF"),false,"effective marker colors never enter diagnostics");debugRenderer[effectivePaletteSymbol](null,null);debugRenderer.resetDebugCamera();const debugRotation=new pc.Quat().setFromEulerAngles(debugRenderer.debugPitch*180/Math.PI,debugRenderer.debugYaw*180/Math.PI,0),debugForward=debugRotation.transformVector(new pc.Vec3(0,0,-1));assert.ok(debugForward.z<-.99,"reset debug camera must face negative-Z gameplay");assert.ok(Math.abs(debugForward.y)<1e-12,"reset debug camera must use Derrick-reviewed level pitch");assert.equal(debugRenderer.debugYaw,0);
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
const facadeTransform={position:{x:1,y:2,z:3},rotationDegrees:{xPitch:4,yYaw:5,zRoll:6},scale:2};debugRenderer.setEnvironmentTransform(facadeTransform);assert.deepEqual(debugRenderer.environmentOwner.transform,facadeTransform,"private facade must retain a canonical environment transform before descriptor/attachment");const retainedFacadeTransform=debugRenderer.environmentOwner.transform;assert.throws(()=>debugRenderer.setEnvironmentTransform({...facadeTransform,scale:5}),/Environment/);assert.equal(debugRenderer.environmentOwner.transform,retainedFacadeTransform,"facade transform rejection must be atomic");
assert.equal(timestampToWorldZ(1500,1000),-3);assert.equal(timestampToWorldZ(500,1000),3);
assert.deepEqual(worldPositionForCell(0),{x:-1.5,y:2});assert.deepEqual(worldPositionForCell(3),{x:1.5,y:2});assert.deepEqual(worldPositionForCell(8),{x:-1.5,y:0});assert.deepEqual(worldPositionForCell(11),{x:1.5,y:0});assert.equal(worldPositionForCell(12),null);
assert.deepEqual(gameplayWorldGrid.columnX,[-1.5,-0.5,0.5,1.5]);assert.deepEqual(gameplayWorldGrid.rowY,[2,1,0]);assert.deepEqual(gameplayWorldGrid.columnX.slice(1).map((value,index)=>value-gameplayWorldGrid.columnX[index]),[1,1,1]);assert.deepEqual(gameplayWorldGrid.rowY.slice(1).map((value,index)=>gameplayWorldGrid.rowY[index]-value),[1,1],"canonical column and row pitches must be equal world units");
const target=(id,cell,beatCenterMs=1000)=>({id,kind:/** @type {const} */("flow"),hand:/** @type {const} */("left"),family:/** @type {const} */("flow"),cell,cells:[],lane:null,beatCenterMs,direction:/** @type {const} */("right"),judgement:/** @type {const} */("pending")});
const flow=buildGameplaySceneModel({presentation:"flow",nowMs:1000,timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:[target("near",5,1100),target("far",5,1700),target("active",0,1000)]});
assert.equal(flow.camera,defaultGameplayCameraPose);assert.deepEqual(flow.camera.position,{x:0.05,y:1,z:5});assert.deepEqual(flow.camera.rotationEulerDegrees,{xPitch:0,yYaw:0,zRoll:0});assert.equal(flow.camera.projection.verticalFovDegrees,48);assert.ok(flow.camera.position.z>0&&flow.camera.rotationEulerDegrees.yYaw===0,"fixed athlete camera must use the canonical conventional negative-Z pose");
for(const presentation of["flow","boxing_spatial_grid","boxing_lanes"])assert.equal(buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation,nowMs:0,targets:[],timingWindowBeforeMs:180,timingWindowAfterMs:180})).camera,defaultGameplayCameraPose,`${presentation} must share the one canonical camera default`);
for(const presentation of["flow","boxing_spatial_grid"]){const hidden=buildGameplaySceneModel({presentation,nowMs:0,targets:[],blockedCells:[0],safeCells:[11]}),shown=buildGameplaySceneModel({presentation,nowMs:0,targets:[],showGameplayGrid:true});assert.equal(hidden.objects.filter((entry)=>entry.id.startsWith("cell-")).length,0,`${presentation} grid defaults hidden`);assert.equal(shown.objects.filter((entry)=>entry.id.startsWith("cell-")).length,12,`${presentation} strict true shows neutral 4x3 cells`);assert.deepEqual(hidden.objects.filter((entry)=>entry.kind==="cell").map((entry)=>entry.id).sort(),["obstacle-0","safe-11"],`${presentation} safe/blocked truth remains visible`);assert.equal(hidden.objects.filter((entry)=>entry.kind==="track").length,3,`${presentation} track remains visible`);}assert.equal(buildGameplaySceneModel({presentation:"boxing_lanes",nowMs:0,targets:[],showGameplayGrid:true,timingWindowBeforeMs:180,timingWindowAfterMs:180}).objects.some((entry)=>entry.id.startsWith("cell-")),false,"Lanes never gains a 4x3 floor");assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[],showGameplayGrid:1}),/frame is invalid/u,"grid visibility accepts only a strict boolean");
assert.equal(flow.timingZone.startZ,1.44);assert.equal(flow.timingZone.endZ,-.72);assert.deepEqual(flow.timingZone.segments.map((entry)=>entry.name),["late","active","early"]);assert.equal(flow.timingZone.segments[0].endZ,flow.timingZone.startZ);assert.equal(flow.timingZone.segments[2].startZ,flow.timingZone.endZ);const timingTiles=flow.objects.filter((entry)=>entry.kind==="timing");assert.ok(timingTiles.length>12&&timingTiles.every((entry)=>gameplayWorldGrid.columnX.includes(entry.position.x)&&entry.scale.x===.94&&entry.scale.z<=.36&&entry.appearanceColor),"canonical-lane timing surface tiles must be model-derived and boundary-clipped");assert.deepEqual([...new Set(timingTiles.map((entry)=>entry.appearanceColor))],["#39c96b","#f4df62","#e5484d"],"surface order from future toward athlete must be green/yellow/red");
const flowTargets=flow.objects.filter((entry)=>entry.kind==="icon");assert.deepEqual(flowTargets.map((entry)=>entry.targetId),["far","near","active"],"opaque GLB targets must remain deterministic far-near");assert.deepEqual(flowTargets.map((entry)=>entry.position.z),[-4.2,-.6,0]);assert.ok(flowTargets.every((entry)=>!entry.transparent&&entry.iconId===null));assert.deepEqual(flowTargets.map((entry)=>entry.assetId),["directional-arrow/rounded-outline-v1","directional-arrow/rounded-outline-v1","directional-arrow/rounded-outline-v1"]);assert.ok(flowTargets.every((entry)=>entry.tintColor===undefined&&entry.tintMix===undefined&&entry.whiteCore===undefined),"0.0.62 Option A: no white success-core — unresolved notes keep their song color the whole approach");assert.equal(flow.objects.filter((entry)=>entry.kind==="track"&&entry.assetId==="track/blue-glass-v1").length,3,"canonical track must use deterministic unscaled segment reuse");const noteShadows=flow.objects.filter((entry)=>entry.kind==="shadow");assert.equal(noteShadows.length,3);assert.ok(noteShadows.every((shadow)=>shadow.position.x===flowTargets.find((icon)=>icon.targetId===shadow.targetId)?.position.x&&shadow.position.z===flowTargets.find((icon)=>icon.targetId===shadow.targetId)?.position.z&&shadow.appearanceColor==="#11141a"),"note shadows must remain directly below target truth");
assert.equal(flowTargets.find((entry)=>entry.targetId==="active")?.state,"active");
const spent=buildGameplaySceneModel({presentation:"flow",nowMs:1201,timingWindowBeforeMs:120,timingWindowAfterMs:200,targets:[target("spent",5,1000)]});assert.equal(spent.objects.find((entry)=>entry.targetId==="spent")?.state,"spent");
const culled=buildGameplaySceneModel({presentation:"flow",nowMs:1801,timingWindowBeforeMs:120,timingWindowAfterMs:200,targets:[target("culled",5,1000)]});assert.deepEqual(culled.culledTargetIds,["culled"]);assert.equal(culled.objects.some((entry)=>entry.targetId==="culled"),false);
const obstacle={id:"wall",kind:/** @type {const} */("obstacle"),hand:/** @type {const} */("neutral"),family:/** @type {const} */("obstacle"),cell:null,cells:[1,5,9],gameplayGeometry:{schema:/** @type {const} */("aerobeat/obstacle_gameplay_geometry"),version:/** @type {const} */(1),coordinateSpace:/** @type {const} */("aerobeat_top_left_grid"),x:1,y:0,width:1,height:3},lane:null,beatCenterMs:1500,intervalStartMs:1400,intervalEndMs:1900};
const obstacleModel=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[obstacle]});const volumes=obstacleModel.objects.filter((entry)=>entry.targetId==="wall"&&entry.kind==="obstacle"),wallShadow=obstacleModel.objects.find((entry)=>entry.targetId==="wall"&&entry.kind==="shadow");assert.equal(volumes.length,1);assert.ok(wallShadow&&wallShadow.position.x===volumes[0].position.x&&wallShadow.position.z===volumes[0].position.z&&wallShadow.scale.z===volumes[0].scale.z,"continuous obstacle shadow must remain directly below the full source interval");assert.deepEqual({x:volumes[0].position.x,y:volumes[0].position.y},{x:-.5,y:1});approximate(volumes[0].position.z,-3.9,"wall interval center is exact");assert.equal(volumes[0].scale.x,1);approximate(volumes[0].scale.y,2.94/.94,"3c9d crouch wall retains above-grid source height");approximate(volumes[0].scale.z,3,"wall depth follows exact interval");assert.ok(volumes.every((entry)=>entry.iconId===null&&entry.transparent&&entry.renderOrder===30&&entry.role==="obstacle"),"wall instance retains translucent authored semantics");
const distantObstacle={...obstacle,id:"distant-wall",beatCenterMs:10000,intervalStartMs:10000,intervalEndMs:10500,normalSpawnMs:8500};const distantSkyGate=8500-1000;const distantBefore=buildGameplaySceneModel({presentation:"flow",nowMs:distantSkyGate-1,targets:[distantObstacle]});assert.equal(distantBefore.objects.some((entry)=>entry.targetId==="distant-wall"),false,"wall stays invisible strictly before its configured sky entry gate even with a bounded normal-spawn boundary");const distantAtRow=buildGameplaySceneModel({presentation:"flow",nowMs:distantSkyGate,targets:[distantObstacle]});const distantWall=distantAtRow.objects.find((entry)=>entry.targetId==="distant-wall"&&entry.kind==="obstacle");assert.ok(distantWall,"wall appears exactly at its derived sky start gate");assert.ok(Math.abs(distantWall.position.y-(1+50))<1e-9,"wall starts elevated by the shared sky height at its geometry center");const expectedHeadZ=-((10000-distantSkyGate)*0.006),expectedTailZ=-((10500-distantSkyGate)*0.006);approximate(distantWall.position.z,(expectedHeadZ+expectedTailZ)/2,"distant wall center preserves exact head/tail ts2z parity at the visible spawn row");approximate(distantWall.scale.z,Math.abs(expectedTailZ-expectedHeadZ),"rigid full-column depth spans the exact authored interval");
const adjacentObstacle={...obstacle,id:"adjacent-wall",cells:[0,1,4,5],gameplayGeometry:{...obstacle.gameplayGeometry,x:0,y:0,width:2,height:2}};const adjacentVolumes=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[adjacentObstacle]}).objects.filter((entry)=>entry.targetId==="adjacent-wall"&&entry.kind==="obstacle");assert.equal(adjacentVolumes.length,1,"multi-cell source geometry must render as one continuous wall");assert.deepEqual({x:adjacentVolumes[0].position.x,y:adjacentVolumes[0].position.y},{x:-1,y:1.5});approximate(adjacentVolumes[0].position.z,-3.9,"wide wall interval center is exact");approximate(adjacentVolumes[0].scale.x,1.94/.94,"continuous wall applies one outer inset without internal gaps");approximate(adjacentVolumes[0].scale.y,1.94/.94,"continuous wall applies one outer inset without internal gaps");
assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[{...obstacle,intervalEndMs:1300}]}),/interval/u);
const directions=["up","up-right","right","down-right","down","down-left","left","up-left"];
const directionModel=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:directions.map((direction,index)=>({...target(`d${index}`,index),direction}))});assert.deepEqual(directionModel.objects.filter((entry)=>entry.kind==="icon").map((entry)=>entry.rotationZRad),[0,-Math.PI/4,-Math.PI/2,-Math.PI*3/4,Math.PI,Math.PI*3/4,Math.PI/2,Math.PI/4],"+Y-authored arrow must rotate only around local Z from authoritative direction");
const directionless=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{...target("dot",5),direction:null}]}).objects.find((entry)=>entry.targetId==="dot");assert.equal(directionless?.iconId,null);assert.equal(directionless?.assetId,"any-note/outlined-circle-v1");
const bombModel=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{id:"bomb",kind:"bomb",hand:"neutral",family:"bomb",cell:6,cells:[],lane:null,beatCenterMs:1000,appearanceColor:"#00FF00"}]});const bombObject=bombModel.objects.find((entry)=>entry.targetId==="bomb");assert.equal(bombObject?.assetId,"bomb/urchin-v1","truthful bomb semantics must use the canonical urchin");assert.equal(bombObject?.appearanceColor,null,"bomb appearance must remain fixed even when an appearance field is present");
const privateAppearance=buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{...target("palette-arrow",1,1700),appearanceColor:"#FF0000"},{...target("palette-circle",2,1900),direction:null,appearanceColor:"#808080"}]}).objects.filter((entry)=>entry.kind==="icon");assert.deepEqual(privateAppearance.map((entry)=>[entry.targetId,entry.appearanceColor]),[["palette-circle","#808080"],["palette-arrow","#FF0000"]],"eligible Flow notes must retain only their validated private appearance token");const punchAppearance=buildGameplaySceneModel({presentation:"boxing_spatial_grid",nowMs:1000,targets:[{id:"palette-punch",kind:"punch",hand:"left",family:"straight",cell:1,cells:[],lane:"left",beatCenterMs:1700,appearanceColor:"#123ABC"}]}).objects.find((entry)=>entry.targetId==="palette-punch");assert.equal(punchAppearance?.appearanceColor,"#123ABC","eligible Boxing punches must retain validated private appearance");for(const appearanceColor of["#123abc","#123ABCG","#123ABCFF","red",123,null,undefined])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{...target("bad-appearance",1,1700),appearanceColor}]}),/appearance color is invalid/u,"eligible appearance must be strict uppercase opaque #RRGGBB");
const gridTargets=[
  {id:"punch",kind:"punch",hand:"left",family:"straight",cell:1,cells:[],lane:"left",beatCenterMs:1000},
  {id:"guard",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[5,6],lane:null,beatCenterMs:1000,appearanceColor:"#00FF00"},
  {...obstacle,id:"squat",family:"squat"}
];
const grid=buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation:"boxing_spatial_grid",nowMs:1000,showGameplayGrid:true,blockedCells:[0,4],safeCells:[7,11],targets:gridTargets}));const gridCells=grid.objects.filter((entry)=>entry.id.startsWith("cell-"));assert.equal(grid.objects.filter((entry)=>entry.kind==="cell").length,16);assert.equal(new Set(gridCells.map((entry)=>`${entry.position.x},${entry.position.y}`)).size,12,"all authoritative 4x3 cells must have distinct row/column positions");assert.deepEqual(gridCells.filter((entry)=>["cell-0","cell-4","cell-8","cell-11"].includes(entry.id)).sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5))).map((entry)=>({id:entry.id,position:entry.position})),[{id:"cell-0",position:{x:-1.5,y:2,z:0}},{id:"cell-4",position:{x:-1.5,y:1,z:0}},{id:"cell-8",position:{x:-1.5,y:0,z:0}},{id:"cell-11",position:{x:1.5,y:0,z:0}}]);assert.ok(gridCells.every((entry)=>entry.scale.x===entry.scale.y),"every neutral grid cell must be mathematically square");assert.ok(grid.objects.filter((entry)=>entry.kind==="cell").every((entry)=>entry.scale.x===entry.scale.y),"neutral, blocked, and safe grid faces must share square geometry");assert.deepEqual(grid.objects.filter((entry)=>entry.id.startsWith("obstacle-")).map((entry)=>entry.position.y),[2,1]);assert.deepEqual(grid.objects.filter((entry)=>entry.id.startsWith("safe-")).sort((a,b)=>Number(a.id.slice(5))-Number(b.id.slice(5))).map((entry)=>entry.position.y),[1,0]);const gridVisualTargets=grid.objects.filter((entry)=>entry.kind==="icon");assert.deepEqual(gridVisualTargets.map((entry)=>entry.assetId).sort(),["any-note/outlined-circle-v1","guard/outlined-shield-v1","guard/outlined-shield-v1"].sort());assert.ok(gridVisualTargets.filter((entry)=>entry.targetId==="guard").every((entry)=>entry.appearanceColor===null&&entry.role==="guard"),"guards must ignore private note appearance and retain their fixed role");const gridWalls=grid.objects.filter((entry)=>entry.targetId==="squat"&&entry.kind==="obstacle"),gridWallShadows=grid.objects.filter((entry)=>entry.targetId==="squat"&&entry.kind==="shadow");assert.equal(gridWalls.length,1,"Boxing Grid obstacle must be one continuous canonical wall");assert.equal(gridWalls[0].assetId,"wall/red-glass-v1");assert.equal(gridWallShadows.length,1,"Boxing Grid wall must own exactly one shadow");const gridGuard=gridVisualTargets.filter((entry)=>entry.targetId==="guard");assert.equal(gridGuard.length,2);assert.deepEqual(gridGuard.map((entry)=>entry.position),[{x:-.5,y:1,z:0},{x:.5,y:1,z:0}]);assert.ok(gridGuard.every((entry)=>entry.assetId==="guard/outlined-shield-v1"&&JSON.stringify(entry.scale)===JSON.stringify(gridGuard[0].scale)&&entry.rotationZRad===0&&entry.position.y===gridGuard[0].position.y&&entry.position.z===gridGuard[0].position.z),"guard pair must share exact canonical identity/scale/orientation/Y/Z");
const laneTargets=[
  {id:"straight",kind:"punch",hand:"left",family:"straight",cell:null,cells:[],lane:"left",beatCenterMs:1000},
  {id:"hook",kind:"punch",hand:"right",family:"hook",cell:null,cells:[],lane:"right",beatCenterMs:1000},
  {id:"upper",kind:"punch",hand:"left",family:"uppercut",cell:null,cells:[],lane:"left",beatCenterMs:1000},
  {id:"guard",kind:"guard",hand:"both",family:"guard",cell:null,cells:[],lane:null,beatCenterMs:1000},
  {id:"cross",kind:"guard",hand:"both",family:"crossed_guard",cell:null,cells:[],lane:null,beatCenterMs:1000},
  {...obstacle,id:"squat",family:"squat"},
  {...obstacle,id:"wl",hand:"left",family:"weave",lane:"left",appearanceColor:"#00FF00"},
  {...obstacle,id:"wr",hand:"right",family:"weave",lane:"right",appearanceColor:"malformed"}
];
const lanes=buildGameplaySceneModel(/** @type {import("../src/gameplay-scene-model.js").AeroGameplayFrame} */({presentation:"boxing_lanes",nowMs:1000,timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:laneTargets}));assert.equal(lanes.objects.filter((entry)=>entry.kind==="lane").length,0,"legacy lane slabs must be removed");assert.equal(lanes.objects.filter((entry)=>entry.kind==="track"&&entry.assetId==="track/blue-glass-v1").length,3);assert.equal(lanes.objects.filter((entry)=>entry.targetId==="guard"&&entry.kind==="icon").length,2);assert.equal(lanes.objects.filter((entry)=>entry.targetId==="cross"&&entry.kind==="icon").length,2);const laneWalls=lanes.objects.filter((entry)=>entry.kind==="obstacle"),laneWallShadows=lanes.objects.filter((entry)=>["squat","wl","wr"].includes(String(entry.targetId))&&entry.kind==="shadow");assert.equal(laneWalls.filter((entry)=>entry.targetId==="squat").length,2,"Boxing Lanes squat must use both semantic lanes");assert.equal(laneWalls.filter((entry)=>entry.targetId==="wl").length,1);assert.equal(laneWalls.filter((entry)=>entry.targetId==="wr").length,1);assert.ok(laneWalls.every((entry)=>entry.assetId==="wall/red-glass-v1"&&entry.position.y===1&&entry.role==="obstacle"&&entry.appearanceColor===null),"Boxing Lanes walls must retain fixed obstacle appearance and cannot inherit hand or private note colors");for(const entry of laneWalls){approximate(entry.scale.y,2.94/.94,"Boxing Lanes wall must span canonical top through bottom");approximate(entry.scale.z,3,"Boxing Lanes wall depth must use the exact source interval");}const squatWallXs=laneWalls.filter((entry)=>entry.targetId==="squat").map((entry)=>entry.position.x).sort((a,b)=>a-b);assert.deepEqual(squatWallXs,[-0.9,0.9],"0.0.61 L-F8: squat keeps the per-lane duplication at both semantic lanes (±0.9)");assert.ok(laneWalls.filter((entry)=>entry.targetId==="squat").every((entry)=>entry.scale.x===1.7/.94),"0.0.61 L-F8: squat walls keep the full-lane width");for(const wallId of["wl","wr"]){const weaveWall=laneWalls.find((entry)=>entry.targetId===wallId);assert.equal(weaveWall.position.x,-0.5,`0.0.61 L-F8: ${wallId} weave wall must render at the AUTHORED column presentation X (geometry x:1 → columnX[1]=-0.5), not the weave-direction lane, got ${weaveWall.position.x}`);assert.equal(weaveWall.scale.x,1,`0.0.61 L-F8: ${wallId} weave wall spans exactly the authored single column`);}assert.equal(laneWallShadows.length,4,"every Boxing Lanes wall must own exactly one shadow");assert.ok(lanes.objects.filter((entry)=>entry.kind==="icon").every((entry)=>entry.iconId===null&&["directional-arrow/rounded-outline-v1","any-note/outlined-circle-v1","guard/outlined-shield-v1"].includes(entry.assetId)));
assert.throws(()=>buildGameplaySceneModel({presentation:"boxing_lanes",nowMs:0,targets:[]}),/timing window/u);
assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:Array.from({length:129},(_,index)=>target(String(index),0))}),/128/u);
assert.equal(flow.objects.some((entry)=>entry.kind==="ring"),false,"timing rings must not exist in world truth");
assert.equal(defaultRendererTuning.feedbackDurationMs,350);assert.equal(compactRendererVisualProfile.identity.profileId,"aero.visual.compact");assert.deepEqual(flow.timingZone.segments.map((entry)=>entry.color),["#e5484d","#f4df62","#39c96b"],"near-athlete rows must remain red/yellow/green");
const resolvedAt=(elapsed,judgement="hit")=>buildGameplaySceneModel({presentation:"flow",nowMs:1000+elapsed,targets:[{...target("resolved",5,1000),appearanceColor:"#FF0000",judgement,...(judgement==="miss"?{missCommitMs:1000}:{feedbackProgress:elapsed/350})}]});for(const elapsed of[0,79]){const model=resolvedAt(elapsed);const visual=model.objects.find((entry)=>entry.targetId==="resolved"&&entry.kind==="icon");assert.ok(visual,`resolved target must remain during 80 ms removal at ${elapsed}`);assert.equal(visual?.removal?.durationMs,80);assert.ok((visual?.scale.x??0)<=.92);assert.equal(visual?.position.z,0,"resolved target removal must stay at the exact crossing plane");}assert.equal(resolvedAt(80).objects.some((entry)=>entry.targetId==="resolved"&&entry.kind==="icon"),false,"resolved target must be absent at 80 ms");assert.equal(resolvedAt(81).objects.some((entry)=>entry.targetId==="resolved"&&entry.kind==="icon"),false);const hold=resolvedAt(180).objects.find((entry)=>entry.kind==="feedback");assert.equal(hold?.feedback?.alpha,1);const fading=resolvedAt(181).objects.find((entry)=>entry.kind==="feedback");assert.ok((fading?.feedback?.alpha??1)<1);const end=resolvedAt(350).objects.find((entry)=>entry.kind==="feedback");assert.equal(end,undefined,"feedback must expire exactly at its 350 ms lifetime");const lateMiss=buildGameplaySceneModel({presentation:"flow",nowMs:1281,targets:[{...target("late-miss",5,1000),judgement:/** @type {const} */("miss"),missCommitMs:1181}]}).objects.find((entry)=>entry.kind==="feedback");assert.deepEqual(lateMiss?.position,{x:-.5,y:1.85,z:1.686},"late judgement feedback must track exact post-commit motion above the missed target");assert.equal(buildGameplaySceneModel({presentation:"flow",nowMs:1351,targets:[]}).objects.some((entry)=>entry.kind==="feedback"),false);const miss=resolvedAt(100,"miss").objects.find((entry)=>entry.kind==="feedback");assert.deepEqual({text:miss?.feedback?.text,face:miss?.feedback?.faceColor,outline:miss?.feedback?.separationColor},{text:"Miss",face:"#e5484d",outline:"#171a22"});const great=resolvedAt(100).objects.find((entry)=>entry.kind==="feedback");assert.deepEqual({text:great?.feedback?.text,face:great?.feedback?.faceColor,separation:great?.feedback?.separationColor},{text:"Great",face:"#ffffff",separation:"#171a22"});
const feedbackCap=buildGameplaySceneModel({presentation:"flow",nowMs:1400,targets:[10,20,30,40,50,60].map((elapsed,index)=>({...target(`f${index}`,index,1400-elapsed),judgement:/** @type {const} */("hit"),feedbackProgress:elapsed/350}))}).objects.filter((entry)=>entry.kind==="feedback");assert.equal(feedbackCap.length,4);assert.deepEqual(feedbackCap.map((entry)=>entry.feedback?.elapsedMs),[40,30,20,10],"feedback cap must evict oldest and retain oldest-first order among four labels");const excluded=buildGameplaySceneModel({presentation:"flow",nowMs:1100,targets:[{...obstacle,judgement:"miss",missCommitMs:1000},{id:"bomb-resolved",kind:"bomb",hand:"neutral",family:"bomb",cell:6,cells:[],lane:null,beatCenterMs:1000,judgement:"miss",missCommitMs:1000}]});assert.equal(excluded.objects.some((entry)=>entry.kind==="feedback"),false,"obstacles and bombs never emit feedback");// 0.0.62 Option A: the white success-core is gone — an unresolved note keeps its
// song color the whole approach (no white tint, no whiteCore), through the
// success zone, the crossing, and the late window.
const noWhiteAt=(nowMs)=>buildGameplaySceneModel({presentation:"flow",nowMs,timingWindowBeforeMs:120,timingWindowAfterMs:240,targets:[target("no-white",5,1000)]}).objects.find((entry)=>entry.targetId==="no-white");for(const nowMs of[880,910,940,1010,1040,1100]){const icon=noWhiteAt(nowMs);assert.ok(icon,`unresolved target must remain at ${nowMs}`);assert.equal(icon?.whiteCore,undefined,`no whiteCore field at ${nowMs}`);assert.equal(icon?.tintColor,undefined,`no white tintColor field at ${nowMs}`);assert.equal(icon?.tintMix,undefined,`no tintMix field at ${nowMs}`);}assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[{...target("missing-progress",5),judgement:"hit"}]}),/feedback progress is required/);assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[target("x".repeat(129),5)]}),/target is invalid/);assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[{...target("unbounded",5),cells:Array.from({length:13},(_,index)=>index)}]}),/Target cells are invalid/,"cell fan-out must remain bounded");assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[],safeCells:[0,0]}),/Safe cells are invalid/);
const missModel=resolvedAt(100,"miss"),missIcon=missModel.objects.find((entry)=>entry.kind==="icon"),missFeedback=missModel.objects.find((entry)=>entry.kind==="feedback"),greatFeedback=resolvedAt(100).objects.find((entry)=>entry.kind==="feedback");assert.equal(missIcon?.appearanceColor,"#2a3038");approximate(missIcon?.position.z??-1,.6,"missed note must move at exact canonical speed after turning gray");assert.equal(missIcon?.removal,null);assert.ok(resolvedAt(349,"miss").objects.some((entry)=>entry.kind==="icon"));assert.equal(resolvedAt(350,"miss").objects.some((entry)=>entry.kind==="icon"),false,"missed note must expire at the bounded 350 ms lifetime");assert.deepEqual({animation:missFeedback?.feedback?.animation,height:missFeedback?.feedback?.apparentHeightCssPx,y:missFeedback?.feedback?.offsetY,scale:missFeedback?.feedback?.scale},{animation:"shake",height:42,y:0,scale:1.08});assert.notEqual(missFeedback?.feedback?.offsetX,0,"Miss must use deterministic rapid horizontal shake");assert.deepEqual(missFeedback?.feedback,resolvedAt(100,"miss").objects.find((entry)=>entry.kind==="feedback")?.feedback,"feedback motion must derive only from caller time");assert.equal(greatFeedback?.feedback?.animation,"bounce");assert.equal(greatFeedback?.feedback?.apparentHeightCssPx,48);assert.ok((greatFeedback?.feedback?.offsetY??0)>0&&(greatFeedback?.feedback?.scale??1)>1,"Great must use a larger deterministic bounce");

const manifest=normalizeBrandingIconManifest({schemaId:"aerobeat.branding.web-gameplay-icons.v1",schemaVersion:1,colorContract:"currentColor",webglContract:"alpha-mask-atlas-input",assets:gameplayIconIds.map((id)=>({id,file:`${id.replaceAll(".","-")}.svg`,viewBox:id==="feedback.great"?"0 0 128 32":id.includes("guard")?"0 0 48 24":"0 0 64 64"}))});assert.equal(manifest.assets.length,16);
const entries=gameplayIconIds.map((id)=>({id,u0:0,v0:0,u1:1,v1:1}));assert.equal(normalizeIconAtlasData({width:1,height:1,pixels:new Uint8Array([255,255,255,255]),entries}).entries.length,16);
let canvasSize={width:0,height:0};const atlas=await rasterizeBrandingIconAtlas(manifest,{resolveUrl:()=>"https://assets.invalid/a.svg",fetch:async()=>new Response(new Blob(["<svg/>"])),createCanvas:(width,height)=>{canvasSize={width,height};return /** @type {HTMLCanvasElement} */(/** @type {unknown} */({getContext:()=>({clearRect(){},drawImage(){},getImageData(){return{data:new Uint8ClampedArray(width*height*4)};}})}));},createBitmap:async()=>({close(){}})});assert.deepEqual(canvasSize,{width:1024,height:1024});assert.equal(atlas.width,1024);
// 0.0.60 W4-C2b (F4): per-anchor cursor dim. The material-setting path must pass
// CURSOR_LOST_DIM_ALPHA for a dimmed cursor and keep alpha 1 for undimmed ones,
// and the record shape gate must accept an optional boolean `dimmed` only.
{
  assert.equal(CURSOR_LOST_DIM_ALPHA,0.45,"CURSOR_LOST_DIM_ALPHA must stay the agreed 0.45");
  const dimRenderer=createAeroPlayCanvasRenderer();
  const materialCalls=[];
  dimRenderer.updateMaterial=(entity,colorToken,alpha,iconId,spent,depthWrite)=>{materialCalls.push({colorToken,alpha,depthWrite});};
  dimRenderer.acquireFallbackMarker=()=>({enabled:false,name:"",setPosition(){},setLocalScale(){},setEulerAngles(){}});
  dimRenderer.app={root:{addChild(){}}};
  dimRenderer.gameplayAssetLoader.activateFallback("unit_test");
  const grid={x:0,y:0,width:1,height:1};
  const mixed=dimRenderer.stageGameplayCursors([{role:"nose",x:.3,y:.4,confidence:.9},{role:"left_wrist",x:.5,y:.5,confidence:.95,dimmed:false},{role:"right_wrist",x:.7,y:.6,confidence:.9,dimmed:true}],{grid,sizeCssPx:32},true);
  assert.equal(mixed.cursorCount,3,"absent-dimmed, dimmed:false, and dimmed:true cursors must all stage");
  assert.deepEqual(mixed.roles,["nose","left_wrist","right_wrist"]);
  assert.deepEqual(materialCalls.map((call)=>call.alpha),[1,1,CURSOR_LOST_DIM_ALPHA],"undimmed cursors must keep alpha 1, dimmed cursors must take CURSOR_LOST_DIM_ALPHA");
  assert.ok(materialCalls.every((call)=>call.depthWrite===true),"fallback marker depth-write flag must stay authored true");
  materialCalls.length=0;
  const rejected=dimRenderer.stageGameplayCursors([{role:"nose",x:.5,y:.5,confidence:1,extra:true},{role:"left_wrist",x:.5,y:.5,confidence:1,dimmed:"yes"}],{grid,sizeCssPx:32},true);
  assert.equal(rejected.cursorCount,0,"an unknown 5th key or a non-boolean dimmed must be rejected");
  assert.deepEqual(materialCalls,[]);
}
console.log("PlayCanvas world model, all presentations, atlas, timing, spent/cull, and bounded-target validation passed.");
  // 0.0.62 L-C (r2lb): equipment visuals — flow saber GLB (custom Blender energy blade)
  // + boxing glove primitives, per-hand song color, freeze-dim, staging pass.
  // Geometry constants come from the frozen @aerobeat/web-contracts/equipment-contracts source.
  {
    assert.deepEqual(saberGeometry, { length: 0.75, radius: 0.18 }, "contract saber geometry must stay GATE-1 locked");
    assert.deepEqual(gloveGeometry, { x: 0.34, y: 0.28, z: 0.34, offsetZ: 0.05 }, "contract glove geometry must stay GATE-1 locked");
    assert.deepEqual(judgeToPresentationPoint({ x: 0, y: 1.25 }), { x: -1.5, y: 1.25 }, "judge → presentation shift must be -1.5 X");
    const equipmentRenderer = createAeroPlayCanvasRenderer();
    equipmentRenderer.app = { root: { addChild() {} } };
    const equipmentCalls = [];
    const makeStub = (name, type) => ({ name, type, enabled: false, setPosition(x, y, z) { this.pos = [x, y, z]; }, setLocalScale(x, y, z) { this.scale = [x, y, z]; }, setEulerAngles(x, y, z) { this.euler = [x, y, z]; } });
    equipmentRenderer.makeEntity = (name, type) => makeStub(name, type);
    equipmentRenderer.updateEquipmentMaterial = (entity, colorToken, alpha, gain, kind) => { equipmentCalls.push({ name: entity.name, colorToken, alpha, gain, kind }); };
    equipmentRenderer.applyEquipmentGlbAppearance = (entity, assetId, colorToken, alpha) => { equipmentCalls.push({ name: entity.name, colorToken, alpha, kind: "glb:" + assetId }); };
    equipmentRenderer.gameplayAssetLoader.activateFallback("unit_test");
    const equipmentGrid = { x: 0, y: 0, width: 1, height: 1 };
    // Fallback test: loader not ready → saber stages from primitives.
    const result = equipmentRenderer.stageGameplayEquipment([{ role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: 1, y: 0 } }, { role: "right_wrist", x: 0.25, y: 0.5, mode: "boxing", dimmed: true }], { grid: equipmentGrid }, true);
    assert.equal(result.equipmentCount, 2, "both accepted equipment roles must stage");
    assert.deepEqual(result.roles, ["left_wrist", "right_wrist"]);
    assert.equal(equipmentRenderer.describe().equipment.assetMode, "primitive", "loader fallback must report primitive asset mode");
    const saberHilt = equipmentRenderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")[0];
    const saberBlade = equipmentRenderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")[1];
    assert.equal(saberHilt.type, "cylinder", "fallback saber hilt must be a cylinder primitive");
    assert.equal(saberBlade.type, "cylinder", "fallback saber blade must be a cylinder primitive");
    // 0.0.62 L-C r2: the primitive fallback is a two-cylinder approximation
    // (dark hilt + tinted blade). The hilt sits at the wrist end, the blade
    // at the far end. Both are aligned to the judge-space direction.
    const hiltMidX = 0 + 1 * 0.09;  // hilt center: wrist + hiltLen/2
    const bladeMidX = 0 + 1 * (0.18 + 0.285);  // blade center: wrist + hiltLen + bladeLen/2
    assert.ok(Math.abs(saberHilt.pos[0] - hiltMidX) < 1e-9 && Math.abs(saberHilt.pos[1] - 1) < 1e-9 && Math.abs(saberHilt.pos[2] - 0.45) < 1e-9, "fallback saber hilt must sit at the wrist-end midpoint");
    assert.ok(Math.abs(saberBlade.pos[0] - bladeMidX) < 1e-9 && Math.abs(saberBlade.pos[1] - 1) < 1e-9 && Math.abs(saberBlade.pos[2] - 0.45) < 1e-9, "fallback saber blade must sit at the blade-section midpoint");
    assert.ok(Math.abs(saberHilt.scale[0] - 0.18) < 1e-9, "fallback saber hilt capsule must carry the hilt length");
    assert.ok(Math.abs(saberBlade.scale[0] - 0.57) < 1e-9, "fallback saber blade capsule must carry the blade length");
    assert.ok(Math.abs(saberHilt.euler[2] - 90) < 1e-9, "fallback saber hilt must align +X toward the judge-space direction");
    assert.ok(Math.abs(saberBlade.euler[2] - 90) < 1e-9, "fallback saber blade must align +X toward the judge-space direction");
    const gloveBody = equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist")[0];
    const gloveAccent = equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist")[1];
    assert.equal(gloveBody.type, "box", "boxing glove body must be a box primitive");
    const expectedGloveZ = 0.45 + gloveGeometry.offsetZ;
    assert.ok(Math.abs(gloveBody.pos[0] - (-0.5 - 0.5)) < 1e-9 && Math.abs(gloveBody.pos[1] - 1) < 1e-9 && Math.abs(gloveBody.pos[2] - expectedGloveZ) < 1e-9, "glove body must center at wrist +0.05 WU toward the grid (+z at the athlete plane)");
    assert.ok(Math.abs(gloveBody.scale[0] - 2 * gloveGeometry.x) < 1e-9 && Math.abs(gloveBody.scale[1] - 2 * gloveGeometry.y) < 1e-9 && Math.abs(gloveBody.scale[2] - 2 * gloveGeometry.z) < 1e-9, "glove body must span the contract box extents");
    assert.equal(gloveAccent.enabled, true, "glove must keep a structural accent primitive enabled");
    // 0.0.62 L-C r2: the primitive fallback stages two capsules (hilt + blade).
    // The hilt (equipment-left_wrist) carries the dark gunmetal color; the
    // blade (equipment-left_wrist-core) carries the per-hand theme color.
    const saberHiltTint = equipmentCalls.find((call) => call.name === "equipment-left_wrist");
    const saberBladeTint = equipmentCalls.find((call) => call.name === "equipment-left_wrist-core");
    const gloveTint = equipmentCalls.find((call) => call.name === "equipment-right_wrist");
    const gloveAccentCall = equipmentCalls.find((call) => call.name === "equipment-right_wrist-accent");
    assert.equal(saberHiltTint.colorToken, "#2a3038", "left saber hilt must carry the dark gunmetal color");
    assert.equal(saberBladeTint.colorToken, "#2693ff", "left saber blade must carry the left-hand theme color when no effective palette is set");
    assert.equal(saberBladeTint.alpha, 1, "undimmed equipment must stay at alpha 1");
    assert.equal(gloveTint.colorToken, "#39c96b", "right glove must carry the right-hand theme color when no effective palette is set");
    assert.equal(gloveTint.alpha, CURSOR_LOST_DIM_ALPHA, "dimmed equipment must take CURSOR_LOST_DIM_ALPHA");
    assert.equal(gloveAccentCall.colorToken, "#F2F5FB", "glove accent must stay the white structural accent");
    assert.equal(gloveAccentCall.alpha, CURSOR_LOST_DIM_ALPHA, "glove accent must share the dimmed record alpha");
    const paletteSymbol = Symbol.for("aerobeat.web-renderer.internal-effective-palette");
    equipmentRenderer[paletteSymbol]("#AABBCC", "#DDEEFF");
    equipmentCalls.length = 0;
    const paletteResult = equipmentRenderer.stageGameplayEquipment([{ role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: 0, y: 1 } }, { role: "right_wrist", x: 0.5, y: 0.5, mode: "boxing" }], { grid: equipmentGrid }, true);
    assert.equal(paletteResult.equipmentCount, 2, "effective palette must re-stage both roles");
    // 0.0.62 L-C r2: the hilt (equipment-left_wrist) is always dark gunmetal;
    // the blade (equipment-left_wrist-core) carries the effective palette color.
    assert.equal(equipmentCalls.find((call) => call.name === "equipment-left_wrist-core").colorToken, "#AABBCC", "left saber blade must use the effective left palette token");
    assert.equal(equipmentCalls.find((call) => call.name === "equipment-right_wrist").colorToken, "#DDEEFF", "right equipment must use the effective right palette token");
    const diagonal = equipmentRenderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist")[0];
    assert.ok(Math.abs(diagonal.euler[2] - 0) < 1e-9, "judge-space +Y direction must map to world +Y (0 degrees z-euler)");
    equipmentRenderer[paletteSymbol](null, null);
    equipmentCalls.length = 0;
    const offGrid = equipmentRenderer.stageGameplayEquipment([
      { role: "left_wrist", x: -0.25, y: -2, mode: "boxing" },
      { role: "right_wrist", x: 1.5, y: 3, mode: "boxing" }
    ], { grid: equipmentGrid }, true);
    assert.equal(offGrid.equipmentCount, 2, "otherwise-valid finite off-grid equipment must remain staged");
    const offGridLeftBody = equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:left_wrist")[0];
    const offGridRightBody = equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist")[0];
    assert.deepEqual(offGridLeftBody.pos, [-2, 2.5, 0.45 + gloveGeometry.offsetZ], "negative equipment coordinates must clamp to the exact left/top grid edges");
    assert.deepEqual(offGridRightBody.pos, [2, -0.5, 0.45 + gloveGeometry.offsetZ], ">1 equipment coordinates must clamp to the exact right/bottom grid edges");
    const malformedRecords = [
      { role: "nose", x: 0.5, y: 0.5, mode: "flow" },
      { role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", extra: true },
      { role: "left_wrist", x: NaN, y: 0.5, mode: "flow" },
      { role: "left_wrist", x: 0.5, y: Infinity, mode: "flow" },
      { role: "left_wrist", x: 0.5, y: 0.5, mode: "dance" },
      { role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: NaN, y: 0 } },
      { role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: 1, y: 0, extra: true } },
      { role: "right_wrist", x: 0.5, y: 0.5, mode: "boxing", direction: { x: 1, y: 0 } }
    ];
    for (const record of malformedRecords) {
      equipmentCalls.length = 0;
      const rejected = equipmentRenderer.stageGameplayEquipment([record], { grid: equipmentGrid }, true);
      assert.equal(rejected.equipmentCount, 0, `malformed/nonfinite equipment record must be skipped: ${String(record.role)}/${String(record.mode)}`);
      assert.deepEqual(equipmentCalls, [], "rejected records must not trigger any material calls");
    }
    const duplicateRole = equipmentRenderer.stageGameplayEquipment([
      { role: "left_wrist", x: 0.25, y: 0.5, mode: "boxing" },
      { role: "left_wrist", x: 0.75, y: 0.5, mode: "boxing" }
    ], { grid: equipmentGrid }, true);
    assert.equal(duplicateRole.equipmentCount, 1, "duplicate equipment roles must preserve the first record and reject the duplicate");
    assert.equal(equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:left_wrist")[0].pos[0], -1, "duplicate rejection must not overwrite the first staged role position");
    const empty = equipmentRenderer.stageGameplayEquipment([], { grid: equipmentGrid }, true);
    assert.equal(empty.equipmentCount, 0, "empty equipment array must stage nothing without error");
    assert.equal(equipmentRenderer.describe().equipment.instanceCount, 0, "describe().equipment must reflect the cleared state");
    assert.equal(equipmentRenderer.describe().equipment.assetMode, "none", "cleared equipment must report assetMode none");
    assert.throws(() => equipmentRenderer.stageGameplayEquipment(Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? "left_wrist" : "right_wrist", x: 0.5, y: 0.5, mode: "flow" })), { grid: equipmentGrid }, true), /cannot exceed 4 records/u, "equipment records are bounded to 4");
    equipmentRenderer.stageGameplayEquipment([{ role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: 1, y: 0 } }], { grid: equipmentGrid }, true);
    const saberEntities = equipmentRenderer.equipmentPools.get("equipment/flow-saber-v1:left_wrist");
    assert.ok(saberEntities.every((entity) => entity.enabled === true), "staged saber entities must be enabled");
    const gloveEntities = equipmentRenderer.equipmentPools.get("equipment/boxing-glove-v1:right_wrist");
    assert.ok(gloveEntities.every((entity) => entity.enabled === false), "un-staged glove entities must be disabled");
    // 0.0.61 L-F6: two-handed UNIFORM-mode regression — the pre-fix shared pool let the right
    // hand rename/reposition the left hand's saber entities, so only one beam was visible.
    // Per-role pools must give each hand its own enabled pair at its own wrist position.
    const twoHandedFlow = equipmentRenderer.stageGameplayEquipment([
      { role: "left_wrist", x: 0.5, y: 0.5, mode: "flow", direction: { x: 1, y: 0 } },
      { role: "right_wrist", x: 0.25, y: 0.5, mode: "flow", direction: { x: 1, y: 0 } }
    ], { grid: equipmentGrid }, true);
    assert.equal(twoHandedFlow.equipmentCount, 2, "two-handed uniform-mode flow must stage both hands");
    assert.deepEqual(twoHandedFlow.roles, ["left_wrist", "right_wrist"]);
    assert.deepEqual(equipmentRenderer.describe().equipment.modes, ["left_wrist:flow", "right_wrist:flow"], "diagnostics must derive from actually enabled entities");
    assert.equal(equipmentRenderer.describe().equipment.assetMode, "primitive", "fallback two-handed flow must report primitive asset mode");
    const twoHandedSaberPools = ["left_wrist", "right_wrist"].map((role) => equipmentRenderer.equipmentPools.get(`equipment/flow-saber-v1:${role}`));
    assert.ok(twoHandedSaberPools.every((entries) => entries.length === 2 && entries.every((entity) => entity.enabled === true)), "both hands must own distinct enabled saber pairs");
    // 0.0.62 L-C r2: entries[0] is the hilt (at wrist + hiltLen/2), entries[1] is the blade.
    // Check the hilt positions (entries[0]) at each hand's wrist-end.
    const leftHiltPos = twoHandedSaberPools[0][0].pos, rightHiltPos = twoHandedSaberPools[1][0].pos;
    assert.ok(Math.abs(leftHiltPos[0] - (0 + 0.09)) < 1e-9 && Math.abs(rightHiltPos[0] - (-1 + 0.09)) < 1e-9, "each saber hilt must sit at its own hand's wrist-end midpoint, not one shared position");
    assert.notDeepEqual(leftHiltPos, rightHiltPos, "uniform-mode hilt positions must be distinct");
  }
  console.log("Equipment staging validation passed (0.0.62 L-C r2lb).");

// --- 0.0.63 C2: per-hand equipment transform contract (scale + rotationZDeg) ---
{
  const r = createAeroPlayCanvasRenderer();
  r.app = { root: { addChild() {} } };
  const makeStub = (name, type) => ({ name, type, enabled: false, pos: [0,0,0], scale: [1,1,1], euler: [0,0,0], setPosition(x,y,z){this.pos=[x,y,z];}, setLocalScale(x,y,z){this.scale=[x,y,z];}, setEulerAngles(x,y,z){this.euler=[x,y,z];} });
  r.makeEntity = (name, type) => makeStub(name, type);
  r.updateEquipmentMaterial = () => {};
  r.applyEquipmentGlbAppearance = () => {};
  r.gameplayAssetLoader.activateFallback("unit_test");
  const grid = { x: 0, y: 0, width: 1, height: 1 };
  const base = { role: "left_wrist", x: 0.5, y: 0.5, mode: "flow" };
  let res;
  // Absent → accepted (defaults 0/1)
  res = r.stageGameplayEquipment([{ ...base }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "absent scale/rotationZDeg must be accepted");
  // Each alone
  res = r.stageGameplayEquipment([{ ...base, scale: 2.0 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "scale alone must be accepted");
  res = r.stageGameplayEquipment([{ ...base, rotationZDeg: 45 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "rotationZDeg alone must be accepted");
  // Both
  res = r.stageGameplayEquipment([{ ...base, scale: 1.5, rotationZDeg: -30 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "scale + rotationZDeg must be accepted");
  // With dimmed / direction combos
  res = r.stageGameplayEquipment([{ ...base, dimmed: true, scale: 2 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "scale with dimmed must be accepted");
  res = r.stageGameplayEquipment([{ ...base, direction: { x: 1, y: 0 }, rotationZDeg: 90 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "rotationZDeg with direction must be accepted");
  res = r.stageGameplayEquipment([{ ...base, dimmed: true, direction: { x: 0, y: 1 }, scale: 1.2, rotationZDeg: 10 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "all four optionals must be accepted");
  res = r.stageGameplayEquipment([{ role: "right_wrist", x: 0.3, y: 0.3, mode: "boxing", scale: 0.8, rotationZDeg: -15 }], { grid }, true);
  assert.equal(res.equipmentCount, 1, "boxing with scale + rotationZDeg must be accepted");
  // Invalid values → rejected
  res = r.stageGameplayEquipment([{ ...base, rotationZDeg: NaN }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "rotationZDeg NaN must be rejected");
  res = r.stageGameplayEquipment([{ ...base, scale: 0 }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "scale 0 must be rejected");
  res = r.stageGameplayEquipment([{ ...base, scale: -1 }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "scale -1 must be rejected");
  res = r.stageGameplayEquipment([{ ...base, rotationZDeg: "x" }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "rotationZDeg string must be rejected");
  res = r.stageGameplayEquipment([{ ...base, scale: "1.5" }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "scale string must be rejected");
  res = r.stageGameplayEquipment([{ ...base, scale: Infinity }], { grid }, true);
  assert.equal(res.equipmentCount, 0, "scale Infinity must be rejected");
  console.log("Equipment transform contract validation passed (0.0.63 C2).");
}
