// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel, createAeroPlayCanvasRenderer, defaultRendererTuning, defaultTestPresentationConfig } from "../src/index.js";

const CENTER_MS=1000;
const LATE_MS=180;
const COMMIT_MS=CENTER_MS+LATE_MS+1;
const SPEED=.006;
const APPEARANCE="#2468AC";
const MISS="#7c828c";
const presentations=/** @type {const} */(["flow","boxing_spatial_grid","boxing_lanes"]);
const approximate=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=1e-12,`${message}: ${actual} != ${expected}`);

assert.equal(defaultTestPresentationConfig.skyPreludeHeightWorldUnits,50);
assert.equal(defaultTestPresentationConfig.boxingLaneSeparationWorldUnits,1.8);
const renderer=createAeroPlayCanvasRenderer();
renderer.setTestPresentationConfig((await import("../src/test-presentation-config.js")).createTestPresentationConfig(2,.4,.4,"out_quad","in_quad",50,"prelude",10,1000,"in_out_sine",3));
renderer.resetTestPresentationConfig();
assert.equal(renderer.testPresentationConfig,defaultTestPresentationConfig,"renderer reset must restore the canonical singleton");

const targetFor=(presentation,id="same-id")=>presentation==="boxing_lanes"
  ? {id,kind:/** @type {const} */("punch"),hand:/** @type {const} */("left"),family:/** @type {const} */("straight"),cell:null,cells:[],lane:/** @type {const} */("left"),beatCenterMs:CENTER_MS,direction:/** @type {const} */("right"),appearanceColor:APPEARANCE,judgement:/** @type {const} */("pending")}
  : {id,kind:/** @type {const} */(presentation==="flow"?"flow":"punch"),hand:/** @type {const} */("left"),family:/** @type {const} */(presentation==="flow"?"flow":"straight"),cell:5,cells:[],lane:/** @type {const} */("left"),beatCenterMs:CENTER_MS,direction:/** @type {const} */("right"),appearanceColor:APPEARANCE,judgement:/** @type {const} */("pending")};
const frame=(presentation,nowMs,target)=>({presentation,nowMs,timingWindowBeforeMs:180,timingWindowAfterMs:LATE_MS,targets:[target]});
const parts=(model,id="same-id")=>({icon:model.objects.find(entry=>entry.targetId===id&&entry.kind==="icon"),shadow:model.objects.find(entry=>entry.targetId===id&&entry.kind==="shadow"),label:model.objects.find(entry=>entry.targetId===id&&entry.kind==="feedback")});

for(const presentation of presentations){
  const pending=targetFor(presentation);
  const before=parts(buildGameplaySceneModel(frame(presentation,CENTER_MS-1,pending)));
  approximate(before.icon?.position.z??NaN,-SPEED,`${presentation} center-1 remains on canonical approach`);
  for(const nowMs of[CENTER_MS,CENTER_MS+LATE_MS]){
    const sample=parts(buildGameplaySceneModel(frame(presentation,nowMs,pending)));
    assert.equal(sample.icon?.targetId,"same-id",`${presentation} preserves pending ID at ${nowMs}`);
    approximate(sample.icon?.position.z??NaN,(nowMs-CENTER_MS)*SPEED,`${presentation} pending target continues through the inclusive late window`);
    assert.equal(sample.icon?.appearanceColor,APPEARANCE,`${presentation} pending target retains authored appearance`);
    assert.equal(sample.icon?.tintMix,0,`${presentation} pending target uses authored appearance rather than white after crossing`);
    approximate(sample.shadow?.position.z??NaN,(nowMs-CENTER_MS)*SPEED,`${presentation} pending shadow tracks the moving target`);
  }
  const zSamples=[];
  for(const elapsedMs of[0,1,100,349]){
    const missed={...pending,judgement:/** @type {const} */("miss"),missCommitMs:COMMIT_MS};
    const sample=parts(buildGameplaySceneModel(frame(presentation,COMMIT_MS+elapsedMs,missed)));
    const expectedZ=(LATE_MS+1+elapsedMs)*SPEED;
    assert.equal(sample.icon?.targetId,"same-id",`${presentation} preserves same ID after miss commit`);
    assert.equal(sample.icon?.appearanceColor,MISS,`${presentation} committed miss is gray`);
    approximate(sample.icon?.position.z??NaN,expectedZ,`${presentation} miss icon speed at ${elapsedMs}`);
    approximate(sample.shadow?.position.z??NaN,expectedZ,`${presentation} miss shadow speed at ${elapsedMs}`);
    approximate(sample.label?.position.z??NaN,expectedZ,`${presentation} Miss label speed at ${elapsedMs}`);
    assert.ok((sample.label?.position.y??-Infinity)>(sample.icon?.position.y??Infinity),`${presentation} Miss label is above target`);
    assert.ok((sample.label?.position.y??Infinity)-(sample.icon?.position.y??-Infinity)<=1,`${presentation} Miss label clearance is bounded`);
    assert.equal(sample.label?.feedback?.animation,"shake");
    zSamples.push(sample.icon?.position.z??NaN);
  }
  assert.deepEqual(zSamples,[1.086,1.092,1.686,3.18],`${presentation} miss Z is exact and monotonic`);
  for(const elapsedMs of[350,351]){
    const expired={...pending,judgement:/** @type {const} */("miss"),missCommitMs:COMMIT_MS};
    const model=buildGameplaySceneModel(frame(presentation,COMMIT_MS+elapsedMs,expired));
    assert.equal(model.objects.some(entry=>entry.targetId==="same-id"),false,`${presentation} miss disappears once at commit+${elapsedMs}`);
  }
  const hitAt=(elapsedMs)=>parts(buildGameplaySceneModel(frame(presentation,CENTER_MS+elapsedMs,{...pending,judgement:/** @type {const} */("hit"),feedbackProgress:elapsedMs/350})));
  assert.equal(hitAt(0).icon?.position.z,0,`${presentation} hit stays at crossing`);
  assert.equal(hitAt(79).icon?.position.z,0,`${presentation} hit removal stays at crossing`);
  assert.equal(hitAt(80).icon,undefined,`${presentation} hit still disappears at 80ms`);
}
assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,{...targetFor("flow"),judgement:"miss"})),/exact committed timestamp/);assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,{...targetFor("flow"),judgement:"miss",missCommitMs:COMMIT_MS,feedbackProgress:0})),/no feedback progress/);assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,{...targetFor("flow"),missCommitMs:COMMIT_MS})),/forbidden on non-miss/);
let hostileGetterCalls=0;const missBase={...targetFor("flow"),judgement:/** @type {const} */("miss")},ownAccessor={...missBase};Object.defineProperty(ownAccessor,"missCommitMs",{enumerable:true,get(){hostileGetterCalls+=1;return COMMIT_MS;}});const inheritedData=Object.assign(Object.create({missCommitMs:COMMIT_MS}),missBase),hostilePrototype={};Object.defineProperty(hostilePrototype,"missCommitMs",{enumerable:true,get(){hostileGetterCalls+=1;return COMMIT_MS;}});const inheritedAccessor=Object.assign(Object.create(hostilePrototype),missBase),nonEnumerable={...missBase};Object.defineProperty(nonEnumerable,"missCommitMs",{enumerable:false,value:COMMIT_MS});for(const hostile of[ownAccessor,inheritedData,inheritedAccessor,nonEnumerable,{...missBase,missCommitMs:NaN},{...missBase,missCommitMs:COMMIT_MS+1}])assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,hostile)),/exact committed timestamp/);const nonMissAccessor={...targetFor("flow")};Object.defineProperty(nonMissAccessor,"missCommitMs",{enumerable:true,get(){hostileGetterCalls+=1;return COMMIT_MS;}});const nonMissInherited=Object.assign(Object.create(hostilePrototype),targetFor("flow"));for(const hostile of[nonMissAccessor,nonMissInherited])assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,hostile)),/forbidden on non-miss/);assert.equal(hostileGetterCalls,0,"miss committed-time admission never invokes own or inherited accessors");
let progressGetterCalls=0;const descriptorAttacks=(base,key,value)=>{const ownUndefined={...base,[key]:undefined},ownAccessor={...base};Object.defineProperty(ownAccessor,key,{enumerable:true,get(){progressGetterCalls+=1;return value;}});const inheritedData=Object.assign(Object.create({[key]:value}),base),prototype={};Object.defineProperty(prototype,key,{enumerable:true,get(){progressGetterCalls+=1;return value;}});const inheritedAccessor=Object.assign(Object.create(prototype),base),nonEnumerable={...base};Object.defineProperty(nonEnumerable,key,{enumerable:false,value});return[ownUndefined,ownAccessor,inheritedData,inheritedAccessor,nonEnumerable];};for(const hostile of descriptorAttacks({...missBase,missCommitMs:COMMIT_MS},"feedbackProgress",undefined))assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,hostile)),/no feedback progress/);const hitBase={...targetFor("flow"),judgement:/** @type {const} */("hit")};for(const hostile of[...descriptorAttacks(hitBase,"feedbackProgress",.5),{...hitBase,feedbackProgress:NaN},{...hitBase,feedbackProgress:-.001},{...hitBase,feedbackProgress:1.001}])assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,hostile)),/feedback progress is required/);for(const hostile of descriptorAttacks(targetFor("flow"),"feedbackProgress",undefined))assert.throws(()=>buildGameplaySceneModel(frame("flow",COMMIT_MS,hostile)),/forbidden on non-hit/);assert.equal(progressGetterCalls,0,"feedback progress admission never invokes own or inherited accessors in miss, hit, or pending states");

const noncanonicalTuning={...defaultRendererTuning,worldUnitsPerMs:.012};
const canonicalMiss=parts(buildGameplaySceneModel(frame("flow",COMMIT_MS+100,{...targetFor("flow"),judgement:/** @type {const} */("miss"),missCommitMs:COMMIT_MS}),undefined,noncanonicalTuning));
approximate(canonicalMiss.icon?.position.z??NaN,1.686,"committed miss speed must remain canonical even when prototype approach tuning differs");

const laneTarget=targetFor("boxing_lanes","lane-target");
const laneGuard={id:"lane-guard",kind:/** @type {const} */("guard"),hand:/** @type {const} */("both"),family:/** @type {const} */("guard"),cell:null,cells:[],lane:null,beatCenterMs:CENTER_MS,judgement:/** @type {const} */("miss"),missCommitMs:COMMIT_MS};
const laneWall={id:"lane-wall",kind:/** @type {const} */("obstacle"),hand:/** @type {const} */("neutral"),family:/** @type {const} */("squat"),cell:null,cells:[0],gameplayGeometry:{schema:/** @type {const} */("aerobeat/obstacle_gameplay_geometry"),version:/** @type {const} */(1),coordinateSpace:/** @type {const} */("aerobeat_top_left_grid"),x:0,y:0,width:1,height:1},lane:null,beatCenterMs:1500,intervalStartMs:1500,intervalEndMs:1600};
const laneModel=buildGameplaySceneModel({presentation:"boxing_lanes",nowMs:COMMIT_MS,timingWindowBeforeMs:180,timingWindowAfterMs:180,targets:[laneTarget,laneGuard,laneWall]});
const centers=entry=>[...new Set(laneModel.objects.filter(entry).map(object=>object.position.x))].sort((a,b)=>a-b);
assert.deepEqual(centers(object=>object.kind==="timing"),[-.9,.9]);
assert.deepEqual(centers(object=>object.targetId==="lane-guard"&&object.kind==="icon"),[-.9,.9]);
assert.deepEqual(centers(object=>object.targetId==="lane-wall"&&object.kind==="obstacle"),[-.9,.9]);
assert.deepEqual(centers(object=>object.targetId==="lane-wall"&&object.kind==="shadow"),[-.9,.9]);
const guard=parts(laneModel,"lane-guard"),guardIcons=laneModel.objects.filter(entry=>entry.targetId==="lane-guard"&&entry.kind==="icon");
assert.ok(guardIcons.length===2&&guard.label.position.y>Math.max(...guardIcons.map(entry=>entry.position.y)),"dual-guard Miss label is above both targets");
assert.equal(guard.label.position.z,guardIcons[0].position.z,"dual-guard Miss label shares moving Z");

console.log("Third-feedback defaults, boundary motion, authored color, lane geometry, and label anchoring validation passed.");
