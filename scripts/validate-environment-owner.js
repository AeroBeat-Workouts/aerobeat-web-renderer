// @ts-check

import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import * as pc from "playcanvas";
import {PlayCanvasEnvironmentAssetOwner,normalizeEnvironmentDescriptor,normalizeEnvironmentTransform,resolveSameOriginEnvironmentUrl} from "../src/environment-asset-owner.js";

const jpeg=new Uint8Array(await readFile(resolve(process.cwd(),"../aerobeat-environment-community/.testbed/assets/images/luminious-ice-cave-photosphere/luminious-ice-cave-photosphere.jpg")));
const descriptor={id:"fixture-one",url:"/assets/environment/fixture-one.jpg",mimeType:"image/jpeg",bytes:2210289,sha256:"ff142b3ce3d3509ab3cfafcfc6a8cc2d3b0ff737852072d3a7aea8075478eed5",projection:"equirectangular",dimensions:[4096,2048],centerForward:[0,0,-1],worldUp:[0,1,0]};
const descriptorTwo={...descriptor,id:"fixture-two",url:"/assets/environment/fixture-two.jpg"};
const transform={position:{x:1.23456749,y:-2,z:3},rotationDegrees:{xPitch:10.12345649,yYaw:-20,zRoll:30},scale:1.5};
const canonical=normalizeEnvironmentDescriptor(descriptor);
assert.ok(Object.isFrozen(canonical)&&Object.isFrozen(canonical.dimensions)&&Object.isFrozen(canonical.centerForward)&&Object.isFrozen(canonical.worldUp));
assert.notEqual(canonical,descriptor);assert.deepEqual(canonical.dimensions,[4096,2048]);assert.equal("orientation" in canonical,false);
assert.equal(resolveSameOriginEnvironmentUrl(descriptor.url,"https://game.test/play").href,"https://game.test/assets/environment/fixture-one.jpg");
for(const url of["https://other.test/ice.jpg","data:image/jpeg;base64,AA==","https://game.test/ice.jpg#fragment","https://user:pass@game.test/ice.jpg"])assert.throws(()=>resolveSameOriginEnvironmentUrl(url,"https://game.test/play"),/same-origin packaged/);
for(const invalid of[
 {...descriptor,extra:true},
 {...descriptor,id:"Upper"},
 {...descriptor,id:"-leading"},
 {...descriptor,id:"x".repeat(97)},
 {...descriptor,url:""},
 {...descriptor,mimeType:"image/png"},
 {...descriptor,bytes:0},
 {...descriptor,bytes:16777217},
 {...descriptor,bytes:1.5},
 {...descriptor,sha256:"A".repeat(64)},
 {...descriptor,projection:"cubemap"},
 {...descriptor,dimensions:[2048,1024]},
 {...descriptor,orientation:{yaw:0,pitch:0,roll:0}},
 {...descriptor,centerForward:[0,0,1]},
 {...descriptor,worldUp:[0,-1,0]}
])assert.throws(()=>normalizeEnvironmentDescriptor(invalid),/Environment/);
const accessorDescriptor={...descriptor};Object.defineProperty(accessorDescriptor,"id",{get:()=>"fixture-one",enumerable:true});assert.throws(()=>normalizeEnvironmentDescriptor(accessorDescriptor),/shape/);
const symbolDescriptor={...descriptor,[Symbol("hidden")]:true};assert.throws(()=>normalizeEnvironmentDescriptor(symbolDescriptor),/shape/);
const proxiedDescriptor=new Proxy(descriptor,{});assert.throws(()=>normalizeEnvironmentDescriptor(proxiedDescriptor),/proxies/);
const tupleProxyDescriptors=[{...descriptor,dimensions:new Proxy(descriptor.dimensions,{})},{...descriptor,centerForward:new Proxy(descriptor.centerForward,{})},{...descriptor,worldUp:new Proxy(descriptor.worldUp,{})}];
for(const hostile of tupleProxyDescriptors)assert.throws(()=>normalizeEnvironmentDescriptor(hostile),/proxies/);
let tupleGetterCalls=0;const accessorDimensions=[4096,2048];Object.defineProperty(accessorDimensions,"0",{get(){++tupleGetterCalls;return 4096;},enumerable:true,configurable:true});
const accessorTupleDescriptor={...descriptor,dimensions:accessorDimensions};assert.throws(()=>normalizeEnvironmentDescriptor(accessorTupleDescriptor),/dimensions/);assert.equal(tupleGetterCalls,0,"tuple accessors must reject without invocation");
const cloneProperty=Object.getOwnPropertyDescriptor(globalThis,"structuredClone");assert.ok(cloneProperty);try{Object.defineProperty(globalThis,"structuredClone",{...cloneProperty,value:undefined});assert.throws(()=>normalizeEnvironmentDescriptor(descriptor),/validation is unavailable/);}finally{Object.defineProperty(globalThis,"structuredClone",cloneProperty);}

const canonicalTransform=normalizeEnvironmentTransform(transform);
assert.deepEqual(canonicalTransform,{position:{x:1.234567,y:-2,z:3},rotationDegrees:{xPitch:10.123456,yYaw:-20,zRoll:30},scale:1.5});
assert.ok(Object.isFrozen(canonicalTransform)&&Object.isFrozen(canonicalTransform.position)&&Object.isFrozen(canonicalTransform.rotationDegrees));
assert.equal(normalizeEnvironmentTransform({position:{x:-0,y:0,z:0},rotationDegrees:{xPitch:-0,yYaw:0,zRoll:0},scale:.25}).position.x,0);
for(const invalid of[
 {...transform,extra:true},
 {...transform,position:{...transform.position,extra:0}},
 {...transform,rotationDegrees:{...transform.rotationDegrees,extra:0}},
 {...transform,scale:"1"},
 {...transform,scale:.249999},
 {...transform,scale:4.000001},
 {...transform,position:{x:30.000001,y:0,z:0}},
 {...transform,rotationDegrees:{xPitch:180.000001,yYaw:0,zRoll:0}},
 {...transform,position:{x:7.01,y:0,z:0},scale:.25},
 {...transform,position:{x:Number.NaN,y:0,z:0}},
 {...transform,rotationDegrees:{xPitch:0,yYaw:Number.POSITIVE_INFINITY,zRoll:0}}
])assert.throws(()=>normalizeEnvironmentTransform(invalid),/Environment/);
const accessorTransform={...transform};Object.defineProperty(accessorTransform,"scale",{get:()=>1,enumerable:true});assert.throws(()=>normalizeEnvironmentTransform(accessorTransform),/shape/);
const proxiedTransform=new Proxy(transform,{}),proxiedPositionTransform={...transform,position:new Proxy(transform.position,{})},proxiedRotationTransform={...transform,rotationDegrees:new Proxy(transform.rotationDegrees,{})};
assert.throws(()=>normalizeEnvironmentTransform(proxiedTransform),/proxies/);
assert.throws(()=>normalizeEnvironmentTransform(proxiedPositionTransform),/proxies/);
assert.throws(()=>normalizeEnvironmentTransform(proxiedRotationTransform),/proxies/);

function harness(options={}){
 const roots=[],created=[],closed=[];
 const app={graphicsDevice:{},assets:{list(){return[];}},root:{addChild(root){root.parent=true;roots.push(root);}}};
 const fetch=options.fetch??(async()=>new Response(jpeg,{status:200,headers:{"content-type":"image/jpeg"}}));
 const decodeImage=options.decodeImage??(async()=>({width:4096,height:2048,close(){closed.push(this);}}));
 const createSphere=options.createSphere??((_app,image)=>{const root=fakeRoot(),material=fakeResource(),texture=fakeResource(),mesh=fakeResource();created.push({root,material,texture,mesh,image});return{root,material,texture,mesh,triangleCount:1024};});
 const owner=new PlayCanvasEnvironmentAssetOwner({fetch,decodeImage,createSphere,locationHref:"https://game.test/play"});
 return{owner,app,roots,created,closed};
}
function fakeRoot(){return{name:"aero-environment-photosphere",enabled:true,parent:false,destroyed:false,position:[0,0,0],rotation:[0,0,0],scale:[1,1,1],setPosition(...value){this.position=value;},setEulerAngles(...value){this.rotation=value;},setLocalScale(...value){this.scale=value;},destroy(){this.destroyed=true;}};}
function fakeResource(){return{destroyed:false,destroy(){this.destroyed=true;}};}

{
 const {owner,app,roots,created,closed}=harness();owner.setTransform(transform);owner.setCameraPosition({x:10,y:20,z:30});await owner.setDescriptor(descriptor);const loading=owner.attach(app);assert.equal(owner.describe().state,"loading");assert.equal(owner.describe().fallback,true);await loading;const status=owner.describe();assert.deepEqual(status,{id:"fixture-one",state:"ready",visible:true,fallback:false,hash:descriptor.sha256,count:1,projection:"equirectangular"});assert.equal(roots.length,1);const resources=created[0];assert.deepEqual(resources.root.position,[11.234567,18,33]);assert.deepEqual(resources.root.rotation,[10.123456,-20,30]);assert.deepEqual(resources.root.scale,[1.5,1.5,1.5]);
 owner.setCameraPosition({x:-5,y:4,z:3});assert.deepEqual(resources.root.position,[-3.765433,2,6],"camera translation must anchor the environment plus configured world offset");assert.deepEqual(resources.root.rotation,[10.123456,-20,30],"camera look rotation must not be inherited");
 const ownerSnapshot=()=>({descriptor:owner.descriptor,transform:owner.transform,record:owner.record,controller:owner.controller,generation:owner.generation,state:owner.state,visible:owner.visible,errorMessage:owner.errorMessage,description:owner.describe(),roots:[...roots],created:[...created],closed:[...closed],root:{reference:resources.root,destroyed:resources.root.destroyed,enabled:resources.root.enabled,parent:resources.root.parent,position:[...resources.root.position],rotation:[...resources.root.rotation],scale:[...resources.root.scale]},material:{reference:resources.material,destroyed:resources.material.destroyed},texture:{reference:resources.texture,destroyed:resources.texture.destroyed},mesh:{reference:resources.mesh,destroyed:resources.mesh.destroyed},image:resources.image});
 const unchanged=ownerSnapshot(),assertOwnerUnchanged=()=>assert.deepEqual(ownerSnapshot(),unchanged,"hostile environment input must not mutate descriptor, transform, owner, root, or resources");
 assert.throws(()=>owner.setTransform({...transform,scale:9}),/Environment/);assertOwnerUnchanged();
 for(const [hostile,pattern] of [[proxiedTransform,/proxies/],[proxiedPositionTransform,/proxies/],[proxiedRotationTransform,/proxies/],[accessorTransform,/shape/]]){assert.throws(()=>owner.setTransform(hostile),pattern);assertOwnerUnchanged();}
 for(const [hostile,pattern] of [[proxiedDescriptor,/proxies/],...tupleProxyDescriptors.map((value)=>[value,/proxies/]),[accessorDescriptor,/shape/],[accessorTupleDescriptor,/dimensions/]]){assert.throws(()=>owner.setDescriptor(hostile),pattern);assertOwnerUnchanged();}
 assert.equal(tupleGetterCalls,0,"owner tuple validation must not invoke accessors");
 owner.setVisible(false);assert.equal(resources.root.enabled,false);owner.setVisible(true);assert.equal(resources.root.enabled,true);assert.equal(created.length,1,"visibility changes must not decode or recreate");
 const replacement=owner.setDescriptor(descriptorTwo);assert.equal(resources.root.destroyed,true,"replacement must synchronously destroy the old root");assert.equal(owner.describe().count,0);await replacement;assert.equal(owner.describe().id,"fixture-two");assert.equal(owner.describe().count,1);assert.deepEqual(created[1].root.scale,[1.5,1.5,1.5],"retained transform must apply to replacement");
 const generation=owner.generation;owner.handleContextLost();assert.equal(created[1].root.destroyed,true);assert.equal(owner.describe().state,"idle");await owner.restore(app);assert.equal(owner.describe().state,"ready");assert.equal(created.length,3,"context restoration must start a fresh generation");assert.deepEqual(created[2].root.position,[-3.765433,2,6]);assert.ok(owner.generation>generation);owner.dispose();assert.equal(owner.describe().state,"disposed");assert.equal(owner.describe().count,0);assert.equal(closed.length,3);
}
{
 const wrongLength=harness({fetch:async()=>new Response(new Uint8Array([1]),{status:200,headers:{"content-type":"image/jpeg"}})});await wrongLength.owner.setDescriptor(descriptor);await wrongLength.owner.attach(wrongLength.app);assert.equal(wrongLength.owner.describe().state,"error");assert.equal(wrongLength.created.length,0);
 const wrongType=harness({fetch:async()=>new Response(jpeg,{status:200,headers:{"content-type":"image/png"}})});await wrongType.owner.setDescriptor(descriptor);await wrongType.owner.attach(wrongType.app);assert.equal(wrongType.owner.describe().state,"error");assert.match(wrongType.owner.errorMessage,/MIME/);
 const redirected=harness({fetch:async()=>{const response=new Response(jpeg,{status:200,headers:{"content-type":"image/jpeg"}});Object.defineProperty(response,"redirected",{value:true});return response;}});await redirected.owner.setDescriptor(descriptor);await redirected.owner.attach(redirected.app);assert.equal(redirected.owner.describe().state,"error");assert.match(redirected.owner.errorMessage,/redirect/);
 const responseDrift=harness({fetch:async()=>{const response=new Response(jpeg,{status:200,headers:{"content-type":"image/jpeg"}});Object.defineProperty(response,"url",{value:"https://game.test/assets/environment/other.jpg"});return response;}});await responseDrift.owner.setDescriptor(descriptor);await responseDrift.owner.attach(responseDrift.app);assert.equal(responseDrift.owner.describe().state,"error");assert.match(responseDrift.owner.errorMessage,/URL drift/);
 const wrongDimensions=harness({decodeImage:async()=>({width:2048,height:1024,close(){}})});await wrongDimensions.owner.setDescriptor(descriptor);await wrongDimensions.owner.attach(wrongDimensions.app);assert.equal(wrongDimensions.owner.describe().state,"error");assert.match(wrongDimensions.owner.errorMessage,/dimensions/);
}
{
 const decodes=[],decodeReady=[];const stale=harness({decodeImage:(_blob,signal)=>new Promise((resolve,reject)=>{decodes.push(()=>signal.aborted?reject(new DOMException("aborted","AbortError")):resolve({width:4096,height:2048,close(){}}));decodeReady.splice(0).forEach((done)=>done());})});await stale.owner.setDescriptor(descriptor);const pending=stale.owner.attach(stale.app);if(decodes.length===0)await new Promise((done)=>decodeReady.push(done));assert.equal(stale.owner.describe().state,"loading");const replacementPending=stale.owner.setDescriptor(descriptorTwo);stale.owner.setDescriptor(null);for(const decode of decodes)decode();await Promise.all([pending,replacementPending]);assert.equal(stale.owner.describe().id,null);assert.equal(stale.roots.length,0,"stale decode completion must never attach a photosphere");
}
{
 const first=harness(),second=harness();await first.owner.setDescriptor(descriptor);await second.owner.setDescriptor(descriptor);await Promise.all([first.owner.attach(first.app),second.owner.attach(second.app)]);assert.notEqual(first.created[0].root,second.created[0].root);assert.notEqual(first.created[0].texture,second.created[0].texture);first.owner.dispose();assert.equal(second.owner.describe().state,"ready","instances must remain independent");second.owner.dispose();
}
assert.equal(pc.LAYERID_SKYBOX,2);assert.throws(()=>new PlayCanvasEnvironmentAssetOwner().setVisible(1),/boolean/);
console.log("Generic photosphere descriptor/transform bounds, anchoring, atomic rejection, one-resident replacement, same-origin/hash/type/dimension gates, stale generations, context restore, disposal, and multi-instance validation passed.");
