// @ts-check

import * as pc from "playcanvas";
import { gloveGeometry, judgeToPresentationPoint, saberGeometry } from "@aerobeat/web-contracts/equipment-contracts";
import { isResolvedEquipmentPose } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { defaultTestPresentationConfig, normalizeTestPresentationConfig } from "./test-presentation-config.js";
import { defaultGameplayCameraPose, gameplayCameraPoseArtifactFilename, gameplayCameraPoseArtifactMimeType, normalizeGameplayCameraPose, serializeGameplayCameraPose } from "./gameplay-camera-pose.js";
import { defaultGameplayVisualExperimentConfig, normalizeGameplayVisualExperimentConfig } from "./gameplay-visual-experiment-config.js";
import { PlayCanvasEnvironmentAssetOwner } from "./environment-asset-owner.js";
import { PlayCanvasGameplayAssetPreloader } from "./gameplay-asset-loader.js";
import { gameplayAssetMaterialRole } from "./gameplay-assets.js";
import { normalizeIconAtlasData } from "./icon-atlas.js";
import { mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
import { AFTERMATH_CORPSE_DESATURATION, AFTERMATH_CORPSE_MIN_CHROMA, aftermathSliceGlyphLengthWU, buildGameplaySceneModel, defaultRendererThemeTokens, gameplayWorldGrid } from "./gameplay-scene-model.js";
import { colorTokenToRgba, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererVisualProfile, rendererTuningFromVisualProfile } from "./visual-profiles.js";

export const aeroPlayCanvasRendererServiceId="aero.renderer.playcanvas";
export const equipmentPoseContractsCommit="51c2b42805f5aa008386dc8bc779cfad8542af34";
const cursorRoles=Object.freeze(["nose","left_wrist","right_wrist"]);
const equipmentRoles=Object.freeze(["left_wrist","right_wrist"]);
const equipmentModes=Object.freeze(["flow","boxing"]);
// 0.0.60 F4: per-anchor dim for markers frozen by a tracking loss. The marker
// renders at this reduced alpha while its anchor is degraded; undimmed markers
// keep the historical alpha of 1 (byte-identical to the pre-F4 path).
export const CURSOR_LOST_DIM_ALPHA=0.45;
const internalEffectivePaletteSymbol=Symbol.for("aerobeat.web-renderer.internal-effective-palette");
/** @type {WeakMap<AeroPlayCanvasRenderer,Readonly<{left:string,right:string}>|null>} */
const effectiveMarkerPalettes=new WeakMap();
/** @type {WeakMap<AeroPlayCanvasRenderer,{offset:{x:number,y:number},lastTimeMs:number|null}>} */
const productionCameraStates=new WeakMap();
/** @type {WeakSet<AeroPlayCanvasRenderer>} */
const projectionReadyRenderers=new WeakSet();
const debugMovementIntents=Object.freeze(["forward","back","left","right","down","up"]);
const debugSpeedModes=Object.freeze(["normal","boost"]);
const debugMouseCaptureModes=Object.freeze(["pointer","fallback"]);
const debugKeyIntents=Object.freeze({KeyW:"forward",KeyS:"back",KeyA:"left",KeyD:"right",KeyQ:"down",KeyE:"up"});
const DEBUG_NORMAL_UNITS_PER_SECOND=3.5;
const DEBUG_BOOST_UNITS_PER_SECOND=12;
const DEBUG_MAX_DELTA_MS=100;
const DEBUG_TOUCH_TAP_MAX_MS=320;
const DEBUG_TOUCH_TAP_MAX_MOVE_PX=12;
const DEBUG_POSITION_BOUNDS=Object.freeze({x:40,yMin:-8,yMax:32,zMin:-72,zMax:32});
const PRODUCTION_CAMERA_MAX_DELTA_MS=100;
const GRID_COLUMN_PITCH=gameplayWorldGrid.columnX[1]-gameplayWorldGrid.columnX[0],GRID_ROW_PITCH=gameplayWorldGrid.rowY[0]-gameplayWorldGrid.rowY[1];
const GRID_LEFT=gameplayWorldGrid.columnX[0]-GRID_COLUMN_PITCH/2,GRID_RIGHT=gameplayWorldGrid.columnX.at(-1)+GRID_COLUMN_PITCH/2,GRID_TOP=gameplayWorldGrid.rowY[0]+GRID_ROW_PITCH/2,GRID_BOTTOM=gameplayWorldGrid.rowY.at(-1)-GRID_ROW_PITCH/2;
const DEBUG_EQUIPMENT_PLANE_Z=.45,DEBUG_EQUIPMENT_PROJECTION_EPSILON=1e-6;

/** One assembly-owned renderer and PlayCanvas Application per connected game. */
export class AeroPlayCanvasRenderer {
  constructor(options={}){
    this.serviceId=aeroPlayCanvasRendererServiceId;
    this.contextAttributes=options.contextAttributes??{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:false};
    this.canvas=null;this.app=null;this.appStarted=false;this.cameraEntity=null;this.fixedCamera=null;this.gameplayGridLayer=null;this.gameplayGuidanceLayer=null;this.gameplayTargetLayer=null;this.gameplayHazardGlowLayer=null;this.gameplayColliderOverlayLayer=null;this.pool=[];this.assetPools=new Map();this.assetPoolGeneration=-1;this.aftermathAssetPools=new Map();this.assetMaterials=new WeakMap();this.materialStates=new WeakMap();this.markerPool=[];this.markerPoolMode="none";this.equipmentPools=new Map();this.equipmentPoseRoots=new Map();this.equipmentGlbEntities=new Map();this.equipmentPrimitiveChildren=new Map();this.feedbackPool=[];this.feedbackTextures=new Map();this.activeCount=0;this.overlayEntities=[];this.entityMaterials=new WeakMap();this.ownedMaterials=new Set();this.sliceVariantMaterials=new Map();this.materialUidCounter=0;this.hazardGlowEntity=null;this.hazardGlowMaterial=null;
    this.iconAtlasData=null;this.iconEntries=new Map();this.iconTexture=null;this.iconAtlasError=null;this.atlasRestorePending=false;
    this.state="unsupported";this.contextLost=false;this.destroyed=false;this.errorMessage=null;this.frameCount=0;this.drawCount=0;this.contextRestoreCount=0;
    this.widthCssPx=0;this.heightCssPx=0;this.devicePixelRatio=1;this.theme=defaultRendererThemeTokens;this.visualProfile=defaultRendererVisualProfile;this.visualScales=null;this.tuning=rendererTuningFromVisualProfile(this.visualProfile);this.testPresentationConfig=defaultTestPresentationConfig;this.gameplayVisualExperimentConfig=defaultGameplayVisualExperimentConfig;this.productionCameraNow=typeof options.now==="function"?options.now:()=>globalThis.performance?.now?.()??Date.now();productionCameraStates.set(this,{offset:{x:0,y:0},lastTimeMs:null});
    effectiveMarkerPalettes.set(this,null);Object.defineProperty(this,internalEffectivePaletteSymbol,{configurable:false,enumerable:false,writable:false,value:Object.freeze((left,right)=>{if(this.destroyed)return this.describe();if(left===null&&right===null){effectiveMarkerPalettes.set(this,null);return this.describe();}if(!isOpaqueUppercaseColor(left)||!isOpaqueUppercaseColor(right))throw new TypeError("Effective marker palette is invalid");effectiveMarkerPalettes.set(this,Object.freeze({left,right}));return this.describe();})});
    this.themeId="aero.theme.default";this.themeVersion="1";this.themeHash="theme-default";this.background=normalizeBackgroundProjection(null);this.lastModel=null;this.sceneDiagnostics=emptySceneDiagnostics();
    /** @type {{instanceCount:number,assetId:string,roles:readonly string[],depthTest:boolean,depthWrite:boolean,sourceMode?:string}} */
    this.cursorDiagnostics=Object.freeze({instanceCount:0,assetId:"athlete-marker/sphere-v1",roles:Object.freeze([]),depthTest:true,depthWrite:true});
    /** @type {{instanceCount:number,roles:readonly string[],modes:readonly string[],depthTest:boolean,depthWrite:boolean,assetMode?:string}} */
    this.equipmentDiagnostics=Object.freeze({instanceCount:0,roles:Object.freeze([]),modes:Object.freeze([]),depthTest:true,depthWrite:false});
    this.debugEnabled=false;this.debugCameraAuthoringInputEnabled=true;this.debugYaw=defaultGameplayCameraPose.rotationEulerDegrees.yYaw*Math.PI/180;this.debugPitch=defaultGameplayCameraPose.rotationEulerDegrees.xPitch*Math.PI/180;this.debugPosition={...defaultGameplayCameraPose.position};this.debugProjection={...defaultGameplayCameraPose.projection};this.debugListeners=[];
    this.debugNow=typeof options.now==="function"?options.now:()=>globalThis.performance?.now?.()??Date.now();this.debugLastFrameTimeMs=null;
    this.debugKeyboardIntents=new Set();this.debugDomIntents=new Set();this.debugShiftActive=false;this.debugGuiSpeedMode="normal";this.debugCaptureMode="none";this.debugTouchToggle=null;this.debugTouchDrag=null;
    this.debugCaptureCursor=null;this.debugCaptureReleasePending=null;this.debugPointerLockRequest=null;this.debugReleaseListener=null;this.debugReleaseWaiters=[];
    this.gameplayAssetLoader=options.gameplayAssetLoader??new PlayCanvasGameplayAssetPreloader({fetch:options.fetch,baseUrl:options.gameplayAssetBaseUrl});this.gameplayAssetLoadPromise=null;
    this.environmentOwner=options.environmentOwner??new PlayCanvasEnvironmentAssetOwner({fetch:options.fetch,decodeImage:options.environmentDecodeImage,createSphere:options.environmentCreateSphere,locationHref:options.locationHref});this.environmentLoadPromise=null;
    this.onContextLost=(event)=>{event.preventDefault();this.resetProductionCameraParallax();this.contextLost=true;projectionReadyRenderers.delete(this);this.state="context_lost";this.atlasRestorePending=Boolean(this.iconAtlasData);this.iconTexture?.destroy();this.iconTexture=null;this.destroyInstantiatedPools();this.environmentOwner.handleContextLost();this.gameplayAssetLoader.handleContextLost();};
    this.onContextRestored=()=>{if(this.destroyed||!this.app)return;this.resetProductionCameraParallax();this.contextLost=false;projectionReadyRenderers.delete(this);this.contextRestoreCount+=1;this.state="ready";this.gameplayAssetLoadPromise=this.gameplayAssetLoader.preload(this.app);this.environmentLoadPromise=this.environmentOwner.restore(this.app);};
  }
  attach(canvas,options=this.contextAttributes){
    if(this.destroyed)return this.describe();
    if(this.canvas===canvas&&this.app)return this.describe();
    this.detach();this.canvas=canvas;this.contextAttributes=options;projectionReadyRenderers.delete(this);
    canvas.addEventListener("webglcontextlost",this.onContextLost);canvas.addEventListener("webglcontextrestored",this.onContextRestored);
    try{
      this.app=new pc.Application(canvas,{graphicsDeviceOptions:{...options,alpha:true}});
      this.app.scene.ambientLight=new pc.Color(0.85,0.88,0.95);
      this.app.scene.exposure=1;
      this.cameraEntity=new pc.Entity("aero-athlete-camera",this.app);
      this.cameraEntity.addComponent("camera",{clearColor:new pc.Color(0,0,0,0),clearColorBuffer:true,clearDepthBuffer:true,fov:defaultGameplayCameraPose.projection.verticalFovDegrees,nearClip:defaultGameplayCameraPose.projection.nearClip,farClip:defaultGameplayCameraPose.projection.farClip});
      this.app.root.addChild(this.cameraEntity);this.createGameplayLayers();this.resetDebugCamera();
      if(this.iconAtlasData)this.createAtlasTexture();
      this.app.requestAnimationFrame=()=>{};
      this.gameplayAssetLoadPromise=this.gameplayAssetLoader.preload(this.app);this.environmentLoadPromise=this.environmentOwner.attach(this.app);
      this.state="ready";this.errorMessage=null;
      if(this.widthCssPx||this.heightCssPx)this.applySize();
    }catch(error){this.fail(error);}
    return this.describe();
  }
  detach(){
    this.setDebugCameraEnabled(false);this.debugCameraAuthoringInputEnabled=true;
    if(this.canvas){this.canvas.removeEventListener("webglcontextlost",this.onContextLost);this.canvas.removeEventListener("webglcontextrestored",this.onContextRestored);}
    this.destroyInstantiatedPools();this.destroyHazardGlow();this.environmentOwner.dispose();this.environmentLoadPromise=null;this.gameplayAssetLoader.dispose();this.gameplayAssetLoadPromise=null;for(const material of this.ownedMaterials)material.destroy();this.ownedMaterials.clear();this.materialStates=new WeakMap();
    const app=this.app;this.removeGameplayLayers();this.app=null;this.appStarted=false;this.cameraEntity=null;this.pool=[];this.assetPools=new Map();this.markerPool=[];this.markerPoolMode="none";this.equipmentPools=new Map();this.equipmentPoseRoots=new Map();this.equipmentGlbEntities=new Map();this.equipmentPrimitiveChildren=new Map();this.feedbackPool=[];this.feedbackTextures=new Map();this.overlayEntities=[];this.iconTexture=null;this.atlasRestorePending=false;this.activeCount=0;this.sceneDiagnostics=emptySceneDiagnostics();this.cursorDiagnostics=Object.freeze({instanceCount:0,assetId:"athlete-marker/sphere-v1",roles:Object.freeze([]),depthTest:true,depthWrite:true});this.equipmentDiagnostics=Object.freeze({instanceCount:0,roles:Object.freeze([]),modes:Object.freeze([]),depthTest:true,depthWrite:false});
    if(app){try{app.destroy();}catch{}}
    this.canvas=null;this.contextLost=false;projectionReadyRenderers.delete(this);this.testPresentationConfig=defaultTestPresentationConfig;this.gameplayVisualExperimentConfig=defaultGameplayVisualExperimentConfig;this.resetProductionCameraParallax();effectiveMarkerPalettes.set(this,null);if(!this.destroyed)this.state="unsupported";return this.describe();
  }
  resize(size){if(!this.canvas||this.destroyed)return this.describe();this.widthCssPx=finiteNonNegative(size.widthCssPx);this.heightCssPx=finiteNonNegative(size.heightCssPx);const cap=Math.max(1,Math.min(size.maxDevicePixelRatio??this.tuning.dprCap,this.tuning.dprCap));this.devicePixelRatio=Math.max(0.1,Math.min(Number.isFinite(size.devicePixelRatio)?size.devicePixelRatio:1,cap));this.applySize();return this.describe();}
  applySize(){if(!this.canvas)return;const width=Math.max(1,Math.round(this.widthCssPx*this.devicePixelRatio)),height=Math.max(1,Math.round(this.heightCssPx*this.devicePixelRatio));this.canvas.style.width=`${this.widthCssPx}px`;this.canvas.style.height=`${this.heightCssPx}px`;this.canvas.width=width;this.canvas.height=height;if(this.app){this.app.setCanvasFillMode(pc.FILLMODE_NONE,this.widthCssPx,this.heightCssPx);this.app.setCanvasResolution(pc.RESOLUTION_FIXED,width,height);this.app.graphicsDevice.resizeCanvas(width,height);}}
  setTheme(descriptor){if(this.destroyed)return this.describe();const normalized=normalizeRendererTheme(descriptor);const accepted=isThemeDescriptor(descriptor)&&normalized!==defaultRendererThemeTokens;this.theme=normalized;this.themeId=accepted?descriptor.id:"aero.theme.default";this.themeVersion=accepted?descriptor.themeVersion:"1";this.themeHash=accepted?descriptor.contentHash.value:"theme-default";return this.describe();}
  setTuning(value){return this.importTuning(value);}
  importTuning(value){if(this.destroyed)return this.describe();this.visualProfile=normalizeRendererVisualProfile(value);this.tuning=rendererTuningFromVisualProfile(this.visualProfile,this.visualScales);return this.describe();}
  setVisualScales(scales){if(scales===null||scales===undefined)this.visualScales=null;else if(typeof scales==="object"){const record=Object.create(null);for(const key of Object.keys(/** @type {Record<string,unknown>} */(scales)))record[key]=/** @type {Record<string,unknown>} */(scales)[key];this.visualScales=record;}else throw new TypeError("Visual scales must be a plain percent record or null");for(const key of["noteScalePercent","obstacleScalePercent","bombScalePercent","markerScalePercent"]){const raw=this.visualScales?.[key];if(raw!==undefined&&(!Number.isFinite(Number(raw))||Number(raw)<10||Number(raw)>200))throw new TypeError(`Visual scale ${key} is out of bounds`);}this.tuning=rendererTuningFromVisualProfile(this.visualProfile,this.visualScales);return this.describe();}
  resetTuning(){if(!this.destroyed){this.visualProfile=defaultRendererVisualProfile;this.visualScales=null;this.tuning=rendererTuningFromVisualProfile(this.visualProfile);}return this.describe();}
  exportTuning(){return this.visualProfile;}
  setTestPresentationConfig(value){const normalized=normalizeTestPresentationConfig(value);if(this.destroyed)return this.describe();this.testPresentationConfig=normalized;return this.describe();}
  resetTestPresentationConfig(){if(!this.destroyed)this.testPresentationConfig=defaultTestPresentationConfig;return this.describe();}
  setGameplayVisualExperimentConfig(value){const normalized=normalizeGameplayVisualExperimentConfig(value);if(!this.destroyed){this.gameplayVisualExperimentConfig=normalized;this.resetProductionCameraParallax();}return this.describe();}
  resetGameplayVisualExperimentConfig(){if(!this.destroyed){this.gameplayVisualExperimentConfig=defaultGameplayVisualExperimentConfig;this.resetProductionCameraParallax();}return this.describe();}
  getSnapshot(){return this.describe();}
  setBackgroundProjection(value){if(!this.destroyed)this.background=normalizeBackgroundProjection(value);return this.describe();}
  setEnvironmentAsset(descriptor){if(this.destroyed)return this.describe();this.environmentLoadPromise=this.environmentOwner.setDescriptor(descriptor);return this.describe();}
  setEnvironmentTransform(transform){if(!this.destroyed)this.environmentOwner.setTransform(transform);return this.describe();}
  setEnvironmentVisible(visible){if(!this.destroyed)this.environmentOwner.setVisible(visible);return this.describe();}
  uploadIconAtlas(atlas){if(this.destroyed)return this.describe();try{this.iconAtlasData=normalizeIconAtlasData(atlas);this.iconEntries=new Map(this.iconAtlasData.entries.map((entry)=>[entry.id,entry]));this.iconAtlasError=null;if(this.app)this.createAtlasTexture();}catch(error){this.iconAtlasData=null;this.iconEntries.clear();this.iconTexture?.destroy();this.iconTexture=null;this.iconAtlasError=error instanceof Error?error.message:"Icon atlas is invalid";}return this.describe();}
  createAtlasTexture(){if(!this.app||!this.iconAtlasData)return;this.iconTexture?.destroy();const atlas=this.iconAtlasData;const texture=new pc.Texture(this.app.graphicsDevice,{name:"aero-icon-atlas",width:atlas.width,height:atlas.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});const pixels=texture.lock();pixels.set(atlas.pixels);texture.unlock();this.iconTexture=texture;}
  /**
   * Private synchronous Visual-Test query. Inverts the live camera projection at
   * the equipment plane without rendering or changing renderer/input state.
   * @param {number} clientX CSS client X coordinate.
   * @param {number} clientY CSS client Y coordinate.
   * @returns {Readonly<{x:number,y:number}>|null}
   */
  projectDebugEquipmentAnchor(clientX,clientY){
    if(!Number.isFinite(clientX)||!Number.isFinite(clientY)||this.destroyed||this.contextLost||this.state!=="running"||!projectionReadyRenderers.has(this))return null;
    const canvas=this.canvas,app=this.app,cameraEntity=this.cameraEntity,camera=cameraEntity?.camera;
    if(!canvas||!app||!cameraEntity||!camera||cameraEntity.enabled===false||camera.enabled===false||typeof canvas.getBoundingClientRect!=="function")return null;
    try{
      const box=canvas.getBoundingClientRect(),deviceBox=app.graphicsDevice?.clientRect,rect=camera.rect;
      if(![box.left,box.top,box.width,box.height,deviceBox?.width,deviceBox?.height,rect?.x,rect?.y,rect?.z,rect?.w,camera.nearClip,camera.farClip].every(Number.isFinite)||box.width<=0||box.height<=0||deviceBox.width<=0||deviceBox.height<=0||rect.z<=0||rect.w<=0||rect.x<0||rect.y<0||rect.x+rect.z>1||rect.y+rect.w>1||camera.nearClip<0||camera.farClip<=camera.nearClip)return null;
      const localCssX=clientX-box.left,localCssY=clientY-box.top,normalizedX=localCssX/box.width,normalizedY=localCssY/box.height;
      const viewportLeft=rect.x,viewportRight=rect.x+rect.z,viewportTop=1-rect.y-rect.w,viewportBottom=1-rect.y;
      if(normalizedX<viewportLeft-DEBUG_EQUIPMENT_PROJECTION_EPSILON||normalizedX>viewportRight+DEBUG_EQUIPMENT_PROJECTION_EPSILON||normalizedY<viewportTop-DEBUG_EQUIPMENT_PROJECTION_EPSILON||normalizedY>viewportBottom+DEBUG_EQUIPMENT_PROJECTION_EPSILON)return null;
      const screenX=normalizedX*deviceBox.width,screenY=normalizedY*deviceBox.height,near=camera.screenToWorld(screenX,screenY,camera.nearClip,new pc.Vec3()),far=camera.screenToWorld(screenX,screenY,camera.farClip,new pc.Vec3());
      if(![near.x,near.y,near.z,far.x,far.y,far.z].every(Number.isFinite))return null;
      const rayZ=far.z-near.z;if(Math.abs(rayZ)<=DEBUG_EQUIPMENT_PROJECTION_EPSILON)return null;
      const t=(DEBUG_EQUIPMENT_PLANE_Z-near.z)/rayZ;if(!Number.isFinite(t)||t<0)return null;
      const worldX=near.x+(far.x-near.x)*t,worldY=near.y+(far.y-near.y)*t;
      if(!Number.isFinite(worldX)||!Number.isFinite(worldY))return null;
      const x=(worldX-GRID_LEFT)/(GRID_RIGHT-GRID_LEFT),y=(GRID_TOP-worldY)/(GRID_TOP-GRID_BOTTOM);
      return Number.isFinite(x)&&Number.isFinite(y)?Object.freeze({x,y}):null;
    }catch{return null;}
  }
  renderGameplayFrame(frame){return this.renderGameplayScene(frame,null,null,null);}
  renderGameplayFrameWithCursors(frame,cursors,options){return this.renderGameplayScene(frame,cursors,options,null);}
  /**
   * Stages strict collision-authoritative equipment pose records after scene objects and cursors.
   * Each record carries role, mode, judge-space anchor, positive uniform scale, normalized
   * orientation quaternion, geometry identity, and locked config identity. Legacy scalar and
   * heading fields are rejected by the narrow adapter below.
   * @param {import("./gameplay-scene-model.js").AeroGameplayFrame} frame
   * @param {ReadonlyArray<Readonly<{role:string,x:number,y:number,confidence:number,dimmed?:boolean}>>|null} cursors
   * @param {unknown} cursorOptions
   * @param {ReadonlyArray<unknown>|null} equipment
   * @param {unknown} equipmentOptions
   */
  renderGameplayFrameWithCursorsAndEquipment(frame,cursors,cursorOptions,equipment,equipmentOptions){return this.renderGameplayScene(/** @type {import("./gameplay-scene-model.js").AeroGameplayFrame} */(frame),cursors,cursorOptions,equipment,equipmentOptions);}
  renderGameplayScene(frame,cursors,cursorOptions,equipment,equipmentOptions){this.integrateDebugCameraMotion();const model=buildGameplaySceneModel(frame,this.theme,this.tuning,this.testPresentationConfig,this.gameplayVisualExperimentConfig),cameraDeflection=normalizeCameraDeflection(frame?.cameraDeflection??null);if(this.app&&!this.destroyed&&!this.contextLost)this.updateProductionCameraParallax(cameraDeflection);else this.resetProductionCameraParallax();this.lastModel=model;if(this.gameplayAssetLoader.describe().state==="error")this.gameplayAssetLoader.activateFallback("preload_error");if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),model,...(cursors===null?{}:{cursorCount:0,roles:Object.freeze([])}),...(equipment===null?{}:{equipmentCount:0,roles:Object.freeze([])})};try{this.clearOverlayEntities();this.applyCamera(model);this.updateSceneObjects(model.objects,model.guidance);this.applyClearColor();const cursorResult=cursors===null?null:(cursors.length===0?Object.freeze({cursorCount:0,roles:Object.freeze([])}):this.stageGameplayCursors(cursors,cursorOptions,false));const equipmentResult=equipment===null?null:(equipment.length===0?Object.freeze({equipmentCount:0,roles:Object.freeze([])}):this.stageGameplayEquipment(equipment,equipmentOptions,false));this.manualTick();this.frameCount+=1;this.drawCount+=model.objects.length+(cursorResult?.cursorCount??0)+(equipmentResult?.equipmentCount??0);this.state="running";return{status:this.describe(),model,...(cursorResult??{}),...(equipmentResult??{})};}catch(error){this.fail(error);return{status:this.describe(),model,...(cursors===null?{}:{cursorCount:0,roles:Object.freeze([])}),...(equipment===null?{}:{equipmentCount:0,roles:Object.freeze([])})};}}
  clear(options={}){if(!this.app||this.destroyed)return{status:this.describe()};const color=options.color??[0,0,0,0];this.cameraEntity.camera.clearColor=new pc.Color(...color);this.clearSceneObjects();this.clearOverlayEntities();this.manualTick();this.frameCount+=1;this.state="running";return{status:this.describe()};}
  renderFrame(options={}){return this.clear(options);}
  renderGameplayCursors(cursors,options){const result=this.stageGameplayCursors(cursors,options,true);if(!this.app||this.destroyed||this.contextLost)return Object.freeze({status:this.describe(),cursorCount:0,roles:Object.freeze([])});this.manualTick();this.drawCount+=result.cursorCount;this.state="running";return Object.freeze({status:this.describe(),...result});}
  stageGameplayCursors(cursors,options,clear){normalizeCursorGrid(options?.grid);if(!Array.isArray(cursors)||cursors.length>12)throw new TypeError("Gameplay cursors cannot exceed 12 candidates");const min=Math.max(0,Math.min(1,Number.isFinite(options?.minConfidence)?options.minConfidence:0.5));const accepted=new Map();for(const cursor of cursors){if(!plainData(cursor)||!(Object.keys(cursor).length===4||(Object.keys(cursor).length===5&&typeof cursor.dimmed==="boolean"))||!cursorRoles.includes(cursor.role)||accepted.has(cursor.role)||![cursor.x,cursor.y,cursor.confidence].every(Number.isFinite)||cursor.x<0||cursor.x>1||cursor.y<0||cursor.y>1||cursor.confidence<min)continue;accepted.set(cursor.role,cursor);}
    if(!this.app||this.destroyed||this.contextLost)return Object.freeze({cursorCount:0,roles:Object.freeze([])});
    if(clear)this.clearOverlayEntities();for(const entity of this.markerPool)entity.enabled=false;const roles=[];if(this.gameplayAssetLoader.describe().state==="error")this.gameplayAssetLoader.activateFallback("preload_error");const mode=this.gameplayAssetLoader.describe().state;
    const sizeCssPx=clamp(Number.isFinite(options?.sizeCssPx)?Number(options.sizeCssPx):18,8,64)*this.tuning.markerScaleFactor,markerScales=[];
    const effectivePalette=effectiveMarkerPalettes.get(this);for(const role of cursorRoles){const cursor=accepted.get(role);if(!cursor)continue;const position=gridPositionForNormalized(cursor.x,cursor.y,0.45),color=role==="nose"?"#F4C20D":role==="left_wrist"?(effectivePalette?.left??this.theme.leftHandColor):(effectivePalette?.right??this.theme.rightHandColor);let entity=null;if(mode==="ready")entity=this.acquireMarkerEntity(roles.length);else if(mode==="fallback")entity=this.acquireFallbackMarker(roles.length);if(!entity)continue;const worldScale=this.worldScaleForCssPx(sizeCssPx,position,mode==="ready"?.18:1);entity.enabled=true;entity.name=`cursor-${role}`;entity.setPosition(position.x,position.y,position.z);entity.setLocalScale(worldScale,worldScale,worldScale);entity.setEulerAngles(0,0,0);const cursorAlpha=cursor.dimmed===true?CURSOR_LOST_DIM_ALPHA:1;if(mode==="ready")this.applyAssetAppearance(entity,"athlete-marker/sphere-v1",color,cursorAlpha,false);else this.updateMaterial(entity,color,cursorAlpha,null,false,true);roles.push(role);markerScales.push(worldScale);}
    this.cursorDiagnostics=Object.freeze({instanceCount:roles.length,assetId:"athlete-marker/sphere-v1",roles:Object.freeze([...roles]),depthTest:true,depthWrite:true,sourceMode:mode,sizeCssPx,worldScales:Object.freeze(markerScales)});return Object.freeze({cursorCount:roles.length,roles:Object.freeze(roles)});
  }
  /** Standalone strict resolved-equipment staging. @param {ReadonlyArray<unknown>} equipment @param {unknown} options */
  renderGameplayEquipment(equipment,options){const result=this.stageGameplayEquipment(equipment,options,true);if(!this.app||this.destroyed||this.contextLost)return Object.freeze({status:this.describe(),equipmentCount:0,roles:Object.freeze([])});this.manualTick();this.drawCount+=result.equipmentCount;this.state="running";return Object.freeze({status:this.describe(),...result});}
  /**
   * One bounded pose root per role owns anchor, positive uniform scale, and final quaternion.
   * Axis-corrected GLB, fallback, and glow children all present canonical pose-local +X
   * geometry while inheriting that exact world matrix. Accepted input is intentionally centralized in
   * adaptResolvedEquipmentRecord so the shared-contract export can replace it atomically.
   * @param {ReadonlyArray<unknown>} equipment
   * @param {unknown} _options
   * @param {boolean} clear
   */
  stageGameplayEquipment(equipment,_options,clear){
    if(!Array.isArray(equipment)||equipment.length>4)throw new TypeError("Gameplay equipment cannot exceed 4 records");
    const accepted=new Map();
    for(const record of equipment){
      const normalized=adaptResolvedEquipmentRecord(record);
      if(!normalized||accepted.has(normalized.role))continue;
      accepted.set(normalized.role,normalized);
    }
    if(!this.app||this.destroyed||this.contextLost)return Object.freeze({equipmentCount:0,roles:Object.freeze([])});
    if(clear)this.clearOverlayEntities();
    for(const entries of this.equipmentPools.values())for(const entity of entries)entity.enabled=false;
    const effectivePalette=effectiveMarkerPalettes.get(this);
    for(const role of equipmentRoles){
      const record=accepted.get(role);if(!record)continue;
      const color=role==="left_wrist"?(effectivePalette?.left??this.theme.leftHandColor):(effectivePalette?.right??this.theme.rightHandColor);
      const alpha=1;
      if(record.mode==="flow")this.stageSaber(role,record,color,alpha);
      else this.stageGlove(role,record,color,alpha);
    }
    const staged=new Map();
    for(const role of equipmentRoles){
      const saberEntries=this.equipmentPools.get(`equipment/flow-saber-v1:${role}`)??[];
      if(saberEntries.slice(1).some((entity)=>entity.enabled)){staged.set(role,"flow");continue;}
      const gloveEntries=this.equipmentPools.get(`equipment/boxing-glove-v1:${role}`)??[];
      if(gloveEntries.slice(1).some((entity)=>entity.enabled))staged.set(role,"boxing");
    }
    const roles=equipmentRoles.filter((role)=>staged.has(role)),modes=roles.map((role)=>staged.get(role));
    const anyEquipmentGlb=roles.some((role)=>[...(this.equipmentPools.get(`equipment/flow-saber-v1:${role}`)??[]),...(this.equipmentPools.get(`equipment/boxing-glove-v1:${role}`)??[])].some((entity)=>entity.enabled&&Boolean(this.assetMaterials.get(entity)?.length)));
    const assetMode=anyEquipmentGlb?"glb":(roles.length>0?"primitive":"none");
    this.equipmentDiagnostics=Object.freeze({instanceCount:roles.length,roles:Object.freeze([...roles]),modes:Object.freeze(modes.map((mode,index)=>`${roles[index]}:${mode}`)),depthTest:true,depthWrite:anyEquipmentGlb,assetMode});
    return Object.freeze({equipmentCount:roles.length,roles:Object.freeze(roles)});
  }
  /** 0.0.62 L-C (r2lb r2): flow saber v2 = two-cylinder GLB (hilt + blade + rounded tip)
    *   inheriting one wrist-anchored root. Canonical rendered geometry extends along pose-local +X for
    *   0.75 WU (== detection capsule length, what-you-see-is-what-hits). Two material slots:
    *     mat/saber_blade → bright EMISSIVE blade + rounded tip, per-hand TINTABLE (carries
    *                       the song-palette color via the effective-palette seam).
    *     mat/saber_hilt  → dark gunmetal structural hilt (NOT tintable, no emissive glow).
    *   MATERIAL CONSTRAINTS: the core is opaque normal blend with depth write/test.
    *   The halo is one shader-driven cylinder surface with depth test/write on/off,
    *   SRC_ALPHA,ONE composition, and bounded radial/endpoint attenuation.
    *
    *   The halo stays around the blade section only (from hilt tip to blade tip),
    *   derives its hue from the blade tint, and never covers the hilt.
    *
    *   The root consumes only the final resolved pose. The shipped local -Z GLB receives
    *   a fixed child-only -90° Y correction into pose-local +X; fallback and glow remain
    *   native local-Y cylinders with their own fixed Y-to-X child correction.
    * @param {string} role "left_wrist" | "right_wrist"
    * @param {Readonly<{anchor:Readonly<{x:number,y:number,z:number}>,scale:number,orientation:Readonly<{x:number,y:number,z:number,w:number}>}>} pose
    * @param {string} color Per-hand color token.
    * @param {number} alpha Dimming multiplier.
    */
   stageSaber(role,pose,color,alpha){
    const poolKey=`equipment/flow-saber-v1:${role}`,loaderMode=this.gameplayAssetLoader.describe().state;
    const glbEntity=loaderMode==="ready"?this.acquireEquipmentGlbEntity(poolKey,"flow-saber/flow-saber-v1"):null;
    if(!glbEntity&&loaderMode==="ready")return;
    const entries=glbEntity?(this.equipmentPools.get(poolKey)??[]):this.acquireEquipmentPrimitiveChildren(poolKey,["cylinder","cylinder"]);
    const root=entries[0];if(!root)return;
    this.applyResolvedEquipmentPose(root,pose);
    if(glbEntity){
      glbEntity.enabled=true;glbEntity.name=`equipment-${role}-model`;
      glbEntity.setLocalPosition(0,0,0);glbEntity.setLocalScale(1,1,1);
      glbEntity.setLocalEulerAngles(0,-90,0);
      this.applyEquipmentGlbAppearance(glbEntity,"flow-saber/flow-saber-v1",color,alpha);
    }else{
      const hilt=entries[1],blade=entries[2];if(!hilt||!blade)return;
      hilt.enabled=true;hilt.name=`equipment-${role}-hilt`;this.applyLocalCylinder(hilt,0.09,0.18,0.03);
      blade.enabled=true;blade.name=`equipment-${role}-core`;this.applyLocalCylinder(blade,0.465,0.57,0.024);
      this.updateEquipmentMaterial(hilt,"#2a3038",alpha,0.5,"equipment/flow-saber-v1");
      this.updateEquipmentMaterial(blade,color,alpha,1,"equipment/flow-saber-v1-core");
    }
    this.acquireSaberGlow(poolKey,role,color,alpha);
    this.equipmentDiagnostics=Object.freeze({instanceCount:1,roles:Object.freeze([role]),modes:Object.freeze([`${role}:flow`]),depthTest:true,depthWrite:Boolean(glbEntity),assetMode:glbEntity?"glb":"primitive"});
  }
  /** Acquire the single-surface saber halo. The custom response attenuates toward
    *   the cylinder silhouette and both endpoints, then uses SRC_ALPHA,ONE so
    *   alpha controls additive energy. A normal-facing gate rejects the back
    *   surface, preventing the former double contribution. Root, blade, and cylinder geometry remain
    *   canonical; only the halo material response changes. */
  acquireSaberGlow(poolKey,role,color,alpha){
    const entries=this.equipmentPools.get(poolKey),root=entries?.[0];if(!entries||!root)return null;
    let glow=entries.find((entity)=>entity.name===`equipment-${role}-glow`)??null;
    if(!glow){
      glow=this.makeDetachedEntity(`equipment-${role}-glow`,"cylinder");root.addChild(glow);entries.push(glow);
      const previous=this.entityMaterials.get(glow);
      const material=new pc.ShaderMaterial({
        uniqueName:`aero-saber-halo-${role}`,
        attributes:{a_position:pc.SEMANTIC_POSITION,a_normal:pc.SEMANTIC_NORMAL},
        vertexGLSL:"attribute vec3 a_position;attribute vec3 a_normal;uniform mat4 matrix_model;uniform mat4 matrix_viewProjection;uniform mat3 matrix_normal;varying vec3 vAeroHaloWorld;varying vec3 vAeroHaloNormal;varying float vAeroHaloAxis;varying vec2 vAeroHaloCross;varying float vAeroHaloCap;void main(){vec4 world=matrix_model*vec4(a_position,1.0);vAeroHaloWorld=world.xyz;vAeroHaloNormal=normalize(matrix_normal*a_normal);vAeroHaloAxis=abs(a_position.y)*2.0;vAeroHaloCross=a_position.xz*2.0;vAeroHaloCap=abs(a_normal.y);gl_Position=matrix_viewProjection*world;}",
        fragmentGLSL:"precision highp float;uniform vec3 view_position;uniform vec3 u_haloColor;uniform float u_haloGain;varying vec3 vAeroHaloWorld;varying vec3 vAeroHaloNormal;varying float vAeroHaloAxis;varying vec2 vAeroHaloCross;varying float vAeroHaloCap;void main(){vec3 viewDir=normalize(view_position-vAeroHaloWorld);float normalFacing=dot(normalize(vAeroHaloNormal),viewDir);float facing=pow(max(normalFacing,0.0),0.72);float endpoint=1.0-smoothstep(0.72,1.0,vAeroHaloAxis);float side=facing*endpoint;float cap=(1.0-smoothstep(0.08,1.0,length(vAeroHaloCross)))*0.55*step(0.0001,normalFacing);float energy=u_haloGain*mix(side,cap,smoothstep(0.5,0.9,vAeroHaloCap));gl_FragColor=vec4(u_haloColor,energy);}"
      });
      material.blendType=pc.BLEND_ADDITIVEALPHA;material.depthTest=true;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;
      for(const component of glow.findComponents("render"))for(const meshInstance of component.meshInstances)meshInstance.material=material;
      if(previous&&this.ownedMaterials.delete(previous))previous.destroy();this.ownedMaterials.add(material);this.entityMaterials.set(glow,material);
    }
    glow.enabled=true;this.applyLocalCylinder(glow,0.48,0.60,0.045);
    const rgba=colorTokenToRgba(color,[1,1,1,1]),material=this.entityMaterials.get(glow);if(!material)return glow;
    material.setParameter("u_haloColor",new Float32Array([rgba[0],rgba[1],rgba[2]]));material.setParameter("u_haloGain",Math.min(1,Math.max(0,alpha))*.42);material.update();
    return glow;
  }
  /** 0.0.62 L-C (r2lb): acquire (or lazily create) a GLB-backed equipment entity for the flow saber.
   *   Pool key: `<assetId>:<role>` (e.g. "equipment/flow-saber-v1:left_wrist"). Each role
   *   owns a distinct GLB entity (independent material clones via cloneAssetMaterials). */
  acquireEquipmentGlbEntity(assetId,resourceId){
    let entries=this.equipmentPools.get(assetId);
    if(!entries){const root=this.createEquipmentPoseRoot(assetId);entries=[root];this.equipmentPools.set(assetId,entries);}
    let entity=this.equipmentGlbEntities.get(assetId)??null;
    if(!entity){
      const resource=this.gameplayAssetLoader.resourceFor(resourceId);
      if(!resource?.instantiateRenderEntity)return null;
      entity=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});
      entity.enabled=false;this.cloneAssetMaterials(entity);entries[0].addChild(entity);entries.push(entity);this.equipmentGlbEntities.set(assetId,entity);
    }
    return entity;
  }
  /** 0.0.62 L-C (r2lb): apply per-hand appearance to a GLB-backed equipment entity.
   *   mat/saber_core → per-hand tint (diffuse + emissive = hand color, gain 1.0).
   *   mat/saber_shell → dark authored color (no per-hand tint; reads as a crisp dark
   *   blade edge over both Aero and Camera backgrounds).
   *   Both slots: OPAQUE normal blend, depthWrite ON, depthTest ON, useLighting=false.
   *   Dimmed (alpha < 1) → opacity = alpha (the saber MUST visibly dim). */
  applyEquipmentGlbAppearance(entity,assetId,colorToken,alpha){
    const rgba=colorTokenToRgba(colorToken,[1,1,1,1]);
    for(const record of this.assetMaterials.get(entity)??[]){
      const material=record.meshInstance.material;
      if(material!==record.material){if(record.materialOwned)record.material.destroy();record.material=material;record.materialOwned=false;}
      const materialRole=gameplayAssetMaterialRole(assetId,record.name);
      let diffuseR,diffuseG,diffuseB,emissiveR,emissiveG,emissiveB;
      if(materialRole==="saber_blade_tint"){
        // Per-hand TINTABLE blade: diffuse = emissive = hand color (bright emissive).
        // The blade dims via opacity (alpha).
        diffuseR=rgba[0];diffuseG=rgba[1];diffuseB=rgba[2];
        emissiveR=rgba[0];emissiveG=rgba[1];emissiveB=rgba[2];
      }else if(materialRole==="saber_hilt_dark"){
        // Dark gunmetal hilt: authored color (no per-hand tint, no emissive).
        diffuseR=record.diffuse.r;diffuseG=record.diffuse.g;diffuseB=record.diffuse.b;
        emissiveR=record.emissive.r;emissiveG=record.emissive.g;emissiveB=record.emissive.b;
      }else if(materialRole==="glove_body_tint"){
        // 0.0.62 L-D (5y0q r1): per-hand TINTABLE glove fist. diffuse = hand color,
        // emissive = 0.4x hand color (matches the primitive glove's emissive gain).
        // Vertex-color AO (COLOR_0) multiplies in automatically, keeping the baked
        // crevice depth under the tint. Dims via opacity (alpha) like the saber.
        diffuseR=rgba[0];diffuseG=rgba[1];diffuseB=rgba[2];
        emissiveR=rgba[0]*0.4;emissiveG=rgba[1]*0.4;emissiveB=rgba[2]*0.4;
      }else{
        // Unrecognized part: keep authored source appearance.
        diffuseR=record.diffuse.r;diffuseG=record.diffuse.g;diffuseB=record.diffuse.b;
        emissiveR=record.emissive.r;emissiveG=record.emissive.g;emissiveB=record.emissive.b;
      }
      const state={kind:"equipment-glb",assetId,materialRole,sourceMaterial:record.sourceMaterial,diffuseR,diffuseG,diffuseB,emissiveR,emissiveG,emissiveB,opacity:alpha,blendType:pc.BLEND_NORMAL,depthWrite:true,depthTest:true,useLighting:false,cull:materialRole==="glove_body_tint"?pc.CULLFACE_NONE:record.cull,diffuseMap:record.diffuseMap,emissiveMap:record.emissiveMap,opacityMap:record.opacityMap,diffuseMapChannel:record.diffuseMapChannel,emissiveMapChannel:record.emissiveMapChannel,opacityMapChannel:record.opacityMapChannel};
      if(materialStateIsUnchanged(material,this.materialStates.get(material),state))continue;
      material.diffuse.set(diffuseR,diffuseG,diffuseB);material.emissive.set(emissiveR,emissiveG,emissiveB);material.opacity=state.opacity;material.blendType=state.blendType;material.depthWrite=state.depthWrite;material.depthTest=state.depthTest;material.useLighting=state.useLighting;material.cull=state.cull;material.diffuseMap=state.diffuseMap;material.emissiveMap=state.emissiveMap;material.opacityMap=state.opacityMap;material.update();
      this.materialStates.set(material,state);
    }
  }
  /** Boxing GLB/fallback share one final wrist pose root; the +Z fist offset and right-hand mirror are child-local only. */
  stageGlove(role,pose,color,alpha){
    const poolKey=`equipment/boxing-glove-v1:${role}`,loaderMode=this.gameplayAssetLoader.describe().state;
    const glbEntity=loaderMode==="ready"?this.acquireEquipmentGlbEntity(poolKey,"boxing-glove/boxing-glove-v1"):null;
    if(!glbEntity&&loaderMode==="ready")return;
    const entries=glbEntity?(this.equipmentPools.get(poolKey)??[]):this.acquireEquipmentPrimitiveChildren(poolKey,["box","box"]);
    const root=entries[0];if(!root)return;
    this.applyResolvedEquipmentPose(root,pose);
    if(glbEntity){
      glbEntity.enabled=true;glbEntity.name=`equipment-${role}-model`;
      glbEntity.setLocalPosition(0,0,gloveGeometry.offsetZ);
      // Mirroring is a visual child operation; the pose root always has positive uniform scale.
      glbEntity.setLocalScale(role==="right_wrist"?-1:1,1,1);glbEntity.setLocalEulerAngles(0,0,0);
      this.applyEquipmentGlbAppearance(glbEntity,"boxing-glove/boxing-glove-v1",color,alpha);
    }else{
      const body=entries[1],accent=entries[2];if(!body||!accent)return;
      body.enabled=true;body.name=`equipment-${role}-body`;this.applyLocalBox(body,0,0,gloveGeometry.offsetZ,gloveGeometry.x,gloveGeometry.y,gloveGeometry.z,role==="right_wrist");
      accent.enabled=true;accent.name=`equipment-${role}-accent`;this.applyLocalBox(accent,0,0,gloveGeometry.offsetZ,gloveGeometry.x*0.55,gloveGeometry.y*0.45,gloveGeometry.z*0.55,role==="right_wrist");
      this.updateEquipmentMaterial(body,color,alpha,1,"equipment/boxing-glove-v1");
      this.updateEquipmentMaterial(accent,"#F2F5FB",alpha,1,"equipment/boxing-glove-v1-accent");
    }
    this.equipmentDiagnostics=Object.freeze({instanceCount:1,roles:Object.freeze([role]),modes:Object.freeze([`${role}:boxing`]),depthTest:true,depthWrite:Boolean(glbEntity),assetMode:glbEntity?"glb":"primitive"});
  }
  /** Two bounded role roots own all mode-specific GLB/fallback children. Resource-mode
   * transitions may retain one disabled GLB plus fallback children, but maps reuse those
   * identities and never grow after each role/mode combination has been staged once. */
  createEquipmentPoseRoot(assetId){const role=equipmentRoles.find((candidate)=>assetId.endsWith(`:${candidate}`));if(!role)throw new TypeError("Equipment pool role is invalid");let root=this.equipmentPoseRoots.get(role);if(!root){root=new pc.Entity(`equipment-${role}-pose-root`,this.app);root.enabled=false;this.app.root.addChild(root);this.equipmentPoseRoots.set(role,root);}return root;}
  acquireEquipmentPrimitiveChildren(assetId,types){let entries=this.equipmentPools.get(assetId);if(!entries){entries=[this.createEquipmentPoseRoot(assetId)];this.equipmentPools.set(assetId,entries);}let children=this.equipmentPrimitiveChildren.get(assetId);if(!children){children=types.map((type,index)=>{const child=this.makeDetachedEntity(`equipment-${index}`,type);entries[0].addChild(child);entries.push(child);return child;});this.equipmentPrimitiveChildren.set(assetId,children);}return[entries[0],...children];}
  applyResolvedEquipmentPose(root,pose){const presentation=judgeToPresentationPoint(pose.anchor);root.enabled=true;root.setPosition(presentation.x,presentation.y,pose.anchor.z);root.setLocalScale(pose.scale,pose.scale,pose.scale);root.setLocalRotation(pose.orientation.x,pose.orientation.y,pose.orientation.z,pose.orientation.w);}
  applyLocalCylinder(entity,midpointX,length,radius){entity.setLocalPosition(midpointX,0,0);entity.setLocalScale(2*radius,length,2*radius);entity.setLocalEulerAngles(0,0,-90);}
  applyLocalBox(entity,x,y,z,halfX,halfY,halfZ,mirrorX=false){entity.setLocalPosition(x,y,z);entity.setLocalScale((mirrorX?-1:1)*2*halfX,2*halfY,2*halfZ);entity.setLocalEulerAngles(0,0,0);}
  /**
   * 0.0.61 L-F3: lighting-independent equipment material (emissive-dominant,
   * marker-family treatment). gain>1 pushes a brighter beam core. Flow saber
   * parts use additive blending for the glow look; the boxing glove uses
   * normal blending + depth write so it reads as a solid object, not a glow.
   */
  updateEquipmentMaterial(entity,colorToken,alpha,gain,kind){const material=this.entityMaterials.get(entity);if(!material)return;const rgba=colorTokenToRgba(colorToken,[0.85,0.95,1,1]);const clamp01=(value)=>Math.min(1,Math.max(0,value));const isSaber=kind.startsWith("equipment/flow-saber-v1");const r=clamp01(rgba[0]*gain),g=clamp01(rgba[1]*gain),b=clamp01(rgba[2]*gain),emissive=isSaber?1:.4,opacity=clamp01(alpha*rgba[3]),state={kind,diffuseR:rgba[0],diffuseG:rgba[1],diffuseB:rgba[2],emissiveR:emissive*r,emissiveG:emissive*g,emissiveB:emissive*b,opacity,blendType:isSaber?pc.BLEND_ADDITIVE:pc.BLEND_NORMAL,depthTest:true,depthWrite:!isSaber,useLighting:false,cull:pc.CULLFACE_NONE,diffuseMap:null,emissiveMap:null,opacityMap:null,diffuseMapChannel:material.diffuseMapChannel,emissiveMapChannel:material.emissiveMapChannel,opacityMapChannel:material.opacityMapChannel};if(materialStateIsUnchanged(material,this.materialStates.get(material),state))return;material.diffuse.set(state.diffuseR,state.diffuseG,state.diffuseB);material.emissive.set(state.emissiveR,state.emissiveG,state.emissiveB);material.opacity=state.opacity;material.blendType=state.blendType;material.depthTest=state.depthTest;material.depthWrite=state.depthWrite;material.useLighting=state.useLighting;material.cull=state.cull;material.diffuseMap=null;material.emissiveMap=null;material.opacityMap=null;material.update();this.materialStates.set(material,state);}
  renderLandmarkOverlay(landmarks,options={}){if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),pointCount:0,lineVertexCount:0};this.clearOverlayEntities();const surface=normalizeOverlaySurfaceDescriptor({viewportWidth:this.canvas.width,viewportHeight:this.canvas.height,...options.surface});const min=options.minVisibility??0;const visible=landmarks.filter((entry)=>(typeof entry.v==="number"?entry.v:1)>=min);const byId=new Map(visible.map((entry)=>[entry.id,entry]));const color=rgbaToHex(options.color??[0.24,0.9,0.45,0.95]);for(const landmark of visible){const p=mapNormalizedLandmarkToViewport(landmark,surface);const position=gridPositionForNormalized(p.x/surface.viewportWidth,p.y/surface.viewportHeight,0.42);this.addOverlayDisc(`landmark-${landmark.id??this.overlayEntities.length}`,position.x,position.y,position.z,(options.pointSize??6)/42,color);}let lines=0;for(const [aId,bId] of options.connections??[]){const a=byId.get(aId),b=byId.get(bId);if(!a||!b)continue;const ap=mapNormalizedLandmarkToViewport(a,surface),bp=mapNormalizedLandmarkToViewport(b,surface);this.addOverlayLine(ap,bp,surface,color);lines+=2;}this.manualTick();this.drawCount+=visible.length+lines/2;this.state="running";return{status:this.describe(),pointCount:visible.length,lineVertexCount:lines};}
  setDebugCameraEnabled(enabled){
    const next=Boolean(enabled)&&!this.destroyed&&Boolean(this.canvas)&&Boolean(this.app);if(this.debugEnabled===next)return this.describe();
    if(!next){this.clearDebugInteractionState(true);this.debugEnabled=false;this.debugCameraAuthoringInputEnabled=true;this.removeDebugListeners();this.resetProductionCameraParallax();this.resetDebugCamera();return this.describe();}
    this.removeDebugListeners();this.clearDebugInteractionState(true);this.resetProductionCameraParallax();this.debugEnabled=true;this.debugCameraAuthoringInputEnabled=true;
    const canvas=this.canvas;const on=(target,type,listener,options)=>{target.addEventListener(type,listener,options);this.debugListeners.push(()=>target.removeEventListener(type,listener,options));};
    on(canvas,"contextmenu",(event)=>{if(this.debugCameraAuthoringInputEnabled)event.preventDefault();});
    on(canvas,"mousedown",(event)=>{if(event.button!==2||!this.debugCameraAuthoringInputEnabled)return;event.preventDefault();if(this.debugCaptureReleasePending)return;if(this.debugCaptureMode!=="none")this.exitDebugCapture(true);else this.enterDebugPointerCapture();});
    on(document,"pointerlockchange",()=>this.handleDebugPointerLockChange(canvas));
    on(document,"pointerlockerror",()=>this.handleDebugPointerLockError(canvas));
    on(document,"mousemove",(event)=>{if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled||this.debugCaptureReleasePending||!debugMouseCaptureModes.includes(this.debugCaptureMode))return;this.applyDebugLookDelta(event.movementX,event.movementY,0.0025);});
    on(window,"keydown",(event)=>{if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled)return;if(event.code==="Escape"&&this.debugCaptureMode!=="none"){event.preventDefault();this.exitDebugCapture(true);return;}if(event.code==="ShiftLeft"||event.code==="ShiftRight"){this.debugShiftActive=true;event.preventDefault();return;}const intent=debugKeyIntents[event.code];if(!intent)return;this.debugKeyboardIntents.add(intent);event.preventDefault();});
    on(window,"keyup",(event)=>{if(!this.debugCameraAuthoringInputEnabled)return;if(event.code==="ShiftLeft"||event.code==="ShiftRight"){this.debugShiftActive=false;return;}const intent=debugKeyIntents[event.code];if(intent)this.debugKeyboardIntents.delete(intent);});
    on(window,"blur",()=>this.clearDebugInteractionState(true));
    on(document,"visibilitychange",()=>{if(document.visibilityState==="hidden")this.clearDebugInteractionState(true);});
    on(canvas,"touchstart",(event)=>this.onDebugTouchStart(event),{passive:false});
    on(canvas,"touchmove",(event)=>this.onDebugTouchMove(event),{passive:false});
    on(canvas,"touchend",(event)=>this.onDebugTouchEnd(event),{passive:false});
    on(canvas,"touchcancel",(event)=>this.onDebugTouchCancel(event),{passive:false});
    return this.describe();
  }
  setDebugCameraAuthoringInputEnabled(enabled){if(typeof enabled!=="boolean")throw new TypeError("Debug camera authoring input enabled state must be boolean");if(this.destroyed)return this.describe();if(this.debugCameraAuthoringInputEnabled===enabled)return this.describe();this.debugCameraAuthoringInputEnabled=enabled;if(!enabled)this.clearDebugInteractionState(true);return this.describe();}
  setDebugCameraMovementIntent(intent,active){if(!debugMovementIntents.includes(intent))throw new TypeError(`Unknown debug camera movement intent: ${String(intent)}`);if(typeof active!=="boolean")throw new TypeError("Debug camera movement intent active state must be boolean");if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled||this.destroyed)return this.describe();if(active)this.debugDomIntents.add(intent);else this.debugDomIntents.delete(intent);return this.describe();}
  setDebugCameraSpeedMode(mode){if(!debugSpeedModes.includes(mode))throw new TypeError(`Unknown debug camera speed mode: ${String(mode)}`);if(!this.debugEnabled||this.destroyed)return this.describe();this.debugGuiSpeedMode=mode;return this.describe();}
  releaseDebugCameraAuthoringInput(){if(this.debugEnabled&&!this.destroyed)this.clearDebugInteractionState(true);return this.describe();}
  /** Strictly normalize unknown v1 data and apply it only to the live rendered debug camera after authoring input is released. @param {unknown} value */
  async loadDebugCameraPose(value){
    const pose=normalizeGameplayCameraPose(value),canvas=this.canvas,app=this.app,cameraEntity=this.cameraEntity;
    this.assertDebugCameraPoseAuthoringReady("load");
    this.clearDebugInteractionState(true);
    await this.waitForDebugCaptureRelease();
    if(canvas!==this.canvas||app!==this.app||cameraEntity!==this.cameraEntity)throw new Error("Debug camera pose load became stale");
    this.assertDebugCameraPoseAuthoringReady("load",true);
    this.debugPosition={...pose.position};this.debugPitch=pose.rotationEulerDegrees.xPitch*Math.PI/180;this.debugYaw=pose.rotationEulerDegrees.yYaw*Math.PI/180;this.debugProjection={...pose.projection};this.debugLastFrameTimeMs=null;this.applyPose(pose);
    return pose;
  }
  enterDebugPointerCapture(){
    if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled||!this.canvas||this.debugCaptureReleasePending||this.debugCaptureMode!=="none")return;const canvas=this.canvas;this.captureDebugCursor(canvas);this.debugCaptureMode="fallback";
    try{const pending=canvas.requestPointerLock?.();if(pending&&typeof pending.then==="function"){const request={canvas,promise:pending};this.debugPointerLockRequest=request;pending.then(()=>{if(this.debugPointerLockRequest===request)this.debugPointerLockRequest=null;if(this.debugCaptureReleasePending||!this.debugEnabled||this.destroyed)this.exitDebugCapture(true);}).catch(()=>{if(this.debugPointerLockRequest===request)this.debugPointerLockRequest=null;if(this.debugCaptureReleasePending)this.finalizeDebugCapture(canvas);});}}
    catch{this.debugPointerLockRequest=null;/* bounded fallback remains active */}
  }
  exitDebugCapture(exitPointerLock){
    const canvas=this.debugCaptureCursor?.canvas??this.canvas;if(!canvas){this.finalizeDebugCapture(null);return;}
    const locked=exitPointerLock&&typeof document!=="undefined"&&document.pointerLockElement===canvas,pendingRequest=this.debugPointerLockRequest?.canvas===canvas;
    if(locked||pendingRequest){if(!this.debugCaptureReleasePending){this.debugCaptureReleasePending={canvas};this.installDebugReleaseListener();}if(locked){try{document.exitPointerLock?.();}catch{this.finalizeDebugCapture(canvas);}}return;}
    this.finalizeDebugCapture(canvas);
  }
  handleDebugPointerLockChange(canvas){
    if(typeof document==="undefined")return;const locked=document.pointerLockElement===canvas;
    if(locked){if(this.debugCaptureMode==="none"||this.debugCaptureReleasePending||!this.debugEnabled||this.destroyed){if(!this.debugCaptureReleasePending){this.debugCaptureReleasePending={canvas};this.installDebugReleaseListener();}try{document.exitPointerLock?.();}catch{this.finalizeDebugCapture(canvas);}return;}if(this.debugCaptureMode!=="none"){this.debugCaptureMode="pointer";this.applyCapturedDebugCursor(canvas);}return;}
    if(this.debugCaptureReleasePending?.canvas===canvas||this.debugCaptureMode==="pointer")this.finalizeDebugCapture(canvas);
  }
  handleDebugPointerLockError(canvas){if(typeof document!=="undefined"&&document.pointerLockElement===canvas)return;if(this.debugCaptureReleasePending?.canvas===canvas)this.finalizeDebugCapture(canvas);else if(this.debugCaptureMode==="pointer")this.debugCaptureMode="fallback";}
  captureDebugCursor(canvas){if(this.debugCaptureCursor?.canvas!==canvas){const inline=canvas.style?.cursor??"",computed=typeof getComputedStyle==="function"?getComputedStyle(canvas).cursor:inline||"default";this.debugCaptureCursor={canvas,inline,computed};}this.applyCapturedDebugCursor(canvas);}
  applyCapturedDebugCursor(canvas){if(canvas.style)canvas.style.cursor="none";}
  restoreDebugCursor(canvas){const snapshot=this.debugCaptureCursor;if(!snapshot||snapshot.canvas!==canvas)return;if(canvas.style)canvas.style.cursor=snapshot.inline;const restored=typeof getComputedStyle==="function"?getComputedStyle(canvas).cursor:canvas.style?.cursor;if(canvas.style&&restored==="none"&&snapshot.computed!=="none")canvas.style.cursor=snapshot.computed||"default";this.debugCaptureCursor=null;}
  finalizeDebugCapture(canvas){this.debugCaptureMode="none";this.debugTouchToggle=null;this.debugTouchDrag=null;this.debugCaptureReleasePending=null;if(canvas)this.restoreDebugCursor(canvas);this.removeDebugReleaseListener();for(const resolve of this.debugReleaseWaiters.splice(0))resolve();}
  waitForDebugCaptureRelease(){if(!this.debugCaptureReleasePending&&!this.debugPointerLockRequest&&this.debugCaptureMode==="none"&&(!this.canvas||typeof document==="undefined"||document.pointerLockElement!==this.canvas))return Promise.resolve();return new Promise((resolve)=>this.debugReleaseWaiters.push(resolve));}
  installDebugReleaseListener(){if(this.debugReleaseListener||typeof document==="undefined")return;const listener=()=>{const pending=this.debugCaptureReleasePending;if(pending)this.handleDebugPointerLockChange(pending.canvas);};document.addEventListener("pointerlockchange",listener);this.debugReleaseListener=()=>document.removeEventListener("pointerlockchange",listener);}
  removeDebugReleaseListener(){const remove=this.debugReleaseListener;this.debugReleaseListener=null;remove?.();}
  clearDebugInteractionState(exitPointerLock){this.debugKeyboardIntents.clear();this.debugDomIntents.clear();this.debugShiftActive=false;this.debugLastFrameTimeMs=null;this.exitDebugCapture(exitPointerLock);}
  applyDebugLookDelta(deltaX,deltaY,sensitivity){if(!this.debugCameraAuthoringInputEnabled||!Number.isFinite(deltaX)||!Number.isFinite(deltaY))return;this.debugYaw=normalizeRadians(this.debugYaw-deltaX*sensitivity);this.debugPitch=clamp(this.debugPitch-deltaY*sensitivity,-1.35,1.35);this.applyDebugPose();}
  onDebugTouchStart(event){
    if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled)return;const touches=Array.from(event.touches);
    if(touches.length===2){this.debugTouchDrag=null;this.debugTouchToggle={startedAt:event.timeStamp,points:new Map(touches.map((touch)=>[touch.identifier,{x:touch.clientX,y:touch.clientY}])),moved:false,maxTouches:2};if(this.debugCaptureMode==="touch")event.preventDefault();return;}
    if(touches.length===1&&this.debugCaptureMode==="touch"){const touch=touches[0];this.debugTouchToggle=null;this.debugTouchDrag={identifier:touch.identifier,x:touch.clientX,y:touch.clientY};event.preventDefault();return;}
    if(touches.length>2){this.debugTouchToggle=null;this.debugTouchDrag=null;if(this.debugCaptureMode==="touch")event.preventDefault();}
  }
  onDebugTouchMove(event){
    if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled)return;const touches=Array.from(event.touches),toggle=this.debugTouchToggle;
    if(toggle){toggle.maxTouches=Math.max(toggle.maxTouches,touches.length);if(touches.length!==2)toggle.moved=true;for(const touch of touches){const start=toggle.points.get(touch.identifier);if(!start||Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>DEBUG_TOUCH_TAP_MAX_MOVE_PX)toggle.moved=true;}if(this.debugCaptureMode==="touch")event.preventDefault();return;}
    const drag=this.debugTouchDrag;if(this.debugCaptureMode!=="touch"||!drag)return;const touch=touches.find((entry)=>entry.identifier===drag.identifier);if(!touch){this.debugTouchDrag=null;return;}const deltaX=touch.clientX-drag.x,deltaY=touch.clientY-drag.y;drag.x=touch.clientX;drag.y=touch.clientY;this.applyDebugLookDelta(deltaX,deltaY,0.006);event.preventDefault();
  }
  onDebugTouchEnd(event){
    if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled)return;const wasTouchCaptured=this.debugCaptureMode==="touch",toggle=this.debugTouchToggle;if(wasTouchCaptured)event.preventDefault();
    if(toggle&&event.touches.length===0){const duration=event.timeStamp-toggle.startedAt,valid=toggle.maxTouches===2&&!toggle.moved&&duration>=0&&duration<=DEBUG_TOUCH_TAP_MAX_MS;this.debugTouchToggle=null;if(valid){if(wasTouchCaptured)this.exitDebugCapture(true);else if(!this.debugCaptureReleasePending){this.exitDebugCapture(true);if(!this.debugCaptureReleasePending)this.debugCaptureMode="touch";}}}
    if(this.debugTouchDrag&&!Array.from(event.touches).some((touch)=>touch.identifier===this.debugTouchDrag.identifier))this.debugTouchDrag=null;
  }
  onDebugTouchCancel(event){if(!this.debugCameraAuthoringInputEnabled)return;if(this.debugCaptureMode==="touch")event.preventDefault();this.debugTouchToggle=null;this.debugTouchDrag=null;}
  integrateDebugCameraMotion(){
    if(!this.debugEnabled||!this.debugCameraAuthoringInputEnabled){this.debugLastFrameTimeMs=null;return;}const now=Number(this.debugNow());if(!Number.isFinite(now)){this.debugLastFrameTimeMs=null;return;}const previous=this.debugLastFrameTimeMs;this.debugLastFrameTimeMs=now;if(previous===null)return;const deltaSeconds=clamp(now-previous,0,DEBUG_MAX_DELTA_MS)/1000;if(deltaSeconds===0)return;
    const active=new Set([...this.debugKeyboardIntents,...this.debugDomIntents]),forward=(active.has("forward")?1:0)-(active.has("back")?1:0),right=(active.has("right")?1:0)-(active.has("left")?1:0),vertical=(active.has("up")?1:0)-(active.has("down")?1:0);let planarForward=forward,planarRight=right;const planarLength=Math.hypot(planarForward,planarRight);if(planarLength>1){planarForward/=planarLength;planarRight/=planarLength;}const sin=Math.sin(this.debugYaw),cos=Math.cos(this.debugYaw);let x=-sin*planarForward+cos*planarRight,z=-cos*planarForward-sin*planarRight,y=vertical;const totalLength=Math.hypot(x,y,z);if(totalLength>1){x/=totalLength;y/=totalLength;z/=totalLength;}const speed=(this.debugShiftActive||this.debugGuiSpeedMode==="boost")?DEBUG_BOOST_UNITS_PER_SECOND:DEBUG_NORMAL_UNITS_PER_SECOND;this.debugPosition.x=clamp(this.debugPosition.x+x*speed*deltaSeconds,-DEBUG_POSITION_BOUNDS.x,DEBUG_POSITION_BOUNDS.x);this.debugPosition.y=clamp(this.debugPosition.y+y*speed*deltaSeconds,DEBUG_POSITION_BOUNDS.yMin,DEBUG_POSITION_BOUNDS.yMax);this.debugPosition.z=clamp(this.debugPosition.z+z*speed*deltaSeconds,DEBUG_POSITION_BOUNDS.zMin,DEBUG_POSITION_BOUNDS.zMax);this.applyDebugPose();
  }
  resetDebugCamera(){this.debugYaw=defaultGameplayCameraPose.rotationEulerDegrees.yYaw*Math.PI/180;this.debugPitch=defaultGameplayCameraPose.rotationEulerDegrees.xPitch*Math.PI/180;this.debugPosition={...defaultGameplayCameraPose.position};this.debugProjection={...defaultGameplayCameraPose.projection};this.debugLastFrameTimeMs=null;this.applyPose(defaultGameplayCameraPose);return this.describe();}
  assertDebugCameraPoseAuthoringReady(operation,requireReleased=false){
    const released=this.debugCaptureMode==="none"&&!this.debugCaptureReleasePending&&!this.debugPointerLockRequest&&!this.debugKeyboardIntents.size&&!this.debugDomIntents.size&&!this.debugShiftActive&&!this.debugTouchToggle&&!this.debugTouchDrag&&(!this.canvas||typeof document==="undefined"||document.pointerLockElement!==this.canvas);
    if(!this.debugEnabled||!this.canvas||!this.app||!this.cameraEntity||this.destroyed||this.contextLost||this.frameCount<1||(requireReleased&&!released))throw new Error(`Debug camera pose ${operation} requires an active rendered debug camera${requireReleased?" with no capture or movement input":""}`);
  }
  exportDebugCameraPoseArtifact(){
    this.assertDebugCameraPoseAuthoringReady("export",true);
    const position=this.cameraEntity.getPosition(),camera=this.cameraEntity.camera;
    const data=normalizeGameplayCameraPose({schema:defaultGameplayCameraPose.schema,version:defaultGameplayCameraPose.version,coordinateSystem:{...defaultGameplayCameraPose.coordinateSystem},position:{x:position.x,y:position.y,z:position.z},rotationEulerDegrees:{xPitch:this.debugPitch*180/Math.PI,yYaw:this.debugYaw*180/Math.PI,zRoll:0},projection:{verticalFovDegrees:camera.fov,nearClip:camera.nearClip,farClip:camera.farClip}});
    this.debugPosition={...data.position};this.debugPitch=data.rotationEulerDegrees.xPitch*Math.PI/180;this.debugYaw=data.rotationEulerDegrees.yYaw*Math.PI/180;this.debugProjection={...data.projection};this.applyPose(data);
    const json=serializeGameplayCameraPose(data),bytes=Object.freeze(Array.from(new TextEncoder().encode(json)));
    return Object.freeze({filename:gameplayCameraPoseArtifactFilename,mimeType:gameplayCameraPoseArtifactMimeType,data,json,bytes});
  }
  removeDebugListeners(){for(const remove of this.debugListeners.splice(0))remove();}
  resetProductionCameraParallax(){const state=productionCameraStates.get(this);if(state){state.offset={x:0,y:0};state.lastTimeMs=null;}if(this.cameraEntity&&!this.debugEnabled)this.applyPose(defaultGameplayCameraPose);}
  updateProductionCameraParallax(value){
    const desired=normalizeCameraDeflection(value),config=this.gameplayVisualExperimentConfig,state=productionCameraStates.get(this);if(!state)return;const now=Number(this.productionCameraNow());if(!Number.isFinite(now)){this.resetProductionCameraParallax();return;}
    const previous=state.lastTimeMs;state.lastTimeMs=now;if(previous===null)return;const deltaMs=clamp(now-previous,0,PRODUCTION_CAMERA_MAX_DELTA_MS);if(deltaMs<=0)return;
    const active=!this.debugEnabled&&config.noseCameraParallax&&desired.active,deadzone=config.deadzoneNormalized;
    const normalizedX=active?applyAxialDeadzone(desired.xDeflection,deadzone):0,normalizedY=active?applyAxialDeadzone(desired.yDeflection,deadzone):0;
    const targetX=normalizedX*config.horizontalRangeWorldUnits,targetY=-normalizedY*config.verticalRangeWorldUnits,tau=active?config.smoothingTimeConstantMs:config.recenterTimeConstantMs,alpha=tau===0?1:1-Math.exp(-deltaMs/tau),maxX=config.maximumHorizontalVelocityWorldUnitsPerSecond*deltaMs/1000,maxY=config.maximumVerticalVelocityWorldUnitsPerSecond*deltaMs/1000;
    state.offset={x:moveToward(state.offset.x,state.offset.x+(targetX-state.offset.x)*alpha,maxX),y:moveToward(state.offset.y,state.offset.y+(targetY-state.offset.y)*alpha,maxY)};
  }
  applyPose(pose){if(!this.cameraEntity)return;const position=pose.position,rotation=pose.rotationEulerDegrees,projection=pose.projection;this.cameraEntity.setPosition(position.x,position.y,position.z);this.cameraEntity.setEulerAngles(rotation.xPitch,rotation.yYaw,rotation.zRoll);this.cameraEntity.camera.fov=projection.verticalFovDegrees;this.cameraEntity.camera.nearClip=projection.nearClip;this.cameraEntity.camera.farClip=projection.farClip;this.syncEnvironmentAnchor();}
  syncEnvironmentAnchor(){const position=this.cameraEntity?.getPosition();if(position)this.environmentOwner.setCameraPosition(position);}
  applyDebugPose(){if(!this.cameraEntity)return;this.applyPose(normalizeGameplayCameraPose({schema:defaultGameplayCameraPose.schema,version:defaultGameplayCameraPose.version,coordinateSystem:{...defaultGameplayCameraPose.coordinateSystem},position:{...this.debugPosition},rotationEulerDegrees:{xPitch:this.debugPitch*180/Math.PI,yYaw:this.debugYaw*180/Math.PI,zRoll:0},projection:{...this.debugProjection}}));}
  applyCamera(model){if(!this.cameraEntity)return;if(this.debugEnabled){this.applyDebugPose();return;}const camera=model.camera,offset=productionCameraStates.get(this)?.offset??{x:0,y:0};this.applyPose({...camera,position:{x:camera.position.x+offset.x,y:camera.position.y+offset.y,z:camera.position.z}});}
  createGameplayLayers(){
    if(!this.app||!this.cameraEntity?.camera)return;const composition=this.app.scene.layers,world=composition.getLayerById(pc.LAYERID_WORLD);if(!world)throw new Error("PlayCanvas World layer is unavailable");
    const gridLayer=new pc.Layer({name:"Aero Gameplay Grid",clearColorBuffer:false,clearDepthBuffer:false,clearStencilBuffer:false,opaqueSortMode:pc.SORTMODE_MANUAL,transparentSortMode:pc.SORTMODE_MANUAL}),guidanceLayer=new pc.Layer({name:"Aero Gameplay Guidance Bands",clearColorBuffer:false,clearDepthBuffer:false,clearStencilBuffer:false,opaqueSortMode:pc.SORTMODE_MANUAL,transparentSortMode:pc.SORTMODE_MANUAL}),targetLayer=new pc.Layer({name:"Aero Gameplay Targets",clearColorBuffer:false,clearDepthBuffer:false,clearStencilBuffer:false,opaqueSortMode:pc.SORTMODE_FRONT2BACK,transparentSortMode:pc.SORTMODE_BACK2FRONT}),colliderOverlayLayer=new pc.Layer({name:"Aero Gameplay Collider Overlays",clearColorBuffer:false,clearDepthBuffer:false,clearStencilBuffer:false,opaqueSortMode:pc.SORTMODE_MANUAL,transparentSortMode:pc.SORTMODE_MANUAL}),hazardGlowLayer=new pc.Layer({name:"Aero Hazard Glow Vignette",clearColorBuffer:false,clearDepthBuffer:false,clearStencilBuffer:false,opaqueSortMode:pc.SORTMODE_MANUAL,transparentSortMode:pc.SORTMODE_MANUAL});
    const worldTransparentIndex=composition.getTransparentIndex(world);if(worldTransparentIndex<0)throw new Error("PlayCanvas World transparent layer is unavailable");composition.insertTransparent(gridLayer,worldTransparentIndex);composition.insertTransparent(guidanceLayer,worldTransparentIndex+1);composition.insert(targetLayer,worldTransparentIndex+2);composition.insertTransparent(colliderOverlayLayer,worldTransparentIndex+3);composition.insertTransparent(hazardGlowLayer,worldTransparentIndex+4);this.gameplayGridLayer=gridLayer;this.gameplayGuidanceLayer=guidanceLayer;this.gameplayTargetLayer=targetLayer;this.gameplayColliderOverlayLayer=colliderOverlayLayer;this.gameplayHazardGlowLayer=hazardGlowLayer;this.cameraEntity.camera.layers=[...this.cameraEntity.camera.layers,gridLayer.id,guidanceLayer.id,targetLayer.id,colliderOverlayLayer.id,hazardGlowLayer.id];
    this.createHazardGlowQuad();
  }
  removeGameplayLayers(){const gridLayer=this.gameplayGridLayer,guidanceLayer=this.gameplayGuidanceLayer,targetLayer=this.gameplayTargetLayer,colliderOverlayLayer=this.gameplayColliderOverlayLayer,hazardGlowLayer=this.gameplayHazardGlowLayer;this.gameplayGridLayer=null;this.gameplayGuidanceLayer=null;this.gameplayTargetLayer=null;this.gameplayColliderOverlayLayer=null;this.gameplayHazardGlowLayer=null;if(this.cameraEntity?.camera)this.cameraEntity.camera.layers=this.cameraEntity.camera.layers.filter((id)=>![gridLayer?.id,guidanceLayer?.id,targetLayer?.id,colliderOverlayLayer?.id,hazardGlowLayer?.id].includes(id));if(gridLayer)this.app?.scene.layers.removeTransparent(gridLayer);if(guidanceLayer)this.app?.scene.layers.removeTransparent(guidanceLayer);if(targetLayer)this.app?.scene.layers.remove(targetLayer);if(colliderOverlayLayer)this.app?.scene.layers.removeTransparent(colliderOverlayLayer);if(hazardGlowLayer)this.app?.scene.layers.removeTransparent(hazardGlowLayer);}
  useGameplayLayer(entity,kind){const layerId=kind==="grid"?this.gameplayGridLayer?.id:kind==="guidance"?this.gameplayGuidanceLayer?.id:kind==="target"?this.gameplayTargetLayer?.id:kind==="collider_overlay"?this.gameplayColliderOverlayLayer?.id:pc.LAYERID_WORLD;for(const component of entity.findComponents?.("render")??[])component.layers=[layerId??pc.LAYERID_WORLD];}
  updateSceneObjects(objects,guidance){
    const loader=this.gameplayAssetLoader.describe(),mode=loader.state;if(mode==="ready"&&this.assetPoolGeneration!==loader.generation){this.destroyInstantiatedPools();this.assetPoolGeneration=loader.generation;}
    for(const entity of this.pool)entity.enabled=false;for(const entries of this.assetPools.values())for(const entity of entries)entity.enabled=false;for(const entries of this.aftermathAssetPools.values())for(const entity of entries)entity.enabled=false;for(const entry of this.feedbackPool)entry.root.enabled=false;for(const entity of this.colliderOverlayPrimitivePool??[])entity.enabled=false;for(const entity of this.colliderOverlayConePool??[])entity.enabled=false;
    const assetCounts=new Map(),aftermathCounts=new Map(),renderedCounts=new Map();let primitiveIndex=0,feedbackIndex=0,fallbackCount=0,drawIndex=0;
    for(const object of objects){let entity=null;if(object.kind==="hazard_glow")continue;if(object.kind==="feedback"){entity=this.acquireFeedbackEntity(feedbackIndex++,object);if(entity)this.applyDrawOrder(entity,object.renderOrder*100+drawIndex++);if(entity)renderedCounts.set("world-feedback",(renderedCounts.get("world-feedback")??0)+1);continue;}if(object.kind==="aftermath"){const aftermathAsset=object.assetId??"any-note/outlined-circle-v1",index=aftermathCounts.get(aftermathAsset)??0;aftermathCounts.set(aftermathAsset,index+1);entity=mode==="ready"?this.acquireAftermathAssetEntity(aftermathAsset,index):this.acquirePrimitiveEntity(primitiveIndex++);if(!entity)continue;entity.enabled=true;entity.name=object.id;entity.setPosition(object.position.x,object.position.y,object.position.z);entity.setLocalScale(object.scale.x,object.scale.y,object.scale.z);entity.setEulerAngles(0,0,object.rotationZRad*180/Math.PI);this.useGameplayLayer(entity,"target");this.applyDrawOrder(entity,object.renderOrder*100+drawIndex++);if(mode==="ready"&&object.aftermath?.sliceSign!=null)this.applyAftermathAppearance(object,entity);else if(mode==="ready"){this.restoreSliceMaterials(entity);for(const record of this.assetMaterials.get(entity)??[]){const m=record.meshInstance.material;const part=gameplayAssetMaterialRole(object.assetId??"",record.name);const base=this.aftermathCorpsePartColor(part,object,record);m.diffuse.set(base[0],base[1],base[2]);m.emissive.set(base[0]*.32,base[1]*.32,base[2]*.32);m.opacity=base[3]*object.alpha;m.blendType=base[3]*object.alpha<1?pc.BLEND_NORMAL:record.blendType;m.depthWrite=base[3]*object.alpha<1?false:record.depthWrite;m.depthTest=true;m.useLighting=false;m.cull=record.cull;m.update();}}else this.updateMaterial(entity,object.appearanceColor??this.roleColor(object.role),object.alpha,null,false,false);renderedCounts.set(aftermathAsset,(renderedCounts.get(aftermathAsset)??0)+1);continue;}if(object.kind==="collider_square"||object.kind==="tolerance_cone"){entity=this.acquireColliderOverlayEntity(object,primitiveIndex++);if(!entity)continue;entity.enabled=true;entity.name=object.id;this.applyColliderOverlayAppearance(object,entity);this.applyDrawOrder(entity,object.renderOrder*100+drawIndex++);renderedCounts.set(object.kind==="collider_square"?"collider_square":"tolerance_cone",(renderedCounts.get(object.kind==="collider_square"?"collider_square":"tolerance_cone")??0)+1);continue;}if(object.assetId){if(mode==="ready"){const index=assetCounts.get(object.assetId)??0;entity=this.acquireAssetEntity(object.assetId,index);assetCounts.set(object.assetId,index+1);}else if(mode==="fallback"){entity=this.acquirePrimitiveEntity(primitiveIndex++);fallbackCount+=1;}}else entity=this.acquirePrimitiveEntity(primitiveIndex++);if(!entity)continue;this.useGameplayLayer(entity,object.kind==="cell"||object.kind==="lane"||object.kind==="timing"?"grid":object.kind==="guidance_band"?"guidance":object.kind==="icon"?"target":"world");entity.enabled=true;entity.name=object.id;entity.setPosition(object.position.x,object.position.y,object.position.z);entity.setLocalScale(object.scale.x,object.scale.y,object.scale.z);entity.setEulerAngles(0,0,object.rotationZRad*180/Math.PI);this.applyDrawOrder(entity,object.renderOrder*100+drawIndex++);const appearance=object.appearanceColor??this.roleColor(object.role);if(object.assetId&&mode==="ready"){this.applyAssetAppearance(entity,object.assetId,appearance,object.alpha,object.kind==="obstacle"&&object.tintMix>0);renderedCounts.set(object.assetId,(renderedCounts.get(object.assetId)??0)+1);}else this.updateMaterial(entity,appearance,object.alpha,null,object.state==="spent",false);}
    this.applyHazardGlow(objects.find((entry)=>entry.kind==="hazard_glow")??null);
    this.activeCount=[...renderedCounts.values()].reduce((sum,value)=>sum+value,0)+primitiveIndex;this.sceneDiagnostics=buildSceneDiagnostics(objects,guidance,mode,loader,renderedCounts,fallbackCount);
  }
  acquireAssetEntity(assetId,index){let entries=this.assetPools.get(assetId);if(!entries){entries=[];this.assetPools.set(assetId,entries);}while(entries.length<=index){const resource=this.gameplayAssetLoader.resourceFor(assetId);if(!resource?.instantiateRenderEntity)return null;const entity=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});entity.enabled=false;this.cloneAssetMaterials(entity);this.app.root.addChild(entity);entries.push(entity);}return entries[index];}
  /** 0.0.58 B11c: acquire (or lazily create) an aftermath half/whole in a DEDICATED pool isolated from the live-icon `assetPools` slots. The 0.0.57 bug: aftermath halves were indexed into the same per-asset pool as live icons with a separate counter starting at 0, so a live arrow/orb and an aftermath half could map to the SAME pooled entity (index 0) and fight for it mid-frame — the last write to position/material/appearance won, and one or both halves could vanish from the frame (the 0/1/2-halves symptom). The dedicated pool gives every aftermath piece its own entity for the lifetime of the frame; live-icon/B10 material-restore logic is untouched (slice variants created on aftermath entities are never acquired by live icons). */
  acquireAftermathAssetEntity(assetId,index){let entries=this.aftermathAssetPools.get(assetId);if(!entries){entries=[];this.aftermathAssetPools.set(assetId,entries);}while(entries.length<=index){const resource=this.gameplayAssetLoader.resourceFor(assetId);if(!resource?.instantiateRenderEntity)return null;const entity=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});entity.enabled=false;this.cloneAssetMaterials(entity);this.app.root.addChild(entity);entries.push(entity);}return entries[index];}
  acquirePrimitiveEntity(index){while(this.pool.length<=index)this.pool.push(this.makeEntity(`pooled-${this.pool.length}`,"box"));return this.pool[index];}
  /** 0.0.53 W2: acquire (or lazily create) one collider-overlay entity. Collider squares and target-point markers reuse a unit box; tolerance cones get a dedicated fan mesh. */
  acquireColliderOverlayEntity(object,index){
    if(object.kind==="collider_square"||(object.kind==="tolerance_cone"&&object.aftermath===null)){
      const pool=this.colliderOverlayPrimitivePool??=[];
      while(pool.length<=index)pool.push(this.makeDetachedEntity(`collider-overlay-primitive-${pool.length}`,"box"));
      this.colliderOverlayPrimitivePool=pool;
      const entity=pool[index];
      if(!this.app.root.children.includes(entity))this.app.root.addChild(entity);
      return entity;
    }
    // Tolerance cone: one persistent fan mesh per entity, rebuilt when the sector geometry changes.
    const pool=this.colliderOverlayConePool??=[];
    while(pool.length<=index){
      const entity=new pc.Entity(`collider-overlay-cone-${pool.length}`,this.app);
      const material=new pc.StandardMaterial();material.useLighting=false;material.emissive=new pc.Color(1,1,1);material.diffuse=new pc.Color(1,1,1);material.opacity=1;material.blendType=pc.BLEND_NORMAL;material.depthTest=false;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();
      this.ownedMaterials.add(material);
      const mesh=new pc.Mesh(this.app.graphicsDevice);mesh.update();
      this.ownedMaterials.add(mesh);
      const meshInstance=new pc.MeshInstance(mesh,material);
      entity.addComponent("render",{material});
      entity.render.meshInstances=[meshInstance];
      this.app.root.addChild(entity);
      pool.push(entity);
    }
    this.colliderOverlayConePool=pool;
    return pool[index];
  }
  /** 0.0.53 W2: apply appearance for one collider-overlay scene object (unlit, bounded alpha, dedicated transparent layer). */
  applyColliderOverlayAppearance(object,entity){
    const layerId=this.gameplayColliderOverlayLayer?.id??pc.LAYERID_WORLD;
    for(const component of entity.findComponents?.("render")??[])component.layers=[layerId];
    const rgba=colorTokenToRgba(object.appearanceColor??(object.kind==="collider_square"?"#9a67ea":"#39c96b"),[1,1,1,1]);
    const material=entity.findComponents?.("render")?.[0]?.meshInstances?.[0]?.material;
    if(!material)return;
    const alpha=object.alpha*rgba[3];
    material.diffuse.set(rgba[0],rgba[1],rgba[2]);
    material.emissive.set(rgba[0],rgba[1],rgba[2]);
    material.opacity=alpha;
    material.blendType=alpha<1?pc.BLEND_NORMAL:material.blendType;
    material.depthWrite=alpha<1?false:material.depthWrite;
    // 0.0.54 W1-C: depth-test OFF so the overlays (which ride the beat with a camera-side Z offset)
    // stay visible ON TOP of the approaching beat glyph; the dedicated transparent layer + render
    // orders 45/46/47 keep them above the targets layer.
    material.depthTest=false;
    material.useLighting=false;
    material.cull=pc.CULLFACE_NONE;
    if(object.kind==="collider_square"){
      const half=object.aftermath?.halfExtent??0.495;
      entity.setPosition(object.position.x,object.position.y,object.position.z);
      entity.setLocalScale(half*2,half*2,0.012);
      entity.setEulerAngles(0,0,0);
    }else if(object.aftermath===null){
      // Target-point marker: a small box at the target center.
      entity.setPosition(object.position.x,object.position.y,object.position.z);
      entity.setLocalScale(0.06,0.06,0.06);
      entity.setEulerAngles(0,0,0);
    }else{
      // Tolerance cone: rebuild the fan mesh when the sector geometry changes.
      const visual=object.aftermath;
      if(!visual||!(visual.positions instanceof Float32Array))return;
      const mesh=entity.render?.meshInstances?.[0]?.mesh;
      if(!mesh)return;
      const signature=coneGeometrySignature(visual);
      const cache=this.colliderOverlayConeGeometry?this.colliderOverlayConeGeometry.get(entity):null;
      if(!cache||cache.signature!==signature){
        mesh.setPositions(visual.positions);
        mesh.setIndices(visual.indices);
        mesh.update();
        if(!this.colliderOverlayConeGeometry)this.colliderOverlayConeGeometry=new Map();
        this.colliderOverlayConeGeometry.set(entity,{signature});
      }
      entity.setPosition(object.position.x,object.position.y,object.position.z);
      entity.setLocalScale(1,1,1);
      entity.setEulerAngles(0,0,0);
    }
    material.update();
  }
  /** 0.0.52 W1-C follow-up: aftermath slice halves render through two persistent clip-plane variant materials (vertical local-X cut — left/right halves, 0.0.56 B10), one per pool entity, cloned on first use from the record's pooled material (same clone-on-use discipline as the pooled cursor markers). Both halves share the pool's mesh asset. Non-slice aftermath and all other objects keep the shared pooled appearance. */
  applyAftermathAppearance(object,entity){
    const records=this.assetMaterials.get(entity);if(!records?.length)return;
    const sliceSign=object.aftermath?.sliceSign??null;if(sliceSign===null)return;
    // 0.0.63 D5: the clip plane no longer sits at the glyph's fixed midpoint —
    // it sits where the saber blade actually crossed the glyph. `sliceT` (0..1,
    // 0 = tail / 1 = head, the glyph's local long axis) offsets the plane along
    // that axis by (sliceT − 0.5) × the glyph's local long-axis length; both
    // halves share the same plane, so they stay aligned and merely tumble apart
    // laterally (see `aftermathSliceOffsetX`). Absent `sliceT` → legacy midpoint.
    const sliceT=object.aftermath?.sliceT;
    const planeLocalY=(sliceT!==undefined)?(sliceT-0.5)*aftermathSliceGlyphLengthWU(object):0;
    // 0.0.58 B11b: the corpse keeps the note's ACTUAL glyph (white outline + silhouette)
    // but DESATURATED — it must read as the same arrow/orb with the color gone, NOT a flat
    // uniform gray blob (the 0.0.57 AFTERMATH_HIT_CORPSE_GRAY override force-set EVERY
    // part — outline AND fill — to one color, collapsing the glyph's contrast). The GLB
    // carries three parts per cue: mat/white (structural outline, ~0.97), mat/charcoal
    // (~0.04), mat/tint_base (the colored fill, tinted at runtime from the note's real
    // appearanceColor). We restore the contrast:
    //   - mat/white  → bright neutral (keeps the "white outline" light; lifted slightly
    //                  above the mid-gray fill so the outline is clearly readable),
    //   - mat/charcoal → kept dark,
    //   - mat/tint_base (fill) → the note's REAL fill strongly lerped toward luminance
    //                  grayscale by AFTERMATH_CORPSE_DESATURATION (color gone, not flat),
    // so outline (light) / charcoal (dark) / fill (mid gray) are clearly distinct.
    // B10: this path applies ONLY to aftermath objects — live icons keep full color
    // through applyAssetAppearance. Shared with the whole (non-slice) aftermath branch.
    for(const record of records){
      const role=gameplayAssetMaterialRole(object.assetId??"",record.name);
      const baseRgba=this.aftermathCorpsePartColor(role,object,record);
      const variant=this.sliceVariantMaterial(record,sliceSign,planeLocalY);
      record.meshInstance.material=variant;
      const state={kind:"aftermath-slice",sliceSign,planeLocalY,part:role,baseR:[baseRgba[0],baseRgba[1],baseRgba[2]],opacity:baseRgba[3]*object.alpha,blendType:baseRgba[3]*object.alpha<1?pc.BLEND_NORMAL:record.blendType,depthWrite:baseRgba[3]*object.alpha<1?false:record.depthWrite,depthTest:true,useLighting:false,cull:record.cull,diffuseMap:record.diffuseMap,emissiveMap:record.emissiveMap,opacityMap:record.opacityMap,diffuseMapChannel:record.diffuseMapChannel,emissiveMapChannel:record.emissiveMapChannel,opacityMapChannel:record.opacityMapChannel};
      if(materialStateIsUnchanged(variant,this.materialStates.get(variant),state))continue;
      variant.diffuse.set(baseRgba[0],baseRgba[1],baseRgba[2]);variant.emissive.set(baseRgba[0]*.32,baseRgba[1]*.32,baseRgba[2]*.32);
      variant.opacity=baseRgba[3]*object.alpha;variant.blendType=state.blendType;variant.depthWrite=state.depthWrite;variant.depthTest=true;variant.useLighting=false;variant.cull=record.cull;
      variant.diffuseMap=record.diffuseMap;variant.emissiveMap=record.emissiveMap;variant.opacityMap=record.opacityMap;variant.diffuseMapChannel=record.diffuseMapChannel;variant.emissiveMapChannel=record.emissiveMapChannel;variant.opacityMapChannel=record.opacityMapChannel;variant.update();
      this.materialStates.set(variant,state);
    }
  }
  /** 0.0.58 B11b: resolve the DESATURATED corpse color for ONE part of a note cue. Keeps the
   * glyph's contrast (the bug was collapsing all parts to one flat gray): mat/white → bright
   * neutral (the "white outline" stays light), mat/charcoal → kept dark, mat/tint_base (the
   * colored fill) → the note's REAL `appearanceColor` lerped toward luminance
   * grayscale by AFTERMATH_CORPSE_DESATURATION (color muted, not uniform). 0.0.60 W1
   * (F1): a near-achromatic real fill (sRGB channel spread < AFTERMATH_CORPSE_MIN_CHROMA)
   * is substituted with the note's HAND color (roleColor) before the lerp, so pale
   * song-palette corpses read clearly hand-colored. Unrecognized parts
   * keep their authored source appearance. Returns [r,g,b,a] in linear-ish facade space.
   * @param {string|null} role Material role from gameplayAssetMaterialRole.
   * @param {{appearanceColor:string|undefined,role:string}} object The aftermath scene object.
   * @param {{diffuse:{r:number,g:number,b:number}}} record Cloned pooled material record.
   * @returns {[number,number,number,number]}
   */
  aftermathCorpsePartColor(role,object,record){
    if(role==="note_fill"){
      let source=object.appearanceColor;
      if(source){
        // 0.0.60 W1 (F1): spread is computed on the sRGB 0-1 channels (as
        // colorTokenToRgba returns them), before the lerp. A near-achromatic
        // fill desaturates to the same flat gray wash regardless, so it
        // carries no visible information — fall back to the saturated hand
        // color (roleColor) as the desaturation source instead.
        const probe=colorTokenToRgba(source,[0,0,0,1]);
        const spread=Math.max(probe[0],probe[1],probe[2])-Math.min(probe[0],probe[1],probe[2]);
        if(spread<AFTERMATH_CORPSE_MIN_CHROMA)source=undefined;
      }
      const rgba=colorTokenToRgba(source??this.roleColor(object.role),[1,1,1,1]);
      const g=0.2126*rgba[0]+0.7152*rgba[1]+0.0722*rgba[2];
      return [rgba[0]+(g-rgba[0])*AFTERMATH_CORPSE_DESATURATION,rgba[1]+(g-rgba[1])*AFTERMATH_CORPSE_DESATURATION,rgba[2]+(g-rgba[2])*AFTERMATH_CORPSE_DESATURATION,1];
    }
    if(role==="outline_white"){
      // Brighten the authored white outline slightly so it clearly reads as the light
      // structural edge (the GLB mat/white is ~0.97; lift a touch above the mid-gray fill).
      return [Math.min(1,0.94+0.06),Math.min(1,0.97+0.03),1,1];
    }
    if(role==="outline_charcoal"){
      // Keep the authored charcoal structural part dark (it is already near-black).
      return [record.diffuse.r,record.diffuse.g,record.diffuse.b,1];
    }
    // Any other / unrecognized part: keep the authored source appearance unchanged.
    return [record.diffuse.r,record.diffuse.g,record.diffuse.b,1];
  }
  /** Lazily clone one clip-plane variant per (pool entity, material part, sliceSign, planeLocalY) from the record's pooled material and install the local-X discard blocks (vertical cut — left/right halves, 0.0.56 B10). Both variants are owned and destroyed in the pool/detach teardown. 0.0.60 F1: the key uses the record's unique `materialUid` — the original key interpolated the meshInstance OBJECT ("[object Object]"), so every part of a slice half collided on one cache entry: the first part's clone won and the last part's color painted the whole half flat (flow corpses lost the white outline / charcoal / fill structure; latent since the 0.0.52 clip-plane introduction). 0.0.63 D5: the key also carries `planeLocalY` — the glyph-local Y where the saber blade actually crossed at cut time — so a midpoint cut and an off-center cut for the same glyph produce distinct shader variants (the clip threshold is baked into the GLSL uniform). */
  sliceVariantMaterial(record,sliceSign,planeLocalY=0){
    const key=`${sliceSign}:${this.assetPoolGeneration}:${record.materialUid}:${+planeLocalY.toFixed(4)}`;
    let variant=this.sliceVariantMaterials.get(key);
    if(!variant){variant=record.material.clone();this.installSliceClipBlocks(variant,sliceSign,planeLocalY);this.ownedMaterials.add(variant);this.sliceVariantMaterials.set(key,variant);}
    return variant;
  }
  /** Restore pooled materials after a slice entity is disabled (prevents cross-contamination when the next icon reuses the same pool slot). 0.0.56 B10: also called from `applyAssetAppearance` so that when a LIVE icon acquires a pool slot that still carries a clip-plane variant material from a previous aftermath use, the variant is swapped back to the pooled material BEFORE the live appearance is applied — without this, the live arrow/orb renders with the clip blocks installed and is cut in half. Only restores when the current material is a known slice variant (a value in `sliceVariantMaterials`); externally-installed borrowed materials are left for the normal reconciliation path. */
  restoreSliceMaterials(entity){
    const records=this.assetMaterials.get(entity);if(!records?.length)return;
    for(const record of records){const mat=record.meshInstance.material;if(mat===record.material)continue;let isSliceVariant=false;for(const v of this.sliceVariantMaterials.values())if(v===mat){isSliceVariant=true;break;}if(isSliceVariant){record.meshInstance.material=record.material;this.materialStates.delete(record.meshInstance.material);}}
  }
  /** PlayCanvas 2.21.4 has no ShaderBlock class; the paired shader blocks are injected into the material's `shaderChunks` GLSL map — the engine's own user-block injection points. 0.0.56 B10 follow-up: the cut is a VERTICAL slice down the note's local X axis (left/right halves), not the original top/bottom local-Y cut — Derrick's spec: for a hit DOWN arrow the cut runs from the horizontal middle down to the bottom, and the two SIDES fall while separating left/right. The vertex pair (declaration + `litUserMainStartVS`) feeds object-space X as a `vLocalX_aeroSlice` varying; the fragment pair (declaration + `litUserMainStartPS`) discards the far half of LOCAL X (`vLocalX_aeroSlice * SIGN < 0.0`). SIGN is baked per variant (1 keeps the right half where local X ≥ 0, -1 keeps the left half). 0.0.63 D5: `planeLocalY` offsets the CLIP PLANE along the glyph's local long axis (local Y, tail→head) so the cut sits at the blade's actual crossing point instead of always the midpoint. Because both glyphs (arrow + orb) have their local origin at the CENTER of the shape, the midpoint cut passes through local Y = 0. An off-center cut shifts that plane to local Y = PLANE. The left/right identity of each half is preserved by SIGN: SIGN = +1 keeps local Y ≥ PLANE (the "right" half when reading the glyph top-to-bottom), SIGN = −1 keeps local Y ≤ PLANE. At PLANE = 0 the test collapses to `localY * SIGN < 0`, which is exactly the local-Y split at the midpoint — a CONTINUOUS extension of the old local-X-based midpoint test (both partition the glyph into two disjoint halves that tile the whole shape without overlap or gap). Both variants are still cloned on first use from the record's pooled material; the cache key now also carries `planeLocalY` so a midpoint cut and an off-center cut for the same glyph produce distinct shader variants. `material.update()` flags the chunk map dirty so the variant cache serves a distinct clipped program for this variant only. */
  installSliceClipBlocks(material,sliceSign,planeLocalY=0){
    const sign=sliceSign===1?"1.0":"-1.0";
    const plane=+planeLocalY.toFixed(4);
    material.shaderChunks.glsl.set("litUserDeclarationVS","varying float vLocalY_aeroSlice;\n");
    material.shaderChunks.glsl.set("litUserMainStartVS","vLocalY_aeroSlice = vertex_position.y;\n");
    material.shaderChunks.glsl.set("litUserDeclarationPS","varying float vLocalY_aeroSlice;\n");
    material.shaderChunks.glsl.set("litUserMainStartPS",plane===0
      ? `if (vLocalY_aeroSlice * ${sign} < 0.0) discard;\n`
      : `if ((vLocalY_aeroSlice - (${plane})) * ${sign} < 0.0) discard;\n`);
    material.update();
  }
  /** 0.0.52 W1-C follow-up: fullscreen hazard-contact red vignette. One persistent unlit fullscreen quad on the topmost transparent gameplay layer (above Targets, below product-UI layers); driven per frame by the model's hazard_glow scene object; disabled (zero cost) at zero intensity. Uses a ShaderMaterial with screen-space UV vignette; depth-test OFF so it always composites on top of the gameplay scene. */
  createHazardGlowQuad(){
    if(!this.app||!this.cameraEntity)return;
    // Fullscreen clip-space quad (NDC ±1). `plane` assets carry no UVs, so the vignette position comes straight from the clip coords.
    const quadMesh=new pc.Mesh(this.app.graphicsDevice);
    quadMesh.setPositions([-1,-1,0, 1,-1,0, -1,1,0, 1,1,0]);
    quadMesh.setIndices([0,1,2, 2,1,3]);
    quadMesh.update();
    const material=new pc.ShaderMaterial({
      uniqueName:"aero-hazard-glow-vignette",
      attributes:{a_position:pc.SEMANTIC_POSITION},
      vertexGLSL:"attribute vec3 a_position;varying vec2 vAeroVignetteUv;void main(){vAeroVignetteUv=a_position.xy*0.5+0.5;gl_Position=vec4(a_position.xyz,1.0);}",
      fragmentGLSL:"precision highp float;varying vec2 vAeroVignetteUv;uniform float u_intensity;void main(){float d=distance(vAeroVignetteUv,vec2(0.5));float edge=smoothstep(0.15,0.6,d);vec3 red=vec3(0.90,0.28,0.30);gl_FragColor=vec4(red*edge*u_intensity,edge*u_intensity*0.85);}"
    });
    material.blendType=pc.BLEND_NORMAL;material.depthTest=false;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.setParameter("u_intensity",0);
    this.ownedMaterials.add(material);this.ownedMaterials.add(quadMesh);
    const quad=new pc.Entity("aero-hazard-glow",this.app);
    // Set the mesh via render.meshInstances (the valid PlayCanvas API). Passing `mesh` as an
    // addComponent option is a no-op (not a recognized render-component option) that leaves the
    // quad without a mesh instance (renders nothing, leaks the mesh) and emits a console warning.
    quad.addComponent("render",{material});
    quad.render.meshInstances=[new pc.MeshInstance(quadMesh,material)];
    const renderComp=quad.render;
    /** @type {import("playcanvas").RenderComponent[]} */ const renderComps=[renderComp];
    this.entityMaterials.set(quad,material);
    const layerId=this.gameplayHazardGlowLayer?.id??pc.LAYERID_WORLD;
    for(const component of renderComps)component.layers=[layerId];
    quad.enabled=false;
    this.hazardGlowEntity=quad;this.hazardGlowMaterial=material;
    this.app.root.addChild(quad);
  }
  destroyHazardGlow(){
    if(this.hazardGlowEntity){const meshInstance=this.hazardGlowEntity.render?.meshInstances?.[0];if(meshInstance?.mesh&&this.ownedMaterials.delete(meshInstance.mesh))meshInstance.mesh.destroy();const material=this.entityMaterials.get(this.hazardGlowEntity);if(material&&this.ownedMaterials.delete(material))material.destroy();this.hazardGlowEntity.destroy();this.hazardGlowEntity=null;}
    this.hazardGlowMaterial=null;
  }
  applyHazardGlow(object){
    if(!this.app||this.contextLost)return;
    // The hazard_glow scene object carries the model's computed envelope in `alpha` (AeroHazardGlowVisual rides `aftermath`).
    const intensity=object?.alpha??0;
    if(!this.hazardGlowEntity&&intensity>0)this.createHazardGlowQuad();
    const entity=this.hazardGlowEntity;if(!entity)return;
    const active=intensity>0;
    if(entity.enabled!==active)entity.enabled=active;
    if(!active)return;
    const material=this.hazardGlowMaterial;if(!material)return;
    material.setParameter("u_intensity",intensity);
    material.update();
  }
  applyDrawOrder(entity,order){const records=this.assetMaterials.get(entity);if(records?.length){for(const record of records)record.meshInstance.drawOrder=order+(/edge/iu.test(record.name)?1:0);return;}for(const component of entity.findComponents?.("render")??[])for(const meshInstance of component.meshInstances??[])meshInstance.drawOrder=order;}
  cloneAssetMaterials(entity){const records=[];for(const component of entity.findComponents?.("render")??[]){for(const meshInstance of component.meshInstances??[]){const source=meshInstance.material,material=source.clone();meshInstance.material=material;records.push({meshInstance,materialUid:++this.materialUidCounter,sourceMaterial:source,material,materialOwned:true,name:String(source.name??""),diffuse:source.diffuse?.clone?.()??new pc.Color(1,1,1),emissive:source.emissive?.clone?.()??new pc.Color(0,0,0),opacity:Number(source.opacity??1),blendType:source.blendType,depthWrite:source.depthWrite!==false,useLighting:source.useLighting,cull:source.cull,diffuseMap:source.diffuseMap,emissiveMap:source.emissiveMap,opacityMap:source.opacityMap,diffuseMapChannel:source.diffuseMapChannel,emissiveMapChannel:source.emissiveMapChannel,opacityMapChannel:source.opacityMapChannel});}}this.assetMaterials.set(entity,records);}
  applyAssetAppearance(entity,assetId,colorToken,alpha,forceTint){const rgba=colorTokenToRgba(colorToken,[1,1,1,1]);this.restoreSliceMaterials(entity);for(const record of this.assetMaterials.get(entity)??[]){const material=record.meshInstance.material;if(material!==record.material){if(record.materialOwned)record.material.destroy();record.material=material;record.materialOwned=false;}const materialRole=gameplayAssetMaterialRole(assetId,record.name),marker=assetId==="athlete-marker/sphere-v1",tint=materialRole==="note_fill"||materialRole==="marker_fill"||forceTint&&assetId.startsWith("wall/");let diffuseR=record.diffuse.r,diffuseG=record.diffuse.g,diffuseB=record.diffuse.b,emissiveR=record.emissive.r,emissiveG=record.emissive.g,emissiveB=record.emissive.b;if(marker){if(materialRole==="marker_structure_charcoal"){diffuseR=.025;diffuseG=.032;diffuseB=.045;emissiveR=.025;emissiveG=.032;emissiveB=.045;}else if(materialRole==="marker_structure_white"){diffuseR=.88;diffuseG=.92;diffuseB=.98;emissiveR=.88;emissiveG=.92;emissiveB=.98;}else if(tint){diffuseR=rgba[0];diffuseG=rgba[1];diffuseB=rgba[2];emissiveR=diffuseR;emissiveG=diffuseG;emissiveB=diffuseB;}}else if(tint){diffuseR=rgba[0];diffuseG=rgba[1];diffuseB=rgba[2];emissiveR=rgba[0]*.32;emissiveG=rgba[1]*.32;emissiveB=rgba[2]*.32;}const state={kind:"asset",assetId,materialRole,sourceMaterial:record.sourceMaterial,diffuseR,diffuseG,diffuseB,emissiveR,emissiveG,emissiveB,opacity:record.opacity*alpha*rgba[3],blendType:alpha<1?pc.BLEND_NORMAL:record.blendType,depthWrite:alpha<1?false:record.depthWrite,depthTest:true,useLighting:marker?false:record.useLighting,cull:record.cull,diffuseMap:record.diffuseMap,emissiveMap:record.emissiveMap,opacityMap:record.opacityMap,diffuseMapChannel:record.diffuseMapChannel,emissiveMapChannel:record.emissiveMapChannel,opacityMapChannel:record.opacityMapChannel};if(materialStateIsUnchanged(material,this.materialStates.get(material),state))continue;material.diffuse.set(diffuseR,diffuseG,diffuseB);material.emissive.set(emissiveR,emissiveG,emissiveB);material.opacity=state.opacity;material.blendType=state.blendType;material.depthWrite=state.depthWrite;material.depthTest=state.depthTest;material.useLighting=state.useLighting;material.cull=state.cull;material.diffuseMap=state.diffuseMap;material.emissiveMap=state.emissiveMap;material.opacityMap=state.opacityMap;material.diffuseMapChannel=state.diffuseMapChannel;material.emissiveMapChannel=state.emissiveMapChannel;material.opacityMapChannel=state.opacityMapChannel;material.update();this.materialStates.set(material,state);}}
  acquireMarkerEntity(index){if(this.markerPoolMode!=="ready"){this.destroyMarkerPool();this.markerPoolMode="ready";}while(this.markerPool.length<=index){const resource=this.gameplayAssetLoader.resourceFor("athlete-marker/sphere-v1");if(!resource?.instantiateRenderEntity)return null;const entity=resource.instantiateRenderEntity({castShadows:false,receiveShadows:false});this.cloneAssetMaterials(entity);this.app.root.addChild(entity);this.markerPool.push(entity);}return this.markerPool[index];}
  acquireFallbackMarker(index){if(this.markerPoolMode!=="fallback"){this.destroyMarkerPool();this.markerPoolMode="fallback";}while(this.markerPool.length<=index)this.markerPool.push(this.makeEntity(`fallback-marker-${this.markerPool.length}`,"sphere"));return this.markerPool[index];}
  worldScaleForCssPx(sizeCssPx,position,sourceWorldSize=1){const cameraPosition=this.cameraEntity?.getPosition(),forward=this.cameraEntity?.forward,distance=cameraPosition&&forward?Math.max(.1,(position.x-cameraPosition.x)*forward.x+(position.y-cameraPosition.y)*forward.y+(position.z-cameraPosition.z)*forward.z):5,cssHeight=Math.max(1,this.heightCssPx||((this.canvas?.height??390)/Math.max(.1,this.devicePixelRatio))),pixelsPerUnit=cssHeight/(2*Math.tan((this.cameraEntity?.camera?.fov??48)*Math.PI/360)*distance);return clamp(sizeCssPx/(pixelsPerUnit*Math.max(.001,sourceWorldSize)),.25,6);}
  acquireFeedbackEntity(index,object){while(this.feedbackPool.length<=index)this.feedbackPool.push(this.createFeedbackGlyph());const entry=this.feedbackPool[index],feedback=object.feedback;if(!feedback)return null;entry.root.enabled=true;entry.root.name=object.id;const cameraForward=this.cameraEntity?.forward,position={x:object.position.x+feedback.offsetX,y:object.position.y+feedback.offsetY,z:object.position.z};entry.root.setPosition(position.x-(cameraForward?.x??0)*feedback.depthBias,position.y-(cameraForward?.y??0)*feedback.depthBias,position.z-(cameraForward?.z??-1)*feedback.depthBias);if(this.cameraEntity)entry.root.setRotation(this.cameraEntity.getRotation());const height=this.worldScaleForCssPx(feedback.apparentHeightCssPx*this.tuning.markerScaleFactor,position)*feedback.scale;entry.quad.setLocalScale(height*3,1,height);const material=this.entityMaterials.get(entry.quad),texture=this.feedbackTextureFor(feedback.text);if(material){material.diffuse.set(1,1,1);material.emissive.set(1,1,1);material.diffuseMap=texture;material.emissiveMap=texture;material.opacityMap=texture;material.opacityMapChannel="a";material.opacity=feedback.alpha;material.blendType=pc.BLEND_NORMAL;material.depthTest=true;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();}entry.text=feedback.text;entry.apparentHeightPx=feedback.apparentHeightCssPx*feedback.scale;return entry.root;}
  createFeedbackGlyph(){const root=new pc.Entity(`feedback-${this.feedbackPool.length}`,this.app),quad=this.makeDetachedEntity("feedback-quad","plane");quad.setLocalEulerAngles(90,0,0);root.addChild(quad);this.app.root.addChild(root);return{root,quad,text:"",apparentHeightPx:0};}
  feedbackTextureFor(text){let texture=this.feedbackTextures.get(text);if(texture)return texture;const width=96,height=32,pixels=feedbackGlyphPixels(text,width,height),created=new pc.Texture(this.app.graphicsDevice,{name:`aero-feedback-${text.toLowerCase()}`,width,height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_NEAREST,magFilter:pc.FILTER_NEAREST,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});created.lock().set(pixels);created.unlock();this.feedbackTextures.set(text,created);return created;}
  clearSceneObjects(){for(const entity of this.pool)entity.enabled=false;for(const entries of this.assetPools.values())for(const entity of entries)entity.enabled=false;for(const entries of this.aftermathAssetPools.values())for(const entity of entries)entity.enabled=false;for(const entry of this.feedbackPool)entry.root.enabled=false;this.activeCount=0;this.sceneDiagnostics=emptySceneDiagnostics();}
  destroyPrimitiveEntity(entity){const material=this.entityMaterials.get(entity);if(material&&this.ownedMaterials.delete(material))material.destroy();entity.destroy();}
  destroyMarkerPool(){for(const entity of this.markerPool){const records=this.assetMaterials.get(entity)??[];for(const record of records)if(record.materialOwned)record.material.destroy();if(records.length)entity.destroy();else this.destroyPrimitiveEntity(entity);}this.markerPool=[];this.markerPoolMode="none";}
  destroyEquipmentPools(){for(const entries of this.equipmentPools.values())for(const entity of entries.slice(1)){for(const record of this.assetMaterials.get(entity)??[])if(record.materialOwned)record.material.destroy();const material=this.entityMaterials.get(entity);if(material&&this.ownedMaterials.delete(material))material.destroy();}for(const root of this.equipmentPoseRoots.values())root.destroy();this.equipmentPools.clear();this.equipmentPoseRoots.clear();this.equipmentGlbEntities.clear();this.equipmentPrimitiveChildren.clear();}
  destroyInstantiatedPools(){for(const entries of this.assetPools.values())for(const entity of entries){for(const record of this.assetMaterials.get(entity)??[])if(record.materialOwned)record.material.destroy();entity.destroy();}this.assetPools.clear();for(const entries of this.aftermathAssetPools.values())for(const entity of entries){for(const record of this.assetMaterials.get(entity)??[])if(record.materialOwned)record.material.destroy();entity.destroy();}this.aftermathAssetPools.clear();this.destroyEquipmentPools();this.destroyMarkerPool();for(const entry of this.feedbackPool){this.destroyPrimitiveEntity(entry.quad);entry.root.destroy();}this.feedbackPool=[];for(const texture of this.feedbackTextures.values())texture.destroy();this.feedbackTextures.clear();this.assetPoolGeneration=-1;for(const variant of this.sliceVariantMaterials.values())if(this.ownedMaterials.delete(variant))variant.destroy();this.sliceVariantMaterials.clear();this.materialStates=new WeakMap();this.destroyColliderOverlayPools();}
  /** 0.0.53 W2: destroy the collider-overlay entity pools (primitives + cone meshes). Cone meshes are owned and destroyed alongside their materials. */
  destroyColliderOverlayPools(){
    for(const entity of this.colliderOverlayPrimitivePool??[]){const material=this.entityMaterials.get(entity);if(material&&this.ownedMaterials.delete(material))material.destroy();entity.destroy();}
    this.colliderOverlayPrimitivePool=[];
    for(const entity of this.colliderOverlayConePool??[]){const meshInstance=entity.render?.meshInstances?.[0];if(meshInstance?.mesh&&this.ownedMaterials.delete(meshInstance.mesh))meshInstance.mesh.destroy();const material=this.entityMaterials.get(entity);if(material&&this.ownedMaterials.delete(material))material.destroy();entity.destroy();}
    this.colliderOverlayConePool=[];
    if(this.colliderOverlayConeGeometry)this.colliderOverlayConeGeometry.clear();
  }
  makeDetachedEntity(name,type){const entity=new pc.Entity(name,this.app);const material=this.makeMaterial();entity.addComponent("render",{type,material});this.entityMaterials.set(entity,material);return entity;}
  makeEntity(name,type){const entity=this.makeDetachedEntity(name,type);this.app.root.addChild(entity);return entity;}
  makeMaterial(){const material=new pc.StandardMaterial();material.useLighting=false;material.emissive=new pc.Color(1,1,1);material.diffuse=new pc.Color(1,1,1);material.opacity=1;material.blendType=pc.BLEND_NORMAL;material.depthTest=true;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();this.ownedMaterials.add(material);return material;}
  updateMaterial(entity,colorToken,alpha,iconId,spent,depthWrite=false){const mappedMaterial=this.entityMaterials.get(entity);if(!mappedMaterial)return;const material=entity.findComponents?.("render")?.[0]?.meshInstances?.[0]?.material??mappedMaterial;if(material!==mappedMaterial){if(this.ownedMaterials.delete(mappedMaterial))mappedMaterial.destroy();this.entityMaterials.set(entity,material);}const rgba=colorTokenToRgba(colorToken,[0.85,0.95,1,1]),emissiveFactor=spent?.42:1,state={kind:"primitive",iconId,diffuseR:rgba[0],diffuseG:rgba[1],diffuseB:rgba[2],emissiveR:rgba[0]*emissiveFactor,emissiveG:rgba[1]*emissiveFactor,emissiveB:rgba[2]*emissiveFactor,opacity:alpha*rgba[3],blendType:pc.BLEND_NORMAL,depthTest:true,depthWrite,useLighting:false,cull:pc.CULLFACE_NONE,diffuseMap:null,emissiveMap:null,opacityMap:null,diffuseMapChannel:material.diffuseMapChannel,emissiveMapChannel:material.emissiveMapChannel,opacityMapChannel:material.opacityMapChannel};if(materialStateIsUnchanged(material,this.materialStates.get(material),state))return;material.diffuse.set(state.diffuseR,state.diffuseG,state.diffuseB);material.emissive.set(state.emissiveR,state.emissiveG,state.emissiveB);material.opacity=state.opacity;material.blendType=state.blendType;material.depthTest=state.depthTest;material.depthWrite=state.depthWrite;material.useLighting=state.useLighting;material.cull=state.cull;material.diffuseMap=state.diffuseMap;material.emissiveMap=state.emissiveMap;material.opacityMap=state.opacityMap;material.update();this.materialStates.set(material,state);}
  roleColor(role){return role==="left"?this.theme.leftHandColor:role==="right"?this.theme.rightHandColor:role==="guard"?this.theme.guardColor:role==="obstacle"?this.theme.obstacleColor:role==="safe"?"#56d6c9":this.theme.receptorColor;}
  addOverlayDisc(name,x,y,z,scale,color){const entity=this.makeEntity(name,"sphere");entity.setPosition(x,y,z);entity.setLocalScale(scale,scale,scale);this.updateMaterial(entity,color,1,null,false,false);this.overlayEntities.push(entity);}
  addOverlayLine(a,b,surface,color){const ap=gridPositionForNormalized(a.x/surface.viewportWidth,a.y/surface.viewportHeight,0.43),bp=gridPositionForNormalized(b.x/surface.viewportWidth,b.y/surface.viewportHeight,0.43),ax=ap.x,ay=ap.y,bx=bp.x,by=bp.y,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);const entity=this.makeEntity("landmark-line","box");entity.setPosition((ax+bx)/2,(ay+by)/2,0.43);entity.setLocalScale(0.025,length,0.02);entity.setEulerAngles(0,0,-Math.atan2(dx,dy)*180/Math.PI);this.updateMaterial(entity,color,0.9,null,false,false);this.overlayEntities.push(entity);}
  clearOverlayEntities(){for(const entity of this.overlayEntities)this.destroyPrimitiveEntity(entity);this.overlayEntities=[];for(const entity of this.markerPool)entity.enabled=false;for(const entries of this.equipmentPools.values())for(const entity of entries)entity.enabled=false;this.cursorDiagnostics=Object.freeze({instanceCount:0,assetId:"athlete-marker/sphere-v1",roles:Object.freeze([]),depthTest:true,depthWrite:true});this.equipmentDiagnostics=Object.freeze({instanceCount:0,roles:Object.freeze([]),modes:Object.freeze([]),depthTest:true,depthWrite:false,assetMode:"none"});}
  manualTick(){if(!this.app)return;this.syncEnvironmentAnchor();if(this.atlasRestorePending&&this.iconAtlasData){this.createAtlasTexture();this.atlasRestorePending=false;}const now=globalThis.performance?.now?.()??Date.now();if(!this.appStarted){this.app.renderNextFrame=true;this.app.tick(now);this.app.start();this.appStarted=true;this.app.renderNextFrame=true;this.app.tick(now);}this.app.renderNextFrame=true;this.app.tick(now);projectionReadyRenderers.add(this);}
  applyClearColor(){const rgba=colorTokenToRgba(this.background.colors[0],[0,0,0,0]);this.cameraEntity.camera.clearColor=new pc.Color(rgba[0],rgba[1],rgba[2],this.background.kind==="solid"?rgba[3]:0);}
  getCapabilities(){const degradations=[];if(!this.app)degradations.push("playcanvas_unavailable");const assets=this.gameplayAssetLoader.describe();if(assets.state==="fallback")degradations.push(`gameplay_assets_fallback:${assets.fallbackReason??"unknown"}`);if(assets.state==="error")degradations.push("gameplay_assets_error");return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,playcanvas:Boolean(this.app),engineVersion:"2.21.4",exactContainerResize:true,dprAware:true,contextLossRecovery:true,alphaMaskIcons:Boolean(this.iconTexture),canonicalGameplayAssets:assets.state==="ready",manualRendering:true,secondAnimationFrame:false,liveTuning:true,maxDevicePixelRatio:this.tuning.dprCap,degradations:Object.freeze(degradations)});}
  describe(){const activeIntentCount=new Set([...this.debugKeyboardIntents,...this.debugDomIntents]).size;return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,state:this.state,supported:Boolean(this.app),attached:Boolean(this.canvas&&this.app),contextLost:this.contextLost,destroyed:this.destroyed,frameCount:this.frameCount,drawCount:this.drawCount,contextRestoreCount:this.contextRestoreCount,viewportWidth:this.canvas?.width??0,viewportHeight:this.canvas?.height??0,widthCssPx:this.widthCssPx,heightCssPx:this.heightCssPx,devicePixelRatio:this.devicePixelRatio,themeId:this.themeId,themeVersion:this.themeVersion,themeHash:this.themeHash,tuningId:this.tuning.id,tuningVersion:this.tuning.version,tuningHash:this.tuning.hash,tuningRequiresRegeneration:false,visualProfile:this.visualProfile,visualProfileIdentity:this.visualProfile.identity,visualProfileSettings:this.visualProfile.settings,visualScalesId:[this.tuning.noteScaleFactor,this.tuning.obstacleScaleFactor,this.tuning.bombScaleFactor,this.tuning.markerScaleFactor].map((v)=>String(v)).join("|"),experimental:true,gameplayAssets:this.gameplayAssetLoader.describe(),environment:this.environmentOwner.describe(),sceneVisuals:this.sceneDiagnostics,cursors:this.cursorDiagnostics,equipment:this.equipmentDiagnostics,iconAtlasReady:Boolean(this.iconTexture),iconAtlasError:this.iconAtlasError,errorMessage:this.errorMessage,debugCameraEnabled:this.debugEnabled,debugListenerCount:this.debugListeners.length,debugCaptureMode:this.debugCaptureMode,debugCameraSpeedMode:this.debugGuiSpeedMode,debugCameraBoostActive:this.debugShiftActive||this.debugGuiSpeedMode==="boost",debugActiveIntentCount:activeIntentCount,pointerLockActive:Boolean(this.canvas&&typeof document!=="undefined"&&document.pointerLockElement===this.canvas),pooledEntityCount:this.pool.length,activeEntityCount:this.activeCount,engine:"playcanvas",engineVersion:"2.21.4",manualRendering:true});}
  destroy(){if(this.destroyed)return this.describe();this.destroyed=true;this.detach();this.iconEntries.clear();this.iconAtlasData=null;this.state="destroyed";return this.describe();}
  fail(error){this.state="error";this.errorMessage=error instanceof Error?error.message:"Renderer operation failed";}
}
export function createAeroPlayCanvasRenderer(options){return new AeroPlayCanvasRenderer(options);}
function materialStateIsUnchanged(material,previous,state){if(!previous)return false;const keys=Object.keys(state);if(keys.length!==Object.keys(previous).length||keys.some((key)=>!Object.is(previous[key],state[key])))return false;return Object.is(material.diffuse.r,state.diffuseR)&&Object.is(material.diffuse.g,state.diffuseG)&&Object.is(material.diffuse.b,state.diffuseB)&&Object.is(material.emissive.r,state.emissiveR)&&Object.is(material.emissive.g,state.emissiveG)&&Object.is(material.emissive.b,state.emissiveB)&&Object.is(material.opacity,state.opacity)&&Object.is(material.blendType,state.blendType)&&Object.is(material.depthWrite,state.depthWrite)&&Object.is(material.depthTest,state.depthTest)&&Object.is(material.useLighting,state.useLighting)&&Object.is(material.cull,state.cull)&&Object.is(material.diffuseMap,state.diffuseMap)&&Object.is(material.emissiveMap,state.emissiveMap)&&Object.is(material.opacityMap,state.opacityMap)&&Object.is(material.diffuseMapChannel,state.diffuseMapChannel)&&Object.is(material.emissiveMapChannel,state.emissiveMapChannel)&&Object.is(material.opacityMapChannel,state.opacityMapChannel);}
function emptySceneDiagnostics(){return Object.freeze({sourceMode:"unavailable",assetRelease:null,assetGeneration:0,assetInstanceCounts:Object.freeze({}),fallbackInstanceCount:0,guidance:Object.freeze({mode:"off",visibleBandCount:0,culledBandCount:0}),guardPairs:Object.freeze([]),removals:Object.freeze([]),feedback:Object.freeze([]),renderOrder:Object.freeze([])});}
function buildSceneDiagnostics(objects,guidance,mode,loader,renderedCounts,fallbackCount){const guards=new Map();for(const object of objects)if(object.guardPairKey){const pair=guards.get(object.guardPairKey)??[];pair.push(object);guards.set(object.guardPairKey,pair);}const guardPairs=[...guards.entries()].slice(0,8).map(([targetId,pair])=>{const [left,right]=pair.sort((a,b)=>a.position.x-b.position.x);const same=Boolean(left&&right&&left.assetId===right.assetId&&left.scale.x===right.scale.x&&left.scale.y===right.scale.y&&left.scale.z===right.scale.z&&left.rotationZRad===right.rotationZRad&&left.position.y===right.position.y&&left.position.z===right.position.z&&left.position.x!==right.position.x);return Object.freeze({instanceCount:pair.length,assetId:left?.assetId??null,sameSourceAsset:same,sameMaterial:same,sameScale:same,sameOrientation:same,sameY:same,sameZ:same,xOnlyPlacementDifference:same});});const removals=[...new Map(objects.filter((entry)=>entry.removal&&entry.targetId).map((entry)=>[entry.targetId,entry])).values()].slice(0,8).map((entry)=>Object.freeze({elapsedMs:entry.removal.elapsedMs,durationMs:entry.removal.durationMs,progress:entry.removal.progress}));const feedback=objects.filter((entry)=>entry.feedback).slice(0,4).map((entry)=>Object.freeze({holdMs:entry.feedback.holdMs,fadeMs:entry.feedback.fadeMs,totalMs:entry.feedback.totalMs,elapsedMs:entry.feedback.elapsedMs,alpha:entry.feedback.alpha,depthBias:entry.feedback.depthBias,apparentHeightCssPx:entry.feedback.apparentHeightCssPx,offsetX:entry.feedback.offsetX,offsetY:entry.feedback.offsetY,scale:entry.feedback.scale,animation:entry.feedback.animation,depthTest:true,depthWrite:false}));return Object.freeze({sourceMode:mode,assetRelease:loader.release,assetGeneration:loader.generation,assetInstanceCounts:Object.freeze(Object.fromEntries([...renderedCounts.entries()].sort(([a],[b])=>a.localeCompare(b)))),fallbackInstanceCount:fallbackCount,guidance:Object.freeze({mode:guidance.mode,visibleBandCount:guidance.visibleBandCount,culledBandCount:guidance.culledBandCount}),guardPairs:Object.freeze(guardPairs),removals:Object.freeze(removals),feedback:Object.freeze(feedback),renderOrder:Object.freeze([...new Set(objects.map((entry)=>entry.renderOrder))])});}
const GLYPHS=Object.freeze({G:["01110","10000","10111","10001","01110"],r:["00000","10110","11001","10000","10000"],e:["00000","01110","11111","10000","01110"],a:["00000","01110","00001","01111","01111"],t:["00100","11111","00100","00100","00011"],M:["10001","11011","10101","10001","10001"],i:["00100","00000","00100","00100","00100"],s:["00000","01111","10000","01110","11110"]});
function glyphPatterns(text){return [...text].map((letter)=>GLYPHS[letter]??["11111","10001","00110","00000","00100"]);}
function feedbackGlyphPixels(text,width,height){const pixels=new Uint8Array(width*height*4),patterns=glyphPatterns(text),scaleX=3,scaleY=4,total=patterns.length*6*scaleX-scaleX,startX=Math.floor((width-total)/2),startY=Math.floor((height-5*scaleY)/2),face=text==="Great"?[255,255,255,255]:[229,72,77,255],separation=[23,26,34,255],cells=[];patterns.forEach((pattern,charIndex)=>pattern.forEach((row,rowIndex)=>[...row].forEach((on,columnIndex)=>{if(on==="1")cells.push({x:startX+(charIndex*6+columnIndex)*scaleX,y:startY+rowIndex*scaleY});})));const paint=(x,y,color)=>{if(x<0||x>=width||y<0||y>=height)return;const offset=(y*width+x)*4;pixels.set(color,offset);};for(const cell of cells)for(let y=-1;y<=scaleY;y+=1)for(let x=-1;x<=scaleX;x+=1)paint(cell.x+x,cell.y+y,separation);for(const cell of cells)for(let y=0;y<scaleY;y+=1)for(let x=0;x<scaleX;x+=1)paint(cell.x+x,cell.y+y,face);return pixels;}
function normalizeCameraDeflection(value){if(value===null||value===undefined)return Object.freeze({active:false,xDeflection:0,yDeflection:0});if(!plainData(value)||Reflect.ownKeys(value).length!==3||!Object.hasOwn(value,"active")||!Object.hasOwn(value,"xDeflection")||!Object.hasOwn(value,"yDeflection")||typeof value.active!=="boolean"||![value.xDeflection,value.yDeflection].every((entry)=>typeof entry==="number"&&Number.isFinite(entry)&&entry>=-1&&entry<=1))throw new TypeError("Camera deflection must be an exact sanitized private record");return Object.freeze({active:value.active,xDeflection:Object.is(value.xDeflection,-0)?0:value.xDeflection,yDeflection:Object.is(value.yDeflection,-0)?0:value.yDeflection});}
function applyAxialDeadzone(value,deadzone){const magnitude=Math.abs(value);return magnitude<=deadzone?0:Math.sign(value)*(magnitude-deadzone)/(1-deadzone);}
function moveToward(from,to,maxDelta){return from+clamp(to-from,-maxDelta,maxDelta);}
function gridPositionForNormalized(x,y,z=0){return{x:GRID_LEFT+clamp(x,0,1)*gameplayWorldGrid.columns*GRID_COLUMN_PITCH,y:GRID_TOP-clamp(y,0,1)*gameplayWorldGrid.rows*GRID_ROW_PITCH,z};}
function normalizeCursorGrid(value){if(!plainData(value)||![value.x,value.y,value.width,value.height].every(Number.isFinite)||value.width<=0||value.height<=0||value.x<0||value.y<0||value.x+value.width>1||value.y+value.height>1)throw new TypeError("Gameplay cursor grid is required");return value;}
function adaptResolvedEquipmentRecord(value){return isResolvedEquipmentPose(value)?value:null;}
function plainData(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(value)).every((entry)=>"value"in entry);}
function isOpaqueUppercaseColor(value){return typeof value==="string"&&/^#[0-9A-F]{6}$/u.test(value);}
function finiteNonNegative(value){return Number.isFinite(value)?Math.max(0,value):0;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function normalizeRadians(value){const full=Math.PI*2;return((value+Math.PI)%full+full)%full-Math.PI;}
/** 0.0.61 L-F3: brighten an equipment color token for the saber beam core (toward white, bounded alpha-irrelevant). */
function lightenEquipmentColor(token){const rgba=colorTokenToRgba(token,[0.85,0.95,1,1]);return rgbaToHex([rgba[0]+(1-rgba[0])*0.5,rgba[1]+(1-rgba[1])*0.5,rgba[2]+(1-rgba[2])*0.5,1]);}
function rgbaToHex(color){return`#${color.slice(0,3).map((entry)=>Math.round(clamp(entry,0,1)*255).toString(16).padStart(2,"0")).join("")}`;}
/** 0.0.53 W2: cheap stable signature for one tolerance-cone fan geometry (only rebuilt when it changes). */
function coneGeometrySignature(visual){return`${visual.directionX.toFixed(6)},${visual.directionY.toFixed(6)},${visual.toleranceDegrees},${visual.radius},${visual.vertexCount},${visual.positions[0].toFixed(5)},${visual.positions[1].toFixed(5)}`;}
