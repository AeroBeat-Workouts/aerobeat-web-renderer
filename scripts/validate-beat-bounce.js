import assert from "node:assert/strict";
import { beatBounceOffsetY, defaultBeatBounceConfig, normalizeBeatBounceConfig, serializeBeatBounceConfig } from "../src/beat-bounce-config.js";
import { buildGameplaySceneModel, defaultRendererThemeTokens, defaultRendererTuning, gameplayWorldGrid } from "../src/gameplay-scene-model.js";

assert(Object.isFrozen(defaultBeatBounceConfig));
assert.equal(serializeBeatBounceConfig(defaultBeatBounceConfig),'{\n  "schema": "aerobeat/beat_bounce_config",\n  "version": 1,\n  "leadBeats": 4,\n  "heightWorldUnits": 0.9,\n  "apexFraction": 0.4,\n  "riseEasing": "out_quad",\n  "fallEasing": "in_quad"\n}\n');
const S=14000,H=16000,A=14800;
assert.equal(beatBounceOffsetY(S,S,H),0);
assert.equal(beatBounceOffsetY(A,S,H),0.9);
assert(Math.abs(beatBounceOffsetY(15500,S,H)-0.59375)<=1e-12);
assert.equal(beatBounceOffsetY(H,S,H),0);
for(const invalid of [null,[],Object.create(null),new Date(),{...defaultBeatBounceConfig,extra:1},{...defaultBeatBounceConfig,leadBeats:"4"},{...defaultBeatBounceConfig,leadBeats:0},{...defaultBeatBounceConfig,heightWorldUnits:2},{...defaultBeatBounceConfig,apexFraction:NaN},{...defaultBeatBounceConfig,riseEasing:"bounce"},{...defaultBeatBounceConfig,__proto__:null}])assert.throws(()=>normalizeBeatBounceConfig(invalid));
const accessor={...defaultBeatBounceConfig};Object.defineProperty(accessor,"leadBeats",{enumerable:true,get(){return 4;}});assert.throws(()=>normalizeBeatBounceConfig(accessor));
assert.throws(()=>normalizeBeatBounceConfig(new Proxy({...defaultBeatBounceConfig},{})));
const hidden={...defaultBeatBounceConfig};Object.defineProperty(hidden,"hidden",{value:1});assert.throws(()=>normalizeBeatBounceConfig(hidden));
const symbol={...defaultBeatBounceConfig,[Symbol("x")]:1};assert.throws(()=>normalizeBeatBounceConfig(symbol));
const canonical=normalizeBeatBounceConfig({...defaultBeatBounceConfig,leadBeats:4.123456789,heightWorldUnits:-0});assert.equal(canonical.leadBeats,4.123457);assert.equal(Object.is(canonical.heightWorldUnits,-0),false);

const base={id:"target",hand:"left",family:"flow",cell:1,cells:[],lane:null,beatCenterMs:H,bounceStartMs:S,judgement:"pending"};
const samples=[S,A,15500,H];
for(const kind of ["flow","punch","guard"]){for(const nowMs of samples){const target={...base,kind,...(kind==="guard"?{hand:"both",family:"guard",cell:null,cells:[5,6]}:{})};const model=buildGameplaySceneModel({presentation:kind==="flow"?"flow":"boxing_spatial_grid",nowMs,targets:[target]},defaultRendererThemeTokens,defaultRendererTuning,defaultBeatBounceConfig);const icons=model.objects.filter(object=>object.kind==="icon"&&object.targetId==="target"),shadows=model.objects.filter(object=>object.kind==="shadow"&&object.targetId==="target");assert.equal(icons.length,kind==="guard"?2:1);const expected=(kind==="flow"?2:kind==="guard"?1:2)+beatBounceOffsetY(nowMs,S,H);for(const icon of icons)assert(Math.abs(icon.position.y-expected)<=1e-9);for(const shadow of shadows)assert.equal(shadow.position.y,gameplayWorldGrid.floorY+0.018);if(kind==="guard")assert.equal(icons[0].position.y,icons[1].position.y);}}
for(const kind of ["bomb","obstacle"]){const target=kind==="bomb"?{...base,kind:"bomb",family:"bomb",hand:"neutral"}:{...base,kind:"obstacle",family:"obstacle",hand:"neutral",cell:null,cells:[0],gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:0,y:0,width:1,height:1},intervalStartMs:S,intervalEndMs:H};const withBounce=buildGameplaySceneModel({presentation:"flow",nowMs:A,targets:[target]});const withoutBounce=buildGameplaySceneModel({presentation:"flow",nowMs:A,targets:[{...target,bounceStartMs:undefined}]});assert.deepEqual(withBounce,withoutBounce);}
for(const hz of [30,60,90,120,144]){const t=S+Math.round((H-S)*hz/173);assert.equal(beatBounceOffsetY(t,S,H),beatBounceOffsetY(t,S,H));}
console.log("Beat bounce config and trajectories validated.");
