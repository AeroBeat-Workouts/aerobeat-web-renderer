// @ts-check

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {PlayCanvasGameplayAssetPreloader,gameplayAssetForRole,gameplayAssetIds,gameplayAssetInventorySha256,gameplayAssetProofSha256,gameplayAssetReleaseVersion,gameplayAssetSet,gameplayAssetSourceCommit,gameplayAssets,resolveGameplayAssetUrl} from "../src/index.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const baseUrl=pathToFileURL(path.join(root,"src/gameplay-assets.js")).href;
assert.equal(gameplayAssetReleaseVersion,"0.0.4");assert.equal(gameplayAssetSourceCommit,"32e0fc71c55f999a1fb16abf73dcb768b8294b3a");assert.equal(gameplayAssetInventorySha256,"efecf985fd1bc1024c9ffcb64faf92b76f3492df4f8ffa10e53277d5bac18698");assert.equal(gameplayAssetProofSha256,"c1916a14d90aef230747185ed823c17bcae0e91229929595599f1bd3aee6e97b");
const releaseInventory=JSON.parse(await readFile(path.join(root,"assets/gameplay/0.0.4/inventory.v1.json"),"utf8")),releaseProof=JSON.parse(await readFile(path.join(root,"assets/gameplay/0.0.4/proof.v1.json"),"utf8"));assert.equal(releaseInventory.payload.find(({path:relative})=>relative==="sets/default-v1.json").sha256,"412092d4e9b8ee8069865ec95b9649929027b8e703e8a71a8e8ab5953089a0e3");assert.deepEqual(releaseProof.claims.directional_arrow,{alpha_mode:"OPAQUE",coplanar_overlapping_caps:false,depth_test:true,depth_write:true,opacity:1,renderer_y_flip:false,runtime_tint_targets:["red","yellow","green"],screen_direction_rotation_degrees:{down:180,"down-left":135,"down-right":-135,left:90,right:-90,up:0,"up-left":45,"up-right":-45},styled_faces:["+Z","-Z"]});
assert.equal(gameplayAssets.length,7);assert.equal(new Set(gameplayAssetIds).size,7);assert.ok(Object.isFrozen(gameplayAssets)&&gameplayAssets.every(Object.isFrozen));assert.ok(Object.isFrozen(gameplayAssetSet)&&Object.isFrozen(gameplayAssetSet.roles)&&Object.isFrozen(gameplayAssetSet.constraints));assert.equal(gameplayAssetSet.constraints.guardCanonicalAsset,"guard/shield-v1");assert.equal(gameplayAssetSet.constraints.guardInstancesPerBeat,2);assert.equal(gameplayAssetForRole("guard").id,"guard/shield-v1");assert.throws(()=>gameplayAssetForRole("unknown"),/Unknown gameplay asset role/);assert.throws(()=>resolveGameplayAssetUrl("unknown"),/Unknown gameplay asset identity/);
for(const asset of gameplayAssets)assert.equal(resolveGameplayAssetUrl(asset.id,"https://packages.example/@aerobeat/web-renderer/src/gameplay-assets.js"),`https://packages.example/@aerobeat/web-renderer/assets/gameplay/0.0.4/${asset.path}`);

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
 const bytes=await readFile(path.join(root,"assets/gameplay/0.0.4",asset.path)),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString("utf8"));assert.ok(gltf.meshes.every((mesh)=>mesh.primitives.every((primitive)=>!primitive.attributes.NORMAL)),`${asset.id} expected pinned POSITION-only source`);
 if(asset.role==="directional-arrow"){
  assert.equal(gltf.materials.length,3);for(const material of gltf.materials){assert.equal(material.alphaMode,"OPAQUE");assert.equal(material.doubleSided,false);assert.equal(material.pbrMetallicRoughness.baseColorFactor[3],1);assert.deepEqual(material.extras.aerobeat,{blend:"opaque",cull:"back",depthTest:true,depthWrite:true,runtimeTintable:material.name==="mat/tint_base"});}
  assert.deepEqual(gltf.materials.map(({name})=>name),["mat/white","mat/charcoal","mat/tint_base"]);assert.deepEqual(gltf.meshes[0].primitives.map(({indices})=>[gltf.accessors[indices].min[0],gltf.accessors[indices].max[0]]),[[0,27],[28,55],[56,69]],"arrow material surfaces must use disjoint vertex ranges rather than overlapping caps");assert.equal(gltf.materials.find(({name})=>name==="mat/white").extras.aerobeat.runtimeTintable,false);
 }
 if(asset.role==="track"){
  const glass=gltf.materials.find(({name})=>name==="mat/blue_glass");assert(glass);assert.equal(glass.alphaMode,"BLEND");assert.equal(glass.doubleSided,false);assert.equal(glass.pbrMetallicRoughness.baseColorFactor[3],.52);assert.deepEqual(glass.extras.aerobeat,{blend:"alpha",cull:"back",depthTest:true,depthWrite:false,order:"after-grid-before-wall"});
 }
}
const parser=await readFile(path.join(root,"node_modules/playcanvas/build/playcanvas/src/framework/parsers/glb-parser.js"),"utf8");assert.match(parser,/if \(!sourceDesc\.hasOwnProperty\(SEMANTIC_NORMAL\)\) \{\s*generateNormals\(sourceDesc, indices\);/u,"pinned PlayCanvas must synthesize omitted GLB normals");
console.log("Pinned gameplay contract, URLs, hashes, lifecycle states, stale rejection, independence, disposal, context reload, and PlayCanvas normal synthesis validation passed.");
