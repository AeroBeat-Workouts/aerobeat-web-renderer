// @ts-check

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {PlayCanvasGameplayAssetPreloader,gameplayAssetForRole,gameplayAssetIds,gameplayAssetInventorySha256,gameplayAssetProofSha256,gameplayAssetReleaseVersion,gameplayAssetSet,gameplayAssetSourceCommit,gameplayAssets,resolveGameplayAssetUrl} from "../src/index.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const baseUrl=pathToFileURL(path.join(root,"src/gameplay-assets.js")).href;
assert.equal(gameplayAssetReleaseVersion,"0.0.3");assert.equal(gameplayAssetSourceCommit,"8b8b40593b9deb54d32654e39fd7c1c1c4a9dc1a");assert.equal(gameplayAssetInventorySha256,"69b88d38113a56061dfc0ea5e92ec51a0b181fcade6a99e1dcc5df1baecdde03");assert.equal(gameplayAssetProofSha256,"287adc43a0456782044f0fd7601efd7b5087342972d9da4525923598754b1efc");
assert.equal(gameplayAssets.length,7);assert.equal(new Set(gameplayAssetIds).size,7);assert.ok(Object.isFrozen(gameplayAssets)&&gameplayAssets.every(Object.isFrozen));assert.ok(Object.isFrozen(gameplayAssetSet)&&Object.isFrozen(gameplayAssetSet.roles)&&Object.isFrozen(gameplayAssetSet.constraints));assert.equal(gameplayAssetSet.constraints.guardCanonicalAsset,"guard/shield-v1");assert.equal(gameplayAssetSet.constraints.guardInstancesPerBeat,2);assert.equal(gameplayAssetForRole("guard").id,"guard/shield-v1");assert.throws(()=>gameplayAssetForRole("unknown"),/Unknown gameplay asset role/);assert.throws(()=>resolveGameplayAssetUrl("unknown"),/Unknown gameplay asset identity/);
for(const asset of gameplayAssets)assert.equal(resolveGameplayAssetUrl(asset.id,"https://packages.example/@aerobeat/web-renderer/src/gameplay-assets.js"),`https://packages.example/@aerobeat/web-renderer/assets/gameplay/0.0.3/${asset.path}`);

const fetchLocal=async(url,{signal}={})=>{if(signal?.aborted)throw new DOMException("Aborted","AbortError");const bytes=await readFile(fileURLToPath(url));return new Response(bytes);};
const makeHarness=(options={})=>{const assets={added:[],removed:[],add(asset){this.added.push(asset);},remove(asset){this.removed.push(asset);}};const app={assets};const unloaded=[];const assetFactory=(definition,url,contents)=>({definition,url,contents,unload(){unloaded.push(definition.id);}});return{app,assets,unloaded,loader:new PlayCanvasGameplayAssetPreloader({fetch:options.fetch??fetchLocal,baseUrl,assetFactory,loadContainer:options.loadContainer??(async()=>{})})};};
{
 const {app,assets,loader}=makeHarness();assert.equal(loader.describe().state,"idle");const pending=loader.preload(app);assert.equal(loader.describe().state,"loading");const ready=await pending;assert.equal(ready.state,"ready");assert.equal(ready.ready,true);assert.deepEqual(ready.loadedAssetIds,gameplayAssetIds);assert.equal(assets.added.length,7);
 loader.dispose();assert.equal(loader.describe().state,"disposed");assert.equal(assets.removed.length,7);
}
{
 const {app,loader}=makeHarness({fetch:async()=>new Response("missing",{status:404})});const failed=await loader.preload(app);assert.equal(failed.state,"error");assert.equal(failed.ready,false);assert.match(failed.errorMessage,/request failed/);const fallback=loader.activateFallback("test_fallback");assert.equal(fallback.state,"fallback");assert.equal(fallback.ready,true);assert.equal(fallback.fallbackReason,"test_fallback");
}
{
 let first=true,releaseFirst;const delayed=new Promise((resolve)=>{releaseFirst=resolve;});const fetch=async(url,options)=>{if(first){first=false;await delayed;if(options.signal.aborted)throw new DOMException("Aborted","AbortError");}return fetchLocal(url,options);};const {app,loader}=makeHarness({fetch});const stale=loader.preload(app);const current=loader.preload(app);releaseFirst();const currentResult=await current,staleResult=await stale;assert.equal(currentResult.state,"ready");assert.equal(staleResult.state,"loading","stale generation must return without claiming terminal readiness");assert.equal(loader.describe().generation,2);assert.deepEqual(loader.describe().loadedAssetIds,gameplayAssetIds);
}
{
 const a=makeHarness(),b=makeHarness();await Promise.all([a.loader.preload(a.app),b.loader.preload(b.app)]);a.loader.handleContextLost();assert.equal(a.loader.describe().state,"fallback");assert.equal(a.assets.removed.length,7);assert.equal(b.loader.describe().state,"ready");assert.equal(b.assets.removed.length,0);await a.loader.preload(a.app);assert.equal(a.loader.describe().state,"ready");assert.equal(a.loader.describe().generation,3);
}
for(const asset of gameplayAssets){
 const bytes=await readFile(path.join(root,"assets/gameplay/0.0.3",asset.path)),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString("utf8"));assert.ok(gltf.meshes.every((mesh)=>mesh.primitives.every((primitive)=>!primitive.attributes.NORMAL)),`${asset.id} expected pinned POSITION-only source`);
 if(asset.role==="directional-arrow"){
  assert.equal(gltf.materials.length,3);for(const material of gltf.materials){assert.equal(material.alphaMode,"OPAQUE");assert.equal(material.doubleSided,false);assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],1);assert.deepEqual(material.extras.aerobeat,{blend:"opaque",cull:"back",depthTest:true,depthWrite:true,runtimeTintable:material.name==="mat/tint_base"});}
  assert.deepEqual(gltf.materials.map(({name})=>name),["mat/charcoal","mat/white","mat/tint_base"]);assert.equal(gltf.materials.find(({name})=>name==="mat/white").extras.aerobeat.runtimeTintable,false);
 }
 if(asset.role==="track"){
  const glass=gltf.materials.find(({name})=>name==="mat/blue_glass");assert(glass);assert.equal(glass.alphaMode,"BLEND");assert.equal(glass.doubleSided,false);assert.equal(glass.pbrMetallicRoughness.baseColorFactor[3],.52);assert.deepEqual(glass.extras.aerobeat,{blend:"alpha",cull:"back",depthTest:true,depthWrite:false,order:"after-grid-before-wall"});
 }
}
const parser=await readFile(path.join(root,"node_modules/playcanvas/build/playcanvas/src/framework/parsers/glb-parser.js"),"utf8");assert.match(parser,/if \(!sourceDesc\.hasOwnProperty\(SEMANTIC_NORMAL\)\) \{\s*generateNormals\(sourceDesc, indices\);/u,"pinned PlayCanvas must synthesize omitted GLB normals");
console.log("Pinned gameplay contract, URLs, hashes, lifecycle states, stale rejection, independence, disposal, context reload, and PlayCanvas normal synthesis validation passed.");
