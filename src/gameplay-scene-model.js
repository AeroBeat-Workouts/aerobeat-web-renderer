// @ts-check

import { defaultGameplayCameraPose } from "./gameplay-camera-pose.js";

/** @typedef {"flow"|"boxing_spatial_grid"|"boxing_lanes"} AeroGameplayPresentation */
/** @typedef {"left"|"right"|"guard"|"obstacle"|"neutral"|"safe"} AeroVisualRole */
/** @typedef {"pending"|"active"|"spent"|"hit"|"miss"} AeroSceneTargetState */
/** @typedef {{x:number,y:number,z:number}} AeroWorldPosition */
/** @typedef {{x:number,y:number,z:number}} AeroWorldScale */
/** @typedef {{id:string,kind:"flow"|"punch"|"guard"|"obstacle"|"safe",hand:"left"|"right"|"both"|"neutral",family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"safe",cell:number|null,cells:readonly number[],lane:"left"|"right"|null,beatCenterMs:number,approachLeadMs?:number,endMs?:number,intervalStartMs?:number,intervalEndMs?:number,judgement?:"pending"|"hit"|"miss",feedbackProgress?:number,direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null}} AeroRenderableTarget */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,targets:readonly AeroRenderableTarget[],timingWindowBeforeMs?:number,timingWindowAfterMs?:number,blockedCells?:readonly number[],safeCells?:readonly number[],countdown?:number|null,overlay?:"none"|"paused"|"calibrating"|"tracking_lost",calibrationDim?:number,viewportAspect?:number}} AeroGameplayFrame */
/** @typedef {{id:string,version:string,hash:string,dprCap:number,roleScale:number,worldUnitsPerMs:number,futureCullMs:number,spentCullMs:number,targetSize:number,obstacleHeight:number,timingZoneHeight:number,feedbackDurationMs:number,hitPulseScale:number,greatEndScale:number}} AeroRendererTuning */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** @typedef {{id:string,kind:"icon"|"obstacle"|"cell"|"lane"|"feedback",role:AeroVisualRole,targetId:string|null,position:AeroWorldPosition,scale:AeroWorldScale,rotationZRad:number,alpha:number,iconId:string|null,state:AeroSceneTargetState|null,transparent:boolean,intervalStartMs:number|null,intervalEndMs:number|null,sortDepth:number}} AeroGameplaySceneObject */
/** @typedef {{name:"early"|"active"|"late",startZ:number,endZ:number,color:string,alpha:number}} AeroTimingZoneSegment */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,objects:readonly AeroGameplaySceneObject[],timingZone:Readonly<{beforeMs:number,afterMs:number,startZ:number,endZ:number,segments:readonly AeroTimingZoneSegment[]}>,camera:typeof defaultGameplayCameraPose,grid:Readonly<{columns:4,rows:3,columnX:readonly number[],rowY:readonly number[],floorY:number}>,overlay:Readonly<{kind:string,dim:number,countdown:number|null}>,culledTargetIds:readonly string[]}} AeroGameplaySceneModel */

export const gameplayIconIds = Object.freeze(["boxing.glove","boxing.guard.crossed","boxing.guard.standard","boxing.hook.left","boxing.hook.right","boxing.squat","boxing.straight.left","boxing.straight.right","boxing.uppercut.left","boxing.uppercut.right","boxing.weave.left","boxing.weave.right","calibration.tpose","feedback.great","flow.directional","flow.directionless"]);
export const gameplayWorldGrid = Object.freeze({ columns:/** @type {4} */(4),rows:/** @type {3} */(3),columnX:Object.freeze([-2.4,-0.8,0.8,2.4]),rowY:Object.freeze([2.4,1.2,0]),floorY:-0.72 });
export const defaultGameplayTimingWindow = Object.freeze({ beforeMs:180,afterMs:180 });

/** @type {AeroRendererTuning} */
export const defaultRendererTuning = Object.freeze({ id:"aero.renderer.prototype.default",version:"2",hash:"visual-playcanvas-v2",dprCap:2,roleScale:1,worldUnitsPerMs:0.006,futureCullMs:10_000,spentCullMs:600,targetSize:0.9,obstacleHeight:3.9,timingZoneHeight:0.035,feedbackDurationMs:350,hitPulseScale:1.08,greatEndScale:1.25 });
/** @type {AeroRendererThemeTokens} */
export const defaultRendererThemeTokens = Object.freeze({ leftHandColor:"#2693ff",rightHandColor:"#39c96b",guardColor:"#9a67ea",obstacleColor:"#e5484d",receptorColor:"#d9f5ff",approachLeadMs:2500,targetStartScale:0.48,targetHitScale:1,approachEasing:"linear",hitEasing:"ease-out",missEasing:"ease-out" });

/** Absolute authoritative time mapping. No engine delta participates. @param {number} timestampMs @param {number} nowMs @param {number} [worldUnitsPerMs] */
export function timestampToWorldZ(timestampMs,nowMs,worldUnitsPerMs=defaultRendererTuning.worldUnitsPerMs){
  if(![timestampMs,nowMs,worldUnitsPerMs].every(Number.isFinite)||worldUnitsPerMs<=0)throw new TypeError("World time mapping is invalid");
  const deltaMs=timestampMs-nowMs;
  return deltaMs===0?0:-deltaMs*worldUnitsPerMs;
}

/** Exact canonical top-left 4x3 mapping. @param {number} cell */
export function worldPositionForCell(cell){
  if(!Number.isInteger(cell)||cell<0||cell>=12)return null;
  const column=cell%4,row=Math.floor(cell/4);
  return Object.freeze({x:gameplayWorldGrid.columnX[column],y:gameplayWorldGrid.rowY[row]});
}

/** @param {AeroGameplayFrame} frame @param {AeroRendererThemeTokens} [theme] @param {AeroRendererTuning} [tuning] @returns {AeroGameplaySceneModel} */
export function buildGameplaySceneModel(frame,theme=defaultRendererThemeTokens,tuning=defaultRendererTuning){
  if(!isPresentation(frame?.presentation)||!Number.isFinite(frame.nowMs)||!Array.isArray(frame.targets))throw new TypeError("Gameplay frame is invalid");
  const window=timingWindow(frame);
  const startZ=timestampToWorldZ(frame.nowMs-window.afterMs,frame.nowMs,tuning.worldUnitsPerMs);
  const endZ=timestampToWorldZ(frame.nowMs+window.beforeMs,frame.nowMs,tuning.worldUnitsPerMs);
  const activeHalf=Math.min(0.12,Math.max(0,Math.abs(endZ-startZ)/12));
  const segments=Object.freeze([
    zone("late",startZ,activeHalf,"#e5484d",0.34),
    zone("active",activeHalf,-activeHalf,"#f4df62",0.42),
    zone("early",-activeHalf,endZ,"#39c96b",0.32)
  ]);
  /** @type {AeroGameplaySceneObject[]} */ const objects=[];
  /** @type {string[]} */ const culled=[];
  addPresentationFloor(objects,frame);
  for(const cell of frame.safeCells??[])addCellState(objects,cell,"safe");
  for(const cell of frame.blockedCells??[])addCellState(objects,cell,"obstacle");
  const sorted=[...frame.targets].sort((a,b)=>b.beatCenterMs-a.beatCenterMs||a.id.localeCompare(b.id));
  if(sorted.length>128)throw new TypeError("Gameplay frame cannot exceed 128 targets");
  for(const target of sorted){
    const result=targetObjects(frame,target,window,theme,tuning);
    if(result.length===0)culled.push(target.id); else objects.push(...result);
  }
  objects.sort((a,b)=>a.sortDepth-b.sortDepth||a.id.localeCompare(b.id));
  const overlayKind=frame.overlay??"none";
  return Object.freeze({
    presentation:frame.presentation,nowMs:frame.nowMs,objects:Object.freeze(objects),
    timingZone:Object.freeze({beforeMs:window.beforeMs,afterMs:window.afterMs,startZ,endZ,segments}),
    camera:defaultGameplayCameraPose,
    grid:gameplayWorldGrid,
    overlay:Object.freeze({kind:overlayKind,dim:clamp(frame.calibrationDim??(overlayKind==="none"?0:0.62),0,1),countdown:normalizeCountdown(frame.countdown)}),
    culledTargetIds:Object.freeze(culled)
  });
}

/** @param {AeroGameplaySceneObject[]} objects @param {AeroGameplayFrame} frame */
function addPresentationFloor(objects,frame){
  if(frame.presentation==="boxing_lanes"){
    objects.push(sceneObject("lane-left","lane","left",null,{x:-1.35,y:gameplayWorldGrid.floorY,z:-15},{x:2.2,y:0.03,z:44},null,0,0.12,null,true,null,null,-15));
    objects.push(sceneObject("lane-right","lane","right",null,{x:1.35,y:gameplayWorldGrid.floorY,z:-15},{x:2.2,y:0.03,z:44},null,0,0.12,null,true,null,null,-15));
  } else {
    for(let cell=0;cell<12;cell+=1){const p=worldPositionForCell(cell);if(p)objects.push(sceneObject(`cell-${cell}`,"cell","neutral",null,{x:p.x,y:p.y,z:0},{x:1.5,y:1.05,z:0.025},null,0,0.14,null,true,null,null,0));}
  }
}
/** @param {AeroGameplaySceneObject[]} objects @param {number} cell @param {"safe"|"obstacle"} role */
function addCellState(objects,cell,role){const p=worldPositionForCell(cell);if(p)objects.push(sceneObject(`${role}-${cell}`,"cell",role,null,{x:p.x,y:p.y,z:0.02},{x:1.5,y:1.05,z:0.035},null,0,role==="safe"?0.28:0.55,null,true,null,null,0));}

/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {{beforeMs:number,afterMs:number}} window @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning */
function targetObjects(frame,target,window,theme,tuning){
  if(!target||typeof target.id!=="string"||!Number.isFinite(target.beatCenterMs))throw new TypeError("Gameplay target is invalid");
  const obstacle=frame.presentation==="flow"&&target.kind==="obstacle";
  const interval=obstacle?obstacleInterval(target):Object.freeze({startMs:target.beatCenterMs,endMs:target.beatCenterMs});
  const latest=interval.endMs+window.afterMs+tuning.spentCullMs;
  if(frame.nowMs>latest||interval.startMs-frame.nowMs>tuning.futureCullMs)return [];
  const state=targetState(target,frame.nowMs,interval,window);
  const role=targetRole(target);
  const alpha=state==="spent"?0.3:state==="miss"?0.42:0.98;
  const feedback=clamp(Number.isFinite(target.feedbackProgress)?Number(target.feedbackProgress):0,0,1);
  const pulse=state==="hit"?1+(tuning.hitPulseScale-1)*Math.sin(Math.PI*feedback):1;
  const icon=iconIdFor(target,frame.presentation);
  const rotation=target.kind==="flow"?flowDirectionRotation(target.direction??null):0;
  if(obstacle){
    const cells=target.cells.length?target.cells:target.cell===null?[]:[target.cell];
    const z0=timestampToWorldZ(interval.startMs,frame.nowMs,tuning.worldUnitsPerMs),z1=timestampToWorldZ(interval.endMs,frame.nowMs,tuning.worldUnitsPerMs);
    const center=(z0+z1)/2,depth=Math.max(0.12,Math.abs(z1-z0));
    return cells.map((cell,index)=>{const p=worldPositionForCell(cell);return p?sceneObject(`${target.id}:${index}`,"obstacle",role,target.id,{x:p.x,y:p.y,z:center},{x:1.5,y:1.05,z:depth},null,0,state==="spent"?0.18:0.42,state,true,interval.startMs,interval.endMs,center):null;}).filter(Boolean);
  }
  const positions=targetPositions(frame,target);
  const z=timestampToWorldZ(target.beatCenterMs,frame.nowMs,tuning.worldUnitsPerMs);
  return positions.map((p,index)=>sceneObject(`${target.id}:${index}`,"icon",role,target.id,{x:p.x,y:p.y,z},{x:tuning.targetSize*tuning.roleScale*pulse,y:tuning.targetSize*tuning.roleScale*pulse,z:0.04},icon,rotation,alpha,state,true,null,null,z));
}

/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target */
function targetPositions(frame,target){
  if(frame.presentation==="boxing_lanes"){
    if(target.kind==="guard"||target.family==="squat")return [{x:-1.35,y:1.1},{x:1.35,y:1.1}];
    return [{x:(target.lane??target.hand)==="left"?-1.35:1.35,y:1.1}];
  }
  const cells=target.cells.length?target.cells:target.cell===null?[]:[target.cell];
  if(target.kind==="guard"&&cells.length>=2){const a=worldPositionForCell(cells[0]),b=worldPositionForCell(cells[1]);return a&&b?[{x:(a.x+b.x)/2,y:(a.y+b.y)/2}]:[];}
  return cells.map(worldPositionForCell).filter(Boolean);
}
/** @param {AeroRenderableTarget} target */
function targetRole(target){return target.hand==="left"?"left":target.hand==="right"?"right":target.kind==="guard"?"guard":target.kind==="obstacle"?"obstacle":target.kind==="safe"?"safe":"neutral";}
/** @param {AeroRenderableTarget} target @param {AeroGameplayPresentation} presentation */
function iconIdFor(target,presentation){if(target.kind==="flow")return target.direction?"flow.directional":"flow.directionless";if(target.family==="squat")return"boxing.squat";if(target.family==="weave"){const d=presentation==="boxing_lanes"?target.lane:target.hand==="left"||target.hand==="right"?target.hand:null;return d?`boxing.weave.${d}`:null;}if(target.kind==="guard")return target.family==="crossed_guard"?"boxing.guard.crossed":"boxing.guard.standard";if(target.kind==="punch")return`boxing.${target.family}.${target.hand}`;return null;}
/** @param {AeroRenderableTarget} target @param {number} nowMs @param {{startMs:number,endMs:number}} interval @param {{beforeMs:number,afterMs:number}} window @returns {AeroSceneTargetState} */
function targetState(target,nowMs,interval,window){if(target.judgement==="hit")return"hit";if(target.judgement==="miss")return"miss";if(nowMs>interval.endMs+window.afterMs)return"spent";if(nowMs>=interval.startMs-window.beforeMs&&nowMs<=interval.endMs+window.afterMs)return"active";return"pending";}
/** @param {AeroRenderableTarget} target */
function obstacleInterval(target){const startMs=Number(target.intervalStartMs??target.beatCenterMs),endMs=Number(target.intervalEndMs??target.endMs??startMs);if(target.intervalEndMs!==undefined&&target.endMs!==undefined&&target.intervalEndMs!==target.endMs)throw new TypeError("Flow obstacle end bounds conflict");if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<startMs||endMs>86_400_000)throw new TypeError("Flow obstacle interval is invalid");return Object.freeze({startMs,endMs});}
/** @param {AeroGameplayFrame} frame */
function timingWindow(frame){const required=frame.presentation==="boxing_lanes";const before=frame.timingWindowBeforeMs??(required?NaN:defaultGameplayTimingWindow.beforeMs),after=frame.timingWindowAfterMs??(required?NaN:defaultGameplayTimingWindow.afterMs);if(![before,after].every((v)=>Number.isFinite(v)&&v>=0&&v<=10_000))throw new TypeError("Authoritative timing window is invalid");return Object.freeze({beforeMs:Number(before),afterMs:Number(after)});}
/** @param {"early"|"active"|"late"} name @param {number} startZ @param {number} endZ @param {string} color @param {number} alpha */
function zone(name,startZ,endZ,color,alpha){return Object.freeze({name,startZ:Math.min(startZ,endZ),endZ:Math.max(startZ,endZ),color,alpha});}
/** @returns {AeroGameplaySceneObject} */
function sceneObject(id,kind,role,targetId,position,scale,iconId,rotationZRad,alpha,state,transparent,intervalStartMs,intervalEndMs,sortDepth){return Object.freeze({id,kind,role,targetId,position:Object.freeze(position),scale:Object.freeze(scale),rotationZRad,alpha,iconId,state,transparent,intervalStartMs,intervalEndMs,sortDepth});}
/** @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null} direction */
function flowDirectionRotation(direction){if(direction===null)return 0;const rotations=new Map([["right",0],["down-right",Math.PI/4],["down",Math.PI/2],["down-left",Math.PI*3/4],["left",Math.PI],["up-left",-Math.PI*3/4],["up",-Math.PI/2],["up-right",-Math.PI/4]]);const rotation=rotations.get(direction);if(rotation===undefined)throw new TypeError("Flow direction icon is unsupported");return rotation;}
/** @param {unknown} value @returns {value is AeroGameplayPresentation} */
function isPresentation(value){return value==="flow"||value==="boxing_spatial_grid"||value==="boxing_lanes";}
/** @param {number|undefined|null} value */
function normalizeCountdown(value){return Number.isInteger(value)&&Number(value)>=1&&Number(value)<=3?Number(value):null;}
/** @param {number} value @param {number} min @param {number} max */
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
