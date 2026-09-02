// @ts-check

import * as pc from "playcanvas";
import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { defaultGameplayCameraPose, gameplayCameraPoseArtifactFilename, gameplayCameraPoseArtifactMimeType, normalizeGameplayCameraPose, serializeGameplayCameraPose } from "./gameplay-camera-pose.js";
import { normalizeIconAtlasData } from "./icon-atlas.js";
import { mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
import { buildGameplaySceneModel, defaultRendererThemeTokens } from "./gameplay-scene-model.js";
import { colorTokenToRgba, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererVisualProfile, rendererTuningFromVisualProfile } from "./visual-profiles.js";

export const aeroPlayCanvasRendererServiceId="aero.renderer.playcanvas";
const cursorRoles=Object.freeze(["nose","left_wrist","right_wrist"]);
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

/** One assembly-owned renderer and PlayCanvas Application per connected game. */
export class AeroPlayCanvasRenderer {
  constructor(options={}){
    this.serviceId=aeroPlayCanvasRendererServiceId;
    this.contextAttributes=options.contextAttributes??{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:false};
    this.canvas=null;this.app=null;this.appStarted=false;this.cameraEntity=null;this.fixedCamera=null;this.pool=[];this.activeCount=0;this.zoneEntities=[];this.overlayEntities=[];this.entityMaterials=new WeakMap();
    this.iconAtlasData=null;this.iconEntries=new Map();this.iconTexture=null;this.iconAtlasError=null;this.atlasRestorePending=false;
    this.state="unsupported";this.contextLost=false;this.destroyed=false;this.errorMessage=null;this.frameCount=0;this.drawCount=0;this.contextRestoreCount=0;
    this.widthCssPx=0;this.heightCssPx=0;this.devicePixelRatio=1;this.theme=defaultRendererThemeTokens;this.visualProfile=defaultRendererVisualProfile;this.tuning=rendererTuningFromVisualProfile(this.visualProfile);
    this.themeId="aero.theme.default";this.themeVersion="1";this.themeHash="theme-default";this.background=normalizeBackgroundProjection(null);this.lastModel=null;
    this.debugEnabled=false;this.debugYaw=defaultGameplayCameraPose.rotationEulerDegrees.yYaw*Math.PI/180;this.debugPitch=defaultGameplayCameraPose.rotationEulerDegrees.xPitch*Math.PI/180;this.debugPosition={...defaultGameplayCameraPose.position};this.debugProjection={...defaultGameplayCameraPose.projection};this.debugListeners=[];
    this.debugNow=typeof options.now==="function"?options.now:()=>globalThis.performance?.now?.()??Date.now();this.debugLastFrameTimeMs=null;
    this.debugKeyboardIntents=new Set();this.debugDomIntents=new Set();this.debugShiftActive=false;this.debugGuiSpeedMode="normal";this.debugCaptureMode="none";this.debugTouchToggle=null;this.debugTouchDrag=null;
    this.debugCaptureCursor=null;this.debugCaptureReleasePending=null;this.debugPointerLockRequest=null;this.debugReleaseListener=null;this.debugReleaseWaiters=[];
    this.onContextLost=(event)=>{event.preventDefault();this.contextLost=true;this.state="context_lost";this.atlasRestorePending=Boolean(this.iconAtlasData);this.iconTexture?.destroy();this.iconTexture=null;};
    this.onContextRestored=()=>{if(this.destroyed||!this.app)return;this.contextLost=false;this.contextRestoreCount+=1;this.state="ready";};
  }
  attach(canvas,options=this.contextAttributes){
    if(this.destroyed)return this.describe();
    if(this.canvas===canvas&&this.app)return this.describe();
    this.detach();this.canvas=canvas;this.contextAttributes=options;
    canvas.addEventListener("webglcontextlost",this.onContextLost);canvas.addEventListener("webglcontextrestored",this.onContextRestored);
    try{
      this.app=new pc.Application(canvas,{graphicsDeviceOptions:{...options,alpha:true}});
      this.app.scene.ambientLight=new pc.Color(0.85,0.88,0.95);
      this.app.scene.exposure=1;
      this.cameraEntity=new pc.Entity("aero-athlete-camera",this.app);
      this.cameraEntity.addComponent("camera",{clearColor:new pc.Color(0,0,0,0),clearColorBuffer:true,clearDepthBuffer:true,fov:defaultGameplayCameraPose.projection.verticalFovDegrees,nearClip:defaultGameplayCameraPose.projection.nearClip,farClip:defaultGameplayCameraPose.projection.farClip});
      this.app.root.addChild(this.cameraEntity);this.resetDebugCamera();
      this.createTimingZones();
      if(this.iconAtlasData)this.createAtlasTexture();
      this.app.requestAnimationFrame=()=>{};
      this.state="ready";this.errorMessage=null;
      if(this.widthCssPx||this.heightCssPx)this.applySize();
    }catch(error){this.fail(error);}
    return this.describe();
  }
  detach(){
    this.setDebugCameraEnabled(false);
    if(this.canvas){this.canvas.removeEventListener("webglcontextlost",this.onContextLost);this.canvas.removeEventListener("webglcontextrestored",this.onContextRestored);}
    const app=this.app;this.app=null;this.appStarted=false;this.cameraEntity=null;this.pool=[];this.zoneEntities=[];this.overlayEntities=[];this.iconTexture=null;this.atlasRestorePending=false;this.activeCount=0;
    if(app){try{app.destroy();}catch{}}
    this.canvas=null;this.contextLost=false;if(!this.destroyed)this.state="unsupported";return this.describe();
  }
  resize(size){if(!this.canvas||this.destroyed)return this.describe();this.widthCssPx=finiteNonNegative(size.widthCssPx);this.heightCssPx=finiteNonNegative(size.heightCssPx);const cap=Math.max(1,Math.min(size.maxDevicePixelRatio??this.tuning.dprCap,this.tuning.dprCap));this.devicePixelRatio=Math.max(0.1,Math.min(Number.isFinite(size.devicePixelRatio)?size.devicePixelRatio:1,cap));this.applySize();return this.describe();}
  applySize(){if(!this.canvas)return;const width=Math.max(1,Math.round(this.widthCssPx*this.devicePixelRatio)),height=Math.max(1,Math.round(this.heightCssPx*this.devicePixelRatio));this.canvas.style.width=`${this.widthCssPx}px`;this.canvas.style.height=`${this.heightCssPx}px`;this.canvas.width=width;this.canvas.height=height;if(this.app){this.app.setCanvasFillMode(pc.FILLMODE_NONE,this.widthCssPx,this.heightCssPx);this.app.setCanvasResolution(pc.RESOLUTION_FIXED,width,height);this.app.graphicsDevice.resizeCanvas(width,height);}}
  setTheme(descriptor){if(this.destroyed)return this.describe();const normalized=normalizeRendererTheme(descriptor);const accepted=isThemeDescriptor(descriptor)&&normalized!==defaultRendererThemeTokens;this.theme=normalized;this.themeId=accepted?descriptor.id:"aero.theme.default";this.themeVersion=accepted?descriptor.themeVersion:"1";this.themeHash=accepted?descriptor.contentHash.value:"theme-default";return this.describe();}
  setTuning(value){return this.importTuning(value);}
  importTuning(value){if(this.destroyed)return this.describe();this.visualProfile=normalizeRendererVisualProfile(value);this.tuning=rendererTuningFromVisualProfile(this.visualProfile);return this.describe();}
  resetTuning(){if(!this.destroyed){this.visualProfile=defaultRendererVisualProfile;this.tuning=rendererTuningFromVisualProfile(this.visualProfile);}return this.describe();}
  exportTuning(){return this.visualProfile;}
  getSnapshot(){return this.describe();}
  setBackgroundProjection(value){if(!this.destroyed)this.background=normalizeBackgroundProjection(value);return this.describe();}
  uploadIconAtlas(atlas){if(this.destroyed)return this.describe();try{this.iconAtlasData=normalizeIconAtlasData(atlas);this.iconEntries=new Map(this.iconAtlasData.entries.map((entry)=>[entry.id,entry]));this.iconAtlasError=null;if(this.app)this.createAtlasTexture();}catch(error){this.iconAtlasData=null;this.iconEntries.clear();this.iconTexture?.destroy();this.iconTexture=null;this.iconAtlasError=error instanceof Error?error.message:"Icon atlas is invalid";}return this.describe();}
  createAtlasTexture(){if(!this.app||!this.iconAtlasData)return;this.iconTexture?.destroy();const atlas=this.iconAtlasData;const texture=new pc.Texture(this.app.graphicsDevice,{name:"aero-icon-atlas",width:atlas.width,height:atlas.height,format:pc.PIXELFORMAT_RGBA8,mipmaps:false,minFilter:pc.FILTER_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});const pixels=texture.lock();pixels.set(atlas.pixels);texture.unlock();this.iconTexture=texture;}
  renderGameplayFrame(frame){this.integrateDebugCameraMotion();const model=buildGameplaySceneModel(frame,this.theme,this.tuning);this.lastModel=model;if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),model};try{this.clearOverlayEntities();this.applyCamera(model);this.updateTimingZones(model);this.updateSceneObjects(model.objects);this.applyClearColor();this.manualTick();this.frameCount+=1;this.drawCount+=model.objects.length+3;this.state="running";}catch(error){this.fail(error);}return{status:this.describe(),model};}
  clear(options={}){if(!this.app||this.destroyed)return{status:this.describe()};const color=options.color??[0,0,0,0];this.cameraEntity.camera.clearColor=new pc.Color(...color);this.clearSceneObjects();this.clearOverlayEntities();this.manualTick();this.frameCount+=1;this.state="running";return{status:this.describe()};}
  renderFrame(options={}){return this.clear(options);}
  renderGameplayCursors(cursors,options){const grid=normalizeCursorGrid(options?.grid);if(!Array.isArray(cursors)||cursors.length>12)throw new TypeError("Gameplay cursors cannot exceed 12 candidates");const min=Math.max(0,Math.min(1,Number.isFinite(options?.minConfidence)?options.minConfidence:0.5));const size=Math.max(12,Math.min(64,Number.isFinite(options?.sizeCssPx)?options.sizeCssPx:18));const accepted=new Map();for(const cursor of cursors){if(!plainData(cursor)||Object.keys(cursor).length!==4||!cursorRoles.includes(cursor.role)||accepted.has(cursor.role)||![cursor.x,cursor.y,cursor.confidence].every(Number.isFinite)||cursor.x<0||cursor.x>1||cursor.y<0||cursor.y>1||cursor.confidence<min)continue;accepted.set(cursor.role,cursor);}
    if(!this.app||this.destroyed||this.contextLost)return Object.freeze({status:this.describe(),cursorCount:0,roles:Object.freeze([])});
    this.clearOverlayEntities();const roles=[];for(const role of cursorRoles){const cursor=accepted.get(role);if(!cursor)continue;const x=-3.2+cursor.x*6.4,y=3-cursor.y*3.6;this.addOverlayDisc(`cursor-${role}`,x,y,0.45,size/38,role==="nose"?"#f4c20d":role==="left_wrist"?this.theme.leftHandColor:this.theme.rightHandColor);roles.push(role);}this.manualTick();this.drawCount+=roles.length;return Object.freeze({status:this.describe(),cursorCount:roles.length,roles:Object.freeze(roles)});
  }
  renderLandmarkOverlay(landmarks,options={}){if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),pointCount:0,lineVertexCount:0};this.clearOverlayEntities();const surface=normalizeOverlaySurfaceDescriptor({viewportWidth:this.canvas.width,viewportHeight:this.canvas.height,...options.surface});const min=options.minVisibility??0;const visible=landmarks.filter((entry)=>(typeof entry.v==="number"?entry.v:1)>=min);const byId=new Map(visible.map((entry)=>[entry.id,entry]));const color=rgbaToHex(options.color??[0.24,0.9,0.45,0.95]);for(const landmark of visible){const p=mapNormalizedLandmarkToViewport(landmark,surface);this.addOverlayDisc(`landmark-${landmark.id??this.overlayEntities.length}`,(p.x/surface.viewportWidth-.5)*6.4,(.5-p.y/surface.viewportHeight)*3.6,0.42,(options.pointSize??6)/42,color);}let lines=0;for(const [aId,bId] of options.connections??[]){const a=byId.get(aId),b=byId.get(bId);if(!a||!b)continue;const ap=mapNormalizedLandmarkToViewport(a,surface),bp=mapNormalizedLandmarkToViewport(b,surface);this.addOverlayLine(ap,bp,surface,color);lines+=2;}this.manualTick();this.drawCount+=visible.length+lines/2;this.state="running";return{status:this.describe(),pointCount:visible.length,lineVertexCount:lines};}
  setDebugCameraEnabled(enabled){
    const next=Boolean(enabled)&&!this.destroyed&&Boolean(this.canvas)&&Boolean(this.app);if(this.debugEnabled===next)return this.describe();
    if(!next){this.clearDebugInteractionState(true);this.debugEnabled=false;this.removeDebugListeners();this.resetDebugCamera();return this.describe();}
    this.removeDebugListeners();this.clearDebugInteractionState(true);this.debugEnabled=true;
    const canvas=this.canvas;const on=(target,type,listener,options)=>{target.addEventListener(type,listener,options);this.debugListeners.push(()=>target.removeEventListener(type,listener,options));};
    on(canvas,"contextmenu",(event)=>event.preventDefault());
    on(canvas,"mousedown",(event)=>{if(event.button!==2)return;event.preventDefault();if(this.debugCaptureReleasePending)return;if(this.debugCaptureMode!=="none")this.exitDebugCapture(true);else this.enterDebugPointerCapture();});
    on(document,"pointerlockchange",()=>this.handleDebugPointerLockChange(canvas));
    on(document,"pointerlockerror",()=>this.handleDebugPointerLockError(canvas));
    on(document,"mousemove",(event)=>{if(!this.debugEnabled||this.debugCaptureReleasePending||!debugMouseCaptureModes.includes(this.debugCaptureMode))return;this.applyDebugLookDelta(event.movementX,event.movementY,0.0025);});
    on(window,"keydown",(event)=>{if(!this.debugEnabled)return;if(event.code==="Escape"&&this.debugCaptureMode!=="none"){event.preventDefault();this.exitDebugCapture(true);return;}if(event.code==="ShiftLeft"||event.code==="ShiftRight"){this.debugShiftActive=true;event.preventDefault();return;}const intent=debugKeyIntents[event.code];if(!intent)return;this.debugKeyboardIntents.add(intent);event.preventDefault();});
    on(window,"keyup",(event)=>{if(event.code==="ShiftLeft"||event.code==="ShiftRight"){this.debugShiftActive=false;return;}const intent=debugKeyIntents[event.code];if(intent)this.debugKeyboardIntents.delete(intent);});
    on(window,"blur",()=>this.clearDebugInteractionState(true));
    on(document,"visibilitychange",()=>{if(document.visibilityState==="hidden")this.clearDebugInteractionState(true);});
    on(canvas,"touchstart",(event)=>this.onDebugTouchStart(event),{passive:false});
    on(canvas,"touchmove",(event)=>this.onDebugTouchMove(event),{passive:false});
    on(canvas,"touchend",(event)=>this.onDebugTouchEnd(event),{passive:false});
    on(canvas,"touchcancel",(event)=>this.onDebugTouchCancel(event),{passive:false});
    return this.describe();
  }
  setDebugCameraMovementIntent(intent,active){if(!debugMovementIntents.includes(intent))throw new TypeError(`Unknown debug camera movement intent: ${String(intent)}`);if(typeof active!=="boolean")throw new TypeError("Debug camera movement intent active state must be boolean");if(!this.debugEnabled||this.destroyed)return this.describe();if(active)this.debugDomIntents.add(intent);else this.debugDomIntents.delete(intent);return this.describe();}
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
    if(!this.debugEnabled||!this.canvas||this.debugCaptureReleasePending||this.debugCaptureMode!=="none")return;const canvas=this.canvas;this.captureDebugCursor(canvas);this.debugCaptureMode="fallback";
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
  applyDebugLookDelta(deltaX,deltaY,sensitivity){if(!Number.isFinite(deltaX)||!Number.isFinite(deltaY))return;this.debugYaw=normalizeRadians(this.debugYaw-deltaX*sensitivity);this.debugPitch=clamp(this.debugPitch-deltaY*sensitivity,-1.35,1.35);this.applyDebugPose();}
  onDebugTouchStart(event){
    if(!this.debugEnabled)return;const touches=Array.from(event.touches);
    if(touches.length===2){this.debugTouchDrag=null;this.debugTouchToggle={startedAt:event.timeStamp,points:new Map(touches.map((touch)=>[touch.identifier,{x:touch.clientX,y:touch.clientY}])),moved:false,maxTouches:2};if(this.debugCaptureMode==="touch")event.preventDefault();return;}
    if(touches.length===1&&this.debugCaptureMode==="touch"){const touch=touches[0];this.debugTouchToggle=null;this.debugTouchDrag={identifier:touch.identifier,x:touch.clientX,y:touch.clientY};event.preventDefault();return;}
    if(touches.length>2){this.debugTouchToggle=null;this.debugTouchDrag=null;if(this.debugCaptureMode==="touch")event.preventDefault();}
  }
  onDebugTouchMove(event){
    if(!this.debugEnabled)return;const touches=Array.from(event.touches),toggle=this.debugTouchToggle;
    if(toggle){toggle.maxTouches=Math.max(toggle.maxTouches,touches.length);if(touches.length!==2)toggle.moved=true;for(const touch of touches){const start=toggle.points.get(touch.identifier);if(!start||Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>DEBUG_TOUCH_TAP_MAX_MOVE_PX)toggle.moved=true;}if(this.debugCaptureMode==="touch")event.preventDefault();return;}
    const drag=this.debugTouchDrag;if(this.debugCaptureMode!=="touch"||!drag)return;const touch=touches.find((entry)=>entry.identifier===drag.identifier);if(!touch){this.debugTouchDrag=null;return;}const deltaX=touch.clientX-drag.x,deltaY=touch.clientY-drag.y;drag.x=touch.clientX;drag.y=touch.clientY;this.applyDebugLookDelta(deltaX,deltaY,0.006);event.preventDefault();
  }
  onDebugTouchEnd(event){
    if(!this.debugEnabled)return;const wasTouchCaptured=this.debugCaptureMode==="touch",toggle=this.debugTouchToggle;if(wasTouchCaptured)event.preventDefault();
    if(toggle&&event.touches.length===0){const duration=event.timeStamp-toggle.startedAt,valid=toggle.maxTouches===2&&!toggle.moved&&duration>=0&&duration<=DEBUG_TOUCH_TAP_MAX_MS;this.debugTouchToggle=null;if(valid){if(wasTouchCaptured)this.exitDebugCapture(true);else if(!this.debugCaptureReleasePending){this.exitDebugCapture(true);if(!this.debugCaptureReleasePending)this.debugCaptureMode="touch";}}}
    if(this.debugTouchDrag&&!Array.from(event.touches).some((touch)=>touch.identifier===this.debugTouchDrag.identifier))this.debugTouchDrag=null;
  }
  onDebugTouchCancel(event){if(this.debugCaptureMode==="touch")event.preventDefault();this.debugTouchToggle=null;this.debugTouchDrag=null;}
  integrateDebugCameraMotion(){
    if(!this.debugEnabled){this.debugLastFrameTimeMs=null;return;}const now=Number(this.debugNow());if(!Number.isFinite(now)){this.debugLastFrameTimeMs=null;return;}const previous=this.debugLastFrameTimeMs;this.debugLastFrameTimeMs=now;if(previous===null)return;const deltaSeconds=clamp(now-previous,0,DEBUG_MAX_DELTA_MS)/1000;if(deltaSeconds===0)return;
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
  applyPose(pose){if(!this.cameraEntity)return;const position=pose.position,rotation=pose.rotationEulerDegrees,projection=pose.projection;this.cameraEntity.setPosition(position.x,position.y,position.z);this.cameraEntity.setEulerAngles(rotation.xPitch,rotation.yYaw,rotation.zRoll);this.cameraEntity.camera.fov=projection.verticalFovDegrees;this.cameraEntity.camera.nearClip=projection.nearClip;this.cameraEntity.camera.farClip=projection.farClip;}
  applyDebugPose(){if(!this.cameraEntity)return;this.applyPose(normalizeGameplayCameraPose({schema:defaultGameplayCameraPose.schema,version:defaultGameplayCameraPose.version,coordinateSystem:{...defaultGameplayCameraPose.coordinateSystem},position:{...this.debugPosition},rotationEulerDegrees:{xPitch:this.debugPitch*180/Math.PI,yYaw:this.debugYaw*180/Math.PI,zRoll:0},projection:{...this.debugProjection}}));}
  applyCamera(model){if(!this.cameraEntity)return;if(this.debugEnabled){this.applyDebugPose();return;}this.applyPose(model.camera);}
  createTimingZones(){if(!this.app)return;for(const name of ["late","active","early"]){const entity=this.makeEntity(`timing-${name}`,"box");this.zoneEntities.push(entity);}}
  updateTimingZones(model){for(let index=0;index<3;index+=1){const segment=model.timingZone.segments[index],entity=this.zoneEntities[index];const center=(segment.startZ+segment.endZ)/2;entity.enabled=true;entity.setPosition(0,model.grid.floorY+this.tuning.timingZoneHeight,center);entity.setLocalScale(7.3,this.tuning.timingZoneHeight,Math.max(0.02,segment.endZ-segment.startZ));this.updateMaterial(entity,segment.color,segment.alpha,null,false);}}
  updateSceneObjects(objects){this.activeCount=objects.length;while(this.pool.length<objects.length)this.pool.push(this.makeEntity(`pooled-${this.pool.length}`,"box"));for(let index=0;index<this.pool.length;index+=1){const entity=this.pool[index],object=objects[index];if(!object){entity.enabled=false;continue;}entity.enabled=true;entity.name=object.id;entity.setPosition(object.position.x,object.position.y,object.position.z);entity.setLocalScale(object.scale.x,object.scale.y,object.scale.z);entity.setEulerAngles(object.kind==="icon"?90:0,0,-object.rotationZRad*180/Math.PI);this.updateMaterial(entity,this.roleColor(object.role),object.alpha,object.iconId,object.state==="spent");}}
  clearSceneObjects(){for(const entity of this.pool)entity.enabled=false;for(const zone of this.zoneEntities)zone.enabled=false;this.activeCount=0;}
  makeEntity(name,type){const entity=new pc.Entity(name,this.app);const material=this.makeMaterial();entity.addComponent("render",{type,material});this.entityMaterials.set(entity,material);this.app.root.addChild(entity);return entity;}
  makeMaterial(){const material=new pc.StandardMaterial();material.useLighting=false;material.emissive=new pc.Color(1,1,1);material.diffuse=new pc.Color(1,1,1);material.opacity=1;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();return material;}
  updateMaterial(entity,colorToken,alpha,iconId,spent){const material=this.entityMaterials.get(entity);if(!material)return;const rgba=colorTokenToRgba(colorToken,[0.85,0.95,1,1]);material.diffuse.set(rgba[0],rgba[1],rgba[2]);material.emissive.set(rgba[0]*(spent?0.42:1),rgba[1]*(spent?0.42:1),rgba[2]*(spent?0.42:1));material.opacity=alpha*rgba[3];material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.diffuseMap=null;material.opacityMap=null;if(iconId&&this.iconTexture&&this.iconEntries.has(iconId)){const uv=this.iconEntries.get(iconId);material.diffuseMap=this.iconTexture;material.opacityMap=this.iconTexture;material.opacityMapChannel="a";material.diffuseMapTiling.set(uv.u1-uv.u0,uv.v1-uv.v0);material.diffuseMapOffset.set(uv.u0,1-uv.v1);material.opacityMapTiling.set(uv.u1-uv.u0,uv.v1-uv.v0);material.opacityMapOffset.set(uv.u0,1-uv.v1);}material.update();}
  roleColor(role){return role==="left"?this.theme.leftHandColor:role==="right"?this.theme.rightHandColor:role==="guard"?this.theme.guardColor:role==="obstacle"?this.theme.obstacleColor:role==="safe"?"#56d6c9":this.theme.receptorColor;}
  addOverlayDisc(name,x,y,z,scale,color){const entity=this.makeEntity(name,"sphere");entity.setPosition(x,y,z);entity.setLocalScale(scale,scale,scale);this.updateMaterial(entity,color,1,null,false);this.overlayEntities.push(entity);}
  addOverlayLine(a,b,surface,color){const ax=(a.x/surface.viewportWidth-.5)*6.4,ay=(.5-a.y/surface.viewportHeight)*3.6,bx=(b.x/surface.viewportWidth-.5)*6.4,by=(.5-b.y/surface.viewportHeight)*3.6,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);const entity=this.makeEntity("landmark-line","box");entity.setPosition((ax+bx)/2,(ay+by)/2,0.43);entity.setLocalScale(0.025,length,0.02);entity.setEulerAngles(0,0,-Math.atan2(dx,dy)*180/Math.PI);this.updateMaterial(entity,color,0.9,null,false);this.overlayEntities.push(entity);}
  clearOverlayEntities(){for(const entity of this.overlayEntities)entity.destroy();this.overlayEntities=[];}
  manualTick(){if(!this.app)return;if(this.atlasRestorePending&&this.iconAtlasData){this.createAtlasTexture();this.atlasRestorePending=false;}const now=globalThis.performance?.now?.()??Date.now();if(!this.appStarted){this.app.renderNextFrame=true;this.app.tick(now);this.app.start();this.appStarted=true;this.app.renderNextFrame=true;this.app.tick(now);}this.app.renderNextFrame=true;this.app.tick(now);}
  applyClearColor(){const rgba=colorTokenToRgba(this.background.colors[0],[0,0,0,0]);this.cameraEntity.camera.clearColor=new pc.Color(rgba[0],rgba[1],rgba[2],this.background.kind==="solid"?rgba[3]:0);}
  getCapabilities(){const degradations=[];if(!this.app)degradations.push("playcanvas_unavailable");if(!this.iconTexture)degradations.push(this.iconAtlasError?"icon_atlas_invalid_fallback_shapes":"icon_atlas_unavailable_fallback_shapes");return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,playcanvas:Boolean(this.app),engineVersion:"2.21.4",exactContainerResize:true,dprAware:true,contextLossRecovery:true,alphaMaskIcons:Boolean(this.iconTexture),manualRendering:true,secondAnimationFrame:false,liveTuning:true,maxDevicePixelRatio:this.tuning.dprCap,degradations:Object.freeze(degradations)});}
  describe(){const activeIntentCount=new Set([...this.debugKeyboardIntents,...this.debugDomIntents]).size;return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,state:this.state,supported:Boolean(this.app),attached:Boolean(this.canvas&&this.app),contextLost:this.contextLost,destroyed:this.destroyed,frameCount:this.frameCount,drawCount:this.drawCount,contextRestoreCount:this.contextRestoreCount,viewportWidth:this.canvas?.width??0,viewportHeight:this.canvas?.height??0,widthCssPx:this.widthCssPx,heightCssPx:this.heightCssPx,devicePixelRatio:this.devicePixelRatio,themeId:this.themeId,themeVersion:this.themeVersion,themeHash:this.themeHash,tuningId:this.tuning.id,tuningVersion:this.tuning.version,tuningHash:this.tuning.hash,tuningRequiresRegeneration:false,visualProfile:this.visualProfile,visualProfileIdentity:this.visualProfile.identity,visualProfileSettings:this.visualProfile.settings,experimental:true,iconAtlasReady:Boolean(this.iconTexture),iconAtlasError:this.iconAtlasError,errorMessage:this.errorMessage,debugCameraEnabled:this.debugEnabled,debugListenerCount:this.debugListeners.length,debugCaptureMode:this.debugCaptureMode,debugCameraSpeedMode:this.debugGuiSpeedMode,debugCameraBoostActive:this.debugShiftActive||this.debugGuiSpeedMode==="boost",debugActiveIntentCount:activeIntentCount,pointerLockActive:Boolean(this.canvas&&typeof document!=="undefined"&&document.pointerLockElement===this.canvas),pooledEntityCount:this.pool.length,activeEntityCount:this.activeCount,engine:"playcanvas",engineVersion:"2.21.4",manualRendering:true});}
  destroy(){if(this.destroyed)return this.describe();this.destroyed=true;this.detach();this.iconEntries.clear();this.iconAtlasData=null;this.state="destroyed";return this.describe();}
  fail(error){this.state="error";this.errorMessage=error instanceof Error?error.message:"Renderer operation failed";}
}
export function createAeroPlayCanvasRenderer(options){return new AeroPlayCanvasRenderer(options);}
function normalizeCursorGrid(value){if(!plainData(value)||![value.x,value.y,value.width,value.height].every(Number.isFinite)||value.width<=0||value.height<=0||value.x<0||value.y<0||value.x+value.width>1||value.y+value.height>1)throw new TypeError("Gameplay cursor grid is required");return value;}
function plainData(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(value)).every((entry)=>"value"in entry);}
function finiteNonNegative(value){return Number.isFinite(value)?Math.max(0,value):0;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function normalizeRadians(value){const full=Math.PI*2;return((value+Math.PI)%full+full)%full-Math.PI;}
function rgbaToHex(color){return`#${color.slice(0,3).map((entry)=>Math.round(clamp(entry,0,1)*255).toString(16).padStart(2,"0")).join("")}`;}
