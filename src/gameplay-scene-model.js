// @ts-check

import { isObstacleGameplayGeometry, isObstacleGridMask } from "@aerobeat/web-contracts/obstacle-contracts";
import { isPrivateNoteAppearance } from "@aerobeat/web-contracts/note-palette-contracts";
import { boxingColliderRowY } from "@aerobeat/web-contracts/gameplay-contracts";
import { defaultTestPresentationConfig, testPresentationBounceOffsetY, testPresentationSkyOffsetY } from "./test-presentation-config.js";
import { defaultGameplayCameraPose } from "./gameplay-camera-pose.js";
import { gameplayAssetIds, gameplayAssetSet } from "./gameplay-assets.js";
import { defaultGameplayVisualExperimentConfig, normalizeGameplayVisualExperimentConfig } from "./gameplay-visual-experiment-config.js";

/** @typedef {"flow"|"boxing_spatial_grid"|"boxing_lanes"|"boxing_collider"} AeroGameplayPresentation */
/** @typedef {"left"|"right"|"guard"|"obstacle"|"neutral"|"safe"} AeroVisualRole */
/** @typedef {"pending"|"active"|"spent"|"hit"|"miss"} AeroSceneTargetState */
/** @typedef {{x:number,y:number,z:number}} AeroWorldPosition */
/** @typedef {{x:number,y:number,z:number}} AeroWorldScale */
/** @typedef {{id:string,kind:"flow"|"punch"|"guard"|"obstacle"|"bomb"|"safe",hand:"left"|"right"|"both"|"neutral",family:"straight"|"hook"|"uppercut"|"flow"|"guard"|"crossed_guard"|"squat"|"weave"|"obstacle"|"bomb"|"safe",cell:number|null,cells:readonly number[],gameplayGeometry?:import("@aerobeat/web-contracts/obstacle-contracts").AeroObstacleGameplayGeometry,sourceGeometry?:import("@aerobeat/web-contracts/obstacle-contracts").AeroObstacleSourceGeometry,lane:"left"|"right"|null,beatCenterMs:number,approachLeadMs?:number,endMs?:number,intervalStartMs?:number,intervalEndMs?:number,judgement?:"pending"|"hit"|"miss",feedbackProgress?:number,missCommitMs?:number,contactPulseProgress?:number,direction?:import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection|null,appearanceColor?:unknown,bounceStartMs?:number,normalSpawnMs?:number,skyPreludeStartMs?:number,arrivalGroupIdentity?:string}} AeroRenderableTarget */
/** @typedef {{active:boolean,xDeflection:number,yDeflection:number}} AeroDesiredCameraDeflection */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,targets:readonly AeroRenderableTarget[],timingWindowBeforeMs?:number,timingWindowAfterMs?:number,blockedCells?:readonly number[],safeCells?:readonly number[],showGameplayGrid?:boolean,guidanceBeatTimestampsMs?:readonly number[],guidanceBandMode?:"off"|"song_beat_grid"|"target_arrivals",countdown?:number|null,overlay?:"none"|"paused"|"calibrating"|"tracking_lost",calibrationDim?:number,viewportAspect?:number,cameraDeflection?:AeroDesiredCameraDeflection|null,reducedMotion?:boolean,aftermath?:readonly AeroAftermathEntry[],hazardContacts?:readonly AeroHazardContactEvent[],hazardContactActive?:AeroHazardContactActive,hazardVignetteParams?:AeroHazardVignetteParams,rowReach?:Readonly<{topRowReachWU:number,bottomRowReachWU:number}>,visibleToleranceRange?:boolean,visibleColliderRadius?:boolean,colliderRadius?:number,directionToleranceDegrees?:number}} AeroGameplayFrame */
/** @typedef {"flow"|"punch"|"guard"|"obstacle"|"bomb"|"safe"} AeroAftermathFamily */
/** Bounded assembly-owned hit-success aftermath entry; the 7-beat FIFO and eviction marking are assembly-owned. Punch `mode` picks the launch curve: `straight` | `hook` | `uppercut` — hooks take the hand sign toward center (left +X, right -X). Flow `mode` is `single` or `slice` (slice = two clip-plane halves with seeded horizontal separation + independent tumble). Guard `mode` is `bonk` (tiny pop impulse, then falls to the floor). 0.0.56 W2: `shape` carries the hit note's ACTUAL asset shape (`"arrow"` for directional notes, `"orb"` for directionless / any notes) so the "hit corpse" is a cut-in-half of the note's real glyph — not a generic circle for everything. Absent (legacy entries) falls back to the per-family default. 0.0.58 B11b: `appearanceColor` carries the note's REAL validated fill token (canonical uppercase `#RRGGBB`) so the corpse desaturates the ACTUAL glyph (white outline kept light, fill grayed) instead of a flat uniform gray; absent → neutral receptor fill fallback. @typedef {{targetId:string,hitCommitMs:number,family:AeroAftermathFamily,hand:"left"|"right"|"both"|"neutral",mode:"straight"|"hook"|"uppercut"|"single"|"slice"|"bonk",spawn:{x:number,y:number,z:number},seed:number,shape?:"arrow"|"orb",appearanceColor?:string,evictedAtMs?:number}} AeroAftermathEntry */
/** Assembly-owned bounded hazard-contact event (obstacle head collision, bomb touch); the renderer only derives the vignette envelope. @typedef {{eventId:string,atMs:number}} AeroHazardContactEvent */
/** 0.0.54 W1-C: bounded wall-collider contact STATE (nose inside any obstacle collider), presentation-only — no coordinates. `sinceMs` is the absolute ms of first contact of the current episode (present while active); `releasedAtMs` is the absolute ms of the most recent exit (present after release), letting the renderer compute a stateless decay. @typedef {{active:boolean,sinceMs:number|null,releasedAtMs:number|null}} AeroHazardContactActive */
/** 0.0.54 W1-C: bounded per-frame vignette pulse parameters; absent fields fall back to the tuning defaults (frame values override tuning). @typedef {{intensity:number,pulseHz:number,pulseDepth:number,rampMs:number,decayMs:number}} AeroHazardVignetteParams */
/** @typedef {{leftHandColor:string,rightHandColor:string,guardColor:string,obstacleColor:string,receptorColor:string,approachLeadMs:number,targetStartScale:number,targetHitScale:number,approachEasing:string,hitEasing:string,missEasing:string}} AeroRendererThemeTokens */
/** Per-family aftermath launch velocity (WU/s); hooks carry the magnitude with hand-derived sign. @typedef {{x:number,y:number,z:number}} AeroAftermathLaunchVelocity */
/** @typedef {{straight:AeroAftermathLaunchVelocity,hook:AeroAftermathLaunchVelocity,uppercut:AeroAftermathLaunchVelocity,guardBonk:AeroAftermathLaunchVelocity,flowNote:AeroAftermathLaunchVelocity}} AeroAftermathLaunchVelocities */
/** @typedef {{id:string,version:string,hash:string,dprCap:number,roleScale:number,noteScaleFactor:number,obstacleScaleFactor:number,bombScaleFactor:number,markerScaleFactor:number,worldUnitsPerMs:number,futureCullMs:number,spentCullMs:number,targetSize:number,obstacleHeight:number,timingZoneHeight:number,feedbackDurationMs:number,hitPulseScale:number,greatEndScale:number,aftermathGravityWUPerS2:number,aftermathRestitution:number,aftermathBounceCount:number,aftermathEvictedFadeMs:number,aftermathSettledTumbleRadPerS:number,aftermathSliceSeparationWU:number,aftermathLaunchVelocities:AeroAftermathLaunchVelocities,hazardGlowRampMs:number,hazardGlowDecayMs:number,hazardVignetteIntensity:number,hazardVignettePulseHz:number,hazardVignettePulseDepth:number,hazardVignetteRampMs:number,hazardVignetteDecayMs:number}} AeroRendererTuning */
/** @typedef {{text:"Great"|"Miss",holdMs:number,fadeMs:number,totalMs:number,elapsedMs:number,alpha:number,faceColor:string,separationColor:string,depthBias:number,apparentHeightCssPx:number,offsetX:number,offsetY:number,scale:number,animation:"bounce"|"shake"}} AeroFeedbackVisual */
/** @typedef {{elapsedMs:number,durationMs:number,progress:number}} AeroRemovalVisual */
/** @typedef {{id:string,kind:"icon"|"obstacle"|"cell"|"lane"|"track"|"timing"|"shadow"|"feedback"|"guidance_band"|"aftermath"|"hazard_glow"|"tolerance_cone"|"collider_square",role:AeroVisualRole,targetId:string|null,position:AeroWorldPosition,scale:AeroWorldScale,rotationZRad:number,alpha:number,iconId:string|null,assetId:string|null,tintColor:string|null,appearanceColor:string|null,tintMix:number,whiteCore:boolean,state:AeroSceneTargetState|null,transparent:boolean,intervalStartMs:number|null,intervalEndMs:number|null,sortDepth:number,renderOrder:number,guardPairKey:string|null,guardPairIndex:number|null,removal:AeroRemovalVisual|null,feedback:AeroFeedbackVisual|null,aftermath?:AeroAftermathVisual|AeroHazardGlowVisual|AeroToleranceConeVisual|AeroColliderSquareVisual|null}} AeroGameplaySceneObject */
/** Closed-form aftermath pose for one icon entity. 0.0.59 B14: the corpse has ONE phase — an uninterrupted fall off-screen — so `settleMs` is the off-screen crossing time and `phase` is always "flight". @typedef {{targetId:string,family:AeroAftermathFamily,elapsedMs:number,settleMs:number,phase:"flight",sliceSign:1|-1|null,offsetXWU:number}} AeroAftermathVisual */
/** Presentation-only full-viewport hazard glow; no coordinates or event internals. @typedef {{present:boolean,activeCount:number,intensity:number,rampMs:number,decayMs:number}} AeroHazardGlowVisual */
/** 0.0.53 W2: presentation-only summary of the two debug-visibility overlays (tolerance cones + collider squares). @typedef {{visibleToleranceRange:boolean,visibleColliderRadius:boolean,colliderRadius:number,directionToleranceDegrees:number,coneCount:number,squareCount:number}} AeroColliderOverlayVisual */
/** Geometry for one tolerance-cone debug scene object (kind `tolerance_cone`): authored direction unit vector, half-angle, inner (footprint) radius, outer radius, and the closed-form fan geometry (positions/indices) for the facade to build a mesh. @typedef {{directionX:number,directionY:number,toleranceDegrees:number,innerRadius:number,radius:number,positions:Float32Array,indices:Uint16Array,vertexCount:number,triangleCount:number}} AeroToleranceConeVisual */
/** Geometry for one collider-square debug scene object (kind `collider_square`): the inflated half-extent (TARGET_HALF_EXTENT + colliderRadius) in world X-Y. @typedef {{halfExtent:number}} AeroColliderSquareVisual */
/** @typedef {{name:"early"|"active"|"late",startZ:number,endZ:number,color:string,alpha:number}} AeroTimingZoneSegment */
/** @typedef {{presentation:AeroGameplayPresentation,nowMs:number,objects:readonly AeroGameplaySceneObject[],timingZone:Readonly<{beforeMs:number,afterMs:number,startZ:number,endZ:number,segments:readonly AeroTimingZoneSegment[]}>,guidance:Readonly<{mode:"off"|"song_beat_grid"|"target_arrivals",visibleBandCount:number,culledBandCount:number}>,camera:typeof defaultGameplayCameraPose,grid:Readonly<{columns:4,rows:3,columnX:readonly number[],rowY:readonly number[],floorY:number}>,overlay:Readonly<{kind:string,dim:number,countdown:number|null}>,assets:Readonly<{release:string,identities:readonly string[],guardCanonicalAsset:string,guardInstancesPerBeat:number}>,renderOrder:readonly string[],culledTargetIds:readonly string[],hazardGlow:AeroHazardGlowVisual,aftermathVisuals:Readonly<{count:number,cap:number}>,colliderOverlay:AeroColliderOverlayVisual}} AeroGameplaySceneModel */

/** Retained only as an input/rasterization compatibility contract; production targets no longer consume this atlas. */
export const gameplayIconIds = Object.freeze(["boxing.glove","boxing.guard.crossed","boxing.guard.standard","boxing.hook.left","boxing.hook.right","boxing.squat","boxing.straight.left","boxing.straight.right","boxing.uppercut.left","boxing.uppercut.right","boxing.weave.left","boxing.weave.right","calibration.tpose","feedback.great","flow.directional","flow.directionless"]);
const GAMEPLAY_CELL_SIZE=0.94;
const BOXING_LANE_WIDTH=1.7,BOXING_LANE_CANONICAL_TOP=2.47,BOXING_LANE_CANONICAL_BOTTOM=-.47,BOXING_LANE_CENTER_Y=(BOXING_LANE_CANONICAL_TOP+BOXING_LANE_CANONICAL_BOTTOM)/2,BOXING_LANE_HEIGHT=BOXING_LANE_CANONICAL_TOP-BOXING_LANE_CANONICAL_BOTTOM;
function boxingLanes(config){const half=config.boxingLaneSeparationWorldUnits/2;return Object.freeze([Object.freeze({lane:"left",x:-half,y:BOXING_LANE_CENTER_Y,width:BOXING_LANE_WIDTH}),Object.freeze({lane:"right",x:half,y:BOXING_LANE_CENTER_Y,width:BOXING_LANE_WIDTH})]);}
export const gameplayWorldGrid = Object.freeze({ columns:/** @type {4} */(4),rows:/** @type {3} */(3),columnX:Object.freeze([-1.5,-0.5,0.5,1.5]),rowY:Object.freeze([2,1,0]),floorY:-0.72 });
export const defaultGameplayTimingWindow = Object.freeze({ beforeMs:180,afterMs:180 });
export const gameplaySceneRenderOrder = Object.freeze(["world_opaque","grid_timing_tiles","guidance_bands","targets","world_transparent_shadows_track_walls_feedback"]);
const ASSET=Object.freeze({arrow:"directional-arrow/rounded-outline-v1",circle:"any-note/outlined-circle-v1",guard:"guard/outlined-shield-v1",bomb:"bomb/urchin-v1",wall:"wall/red-glass-v1",track:"track/blue-glass-v1"});
/**
 * 0.0.59 B14: the world Y below which a hit corpse is fully OFF-SCREEN (beneath the track
 * surface at y = −0.80) and begins its fade-out. The canonical camera (pos (0.05, 1, 5),
 * pitch 0, vertical FOV 48° at 844×390) renders world Y ≈ −1.30 at the bottom of the viewport
 * at the hit plane (z = 0); −1.50 leaves a half-height margin so a 0.9-unit corpse is no
 * longer visible when its center crosses this line.
 */
const AFTERMATH_OFFSCREEN_Y=-1.5;
/** 0.0.53 W2: logical target footprint half-extent in athlete-grid units (mirrors `aerobeat-web-gameplay` `TARGET_HALF_EXTENT`). The collider hit region is this square inflated by `colliderRadius`. */
const TARGET_HALF_EXTENT=0.375;
/** 0.0.53 W2: default per-frame collider settings (used when the optional frame fields are absent). */
const DEFAULT_COLLIDER_RADIUS=0.12;
const DEFAULT_DIRECTION_TOLERANCE_DEGREES=45;
/** 0.0.53 W2: debug-overlay presentation constants — bounded-alpha translucent fill and distinct colors. */
const TOLERANCE_CONE_ALPHA=0.2;
const COLLIDER_SQUARE_ALPHA=0.3;
const TOLERANCE_CONE_COLOR="#39c96b";
const COLLIDER_SQUARE_COLOR="#9a67ea";
const TARGET_MARKER_ALPHA=0.9;
const TARGET_MARKER_COLOR="#ffffff";
/** 0.0.53 W2: arc tessellation and radial span for the tolerance-cone sector. */
const TOLERANCE_CONE_ARC_STEPS=24;
const TOLERANCE_CONE_RADIUS_WU=1.1;
/** 0.0.54 W1-C: camera-side presentation offset for the collider overlays. The canonical play camera
 * (`defaultGameplayCameraPose`) sits at `(0.05, 1, 5)` — on world +Z of the Z=0 hit plane — looking
 * along −Z, while approaching beats travel from −Z to +Z toward the hit plane. +Z is therefore the
 * camera side, so the overlays (square, cone, target-point marker) sit a small amount in front of
 * the beat glyph and remain readable over it (with depth-test off in the facade). */
export const COLLIDER_OVERLAY_CAM_OFFSET_WU=0.03;
const AFTERMATH_MAX_ENTRIES=8;
const AFTERMATH_MAX_HAZARD_EVENTS=32;
const HAZARD_GLOW_COLOR="#e5484d";
/** 0.0.56 W2: aftermath "hit corpse" gray tint — a desaturated neutral (the miss color) applied to
 * every aftermath icon so the fallen piece reads as hit, not as a live note (B3/B9). */
/**
 * 0.0.58 B11b: the hit-corpse desaturation weight. The note's REAL fill tint is
 * lerped toward full luminance grayscale by this amount — strong enough that the
 * color is clearly gone, but the fill is NOT collapsed to one uniform gray value
 * (the 0.0.57 `AFTERMATH_HIT_CORPSE_GRAY` override flattened the whole glyph).
 * The authored structural white outline is never touched (it stays ~white).
 * 0.0.60 W1 (F1): lowered 0.92 → 0.55 (UNCALIBRATED starting value for the
 * color-sweep loop) so a surviving tint reads as clear blue/green instead of
 * a gray wash. Will be locked after Derrick signs off the contact sheet.
 */
export const AFTERMATH_CORPSE_DESATURATION=0.92;
/**
 * 0.0.60 W1 (F1): minimum channel spread (max−min of the sRGB 0-1 channels)
 * for a note's real fill to be trusted as the desaturation source. Fills below
 * this spread (pale / near-white song-palette colors, e.g. #A8C8E8, #CDE3F5,
 * #D9F5FF) are indistinguishable from gray after any desaturation, so the
 * corpse desaturates from the note's HAND color (roleColor) instead.
 * UNCALIBRATED starting value for the color-sweep loop.
 */
export const AFTERMATH_CORPSE_MIN_CHROMA=0.35;
/** 0.0.52 W1-C: closed-form hit-success aftermath launch velocities (WU/s, gravity −9.8). Hooks are stored without the X sign; the hand signs it toward center (left hand +X, right hand −X). */
function aftermathLaunchVelocities(){return Object.freeze({straight:Object.freeze({x:0,y:.5,z:-4}),hook:Object.freeze({x:1.2,y:.3,z:-3}),uppercut:Object.freeze({x:0,y:2.2,z:-2.5}),guardBonk:Object.freeze({x:0,y:.2,z:-.5}),flowNote:Object.freeze({x:0,y:.4,z:-2})});}
const CANONICAL_WORLD_UNITS_PER_MS=.006,REMOVAL_MS=80,MISS_EXPIRY_MS=350,FEEDBACK_HOLD_MS=180,FEEDBACK_FADE_MS=170,MAX_FEEDBACK=4,MAX_SONG_GUIDANCE_BANDS=16,MAX_TARGET_ARRIVAL_BANDS=24,MAX_GUIDANCE_CONTINUATION_BANDS=16,MAX_GUIDANCE_BEAT_TIMESTAMPS=512,TIMING_TILE_PITCH=.36,TIMING_TILE_GAP=.025,TRACK_SURFACE_Y=gameplayWorldGrid.floorY-.08,SURFACE_BIAS=.006,SHADOW_ALPHA=.3,SHADOW_COLOR="#11141a",MISS_COLOR="#7c828c",MISS_HEIGHT_CSS_PX=42,GREAT_HEIGHT_CSS_PX=48,MISS_LABEL_CLEARANCE_WORLD_UNITS=.85,SHAKE_AMPLITUDE=.18,SHAKE_CYCLES=9,BOUNCE_AMPLITUDE=.2;

/** @type {AeroRendererTuning} */
export const defaultRendererTuning = Object.freeze({ id:"aero.renderer.prototype.default",version:"5",hash:"visual-playcanvas-v5",dprCap:2,roleScale:1,noteScaleFactor:1,obstacleScaleFactor:1,bombScaleFactor:1,markerScaleFactor:1,worldUnitsPerMs:CANONICAL_WORLD_UNITS_PER_MS,futureCullMs:10_000,spentCullMs:600,targetSize:0.9,obstacleHeight:3.9,timingZoneHeight:0.035,feedbackDurationMs:350,hitPulseScale:1.08,greatEndScale:1.25,aftermathGravityWUPerS2:9.8,aftermathRestitution:.35,aftermathBounceCount:2,aftermathEvictedFadeMs:150,aftermathSettledTumbleRadPerS:1.6,aftermathSliceSeparationWU:.16,aftermathLaunchVelocities:aftermathLaunchVelocities(),hazardGlowRampMs:150,hazardGlowDecayMs:600,hazardVignetteIntensity:0.6,hazardVignettePulseHz:2,hazardVignettePulseDepth:0.35,hazardVignetteRampMs:150,hazardVignetteDecayMs:400 });
/** Per-class visual scale tuning bounds: percent/100 factors are clamped to this range (setup percents 10-200). */
export const rendererVisualScaleBounds = Object.freeze({ min:.1,max:2 });
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

/** @param {AeroGameplayFrame} frame @param {AeroRendererThemeTokens} [theme] @param {AeroRendererTuning} [tuning] @param {typeof defaultTestPresentationConfig} [presentationConfig] @param {typeof defaultGameplayVisualExperimentConfig} [experimentConfig] @returns {AeroGameplaySceneModel} */
export function buildGameplaySceneModel(frame,theme=defaultRendererThemeTokens,tuning=defaultRendererTuning,presentationConfig=defaultTestPresentationConfig,experimentConfig=defaultGameplayVisualExperimentConfig){
  const experiment=normalizeGameplayVisualExperimentConfig(experimentConfig);
  if(!isPresentation(frame?.presentation)||!Number.isFinite(frame.nowMs)||!Array.isArray(frame.targets)||!(frame.showGameplayGrid===undefined||typeof frame.showGameplayGrid==="boolean")||!(frame.reducedMotion===undefined||typeof frame.reducedMotion==="boolean"))throw new TypeError("Gameplay frame is invalid");
  if(frame.guidanceBandMode!==undefined&&!["off","song_beat_grid","target_arrivals"].includes(frame.guidanceBandMode))throw new TypeError("Frame guidance band mode is invalid");
  if(frame.aftermath!==undefined&&!isValidAftermathList(frame.aftermath))throw new TypeError("Frame aftermath entries are invalid");
  if(frame.hazardContacts!==undefined&&!isValidHazardContactList(frame.hazardContacts))throw new TypeError("Frame hazard contact events are invalid");
  if(frame.hazardContactActive!==undefined&&!isValidHazardContactActive(frame.hazardContactActive))throw new TypeError("Frame hazard contact active state is invalid");
  if(frame.hazardVignetteParams!==undefined&&!isValidHazardVignetteParams(frame.hazardVignetteParams))throw new TypeError("Frame hazard vignette params are invalid");
  const reach=normalizeFrameRowReach(frame.rowReach);
  const colliderOverlay=normalizeColliderOverlay(frame);
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
  addTimingTiles(objects,frame,segments,tuning,presentationConfig,reach);
  addPresentationFloor(objects,frame,reach);
  for(const cell of validateCellList(frame.safeCells??[],"Safe cells"))addCellState(objects,cell,"safe",reach,frame.presentation==="boxing_collider");
  for(const cell of validateCellList(frame.blockedCells??[],"Blocked cells"))addCellState(objects,cell,"obstacle",reach,frame.presentation==="boxing_collider");
  const sorted=[...frame.targets].sort((a,b)=>b.beatCenterMs-a.beatCenterMs||a.id.localeCompare(b.id));
  if(sorted.length>128)throw new TypeError("Gameplay frame cannot exceed 128 targets");
  const guidanceMode=frame.guidanceBandMode??experiment.guidanceBandMode;
  const guidance=buildGuidanceBands(frame,sorted,window,guidanceMode,presentationConfig,tuning);
  objects.push(...guidance.objects);
  const aftermathTargetIds=new Set((frame.aftermath??[]).map((entry)=>entry.targetId));
  for(const target of sorted){
    const result=targetObjects(frame,target,window,segments[2],theme,tuning,presentationConfig,reach,aftermathTargetIds);
    if(result.objects.length===0&&result.feedback.length===0)culled.push(target.id);
    else{objects.push(...result.objects);feedback.push(...result.feedback);}
  }
  for(const entry of frame.aftermath??[])objects.push(...aftermathObjects(entry,frame.nowMs,tuning));
  const overlayObjects=colliderOverlayObjects(frame,sorted,colliderOverlay);
  objects.push(...overlayObjects);
  const retainedFeedback=feedback.sort((a,b)=>(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0)||a.id.localeCompare(b.id)).slice(-MAX_FEEDBACK).sort((a,b)=>(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0)||a.id.localeCompare(b.id));
  objects.push(...retainedFeedback);
  const aftermathEntries=frame.aftermath??[];
  const bombGlow=hazardContactIntensity((frame.hazardContacts??[]).map((entry)=>frame.nowMs-entry.atMs),tuning);
  // 0.0.54 W1-C: state-driven wall vignette (pulse while the nose is inside an obstacle, decay
  // after release) MAX-blended with the retained one-shot bomb-flash envelope.
  /** @type {AeroHazardVignetteParams|undefined} */ const vignetteParams=frame.hazardVignetteParams;
  const stateGlow=frame.hazardContactActive===undefined?0:hazardWallContactIntensity(frame.nowMs,frame.hazardContactActive,hazardVignetteParamsForFrame(vignetteParams,tuning));
  const glowState=Object.freeze({intensity:Math.max(bombGlow.intensity,stateGlow),activeCount:Math.max(bombGlow.activeCount,stateGlow>0?1:0)});
  const glowObject=hazardGlowObject(glowState);
  if(glowObject)objects.push(glowObject);
  objects.sort((a,b)=>a.renderOrder-b.renderOrder||(a.renderOrder===40?(b.feedback?.elapsedMs??0)-(a.feedback?.elapsedMs??0):a.sortDepth-b.sortDepth)||a.id.localeCompare(b.id));
  const overlayKind=frame.overlay??"none";
  return Object.freeze({
    presentation:frame.presentation,nowMs:frame.nowMs,objects:Object.freeze(objects),
    timingZone:Object.freeze({beforeMs:window.beforeMs,afterMs:window.afterMs,startZ,endZ,segments}),
    guidance:Object.freeze({mode:guidanceMode,visibleBandCount:guidance.objects.length,culledBandCount:guidance.culledCount}),
    camera:defaultGameplayCameraPose,grid:gameplayWorldGrid,
    overlay:Object.freeze({kind:overlayKind,dim:clamp(frame.calibrationDim??(overlayKind==="none"?0:0.62),0,1),countdown:normalizeCountdown(frame.countdown)}),
    assets:Object.freeze({release:String(gameplayAssetSet.release),identities:Object.freeze(gameplayAssetIds.map(String)),guardCanonicalAsset:String(gameplayAssetSet.constraints.guardCanonicalAsset),guardInstancesPerBeat:gameplayAssetSet.constraints.guardInstancesPerBeat}),
    renderOrder:gameplaySceneRenderOrder,culledTargetIds:Object.freeze(culled),
    hazardGlow:hazardGlowVisual(glowState,tuning),
    aftermathVisuals:Object.freeze({count:aftermathEntries.length,cap:AFTERMATH_MAX_ENTRIES}),
    colliderOverlay:colliderOverlayVisual(colliderOverlay,overlayObjects)
  });
}

/** Three deterministic canonical segments cover the present and visible future without stretching authored lane lines. @param {AeroGameplaySceneObject[]} objects */
function addTrack(objects){for(let index=0;index<3;index+=1)objects.push(sceneObject(`track-${index}`,"track","neutral",null,{x:0,y:gameplayWorldGrid.floorY-0.08,z:-12-index*24},{x:1,y:1,z:1},null,ASSET.track,0,1,null,false,false,null,null,-12-index*24,20,null,null,null));}
/** @typedef {Readonly<{topRowReachWU:number,bottomRowReachWU:number}>} AeroFrameRowReach */
/** Row-reach fractions for the `boxing_collider` presentation: reach rows 0/1/2 render at the shared `boxingColliderRowY` world Y. */
function normalizeFrameRowReach(value){
  if(value===undefined)return Object.freeze({topRowReachWU:1,bottomRowReachWU:1});
  if(value===null||typeof value!=="object"||Array.isArray(value))throw new TypeError("Frame row reach is invalid");
  const keys=Reflect.ownKeys(value);
  if(keys.length!==2||!keys.includes("topRowReachWU")||!keys.includes("bottomRowReachWU"))throw new TypeError("Frame row reach is invalid");
  const read=(key)=>{const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!("value" in descriptor)||typeof descriptor.value!=="number"||!Number.isFinite(descriptor.value)||descriptor.value<0||descriptor.value>1)throw new TypeError("Frame row reach is invalid");return descriptor.value;};
  return Object.freeze({topRowReachWU:read("topRowReachWU"),bottomRowReachWU:read("bottomRowReachWU")});
}
/** Presentation world Y for one grid row under the frame's reach values, via the shared `boxingColliderRowY` contract. At {1,1} this equals the legacy full-grid row Y (2,1,0). @param {AeroFrameRowReach} reach @param {number} row */
function presentationRowY(reach,row){return boxingColliderRowY(/** @type {0|1|2} */(row),reach).worldY;}
/** Convert a legacy grid world-Y to its 0/1/2 row index (grid rows are top-down: row 0 → y 2, row 1 → y 1, row 2 → y 0). @param {number} worldY */
function gridRowFromWorldY(worldY){return 2-Math.round(worldY);}
/** Tile exact authoritative timing bounds directly onto the canonical presentation lanes. Boundary tiles are clipped, never stretched. @param {AeroGameplaySceneObject[]} objects @param {AeroGameplayFrame} frame @param {readonly AeroTimingZoneSegment[]} segments @param {AeroRendererTuning} tuning @param {typeof defaultTestPresentationConfig} config @param {AeroFrameRowReach} reach */
function addTimingTiles(objects,frame,segments,tuning,config,reach){
  const boxing=frame.presentation==="boxing_lanes"||frame.presentation==="boxing_collider";
  const lanes=boxing?boxingLanes(config):gameplayWorldGrid.columnX.map((x)=>({x,width:GAMEPLAY_CELL_SIZE}));
  for(const segment of segments){let tileIndex=0;for(let cursor=segment.startZ;cursor<segment.endZ-1e-12;cursor+=TIMING_TILE_PITCH){const end=Math.min(segment.endZ,cursor+TIMING_TILE_PITCH),first=tileIndex===0,last=end>=segment.endZ-1e-12,visibleStart=cursor+(first?0:TIMING_TILE_GAP/2),visibleEnd=end-(last?0:TIMING_TILE_GAP/2),depth=visibleEnd-visibleStart;if(depth<=0)continue;for(const [laneIndex,lane] of lanes.entries())objects.push(sceneObject(`timing-${segment.name}-${tileIndex}-${laneIndex}`,"timing","neutral",null,{x:lane.x,y:TRACK_SURFACE_Y+SURFACE_BIAS,z:(visibleStart+visibleEnd)/2},{x:lane.width,y:.008,z:depth},null,null,0,segment.alpha,null,false,true,null,null,(visibleStart+visibleEnd)/2,15,null,null,null,null,segment.color));tileIndex+=1;}}
}
/** Grid tiles render only the three reach rows when the grid is on. @param {AeroGameplaySceneObject[]} objects @param {AeroGameplayFrame} frame @param {AeroFrameRowReach} reach */
function addPresentationFloor(objects,frame,reach){
  if(frame.showGameplayGrid!==true)return;
  if(frame.presentation==="boxing_collider"){
    for(let row=0;row<3;row+=1){const rowY=presentationRowY(reach,row);for(let column=0;column<4;column+=1)objects.push(sceneObject(`cell-row${row}-${column}`,"cell","neutral",null,{x:gameplayWorldGrid.columnX[column],y:rowY,z:0},{x:GAMEPLAY_CELL_SIZE,y:GAMEPLAY_CELL_SIZE,z:0.025},null,null,0,0.1,null,false,true,null,null,0,18,null,null,null));}
    return;
  }
  if(frame.presentation==="boxing_lanes")return;
  for(let cell=0;cell<12;cell+=1){const p=worldPositionForCell(cell);if(p)objects.push(sceneObject(`cell-${cell}`,"cell","neutral",null,{x:p.x,y:p.y,z:0},{x:GAMEPLAY_CELL_SIZE,y:GAMEPLAY_CELL_SIZE,z:0.025},null,null,0,0.1,null,false,true,null,null,0,18,null,null,null));}
}
/** @param {AeroGameplaySceneObject[]} objects @param {number} cell @param {"safe"|"obstacle"} role @param {AeroFrameRowReach} reach */
function addCellState(objects,cell,role,reach,useReachRows){const p=worldPositionForCell(cell);if(!p)return;const y=useReachRows?presentationRowY(reach,Math.floor(cell/4)):p.y;objects.push(sceneObject(`${role}-${cell}`,"cell",role,null,{x:p.x,y,z:0.02},{x:GAMEPLAY_CELL_SIZE,y:GAMEPLAY_CELL_SIZE,z:0.035},null,null,0,role==="safe"?0.28:0.55,null,false,true,null,null,0,18,null,null,null));}

/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {{beforeMs:number,afterMs:number}} window @param {AeroTimingZoneSegment} successZone @param {AeroRendererThemeTokens} theme @param {AeroRendererTuning} tuning @param {typeof defaultTestPresentationConfig} presentationConfig @param {AeroFrameRowReach} reach @param {Set<string>} aftermathTargetIds */
function targetObjects(frame,target,window,successZone,theme,tuning,presentationConfig,reach,aftermathTargetIds){
  if(!target||typeof target.id!=="string"||target.id.length<1||target.id.length>128||!Number.isFinite(target.beatCenterMs)||!Array.isArray(target.cells))throw new TypeError("Gameplay target is invalid");
  validateCellList(target.cells,"Target cells");if(target.cell!==null&&worldPositionForCell(target.cell)===null)throw new TypeError("Gameplay target cell is invalid");
  const appearanceColor=targetAppearanceColor(target);
  if(target.kind==="obstacle"&&target.gameplayGeometry===undefined)throw new TypeError("Obstacle targets require normalized continuous geometry");
  const continuousObstacle=target.kind==="obstacle";
  const interval=continuousObstacle?obstacleInterval(target):Object.freeze({startMs:target.beatCenterMs,endMs:target.beatCenterMs});
  const latest=interval.endMs+window.afterMs+tuning.spentCullMs;
  const obstacleNormalSpawnMs=continuousObstacle&&Number.isFinite(target.normalSpawnMs)?target.normalSpawnMs:null,obstacleSkyStartMs=obstacleNormalSpawnMs===null?null:Math.max(0,obstacleNormalSpawnMs-presentationConfig.skyPreludeDurationMs);
  const trajectoryStart=obstacleNormalSpawnMs!==null?(presentationConfig.skyMode==="prelude"?obstacleSkyStartMs:obstacleNormalSpawnMs):Number.isFinite(target.bounceStartMs)&&Number.isFinite(target.normalSpawnMs)&&Number.isFinite(target.skyPreludeStartMs)?(presentationConfig.skyMode==="prelude"?Number(target.skyPreludeStartMs):Number(target.normalSpawnMs)):null;
  if(frame.nowMs>latest||(trajectoryStart===null?interval.startMs-frame.nowMs>tuning.futureCullMs:frame.nowMs<trajectoryStart))return{objects:[],feedback:[]};
  const state=targetState(target,frame.nowMs,interval,window);
  const role=targetRole(target);
  if(continuousObstacle){
    if(!isObstacleGameplayGeometry(target.gameplayGeometry)||!isObstacleGridMask(target.cells,target.gameplayGeometry))throw new TypeError("Normalized obstacle gameplay geometry and grid mask are invalid");
    const wallGateMs=obstacleNormalSpawnMs!==null?(presentationConfig.skyMode==="prelude"?obstacleSkyStartMs:obstacleNormalSpawnMs):Math.max(0,interval.startMs-presentationConfig.normalSpawnDistanceWorldUnits/tuning.worldUnitsPerMs);
    if(state!=="hit"&&state!=="miss"&&frame.nowMs<wallGateMs)return{objects:[],feedback:[]};
    const geometry=target.gameplayGeometry;
    const obstacleScale=tuning.obstacleScaleFactor;
    const z0=timestampToWorldZ(interval.startMs,frame.nowMs,tuning.worldUnitsPerMs),z1=timestampToWorldZ(interval.endMs,frame.nowMs,tuning.worldUnitsPerMs);
    const center=(z0+z1)/2,depth=Math.abs(z1-z0);
    const pulse=target.contactPulseProgress===undefined?0:1-clamp(Number(target.contactPulseProgress),0,1);
    const wallLiftY=obstacleNormalSpawnMs!==null&&presentationConfig.skyMode==="prelude"&&state!=="hit"&&state!=="miss"?testPresentationSkyOffsetY(frame.nowMs,obstacleSkyStartMs,obstacleNormalSpawnMs,presentationConfig):0;
    if(frame.presentation==="boxing_lanes"||frame.presentation==="boxing_collider"){
      const configuredLanes=boxingLanes(presentationConfig),lanes=target.family==="squat"?configuredLanes:configuredLanes.filter((entry)=>entry.lane===(target.lane??target.hand));
      if(lanes.length!==(target.family==="squat"?2:1))throw new TypeError("Boxing lane obstacle placement is invalid");
      const objects=[];
      for(const [index,lane] of lanes.entries()){
        const suffix=lanes.length===1?"":`:${index}`;
        objects.push(sceneObject(`${target.id}:wall${suffix}`,"obstacle",role,target.id,{x:lane.x,y:lane.y+wallLiftY,z:center},{x:lane.width/GAMEPLAY_CELL_SIZE,y:BOXING_LANE_HEIGHT/GAMEPLAY_CELL_SIZE,z:depth},null,ASSET.wall,0,1,null,0,true,interval.startMs,interval.endMs,center,30,null,null,null));
        objects.push(sceneObject(`${target.id}:shadow${suffix}`,"shadow","neutral",target.id,{x:lane.x,y:gameplayWorldGrid.floorY+.018,z:center},{x:lane.width,y:.012,z:depth},null,null,0,SHADOW_ALPHA,null,false,true,interval.startMs,interval.endMs,center,35,null,null,null,null,SHADOW_COLOR));
      }
      return{objects,feedback:[]};
    }
    const centerX=geometry.x+(geometry.width-1)/2-1.5;
    const centerY=2-geometry.y-(geometry.height-1)/2;
    const scaleX=(geometry.width-.06*obstacleScale)/GAMEPLAY_CELL_SIZE,scaleY=(geometry.height-.06*obstacleScale)/GAMEPLAY_CELL_SIZE;
    const wall=sceneObject(`${target.id}:wall`,"obstacle",role,target.id,{x:centerX,y:centerY+wallLiftY,z:center},{x:scaleX,y:scaleY,z:depth},null,ASSET.wall,0,1,null,pulse,true,interval.startMs,interval.endMs,center,30,null,null,null);
    const shadow=sceneObject(`${target.id}:shadow`,"shadow","neutral",target.id,{x:centerX,y:gameplayWorldGrid.floorY+.018,z:center},{x:geometry.width-.06,y:.012,z:depth},null,null,0,SHADOW_ALPHA,null,false,true,interval.startMs,interval.endMs,center,35,null,null,null,null,SHADOW_COLOR);
    return{objects:[wall,shadow],feedback:[]};
  }
  const positions=targetPositions(frame,target,presentationConfig,reach);
  if(target.bounceStartMs!==undefined&&(!Number.isFinite(target.bounceStartMs)||target.bounceStartMs<0||target.bounceStartMs>target.beatCenterMs))throw new TypeError("Gameplay target bounce start is invalid");
  if(target.normalSpawnMs!==undefined&&(!Number.isFinite(target.normalSpawnMs)||target.normalSpawnMs<0||target.normalSpawnMs>target.beatCenterMs))throw new TypeError("Gameplay target normal spawn is invalid");
  if(target.skyPreludeStartMs!==undefined&&(!Number.isFinite(target.skyPreludeStartMs)||target.skyPreludeStartMs<0||target.skyPreludeStartMs>Number(target.normalSpawnMs)))throw new TypeError("Gameplay target sky prelude start is invalid");
  // 0.0.55 W3: the icon's rendered position (base + bounce/sky Y offset + state Z) comes from the
  // shared `iconRenderPosition` helper — the same helper `colliderOverlayObjects` anchors at, so
  // icon and overlays are guaranteed to agree (behavior-identical to the pre-refactor inline math).
  const iconAnchor=iconRenderPosition(frame,target,tuning,presentationConfig,reach);
  const normalSpawnMs=target.normalSpawnMs??Math.max(0,target.beatCenterMs-presentationConfig.normalSpawnDistanceWorldUnits/tuning.worldUnitsPerMs);
  const skyStartMs=target.skyPreludeStartMs??Math.max(0,normalSpawnMs-presentationConfig.skyPreludeDurationMs);
  const hardGateMs=presentationConfig.skyMode==="prelude"?skyStartMs:normalSpawnMs;
  if(state!=="hit"&&state!=="miss"&&frame.nowMs<hardGateMs)return{objects:[],feedback:[]};
  const totalOffset=iconAnchor.y-(positions[0]?.y??0),iconPositions=totalOffset===0?positions:positions.map((position)=>({x:position.x,y:position.y+totalOffset}));
  const resolved=state==="hit"||state==="miss",missCommit=ownEnumerableDataAdmission(target,"missCommitMs"),missCommitMs=missCommit.admitted?missCommit.value:undefined,feedbackProgress=ownEnumerableDataAdmission(target,"feedbackProgress"),feedbackProgressValue=feedbackProgress.admitted?feedbackProgress.value:undefined;
  if(state==="hit"&&(!feedbackProgress.admitted||!Number.isFinite(feedbackProgressValue)||Number(feedbackProgressValue)<0||Number(feedbackProgressValue)>1))throw new TypeError("Hit target feedback progress is required as one exact own enumerable finite data value");
  if(state==="miss"&&(!missCommit.admitted||!Number.isFinite(missCommitMs)||Number(missCommitMs)<0||Number(missCommitMs)>frame.nowMs||feedbackProgress.present))throw new TypeError("Miss target requires an exact committed timestamp as one own enumerable data property and no feedback progress");
  if(state!=="miss"&&missCommit.present)throw new TypeError("Miss committed timestamp is forbidden on non-miss targets");
  if(state!=="hit"&&state!=="miss"&&feedbackProgress.present)throw new TypeError("Feedback progress is forbidden on non-hit targets");
  const elapsedMs=state==="miss"?frame.nowMs-Number(missCommitMs):state==="hit"?Number(feedbackProgressValue)*tuning.feedbackDurationMs:0;
  const z=iconAnchor.z;
  const removal=state==="hit"?Object.freeze({elapsedMs,durationMs:REMOVAL_MS,progress:clamp(elapsedMs/REMOVAL_MS,0,1)}):null;
  const targetVisible=state==="hit"?elapsedMs<REMOVAL_MS:state==="miss"?elapsedMs<MISS_EXPIRY_MS:true;
  const removalScale=removal?0.92*(1-removal.progress):1;
  const tintDistance=tuning.worldUnitsPerMs*60,dynamicNoteFill=isDynamicNoteFillTarget(target);
  const tintMix=!dynamicNoteFill||resolved||frame.nowMs>=target.beatCenterMs||z<successZone.startZ?0:z<=successZone.endZ?clamp((z-successZone.startZ)/tintDistance,0,1):clamp(1-(z-successZone.endZ)/tintDistance,0,1);
  const assetId=assetForTarget(target);
  const rotation=target.direction?directionRotation(target.direction):0;
  const pairKey=target.kind==="guard"?target.id:null;
  const iconAppearanceColor=state==="miss"?MISS_COLOR:appearanceColor;
  // 0.0.55 W2 follow-up: `frame.aftermath` now contains the hit target from commit time
  // (the W2 aftermath-persistence fix), so gating the handoff on mere membership would hide
  // the icon at commit instead of after the 80 ms removal window. Gate the hit-state handoff
  // on removal completion so the icon stays visible through its removal fade, then hands off
  // to the aftermath pieces. Miss has no removal — hand off immediately on membership.
  const aftermathHandoff=aftermathTargetIds.has(target.id)&&(state==="miss"||(state==="hit"&&removal!==null&&removal.progress>=1));
  const icons=aftermathHandoff?[]:targetVisible?iconPositions.map((p,index)=>{const kindScale=(target.kind==="bomb"||target.family==="bomb"?tuning.bombScaleFactor:tuning.noteScaleFactor)*removalScale;return sceneObject(`${target.id}:${index}`,"icon",role,target.id,{x:p.x,y:p.y,z},{x:kindScale,y:kindScale,z:kindScale},null,assetId,rotation,state==="hit"?Math.max(0,1-(removal?.progress??1)):1,state,tintMix,Boolean(removal),null,null,z,10,pairKey,pairKey===null?null:index,removal,null,iconAppearanceColor);}):[];
  const shadowScale=tuning.noteScaleFactor;
  const shadows=targetVisible?positions.map((p,index)=>sceneObject(`${target.id}:shadow:${index}`,"shadow","neutral",target.id,{x:p.x,y:gameplayWorldGrid.floorY+.018,z},{x:.68*shadowScale,y:.012,z:.34*shadowScale},null,null,0,state==="hit"?Math.max(0,SHADOW_ALPHA*(1-(removal?.progress??1))):SHADOW_ALPHA,state,false,true,null,null,z,35,null,null,removal,null,SHADOW_COLOR)):[];
  /** @type {AeroGameplaySceneObject[]} */ const feedbackObjects=[];
  if(resolved&&target.kind!=="obstacle"&&target.kind!=="bomb"&&positions.length&&elapsedMs<tuning.feedbackDurationMs){
    const feedbackZ=state==="miss"?z:0,hit=state==="hit";
    const alpha=elapsedMs<=FEEDBACK_HOLD_MS?1:clamp(1-(elapsedMs-FEEDBACK_HOLD_MS)/FEEDBACK_FADE_MS,0,1),motion=feedbackMotion(hit?"bounce":"shake",elapsedMs,tuning.feedbackDurationMs);
    const visual=Object.freeze({text:/** @type {"Great"|"Miss"} */(hit?"Great":"Miss"),holdMs:FEEDBACK_HOLD_MS,fadeMs:FEEDBACK_FADE_MS,totalMs:tuning.feedbackDurationMs,elapsedMs,alpha,faceColor:hit?"#ffffff":"#e5484d",separationColor:hit?"#171a22":"#ffffff",depthBias:0.01,apparentHeightCssPx:hit?GREAT_HEIGHT_CSS_PX:MISS_HEIGHT_CSS_PX,offsetX:motion.x,offsetY:motion.y,scale:motion.scale,animation:/** @type {"bounce"|"shake"} */(hit?"bounce":"shake")});
    const crossingPositions=target.kind==="guard"?[{x:(positions[0].x+positions[positions.length-1].x)/2,y:positions[0].y}]:positions.slice(0,1);
    for(const [index,p] of crossingPositions.entries())feedbackObjects.push(sceneObject(`${target.id}:feedback:${index}`,"feedback",role,target.id,{x:p.x,y:p.y+(hit?0:MISS_LABEL_CLEARANCE_WORLD_UNITS),z:feedbackZ},{x:1,y:1,z:1},null,null,0,alpha,state,false,true,null,null,feedbackZ,40,null,null,removal,visual));
  }
  return{objects:[...icons,...shadows],feedback:feedbackObjects};
}

/** Build bounded renderer-only guidance across the whole visible window from caller-owned mapped beat times or stable actionable group identity. @param {AeroGameplayFrame} frame @param {readonly AeroRenderableTarget[]} targets @param {{beforeMs:number,afterMs:number}} window @param {"off"|"song_beat_grid"|"target_arrivals"} mode @param {typeof defaultTestPresentationConfig} config @param {AeroRendererTuning} tuning */
function buildGuidanceBands(frame,targets,window,mode,config,tuning){
  const supplied=frame.guidanceBeatTimestampsMs;
  if(supplied!==undefined&&(!Array.isArray(supplied)||supplied.length>MAX_GUIDANCE_BEAT_TIMESTAMPS||supplied.some((value)=>!Number.isFinite(value)||value<0||value>86_400_000)))throw new TypeError("Guidance beat timestamps are invalid");
  if(mode!=="song_beat_grid"&&supplied?.length)throw new TypeError("Guidance beat timestamps require song beat-grid mode");
  /** @type {{identity:string,beatCenterMs:number,members:AeroRenderableTarget[]}[]} */ const groups=[];
  const byIdentity=new Map();
  for(const target of targets){
    if(!Object.hasOwn(target,"arrivalGroupIdentity"))continue;
    if(!isGuidanceEligible(target))throw new TypeError("Hazard and checkpoint targets cannot carry arrival group identity");
    const identity=target.arrivalGroupIdentity;
    if(typeof identity!=="string"||identity.length<1||identity.length>128)throw new TypeError("Arrival group identity is invalid");
    const existing=byIdentity.get(identity);if(existing&&existing.beatCenterMs!==target.beatCenterMs)throw new TypeError("Arrival group identity conflicts");
    const group=existing??{identity,beatCenterMs:target.beatCenterMs,members:[]};group.members.push(target);byIdentity.set(identity,group);
  }
  groups.push(...byIdentity.values());
  if(mode==="off")return Object.freeze({objects:Object.freeze([]),culledCount:0});
  const leadMs=config.normalSpawnDistanceWorldUnits/tuning.worldUnitsPerMs,maxMs=frame.nowMs+leadMs;
  const cadenceMs=supplied?.length&&Number.isFinite(Math.max(...supplied))&&Math.max(...supplied)>1?Math.min(leadMs,Math.max(...supplied)):leadMs/8;
  let anchors,cap;
  if(mode==="song_beat_grid"){
    const values=supplied??[];if(new Set(values).size!==values.length||values.some((value,index)=>index>0&&value<=values[index-1]))throw new TypeError("Guidance beat timestamps must be unique and strictly increasing");
    anchors=values.filter((value)=>value>=frame.nowMs&&value<=maxMs);cap=MAX_SONG_GUIDANCE_BANDS;
  }else{
    anchors=groups.filter((group)=>group.beatCenterMs>=frame.nowMs&&group.beatCenterMs<=maxMs&&group.members.some((target)=>target.judgement!=="hit"&&target.judgement!=="miss")).sort((a,b)=>a.beatCenterMs-b.beatCenterMs||a.identity.localeCompare(b.identity)).map((group)=>group.beatCenterMs);
    anchors=[...new Set(anchors)].sort((left,right)=>right-left);cap=MAX_TARGET_ARRIVAL_BANDS;
  }
  /** @type {{z:number,alpha:number,continuation:boolean}[]} */ const entries=anchors.slice(0,cap).map((timestamp)=>({z:timestampToWorldZ(timestamp,frame.nowMs,tuning.worldUnitsPerMs),alpha:.32,continuation:false}));
  let culled=Math.max(0,anchors.length-entries.length);
  const lastFutureAnchor=anchors.reduce((max,value)=>value>=frame.nowMs?Math.max(max,value):max,-Infinity);
  for(let timestamp=(Number.isFinite(lastFutureAnchor)?lastFutureAnchor:frame.nowMs)+cadenceMs;timestamp<=maxMs;timestamp+=cadenceMs){
    if(entries.length<MAX_GUIDANCE_CONTINUATION_BANDS)entries.push({z:timestampToWorldZ(timestamp,frame.nowMs,tuning.worldUnitsPerMs),alpha:.16,continuation:true});
    else{culled+=1;break;}
  }
  return Object.freeze({objects:Object.freeze(entries.map((entry,index)=>guidanceBand(frame,index,entry.z,entry.alpha))),culledCount:culled});
}
/** @param {AeroRenderableTarget} target */
function isGuidanceEligible(target){return isDynamicNoteFillTarget(target)||target.kind==="guard"&&["guard","crossed_guard"].includes(target.family);}
/** One reduced-alpha or full-extent band. Continuation alpha is exactly half the arrival alpha (.32 → .16). @param {AeroGameplayFrame} frame @param {number} index @param {number} z @param {number} alpha */
function guidanceBand(frame,index,z,alpha){const lanes=frame.presentation==="boxing_lanes"?boxingLanes(defaultTestPresentationConfig):[{x:0,width:4}],left=Math.min(...lanes.map((lane)=>lane.x-lane.width/2)),right=Math.max(...lanes.map((lane)=>lane.x+lane.width/2));return sceneObject(`guidance-band-${index}`,"guidance_band","neutral",null,{x:(left+right)/2,y:TRACK_SURFACE_Y+.018,z},{x:right-left,y:.018,z:.055},null,null,0,alpha,null,0,true,null,null,z,19,null,null,null,null,"#d9f5ff");}
/**
 * 0.0.55 W3: the note icon's ACTUAL rendered world position — base grid position (X/Y) plus the
 * vertical bounce + sky-prelude offset, and the state-dependent Z (miss: continues +Z at
 * `CANONICAL_WORLD_UNITS_PER_MS` from the beat-center crossing; hit: pinned at the Z=0 crossing;
 * pending/active: timestamp→Z travel). This is the single source of truth for icon placement
 * (`targetObjects`) so the debug collider overlays (`colliderOverlayObjects`) can anchor at the
 * EXACT position the glyph renders — guaranteeing the tolerance cone, target point, and collider
 * square ride the note through bounce, sky prelude, hit, and miss instead of lagging at the base.
 * @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {AeroRendererTuning} tuning @param {typeof defaultTestPresentationConfig} presentationConfig @param {AeroFrameRowReach} reach
 * @returns {AeroWorldPosition}
 */
export function iconRenderPosition(frame,target,tuning,presentationConfig,reach){
  const positions=targetPositions(frame,target,presentationConfig,reach);
  const base=positions[0]??Object.freeze({x:0,y:0});
  const isBomb=target.kind==="bomb",bounceEligible=!isBomb&&isBeatBounceSemanticTarget(target),hasTrajectory=target.bounceStartMs!==undefined&&target.normalSpawnMs!==undefined&&target.skyPreludeStartMs!==undefined;
  const normalSpawnMs=target.normalSpawnMs??Math.max(0,target.beatCenterMs-presentationConfig.normalSpawnDistanceWorldUnits/tuning.worldUnitsPerMs);
  const skyStartMs=target.skyPreludeStartMs??Math.max(0,normalSpawnMs-presentationConfig.skyPreludeDurationMs);
  const interval=target.kind==="obstacle"?obstacleInterval(target):Object.freeze({startMs:target.beatCenterMs,endMs:target.beatCenterMs});
  const window=timingWindow(frame);
  const state=targetState(target,frame.nowMs,interval,window);
  const effectiveBounceStart=Math.max(normalSpawnMs,target.bounceStartMs??normalSpawnMs);
  const bounceOffset=bounceEligible&&hasTrajectory&&state!=="hit"&&state!=="miss"?testPresentationBounceOffsetY(frame.nowMs,effectiveBounceStart,target.beatCenterMs,presentationConfig):0;
  const skyOffset=(bounceEligible&&hasTrajectory||isBomb)&&state!=="hit"&&state!=="miss"?testPresentationSkyOffsetY(frame.nowMs,skyStartMs,normalSpawnMs,presentationConfig):0;
  const totalOffset=bounceOffset+skyOffset;
  const movingZ=timestampToWorldZ(target.beatCenterMs,frame.nowMs,tuning.worldUnitsPerMs);
  const z=state==="miss"?(frame.nowMs-target.beatCenterMs)*CANONICAL_WORLD_UNITS_PER_MS:state==="hit"?0:movingZ;
  return Object.freeze({x:base.x,y:base.y+totalOffset,z});
}
/** Deterministic caller-time feedback motion; no engine delta or random state participates. @param {"bounce"|"shake"} animation @param {number} elapsedMs @param {number} durationMs */
function feedbackMotion(animation,elapsedMs,durationMs){
  const progress=clamp(elapsedMs/Math.max(1,durationMs),0,1);
  if(animation==="shake")return Object.freeze({x:Math.sin(progress*Math.PI*2*SHAKE_CYCLES)*SHAKE_AMPLITUDE*(1-progress),y:0,scale:1.08});
  const bounce=Math.sin(progress*Math.PI);
  return Object.freeze({x:0,y:bounce*BOUNCE_AMPLITUDE,scale:1+bounce*BOUNCE_AMPLITUDE});
}
/** @param {AeroRenderableTarget} target */
function isDynamicNoteFillTarget(target){return target.kind==="flow"&&target.family==="flow"||target.kind==="punch"&&["straight","hook","uppercut"].includes(target.family);}
/** @param {AeroRenderableTarget} target */
function isBeatBounceSemanticTarget(target){return isDynamicNoteFillTarget(target)||target.kind==="guard"&&["guard","crossed_guard"].includes(target.family);}
/** @param {AeroRenderableTarget} target */
function assetForTarget(target){if(target.kind==="guard")return ASSET.guard;if(target.kind==="bomb"||target.family==="bomb")return ASSET.bomb;return target.direction?ASSET.arrow:ASSET.circle;}
/** @param {AeroGameplayFrame} frame @param {AeroRenderableTarget} target @param {typeof defaultTestPresentationConfig} config @param {AeroFrameRowReach} reach */
function targetPositions(frame,target,config,reach){
  if(frame.presentation==="boxing_lanes"||frame.presentation==="boxing_collider"){
    const lanes=boxingLanes(config);
    if(target.kind==="guard"||target.family==="squat")return lanes.map(lane=>({x:lane.x,y:lane.y}));
    // Boxing collider: cell-anchored targets render at their reach-row Y; lane-anchored targets use lanes.
    // 0.0.54 P2 fix: real assembly punch targets carry `cell` set + `cells: []` (session-render-
    // projection line 204), so the effective cell list must fall back to `cell` — mapping
    // `target.cells` alone yielded zero positions (no punch icon) for the real punch shape.
    if(frame.presentation==="boxing_collider"&&(target.cells.length>0||target.cell!==null)){
      const effectiveCells=target.cells.length>0?target.cells:[target.cell];
      const applyReach=(position)=>({x:position.x,y:presentationRowY(reach,gridRowFromWorldY(position.y))});
      return effectiveCells.map(worldPositionForCell).filter(Boolean).map(applyReach);
    }
    const lane=lanes.find(entry=>entry.lane===(target.lane??target.hand));return lane?[{x:lane.x,y:lane.y}]:[];
  }
  const applyReach=(position)=>frame.presentation==="boxing_collider"?{x:position.x,y:presentationRowY(reach,gridRowFromWorldY(position.y))}:position;
  if(target.kind==="guard"){
    const cells=target.cells.length>=2?target.cells.slice(0,2):[5,6];const pair=cells.map(worldPositionForCell);
    if(!pair[0]||!pair[1]||pair[0].y!==pair[1].y||pair[0].x===pair[1].x)throw new TypeError("Guard cells must be a same-height left/right pair");
    return /** @type {{x:number,y:number}[]} */(pair.map(applyReach).sort((a,b)=>a.x-b.x));
  }
  const cells=target.cells.length?target.cells:target.cell===null?[]:[target.cell];
  return cells.map(worldPositionForCell).filter(Boolean).map(applyReach);
}
/** @param {AeroRenderableTarget} target @returns {string|null} */
function targetAppearanceColor(target){
  if(!isDynamicNoteFillTarget(target))return null;
  if(!Object.hasOwn(target,"appearanceColor"))return null;
  const appearance=Object.freeze({appearanceColor:target.appearanceColor});
  if(!isPrivateNoteAppearance(appearance))throw new TypeError("Gameplay target appearance color is invalid");
  return appearance.appearanceColor;
}
/** @param {AeroRenderableTarget} target */
function targetRole(target){return target.kind==="guard"?"guard":target.kind==="obstacle"||target.kind==="bomb"?"obstacle":target.kind==="safe"?"safe":target.hand==="left"?"left":target.hand==="right"?"right":"neutral";}
/** @param {AeroRenderableTarget} target @param {number} nowMs @param {{startMs:number,endMs:number}} interval @param {{beforeMs:number,afterMs:number}} window @returns {AeroSceneTargetState} */
function targetState(target,nowMs,interval,window){if(target.judgement==="hit")return"hit";if(target.judgement==="miss")return"miss";if(nowMs>interval.endMs+window.afterMs)return"spent";if(nowMs>=interval.startMs-window.beforeMs&&nowMs<=interval.endMs+window.afterMs)return"active";return"pending";}
/** @param {AeroRenderableTarget} target */
function obstacleInterval(target){const startMs=Number(target.intervalStartMs??target.beatCenterMs),endMs=Number(target.intervalEndMs??target.endMs??startMs);if(target.intervalEndMs!==undefined&&target.endMs!==undefined&&target.intervalEndMs!==target.endMs)throw new TypeError("Flow obstacle end bounds conflict");if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>86_400_000)throw new TypeError("Flow obstacle interval is invalid");return Object.freeze({startMs,endMs});}
/** @param {AeroGameplayFrame} frame */
function timingWindow(frame){const required=frame.presentation==="boxing_lanes";const before=frame.timingWindowBeforeMs??(required?NaN:defaultGameplayTimingWindow.beforeMs),after=frame.timingWindowAfterMs??(required?NaN:defaultGameplayTimingWindow.afterMs);if(![before,after].every((v)=>Number.isFinite(v)&&v>=0&&v<=10_000))throw new TypeError("Authoritative timing window is invalid");return Object.freeze({beforeMs:Number(before),afterMs:Number(after)});}
/** @param {"early"|"active"|"late"} name @param {number} startZ @param {number} endZ @param {string} color @param {number} alpha */
function zone(name,startZ,endZ,color,alpha){return Object.freeze({name,startZ:Math.min(startZ,endZ),endZ:Math.max(startZ,endZ),color,alpha});}
/** @returns {AeroGameplaySceneObject} */
function sceneObject(id,kind,role,targetId,position,scale,iconId,assetId,rotationZRad,alpha,state,tintMix,transparent,intervalStartMs,intervalEndMs,sortDepth,renderOrder,guardPairKey,guardPairIndex,removal,feedback=null,appearanceColor=null,aftermath=null){return Object.freeze({id,kind,role,targetId,position:Object.freeze(position),scale:Object.freeze(scale),rotationZRad,alpha,iconId,assetId,tintColor:Number(tintMix)>0?"#ffffff":null,appearanceColor,tintMix:Number(tintMix),whiteCore:Number(tintMix)>0,state,transparent,intervalStartMs,intervalEndMs,sortDepth,renderOrder,guardPairKey,guardPairIndex,removal,feedback,aftermath});}
/** Arrow identity points +Y; rotate only around local Z to the authoritative direction. @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection} direction */
function directionRotation(direction){const rotations=new Map([["up",0],["up-right",-Math.PI/4],["right",-Math.PI/2],["down-right",-Math.PI*3/4],["down",Math.PI],["down-left",Math.PI*3/4],["left",Math.PI/2],["up-left",Math.PI/4]]);const rotation=rotations.get(direction);if(rotation===undefined)throw new TypeError("Gameplay direction is unsupported");return rotation;}
/** @param {readonly number[]} cells @param {string} label */
function validateCellList(cells,label){if(!Array.isArray(cells)||cells.length>12||new Set(cells).size!==cells.length||cells.some((cell)=>worldPositionForCell(cell)===null))throw new TypeError(`${label} are invalid`);return cells;}
/** @param {unknown} value @returns {value is AeroGameplayPresentation} */
function isPresentation(value){return value==="flow"||value==="boxing_spatial_grid"||value==="boxing_lanes"||value==="boxing_collider";}
/** @param {number|undefined|null} value */
function normalizeCountdown(value){return Number.isInteger(value)&&Number(value)>=1&&Number(value)<=3?Number(value):null;}
/** Inspect one target field without invoking own or inherited accessors. @param {object} value @param {string} key */
function ownEnumerableDataAdmission(value,key){const own=Object.getOwnPropertyDescriptor(value,key);if(own)return Object.freeze({present:true,admitted:own.enumerable&&"value" in own,value:"value" in own?own.value:undefined});let prototype=Object.getPrototypeOf(value);while(prototype!==null){if(Object.getOwnPropertyDescriptor(prototype,key))return Object.freeze({present:true,admitted:false,value:undefined});prototype=Object.getPrototypeOf(prototype);}return Object.freeze({present:false,admitted:false,value:undefined});}
/** @param {number} value @param {number} min @param {number} max */
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}

// 0.0.52 W1-C — hit-success aftermath (p5pr): pure closed-form per-frame poses. Every object is a
// deterministic function of (entry, nowMs, tuning); no engine delta, random state, or retained memory.
/** 0.0.56 W2: per-family DEFAULT aftermath asset identity. The entry's `shape` (the hit note's
 * actual glyph) OVERRIDES this for flow + punch — the corpse must be a cut-in-half of the note's
 * real asset (arrow for directional, orb for directionless), not the family default. Guard/obstacle/
 * bomb/safe never carry a shape, so they keep their per-family asset unchanged. */
const AFTERMATH_FAMILY_ASSET=Object.freeze({flow:ASSET.circle,guard:ASSET.guard,obstacle:ASSET.wall,bomb:ASSET.bomb,safe:ASSET.circle});
/** 0.0.56 W2: the entry `shape` → asset identity mapping for the two note shapes. */
const AFTERMATH_SHAPE_ASSET=Object.freeze({arrow:ASSET.arrow,orb:ASSET.circle});
const AFTERMATH_FAMILY_ROLE=Object.freeze({flow:"neutral",guard:"guard",obstacle:"obstacle",bomb:"obstacle",safe:"safe"});
/** Deterministic phase in [0,1) from an entry seed and stable salt; tumbling stays reproducible. @param {number} seed @param {number} salt */
function seedPhase(seed,salt){let h=(seed^Math.imul(salt+0x9e3779b9,0x85ebca6b))>>>0;h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;return h/4294967296;}
/**
 * Exact launch velocity (WU/s) for one aftermath entry. Family `punch` picks straight/hook/uppercut
 * from `mode`; hooks take the hand sign toward center (left hook +X, right hook -X). Family `guard`
 * takes the bonk impulse; `flow` the small neutral note curve.
 * @param {AeroAftermathEntry} entry @param {AeroRendererTuning} [tuning]
 */
export function aftermathLaunchVelocity(entry,tuning=defaultRendererTuning){
  const velocities=tuning.aftermathLaunchVelocities;
  if(entry.family==="punch"){
    if(entry.hand!=="left"&&entry.hand!=="right")throw new TypeError("Punch aftermath requires a left or right hand");
    if(entry.mode==="hook"){const v=velocities.hook;return Object.freeze({x:(entry.hand==="left"?1:-1)*v.x,y:v.y,z:v.z});}
    if(entry.mode==="uppercut")return velocities.uppercut;
    if(entry.mode==="straight")return velocities.straight;
    throw new TypeError(`Punch aftermath mode is invalid: ${String(entry.mode)}`);
  }
  if(entry.family==="guard"){if(entry.mode!=="bonk")throw new TypeError("Guard aftermath mode must be bonk");return velocities.guardBonk;}
  if(entry.family==="flow"){if(entry.mode!=="single"&&entry.mode!=="slice")throw new TypeError("Flow aftermath mode must be single or slice");return velocities.flowNote;}
  if((entry.family==="obstacle"||entry.family==="bomb")&&entry.mode==="single")return velocities.flowNote;
  throw new TypeError(`Aftermath family/mode combination is invalid: ${String(entry.family)}/${String(entry.mode)}`);
}

/** 0.0.59 B14: time (ms) for a vertical trajectory from y0 with vy under gravity g to CROSS below `offY` (offY < y0). Solves y0 + vy·t − ½g·t² = offY for the positive root. */
/** @param {number} y0 @param {number} vy @param {number} g @param {number} offY */
function offscreenCrossingMs(y0,vy,g,offY){
  const c=y0-offY;
  if(c<=1e-9)return 0;
  return(vy+Math.sqrt(Math.max(0,vy*vy+2*g*c)))/g*1000;
}
/** Deterministic horizontal separation offset for one Flow slice half: signed base split plus seeded jitter. @param {AeroAftermathEntry} entry @param {number} sign @param {AeroRendererTuning} [tuning] */
export function aftermathSliceOffsetX(entry,sign,tuning=defaultRendererTuning){
  const spread=tuning.aftermathSliceSeparationWU;
  return sign*spread/2+(seedPhase(entry.seed,7)-.5)*spread*.25;
}
/**
 * Pure closed-form aftermath pose: position, tumble rotation, and alpha for one entry at elapsed ms.
 * 0.0.59 B14 — "fall off-screen": the corpse is launched with its per-family knock velocity and
 * then follows ONE uninterrupted parabola (launch + gravity) for its whole life. There is no
 * floor plane, no bounce segment, and no settle: the piece keeps falling (and keeps its single
 * continuous in-flight tumble — no rotation discontinuity) until its center drops below
 * `AFTERMATH_OFFSCREEN_Y` (off the visible area under the track). The fade window starts at the
 * earliest of (that off-screen crossing, the assembly-marked eviction) and runs for
 * `aftermathEvictedFadeMs`, after which the pose returns null (stops rendering). The assembly's
 * FIFO eviction contract is unchanged — only the trajectory changed from "settle on a below-track
 * floor" to "fall off-screen and fade".
 * @param {AeroAftermathEntry} entry @param {number} elapsedMs @param {AeroRendererTuning} [tuning]
 */
export function aftermathPose(entry,elapsedMs,tuning=defaultRendererTuning){
  const g=tuning.aftermathGravityWUPerS2;
  const launch=aftermathLaunchVelocity(entry,tuning);
  const {spawn}=entry;
  // 0.0.59 B14: `settleMs` is redefined as the off-screen crossing time — the moment the corpse's
  // center drops below AFTERMATH_OFFSCREEN_Y. It is the single timeline boundary for the pose:
  // before it the piece is a single parabola in flight; from it the fade tail may begin.
  const settleMs=offscreenCrossingMs(spawn.y,launch.y,g,AFTERMATH_OFFSCREEN_Y);
  const fadeStartMs=entry.evictedAtMs===undefined?settleMs:Math.min(settleMs,Math.max(0,entry.evictedAtMs-entry.hitCommitMs));
  const fadeMs=tuning.aftermathEvictedFadeMs;
  let alpha=1;
  if(elapsedMs>fadeStartMs){alpha=Math.max(0,1-(elapsedMs-fadeStartMs)/fadeMs);if(alpha<=0)return null;}
  const tSec=elapsedMs/1000;
  const x=spawn.x+launch.x*tSec;
  const y=spawn.y+launch.y*tSec-.5*g*tSec*tSec;
  const z=spawn.z+launch.z*tSec;
  // ONE continuous seeded tumble (the in-flight formula) for the whole fall — no settle branch,
  // hence no rotation snap at the old floor-contact moment.
  const phase=seedPhase(entry.seed,11)*Math.PI*2;
  const tumbleRate=tuning.aftermathSettledTumbleRadPerS*2.5;
  const rotationZRad=phase+tumbleRate*tSec;
  return Object.freeze({x,y,z,rotationZRad,alpha,settleMs,settled:false});
}
/** Build the bounded scene objects for one aftermath entry (Flow slice → two clip-plane halves, everything else one icon entity). Deterministic in (entry, nowMs, tuning). @param {AeroAftermathEntry} entry @param {number} nowMs @param {AeroRendererTuning} [tuning] @returns {AeroGameplaySceneObject[]} */
export function aftermathObjects(entry,nowMs,tuning=defaultRendererTuning){
  const elapsedMs=nowMs-entry.hitCommitMs;
  if(elapsedMs<0||!Number.isFinite(elapsedMs))return[];
  // 0.0.59 B13: for flow + punch corpses the color fallback must come from the NOTE'S
  // HAND (left/right → leftHandColor/rightHandColor), the same song-palette system boxing
  // already uses. The old per-family mapping sent flow to "neutral" → near-white
  // receptorColor, so a corpse without an appearanceColor (the Test-mode case) desaturated
  // to flat gray. Guard/obstacle/bomb/safe keep their per-family role (unchanged).
  const role=entry.family==="flow"||entry.family==="punch"?((entry.hand==="left"?"left":entry.hand==="right"?"right":"neutral")):(AFTERMATH_FAMILY_ROLE[entry.family]??"neutral");
  // 0.0.56 W2: the corpse is a cut-in-half of the NOTE'S ACTUAL ASSET (the entry's `shape`),
  // not a generic per-family default — directional notes keep the arrow glyph, directionless /
  // orb "any" notes keep the orb (B3/B9). Guard/obstacle/bomb/safe never carry a shape.
  const shapeAsset=(entry.family==="flow"||entry.family==="punch")?(AFTERMATH_SHAPE_ASSET[entry.shape]??""):"";
  const fallbackAsset=entry.family==="punch"?ASSET.arrow:AFTERMATH_FAMILY_ASSET[entry.family]??ASSET.circle;
  const asset=shapeAsset||fallbackAsset;
  if(entry.family==="flow"&&entry.mode==="slice"){
    const objects=[];
    for(const sign of[-1,1]){
      const pose=aftermathPose(entry,elapsedMs,tuning);
      if(pose===null)continue;
      const offsetX=aftermathSliceOffsetX(entry,sign,tuning);
      const halfPhase=seedPhase(entry.seed,sign===1?21:23)*Math.PI*.75;
      objects.push(aftermathSceneObject(`${entry.targetId}:aftermath:half${sign===1?"+":"-"}`,entry,role,pose.x+offsetX,pose.y,pose.z,pose.rotationZRad+halfPhase*Math.min(1,elapsedMs/120),pose.alpha,asset,elapsedMs,pose.settleMs,sign,offsetX));
    }
    return objects;
  }
  const pose=aftermathPose(entry,elapsedMs,tuning);
  if(pose===null)return[];
  return[aftermathSceneObject(`${entry.targetId}:aftermath:whole`,entry,role,pose.x,pose.y,pose.z,pose.rotationZRad,pose.alpha,asset,elapsedMs,pose.settleMs,null,0)];
}
/** @param {string} id @param {AeroAftermathEntry} entry @param {AeroVisualRole} role @param {number} x @param {number} y @param {number} z @param {number} rotationZRad @param {number} alpha @param {string|null} assetId @param {number} elapsedMs @param {number} settleMs @param {number|null} sliceSign @param {number} offsetXWU */
function aftermathSceneObject(id,entry,role,x,y,z,rotationZRad,alpha,assetId,elapsedMs,settleMs,sliceSign,offsetXWU){
  // 0.0.59 B14: single "flight" phase for the whole off-screen fall (no settled phase).
  const visual=Object.freeze({targetId:entry.targetId,family:entry.family,elapsedMs,settleMs,phase:"flight",sliceSign,offsetXWU});
  // 0.0.58 B11b: every aftermath "hit corpse" keeps the note's ACTUAL glyph (authored
  // white outline + the note's real fill tint) but DESATURATED: `appearanceColor` carries
  // the note's fill so the facade lerps the fill toward near-full grayscale (B10: live
  // notes keep full color; this applies to BOTH the slice halves and the whole aftermath).
  return sceneObject(id,"aftermath",role,entry.targetId,{x,y,z},{x:1,y:1,z:1},null,assetId,rotationZRad,alpha,null,0,false,true,null,null,z,28,null,null,null,entry.appearanceColor??null,visual);
}

// 0.0.52 W1-C — hazard-contact red vignette (dntq): one unlit fullscreen overlay, pure envelope.
/** Per-event envelope intensity for one elapsed ms value: linear ramp to full, linear decay to zero. @param {number} elapsedMs @param {AeroRendererTuning} [tuning] */
export function hazardContactEnvelopeIntensity(elapsedMs,tuning=defaultRendererTuning){
  if(!Number.isFinite(elapsedMs)||elapsedMs<=0)return 0;
  const rampMs=tuning.hazardGlowRampMs,decayMs=tuning.hazardGlowDecayMs;
  if(elapsedMs<=rampMs)return clamp(elapsedMs/rampMs,0,1);
  const d=(elapsedMs-rampMs)/decayMs;
  if(d>=1)return 0;
  return Math.max(0,1-d);
}
/** MAX-blend active envelopes across all events; bounded by the frame cap. @param {readonly number[]} elapsedPerEvent @param {AeroRendererTuning} [tuning] */
export function hazardContactIntensity(elapsedPerEvent,tuning=defaultRendererTuning){
  let max=0,active=0;
  for(const e of elapsedPerEvent){const v=hazardContactEnvelopeIntensity(e,tuning);if(v>max)max=v;if(v>0)active+=1;}
  return Object.freeze({intensity:max,activeCount:Math.min(AFTERMATH_MAX_HAZARD_EVENTS,active)});
}

// 0.0.54 W1-C — state-driven wall-contact vignette: pulse while the nose is inside an obstacle
// collider, decay after release. Pure in (nowMs, state, params); no retained state.
/**
 * One hazard-vignette parameter set: tuning defaults with present frame params overriding.
 * @param {AeroHazardVignetteParams|undefined} frameParams @param {AeroRendererTuning} [tuning]
 * @returns {{intensity:number,pulseHz:number,pulseDepth:number,rampMs:number,decayMs:number}}
 */
export function hazardVignetteParamsForFrame(frameParams,tuning=defaultRendererTuning){
  /** @type {AeroHazardVignetteParams} */ const frame=frameParams??/** @type {AeroHazardVignetteParams} */({});
  return Object.freeze({
    intensity:clamp(frame.intensity??tuning.hazardVignetteIntensity,0,1),
    pulseHz:clamp(frame.pulseHz??tuning.hazardVignettePulseHz,0,5),
    pulseDepth:clamp(frame.pulseDepth??tuning.hazardVignettePulseDepth,0,1),
    rampMs:clamp(frame.rampMs??tuning.hazardVignetteRampMs,0,1000),
    decayMs:clamp(frame.decayMs??tuning.hazardVignetteDecayMs,0,3000)
  });
}
/**
 * Active-phase wall-vignette intensity at absolute `nowMs`: linear ramp-in over `rampMs`, then a
 * cosine pulse between `intensity*(1-depth)` and `intensity` at `pulseHz` that starts at full
 * `intensity` when the ramp completes (the `(1-cos)/2` form is 0 at phase 0, so the ramp boundary
 * is continuous). Returns exactly 0 when not active.
 * @param {number} nowMs @param {AeroHazardContactActive} state @param {{intensity:number,pulseHz:number,pulseDepth:number,rampMs:number,decayMs:number}} [params]
 */
export function hazardWallContactActiveIntensity(nowMs,state,params){
  if(!state?.active||!Number.isFinite(nowMs))return 0;
  const p=params??hazardVignetteParamsForFrame(undefined);
  const sinceMs=state.sinceMs;
  if(typeof sinceMs!=="number"||!Number.isFinite(sinceMs)||sinceMs<0)return 0;
  const elapsedMs=nowMs-sinceMs;
  if(elapsedMs<=0)return 0;
  const ramp=clamp(elapsedMs/p.rampMs,0,1);
  const phaseMs=Math.max(0,elapsedMs-p.rampMs);
  // Cosine pulse in the time domain: one full cycle every 1000/pulseHz ms (phase angle 2π·t·Hz/1000).
  const pulse=1-p.pulseDepth*(1-Math.cos(Math.PI*2*p.pulseHz*phaseMs/1000))/2;
  return p.intensity*ramp*pulse;
}
/**
 * Released-phase wall-vignette intensity at absolute `nowMs`: the release-moment intensity
 * (recomputed statelessly with the active formula at `releasedAtMs`) times a linear decay to 0
 * over `decayMs`; exactly 0 once the decay completes or before the release instant.
 * @param {number} nowMs @param {AeroHazardContactActive} state @param {{intensity:number,pulseHz:number,pulseDepth:number,rampMs:number,decayMs:number}} [params]
 */
export function hazardWallContactReleasedIntensity(nowMs,state,params){
  if(state?.active||!Number.isFinite(nowMs))return 0;
  const p=params??hazardVignetteParamsForFrame(undefined);
  const releasedAtMs=state?.releasedAtMs;
  if(typeof releasedAtMs!=="number"||!Number.isFinite(releasedAtMs)||releasedAtMs<0)return 0;
  // Note: no `nowMs < releasedAtMs` early-out — the spec formula is evaluated from the release
  // instant itself (continuous with the active phase at the exact exit tick).
  const elapsedMs=nowMs-releasedAtMs;
  if(elapsedMs<0||elapsedMs>=p.decayMs)return 0;
  return hazardWallContactActiveIntensity(releasedAtMs,{active:true,sinceMs:state.sinceMs,releasedAtMs},p)*(1-elapsedMs/p.decayMs);
}
/**
 * Pure wall-vignette intensity at absolute `nowMs` for one hazard-contact episode: active-phase
 * pulse while the nose is inside, released-phase decay after exit, 0 idle. The release-moment
 * pulse phase is a pure function of (sinceMs, releasedAtMs, params) — no retained state.
 * @param {number} nowMs @param {AeroHazardContactActive|null|undefined} state @param {{intensity:number,pulseHz:number,pulseDepth:number,rampMs:number,decayMs:number}} [params]
 */
export function hazardWallContactIntensity(nowMs,state,params){
  if(state===null||state===undefined)return 0;
  if(!Number.isFinite(nowMs))return 0;
  const p=params??hazardVignetteParamsForFrame(undefined);
  if(state.active)return hazardWallContactActiveIntensity(nowMs,state,p);
  return hazardWallContactReleasedIntensity(nowMs,state,p);
}
/** Strict plain-data admission for one hazard-contact active state (exact own enumerable data keys; bounded numbers). @param {unknown} value */
function isValidHazardContactActive(value){
  if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(value);
  if(keys.length!==3||!keys.includes("active")||!keys.includes("sinceMs")||!keys.includes("releasedAtMs"))return false;
  const active=Object.getOwnPropertyDescriptor(value,"active"),since=Object.getOwnPropertyDescriptor(value,"sinceMs"),released=Object.getOwnPropertyDescriptor(value,"releasedAtMs");
  if(!active||!("value"in active)||typeof active.value!=="boolean")return false;
  const checkMs=(descriptor)=>{if(!descriptor||!("value"in descriptor))return false;const v=descriptor.value;return v===null||(typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=86_400_000);};
  if(!checkMs(since)||!checkMs(released))return false;
  // Active: sinceMs required (first contact of the current episode). Released: releasedAtMs
  // required (most recent exit); sinceMs stays present so the release-moment pulse phase remains
  // recomputable statelessly from (sinceMs, releasedAtMs, params).
  if(active.value){if(since.value===null)return false;}
  else{if(released.value===null)return false;if(typeof released.value==="number"&&since.value!==null&&released.value<since.value)return false;}
  return true;
}
/** Strict plain-data admission for one hazard-vignette params record (exact own enumerable data keys; bounded numbers). @param {unknown} value */
function isValidHazardVignetteParams(value){
  if(value===null||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)return false;
  const keys=Reflect.ownKeys(value);
  const expected=["intensity","pulseHz","pulseDepth","rampMs","decayMs"];
  if(keys.length!==5||!expected.every((key)=>keys.includes(key)))return false;
  const check=(key,min,max)=>{const d=Object.getOwnPropertyDescriptor(value,key);return Boolean(d&&"value"in d&&typeof d.value==="number"&&Number.isFinite(d.value)&&d.value>=min&&d.value<=max);};
  return check("intensity",0,1)&&check("pulseHz",0,5)&&check("pulseDepth",0,1)&&check("rampMs",0,1000)&&check("decayMs",0,3000);
}
/** @param {{intensity:number,activeCount:number}} glow */
function hazardGlowObject(glow){
  if(glow.intensity<=0)return null;
  return sceneObject("hazard-glow","hazard_glow","obstacle",null,{x:0,y:0,z:0},{x:1,y:1,z:1},"hazard_vignette",null,0,glow.intensity,null,1,true,null,null,0,55,null,null,null,null,null,glow);
}
/** @param {{intensity:number,activeCount:number}} glow @param {AeroRendererTuning} [tuning] */
function hazardGlowVisual(glow,tuning=defaultRendererTuning){
  return Object.freeze({present:glow.intensity>0,activeCount:glow.activeCount,intensity:glow.intensity,rampMs:tuning.hazardGlowRampMs,decayMs:tuning.hazardGlowDecayMs});
}
/** Validate a bounded, plain-data aftermath entries list without invoking accessors. @param {unknown} value */
function isValidAftermathList(value){
  if(!Array.isArray(value)||value.length>AFTERMATH_MAX_ENTRIES)return false;
  return value.every((entry)=>{
    if(entry===null||typeof entry!=="object"||Array.isArray(entry)||Object.getPrototypeOf(entry)!==Object.prototype)return false;
    const keys=Reflect.ownKeys(entry).filter((k)=>typeof k==="string");
    if(!["targetId","hitCommitMs","family","hand","mode","spawn","seed"].every((key)=>keys.includes(key))||keys.some((key)=>!["targetId","hitCommitMs","family","hand","mode","spawn","seed","shape","appearanceColor","evictedAtMs"].includes(key)))return false;
    const own=(key)=>{const descriptor=Object.getOwnPropertyDescriptor(entry,key);return descriptor&&"value" in descriptor?descriptor.value:undefined;};
    if(typeof own("targetId")!=="string"||String(own("targetId")).length<1||String(own("targetId")).length>128)return false;
    if(typeof own("hitCommitMs")!=="number"||!Number.isFinite(own("hitCommitMs"))||own("hitCommitMs")<0)return false;
    const family=own("family");if(!["flow","punch","guard","obstacle","bomb","safe"].includes(family))return false;
    if(!["left","right","both","neutral"].includes(own("hand")))return false;
    if(!["straight","hook","uppercut","single","slice","bonk"].includes(own("mode")))return false;
    const spawn=own("spawn");if(spawn===null||typeof spawn!=="object"||Object.getPrototypeOf(spawn)!==Object.prototype)return false;
    const spawnKeys=Reflect.ownKeys(spawn);
    if(!["x","y","z"].every((key)=>spawnKeys.includes(key))||spawnKeys.length!==3)return false;
    for(const axis of["x","y","z"]){const descriptor=Object.getOwnPropertyDescriptor(spawn,axis);if(!descriptor||!("value" in descriptor)||typeof descriptor.value!=="number"||!Number.isFinite(descriptor.value))return false;}
    if(typeof own("seed")!=="number"||!Number.isInteger(own("seed")))return false;
    // 0.0.56 W2: optional `shape` — the hit note's actual glyph ("arrow" | "orb"). Absent = legacy
    // (renderer falls back to the per-family default).
    if(Object.hasOwn(entry,"shape")){const shape=own("shape");if(shape!=="arrow"&&shape!=="orb")return false;}
    // 0.0.58 B11b: optional `appearanceColor` — the note's REAL validated fill
    // token (canonical uppercase `#RRGGBB`) so the corpse can be rendered as a
    // DESATURATED version of the actual glyph instead of a flat uniform gray.
    if(Object.hasOwn(entry,"appearanceColor")){const color=own("appearanceColor");if(typeof color!=="string"||!/^#[0-9A-F]{6}$/u.test(color))return false;}
    if(Object.hasOwn(entry,"evictedAtMs")){const ev=own("evictedAtMs");if(typeof ev!=="number"||!Number.isFinite(ev)||ev<own("hitCommitMs"))return false;}
    if(family==="punch"){if(own("hand")!=="left"&&own("hand")!=="right")return false;if(own("mode")!=="straight"&&own("mode")!=="hook"&&own("mode")!=="uppercut")return false;}
    if(family==="guard"&&own("mode")!=="bonk")return false;
    if(family==="flow"&&own("mode")!=="single"&&own("mode")!=="slice")return false;
    if((family==="obstacle"||family==="bomb"||family==="safe")&&own("mode")!=="single")return false;
    return true;
  });
}
// 0.0.53 W2 — debug-visibility overlays (visible tolerance range cone + collider radius square).
// Pure per-frame functions of (frame, targets, collider settings). Both overlays are OFF by default
// (absent frame fields → default false) and produce zero scene objects when off.

/** @typedef {Readonly<{visibleToleranceRange:boolean,visibleColliderRadius:boolean,colliderRadius:number,directionToleranceDegrees:number}>} AeroColliderOverlaySettings */

/**
 * Authoritative 8-way authored direction → world unit vector (X-Y plane). Mirrors
 * `aerobeat-web-gameplay` `authoredDirectionCone` semantics: `up` = +Y. World X-Y is exactly the
 * athlete-grid plane under the default top-down camera.
 * @param {import("@aerobeat/web-contracts/body-grid-contracts").AeroBodyGridDirection} direction
 * @returns {{x:number,y:number}}
 */
export function directionUnitVector(direction){
  const vectors=new Map([["up",[0,1]],["up-right",[Math.SQRT1_2,Math.SQRT1_2]],["right",[1,0]],["down-right",[Math.SQRT1_2,-Math.SQRT1_2]],["down",[0,-1]],["down-left",[-Math.SQRT1_2,-Math.SQRT1_2]],["left",[-1,0]],["up-left",[-Math.SQRT1_2,Math.SQRT1_2]]]);
  const vector=vectors.get(direction);
  if(!vector)throw new TypeError("Gameplay direction is unsupported");
  return Object.freeze({x:vector[0],y:vector[1]});
}

/**
 * Normalize the optional 0.0.53 per-frame collider-overlay fields. Absent → defaults
 * (visibleToleranceRange=false, visibleColliderRadius=false, colliderRadius=0.12,
 * directionToleranceDegrees=45). Present values must be strictly boolean/finite and in the
 * gameplay bounds (radius 0..0.5, tolerance 0..90).
 * @param {AeroGameplayFrame} frame
 * @returns {AeroColliderOverlaySettings}
 */
export function normalizeColliderOverlay(frame){
  const readBool=(value)=>value===undefined?false:typeof value==="boolean"?value:(()=>{throw new TypeError("Collider overlay flag must be boolean");})();
  const readNumber=(value,fallback,bounds)=>value===undefined?fallback:typeof value==="number"&&Number.isFinite(value)&&value>=bounds[0]&&value<=bounds[1]?value:(()=>{throw new TypeError("Collider overlay number is invalid");})();
  return Object.freeze({
    visibleToleranceRange:readBool(frame.visibleToleranceRange),
    visibleColliderRadius:readBool(frame.visibleColliderRadius),
    colliderRadius:readNumber(frame.colliderRadius,DEFAULT_COLLIDER_RADIUS,[0,0.5]),
    directionToleranceDegrees:readNumber(frame.directionToleranceDegrees,DEFAULT_DIRECTION_TOLERANCE_DEGREES,[0,90])
  });
}

/**
 * Closed-form sector geometry for one tolerance cone: a triangle fan from the target center
 * spanning the entry arc (2×`toleranceDegrees` around the authored `direction` unit vector).
 * The fan is a full sector from the center to `radius`; every vertex carries the plane Z given by
 * the optional `z` argument (default 0), so the sector can ride a moving beat. The target
 * footprint (inflated square, half-extent `innerRadius`) is drawn separately as a small disc.
 * Returns flat position arrays (x,y,z per vertex) and the fan index list.
 * @param {number} cx @param {number} cy @param {{x:number,y:number}} direction @param {number} toleranceDegrees @param {number} radius @param {number} [steps] @param {number} [z]
 * @returns {{positions:Float32Array,indices:Uint16Array,vertexCount:number,triangleCount:number}}
 */
export function toleranceConeGeometry(cx,cy,direction,toleranceDegrees,radius,steps=TOLERANCE_CONE_ARC_STEPS,z=0){
  const base=Math.atan2(direction.y,direction.x),half=toleranceDegrees*Math.PI/180;
  const startAngle=base+half,endAngle=base-half;
  const positions=new Float32Array((steps+2)*3),indices=new Uint16Array(steps*3);
  positions[0]=cx;positions[1]=cy;positions[2]=z;
  for(let i=0;i<=steps;i+=1){
    const angle=startAngle+((endAngle-startAngle)*i)/steps,off=(i+1)*3;
    positions[off]=cx+radius*Math.cos(angle);
    positions[off+1]=cy+radius*Math.sin(angle);
    positions[off+2]=z;
  }
  let cursor=0;
  for(let i=0;i<steps;i+=1){indices[cursor++]=0;indices[cursor++]=1+i;indices[cursor++]=2+i;}
  return Object.freeze({positions,indices,vertexCount:positions.length/3,triangleCount:steps});
}

/**
 * Build the bounded scene objects for the two debug overlays from the sorted, visible targets.
 * Returns an empty array when both overlay flags are off (zero cost).
 * 0.0.54 W1-C: every overlay (collider square, tolerance-cone fan + target-point marker) rides the
 * approaching beat's travel depth. 0.0.55 W3: the anchor is the note icon's ACTUAL rendered position
 * (`iconRenderPosition` — base X/Y + bounce/sky Y offset + state Z), so the triangle, point, and
 * square stay locked to the glyph through the bounce, sky prelude, and miss instead of lagging at
 * the base position. The small camera-side `COLLIDER_OVERLAY_CAM_OFFSET_WU` is added to the icon's
 * rendered Z (as before); the cone fan geometry is built at that same Z (all vertices carry it),
 * and the facade renders these with depth-test off so they stay visible on top of the beat glyph.
 * 0.0.56 W1 (B2): the overlay is gated on the target's live state (`targetState`) — it draws only
 * while the beat is still active (pending/approaching) and DISAPPEARS the instant it resolves
 * (hit or miss, or spent past the window), mirroring the icon's own resolution gate.
 * @param {AeroGameplayFrame} frame @param {readonly AeroRenderableTarget[]} sorted @param {AeroColliderOverlaySettings} overlay
 * @returns {AeroGameplaySceneObject[]}
 */
export function colliderOverlayObjects(frame,sorted,overlay){
  if(!overlay.visibleToleranceRange&&!overlay.visibleColliderRadius)return[];
  /** @type {AeroGameplaySceneObject[]} */ const objects=[];
  const halfExtent=TARGET_HALF_EXTENT+overlay.colliderRadius;
  const reach=normalizeFrameRowReach(frame.rowReach);
  const window=timingWindow(frame);
  for(const target of sorted){
    // 0.0.56 W1 (B2): the collider/tolerance overlay is a LIVE targeting aid — it must
    // DISAPPEAR the moment the beat resolves (hit or miss). Mirror the icon's own
    // resolution gate (`targetState`): skip any target whose state is `hit` or `miss`
    // (judgement-set, or past the timing window → `spent`). The overlay only draws for
    // targets still "active" (pending/approaching, not yet resolved), so it no longer
    // lingers over the aftermath slice after the beat is judged.
    const targetInterval=target.kind==="obstacle"?obstacleInterval(target):Object.freeze({startMs:target.beatCenterMs,endMs:target.beatCenterMs});
    const state=targetState(target,frame.nowMs,targetInterval,window);
    if(state==="hit"||state==="miss"||state==="spent")continue;
    // Only directional notes carry a tolerance cone; collider squares draw for every visible target.
    const direction=target.direction?directionUnitVector(target.direction):null;
    const anchor=iconRenderPosition(frame,target,defaultRendererTuning,defaultTestPresentationConfig,reach);
    const z=anchor.z+COLLIDER_OVERLAY_CAM_OFFSET_WU;
    if(overlay.visibleColliderRadius){
      const visual=Object.freeze({halfExtent});
      objects.push(sceneObject(`${target.id}:collider:0`,"collider_square","neutral",target.id,{x:anchor.x,y:anchor.y,z},{x:halfExtent*2,y:halfExtent*2,z:0.012},null,null,0,COLLIDER_SQUARE_ALPHA,null,0,true,null,null,z,45,null,null,null,null,COLLIDER_SQUARE_COLOR,visual));
    }
    if(overlay.visibleToleranceRange&&direction){
      const geometry=toleranceConeGeometry(anchor.x,anchor.y,direction,overlay.directionToleranceDegrees,TOLERANCE_CONE_RADIUS_WU,TOLERANCE_CONE_ARC_STEPS,z);
      const visual=Object.freeze({directionX:direction.x,directionY:direction.y,toleranceDegrees:overlay.directionToleranceDegrees,innerRadius:halfExtent,radius:TOLERANCE_CONE_RADIUS_WU,positions:geometry.positions,indices:geometry.indices,vertexCount:geometry.vertexCount,triangleCount:geometry.triangleCount});
      objects.push(sceneObject(`${target.id}:tolerance:0`,"tolerance_cone","neutral",target.id,{x:anchor.x,y:anchor.y,z},{x:1,y:1,z:1},null,null,0,TOLERANCE_CONE_ALPHA,null,0,true,null,null,z,46,null,null,null,null,TOLERANCE_CONE_COLOR,visual));
      // Small target-point marker at the center (distinct, high-alpha disc).
      objects.push(sceneObject(`${target.id}:target-point:0`,"tolerance_cone","neutral",target.id,{x:anchor.x,y:anchor.y,z},{x:0.06,y:0.06,z:0.06},null,null,0,TARGET_MARKER_ALPHA,null,0,true,null,null,z,47,null,null,null,null,TARGET_MARKER_COLOR,null));
    }
  }
  return objects;
}

/** @param {AeroColliderOverlaySettings} overlay @param {AeroGameplaySceneObject[]} objects @returns {AeroColliderOverlayVisual} */
function colliderOverlayVisual(overlay,objects){
  let coneCount=0,squareCount=0;
  for(const object of objects){if(object.kind==="collider_square")squareCount+=1;else if(object.kind==="tolerance_cone"&&object.aftermath&&"directionX" in object.aftermath)coneCount+=1;}
  return Object.freeze({visibleToleranceRange:overlay.visibleToleranceRange,visibleColliderRadius:overlay.visibleColliderRadius,colliderRadius:overlay.colliderRadius,directionToleranceDegrees:overlay.directionToleranceDegrees,coneCount,squareCount});
}

/** Validate a bounded, plain-data hazard contact events list. @param {unknown} value */
function isValidHazardContactList(value){
  if(!Array.isArray(value)||value.length>AFTERMATH_MAX_HAZARD_EVENTS)return false;
  return value.every((event)=>{
    if(event===null||typeof event!=="object"||Array.isArray(event)||Object.getPrototypeOf(event)!==Object.prototype)return false;
    const keys=Reflect.ownKeys(event);
    if(keys.length!==2||!keys.includes("eventId")||!keys.includes("atMs"))return false;
    const idDescriptor=Object.getOwnPropertyDescriptor(event,"eventId"),atDescriptor=Object.getOwnPropertyDescriptor(event,"atMs");
    return Boolean(idDescriptor&&"value" in idDescriptor&&typeof idDescriptor.value==="string"&&idDescriptor.value.length>=1&&idDescriptor.value.length<=128&&atDescriptor&&"value" in atDescriptor&&typeof atDescriptor.value==="number"&&Number.isFinite(atDescriptor.value)&&atDescriptor.value>=0);
  });
}
