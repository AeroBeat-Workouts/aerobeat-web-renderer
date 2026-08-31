// @ts-check

import * as pc from "playcanvas";
import { isThemeDescriptor } from "@aerobeat/web-contracts/theme-contracts";
import { normalizeIconAtlasData } from "./icon-atlas.js";
import { mapNormalizedLandmarkToViewport, normalizeOverlaySurfaceDescriptor } from "./landmark-mapping.js";
import { buildGameplaySceneModel, defaultRendererThemeTokens } from "./gameplay-scene-model.js";
import { colorTokenToRgba, defaultRendererVisualProfile, normalizeBackgroundProjection, normalizeRendererTheme, normalizeRendererVisualProfile, rendererTuningFromVisualProfile } from "./visual-profiles.js";

export const aeroPlayCanvasRendererServiceId="aero.renderer.playcanvas";
const cursorRoles=Object.freeze(["nose","left_wrist","right_wrist"]);

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
    this.debugEnabled=false;this.debugYaw=0;this.debugPitch=0;this.debugPosition={x:0,y:3.15,z:-7.8};this.debugListeners=[];
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
      this.cameraEntity.addComponent("camera",{clearColor:new pc.Color(0,0,0,0),clearColorBuffer:true,clearDepthBuffer:true,fov:48,nearClip:0.1,farClip:80});
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
  renderGameplayFrame(frame){const model=buildGameplaySceneModel(frame,this.theme,this.tuning);this.lastModel=model;if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),model};try{this.clearOverlayEntities();this.applyCamera(model);this.updateTimingZones(model);this.updateSceneObjects(model.objects);this.applyClearColor();this.manualTick();this.frameCount+=1;this.drawCount+=model.objects.length+3;this.state="running";}catch(error){this.fail(error);}return{status:this.describe(),model};}
  clear(options={}){if(!this.app||this.destroyed)return{status:this.describe()};const color=options.color??[0,0,0,0];this.cameraEntity.camera.clearColor=new pc.Color(...color);this.clearSceneObjects();this.clearOverlayEntities();this.manualTick();this.frameCount+=1;this.state="running";return{status:this.describe()};}
  renderFrame(options={}){return this.clear(options);}
  renderGameplayCursors(cursors,options){const grid=normalizeCursorGrid(options?.grid);if(!Array.isArray(cursors)||cursors.length>12)throw new TypeError("Gameplay cursors cannot exceed 12 candidates");const min=Math.max(0,Math.min(1,Number.isFinite(options?.minConfidence)?options.minConfidence:0.5));const size=Math.max(12,Math.min(64,Number.isFinite(options?.sizeCssPx)?options.sizeCssPx:18));const accepted=new Map();for(const cursor of cursors){if(!plainData(cursor)||Object.keys(cursor).length!==4||!cursorRoles.includes(cursor.role)||accepted.has(cursor.role)||![cursor.x,cursor.y,cursor.confidence].every(Number.isFinite)||cursor.x<0||cursor.x>1||cursor.y<0||cursor.y>1||cursor.confidence<min)continue;accepted.set(cursor.role,cursor);}
    if(!this.app||this.destroyed||this.contextLost)return Object.freeze({status:this.describe(),cursorCount:0,roles:Object.freeze([])});
    this.clearOverlayEntities();const roles=[];for(const role of cursorRoles){const cursor=accepted.get(role);if(!cursor)continue;const x=-3.2+cursor.x*6.4,y=3-cursor.y*3.6;this.addOverlayDisc(`cursor-${role}`,x,y,-0.45,size/38,role==="nose"?"#f4c20d":role==="left_wrist"?this.theme.leftHandColor:this.theme.rightHandColor);roles.push(role);}this.manualTick();this.drawCount+=roles.length;return Object.freeze({status:this.describe(),cursorCount:roles.length,roles:Object.freeze(roles)});
  }
  renderLandmarkOverlay(landmarks,options={}){if(!this.app||this.destroyed||this.contextLost)return{status:this.describe(),pointCount:0,lineVertexCount:0};this.clearOverlayEntities();const surface=normalizeOverlaySurfaceDescriptor({viewportWidth:this.canvas.width,viewportHeight:this.canvas.height,...options.surface});const min=options.minVisibility??0;const visible=landmarks.filter((entry)=>(typeof entry.v==="number"?entry.v:1)>=min);const byId=new Map(visible.map((entry)=>[entry.id,entry]));const color=rgbaToHex(options.color??[0.24,0.9,0.45,0.95]);for(const landmark of visible){const p=mapNormalizedLandmarkToViewport(landmark,surface);this.addOverlayDisc(`landmark-${landmark.id??this.overlayEntities.length}`,(p.x/surface.viewportWidth-.5)*6.4,(.5-p.y/surface.viewportHeight)*3.6,-0.42,(options.pointSize??6)/42,color);}let lines=0;for(const [aId,bId] of options.connections??[]){const a=byId.get(aId),b=byId.get(bId);if(!a||!b)continue;const ap=mapNormalizedLandmarkToViewport(a,surface),bp=mapNormalizedLandmarkToViewport(b,surface);this.addOverlayLine(ap,bp,surface,color);lines+=2;}this.manualTick();this.drawCount+=visible.length+lines/2;this.state="running";return{status:this.describe(),pointCount:visible.length,lineVertexCount:lines};}
  setDebugCameraEnabled(enabled){const next=Boolean(enabled)&&!this.destroyed&&Boolean(this.canvas)&&Boolean(this.app);if(this.debugEnabled===next)return this.describe();this.removeDebugListeners();this.debugEnabled=next;if(!next){if(typeof document!=="undefined"&&document.pointerLockElement===this.canvas)document.exitPointerLock?.();this.resetDebugCamera();return this.describe();}
    const canvas=this.canvas;const on=(target,type,listener,options)=>{target.addEventListener(type,listener,options);this.debugListeners.push(()=>target.removeEventListener(type,listener,options));};
    on(canvas,"contextmenu",(event)=>{if(this.debugEnabled)event.preventDefault();});
    on(canvas,"mousedown",(event)=>{if(this.debugEnabled&&event.button===2)canvas.requestPointerLock?.();});
    on(document,"mousemove",(event)=>{if(!this.debugEnabled||document.pointerLockElement!==canvas)return;this.debugYaw-=event.movementX*0.0025;this.debugPitch=clamp(this.debugPitch-event.movementY*0.0025,-1.35,1.35);this.applyDebugPose();});
    on(window,"keydown",(event)=>{if(!this.debugEnabled||!["KeyW","KeyA","KeyS","KeyD","KeyQ","KeyE","ShiftLeft","ShiftRight"].includes(event.code))return;const speed=event.shiftKey?1.2:0.35;if(event.code==="KeyW")this.debugPosition.z+=speed;if(event.code==="KeyS")this.debugPosition.z-=speed;if(event.code==="KeyA")this.debugPosition.x-=speed;if(event.code==="KeyD")this.debugPosition.x+=speed;if(event.code==="KeyQ")this.debugPosition.y-=speed;if(event.code==="KeyE")this.debugPosition.y+=speed;this.applyDebugPose();});
    return this.describe();
  }
  resetDebugCamera(){this.debugYaw=0;this.debugPitch=-0.13;this.debugPosition={x:0,y:3.15,z:-7.8};if(this.cameraEntity){this.cameraEntity.setPosition(this.debugPosition.x,this.debugPosition.y,this.debugPosition.z);this.cameraEntity.lookAt(0,1.05,8);}return this.describe();}
  removeDebugListeners(){for(const remove of this.debugListeners.splice(0))remove();}
  applyDebugPose(){if(!this.cameraEntity)return;this.cameraEntity.setPosition(this.debugPosition.x,this.debugPosition.y,this.debugPosition.z);this.cameraEntity.setEulerAngles(this.debugPitch*180/Math.PI,this.debugYaw*180/Math.PI,0);}
  applyCamera(model){if(!this.cameraEntity)return;if(this.debugEnabled){this.applyDebugPose();return;}const p=model.camera.position,t=model.camera.target;this.cameraEntity.setPosition(p.x,p.y,p.z);this.cameraEntity.lookAt(t.x,t.y,t.z);this.cameraEntity.camera.fov=model.camera.fov;}
  createTimingZones(){if(!this.app)return;for(const name of ["late","active","early"]){const entity=this.makeEntity(`timing-${name}`,"box");this.zoneEntities.push(entity);}}
  updateTimingZones(model){for(let index=0;index<3;index+=1){const segment=model.timingZone.segments[index],entity=this.zoneEntities[index];const center=(segment.startZ+segment.endZ)/2;entity.enabled=true;entity.setPosition(0,model.grid.floorY+this.tuning.timingZoneHeight,center);entity.setLocalScale(7.3,this.tuning.timingZoneHeight,Math.max(0.02,segment.endZ-segment.startZ));this.updateMaterial(entity,segment.color,segment.alpha,null,false);}}
  updateSceneObjects(objects){this.activeCount=objects.length;while(this.pool.length<objects.length)this.pool.push(this.makeEntity(`pooled-${this.pool.length}`,"box"));for(let index=0;index<this.pool.length;index+=1){const entity=this.pool[index],object=objects[index];if(!object){entity.enabled=false;continue;}entity.enabled=true;entity.name=object.id;entity.setPosition(object.position.x,object.position.y,object.position.z);entity.setLocalScale(object.scale.x,object.scale.y,object.scale.z);entity.setEulerAngles(object.kind==="icon"?90:0,0,-object.rotationZRad*180/Math.PI);this.updateMaterial(entity,this.roleColor(object.role),object.alpha,object.iconId,object.state==="spent");}}
  clearSceneObjects(){for(const entity of this.pool)entity.enabled=false;for(const zone of this.zoneEntities)zone.enabled=false;this.activeCount=0;}
  makeEntity(name,type){const entity=new pc.Entity(name,this.app);const material=this.makeMaterial();entity.addComponent("render",{type,material});this.entityMaterials.set(entity,material);this.app.root.addChild(entity);return entity;}
  makeMaterial(){const material=new pc.StandardMaterial();material.useLighting=false;material.emissive=new pc.Color(1,1,1);material.diffuse=new pc.Color(1,1,1);material.opacity=1;material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();return material;}
  updateMaterial(entity,colorToken,alpha,iconId,spent){const material=this.entityMaterials.get(entity);if(!material)return;const rgba=colorTokenToRgba(colorToken,[0.85,0.95,1,1]);material.diffuse.set(rgba[0],rgba[1],rgba[2]);material.emissive.set(rgba[0]*(spent?0.42:1),rgba[1]*(spent?0.42:1),rgba[2]*(spent?0.42:1));material.opacity=alpha*rgba[3];material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.diffuseMap=null;material.opacityMap=null;if(iconId&&this.iconTexture&&this.iconEntries.has(iconId)){const uv=this.iconEntries.get(iconId);material.diffuseMap=this.iconTexture;material.opacityMap=this.iconTexture;material.opacityMapChannel="a";material.diffuseMapTiling.set(uv.u1-uv.u0,uv.v1-uv.v0);material.diffuseMapOffset.set(uv.u0,1-uv.v1);material.opacityMapTiling.set(uv.u1-uv.u0,uv.v1-uv.v0);material.opacityMapOffset.set(uv.u0,1-uv.v1);}material.update();}
  roleColor(role){return role==="left"?this.theme.leftHandColor:role==="right"?this.theme.rightHandColor:role==="guard"?this.theme.guardColor:role==="obstacle"?this.theme.obstacleColor:role==="safe"?"#56d6c9":this.theme.receptorColor;}
  addOverlayDisc(name,x,y,z,scale,color){const entity=this.makeEntity(name,"sphere");entity.setPosition(x,y,z);entity.setLocalScale(scale,scale,scale);this.updateMaterial(entity,color,1,null,false);this.overlayEntities.push(entity);}
  addOverlayLine(a,b,surface,color){const ax=(a.x/surface.viewportWidth-.5)*6.4,ay=(.5-a.y/surface.viewportHeight)*3.6,bx=(b.x/surface.viewportWidth-.5)*6.4,by=(.5-b.y/surface.viewportHeight)*3.6,dx=bx-ax,dy=by-ay,length=Math.hypot(dx,dy);const entity=this.makeEntity("landmark-line","box");entity.setPosition((ax+bx)/2,(ay+by)/2,-0.43);entity.setLocalScale(0.025,length,0.02);entity.setEulerAngles(0,0,-Math.atan2(dx,dy)*180/Math.PI);this.updateMaterial(entity,color,0.9,null,false);this.overlayEntities.push(entity);}
  clearOverlayEntities(){for(const entity of this.overlayEntities)entity.destroy();this.overlayEntities=[];}
  manualTick(){if(!this.app)return;if(this.atlasRestorePending&&this.iconAtlasData){this.createAtlasTexture();this.atlasRestorePending=false;}const now=globalThis.performance?.now?.()??Date.now();if(!this.appStarted){this.app.renderNextFrame=true;this.app.tick(now);this.app.start();this.appStarted=true;this.app.renderNextFrame=true;this.app.tick(now);}this.app.renderNextFrame=true;this.app.tick(now);}
  applyClearColor(){const rgba=colorTokenToRgba(this.background.colors[0],[0,0,0,0]);this.cameraEntity.camera.clearColor=new pc.Color(rgba[0],rgba[1],rgba[2],this.background.kind==="solid"?rgba[3]:0);}
  getCapabilities(){const degradations=[];if(!this.app)degradations.push("playcanvas_unavailable");if(!this.iconTexture)degradations.push(this.iconAtlasError?"icon_atlas_invalid_fallback_shapes":"icon_atlas_unavailable_fallback_shapes");return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,playcanvas:Boolean(this.app),engineVersion:"2.21.4",exactContainerResize:true,dprAware:true,contextLossRecovery:true,alphaMaskIcons:Boolean(this.iconTexture),manualRendering:true,secondAnimationFrame:false,liveTuning:true,maxDevicePixelRatio:this.tuning.dprCap,degradations:Object.freeze(degradations)});}
  describe(){return Object.freeze({serviceId:aeroPlayCanvasRendererServiceId,state:this.state,supported:Boolean(this.app),attached:Boolean(this.canvas&&this.app),contextLost:this.contextLost,destroyed:this.destroyed,frameCount:this.frameCount,drawCount:this.drawCount,contextRestoreCount:this.contextRestoreCount,viewportWidth:this.canvas?.width??0,viewportHeight:this.canvas?.height??0,widthCssPx:this.widthCssPx,heightCssPx:this.heightCssPx,devicePixelRatio:this.devicePixelRatio,themeId:this.themeId,themeVersion:this.themeVersion,themeHash:this.themeHash,tuningId:this.tuning.id,tuningVersion:this.tuning.version,tuningHash:this.tuning.hash,tuningRequiresRegeneration:false,visualProfile:this.visualProfile,visualProfileIdentity:this.visualProfile.identity,visualProfileSettings:this.visualProfile.settings,experimental:true,iconAtlasReady:Boolean(this.iconTexture),iconAtlasError:this.iconAtlasError,errorMessage:this.errorMessage,debugCameraEnabled:this.debugEnabled,debugListenerCount:this.debugListeners.length,pointerLockActive:typeof document!=="undefined"&&document.pointerLockElement===this.canvas,pooledEntityCount:this.pool.length,activeEntityCount:this.activeCount,engine:"playcanvas",engineVersion:"2.21.4",manualRendering:true});}
  destroy(){if(this.destroyed)return this.describe();this.destroyed=true;this.detach();this.iconEntries.clear();this.iconAtlasData=null;this.state="destroyed";return this.describe();}
  fail(error){this.state="error";this.errorMessage=error instanceof Error?error.message:"Renderer operation failed";}
}
export function createAeroPlayCanvasRenderer(options){return new AeroPlayCanvasRenderer(options);}
function normalizeCursorGrid(value){if(!plainData(value)||![value.x,value.y,value.width,value.height].every(Number.isFinite)||value.width<=0||value.height<=0||value.x<0||value.y<0||value.x+value.width>1||value.y+value.height>1)throw new TypeError("Gameplay cursor grid is required");return value;}
function plainData(value){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(value)).every((entry)=>"value"in entry);}
function finiteNonNegative(value){return Number.isFinite(value)?Math.max(0,value):0;}
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function rgbaToHex(color){return`#${color.slice(0,3).map((entry)=>Math.round(clamp(entry,0,1)*255).toString(16).padStart(2,"0")).join("")}`;}
