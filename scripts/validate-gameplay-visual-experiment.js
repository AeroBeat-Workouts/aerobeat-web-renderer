// @ts-check
import assert from "node:assert/strict";
import { buildGameplaySceneModel, createAeroPlayCanvasRenderer, createGameplayVisualExperimentConfig, defaultGameplayVisualExperimentConfig, defaultRendererTuning, gameplayGuidanceBandModes, gameplayVisualExperimentConfigVersion, normalizeGameplayVisualExperimentConfig, normalizeRendererTuning, parseGameplayVisualExperimentConfig, rendererTuningFromVisualProfile, rendererVisualScaleBounds, rendererVisualScalesIdentity, serializeGameplayVisualExperimentConfig, defaultRendererVisualProfile } from "../src/index.js";

const presentations=/** @type {const} */(["flow","boxing_spatial_grid","boxing_lanes"]);
const config=(mode="off",camera=false)=>createGameplayVisualExperimentConfig(mode,camera,.55,.35,.04,120,3,2,180);
const target=(presentation,id,at,identity,overrides={})=>({id,kind:/** @type {const} */(presentation==="flow"?"flow":"punch"),hand:/** @type {const} */("left"),family:/** @type {const} */(presentation==="flow"?"flow":"straight"),cell:presentation==="boxing_lanes"?null:5,cells:[],lane:/** @type {const} */("left"),beatCenterMs:at,judgement:/** @type {const} */("pending"),appearanceColor:"#2468AC",...(identity===null?{}:{arrivalGroupIdentity:identity}),...overrides});
const frame=(presentation,targets,extra={})=>({presentation,nowMs:900,timingWindowBeforeMs:180,timingWindowAfterMs:180,targets,...extra});
const bands=(model)=>model.objects.filter((entry)=>entry.kind==="guidance_band");
// tenl: per-class scale factor bounds and deterministic tuning identity.
assert.deepEqual(rendererVisualScaleBounds,{min:.1,max:2});
{
  const scaled=normalizeRendererTuning({...defaultRendererTuning,hash:undefined,noteScaleFactor:1.5,obstacleScaleFactor:.8,bombScaleFactor:2,markerScaleFactor:1.25});
  assert.deepEqual({note:scaled.noteScaleFactor,obstacle:scaled.obstacleScaleFactor,bomb:scaled.bombScaleFactor,marker:scaled.markerScaleFactor},{note:1.5,obstacle:.8,bomb:2,marker:1.25},"per-class scale factors pass through the content hash");
  const clampedLow=normalizeRendererTuning({...defaultRendererTuning,hash:undefined,noteScaleFactor:.05,markerScaleFactor:-1});
  const clampedHigh=normalizeRendererTuning({...defaultRendererTuning,hash:undefined,obstacleScaleFactor:3.5,bombScaleFactor:2});
  assert.equal(clampedLow.noteScaleFactor,rendererVisualScaleBounds.min,"low percent clamps to .1");assert.equal(clampedLow.markerScaleFactor,rendererVisualScaleBounds.min,"negative marker clamps to .1");assert.equal(clampedHigh.obstacleScaleFactor,rendererVisualScaleBounds.max,"high percent clamps to 2");assert.equal(clampedHigh.bombScaleFactor,rendererVisualScaleBounds.max,"max boundary percent 200 accepted");
  assert.deepEqual({...normalizeRendererTuning({...defaultRendererTuning,hash:undefined}),hash:"visual-playcanvas-v3"},defaultRendererTuning,"default tuning round-trips through the v3 normalization exactly");
  assert.notEqual(scaled.hash,normalizeRendererTuning({...defaultRendererTuning,hash:undefined}).hash,"scale change changes the tuning hash identity");
  assert.equal(rendererVisualScalesIdentity({noteScalePercent:150,obstacleScalePercent:100,bombScalePercent:100,markerScalePercent:100}),rendererVisualScalesIdentity({noteScalePercent:150,obstacleScalePercent:100,bombScalePercent:100,markerScalePercent:100}),"scale identity is deterministic");
  assert.notEqual(rendererVisualScalesIdentity({noteScalePercent:150,obstacleScalePercent:100,bombScalePercent:100,markerScalePercent:100}),rendererVisualScalesIdentity({noteScalePercent:100,obstacleScalePercent:100,bombScalePercent:100,markerScalePercent:100}),"distinct scales have distinct identities");
  assert.deepEqual(renderedPerKindScale(100),renderedPerKindScale(undefined),"all 100% equals default tuning exactly");
  function renderedPerKindScale(note){const scales=note===undefined?undefined:{noteScalePercent:note,obstacleScalePercent:100,bombScalePercent:100,markerScalePercent:100};return note===undefined?defaultRendererTuning.noteScaleFactor:(rendererTuningFromVisualProfile(defaultRendererVisualProfile,scales)).noteScaleFactor;}
}

assert.equal(gameplayVisualExperimentConfigVersion,2);
assert.deepEqual(gameplayGuidanceBandModes,["off","song_beat_grid","target_arrivals"]);
assert.deepEqual(defaultGameplayVisualExperimentConfig,config());
const json=serializeGameplayVisualExperimentConfig(config("target_arrivals",true));assert.equal(json.endsWith("\n"),true);assert.deepEqual(parseGameplayVisualExperimentConfig(json),config("target_arrivals",true));
for(const mutation of [()=>({...JSON.parse(json),extra:true}),()=>({...JSON.parse(json),horizontalRangeWorldUnits:Infinity}),()=>({...JSON.parse(json),verticalRangeWorldUnits:.61}),()=>({...JSON.parse(json),guidanceBandMode:"ribbon"}),()=>({...JSON.parse(json),version:1,obsoleteCue:true})])assert.throws(()=>parseGameplayVisualExperimentConfig(JSON.stringify(mutation())),TypeError);
assert.throws(()=>parseGameplayVisualExperimentConfig('{"schema":"aerobeat/gameplay_visual_experiment","version":2}'),TypeError);
const numericBounds={horizontalRangeWorldUnits:[0,.9],verticalRangeWorldUnits:[0,.6],deadzoneNormalized:[0,.2],smoothingTimeConstantMs:[0,500],maximumHorizontalVelocityWorldUnitsPerSecond:[.1,10],maximumVerticalVelocityWorldUnitsPerSecond:[.1,8],recenterTimeConstantMs:[0,1000]};for(const [field,[min,max]] of Object.entries(numericBounds)){for(const value of[min,max])assert.equal(parseGameplayVisualExperimentConfig(JSON.stringify({...defaultGameplayVisualExperimentConfig,[field]:value}))[field],value,`${field} inclusive bound`);for(const value of[min-1e-6,max+1e-6])assert.throws(()=>parseGameplayVisualExperimentConfig(JSON.stringify({...defaultGameplayVisualExperimentConfig,[field]:value})),TypeError,`${field} outside bound`);}for(let index=0;index<7;index+=1){const values=[.55,.35,.04,120,3,2,180];values[index]=NaN;assert.throws(()=>createGameplayVisualExperimentConfig("off",false,...values),TypeError,"every numeric primitive rejects non-finite data");}const clone={...defaultGameplayVisualExperimentConfig};assert.throws(()=>normalizeGameplayVisualExperimentConfig(clone),/trusted constructor/);let inspected=false;const proxy=new Proxy(clone,{get(){inspected=true;throw new Error("inspected");},getPrototypeOf(){inspected=true;throw new Error("inspected");},ownKeys(){inspected=true;throw new Error("inspected");}});assert.throws(()=>normalizeGameplayVisualExperimentConfig(proxy),/trusted constructor/);assert.equal(inspected,false,"untrusted proxies reject by identity without inspection");assert.equal(Object.isFrozen(defaultGameplayVisualExperimentConfig),true);

const renderer=createAeroPlayCanvasRenderer();assert.throws(()=>renderer.setGameplayVisualExperimentConfig({...defaultGameplayVisualExperimentConfig}),TypeError);renderer.setGameplayVisualExperimentConfig(config("song_beat_grid",true));renderer.resetGameplayVisualExperimentConfig();assert.equal(renderer.gameplayVisualExperimentConfig,defaultGameplayVisualExperimentConfig);const serializedDescribe=JSON.stringify(renderer.describe());for(const rejected of ["arrivalGroup","guidanceBeatTimestamps","CameraOffset","cameraDeflection"])assert.equal(serializedDescribe.includes(rejected),false);const emptyFrame={presentation:/** @type {const} */("flow"),nowMs:0,targets:[]};for(const cameraDeflection of [{active:true,xDeflection:0,yDeflection:0,extra:1},{active:true,xDeflection:NaN,yDeflection:0},{active:true,xDeflection:1.01,yDeflection:0},{active:1,xDeflection:0,yDeflection:0}])assert.throws(()=>renderer.renderGameplayFrame({...emptyFrame,cameraDeflection}),/exact sanitized private record/);assert.deepEqual(renderer.renderGameplayFrame({...emptyFrame,cameraDeflection:{active:true,xDeflection:1,yDeflection:1}}).model,renderer.renderGameplayFrame(emptyFrame).model,"default-off/no-camera model parity must be exact");

for(const presentation of presentations){
  const lane=presentation==="boxing_lanes",members=[target(presentation,"chord-a",1200,"g1"),target(presentation,"chord-b",1200,"g1",{hand:"right",cell:lane?null:6,lane:"right",appearanceColor:"#A64224"}),target(presentation,"next",1450,"g2")];
  const off=buildGameplaySceneModel(frame(presentation,members),undefined,undefined,undefined,config("off"));assert.deepEqual(off.guidance,{mode:"off",visibleBandCount:0,culledBandCount:0});assert.equal(bands(off).length,0);
  // er3m: target_arrivals emits full-alpha bands at arrival anchors plus reduced-alpha continuation across the whole visible window; band center z equals timestampToWorldZ of the same frame nowMs.
  const arrivals=buildGameplaySceneModel(frame(presentation,members,{reducedMotion:false}),undefined,undefined,undefined,config("target_arrivals"));const reduced=buildGameplaySceneModel(frame(presentation,members,{reducedMotion:true}),undefined,undefined,undefined,config("target_arrivals"));
  assert.ok(bands(arrivals).length>=3,`${presentation} must emit arrival bands plus full-window continuation`);
  const arrivalBandAlphas=bands(arrivals).filter((entry)=>entry.alpha===.32).map((entry)=>entry.position.z);
  assert.deepEqual(arrivalBandAlphas,[(1450-900)*-.006,(1200-900)*-.006],`${presentation} full-alpha band centers equal shared timestampToWorldZ exactly`);
  const continuations=bands(arrivals).filter((entry)=>entry.alpha===.16);
  assert.ok(continuations.length>=2&&continuations.every((entry)=>entry.alpha===.16),"continuation alpha is exactly half arrival alpha");
  assert.ok(bands(arrivals).every((entry)=>entry.targetId===null&&entry.transparent&&entry.position.z<=0+1e-9&&entry.scale.x>0&&entry.scale.y===.018&&entry.scale.z===.055));
  assert.ok(bands(arrivals).every((entry)=>!entry.id.includes("g1")&&!entry.id.includes("g2")),"band objects do not expose group identity");
  assert.deepEqual(reduced.objects,arrivals.objects,"reduced motion does not change static bands");
  // er3m live: a per-frame guidanceBandMode input overrides the config without touching it.
  assert.equal(buildGameplaySceneModel(frame(presentation,members,{guidanceBandMode:"song_beat_grid",guidanceBeatTimestampsMs:[1200,1450]}),undefined,undefined,undefined,config("target_arrivals")).guidance.mode,"song_beat_grid","frame mode overrides experiment config");
  assert.equal(buildGameplaySceneModel(frame(presentation,members),undefined,undefined,undefined,config("target_arrivals")).guidance.mode,"target_arrivals","absent frame mode keeps config mode");
  const songTimestamps=[0,1080,1081,1200,1500,2500,3400];
  const song=buildGameplaySceneModel(frame(presentation,members,{guidanceBeatTimestampsMs:songTimestamps}),undefined,undefined,undefined,config("song_beat_grid"));
  const songAnchors=bands(song).filter((entry)=>entry.alpha===.32).map((entry)=>entry.position.z);
  assert.deepEqual(songAnchors,songTimestamps.filter((value)=>value>=900&&value<=900+8333.3334).reverse().map((value)=>(value-900)*-.006),`${presentation} song-grid full-alpha anchors keep exact shared mapping order`);
  assert.ok(bands(song).some((entry)=>entry.alpha===.16),"song grid continues with halved-alpha bands to the window edge");
  assert.equal(song.guidance.mode,"song_beat_grid");
}

const denseSong=buildGameplaySceneModel(frame("flow",[],{guidanceBeatTimestampsMs:Array.from({length:40},(_,index)=>1081+index*25)}),undefined,undefined,undefined,config("song_beat_grid"));assert.deepEqual(denseSong.guidance,{mode:"song_beat_grid",visibleBandCount:16,culledBandCount:25},"dense song grid keeps anchor cap 16; overflow anchors plus capped continuation count culled");assert.equal(bands(denseSong).length,16);assert.equal(bands(denseSong).filter((entry)=>entry.alpha===.32).length,16);
const denseTargets=Array.from({length:20},(_,index)=>target("flow",`t${index}`,1081+index*50,`g${index}`));const cappedTargets=buildGameplaySceneModel(frame("flow",denseTargets),undefined,undefined,undefined,config("target_arrivals"));assert.deepEqual(cappedTargets.guidance,{mode:"target_arrivals",visibleBandCount:20,culledBandCount:1},"all 20 arrival anchors retained at cap 24; one cadence step past the last anchor counts culled beyond the window");assert.equal(bands(cappedTargets).filter((entry)=>entry.alpha===.32).length,20);
const sparseTargets=[target("flow","only-early",950,"g-early"),target("flow","mid",6000,"g-mid")];const sparseArrivals=buildGameplaySceneModel(frame("flow",sparseTargets),undefined,undefined,undefined,config("target_arrivals"));assert.ok(bands(sparseArrivals).some((entry)=>entry.alpha===.16&&entry.position.z<=-.03),"sparse arrivals continue the track with halved-alpha bands to the window edge");
const resolved=[target("flow","resolved",1200,"g1",{judgement:"hit",feedbackProgress:0}),target("flow","pending",1200,"g1"),target("flow","next",1400,"g2")];assert.equal(bands(buildGameplaySceneModel(frame("flow",resolved),undefined,undefined,undefined,config("target_arrivals"))).filter((entry)=>entry.alpha===.32).length,2,"group remains until every member is terminal");assert.equal(bands(buildGameplaySceneModel(frame("flow",resolved.map((entry)=>entry.arrivalGroupIdentity==="g1"?{...entry,judgement:"hit",feedbackProgress:0}:entry)),undefined,undefined,undefined,config("target_arrivals"))).filter((entry)=>entry.alpha===.32).length,1,"terminal group disappears atomically");
const bomb={id:"bomb",kind:/** @type {const} */("bomb"),hand:/** @type {const} */("neutral"),family:/** @type {const} */("bomb"),cell:0,cells:[],lane:null,beatCenterMs:1200};assert.throws(()=>buildGameplaySceneModel(frame("flow",[{...bomb,arrivalGroupIdentity:"hostile"}]),undefined,undefined,undefined,config("target_arrivals")),/cannot carry arrival group/);assert.equal(bands(buildGameplaySceneModel(frame("flow",[bomb]),undefined,undefined,undefined,config("target_arrivals"))).filter((entry)=>entry.alpha===.32).length,0,"hazard-only frames emit continuation bands but no arrival anchors");
for(const invalid of [[1200,1200],[1300,1200],[NaN],Array.from({length:513},(_,i)=>i)])assert.throws(()=>buildGameplaySceneModel(frame("flow",[],{guidanceBeatTimestampsMs:invalid}),undefined,undefined,undefined,config("song_beat_grid")),TypeError);assert.throws(()=>buildGameplaySceneModel(frame("flow",[],{guidanceBeatTimestampsMs:[1200]}),undefined,undefined,undefined,config("off")),/require song beat-grid/);assert.throws(()=>buildGameplaySceneModel(frame("flow",[target("flow","a",1200,"same"),target("flow","b",1300,"same")]),undefined,undefined,undefined,config("target_arrivals")),/identity conflicts/);

const pending=target("flow","pending-motion",1000,null);for(const nowMs of [999,1000,1100,1180]){const icon=buildGameplaySceneModel({...frame("flow",[pending]),nowMs},undefined,undefined,undefined,config()).objects.find((entry)=>entry.kind==="icon");assert.equal(icon?.position.z,nowMs===1000?0:(1000-nowMs)*-.006,`pending note continues through/past goal at ${nowMs}`);}const miss=target("flow","miss-motion",1000,null,{judgement:"miss",missCommitMs:1181});const missModel=buildGameplaySceneModel({...frame("flow",[miss]),nowMs:1181},undefined,undefined,undefined,config()),missIcon=missModel.objects.find((entry)=>entry.kind==="icon"),missLabel=missModel.objects.find((entry)=>entry.kind==="feedback");assert.equal(missIcon?.position.z,1.086);assert.equal(missLabel?.position.z,1.086);assert.equal(missIcon?.appearanceColor,"#7c828c");
// tenl: per-class scale at 150% — note arrow x1.5, wall inset-corrected, bomb x1.5; other kinds unchanged.
{
  const base={...defaultRendererTuning,hash:undefined};
  const scaledNote=normalizeRendererTuning({...base,noteScaleFactor:1.5});
  const scaledObstacle=normalizeRendererTuning({...base,obstacleScaleFactor:1.5});
  const scaledBomb=normalizeRendererTuning({...base,bombScaleFactor:1.5});
  const targets=[target("flow","arrow",1300,null,{direction:"right"}),bombFixture(),wallFixture()];
  const scaleFrame={nowMs:850,timingWindowBeforeMs:180,timingWindowAfterMs:180,presentation:/** @type {const} */("flow"),targets};
  const defaultModel=buildGameplaySceneModel(scaleFrame,undefined,undefined,undefined,config());
  const noteOnly=buildGameplaySceneModel(scaleFrame,undefined,scaledNote,undefined,config());
  const obstacleOnly=buildGameplaySceneModel(scaleFrame,undefined,scaledObstacle,undefined,config());
  const bombOnly=buildGameplaySceneModel(scaleFrame,undefined,scaledBomb,undefined,config());
  const find=(model,prefix)=>model.objects.find((entry)=>entry.id===prefix);
  const wall=(model)=>find(model,"wall-x:wall");
  assert.ok(find(defaultModel,"arrow:0")&&find(defaultModel,"bomb:0")&&wall(defaultModel),"fixtures must produce note/bomb/wall icons in the visible window");
  assert.deepEqual(find(noteOnly,"arrow:0").scale.x,find(defaultModel,"arrow:0").scale.x*1.5,"note icon scale multiplies exactly by 1.5");
  assert.deepEqual(wall(obstacleOnly).scale.x,(1-.06*1.5)/.94,"exact 1x1 wall width at 150% obstacle scale via inset correction (small walls grow, footprint invariant)");
  assert.deepEqual(wall(obstacleOnly).scale.y,(1-.06*1.5)/.94,"exact 1x1 wall height at 150% obstacle scale via inset correction");
  assert.equal(wall(obstacleOnly).position.z,wall(defaultModel).position.z,"obstacle scale does not shift wall center z");
  assert.deepEqual(find(bombOnly,"bomb:0").scale.x,find(defaultModel,"bomb:0").scale.x*1.5,"bomb icon scale multiplies exactly by 1.5");
  assert.deepEqual(find(obstacleOnly,"arrow:0").scale.x,find(defaultModel,"arrow:0").scale.x,"obstacle scale leaves notes unchanged");
  assert.deepEqual(find(noteOnly,"bomb:0").scale.x,find(defaultModel,"bomb:0").scale.x,"note scale leaves bombs unchanged");
  assert.deepEqual(find(noteOnly,"wall-x:wall").scale.x,find(defaultModel,"wall-x:wall").scale.x,"note scale leaves walls unchanged");
  assert.deepEqual(buildGameplaySceneModel(frame("flow",[]),undefined,base,undefined,config()).objects.map(o=>o.id),buildGameplaySceneModel(frame("flow",[]),undefined,undefined,undefined,config()).objects.map(o=>o.id),"all-factors-1.0 identity equals previous behavior exactly");
}
function bombFixture(){return{id:"bomb",kind:"bomb",hand:"neutral",family:"bomb",cell:0,cells:[],lane:null,beatCenterMs:1500};}
function wallFixture(){return{id:"wall-x",kind:"obstacle",hand:"left",family:"weave",cell:null,cells:[0],gameplayGeometry:{schema:"aerobeat/obstacle_gameplay_geometry",version:1,coordinateSpace:"aerobeat_top_left_grid",x:0,y:0,width:1,height:1},lane:"left",beatCenterMs:1200,intervalStartMs:1200,intervalEndMs:1800,normalSpawnMs:100};}
assert.throws(()=>buildGameplaySceneModel({presentation:"flow_colliders",nowMs:0,targets:[]}),/frame is invalid/,"Flow Colliders must reuse exact renderer presentation flow rather than create a scoring branch");assert.deepEqual(buildGameplaySceneModel({presentation:"flow",nowMs:0,targets:[]}).renderOrder,["world_opaque","grid_timing_tiles","guidance_bands","targets","world_transparent_shadows_track_walls_feedback"]);
console.log("Gameplay visual experiment v2, strict exclusive repeated guidance bands, privacy, caps, cleanup, and continuous pending/miss motion checks passed.");
