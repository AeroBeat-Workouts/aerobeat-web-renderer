// @ts-check

import * as pc from "playcanvas";

const ENVIRONMENT_ID="luminious-ice-cave-photosphere";
const ENVIRONMENT_MIME_TYPE="image/jpeg";
const ENVIRONMENT_BYTES=2210289;
const ENVIRONMENT_SHA256="ff142b3ce3d3509ab3cfafcfc6a8cc2d3b0ff737852072d3a7aea8075478eed5";
const ENVIRONMENT_PROJECTION="equirectangular";
const ENVIRONMENT_DIMENSIONS=Object.freeze([4096,2048]);
const ENVIRONMENT_CENTER_FORWARD=Object.freeze([0,0,-1]);
const ENVIRONMENT_WORLD_UP=Object.freeze([0,1,0]);
const ENVIRONMENT_RADIUS=30;
const ENVIRONMENT_LATITUDE_BANDS=16;
const ENVIRONMENT_LONGITUDE_BANDS=32;
const ENVIRONMENT_TRIANGLES=ENVIRONMENT_LATITUDE_BANDS*ENVIRONMENT_LONGITUDE_BANDS*2;
const MAX_ENVIRONMENT_URL_LENGTH=2048;
const states=Object.freeze(["idle","loading","ready","error","disposed"]);

/** @typedef {Readonly<{yaw:number,pitch:number,roll:number}>} EnvironmentOrientation */
/** @typedef {Readonly<{id:string,url:string,mimeType:"image/jpeg",bytes:2210289,sha256:string,projection:"equirectangular",dimensions:readonly [4096,2048],orientation:EnvironmentOrientation,centerForward:readonly [0,0,-1],worldUp:readonly [0,1,0]}>} EnvironmentAssetDescriptor */

/** Own one verified, assembly-described photosphere per PlayCanvas application. */
export class PlayCanvasEnvironmentAssetOwner{
  constructor(options={}){
    this.fetchFn=options.fetch??globalThis.fetch?.bind(globalThis);
    this.decodeImage=options.decodeImage??decodeJpeg;
    this.createSphere=options.createSphere??createPhotosphere;
    this.locationHref=options.locationHref??globalThis.location?.href??null;
    this.descriptor=null;this.app=null;this.record=null;this.controller=null;this.generation=0;
    this.state="idle";this.visible=true;this.errorMessage=null;
  }
  setDescriptor(value){
    const descriptor=value===null?null:normalizeEnvironmentDescriptor(value);
    if(sameDescriptor(this.descriptor,descriptor))return Promise.resolve(this.describe());
    this.disposeCurrent();this.descriptor=descriptor;this.errorMessage=null;this.state="idle";
    return this.app&&descriptor?this.loadFresh(this.app):Promise.resolve(this.describe());
  }
  setVisible(visible){
    if(typeof visible!=="boolean")throw new TypeError("Environment visibility must be boolean");
    this.visible=visible;if(this.record?.root)this.record.root.enabled=visible;return this.describe();
  }
  attach(app){
    if(!app)throw new TypeError("Environment owner requires a PlayCanvas application");
    this.disposeCurrent();this.app=app;this.state="idle";this.errorMessage=null;
    return this.descriptor?this.loadFresh(app):Promise.resolve(this.describe());
  }
  restore(app){
    if(!app||app!==this.app)return Promise.resolve(this.describe());
    this.disposeCurrent();this.app=app;this.state="idle";this.errorMessage=null;
    return this.descriptor?this.loadFresh(app):Promise.resolve(this.describe());
  }
  handleContextLost(){
    this.disposeCurrent();if(this.state!=="disposed"){this.state="idle";this.errorMessage=null;}return this.describe();
  }
  dispose(){
    this.disposeCurrent();this.app=null;this.state="disposed";this.errorMessage=null;return this.describe();
  }
  async loadFresh(app){
    const descriptor=this.descriptor;if(!descriptor||!this.fetchFn||this.state==="disposed")return this.fail(new Error("Environment asset loading is unavailable"));
    this.disposeCurrent();this.app=app;const generation=++this.generation,controller=new AbortController();this.controller=controller;this.state="loading";this.errorMessage=null;
    /** @type {{app:unknown,root:pc.Entity|null,material:pc.StandardMaterial|null,texture:pc.Texture|null,mesh:pc.Mesh|null,image:{width:number,height:number,close?:()=>void}|null}|null} */
    let staged=null;
    try{
      const url=resolveSameOriginEnvironmentUrl(descriptor.url,this.locationHref);
      const response=await this.fetchFn(url.href,{signal:controller.signal,credentials:"same-origin",cache:"force-cache",redirect:"error"});
      if(!response.ok)throw new Error(`Environment asset request failed (${response.status})`);
      if(response.redirected)throw new Error("Environment asset redirects are forbidden");
      if(response.url&&new URL(response.url,url).href!==url.href)throw new Error("Environment asset response URL drifted");
      const responseType=(response.headers.get("content-type")??"").split(";",1)[0].trim().toLowerCase();
      if(responseType!==descriptor.mimeType)throw new Error("Environment asset MIME type mismatch");
      const contents=await response.arrayBuffer();
      if(contents.byteLength!==descriptor.bytes)throw new Error("Environment asset byte length mismatch");
      const digest=await sha256Hex(contents);if(digest!==descriptor.sha256)throw new Error("Environment asset hash mismatch");
      this.assertCurrent(app,generation,controller.signal,descriptor);
      const image=await this.decodeImage(new Blob([contents],{type:descriptor.mimeType}),controller.signal);
      staged={app,root:null,material:null,texture:null,mesh:null,image};this.record=staged;
      if(image.width!==descriptor.dimensions[0]||image.height!==descriptor.dimensions[1])throw new Error("Environment asset decoded dimensions mismatch");
      this.assertCurrent(app,generation,controller.signal,descriptor);
      const sphere=this.createSphere(app,image,descriptor);staged.root=sphere.root;staged.material=sphere.material;staged.texture=sphere.texture;staged.mesh=sphere.mesh;
      this.assertCurrent(app,generation,controller.signal,descriptor);
      app.root.addChild(sphere.root);sphere.root.enabled=this.visible;this.state="ready";this.controller=null;return this.describe();
    }catch(error){
      if(staged&&this.record!==staged)this.disposeRecord(staged);
      if(this.isCurrent(app,generation,descriptor)&&!isAbort(error)){this.disposeCurrent();this.app=app;return this.fail(error);}
      return this.describe();
    }
  }
  disposeCurrent(){
    this.controller?.abort();this.controller=null;++this.generation;const record=this.record;this.record=null;if(record)this.disposeRecord(record);
  }
  disposeRecord(record){
    try{record.root?.destroy();}catch{}record.root=null;
    try{record.material?.destroy();}catch{}record.material=null;
    try{record.texture?.destroy();}catch{}record.texture=null;
    try{record.mesh?.destroy();}catch{}record.mesh=null;
    try{record.image?.close?.();}catch{}record.image=null;
  }
  isCurrent(app,generation,descriptor){return this.app===app&&this.generation===generation&&this.descriptor===descriptor&&this.state==="loading";}
  assertCurrent(app,generation,signal,descriptor){if(signal.aborted||!this.isCurrent(app,generation,descriptor))throw new DOMException("Stale environment asset load","AbortError");}
  fail(error){this.state="error";this.errorMessage=error instanceof Error?boundedError(error.message):"Environment asset load failed";return this.describe();}
  describe(){const active=this.state==="ready"&&Boolean(this.record?.root);return Object.freeze({id:this.descriptor?.id??null,state:states.includes(this.state)?this.state:"error",visible:this.visible,fallback:Boolean(this.descriptor)&&this.state!=="ready",hash:this.descriptor?.sha256??null,count:active?1:0,projection:this.descriptor?.projection??null});}
}

export function normalizeEnvironmentDescriptor(value){
  if(!plainData(value)||!exactKeys(value,["id","url","mimeType","bytes","sha256","projection","dimensions","orientation","centerForward","worldUp"]))throw new TypeError("Environment descriptor shape is invalid");
  if(value.id!==ENVIRONMENT_ID)throw new TypeError("Environment id is invalid");
  if(typeof value.url!=="string"||!value.url||value.url.length>MAX_ENVIRONMENT_URL_LENGTH)throw new TypeError("Environment URL is invalid");
  if(value.mimeType!==ENVIRONMENT_MIME_TYPE)throw new TypeError("Environment MIME type is invalid");
  if(value.bytes!==ENVIRONMENT_BYTES)throw new TypeError("Environment byte length is invalid");
  if(value.sha256!==ENVIRONMENT_SHA256)throw new TypeError("Environment SHA-256 is invalid");
  if(value.projection!==ENVIRONMENT_PROJECTION)throw new TypeError("Environment projection is invalid");
  const dimensions=exactVector(value.dimensions,ENVIRONMENT_DIMENSIONS,"dimensions");
  if(!plainData(value.orientation)||!exactKeys(value.orientation,["yaw","pitch","roll"])||value.orientation.yaw!==0||value.orientation.pitch!==0||value.orientation.roll!==0)throw new TypeError("Environment orientation is invalid");
  const centerForward=exactVector(value.centerForward,ENVIRONMENT_CENTER_FORWARD,"centerForward"),worldUp=exactVector(value.worldUp,ENVIRONMENT_WORLD_UP,"worldUp");
  return Object.freeze({id:value.id,url:value.url,mimeType:value.mimeType,bytes:value.bytes,sha256:value.sha256,projection:value.projection,dimensions,orientation:Object.freeze({yaw:0,pitch:0,roll:0}),centerForward,worldUp});
}

export function resolveSameOriginEnvironmentUrl(value,locationHref=globalThis.location?.href??null){
  if(!locationHref)throw new Error("Environment same-origin validation is unavailable");
  const base=new URL(locationHref),url=new URL(value,base);
  if(!["http:","https:"].includes(url.protocol)||url.origin!==base.origin||url.username||url.password||url.hash)throw new TypeError("Environment URL must be a same-origin packaged HTTP(S) URL");
  return url;
}

function createPhotosphere(app,image,descriptor){
  const geometry=new pc.SphereGeometry({radius:ENVIRONMENT_RADIUS,latitudeBands:ENVIRONMENT_LATITUDE_BANDS,longitudeBands:ENVIRONMENT_LONGITUDE_BANDS,calculateTangents:false});
  for(let index=0;index<geometry.positions.length;index+=3){geometry.positions[index]*=-1;geometry.positions[index+2]*=-1;geometry.normals[index]*=-1;geometry.normals[index+2]*=-1;}
  for(let index=0;index<geometry.uvs.length;index+=2)geometry.uvs[index]=1-geometry.uvs[index];
  geometry.uvs1=geometry.uvs;
  const mesh=pc.Mesh.fromGeometry(app.graphicsDevice,geometry);
  const texture=new pc.Texture(app.graphicsDevice,{name:`aerobeat-environment:${descriptor.id}`,width:descriptor.dimensions[0],height:descriptor.dimensions[1],format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_REPEAT,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
  texture.setSource(image);
  const material=new pc.StandardMaterial();material.name=`aerobeat-environment:${descriptor.id}:unlit`;material.useLighting=false;material.useSkybox=false;material.emissive=new pc.Color(1,1,1);material.emissiveMap=texture;material.diffuse=new pc.Color(0,0,0);material.blendType=pc.BLEND_NONE;material.opacity=1;material.depthTest=false;material.depthWrite=false;material.cull=pc.CULLFACE_FRONT;material.update();
  const root=new pc.Entity("aero-environment-photosphere",app),meshInstance=new pc.MeshInstance(mesh,material);meshInstance.cull=false;meshInstance.drawOrder=0;
  root.addComponent("render",{meshInstances:[meshInstance],layers:[pc.LAYERID_SKYBOX],castShadows:false,receiveShadows:false});
  root.setPosition(.05,1,5);root.setEulerAngles(descriptor.orientation.pitch,descriptor.orientation.yaw,descriptor.orientation.roll);
  root.tags.add("aerobeat-environment-background");
  return{root,material,texture,mesh,triangleCount:ENVIRONMENT_TRIANGLES};
}

async function decodeJpeg(blob,signal){
  if(typeof globalThis.createImageBitmap!=="function")throw new Error("Local JPEG decoding is unavailable");
  const image=await globalThis.createImageBitmap(blob);if(signal.aborted){image.close();throw new DOMException("Environment JPEG decode aborted","AbortError");}return image;
}
async function sha256Hex(contents){const subtle=globalThis.crypto?.subtle;if(!subtle)throw new Error("SHA-256 verification is unavailable");return[...new Uint8Array(await subtle.digest("SHA-256",contents))].map((value)=>value.toString(16).padStart(2,"0")).join("");}
function exactVector(value,expected,name){if(!Array.isArray(value)||value.length!==expected.length||!value.every((entry,index)=>Object.is(entry,expected[index])))throw new TypeError(`Environment ${name} is invalid`);return Object.freeze([...value]);}
function exactKeys(value,keys){const actual=Object.keys(value).sort(),expected=[...keys].sort();return actual.length===expected.length&&actual.every((entry,index)=>entry===expected[index]);}
function plainData(value){if(!value||typeof value!=="object"||Array.isArray(value))return false;const prototype=Object.getPrototypeOf(value);return prototype===Object.prototype||prototype===null;}
function sameDescriptor(left,right){return left===right||Boolean(left&&right&&left.id===right.id&&left.url===right.url&&left.mimeType===right.mimeType&&left.bytes===right.bytes&&left.sha256===right.sha256&&left.projection===right.projection&&JSON.stringify(left.dimensions)===JSON.stringify(right.dimensions)&&JSON.stringify(left.orientation)===JSON.stringify(right.orientation)&&JSON.stringify(left.centerForward)===JSON.stringify(right.centerForward)&&JSON.stringify(left.worldUp)===JSON.stringify(right.worldUp));}
function boundedError(message){const text=String(message||"Environment asset load failed").replaceAll(/https?:\/\/\S+/gu,"[url]");return text.slice(0,160);}
function isAbort(error){return error instanceof DOMException&&error.name==="AbortError";}
