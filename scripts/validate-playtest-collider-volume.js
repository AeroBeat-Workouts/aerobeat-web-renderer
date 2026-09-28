// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel } from "../src/index.js";

const volume=(visible,scale=1,depthForward=1,depthBackward=1)=>({visible,scale,depthForward,depthBackward});
for(const presentation of ["flow","boxing_collider","boxing_lanes"]){
  const frame={presentation,nowMs:1000,targets:[],timingWindowBeforeMs:120,timingWindowAfterMs:240,colliderVolume:volume(false,1,2,3)};
  const hidden=buildGameplaySceneModel(frame);
  assert.equal(hidden.objects.some((object)=>object.kind==="collider_volume"),false);
  assert.equal(hidden.objects.some((object)=>object.kind==="timing"),false,"old timing colors are removed in collider mode");
  assert.equal(hidden.timingZone.startZ,4.32);
  assert.equal(hidden.timingZone.endZ,-1.44);
  const shown=buildGameplaySceneModel({...frame,colliderVolume:volume(true,1.5,2,3)});
  const box=shown.objects.filter((object)=>object.kind==="collider_volume");
  assert.equal(box.length,1);
  assert.equal(box[0].position.x,0);
  assert.equal(box[0].position.y,1);
  assert.ok(Math.abs(box[0].position.z-1.44)<1e-12);
  assert.ok(Math.abs(box[0].scale.z-5.76)<1e-12);
  assert.equal(box[0].scale.y,presentation==="flow"?4.5:4.41);
  assert.equal(box[0].alpha,.16);
  assert.equal(buildGameplaySceneModel({...frame,colliderVolume:volume(true,1,1,3)}).timingZone.endZ,-.72,"backward extension cannot affect forward face");
  assert.equal(buildGameplaySceneModel({...frame,colliderVolume:volume(true,1,2,1)}).timingZone.startZ,1.44,"forward extension cannot affect backward face");
}
for(const bad of [null,{},volume(true,0),volume(true,1,Infinity),{...volume(true),extra:1},{...volume(true),visible:1}])assert.throws(()=>buildGameplaySceneModel({presentation:"flow",nowMs:1000,targets:[],colliderVolume:bad}),/Collider volume is invalid/);
const miss=(id,hand)=>({id,kind:"flow",hand,family:"flow",cell:5,cells:[],lane:null,beatCenterMs:1000,judgement:"miss",missCommitMs:1181});
for(const nowMs of [1181,1281,1529]){
  const result=buildGameplaySceneModel({presentation:"flow",nowMs,targets:[miss("left","left"),miss("right","right")]});
  assert.deepEqual(result.objects.filter((object)=>object.kind==="feedback").map((object)=>object.position),[{x:-1.5,y:1.5,z:1.5},{x:1.5,y:1.5,z:1.5}]);
  assert.equal(result.objects.filter((object)=>object.kind==="feedback").length,2,"no duplicate moving label");
}
assert.equal(buildGameplaySceneModel({presentation:"flow",nowMs:1531,targets:[miss("left","left")]}).objects.some((object)=>object.kind==="feedback"),false);
console.log("Collider visibility, independent depth faces, XY scale, miss spots, and lifecycle passed.");
