// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/gameplay-scene-model.js";
import { createAeroPlayCanvasRenderer } from "../src/renderer-facade.js";

const settings=(wristBombColliderScale,visibleWristObstacleRadius=false)=>({colliderVisible:false,colliderScale:1,colliderDepthForward:1,colliderDepthBackward:1,visibleWristObstacleRadius,wristBombColliderScale});
const anchors={left:{x:-.7,y:2,z:.4},right:{x:1.2,y:.6,z:-.3}};
const frame={presentation:"flow",nowMs:1000,targets:[],equipmentColliderAnchors:anchors,colliderSettings:settings(1.5)};
const bombs=(model)=>model.objects.filter((object)=>object.kind==="wrist_bomb_collider");
assert.equal(bombs(buildGameplaySceneModel(frame)).length,0,"wrist collider defaults hidden");
for(const scale of [0,.5,1,2]){
  const model=buildGameplaySceneModel({...frame,colliderSettings:settings(scale),visibleWristObstacleRadius:true});
  const markers=bombs(model);
  assert.equal(markers.length,scale===0?0:2);
  for(const hand of ["left","right"])if(scale>0){
    const marker=markers.find((object)=>object.id===`wrist-bomb-collider-${hand}`);
    assert.deepEqual(marker.position,anchors[hand]);
    assert.deepEqual(marker.scale,{x:.24*scale,y:.24*scale,z:.24*scale});
    assert.equal(marker.appearanceColor,"#39c96b");
    assert.ok(marker.alpha>0&&marker.alpha<1);
  }
  assert.equal(model.objects.some((object)=>object.kind==="collider_volume"),false,"wrist visualization is independent of equipment volumes");
  assert.deepEqual(bombs(buildGameplaySceneModel({...frame,colliderSettings:settings(scale,true)})).map((object)=>object.id),markers.map((object)=>object.id),"assembly's nested visibility produces the same wrist scene");
  assert.equal(bombs(buildGameplaySceneModel({...frame,colliderSettings:settings(scale,true),visibleWristObstacleRadius:false})).length,0,"explicit top-level visibility overrides nested setting");
}
const fallback=bombs(buildGameplaySceneModel({...frame,equipmentColliderAnchors:{left:anchors.left,right:null},visibleWristObstacleRadius:true}));
assert.deepEqual(fallback.find((object)=>object.role==="right").position,{x:1.5,y:1.5,z:0});
const renderer=createAeroPlayCanvasRenderer();
const material={diffuse:{set(...rgb){this.rgb=rgb;}},emissive:{set(...rgb){this.rgb=rgb;}},update(){}};
const entity={findComponents(){return [{meshInstances:[{material}],layers:[]}]},setPosition(){},setLocalScale(){},setEulerAngles(){}};
renderer.applyColliderOverlayAppearance(fallback[0],entity);
assert.deepEqual(material.diffuse.rgb,[57/255,201/255,107/255]);
assert.equal(material.opacity,.3);
assert.equal(material.depthTest,true);
assert.equal(material.depthWrite,false);
const created=[];
renderer.app={root:{children:[],addChild(entity){this.children.push(entity);}}};
renderer.makeDetachedEntity=(name,type)=>{const entity={name,type,destroyed:false,destroy(){this.destroyed=true;}};created.push(entity);return entity;};
const sphere=renderer.acquireColliderOverlayEntity(fallback[0],0);
assert.equal(sphere.type,"sphere","wrist collider draws a PlayCanvas sphere primitive");
assert.equal(renderer.acquireColliderOverlayEntity(fallback[0],0),sphere,"sphere entity is pooled");
const box=renderer.acquireColliderOverlayEntity({kind:"collider_volume"},0);
assert.equal(box.type,"box","existing equipment volume retains its box primitive");
assert.notEqual(box,sphere,"wrist and volume geometry cannot share a pooled entity");
renderer.destroyColliderOverlayPools();
assert.equal(sphere.destroyed,true,"sphere is disposed with collider overlay pools");
assert.equal(box.destroyed,true);
for(const bad of [-.1,2.1,NaN,Infinity])assert.throws(()=>buildGameplaySceneModel({...frame,colliderSettings:settings(bad),visibleWristObstacleRadius:true}),/collider_settings_invalid/);
assert.throws(()=>buildGameplaySceneModel({...frame,visibleWristObstacleRadius:1}),/Wrist bomb collider visibility is invalid/);
console.log("Wrist bomb collider positions, independent visibility, bounded scale and green translucent material passed.");
