// @ts-check
import assert from "node:assert/strict";
import {buildGameplaySceneModel} from "../src/index.js";

const targets=[
  {id:"straight",kind:"punch",family:"straight",hand:"left",cell:0,cells:[],lane:"left",beatCenterMs:1000},
  {id:"hook",kind:"punch",family:"hook",hand:"right",cell:7,cells:[],lane:"right",beatCenterMs:1000},
  {id:"uppercut",kind:"punch",family:"uppercut",hand:"left",cell:8,cells:[],lane:"left",beatCenterMs:1000},
  {id:"guard",kind:"guard",family:"guard",hand:"both",cell:null,cells:[4,7],lane:null,beatCenterMs:1000},
  {id:"knee",kind:"knee",family:"knee_left",hand:"left",cell:9,cells:[],lane:"left",beatCenterMs:1000}
];
const frame=(presentation,targets,nowMs=950)=>({presentation,targets,nowMs,kneeEnabled:presentation!=="flow",rowReach:{topRowReachWU:.4,bottomRowReachWU:.6},visibleColliderRadius:true});
const icons=(model,id)=>model.objects.filter(o=>o.targetId===id&&o.kind==="icon");
for(const target of targets){
  const initial=buildGameplaySceneModel(frame("boxing_collider",[target]));
  const moved=buildGameplaySceneModel(frame("boxing_collider",[{...target,heightWorldY:1.37}]));
  const first=icons(initial,target.id),second=icons(moved,target.id);
  assert.equal(first.length,target.kind==="guard"?2:1,target.id);
  assert.deepEqual(second.map(o=>o.position.x),first.map(o=>o.position.x),`${target.id}: authored X stays`);
  assert.deepEqual(second.map(o=>o.position.y),second.map(()=>1.37),`${target.id}: both shields when guard`);
  assert.deepEqual(second.map(o=>o.position.z),first.map(o=>o.position.z),`${target.id}: timing stays`);
  assert.deepEqual(second.map(o=>[o.assetId,o.role,o.guardPairIndex]),first.map(o=>[o.assetId,o.role,o.guardPairIndex]),`${target.id}: shape and pair parity`);
  assert.equal(moved.objects.find(o=>o.targetId===target.id&&o.kind==="collider_square")?.position.y,1.37,`${target.id}: Show square shares target Y`);
  const flowLike=target.kind==="punch"?{...target,kind:"flow",family:"flow"}:target;
  const legacyPresentation=target.kind==="knee"?"boxing_spatial_grid":"flow";
  const legacy=buildGameplaySceneModel(frame(legacyPresentation,[flowLike]));
  const ignored=buildGameplaySceneModel(frame(legacyPresentation,[{...flowLike,heightWorldY:1.37}]));
  assert.deepEqual(icons(ignored,target.id).map(o=>o.position),icons(legacy,target.id).map(o=>o.position),`${target.id}: other presentations unaffected`);
  for(const bad of [null,undefined,NaN,Infinity,-Infinity,"1",{},true])assert.throws(()=>buildGameplaySceneModel(frame("boxing_collider",[{...target,heightWorldY:bad}])),/heightWorldY/,`${target.id}: reject present malformed height`);
}
const guard=targets[3];
for(const height of [.3,1.7]){
  const model=buildGameplaySceneModel(frame("boxing_collider",[{...guard,heightWorldY:height,judgement:"hit",tier:"great",feedbackProgress:0}],1000));
  assert.equal(model.objects.find(o=>o.id==="guard:feedback:0")?.position.y,height,"guard feedback follows same-ID change");
}
// The default config is sufficient for additive bounce: changing the base must not reset its trajectory.
const moving={...targets[0],bounceStartMs:500,normalSpawnMs:500,skyPreludeStartMs:400};
const a=buildGameplaySceneModel(frame("boxing_collider",[moving],700));
const b=buildGameplaySceneModel(frame("boxing_collider",[{...moving,heightWorldY:1.37}],700));
const legacyBase=buildGameplaySceneModel(frame("boxing_collider",[targets[0]],700));
assert.ok(Math.abs(icons(a,"straight")[0].position.y-icons(legacyBase,"straight")[0].position.y)>0.01,"bounce is active");
assert.ok(Math.abs((icons(b,"straight")[0].position.y-icons(a,"straight")[0].position.y)-(1.37-icons(legacyBase,"straight")[0].position.y))<1e-12,"height is additive to active bounce");
console.log("Boxing target height: five families, same-ID live Y, guard pair, overlays, feedback, Flow and malformed inputs passed.");
