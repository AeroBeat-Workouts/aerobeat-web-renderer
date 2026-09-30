// @ts-check
import assert from "node:assert/strict";
import * as pc from "playcanvas";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { createAeroPlayCanvasRenderer, magneticSaberOrientation, normalizeMagneticAttractionSettings } from "../src/index.js";

const identity=equipmentEulerDegreesToQuaternion({x:0,y:0,z:0});
const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,x,y)=>Object.freeze({role,mode:"flow",anchor:{x,y,z:0},scale:1,orientation:identity,geometryIdentity:saberCapsuleGeometry.identity,configIdentity});
const note=(id,hand,cell,direction,beatCenterMs=0)=>({id,kind:"flow",hand,family:"flow",cell,cells:[],lane:null,beatCenterMs,direction,requiresDirection:true,judgement:"pending"});
const settings=normalizeMagneticAttractionSettings({range:1,minStrength:.2,maxStrength:.8,backFaceBias:.5});
const frame=(targets)=>({presentation:"flow",nowMs:0,targets});
const left=pose("left_wrist",1.5,2),right=pose("right_wrist",1.5,2);
const approximate=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-5,`${label}: ${actual} != ${expected}`);

const atCenter=magneticSaberOrientation(left,frame([note("up","left",1,"up")]),settings);
assert(atCenter.z>0&&atCenter.z<Math.SQRT1_2,"within range smoothly rolls the saber toward the up beat");
approximate(atCenter.z,Math.sin(.75*Math.PI/4),"center strength drives a shortest-path slerp");
assert.deepEqual(left.orientation,identity,"the collision-bearing pose is never changed");
assert.deepEqual(magneticSaberOrientation(right,frame([note("up","left",1,"up")]),settings),identity,"opposite-hand beat cannot attract");
assert.deepEqual(magneticSaberOrientation(left,frame([note("any","left",1,null)]),settings),identity,"directionless beat cannot attract");
assert.deepEqual(magneticSaberOrientation(left,frame([{...note("resolved","left",1,"up"),judgement:"hit"}]),settings),identity,"resolved beat cannot attract");
const nearEdge=magneticSaberOrientation(pose("left_wrist",1.5,1.15),frame([note("edge","left",1,"up")]),settings);
assert(nearEdge.z>0&&nearEdge.z<atCenter.z,"pull strengthens as beat approaches");
assert.deepEqual(magneticSaberOrientation(left,frame([note("up","left",1,"up")]),{...settings,range:0}),identity,"range zero disables attraction");
const front=magneticSaberOrientation(pose("left_wrist",1.7,2),frame([note("front","left",1,"up",20)]),settings);
const back=magneticSaberOrientation(pose("left_wrist",1.3,2),frame([note("back","left",1,"up",20)]),settings);
assert(back.z>front.z,"beat behind the blade gets a weighted back-face preference");
assert.deepEqual(magneticSaberOrientation(left,frame([note("far","left",1,"up",1000)]),settings),identity,"out-of-range beat is ignored");
for(const invalid of [{range:-1,minStrength:.2,maxStrength:.8,backFaceBias:.5},{range:1,minStrength:.2,maxStrength:.8,backFaceBias:1.01},{...settings,extra:true}])assert.throws(()=>normalizeMagneticAttractionSettings(invalid));

// Isolate the actual renderer staging seam: it must turn only its root, preserving
// the original record handed separately to the gameplay collision evaluator.
const renderer=createAeroPlayCanvasRenderer();
const root=new pc.Entity("scene-root");root._enabledInHierarchy=true;renderer.app={root};
renderer.createEquipmentPoseRoot=(assetId)=>{const role=assetId.endsWith(":left_wrist")?"left_wrist":"right_wrist";let entity=renderer.equipmentPoseRoots.get(role);if(!entity){entity=new pc.Entity(`equipment-${role}-pose-root`);root.addChild(entity);renderer.equipmentPoseRoots.set(role,entity);}return entity;};
renderer.makeDetachedEntity=(name,type)=>{const entity=new pc.Entity(name);entity.type=type;return entity;};
renderer.updateEquipmentMaterial=()=>{};renderer.gameplayAssetLoader.describe=()=>({state:"fallback"});
renderer.stageGameplayEquipment([left],null,true,frame([note("up","left",1,"up")]),settings);
const visible=renderer.equipmentPoseRoots.get("left_wrist");
approximate(visible.getLocalRotation().z,atCenter.z,"staged visible root receives magnetic quaternion");
approximate(visible.getPosition().x,0,"staged root retains exact projected wrist X");
approximate(visible.getPosition().y,2,"staged root retains exact wrist Y");
assert.deepEqual(left.orientation,identity,"renderer staging cannot mutate shared collision input");
renderer.stageGameplayEquipment([left],null,true,frame([]),settings);
approximate(visible.getLocalRotation().z,0,"no target restores authoritative pose");
console.log("Same-hand proximity, back-face bias, smooth slerp, off state, and visual-only staged root passed.");
