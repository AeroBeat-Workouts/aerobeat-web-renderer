// @ts-check

import * as pc from "playcanvas";
import {sha256Hex} from "@aerobeat/web-hash";
import {gameplayAssets,gameplayAssetInventorySha256,gameplayAssetProofSha256,gameplayAssetReleaseVersion,gameplayAssetSourceCommit,resolveGameplayAssetUrl} from "./gameplay-assets.js";

const terminalStates=Object.freeze(["ready","error","fallback","disposed"]);

/** Generation- and abort-safe preload owner for the seven pinned GLB containers. */
export class PlayCanvasGameplayAssetPreloader{
  constructor(options={}){
    this.fetchFn=options.fetch??globalThis.fetch?.bind(globalThis);
    this.baseUrl=options.baseUrl??import.meta.url;
    this.assetFactory=options.assetFactory??defaultAssetFactory;
    this.loadContainer=options.loadContainer??defaultLoadContainer;
    this.generation=0;this.controller=null;this.app=null;this.records=[];
    this.state="idle";this.errorMessage=null;this.fallbackReason=null;this.loadedIds=[];
  }
  preload(app){
    if(!app||!this.fetchFn) return Promise.resolve(this.fail(new Error("Packaged gameplay asset loading is unavailable")));
    this.disposeRecords();
    this.controller?.abort();
    const generation=++this.generation,controller=new AbortController();
    this.controller=controller;this.app=app;this.state="loading";this.errorMessage=null;this.fallbackReason=null;this.loadedIds=[];
    return this.loadGeneration(app,generation,controller.signal);
  }
  async loadGeneration(app,generation,signal){
    try{
      const staged=await Promise.all(gameplayAssets.map(async(asset)=>{
        const url=resolveGameplayAssetUrl(asset.id,this.baseUrl);
        const response=await this.fetchFn(url,{signal,credentials:"same-origin",cache:"force-cache"});
        if(!response.ok)throw new Error(`Gameplay asset request failed (${response.status}): ${asset.id}`);
        const contents=await response.arrayBuffer();
        if(contents.byteLength!==asset.bytes)throw new Error(`Gameplay asset byte length mismatch: ${asset.id}`);
        const digest=await sha256Hex(contents);
        if(digest!==asset.sha256)throw new Error(`Gameplay asset hash mismatch: ${asset.id}`);
        return{definition:asset,url,contents};
      }));
      this.assertCurrent(app,generation,signal);
      for(const item of staged){
        this.assertCurrent(app,generation,signal);
        const asset=this.assetFactory(item.definition,item.url,item.contents);
        app.assets.add(asset);this.records.push({app,asset,definition:item.definition});
        await this.loadContainer(app,asset,signal);
        this.assertCurrent(app,generation,signal);
        this.loadedIds=[...this.loadedIds,item.definition.id];
      }
      this.state="ready";this.controller=null;
      return this.describe();
    }catch(error){
      if(this.isCurrent(app,generation)&&!isAbort(error)){
        this.disposeRecords();this.controller=null;return this.fail(error);
      }
      return this.describe();
    }
  }
  activateFallback(reason="development_fallback"){
    if(this.state!=="error"&&this.state!=="idle")return this.describe();
    this.fallbackReason=reason;this.state="fallback";return this.describe();
  }
  handleContextLost(){
    this.controller?.abort();this.controller=null;++this.generation;this.disposeRecords();
    if(this.state!=="disposed"){this.state="fallback";this.fallbackReason="context_lost";this.errorMessage=null;}
    return this.describe();
  }
  dispose(){
    this.controller?.abort();this.controller=null;++this.generation;this.disposeRecords();this.app=null;
    this.state="disposed";this.errorMessage=null;this.fallbackReason=null;this.loadedIds=[];
    return this.describe();
  }
  /** Return only a current, fully ready pinned container resource. */
  resourceFor(assetId){
    if(this.state!=="ready"||!this.app)return null;
    const record=this.records.find((entry)=>entry.definition.id===assetId&&entry.app===this.app);
    return record?.asset?.resource??null;
  }
  disposeRecords(){
    for(const {app,asset} of this.records.splice(0)){
      if(!asset.resource)asset.once?.("load",()=>{try{asset.unload?.();}catch{}});
      try{asset.unload?.();}catch{}
      try{app.assets.remove(asset);}catch{}
    }
    this.loadedIds=[];
  }
  fail(error){this.state="error";this.errorMessage=error instanceof Error?error.message:"Gameplay asset preload failed";return this.describe();}
  isCurrent(app,generation){return this.app===app&&this.generation===generation&&this.state==="loading";}
  assertCurrent(app,generation,signal){if(signal.aborted||!this.isCurrent(app,generation))throw new DOMException("Stale gameplay asset preload","AbortError");}
  describe(){return Object.freeze({state:this.state,ready:this.state==="ready"||this.state==="fallback",fallback:this.state==="fallback",fallbackReason:this.fallbackReason,errorMessage:this.errorMessage,release:gameplayAssetReleaseVersion,sourceCommit:gameplayAssetSourceCommit,inventorySha256:gameplayAssetInventorySha256,proofSha256:gameplayAssetProofSha256,generation:this.generation,loadedAssetIds:Object.freeze([...this.loadedIds]),assetCount:gameplayAssets.length,terminal:terminalStates.includes(this.state)});}
}

function defaultAssetFactory(definition,url,contents){return new pc.Asset(`aerobeat-gameplay:${definition.id}`,"container",{url,filename:`${definition.variant}.glb`,hash:definition.sha256,size:definition.bytes,contents});}
function defaultLoadContainer(app,asset,signal){return new Promise((resolve,reject)=>{
  const abort=()=>{cleanup();reject(new DOMException("Gameplay asset preload aborted","AbortError"));};
  const loaded=()=>{cleanup();resolve(asset.resource);};
  const failed=(error)=>{cleanup();reject(error instanceof Error?error:new Error(String(error??"PlayCanvas container load failed")));};
  const cleanup=()=>{signal.removeEventListener("abort",abort);asset.off?.("load",loaded);asset.off?.("error",failed);};
  signal.addEventListener("abort",abort,{once:true});asset.once("load",loaded);asset.once("error",failed);app.assets.load(asset);
});}
function isAbort(error){return error instanceof DOMException&&error.name==="AbortError";}
