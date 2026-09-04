// @ts-check

import { isFlowObstacleGeometry, isFlowObstacleGridMask } from "@aerobeat/web-contracts/flow-obstacle-contracts";
import { defaultGameplayCameraPose } from "./gameplay-camera-pose.js";
import { gameplayAssetIds, gameplayAssetSet } from "./gameplay-assets.js";

/** @typedef {"flow"|"boxing_spatial_grid"|"boxing_lanes"} AeroGameplayPresentation */
/** @typedef {"left"|"right"|"guard"|"obstacle"|"neutral"|"safe"} AeroVisualRole */
/** @typedef {"pending"|"active"|"spent"|"hit"|"miss"} AeroSceneTargetState */
/** @typedef {{x:number,y:number,z:number}} AeroWorldPosition */
/** @typedef {{x:number,y:number,z:number}} AeroWorldScale */
/** @typedef {{id:string,kind:"flow"|"punch"|"guard"|"obstacle"|"bomb"|"safe",hand:"left"|"right"|"both"|"neutral",family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"bomb"|"safe",cell:number|null,cells:readonly number[],geometry?:import("@aerobeat/web-contracts/flow-obstacle-contracts").AeroFlowObstacleGeometry,lane:"left"|"right"|null,beatCenterMs:number,approachLeadMs?:number,endMs?:number,intervalStartMs?:number,intervalEndMs?:number,judgement?:"pending"|"hit"|"miss",feedbackProgress?:number,contactPulseProgress?:number,direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null}} AeroRenderableTarget */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,targets:readonly AeroRenderableTarget[],timingWindowBeforeMs?:number,timingWindowAfterMs?:number,blockedCells?:readonly number[],safeCells?:readonly number[],countdown?:number|null,overlay?:"none"|"paused"|"calibrating"|"tracking_lost",calibrationDim?:number,viewportAspect?:number}} AeroGameplayFrame */
/** @typedef {{id:string,version:string,hash:string,dprCap:number,roleScale:number,worldUnitsPerMs:number,futureCullMs:number,spentCullMs:number,targetSize:number,obstacleHeight:number,timingZoneHeight:number,feedbackDurationMs:number,hitPulseScale:number,greatEndScale:number}} AeroRendererTuning */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** @typedef {{text:"Great"|"Miss",holdMs:number,fadeMs:number,totalMs:number,elapsedMs:number,alpha:number,faceColor:string,separationColor:string,depthBias:number,apparentHeightCssPx:number,offsetX:number,offsetY:number,scale:number,animation:"bounce"|"shake"}} AeroFeedbackVisual */
/** @typedef {{elapsedMs:number,durationMs:number,progress:number}} AeroRemovalVisual */
/** @typedef {{id:string,kind:"icon"|"obstacle"|"cell"|"lane"|"track"|"timing"|"shadow"|"feedback",role:AeroVisualRole,targetId:string|null,position:AeroWorldPosition,scale:AeroWorldScale,rotationZRad:number,alpha:number,iconId:string|null,assetId:string|null,tintColor:string|null,appearanceColor:string|null,tintMix:number,whiteCore:boolean,state:AeroSceneTargetState|null,transparent:boolean,intervalStartMs:number|null,intervalEndMs:number|null,sortDepth:number,renderOrder:number,guardPairKey:string|null,guardPairIndex:number|null,removal:AeroRemovalVisual|null,feedback:AeroFeedbackVisual|null}} AeroGameplaySceneObject */
/** @typedef {{name:"early"|"active"|"late",startZ:number,endZ:number,color:string,alpha:number}} AeroTimingZoneSegment */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,objects:readonly AeroGameplaySceneObject[],timingZone:Readonly<{beforeMs:number,afterMs:number,startZ:number,endZ:number,segments:readonly AeroTimingZoneSegment[]}>,camera:typeof defaultGameplayCameraPose,grid:Readonly<{columns:4,rows:3,columnX:readonly number[],rowY:readonly number[],floorY:number}>,overlay:Readonly<{kind:string,dim:number,countdown:number|null}>,assets:Readonly<{release:string,identities:readonly string[],guardCanonicalAsset:string,guardInstancesPerBeat:number}>,renderOrder:readonly string[],culledTargetIds:readonly string[]}} AeroGameplaySceneModel */

/** Retained only as an input/rasterization compatibility contract; production targets no longer consume this atlas. */
export const gameplayIconIds = Object.freeze(["boxing.glove","boxing.guard.crossed","boxing.guard.standard","boxing.hook.left","boxing.hook.right","boxing.squat","boxing.straight.left","boxing.straight.right","boxing.uppercut.left","boxing.uppercut.right","boxing.weave.left","boxing.weave.right","calibration.tpose","feedback.great","flow.directional","flow.directionless"]);
const GAMEPLAY_CELL_SIZE=0.94;
export const gameplayWorldGrid = Object.freeze({ columns:/** @type {4} */(4),rows:/** @type {3} */(3),columnX:Object.freeze([-1.5,-0.5,0.5,1.5]),rowY:Object.freeze([2,1,0]),floorY:-0.72 });
export const defaultGameplayTimingWindow = Object.freeze({ beforeMs:180,afterMs:180 });
export const gameplaySceneRenderOrder = Object.freeze(["world_opaque","grid_timing_tiles","targets","world_transparent_shadows_track_walls_feedback"]);
const ASSET=Object.freeze({arrow:"directional-arrow/outline-v1",circle:"any-note/circle-v1",guard:"guard/shield-v1",bomb:"bomb/urchin-v1",wall:"wall/red-glass-v1",track:"track/blue-glass-v1"});
const REMOVAL_MS=80,MISS_EXPIRY_MS=350,FEEDBACK_HOLD_MS=180,FEEDBACK_FADE_MS=170,MAX_FEEDBACK=4,TIMING_TILE_PITCH=.36,TIMING_TILE_GAP=.025,TRACK_SURFACE_Y=gameplayWorldGrid.floorY-.08,SURFACE_BIAS=.006,SHADOW_ALPHA=.3,SHADOW_COLOR="#11141a",MISS_COLOR="#7c828c",MISS_HEIGHT_CSS_PX=42,GREAT_HEIGHT_CSS_PX=48,SHAKE_AMPLITUDE=.18,SHAKE_CYCLES=9,BOUNCE_AMPLITUDE=.2;

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
    zone("late",startZ,activeHalf,"#e5484d",0.48),
    zone("active",activeHalf,-activeHalf,"#f4df62",0.5),
    zone("early",-activeHalf,endZ,"#39c96b",0.46)
  ]);
  /** @type {AeroGameplaySceneObject[]} */ const objects=[];
  /** @type {AeroGameplaySceneObject[]} */ const feedback=[];
  /** @type {string[]} */ const culled=[];
  addTrack(objects);
  addTimingTiles(objects,frame,segments,tuning);
  addPresentationFloor(objects,frame);
  for(const cell of validateCellList(frame.safeCells??[],"Safe cells"))addCellState(objects,cell,"safe");
  for(const cell of validateCellList(frame.blockedCells??[],"Blocked cells"))addCellState(objects,cell,"obstacle");
  const sorted=[...frame.targets].sort((a,b)=>b.beatCenterMs-a.beatCenterMs||a.id.localeCompare(b.id));
  if(sorted.length>128)throw new TypeError("Gameplay frame cannot exceed 128 targets");
  for(const target of sorted){
    const result=targetObjects(frame,target,window,segments[2],theme,tuning);
    if(result.objects.length===0&&result.feedback.length===0)culled.push(target.id);
    else{objects.push(...result.objects);feedback.push(...result.feedback);}
  }
  const retainedFeedback=feedback.sort((a,b)=>(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0)||a.id.localeCompare(b.id)).slice(-MAX_FEEDBACK).sort((a,b)=>(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0)||a.id.localeCompare(b.id));
  objects.push(...retainedFeedback);
  objects.sort((a,b)=>a.renderOrder-b.renderOrder||(a.renderOrder===40?(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0):a.sortDepth-b.sortDepth)||a.id.localeCompare(b.id));
  const overlayKind=frame.overlay??"none";
  return Object.freeze({
    presentation:frame.presentation,nowMs:frame.nowMs,objects:Object.freeze(objects),
    timingZone:Object.freeze({beforeMs:window.beforeMs,afterMs:window.afterMs,startZ,endZ,segments}),
    camera:defaultGameplayCameraPose,grid:gameplayWorldGrid,
    overlay:Object.freeze({kind:overlayKind,dim:clamp(frame.calibrationDim??(overlayKind==="none"?0:0.62),0,1),countdown:normalizeCountdown(frame.countdown)}),
    assets:Object.freeze({release:String(gameplayAssetSet.release),identities:Object.freeze(gameplayAssetIds.map(String)),guardCanonicalAsset:String(gameplayAssetSet.constraints.guardCanonicalAsset),guardInstancesPerBeat:gameplayAssetSet.constraints.guardInstancesPerBeat}),
    renderOrder:gameplaySceneRenderOrder,culledTargetIds:Object.freeze(culled)
  });
}

/** Three deterministic canonical segments cover the present and visible future without stretching authored lane lines. @param {AeroGameplaySceneObject[]} objects */
function addTrack(objects){for(let index=0;index<3;index+=1)objects.push(sceneObject(`track-${index}`,"track","neutral",null,{x:0,y:gameplayWorldGrid.floorY-0.08,z:-12-index*24},{x:1,y:1,z:1},null,ASSET.track,0,1,null,false,false,null,null,-12-index*24,20,null,null,null));}
/** Tile exact authoritative timing bounds directly onto the canonical presentation lanes. Boundary tiles are clipped, never stretched. @param {AeroGameplaySceneObject[]} objects @param {AeroGameplayFrame} frame @param {readonly AeroTimingZoneSegment[]} segments @param {AeroRendererTuning} tuning */
function addTimingTiles(objects,frame,segments,tuning){
  const lanes=frame.presentation==="boxing_lanes"?[{x:-1.35,width:1.7},{x:1.35,width:1.7}]:gameplayWorldGrid.columnX.map((x)=>({x,width:GAMEPLAY_CELL_SIZE}));
  for(const segment of segments){let tileIndex=0;for(let cursor=segment.startZ;cursor<segment.endZ-1e-12;cursor+=TIMING_TILE_PITCH){const end=Math.min(segment.endZ,cursor+TIMING_TILE_PITCH),first=tileIndex===0,last=end>=segment.endZ-1e-12,visibleStart=cursor+(first?0:TIMING_TILE_GAP/2),visibleEnd=end-(last?0:TIMING_TILE_GAP/2),depth=visibleEnd-visibleStart;if(depth<=0)continue;for(const [laneIndex,lane] of lanes.entries())objects.push(sceneObject(`timing-${segment.name}-${tileIndex}-${laneIndex}`,"timing","neutral",null,{x:lane.x,y:TRACK_SURFACE_Y+SURFACE_BIAS,z:(visibleStart+visibleEnd)/2},{x:lane.width,y:.008,z:depth},null,null,0,segment.alpha,null,false,true,null,null,(visibleStart+visibleEnd)/2,15,null,null,null,null,segment.color));tileIndex+=1;}}
}
/** @param {AeroGameplaySceneObject[]} objects @param {AeroGameplayFrame} frame */
function addPresentationFloor(objects,frame){
  if(frame.presentation==="boxing_lanes")return;
  for(let cell=0;cell<12;cell+=1){const p=worldPositionForCell(cell);if(p)objects.push(sceneObject(`cell-${cell}`,"cell","neutral",null,{x:p.x,y:p.y,z:0},{x:GAMEPLAY_CELL_SIZE,y:GAMEPLAY_CELL_SIZE,z:0.025},null,null,0,0.1,null,false,true,null,null,0,18,null,null,null));}
}
/** @param {AeroGameplaySceneObject[]} objects @param {number} cell @param {"safe"|"obstacle"} role */
function addCellState(objects,cell,role){const p=worldPositionForCell(cell);if(p)objects.push(sceneObject(`${role}-${cell}`,"cell",role,null,{x:p.x,y:p.y,z:0.02},{x:GAMEPLAY_CELL_SIZE,y:GAMEPLAY_CELL_SIZE,z:0.035},null,null,0,role==="safe"?0.28:0.55,null,false,true,null,null,0,18,null,null,null));}

/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {{beforeMs:number,afterMs:number}} window @param {AeroTimingZoneSegment} successZone @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning */
function targetObjects(frame,target,window,successZone,theme,tuning){
  if(!target||typeof target.id!=="string"||target.id.length<1||target.id.length>128||!Number.isFinite(target.beatCenterMs)||!Array.isArray(target.cells))throw new TypeError("Gameplay target is invalid");
  validateCellList(target.cells,"Target cells");if(target.cell!==null&&worldPositionForCell(target.cell)===null)throw new TypeError("Gameplay target cell is invalid");
  const flowObstacle=frame.presentation==="flow"&&target.kind==="obstacle";
  const interval=flowObstacle?obstacleInterval(target):Object.freeze({startMs:target.beatCenterMs,endMs:target.beatCenterMs});
  const latest=interval.endMs+window.afterMs+tuning.spentCullMs;
  if(frame.nowMs>latest||interval.startMs-frame.nowMs>tuning.futureCullMs)return{objects:[],feedback:[]};
  const state=targetState(target,frame.nowMs,interval,window);
  const role=targetRole(target);
  if(flowObstacle){
    if(!isFlowObstacleGeometry(target.geometry)||!isFlowObstacleGridMask(target.cells,target.geometry))throw new TypeError("Flow obstacle source geometry and grid mask are invalid");
    const geometry=target.geometry;
    const z0=timestampToWorldZ(interval.startMs,frame.nowMs,tuning.worldUnitsPerMs),z1=timestampToWorldZ(interval.endMs,frame.nowMs,tuning.worldUnitsPerMs);
    const center=(z0+z1)/2,depth=Math.abs(z1-z0);
    const centerX=geometry.x+(geometry.width-1)/2-1.5,centerY=geometry.y+(geometry.height-1)/2;
    const scaleX=(geometry.width-0.06)/GAMEPLAY_CELL_SIZE,scaleY=(geometry.height-0.06)/GAMEPLAY_CELL_SIZE;
    const pulse=target.contactPulseProgress===undefined?0:1-clamp(Number(target.contactPulseProgress),0,1);
    const wall=sceneObject(`${target.id}:wall`,"obstacle",role,target.id,{x:centerX,y:centerY,z:center},{x:scaleX,y:scaleY,z:depth},null,ASSET.wall,0,1,null,pulse,true,interval.startMs,interval.endMs,center,30,null,null,null);
    const shadow=sceneObject(`${target.id}:shadow`,"shadow","neutral",target.id,{x:centerX,y:gameplayWorldGrid.floorY+.018,z:center},{x:geometry.width-.06,y:.012,z:depth},null,null,0,SHADOW_ALPHA,null,false,true,interval.startMs,interval.endMs,center,35,null,null,null,null,SHADOW_COLOR);
    return{objects:[wall,shadow],feedback:[]};
  }
  const positions=targetPositions(frame,target);
  const movingZ=timestampToWorldZ(target.beatCenterMs,frame.nowMs,tuning.worldUnitsPerMs);
  const resolved=state==="hit"||state==="miss";
  const z=state==="hit"?0:movingZ;
  if(resolved&&(!Number.isFinite(target.feedbackProgress)||Number(target.feedbackProgress)<0||Number(target.feedbackProgress)>1))throw new TypeError("Resolved target feedback progress is required");
  const feedbackProgress=clamp(Number.isFinite(target.feedbackProgress)?Number(target.feedbackProgress):0,0,1);
  const elapsedMs=resolved?feedbackProgress*tuning.feedbackDurationMs:0;
  const removal=state==="hit"?Object.freeze({elapsedMs,durationMs:REMOVAL_MS,progress:clamp(elapsedMs/REMOVAL_MS,0,1)}):null;
  const targetVisible=state==="hit"?elapsedMs<REMOVAL_MS:state==="miss"?elapsedMs<MISS_EXPIRY_MS:true;
  const removalScale=removal?0.92*(1-removal.progress):1;
  const tintDistance=tuning.worldUnitsPerMs*60;
  const tintMix=resolved||z<successZone.startZ?0:z<=successZone.endZ?clamp((z-successZone.startZ)/tintDistance,0,1):clamp(1-(z-successZone.endZ)/tintDistance,0,1);
  const assetId=assetForTarget(target);
  const rotation=target.direction?directionRotation(target.direction):0;
  const pairKey=target.kind==="guard"?target.id:null;
  const icons=targetVisible?positions.map((p,index)=>sceneObject(`${target.id}:${index}`,"icon",role,target.id,{x:p.x,y:p.y,z},{x:tuning.roleScale*removalScale,y:tuning.roleScale*removalScale,z:tuning.roleScale*removalScale},null,assetId,rotation,state==="hit"?Math.max(0,1-(removal?.progress??1)):1,state,tintMix,Boolean(removal),null,null,z,10,pairKey,pairKey===null?null:index,removal,null,state==="miss"?MISS_COLOR:null)):[];
  const shadows=targetVisible?positions.map((p,index)=>sceneObject(`${target.id}:shadow:${index}`,"shadow","neutral",target.id,{x:p.x,y:gameplayWorldGrid.floorY+.018,z},{x:.68*tuning.roleScale,y:.012,z:.34*tuning.roleScale},null,null,0,state==="hit"?Math.max(0,SHADOW_ALPHA*(1-(removal?.progress??1))):SHADOW_ALPHA,state,false,true,null,null,z,35,null,null,removal,null,SHADOW_COLOR)):[];
  /** @type {AeroGameplaySceneObject[]} */ const feedbackObjects=[];
  if(resolved&&target.kind!=="obstacle"&&target.kind!=="bomb"&&positions.length&&elapsedMs<tuning.feedbackDurationMs){
    const crossingZ=0,hit=state==="hit";
    const alpha=elapsedMs<=FEEDBACK_HOLD_MS?1:clamp(1-(elapsedMs-FEEDBACK_HOLD_MS)/FEEDBACK_FADE_MS,0,1),motion=feedbackMotion(hit?"bounce":"shake",elapsedMs,tuning.feedbackDurationMs);
    const visual=Object.freeze({text:/** @type {"Great"|"Miss"} */(hit?"Great":"Miss"),holdMs:FEEDBACK_HOLD_MS,fadeMs:FEEDBACK_FADE_MS,totalMs:tuning.feedbackDurationMs,elapsedMs,alpha,faceColor:hit?"#ffffff":"#e5484d",separationColor:hit?"#171a22":"#ffffff",depthBias:0.01,apparentHeightCssPx:hit?GREAT_HEIGHT_CSS_PX:MISS_HEIGHT_CSS_PX,offsetX:motion.x,offsetY:motion.y,scale:motion.scale,animation:/** @type {"bounce"|"shake"} */(hit?"bounce":"shake")});
    const crossingPositions=target.kind==="guard"?[{x:(positions[0].x+positions[positions.length-1].x)/2,y:positions[0].y}]:positions.slice(0,1);
    for(const [index,p] of crossingPositions.entries())feedbackObjects.push(sceneObject(`${target.id}:feedback:${index}`,"feedback",role,target.id,{x:p.x,y:p.y,z:crossingZ},{x:1,y:1,z:1},null,null,0,alpha,state,false,true,null,null,crossingZ,40,null,null,removal,visual));
  }
  return{objects:[...icons,...shadows],feedback:feedbackObjects};
}

/** Deterministic caller-time feedback motion; no engine delta or random state participates. @param {"bounce"|"shake"} animation @param {number} elapsedMs @param {number} durationMs */
function feedbackMotion(animation,elapsedMs,durationMs){
  const progress=clamp(elapsedMs/Math.max(1,durationMs),0,1);
  if(animation==="shake")return Object.freeze({x:Math.sin(progress*Math.PI*2*SHAKE_CYCLES)*SHAKE_AMPLITUDE*(1-progress),y:0,scale:1.08});
  const bounce=Math.sin(progress*Math.PI);
  return Object.freeze({x:0,y:bounce*BOUNCE_AMPLITUDE,scale:1+bounce*BOUNCE_AMPLITUDE});
}
/** @param {AeroRenderableTarget} target */
function assetForTarget(target){if(target.kind==="guard")return ASSET.guard;if(target.kind==="bomb"||target.family==="bomb")return ASSET.bomb;return target.direction?ASSET.arrow:ASSET.circle;}
/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target */
function targetPositions(frame,target){
  if(frame.presentation==="boxing_lanes"){
    if(target.kind==="guard"||target.family==="squat")return [{x:-1.35,y:1.1},{x:1.35,y:1.1}];
    return [{x:(target.lane??target.hand)==="left"?-1.35:1.35,y:1.1}];
  }
  if(target.kind==="guard"){
    const cells=target.cells.length>=2?target.cells.slice(0,2):[5,6];const pair=cells.map(worldPositionForCell);
    if(!pair[0]||!pair[1]||pair[0].y!==pair[1].y||pair[0].x===pair[1].x)throw new TypeError("Guard cells must be a same-height left/right pair");
    return /** @type {{x:number,y:number}[]} */(pair.map((entry)=>({x:entry.x,y:entry.y})).sort((a,b)=>a.x-b.x));
  }
  const cells=target.cells.length?target.cells:target.cell===null?[]:[target.cell];
  return cells.map(worldPositionForCell).filter(Boolean);
}
/** @param {AeroRenderableTarget} target */
function targetRole(target){return target.hand==="left"?"left":target.hand==="right"?"right":target.kind==="guard"?"guard":target.kind==="obstacle"||target.kind==="bomb"?"obstacle":target.kind==="safe"?"safe":"neutral";}
/** @param {AeroRenderableTarget} target @param {number} nowMs @param {{startMs:number,endMs:number}} interval @param {{beforeMs:number,afterMs:number}} window @returns {AeroSceneTargetState} */
function targetState(target,nowMs,interval,window){if(target.judgement==="hit")return"hit";if(target.judgement==="miss")return"miss";if(nowMs>interval.endMs+window.afterMs)return"spent";if(nowMs>=interval.startMs-window.beforeMs&&nowMs<=interval.endMs+window.afterMs)return"active";return"pending";}
/** @param {AeroRenderableTarget} target */
function obstacleInterval(target){const startMs=Number(target.intervalStartMs??target.beatCenterMs),endMs=Number(target.intervalEndMs??target.endMs??startMs);if(target.intervalEndMs!==undefined&&target.endMs!==undefined&&target.intervalEndMs!==target.endMs)throw new TypeError("Flow obstacle end bounds conflict");if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>86_400_000)throw new TypeError("Flow obstacle interval is invalid");return Object.freeze({startMs,endMs});}
/** @param {AeroGameplayFrame} frame */
function timingWindow(frame){const required=frame.presentation==="boxing_lanes";const before=frame.timingWindowBeforeMs??(required?NaN:defaultGameplayTimingWindow.beforeMs),after=frame.timingWindowAfterMs??(required?NaN:defaultGameplayTimingWindow.afterMs);if(![before,after].every((v)=>Number.isFinite(v)&&v>=0&&v<=10_000))throw new TypeError("Authoritative timing window is invalid");return Object.freeze({beforeMs:Number(before),afterMs:Number(after)});}
/** @param {"early"|"active"|"late"} name @param {number} startZ @param {number} endZ @param {string} color @param {number} alpha */
function zone(name,startZ,endZ,color,alpha){return Object.freeze({name,startZ:Math.min(startZ,endZ),endZ:Math.max(startZ,endZ),color,alpha});}
/** @returns {AeroGameplaySceneObject} */
function sceneObject(id,kind,role,targetId,position,scale,iconId,assetId,rotationZRad,alpha,state,tintMix,transparent,intervalStartMs,intervalEndMs,sortDepth,renderOrder,guardPairKey,guardPairIndex,removal,feedback=null,appearanceColor=null){return Object.freeze({id,kind,role,targetId,position:Object.freeze(position),scale:Object.freeze(scale),rotationZRad,alpha,iconId,assetId,tintColor:Number(tintMix)>0?"#ffffff":null,appearanceColor,tintMix:Number(tintMix),whiteCore:Number(tintMix)>0,state,transparent,intervalStartMs,intervalEndMs,sortDepth,renderOrder,guardPairKey,guardPairIndex,removal,feedback});}
/** Arrow identity points +Y; rotate only around local Z to the authoritative direction. @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection} direction */
function directionRotation(direction){const rotations=new Map([["up",0],["up-right",-Math.PI/4],["right",-Math.PI/2],["down-right",-Math.PI*3/4],["down",Math.PI],["down-left",Math.PI*3/4],["left",Math.PI/2],["up-left",Math.PI/4]]);const rotation=rotations.get(direction);if(rotation===undefined)throw new TypeError("Gameplay direction is unsupported");return rotation;}
/** @param {readonly number[]} cells @param {string} label */
function validateCellList(cells,label){if(!Array.isArray(cells)||cells.length>12||new Set(cells).size!==cells.length||cells.some((cell)=>worldPositionForCell(cell)===null))throw new TypeError(`${label} are invalid`);return cells;}
/** @param {unknown} value @returns {value is AeroGameplayPresentation} */
function isPresentation(value){return value==="flow"||value==="boxing_spatial_grid"||value==="boxing_lanes";}
/** @param {number|undefined|null} value */
function normalizeCountdown(value){return Number.isInteger(value)&&Number(value)>=1&&Number(value)<=3?Number(value):null;}
/** @param {number} value @param {number} min @param {number} max */
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
