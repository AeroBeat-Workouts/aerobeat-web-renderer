// @ts-check
//
// Magnetic saber rotation is COLLISION-AUTHORITATIVE.
//
// The blend itself lives in @aerobeat/web-gameplay (`magneticSaberOrientation`),
// because that is the code the hit test evaluates. The renderer must NOT carry a
// second implementation: it draws the orientation gameplay published as
// `frame.assistedSaberOrientations`. This test asserts both halves:
//   1. the blend's behavioral guarantees, against the authoritative implementation
//   2. the renderer staging seam consumes the authoritative pose and does not
//      re-derive or mutate the collision input
import assert from "node:assert/strict";
import * as pc from "playcanvas";
import { createEquipmentConfigIdentity, equipmentEulerDegreesToQuaternion, saberCapsuleGeometry } from "@aerobeat/web-contracts/equipment-pose-contracts";
import { magneticSaberOrientation, normalizeMagneticAttractionSettings } from "@aerobeat/web-gameplay/equipment-pose-collision.js";
import { createAeroPlayCanvasRenderer } from "../src/index.js";

const identity=equipmentEulerDegreesToQuaternion({x:0,y:0,z:0});
const configIdentity=createEquipmentConfigIdentity({schema:"aerobeat/equipment_config_identity",version:1,algorithm:"sha256",value:"1".repeat(64)});
const pose=(role,x,y)=>Object.freeze({role,mode:"flow",anchor:Object.freeze({x,y,z:0}),scale:1,orientation:identity,geometryIdentity:saberCapsuleGeometry.identity,configIdentity});
// Gameplay target shape: judge-space position plus the authored direction.
const target=(id,hand,x,y,z,judgement)=>Object.freeze({id,hand,direction:"up",x,y,z,judgement});
const settings=normalizeMagneticAttractionSettings({range:1,minStrength:.2,maxStrength:.8,backFaceBias:.5});
const left=pose("left_wrist",1.5,2),right=pose("right_wrist",1.5,2);

const atCenter=magneticSaberOrientation(left,0,[target("up","left",1,2,0,undefined)],settings);
assert(atCenter.z>0&&atCenter.z<Math.SQRT1_2,"within range smoothly rolls the saber toward the up beat");
assert.deepEqual(left.orientation,identity,"the collision-bearing pose is never mutated");
assert.deepEqual(magneticSaberOrientation(right,0,[target("up","left",1,2,0,undefined)],settings),identity,"opposite-hand beat cannot attract");
assert.deepEqual(magneticSaberOrientation(left,0,[target("resolved","left",1,2,0,"hit")],settings),identity,"resolved beat cannot attract");
const nearEdge=magneticSaberOrientation(pose("left_wrist",1.5,1.15),0,[target("edge","left",1,2,0,undefined)],settings);
assert(nearEdge.z>0&&nearEdge.z<atCenter.z,"pull strengthens as the beat approaches");
assert.deepEqual(magneticSaberOrientation(left,0,[target("up","left",1,2,0,undefined)],{...settings,range:0}),settings&&identity,"range zero disables attraction");
const front=magneticSaberOrientation(pose("left_wrist",1.7,2),0,[target("front","left",1,2,0,undefined)],settings);
const back=magneticSaberOrientation(pose("left_wrist",1.3,2),0,[target("back","left",1,2,0,undefined)],settings);
assert(back.z>front.z,"a beat behind the blade gets a weighted back-face preference");
assert.deepEqual(magneticSaberOrientation(left,0,[target("far","left",1,2,40,undefined)],settings),identity,"out-of-range beat is ignored");
for(const invalid of [{range:-1,minStrength:.2,maxStrength:.8,backFaceBias:.5},{range:1,minStrength:.2,maxStrength:.8,backFaceBias:1.01},{...settings,extra:true}])assert.throws(()=>normalizeMagneticAttractionSettings(invalid));

// Isolate the renderer staging seam: it must draw the pose gameplay published,
// preserving the exact wrist position and never mutating the shared input.
const renderer=createAeroPlayCanvasRenderer();
const root=new pc.Entity("scene-root");root._enabledInHierarchy=true;renderer.app={root};
renderer.createEquipmentPoseRoot=(assetId)=>{const role=assetId.endsWith(":left_wrist")?"left_wrist":"right_wrist";let entity=renderer.equipmentPoseRoots.get(role);if(!entity){entity=new pc.Entity(`equipment-${role}-pose-root`);root.addChild(entity);renderer.equipmentPoseRoots.set(role,entity);}return entity;};
renderer.makeDetachedEntity=(name,type)=>{const entity=new pc.Entity(name);entity.type=type;return entity;};
renderer.updateEquipmentMaterial=()=>{};renderer.gameplayAssetLoader.describe=()=>({state:"fallback"});

const frame=(assistedSaberOrientations)=>({presentation:"flow",nowMs:0,targets:[],assistedSaberOrientations});
renderer.stageGameplayEquipment([left],null,true,frame({left_wrist:atCenter,right_wrist:null}),settings);
const visible=renderer.equipmentPoseRoots.get("left_wrist");
const staged=visible.getLocalRotation();
assert(Math.abs(staged.z-atCenter.z)<1e-5&&Math.abs(staged.w-atCenter.w)<1e-5,"staged root draws the authoritative assisted quaternion");
assert(Math.abs(visible.getPosition().x-0)<1e-5,"staged root retains exact projected wrist X");
assert(Math.abs(visible.getPosition().y-2)<1e-5,"staged root retains exact wrist Y");
assert.deepEqual(left.orientation,identity,"renderer staging cannot mutate the shared collision input");

// No published pose (assist off, or no tracked pose yet) => raw orientation.
renderer.stageGameplayEquipment([left],null,true,frame({left_wrist:null,right_wrist:null}),settings);
assert(Math.abs(visible.getLocalRotation().z-identity.z)<1e-5,"absent authoritative pose restores the raw orientation");
console.log("Authoritative blend guarantees + renderer consumes published pose (no duplicate math) passed.");